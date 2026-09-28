// Scheduler: legt die zusammengestellten Einheiten auf die Tage und prüft die harten Regeln
// aus SPEC 4.3, 5.3 und 5.5 gegen den tatsächlichen Schichtplan.

import { CONFIG } from '../config'
import { effectiveShift, fitsWindow, trainingWindow, type ShiftCalendar } from '../shift'
import { addDays, daysBetween, formatDateDE } from '../time'
import type { LocalDate, Phase, PlanDay, PlannedSession, RemovedSession } from '../types'
import { EASY_ONLY_TYPES, isLongOrQuality, priorityOf, relocate, scaleSession, toLongRun, toStrengthVariant } from './sessionOps'

const W = CONFIG.windows
const DAY45: ReadonlySet<string> = new Set(CONFIG.sessions.day45Only)

/** Legt die Einheiten eines Tages ab; nicht Passendes landet in `removed`. */
export function placeDay(cal: ShiftCalendar, date: LocalDate, microIndex: number, phase: Phase, sessions: PlannedSession[]): PlanDay {
  const shift = effectiveShift(cal, date)
  const isRaceDay = date === CONFIG.race.date
  const day: PlanDay = {
    date,
    microIndex,
    shift,
    window: trainingWindow(cal, date),
    sessions: [],
    removed: [],
    isRaceDay,
  }
  if (shift.code === 'T') day.optionalNote = `Optional: höchstens ${W.dayShiftOptionalMobilityMin} min Mobility am Abend.`
  if (isRaceDay) {
    day.sessions = sessions.filter((s) => s.type === 'race')
    for (const s of sessions.filter((x) => x.type !== 'race')) day.removed.push({ session: s, reason: 'cancelled', note: 'Renntag' })
    return day
  }
  const w = day.window
  let list = [...sessions]
  const drop = (s: PlannedSession, reason: RemovedSession['reason'], note: string) => {
    list = list.filter((x) => x !== s)
    day.removed.push({ session: s, reason, note })
  }
  if (!w) {
    for (const s of [...list]) drop(s, 'no_window', 'Kein Trainingsfenster (Dienst, krank oder Nacht auf Nacht).')
    day.sessions = list
    return day
  }
  if (w.easyOnly) {
    for (const s of [...list]) if (!EASY_ONLY_TYPES.has(s.type)) drop(s, 'easy_only', 'Schlaftag: nur lockere Einheiten.')
  }
  for (const s of [...list]) {
    if (DAY45.has(s.type) && shift.cycleDay !== 4 && shift.cycleDay !== 5) drop(s, 'no_window', 'Lange Läufe nur an Tag 4 oder 5.')
  }
  // Nachtlauf nur, wenn der Folgetag frei ist; sonst tagsüber als langer Lauf.
  list = list.map((s) =>
    s.type === 'night_run' && !w.nightRunAllowed ? toLongRun(s, phase, s.distanceKm ?? 0, 'Nachtlauf nicht möglich (Folgetag Dienst): tagsüber laufen.') : s,
  )
  // Vor der Nachtschicht nur eine Einheit: die wichtigste bleibt (Entscheidung nach Phase 7).
  if (shift.dayKind === 'pre_night') {
    const required = list.filter((s) => !s.optional).sort((a, b) => priorityOf(b) - priorityOf(a))
    for (const s of required.slice(CONFIG.plan.maxSessionsPreNight)) drop(s, 'cancelled', 'Vor der Nachtschicht nur eine Einheit.')
  }
  // Fenster: zuerst optionale, dann nicht-Schlüssel, dann Schlüsseleinheiten niedrigster Priorität streichen.
  while (!fitsWindow(w, list) && list.length > 0) {
    const victim = [...list].sort((a, b) => Number(b.optional) - Number(a.optional) || Number(a.isKey) - Number(b.isKey) || priorityOf(a) - priorityOf(b))[0]!
    drop(victim, 'window_too_short', 'Passt nicht ins Trainingsfenster.')
  }
  day.sessions = list
  return day
}

