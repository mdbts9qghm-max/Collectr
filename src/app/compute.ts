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
import { addDays, berlinToday, compareDates, daysBetween, formatDateDE } from '../core/time'
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
import type { AdjustmentDecision, AppSettings } from '../data/types'

export interface AppData {
  settings: AppSettings
  overrides: ShiftOverride[]
  logs: SessionLog[]
  manual: ManualReadiness[]
  strengthTests: StrengthTest[]
  strengthState: StrengthState | null
  checklist: Record<string, boolean>
  decisions: AdjustmentDecision[]
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

/** Erholungsverlauf: Demo-Daten und/oder manuelle Eingaben (manuell hat Vorrang). */
export function recoveryHistory(data: AppData, cal: ShiftCalendar, date: LocalDate): RecoveryDay[] {
  const byDate = new Map<LocalDate, RecoveryDay>()
  if (data.settings.demoMode) {
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

/** Erste Einheit ab einem Datum (für die Ansicht vor Planbeginn). */
export function nextTrainingDay(plan: Plan, from: LocalDate): PlanDay | undefined {
  return plan.days.find((d) => compareDates(d.date, from) >= 0 && d.sessions.some((s) => !s.optional))
}

export { findSession }
