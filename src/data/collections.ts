// Zuordnung der lokalen Stores (IndexedDB) zu den Supabase-Tabellen.

export type Collection =
  | 'settings'
  | 'shift_overrides'
  | 'session_logs'
  | 'manual_readiness'
  | 'strength_tests'
  | 'strength_state'
  | 'checklist'
  | 'adjustment_decisions'

export const COLLECTIONS: Collection[] = [
  'settings',
  'shift_overrides',
  'session_logs',
  'manual_readiness',
  'strength_tests',
  'strength_state',
  'checklist',
  'adjustment_decisions',
]

/** Schlüsselspalte in Postgres. */
export const KEY_COLUMN: Record<Collection, string> = {
  settings: 'key',
  shift_overrides: 'date',
  session_logs: 'session_id',
  manual_readiness: 'date',
  strength_tests: 'date',
  strength_state: 'key',
  checklist: 'key',
  adjustment_decisions: 'session_id',
}

/** Lokaler Speicherort: eigener Store (mit keyPath) oder Einzelwert im kv-Store. */
export const LOCAL: Record<Collection, { store: string; kvKey?: string; keyPath?: string }> = {
  settings: { store: 'kv', kvKey: 'settings' },
  strength_state: { store: 'kv', kvKey: 'strengthState' },
  checklist: { store: 'kv', kvKey: 'checklist' },
  shift_overrides: { store: 'overrides', keyPath: 'date' },
  session_logs: { store: 'logs', keyPath: 'sessionId' },
  manual_readiness: { store: 'manual', keyPath: 'date' },
  strength_tests: { store: 'tests', keyPath: 'date' },
  adjustment_decisions: { store: 'decisions', keyPath: 'sessionId' },
}

/** Ein zu synchronisierender Datensatz (Outbox bzw. Remote). */
export interface SyncRecord {
  collection: Collection
  key: string
  /** null = gelöscht */
  value: unknown
  /** Zeitpunkt der Änderung auf dem Gerät (ISO), für „neuerer Stand gewinnt“. */
  clientUpdatedAt: string
}

export interface RemoteRow extends SyncRecord {
  /** Serverzeit der letzten Änderung (Abruf-Cursor). */
  serverUpdatedAt: string
}

export const outboxId = (c: Collection, key: string) => `${c}/${key}`
