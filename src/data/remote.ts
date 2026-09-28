// Entfernter Speicher (Supabase). Das Interface erlaubt Tests mit einem In-Memory-Remote.

import type { SupabaseClient } from '@supabase/supabase-js'
import { COLLECTIONS, KEY_COLUMN, READONLY, type Collection, type RemoteRow, type SyncRecord } from './collections'

export interface RemoteStore {
  /** Datensätze hochladen (Upsert, Löschung als Tombstone). */
  push(records: SyncRecord[]): Promise<void>
  /** Alle Änderungen mit Serverzeit nach `since` (null = alles). */
  pull(since: string | null): Promise<RemoteRow[]>
}

interface DbRow {
  data: { value: unknown; clientUpdatedAt: string } | null
  deleted: boolean
  updated_at: string
  [key: string]: unknown
}

export class SupabaseRemote implements RemoteStore {
  private client: SupabaseClient
  constructor(client: SupabaseClient) {
    this.client = client
  }

  async push(records: SyncRecord[]): Promise<void> {
    const byCollection = new Map<Collection, SyncRecord[]>()
    for (const r of records) {
      if (READONLY.has(r.collection)) continue // schreiben nur die Edge Functions
      byCollection.set(r.collection, [...(byCollection.get(r.collection) ?? []), r])
    }
    for (const [c, rs] of byCollection) {
      const keyCol = KEY_COLUMN[c]
      const rows = rs.map((r) => ({
        [keyCol]: r.key,
        data: r.value === null ? null : { value: r.value, clientUpdatedAt: r.clientUpdatedAt },
        deleted: r.value === null,
      }))
      const { error } = await this.client.from(c).upsert(rows, { onConflict: `user_id,${keyCol}` })
      if (error) throw new Error(`Hochladen (${c}) fehlgeschlagen: ${error.message}`)
    }
  }

  async pull(since: string | null): Promise<RemoteRow[]> {
    const out: RemoteRow[] = []
    for (const c of COLLECTIONS) {
      const keyCol = KEY_COLUMN[c]
      let q = this.client.from(c).select(`${keyCol}, data, deleted, updated_at`).order('updated_at', { ascending: true })
      if (since) q = q.gt('updated_at', since)
      const { data, error } = await q
      if (error) throw new Error(`Abruf (${c}) fehlgeschlagen: ${error.message}`)
      for (const row of (data ?? []) as unknown as DbRow[]) {
        if (READONLY.has(c)) {
          // Von den Edge Functions geschrieben: data ist direkt der Wert
          out.push({ collection: c, key: String(row[keyCol]), value: row.deleted ? null : row.data, clientUpdatedAt: row.updated_at, serverUpdatedAt: row.updated_at })
          continue
        }
        out.push({
          collection: c,
          key: String(row[keyCol]),
          value: row.deleted || !row.data ? null : row.data.value,
          clientUpdatedAt: row.data?.clientUpdatedAt ?? row.updated_at,
          serverUpdatedAt: row.updated_at,
        })
      }
    }
    return out
  }
}

/** In-Memory-Remote für Tests (simuliert Serverzeit und Offline). */
export class MemoryRemote implements RemoteStore {
  rows = new Map<string, RemoteRow>()
  offline = false
  private tick = 0

  private serverTime(): string {
    this.tick += 1
    return new Date(Date.UTC(2026, 9, 1) + this.tick * 1000).toISOString()
  }

  async push(records: SyncRecord[]): Promise<void> {
    if (this.offline) throw new Error('offline')
    for (const r of records) this.rows.set(`${r.collection}/${r.key}`, { ...r, serverUpdatedAt: this.serverTime() })
  }

  async pull(since: string | null): Promise<RemoteRow[]> {
    if (this.offline) throw new Error('offline')
    return [...this.rows.values()].filter((r) => !since || r.serverUpdatedAt > since).sort((a, b) => (a.serverUpdatedAt < b.serverUpdatedAt ? -1 : 1))
  }

  /** Änderung von einem anderen Gerät simulieren. */
  external(r: SyncRecord): void {
    this.rows.set(`${r.collection}/${r.key}`, { ...r, serverUpdatedAt: this.serverTime() })
  }
}
