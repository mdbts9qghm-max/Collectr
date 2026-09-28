// Planerstellung: deterministische Funktion aus Profil, Schichtkalender, Protokollen und
// Reduktionsfaktoren. Wird nach jeder relevanten Änderung (V-Schicht, Urlaub, Krafttest,
// Auslassen einer Schlüsseleinheit) neu berechnet.

import { CONFIG, DEFAULT_PROFILE } from '../config'
import { createShiftCalendar, effectiveShift, type ShiftCalendar } from '../shift'
import { addDays, dateRange, isoWeek, isoWeekStart } from '../time'
import type {
  LocalDate,
  MicrocyclePlan,
  MountainWeekend,
  Phase,
  Plan,
  PlanDay,
  PlannedSession,
  Profile,
  SessionLog,
  StrengthState,
} from '../types'
import { composeMicro } from './compose'
import { buildMesocycles, buildMicrocycles } from './periodization'
import { assignStartTimes, enforceB2BIntegrity, enforceLegsRule, placeDay, tryMoveKeySession, type MoveContext } from './schedule'
import { buildVolumes, microToWeekly } from './volume'

export interface PlanInput {
  profile?: Pick<Profile, 'weeklyKmStart'>
  calendar?: ShiftCalendar
  logs?: readonly SessionLog[]
  /** Reduktionsfaktoren je Mikrozyklus aus der Erholung (SPEC 6.3). */
  microModifiers?: Readonly<Record<number, number>>
  /** Wenn gesetzt, werden Kraftübungen direkt eingesetzt. */
  strengthState?: StrengthState
}

