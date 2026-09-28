// Datenmodell der gespeicherten Eingaben (bis Phase 4 lokal in IndexedDB, danach Supabase).

import type { RecoveryWeights } from '../core/config'
import type { WhoopCycle, WhoopRecovery, WhoopSleep, WhoopWorkout } from '../core/whoop'
import type { LocalDate, ManualReadiness, Profile, SessionLog, ShiftOverride, StrengthState, StrengthTest } from '../core/types'

export interface AppSettings {
  onboarded: boolean
  profile: Profile
  anchorDate: LocalDate
  recoveryWeights: Partial<RecoveryWeights>
  /** Beispieldaten statt echter Erholungsdaten anzeigen. */
  demoMode: boolean
  /** Datum simulieren (null = echtes Datum). */
  simulatedDate: LocalDate | null
  /** Zuletzt bestätigte Urlaubs-Erinnerung. */
  vacationReminderAck?: LocalDate
}

/** Anpassung abgelehnt → Originalplan ausgeführt (SPEC 6.4, wird protokolliert). */
export interface AdjustmentDecision {
  sessionId: string
  date: LocalDate
  rejected: boolean
  decidedAt: string
}

/** Manuelle Zuordnung eines WHOOP-Workouts (sessionId null = ignorieren). */
export interface WorkoutAssignment {
  workoutId: string
  sessionId: string | null
  decidedAt: string
}

export interface WhoopStatusData {
  connected: boolean
  connectedAt?: string
  whoopUserId?: number
  lastSyncAt?: string
  lastError?: string | null
  counts?: Record<string, number>
}

export interface WhoopLocal {
  status: WhoopStatusData | null
  cycles: WhoopCycle[]
  recoveries: WhoopRecovery[]
  sleeps: WhoopSleep[]
  workouts: WhoopWorkout[]
}

export interface BackupData {
  version: 1
  exportedAt: string
  settings: AppSettings
  overrides: ShiftOverride[]
  logs: SessionLog[]
  manual: ManualReadiness[]
  strengthTests: StrengthTest[]
  strengthState: StrengthState | null
  checklist: Record<string, boolean>
  decisions: AdjustmentDecision[]
  assignments?: WorkoutAssignment[]
}

export interface Repository {
  getSettings(): Promise<AppSettings>
  saveSettings(s: AppSettings): Promise<void>
  listOverrides(): Promise<ShiftOverride[]>
  putOverride(o: ShiftOverride): Promise<void>
  deleteOverride(date: LocalDate): Promise<void>
  listLogs(): Promise<SessionLog[]>
  putLog(l: SessionLog): Promise<void>
  deleteLog(sessionId: string): Promise<void>
  listManual(): Promise<ManualReadiness[]>
  putManual(m: ManualReadiness): Promise<void>
  listStrengthTests(): Promise<StrengthTest[]>
  putStrengthTest(t: StrengthTest): Promise<void>
  getStrengthState(): Promise<StrengthState | null>
  saveStrengthState(s: StrengthState): Promise<void>
  getChecklist(): Promise<Record<string, boolean>>
  saveChecklist(c: Record<string, boolean>): Promise<void>
  listDecisions(): Promise<AdjustmentDecision[]>
  putDecision(d: AdjustmentDecision): Promise<void>
  listAssignments(): Promise<WorkoutAssignment[]>
  putAssignment(a: WorkoutAssignment): Promise<void>
  /** WHOOP-Daten (nur lesend, aus der Cloud synchronisiert). */
  listWhoop(): Promise<WhoopLocal>
  exportAll(now: Date): Promise<BackupData>
  importAll(b: BackupData): Promise<void>
  clearAll(): Promise<void>
}
