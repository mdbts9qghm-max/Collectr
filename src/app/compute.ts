// Verbindet gespeicherte Eingaben mit der Kernlogik: Kalender, Erholungsverlauf, Plan und
// die Tagesansicht (Heute). Reine Funktionen, die Zeit wird übergeben.

import { CONFIG } from '../core/config'
import { findSession, generatePlan, microIndexOf } from '../core/plan'
import {
  adjustSession,
  assessReadiness,
  dailyLoads,
  microModifiersFromHistory,
  suggestCatchUp,
  upcomingKeySessions,
  type CatchUpSuggestion,
  type ReadinessResult,
} from '../core/recovery'
import { raceConflict, taperShiftNotes, vacationReminderDue } from '../core/race'
import { recommendSleep } from '../core/sleep'
import { createShiftCalendar, DEFAULT_SHIFT_SETTINGS, shiftContext, type ShiftCalendar } from '../core/shift'
import { applyStrengthTest, initialStrengthState } from '../core/strength'
import { addDays, berlinToday, compareDates, daysBetween, formatDateDE, instantToBerlin } from '../core/time'
import { sampleRecoveryDays } from '../core/fixtures/sampleData'
import type {
  LocalDate,
  ManualReadiness,
  MicrocyclePlan,
  Plan,
  PlanDay,
  PlannedSession,
  RecoveryDay,
  SessionAdjustment,
  SessionLog,
  ShiftOverride,
  SleepRecommendation,
  StrengthState,
  StrengthTest,
} from '../core/types'
import type { AdjustmentDecision, AppSettings, WhoopLocal, WorkoutAssignment } from '../data/types'
import { assignRecoveryDay, matchWorkouts, workoutToLog, type WorkoutMatch, type WhoopWorkout } from '../core/whoop'

export interface AppData {
  settings: AppSettings
  overrides: ShiftOverride[]
  logs: SessionLog[]
  manual: ManualReadiness[]
  strengthTests: StrengthTest[]
  strengthState: StrengthState | null
  checklist: Record<string, boolean>
  decisions: AdjustmentDecision[]
  /** WHOOP-Daten (Phase 5), leer ohne Verbindung. */
  whoop: WhoopLocal
  assignments: WorkoutAssignment[]
}

export const EMPTY_WHOOP: WhoopLocal = { status: null, cycles: [], recoveries: [], sleeps: [], workouts: [] }

/** WHOOP liefert Daten (verbunden oder bereits Daten vorhanden). */
export function whoopActive(data: Pick<AppData, 'whoop'>): boolean {
  return data.whoop.status?.connected === true || data.whoop.sleeps.length > 0
}

/** Heutiges Datum: simuliert oder echt (Europe/Berlin). */
export function currentDate(settings: AppSettings, now: number): LocalDate {
  return settings.simulatedDate ?? berlinToday(now)
}

export function buildCalendar(settings: AppSettings, overrides: readonly ShiftOverride[]): ShiftCalendar {
  return createShiftCalendar(overrides, { ...DEFAULT_SHIFT_SETTINGS, anchorDate: settings.anchorDate, commuteMin: settings.profile.commuteMin })
}

/** Kraftstand: gespeichert oder aus dem letzten Test abgeleitet. */
export function effectiveStrengthState(data: Pick<AppData, 'strengthState' | 'strengthTests'>): StrengthState {
  if (data.strengthState) return data.strengthState
  const last = [...data.strengthTests].sort((a, b) => compareDates(a.date, b.date)).at(-1)
  return last ? applyStrengthTest(initialStrengthState(), last, { onboarding: true }) : initialStrengthState()
}

/** Tage mit Beispieldaten im Demo-Modus (bis einschließlich `date`). */
const DEMO_DAYS = 45

/** Erholungsverlauf: WHOOP, sonst Demo-Daten; manuelle Eingaben haben für ihren Tag Vorrang. */
export function recoveryHistory(data: AppData, cal: ShiftCalendar, date: LocalDate): RecoveryDay[] {
  const byDate = new Map<LocalDate, RecoveryDay>()
  if (whoopActive(data)) {
    const w = { sleeps: data.whoop.sleeps, recoveries: data.whoop.recoveries, cycles: data.whoop.cycles }
    for (let i = DEMO_DAYS - 1; i >= 0; i--) {
      const d = addDays(date, -i)
      const r = assignRecoveryDay(cal, d, w)
      if (r) byDate.set(d, r)
    }
  } else if (data.settings.demoMode) {
    for (const d of sampleRecoveryDays(cal, { start: addDays(date, -(DEMO_DAYS - 1)), days: DEMO_DAYS, redDays: [DEMO_DAYS - 12, DEMO_DAYS - 11] })) byDate.set(d.date, d)
  }
  for (const m of data.manual) byDate.set(m.date, { date: m.date, source: 'manual', manual: m })
  return [...byDate.values()].sort((a, b) => compareDates(a.date, b.date))
}

