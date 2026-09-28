// Schichtberechnung (SPEC 4): Zyklustag, Grundschicht, Overrides, Arbeitszeiten, Tageskategorie.

import { CONFIG, DEFAULT_PROFILE } from '../config'
import { addDays, daysBetween } from '../time'
import type {
  BaseShift,
  CycleDay,
  DayKind,
  EffectiveShift,
  LocalDate,
  Minutes,
  ShiftCode,
  ShiftOverride,
  ShiftTimes,
  WorkTimes,
} from '../types'

export interface ShiftSettings {
  anchorDate: LocalDate
  rhythm: readonly BaseShift[]
  times: { T: ShiftTimes; N: ShiftTimes; V: ShiftTimes; FB: ShiftTimes }
  earlyStartMin: number
  commuteMin: number
}

export const DEFAULT_SHIFT_SETTINGS: ShiftSettings = {
  anchorDate: CONFIG.shift.anchorDate,
  rhythm: CONFIG.shift.rhythm,
  times: CONFIG.shift.times,
  earlyStartMin: CONFIG.shift.earlyStartMin,
  commuteMin: DEFAULT_PROFILE.commuteMin,
}

export interface ShiftCalendar {
  settings: ShiftSettings
  overrides: ReadonlyMap<LocalDate, ShiftOverride>
}

export function createShiftCalendar(overrides: readonly ShiftOverride[] = [], settings: ShiftSettings = DEFAULT_SHIFT_SETTINGS): ShiftCalendar {
  const map = new Map<LocalDate, ShiftOverride>()
  for (const o of overrides) map.set(o.date, o)
  return { settings, overrides: map }
}

/** Neuer Kalender mit zusätzlichem/ersetztem Override (unveränderlich). */
export function withOverride(cal: ShiftCalendar, override: ShiftOverride): ShiftCalendar {
  const map = new Map(cal.overrides)
  map.set(override.date, override)
  return { settings: cal.settings, overrides: map }
}

export function withoutOverride(cal: ShiftCalendar, date: LocalDate): ShiftCalendar {
  const map = new Map(cal.overrides)
  map.delete(date)
  return { settings: cal.settings, overrides: map }
}

/** Urlaub für einen Zeitraum eintragen. */
export function withVacation(cal: ShiftCalendar, from: LocalDate, to: LocalDate): ShiftCalendar {
  let out = cal
  for (let d = from; d <= to; d = addDays(d, 1)) out = withOverride(out, { date: d, kind: 'URLAUB', source: 'manual' })
  return out
}

/**
 * Zyklustag 1–5: ((datum − anker) mod 5) + 1, auch für Daten vor dem Anker.
 * Gerechnet über Kalendertage, daher unabhängig von Sommerzeit.
 */
export function cycleDay(date: LocalDate, anchor: LocalDate = CONFIG.shift.anchorDate, length = 5): CycleDay {
  const diff = daysBetween(anchor, date)
  return ((((diff % length) + length) % length) + 1) as CycleDay
}

export function baseShift(date: LocalDate, settings: ShiftSettings = DEFAULT_SHIFT_SETTINGS): BaseShift {
  return settings.rhythm[cycleDay(date, settings.anchorDate, settings.rhythm.length) - 1]!
}

const WORK_CODES: ReadonlySet<ShiftCode> = new Set(['T', 'N', 'V', 'FB'])

export function isWorkCode(code: ShiftCode): boolean {
  return WORK_CODES.has(code)
}

/** Schicht nach Override, ohne Schlaftag-Korrektur (nicht rekursiv). */
function rawCode(cal: ShiftCalendar, date: LocalDate): { code: ShiftCode; override?: ShiftOverride } {
  const base = baseShift(date, cal.settings)
  const o = cal.overrides.get(date)
  if (!o) return { code: base }
  switch (o.kind) {
    case 'V':
      return { code: 'V', override: o }
    case 'URLAUB':
      return { code: 'U', override: o }
    case 'KRANK':
      return { code: 'K', override: o }
    case 'TAUSCH':
      return { code: o.swapTo ?? base, override: o }
    case 'FORTBILDUNG':
      return { code: 'FB', override: o }
    case 'UEBERSTUNDEN':
      return { code: isWorkCode(base) ? base : 'FB', override: o }
  }
}

