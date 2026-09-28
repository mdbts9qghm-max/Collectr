// Lokale Speicherung in IndexedDB (bis Phase 4). Offline lesbar.

import { openDB, type IDBPDatabase } from 'idb'
import { LOCAL, type Collection, type SyncRecord } from './collections'
import type { ManualReadiness, SessionLog, ShiftOverride, StrengthState, StrengthTest } from '../core/types'
import { defaultSettings } from './defaults'
import type { WhoopCycle, WhoopRecovery, WhoopSleep, WhoopWorkout } from '../core/whoop'
import type { AdjustmentDecision, AppSettings, BackupData, Repository, WhoopLocal, WhoopStatusData, WorkoutAssignment } from './types'

const DB_NAME = 'collectr'
const DB_VERSION = 3
const STORES = ['kv', 'overrides', 'logs', 'manual', 'tests', 'decisions', 'assignments', 'whoop_cycles', 'whoop_recoveries', 'whoop_sleeps', 'whoop_workouts'] as const
/** Sync-Verwaltung (Phase 4): ausstehende Änderungen und Metadaten (Cursor, Zeitstempel). */
const SYNC_STORES = ['outbox', 'meta'] as const

export class IndexedDbRepository implements Repository {
  private dbp: Promise<IDBPDatabase>