export function generatePlan(input: PlanInput = {}): Plan {
  const profile = input.profile ?? DEFAULT_PROFILE
  const cal = input.calendar ?? createShiftCalendar()
  const micros = buildMicrocycles()
  const mesocycles = buildMesocycles()
  const volumes = buildVolumes(micros, profile)
  const volByMicro = new Map(volumes.map((v) => [v.index, v]))
  const microByIndex = new Map(micros.map((m) => [m.index, m]))
  const modifier = (i: number) => input.microModifiers?.[i] ?? 1

  // Fortschritt innerhalb der Phase (für die Progression der Qualitätseinheiten)
  const phaseMicros = new Map<Phase, number[]>()
  for (const m of micros) if (m.kind === 'normal') phaseMicros.set(m.phase, [...(phaseMicros.get(m.phase) ?? []), m.index])
  const progressOf = (i: number, phase: Phase) => {
    const list = phaseMicros.get(phase) ?? []
    const pos = list.indexOf(i)
    return list.length <= 1 || pos < 0 ? 1 : pos / (list.length - 1)
  }

  // 1. Einheiten je Mikrozyklus zusammenstellen und auf Tage legen
  const days = new Map<LocalDate, PlanDay>()
  const lost: { session: PlannedSession; date: LocalDate }[] = []
  for (const m of micros) {
    const intended = composeMicro(m, volByMicro.get(m.index)!, {
      progress: progressOf(m.index, m.phase),
      modifier: modifier(m.index),
      ...(input.strengthState ? { strengthState: input.strengthState } : {}),
    })
    const microDays: PlanDay[] = []
    for (const date of dateRange(m.start, m.end)) {
      const sessions = intended.filter((x) => x.session.date === date).map((x) => x.session)
      const day = placeDay(cal, date, m.index, m.phase, sessions)
      microDays.push(day)
      days.set(date, day)
    }
    enforceB2BIntegrity(microDays, m.phase)
    for (const d of microDays)
      for (const r of d.removed) if (r.session.isKey && r.reason !== 'replaced' && !r.note.includes('B2B')) lost.push({ session: r.session, date: d.date })
  }

  const skippedLogs = [...(input.logs ?? [])].filter((l) => l.status === 'skipped').sort((a, b) => (a.date < b.date ? -1 : 1))
  const moveCtx: MoveContext = {
    days,
    phaseOf: (i) => microByIndex.get(i)!.phase,
    capKmOf: (i) => volByMicro.get(i)!.capKm * modifier(i),
    skippedIds: new Set(skippedLogs.map((l) => l.sessionId)),
  }

  // 2. Ausgefallene Schlüsseleinheiten einmal verschieben, sonst streichen
  for (const { session, date } of lost.sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const day = days.get(date)!
    const entry = day.removed.find((r) => r.session === session)
    const target = tryMoveKeySession(moveCtx, session, date)
    if (entry) {
      if (target) {
        entry.reason = 'moved'
        entry.note = `${entry.note} Verschoben auf ${target.split('-').reverse().join('.')}.`
      } else {
        entry.note = `${entry.note} Kein passender Tag 4/5 frei: gestrichen.`
      }
    }
  }

  // 3. Ausgelassene Schlüsseleinheiten (Protokoll) einmal verschieben
  for (const log of skippedLogs) {
    const day = days.get(log.date)
    const session = day?.sessions.find((s) => s.id === log.sessionId)
    if (!day || !session) continue
    tryMoveKeySession(moveCtx, session, log.date)
  }

  // 4. Beinregel, Startzeiten
  enforceLegsRule(days, (i) => microByIndex.get(i)!.phase)
  assignStartTimes(days)

  // 5. Mikrozyklus-Summen
  const dayList = [...days.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
  const microcycles: MicrocyclePlan[] = micros.map((m) => {
    const v = volByMicro.get(m.index)!
    const ds = dayList.filter((d) => d.microIndex === m.index)
    const sessions = ds.flatMap((d) => d.sessions).filter((s) => !s.optional && s.type !== 'race')
    const runs = sessions.filter((s) => s.category === 'run')
    return {
      ...m,
      levelKm: v.levelKm,
      targetKm: v.targetKm * modifier(m.index),
      plannedKm: round1(runs.reduce((a, s) => a + (s.distanceKm ?? 0), 0)),
      targetElevationM: Math.round(v.targetElevationM * modifier(m.index)),
      plannedElevationM: Math.round(runs.reduce((a, s) => a + (s.elevationM ?? 0), 0)),
      strengthSets: sessions.filter((s) => s.category === 'strength').reduce((a, s) => a + (s.strengthSets ?? 0), 0),
      modifier: modifier(m.index),
      longRunKm: Math.max(0, ...runs.map((s) => s.distanceKm ?? 0)),
    }
  })

  return { mesocycles, microcycles, days: dayList, mountainWeekends: mountainWeekends(cal, microcycles) }
}

function round1(v: number): number {
  return Math.round(v * 10) / 10
}

function mountainWeekends(cal: ShiftCalendar, micros: MicrocyclePlan[]): MountainWeekend[] {
  return (CONFIG.plan.mountainMicros as readonly number[]).map((i) => {
    const m = micros.find((x) => x.index === i)!
    const d4 = addDays(m.start, 3)
    const d5 = addDays(m.start, 4)
    const feasible = [d4, d5].every((d) => effectiveShift(cal, d).dayKind === 'free')
    return { microIndex: i, days: [d4, d5], reminderDate: addDays(d4, -CONFIG.plan.mountainReminderDaysBefore), feasible }
  })
}

export interface CalendarWeekSummary {
  year: number
  week: number
  start: LocalDate
  plannedKm: number
  plannedElevationM: number
  strengthSets: number
}

/** Umrechnung auf Kalenderwochen für die Anzeige (SPEC 5.1). */
export function calendarWeeks(plan: Plan): CalendarWeekSummary[] {
  const map = new Map<string, CalendarWeekSummary>()
  for (const d of plan.days) {
    const { year, week } = isoWeek(d.date)
    const key = `${year}-${week}`
    const w = map.get(key) ?? { year, week, start: isoWeekStart(d.date), plannedKm: 0, plannedElevationM: 0, strengthSets: 0 }
    for (const s of d.sessions) {
      if (s.optional || s.type === 'race') continue
      if (s.category === 'run') {
        w.plannedKm += s.distanceKm ?? 0
        w.plannedElevationM += s.elevationM ?? 0
      }
      if (s.category === 'strength') w.strengthSets += s.strengthSets ?? 0
    }
    map.set(key, w)
  }
  return [...map.values()].map((w) => ({ ...w, plannedKm: round1(w.plannedKm), plannedElevationM: Math.round(w.plannedElevationM) }))
}

/** Wochen-Äquivalent eines Mikrozyklus (km × 7/5). */
export function weeklyEquivalentKm(m: Pick<MicrocyclePlan, 'plannedKm'>): number {
  return round1(microToWeekly(m.plannedKm))
}

export function planDay(plan: Plan, date: LocalDate): PlanDay | undefined {
  return plan.days.find((d) => d.date === date)
}

export function findSession(plan: Plan, id: string): PlannedSession | undefined {
  for (const d of plan.days) {
    const s = d.sessions.find((x) => x.id === id)
    if (s) return s
  }
  return undefined
}