/** B2B mit einem ausgefallenen Tag wird zum einzelnen langen Lauf (kein Nachholen). */
export function enforceB2BIntegrity(days: PlanDay[], phase: Phase): void {
  const find = (type: string) => {
    for (const d of days) {
      const placed = d.sessions.find((s) => s.type === type)
      if (placed) return { day: d, session: placed, placed: true }
      const removed = d.removed.find((r) => r.session.type === type && r.reason !== 'replaced')
      if (removed) return { day: d, session: removed.session, placed: false, removedEntry: removed }
    }
    return undefined
  }
  const a = find('b2b_1')
  const b = find('b2b_2')
  if (!a || !b || a.placed === b.placed) return
  const kept = a.placed ? a : b
  const lost = a.placed ? b : a
  const km = Math.max(a.session.distanceKm ?? 0, b.session.distanceKm ?? 0)
  const converted = toLongRun(kept.session, phase, km, 'Back-to-back mit nur einem freien Tag: einzelner langer Lauf.')
  const others = kept.day.sessions.filter((s) => s !== kept.session)
  if (fitsWindow(kept.day.window, [...others, converted])) {
    kept.day.sessions = [...others, converted]
  }
  if (lost.removedEntry) lost.removedEntry.note += ' Der andere B2B-Tag wird zum einzelnen langen Lauf.'
}

export interface MoveContext {
  days: Map<LocalDate, PlanDay>
  phaseOf: (microIndex: number) => Phase
  capKmOf: (microIndex: number) => number
  /** Ausgelassene Einheiten (zählen nicht zum Umfang). */
  skippedIds?: ReadonlySet<string>
}

function runKmOfMicro(ctx: MoveContext, microIndex: number): number {
  let sum = 0
  for (const d of ctx.days.values()) {
    if (d.microIndex !== microIndex) continue
    for (const s of d.sessions) if (s.category === 'run' && !s.optional && !ctx.skippedIds?.has(s.id)) sum += s.distanceKm ?? 0
  }
  return sum
}

/**
 * Verpasste/ausgefallene Schlüsseleinheit höchstens einmal auf den nächsten passenden Tag 4 oder 5
 * verschieben (SPEC 4.3, 6.3). Sie ersetzt dort nur eine weniger wichtige Einheit derselben Art,
 * kein zusätzlicher Umfang. Sonst wird sie gestrichen.
 */
export function tryMoveKeySession(ctx: MoveContext, lost: PlannedSession, fromDate: LocalDate): LocalDate | null {
  if (!lost.isKey || lost.origin?.movedFrom || lost.type === 'race') return null
  const horizon = CONFIG.plan.microLengthDays
  for (let i = 1; i <= horizon; i++) {
    const date = addDays(fromDate, i)
    const day = ctx.days.get(date)
    if (!day || day.isRaceDay || !day.window || day.window.easyOnly) continue
    if (daysBetween(date, CONFIG.race.date) <= 0) break
    if (day.shift.cycleDay !== 4 && day.shift.cycleDay !== 5) continue
    if (day.sessions.some((s) => s.origin?.movedFrom)) continue
    const sameCat = day.sessions.filter((s) => s.category === lost.category)
    if (sameCat.some((s) => priorityOf(s) >= priorityOf(lost))) continue
    const prev = ctx.days.get(addDays(date, -1))
    const next = ctx.days.get(addDays(date, 1))
    if (lost.type === 'legs_heavy' && next?.sessions.some(isLongOrQuality)) continue
    if (isLongOrQuality(lost) && prev?.sessions.some((s) => s.type === 'legs_heavy')) continue
    const phase = ctx.phaseOf(day.microIndex)
    let candidate = relocate(lost, date, day.microIndex)
    if (candidate.type === 'night_run' && !day.window.nightRunAllowed) {
      candidate = toLongRun(candidate, phase, candidate.distanceKm ?? 0, 'Nachtlauf nicht möglich: tagsüber laufen.')
      candidate.origin = { ...candidate.origin, movedFrom: lost.date }
    }
    const remaining = day.sessions.filter((s) => !sameCat.includes(s))
    if (candidate.category === 'run') {
      const replacedKm = sameCat.filter((s) => !s.optional).reduce((a, s) => a + (s.distanceKm ?? 0), 0)
      const allowed = ctx.capKmOf(day.microIndex) - (runKmOfMicro(ctx, day.microIndex) - replacedKm)
      const km = candidate.distanceKm ?? 0
      if (km > allowed) {
        const f = allowed / km
        if (f < CONFIG.volume.minMovedShare) continue
        candidate = scaleSession(candidate, f)
      }
    }
    if (!fitsWindow(day.window, [...remaining, candidate])) continue
    for (const r of sameCat) day.removed.push({ session: r, reason: 'replaced', note: `Ersetzt durch verschobene Einheit vom ${formatDateDE(lost.date)}.` })
    day.sessions = [...remaining, candidate]
    return date
  }
  return null
}