  constructor(name = DB_NAME) {
    this.dbp = openDB(name, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('kv')
          db.createObjectStore('overrides', { keyPath: 'date' })
          db.createObjectStore('logs', { keyPath: 'sessionId' })
          db.createObjectStore('manual', { keyPath: 'date' })
          db.createObjectStore('tests', { keyPath: 'date' })
          db.createObjectStore('decisions', { keyPath: 'sessionId' })
        }
        if (oldVersion < 2) {
          db.createObjectStore('outbox', { keyPath: 'id' })
          db.createObjectStore('meta')
        }
        if (oldVersion < 3) {
          db.createObjectStore('assignments', { keyPath: 'workoutId' })
          for (const s of ['whoop_cycles', 'whoop_recoveries', 'whoop_sleeps', 'whoop_workouts']) db.createObjectStore(s, { keyPath: 'key' })
        }
      },
    })
  }

  private async kvGet<T>(key: string): Promise<T | undefined> {
    return (await this.dbp).get('kv', key) as Promise<T | undefined>
  }
  private async kvPut(key: string, value: unknown): Promise<void> {
    await (await this.dbp).put('kv', value, key)
  }
  private async all<T>(store: string): Promise<T[]> {
    return (await this.dbp).getAll(store) as Promise<T[]>
  }
  private async put(store: string, value: unknown): Promise<void> {
    await (await this.dbp).put(store, value)
  }

  async getSettings(): Promise<AppSettings> {
    const s = await this.kvGet<AppSettings>('settings')
    return s ? { ...defaultSettings(), ...s } : defaultSettings()
  }
  saveSettings(s: AppSettings) {
    return this.kvPut('settings', s)
  }
  listOverrides() {
    return this.all<ShiftOverride>('overrides')
  }
  putOverride(o: ShiftOverride) {
    return this.put('overrides', o)
  }
  async deleteOverride(date: string) {
    await (await this.dbp).delete('overrides', date)
  }
  listLogs() {
    return this.all<SessionLog>('logs')
  }
  putLog(l: SessionLog) {
    return this.put('logs', l)
  }
  async deleteLog(sessionId: string) {
    await (await this.dbp).delete('logs', sessionId)
  }
  listManual() {
    return this.all<ManualReadiness>('manual')
  }
  putManual(m: ManualReadiness) {
    return this.put('manual', m)
  }
  listStrengthTests() {
    return this.all<StrengthTest>('tests')
  }
  putStrengthTest(t: StrengthTest) {
    return this.put('tests', t)
  }
  async getStrengthState() {
    return (await this.kvGet<StrengthState>('strengthState')) ?? null
  }
  saveStrengthState(s: StrengthState) {
    return this.kvPut('strengthState', s)
  }
  async getChecklist() {
    return (await this.kvGet<Record<string, boolean>>('checklist')) ?? {}
  }
  saveChecklist(c: Record<string, boolean>) {
    return this.kvPut('checklist', c)
  }
  listDecisions() {
    return this.all<AdjustmentDecision>('decisions')
  }
  putDecision(d: AdjustmentDecision) {
    return this.put('decisions', d)
  }

  // --- Rohzugriff für die Synchronisation -------------------------------------------------

  /** Alle Datensätze einer Sammlung als [Schlüssel, Wert]. */
  async entries(c: Collection): Promise<[string, unknown][]> {
    const loc = LOCAL[c]
    const db = await this.dbp
    if (loc.kvKey) {
      const v = await db.get('kv', loc.kvKey)
      return v === undefined ? [] : [[loc.kvKey, v]]
    }
    const all = (await db.getAll(loc.store)) as Record<string, unknown>[]
    return all.map((v) => [String(v[loc.keyPath!]), v])
  }

  async getRecord(c: Collection, key: string): Promise<unknown> {
    const loc = LOCAL[c]
    return (await this.dbp).get(loc.store, loc.kvKey ?? key)
  }

  /** Datensatz schreiben (value) oder löschen (null). */
  async applyRecord(c: Collection, key: string, value: unknown): Promise<void> {
    const loc = LOCAL[c]
    const db = await this.dbp
    if (value === null || value === undefined) await db.delete(loc.store, loc.kvKey ?? key)
    else if (loc.kvKey) await db.put('kv', value, loc.kvKey)
    else if (loc.keyPath === 'key') await db.put(loc.store, { key, value })
    else await db.put(loc.store, value)
  }

  async outbox(): Promise<(SyncRecord & { id: string })[]> {
    return (await this.dbp).getAll('outbox') as Promise<(SyncRecord & { id: string })[]>
  }
  async putOutbox(r: SyncRecord & { id: string }): Promise<void> {
    await (await this.dbp).put('outbox', r)
  }
  async deleteOutbox(id: string): Promise<void> {
    await (await this.dbp).delete('outbox', id)
  }
  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await this.dbp).get('meta', key) as Promise<T | undefined>
  }
  async putMeta(key: string, value: unknown): Promise<void> {
    await (await this.dbp).put('meta', value, key)
  }
  /** Zeitstempel aller Datensätze löschen (erzwingt vollständiges Übernehmen beim nächsten Abruf). */
  async clearStamps(): Promise<void> {
    const db = await this.dbp
    const keys = (await db.getAllKeys('meta')).filter((k) => String(k).startsWith('stamp/'))
    const tx = db.transaction('meta', 'readwrite')
    await Promise.all(keys.map((k) => tx.store.delete(k)))
    await tx.done
  }
  async clearSyncState(): Promise<void> {
    const db = await this.dbp
    const tx = db.transaction([...SYNC_STORES], 'readwrite')
    await Promise.all(SYNC_STORES.map((s) => tx.objectStore(s).clear()))
    await tx.done
  }

  // --- WHOOP (nur lesend, aus der Cloud) --------------------------------------------------

  async listWhoop(): Promise<WhoopLocal> {
    const db = await this.dbp
    const vals = async <T>(s: string) => ((await db.getAll(s)) as { key: string; value: T }[]).map((r) => r.value)
    return {
      status: ((await db.get('kv', 'whoopStatus')) as WhoopStatusData | undefined) ?? null,
      cycles: await vals<WhoopCycle>('whoop_cycles'),
      recoveries: await vals<WhoopRecovery>('whoop_recoveries'),
      sleeps: await vals<WhoopSleep>('whoop_sleeps'),
      workouts: await vals<WhoopWorkout>('whoop_workouts'),
    }
  }
  listAssignments() {
    return this.all<WorkoutAssignment>('assignments')
  }
  putAssignment(a: WorkoutAssignment) {
    return this.put('assignments', a)
  }

  async exportAll(now: Date): Promise<BackupData> {
    return {
      version: 1,
      exportedAt: now.toISOString(),
      settings: await this.getSettings(),
      overrides: await this.listOverrides(),
      logs: await this.listLogs(),
      manual: await this.listManual(),
      strengthTests: await this.listStrengthTests(),
      strengthState: await this.getStrengthState(),
      checklist: await this.getChecklist(),
      decisions: await this.listDecisions(),
      assignments: await this.listAssignments(),
    }
  }

  async importAll(b: BackupData): Promise<void> {
    await this.clearAll()
    const db = await this.dbp
    const tx = db.transaction([...STORES], 'readwrite')
    await tx.objectStore('kv').put(b.settings, 'settings')
    if (b.strengthState) await tx.objectStore('kv').put(b.strengthState, 'strengthState')
    await tx.objectStore('kv').put(b.checklist, 'checklist')
    for (const o of b.overrides) await tx.objectStore('overrides').put(o)
    for (const l of b.logs) await tx.objectStore('logs').put(l)
    for (const m of b.manual) await tx.objectStore('manual').put(m)
    for (const t of b.strengthTests) await tx.objectStore('tests').put(t)
    for (const d of b.decisions) await tx.objectStore('decisions').put(d)
    for (const a of b.assignments ?? []) await tx.objectStore('assignments').put(a)
    await tx.done
  }

  async clearAll(): Promise<void> {
    const db = await this.dbp
    const tx = db.transaction([...STORES], 'readwrite')
    await Promise.all(STORES.map((s) => tx.objectStore(s).clear()))
    await tx.done
  }
}