function workTimesFor(code: ShiftCode, cal: ShiftCalendar, override?: ShiftOverride): WorkTimes | undefined {
  if (!isWorkCode(code)) return undefined
  const s = cal.settings
  const std = s.times[code as 'T' | 'N' | 'V' | 'FB']
  let start: Minutes = std.start
  let end: Minutes = std.end
  if (override?.kind === 'FORTBILDUNG' || (override?.kind === 'UEBERSTUNDEN' && code === 'FB')) {
    start = override.start ?? start
    end = override.end ?? end
  } else if (override?.kind === 'UEBERSTUNDEN') {
    start = override.start ?? start
    end = override.end ?? end
  }
  const actualStart = start - s.earlyStartMin
  return {
    start,
    end,
    actualStart,
    departure: actualStart - s.commuteMin,
    homeArrival: end + s.commuteMin,
  }
}

function dayKindFor(code: ShiftCode, postNight: boolean): DayKind {
  if (code === 'K') return 'sick'
  if (code === 'N') return postNight ? 'night_to_night' : 'pre_night'
  if (code === 'T' || code === 'V' || code === 'FB') return 'work'
  return postNight ? 'sleep_day' : 'free'
}

/** Tatsächliche Schicht eines Tages inkl. Overrides und Tageskategorie. */
export function effectiveShift(cal: ShiftCalendar, date: LocalDate): EffectiveShift {
  const { code: raw, override } = rawCode(cal, date)
  const prev = rawCode(cal, addDays(date, -1)).code
  const postNight = prev === 'N'
  // Ein Schlaftag ohne vorherige Nachtschicht (z. B. nach Tausch) ist ein freier Tag.
  const code: ShiftCode = raw === 'S' && !postNight ? 'F' : raw
  const work = workTimesFor(code, cal, override)
  return {
    date,
    cycleDay: cycleDay(date, cal.settings.anchorDate, cal.settings.rhythm.length),
    base: baseShift(date, cal.settings),
    code,
    isWork: isWorkCode(code),
    ...(work ? { work } : {}),
    postNight,
    dayKind: dayKindFor(code, postNight),
    ...(override ? { override } : {}),
  }
}

export interface ShiftContext {
  /** Stunden seit dem letzten Dienstende (null, wenn > 72 h). */
  hoursSinceShiftEnd: number | null
  /** Stunden bis zum nächsten tatsächlichen Arbeitsbeginn (null, wenn > 72 h). */
  hoursUntilNextShift: number | null
  /** Die letzte Nacht war eine Arbeitsnacht. */
  lastNightWorked: boolean
  cycleDay: CycleDay
  code: ShiftCode
}

/** Schichtkontext zu einem Zeitpunkt (Datum + Minuten) für den Einheiten-Faktor (SPEC 6.1). */
export function shiftContext(cal: ShiftCalendar, date: LocalDate, atMin: Minutes): ShiftContext {
  const today = effectiveShift(cal, date)
  let since: number | null = null
  for (let i = 0; i <= 3 && since === null; i++) {
    const d = addDays(date, -i)
    const s = effectiveShift(cal, d)
    if (!s.work) continue
    const endRel = s.work.end - i * 1440
    if (endRel <= atMin) since = (atMin - endRel) / 60
  }
  let until: number | null = null
  for (let i = 0; i <= 3 && until === null; i++) {
    const d = addDays(date, i)
    const s = effectiveShift(cal, d)
    if (!s.work) continue
    const startRel = s.work.actualStart + i * 1440
    if (startRel >= atMin) until = (startRel - atMin) / 60
  }
  return {
    hoursSinceShiftEnd: since,
    hoursUntilNextShift: until,
    lastNightWorked: today.postNight,
    cycleDay: today.cycleDay,
    code: today.code,
  }
}

/** Anzeigename der Schicht. */
export function shiftLabel(code: ShiftCode): string {
  switch (code) {
    case 'T':
      return 'Tagschicht'
    case 'N':
      return 'Nachtschicht'
    case 'S':
      return 'Schlaftag'
    case 'F':
      return 'Frei'
    case 'V':
      return 'V-Schicht'
    case 'U':
      return 'Urlaub'
    case 'K':
      return 'Krank'
    case 'FB':
      return 'Fortbildung'
  }
}
