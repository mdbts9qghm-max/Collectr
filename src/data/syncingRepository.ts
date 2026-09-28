// Repository mit Synchronisation: schreibt lokal (sofort, offline-fähig), merkt die Änderung in der
// Outbox vor und stößt die Synchronisation mit Supabase an.

import type { ManualReadiness, SessionLog, ShiftOverride, StrengthState, StrengthTest } from '../core/types'
import { COLLECTIONS, READONLY } from './collections'
import type { IndexedDbRepository } from './indexedDb'
import type { SyncEngine } from './sync'
import type { AdjustmentDecision, AppSettings, BackupData, Repository, WorkoutAssignment } from './types'

/** Verzögerung, um mehrere schnelle Änderungen gemeinsam hochzuladen. */
const SYNC_DEBOUNCE_MS = 800

export class SyncingRepository implements Repository {
  private timer: ReturnType<typeof setTimeout> | null = null

  private local: IndexedDbRepository
  readonly engine: SyncEngine

  constructor(local: IndexedDbRepository, engine: SyncEngine) {
    this.local = local
    this.engine = engine
  }

  private schedule() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.engine.sync(), SYNC_DEBOUNCE_MS)
  }

  private async changed(fn: () => Promise<void>, record: () => Promise<void>) {
    await fn()
    await record()
    this.schedule()
  }

  getSettings() {
    return this.local.getSettings()
  }
  async saveSettings(s: AppSettings) {
    const before = await this.local.getSettings()
    await this.local.saveSettings(s)
    // Nur das simulierte Datum geändert → gerätespezifisch, nichts hochzuladen
    const { simulatedDate: _a, ...restA } = before
    const { simulatedDate: _b, ...restB } = s
    if (JSON.stringify(restA) === JSON.stringify(restB)) return
    await this.engine.record('settings', 'settings', s)
    this.schedule()
  }
  listOverrides() {
    return this.local.listOverrides()
  }
  putOverride(o: ShiftOverride) {
    return this.changed(
      () => this.local.putOverride(o),
      () => this.engine.record('shift_overrides', o.date, o),
    )
  }
  deleteOverride(date: string) {
    return this.changed(
      () => this.local.deleteOverride(date),
      () => this.engine.record('shift_overrides', date, null),
    )
  }
  listLogs() {
    return this.local.listLogs()
  }
  putLog(l: SessionLog) {
    return this.changed(
      () => this.local.putLog(l),
      () => this.engine.record('session_logs', l.sessionId, l),
    )
  }
  deleteLog(sessionId: string) {
    return this.changed(
      () => this.local.deleteLog(sessionId),
      () => this.engine.record('session_logs', sessionId, null),
    )
  }
  listManual() {
    return this.local.listManual()
  }
  putManual(m: ManualReadiness) {
    return this.changed(
      () => this.local.putManual(m),
      () => this.engine.record('manual_readiness', m.date, m),
    )
  }
  listStrengthTests() {
    return this.local.listStrengthTests()
  }
  putStrengthTest(t: StrengthTest) {
    return this.changed(
      () => this.local.putStrengthTest(t),
      () => this.engine.record('strength_tests', t.date, t),
    )
  }
  getStrengthState() {
    return this.local.getStrengthState()
  }
  saveStrengthState(s: StrengthState) {
    return this.changed(
      () => this.local.saveStrengthState(s),
      () => this.engine.record('strength_state', 'strengthState', s),
    )
  }
  getChecklist() {
    return this.local.getChecklist()
  }
  saveChecklist(c: Record<string, boolean>) {
    return this.changed(
      () => this.local.saveChecklist(c),
      () => this.engine.record('checklist', 'checklist', c),
    )
  }
  listDecisions() {
    return this.local.listDecisions()
  }
  putDecision(d: AdjustmentDecision) {
    return this.changed(
      () => this.local.putDecision(d),
      () => this.engine.record('adjustment_decisions', d.sessionId, d),
    )
  }
  listAssignments() {
    return this.local.listAssignments()
  }
  putAssignment(a: WorkoutAssignment) {
    return this.changed(
      () => this.local.putAssignment(a),
      () => this.engine.record('workout_assignments', a.workoutId, a),
    )
  }
  listWhoop() {
    return this.local.listWhoop()
  }
  exportAll(now: Date) {
    return this.local.exportAll(now)
  }
  /** Import ersetzt alles: vorhandene Daten werden auch in der Cloud gelöscht, der Import hochgeladen. */
  async importAll(b: BackupData) {
    await this.tombstoneAll()
    await this.local.importAll(b)
    for (const c of COLLECTIONS) {
      if (READONLY.has(c)) continue
      for (const [key, value] of await this.local.entries(c)) await this.engine.record(c, key, value)
    }
    this.schedule()
  }
  /** Löscht alle Daten lokal und in der Cloud. */
  async clearAll() {
    await this.tombstoneAll()
    await this.local.clearAll()
    await this.engine.resetCursor() // WHOOP-Daten neu holen
    this.schedule()
  }
  private async tombstoneAll() {
    for (const c of COLLECTIONS) {
      if (READONLY.has(c)) continue
      for (const [key] of await this.local.entries(c)) await this.engine.record(c, key, null)
    }
  }
}