export function buildPlan(data: AppData, cal: ShiftCalendar, history: readonly RecoveryDay[]): Plan {
  const statuses = history.map((d) => {
    const r = assessReadiness({ date: d.date, today: d, history })
    return { date: d.date, ...(r.traffic ? { traffic: r.traffic } : {}), debtMin: r.debtMin }
  })
  const base = generatePlan({ profile: data.settings.profile, calendar: cal, logs: data.logs })
  const microModifiers = microModifiersFromHistory(base.microcycles, statuses)
  return generatePlan({
    profile: data.settings.profile,
    calendar: cal,
    logs: data.logs,
    microModifiers,
    strengthState: effectiveStrengthState(data),
  })
}

export interface DayItem {
  session: PlannedSession
  adjustment: SessionAdjustment
  log?: SessionLog
  rejected: boolean
}

export interface Warning {
  id: string
  level: 'danger' | 'warn' | 'info'
  text: string
  /** Kann bestätigt werden (Urlaubserinnerung). */
  ackable?: boolean
}

export interface DayView {
  date: LocalDate
  day?: PlanDay
  micro?: MicrocyclePlan
  beforePlan: boolean
  afterRace: boolean
  readiness: ReadinessResult
  items: DayItem[]
  sleep: SleepRecommendation
  warnings: Warning[]
  catchUp: CatchUpSuggestion | null
}

export function buildDayView(data: AppData, cal: ShiftCalendar, plan: Plan, history: readonly RecoveryDay[], date: LocalDate): DayView {
  const day = plan.days.find((d) => d.date === date)
  const mi = microIndexOf(date)
  const micro = mi ? plan.microcycles.find((m) => m.index === mi) : undefined
  const sessionsById = new Map(plan.days.flatMap((d) => d.sessions).map((s) => [s.id, s]))
  const loads = dailyLoads(data.logs, sessionsById)
  const at = day?.window?.start ?? CONFIG.whoop.fallbackReferenceMin
  const readiness = assessReadiness({
    date,
    ...(history.find((h) => h.date === date) ? { today: history.find((h) => h.date === date)! } : {}),
    history: history.filter((h) => h.date !== date),
    loads,
    shift: shiftContext(cal, date, at),
    weights: data.settings.recoveryWeights,
  })
  const upcoming = upcomingKeySessions(plan, date, cal)
  const strengthState = effectiveStrengthState(data)
  const items: DayItem[] = (day?.sessions ?? []).map((session) => {
    const adjustment = adjustSession(session, {
      readiness,
      dayKind: day!.shift.dayKind,
      phase: micro?.phase ?? 'base',
      upcoming,
      sameDayTypes: day!.sessions.filter((s) => s !== session).map((s) => s.type),
      strengthState,
    })
    const log = data.logs.find((l) => l.sessionId === session.id)
    const rejected = data.decisions.find((d) => d.sessionId === session.id)?.rejected ?? false
    return { session, adjustment, ...(log ? { log } : {}), rejected }
  })

  const debt = readiness.debtMin
  const todayRecovery = history.find((h) => h.date === date)
  const sleep = recommendSleep({ cal, date, plan, debtMin: debt, ...(todayRecovery?.sleep?.needMin ? { needMin: todayRecovery.sleep.needMin } : {}) })

  return {
    date,
    ...(day ? { day } : {}),
    ...(micro ? { micro } : {}),
    beforePlan: compareDates(date, CONFIG.plan.startDate) < 0,
    afterRace: compareDates(date, CONFIG.race.date) > 0,
    readiness,
    items,
    sleep,
    warnings: buildWarnings(data, cal, plan, date, items, micro),
    catchUp: suggestCatchUp(plan, date, readiness, data.logs),
  }
}

