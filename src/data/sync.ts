// Synchronisation lokal ⇄ Supabase: Outbox hochladen, Änderungen abrufen, der neuere Stand gewinnt.
// Reihenfolge: erst abrufen (Konflikte auflösen), dann die verbleibende Outbox hochladen.

import { COLLECTIONS, outboxId, READONLY, type Collection, type SyncRecord } from './collections'
import type { IndexedDbRepository } from './indexedDb'
import type { RemoteStore } from './remote'

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error'

export interface SyncStatus {
  state: SyncState
  pending: number
  lastSync?: string
  error?: string
}

/** Lokale Felder, die nie synchronisiert werden (gerätespezifisch). */
const LOCAL_ONLY: Partial<Record<Collection, string[]>> = { settings: ['simulatedDate'] }

const CURSOR = 'cursor'
const stampKey = (c: Collection, key: string) => `stamp/${c}/${key}`
const MIGRATED = 'migratedFor'
/** Zeitstempel für Daten ohne bekannte Änderungszeit: ältere Cloud-Daten gewinnen dagegen nicht, neuere schon. */
const UNKNOWN_STAMP = '2000-01-01T00:00:00.000Z'

function stripLocal(c: Collection, value: unknown): unknown {
  const fields = LOCAL_ONLY[c]
  if (!fields || value === null || typeof value !== 'object') return value
  const copy = { ...(value as Record<string, unknown>) }
  for (const f of fields) delete copy[f]
  return copy
}

function keepLocal(c: Collection, incoming: unknown, current: unknown): unknown {
  const fields = LOCAL_ONLY[c]
  if (!fields || incoming === null || typeof incoming !== 'object' || !current || typeof current !== 'object') return incoming
  const merged = { ...(incoming as Record<string, unknown>) }
  for (const f of fields) if (f in (current as Record<string, unknown>)) merged[f] = (current as Record<string, unknown>)[f]
  return merged
}

export class SyncEngine {
  private status: SyncStatus = { state: 'idle', pending: 0 }
  private listeners = new Set<(s: SyncStatus) => void>()
  private changeListeners = new Set<() => void>()
  private running: Promise<void> | null = null
  private again = false

  private local: IndexedDbRepository
  private remote: RemoteStore
  private now: () => Date

  constructor(local: IndexedDbRepository, remote: RemoteStore, now: () => Date = () => new Date()) {
    this.local = local
    this.remote = remote
    this.now = now
  }

  getStatus(): SyncStatus {
    return this.status
  }
  onStatus(fn: (s: SyncStatus) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  /** Wird aufgerufen, wenn Daten aus der Cloud lokal übernommen wurden. */
  onRemoteChange(fn: () => void): () => void {
    this.changeListeners.add(fn)
    return () => this.changeListeners.delete(fn)
  }
  private setStatus(s: Partial<SyncStatus>) {
    this.status = { ...this.status, ...s }
    for (const l of this.listeners) l(this.status)
  }

  /** Lokale Änderung vormerken (value = null für Löschung). */
  async record(c: Collection, key: string, value: unknown): Promise<void> {
    if (READONLY.has(c)) return
    const clientUpdatedAt = this.now().toISOString()
    await this.local.putOutbox({ id: outboxId(c, key), collection: c, key, value: value === null ? null : stripLocal(c, value), clientUpdatedAt })
    await this.local.putMeta(stampKey(c, key), clientUpdatedAt)
    this.setStatus({ pending: (await this.local.outbox()).length })
  }

  /**
   * Erst-Umzug: alle lokalen Daten einmalig pro Konto in die Outbox legen. Daten ohne
   * Zeitstempel bekommen einen alten Stempel, damit neuere Cloud-Daten gewinnen.
   */
  async migrateLocal(userId: string): Promise<number> {
    if ((await this.local.getMeta<string>(MIGRATED)) === userId) return 0
    let n = 0
    for (const c of COLLECTIONS) {
      if (READONLY.has(c)) continue
      for (const [key, value] of await this.local.entries(c)) {
        const stamp = (await this.local.getMeta<string>(stampKey(c, key))) ?? UNKNOWN_STAMP
        await this.local.putOutbox({ id: outboxId(c, key), collection: c, key, value: stripLocal(c, value), clientUpdatedAt: stamp })
        n++
      }
    }
    await this.local.putMeta(MIGRATED, userId)
    // Anderes Konto oder erster Login: vollständig neu abrufen
    await this.local.putMeta(CURSOR, null)
    this.setStatus({ pending: (await this.local.outbox()).length })
    return n
  }

  /** Beim nächsten Abruf alles neu holen (z. B. nach dem Zurücksetzen). */
  async resetCursor(): Promise<void> {
    await this.local.putMeta(CURSOR, null)
    await this.local.clearStamps()
  }

  /** Synchronisieren (mehrfache Aufrufe werden zusammengefasst). */
  sync(): Promise<void> {
    if (this.running) {
      this.again = true
      return this.running
    }
    this.running = (async () => {
      do {
        this.again = false
        await this.runOnce()
      } while (this.again)
    })().finally(() => {
      this.running = null
    })
    return this.running
  }

  private async runOnce(): Promise<void> {
    this.setStatus({ state: 'syncing' })
    try {
      // 1. Abrufen und Konflikte auflösen
      const cursor = (await this.local.getMeta<string | null>(CURSOR)) ?? null
      const rows = await this.remote.pull(cursor)
      const outbox = new Map((await this.local.outbox()).map((o) => [o.id, o]))
      let changed = false
      let maxCursor = cursor
      for (const r of rows) {
        if (!maxCursor || r.serverUpdatedAt > maxCursor) maxCursor = r.serverUpdatedAt
        // Eigene, bereits bekannte Änderung (z. B. gerade hochgeladen) → nichts zu tun
        if ((await this.local.getMeta<string>(stampKey(r.collection, r.key))) === r.clientUpdatedAt) continue
        const id = outboxId(r.collection, r.key)
        const pending = outbox.get(id)
        if (pending && pending.clientUpdatedAt >= r.clientUpdatedAt) continue // lokal neuer → wird hochgeladen
        if (pending) {
          await this.local.deleteOutbox(id) // Cloud neuer → lokale Änderung verwerfen
          outbox.delete(id)
        }
        const current = await this.local.getRecord(r.collection, r.key)
        await this.local.applyRecord(r.collection, r.key, r.value === null ? null : keepLocal(r.collection, r.value, current))
        await this.local.putMeta(stampKey(r.collection, r.key), r.clientUpdatedAt)
        changed = true
      }
      // 2. Verbleibende Outbox hochladen
      const toPush: SyncRecord[] = [...outbox.values()].map(({ collection, key, value, clientUpdatedAt }) => ({ collection, key, value, clientUpdatedAt }))
      if (toPush.length) {
        await this.remote.push(toPush)
        for (const id of outbox.keys()) await this.local.deleteOutbox(id)
      }
      await this.local.putMeta(CURSOR, maxCursor)
      this.setStatus({ state: 'idle', pending: (await this.local.outbox()).length, lastSync: this.now().toISOString(), error: undefined })
      if (changed) for (const l of this.changeListeners) l()
    } catch (e) {
      const pending = (await this.local.outbox()).length
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false
      const msg = e instanceof Error ? e.message : String(e)
      this.setStatus({ state: offline || /offline|fetch|network/i.test(msg) ? 'offline' : 'error', pending, error: msg })
    }
  }
}