/** Schweres Beintraining nie am Vortag eines langen Laufs, einer Qualitätseinheit oder des Rennens (SPEC 5.5). */
export function enforceLegsRule(days: Map<LocalDate, PlanDay>, phaseOf: (microIndex: number) => Phase): void {
  for (const day of days.values()) {
    const legs = day.sessions.find((s) => s.type === 'legs_heavy')
    if (!legs) continue
    const next = days.get(addDays(day.date, 1))
    const tooCloseToRace = daysBetween(day.date, CONFIG.race.date) < CONFIG.strength.noHeavyLegsDaysBeforeRace
    if (!tooCloseToRace && !next?.sessions.some(isLongOrQuality)) continue
    const hasOtherStrength = day.sessions.some((s) => s !== legs && s.category === 'strength')
    const replacement = hasOtherStrength
      ? null
      : toStrengthVariant(legs, phaseOf(day.microIndex), 'calisthenics_maintenance', 'Kein schweres Beintraining am Vortag einer Schlüsseleinheit.')
    day.sessions = day.sessions.filter((s) => s !== legs).concat(replacement ? [replacement] : [])
    day.removed.push({ session: legs, reason: 'cancelled', note: 'Kein schweres Beintraining am Vortag eines langen Laufs, einer Qualitätseinheit oder des Rennens.' })
  }
}

/** Empfohlene Startzeiten setzen (Läufe zuerst, Kraft danach, Nachtlauf 21:00). */
export function assignStartTimes(days: Map<LocalDate, PlanDay>): void {
  for (const day of days.values()) {
    const w = day.window
    if (day.isRaceDay) continue
    if (!w || day.sessions.length === 0) continue
    const night = day.sessions.filter((s) => s.type === 'night_run')
    for (const s of night) s.startMin = W.nightRunStart
    const rest = day.sessions
      .filter((s) => s.type !== 'night_run')
      .sort((a, b) => order(a) - order(b))
    const prev = days.get(addDays(day.date, -1))
    const afterNightRun = prev?.sessions.some((s) => s.type === 'night_run') ?? false
    const total = rest.reduce((a, s) => a + s.durationMin, 0) + Math.max(0, rest.length - 1) * W.transitionMin
    let t = afterNightRun ? Math.max(w.start, W.afternoonStart) : w.start + W.startOffsetMin
    if (t + total > w.end) t = Math.max(w.start, w.end - total)
    for (const s of rest) {
      s.startMin = t
      t += s.durationMin + W.transitionMin
    }
    day.sessions = [...rest, ...night]
  }
}

function order(s: PlannedSession): number {
  if (s.optional) return 3
  if (s.category === 'run') return 0
  if (s.category === 'strength') return 1
  return 2
}

export interface RuleViolation {
  date: LocalDate
  rule: 'no_training_day' | 'easy_only' | 'window' | 'day45' | 'legs_before_key' | 'night_run'
  message: string
}

/** Prüft einen fertigen Plan gegen die harten Regeln (für Tests und die Oberfläche). */
export function checkPlanRules(days: PlanDay[]): RuleViolation[] {
  const out: RuleViolation[] = []
  const byDate = new Map(days.map((d) => [d.date, d]))
  for (const d of days) {
    if (d.isRaceDay) continue
    if (!d.window && d.sessions.length > 0) out.push({ date: d.date, rule: 'no_training_day', message: 'Einheit an einem Tag ohne Trainingsfenster.' })
    if (d.window?.easyOnly && d.sessions.some((s) => !EASY_ONLY_TYPES.has(s.type))) out.push({ date: d.date, rule: 'easy_only', message: 'Harte Einheit am Schlaftag.' })
    if (d.window && !fitsWindow(d.window, d.sessions)) out.push({ date: d.date, rule: 'window', message: 'Einheiten passen nicht ins Fenster.' })
    if (d.sessions.some((s) => DAY45.has(s.type)) && d.shift.cycleDay !== 4 && d.shift.cycleDay !== 5)
      out.push({ date: d.date, rule: 'day45', message: 'Langer Lauf nicht an Tag 4/5.' })
    if (d.sessions.some((s) => s.type === 'night_run') && !d.window?.nightRunAllowed) out.push({ date: d.date, rule: 'night_run', message: 'Nachtlauf vor einem Diensttag.' })
    if (d.sessions.some((s) => s.type === 'legs_heavy')) {
      const next = byDate.get(addDays(d.date, 1))
      if (next?.sessions.some(isLongOrQuality) || next?.isRaceDay)
        out.push({ date: d.date, rule: 'legs_before_key', message: 'Schweres Beintraining am Vortag einer Schlüsseleinheit.' })
    }
  }
  return out
}