export function buildWarnings(data: AppData, cal: ShiftCalendar, plan: Plan, date: LocalDate, items: DayItem[], micro?: MicrocyclePlan): Warning[] {
  const out: Warning[] = []
  const conflict = raceConflict(cal)
  if (conflict.hasConflict) {
    const due = vacationReminderDue(cal, date, data.settings.vacationReminderAck)
    out.push({ id: 'vacation', level: due ? 'danger' : 'warn', text: conflict.message, ...(due ? { ackable: true } : {}) })
  }
  if (items.some((i) => i.adjustment.healthWarning)) {
    out.push({ id: 'health', level: 'danger', text: 'Warnsignal: Ruhepuls seit Tagen erhöht und HRV deutlich unter dem Mittel. Pause einlegen, bei Krankheitsgefühl ärztlich abklären lassen.' })
  }
  for (const w of plan.mountainWeekends) {
    if (compareDates(date, w.reminderDate) >= 0 && compareDates(date, w.days[1]) <= 0) {
      out.push({
        id: `mountain-${w.microIndex}`,
        level: w.feasible ? 'info' : 'warn',
        text: w.feasible
          ? `Bergwochenende am ${formatDateDE(w.days[0])} und ${formatDateDE(w.days[1])}: Tage frei halten, Anreise und Unterkunft planen.`
          : `Bergwochenende am ${formatDateDE(w.days[0])}/${formatDateDE(w.days[1])} ist durch Dienst blockiert. Bitte tauschen oder Urlaub eintragen, sonst gibt es Laufband-Ersatz.`,
      })
    }
  }
  for (const n of taperShiftNotes(cal)) {
    const d = daysBetween(date, n.date)
    if (d >= 0 && d <= 21) out.push({ id: `taper-${n.date}`, level: 'warn', text: n.message })
  }
  if (micro && micro.modifier < 1) {
    out.push({ id: 'micro-reduced', level: 'info', text: `Dieser Mikrozyklus ist wegen schlechter Erholung um ${Math.round((1 - micro.modifier) * 100)} % reduziert.` })
  }
  return out
}

/** Wie weit zurück WHOOP-Workouts den Einheiten zugeordnet werden (Tage). */
const WORKOUT_LOOKBACK_DAYS = 14

export interface WorkoutSuggestion {
  workout: WhoopWorkout
  match: WorkoutMatch
  /** Einheiten desselben Tages, die in Frage kommen. */
  candidates: PlannedSession[]
}

export interface WorkoutActions {
  /** Eindeutig zugeordnet → automatisch als erledigt eintragen. */
  autoLogs: SessionLog[]
  /** Mehrdeutig oder ohne Treffer → im Tracking bestätigen/korrigieren. */
  suggestions: WorkoutSuggestion[]
}

/**
 * Ordnet WHOOP-Workouts der letzten Tage den Einheiten zu (SPEC 8). Eigene Einträge werden nie
 * überschrieben, manuelle Korrekturen haben Vorrang, bereits übernommene Workouts werden übersprungen.
 */
export function workoutActions(data: AppData, plan: Plan, today: LocalDate): WorkoutActions {
  const from = addDays(today, -WORKOUT_LOOKBACK_DAYS)
  const workouts = data.whoop.workouts.filter((w) => {
    const d = w.start.slice(0, 10)
    return d >= addDays(from, -1) && d <= addDays(today, 1)
  })
  const corrections: Record<string, string | null> = {}
  for (const a of data.assignments) corrections[a.workoutId] = a.sessionId
  const loggedWorkouts = new Set(data.logs.map((l) => l.whoopWorkoutId).filter(Boolean))
  const logBySession = new Map(data.logs.map((l) => [l.sessionId, l]))
  const days = plan.days.filter((d) => d.date >= from && d.date <= today)
  const sessionsById = new Map(days.flatMap((d) => d.sessions).map((s) => [s.id, s]))
  const autoLogs: SessionLog[] = []
  const suggestions: WorkoutSuggestion[] = []
  for (const m of matchWorkouts(workouts, days, corrections)) {
    const w = workouts.find((x) => x.id === m.workoutId)!
    if (loggedWorkouts.has(w.id)) continue
    if (m.confidence === 'manual' && m.sessionId === null) continue // ignoriert
    const session = m.sessionId ? sessionsById.get(m.sessionId) : undefined
    if ((m.confidence === 'auto' || m.confidence === 'manual') && session) {
      const existing = logBySession.get(session.id)
      if (existing && !existing.whoopWorkoutId) continue // selbst eingetragen → nicht überschreiben
      autoLogs.push({ ...workoutToLog(w, session.id, session.date), ...(existing?.feeling ? { feeling: existing.feeling } : {}) })
      continue
    }
    const localDate = session?.date ?? instantToBerlin(w.start).date
    const candidates = days.filter((d) => Math.abs(daysBetween(d.date, localDate)) <= 1).flatMap((d) => d.sessions).filter((s) => !logBySession.has(s.id))
    suggestions.push({ workout: w, match: m, candidates })
  }
  return { autoLogs, suggestions }
}

/** Erste Einheit ab einem Datum (für die Ansicht vor Planbeginn). */
export function nextTrainingDay(plan: Plan, from: LocalDate): PlanDay | undefined {
  return plan.days.find((d) => compareDates(d.date, from) >= 0 && d.sessions.some((s) => !s.optional))
}

export { findSession }
