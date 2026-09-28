// Datenaufbereitung für die Erholungs-Ansicht (SPEC 9.5) und die Schlaf-Umsetzung (SPEC 6.3b).

import { assessReadiness } from '../core/recovery'
import { effectiveShift, type ShiftCalendar } from '../core/shift'
import { recommendSleep, sleepAdherence, type ActualSleep } from '../core/sleep'
import { addDays, formatDayMonthDE, instantToBerlin } from '../core/time'
import type { LocalDate, Plan, RecoveryDay, ShiftCode } from '../core/types'
import { recoveryHistory, whoopActive, type AppData } from './compute'

export type ShiftBand = 'day' | 'night' | 'after_night' | 'none'

export interface RecoveryRow {
  date: LocalDate
  label: string
  code: ShiftCode
  band: ShiftBand
  score?: number
  hrv?: number
  hrv7?: number
  rhr?: number
  sleepH?: number
  needH?: number
}

function bandOf(code: ShiftCode, postNight: boolean): ShiftBand {
  if (code === 'N') return 'night'
  if (code === 'T' || code === 'V' || code === 'FB') return 'day'
  if (postNight) return 'after_night'
  return 'none'
}

const round1 = (x: number) => Math.round(x * 10) / 10

export function recoveryRows(data: AppData, cal: ShiftCalendar, today: LocalDate, days: number): RecoveryRow[] {
  const history = recoveryHistory(data, cal, today, days + 7)
  const byDate = new Map(history.map((h) => [h.date, h]))
  const rows: RecoveryRow[] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i)
    const s = effectiveShift(cal, date)
    const d: RecoveryDay | undefined = byDate.get(date)
    const score = d?.recoveryScore ?? (d ? assessReadiness({ date, today: d, history }).score : undefined)
    const last7 = Array.from({ length: 7 }, (_, k) => byDate.get(addDays(date, -k))?.hrvMs).filter((x): x is number => x !== undefined)
    const sleepMin = d?.sleep ? d.sleep.durationMin + (d.sleep.napMin ?? 0) : d?.manual?.sleepMin
    rows.push({
      date,
      label: formatDayMonthDE(date),
      code: s.code,
      band: bandOf(s.code, s.postNight),
      ...(score !== undefined ? { score } : {}),
      ...(d?.hrvMs !== undefined ? { hrv: Math.round(d.hrvMs) } : {}),
      ...(last7.length >= 3 ? { hrv7: Math.round(last7.reduce((a, x) => a + x, 0) / last7.length) } : {}),
      ...(d?.restingHr !== undefined ? { rhr: d.restingHr } : {}),
      ...(sleepMin !== undefined ? { sleepH: round1(sleepMin / 60) } : {}),
      ...(d?.sleep?.needMin !== undefined ? { needH: round1(d.sleep.needMin / 60) } : {}),
    })
  }
  return rows
}

/** Schlaf-Umsetzung der letzten Tage (nur mit echten WHOOP-Daten). */
export function adherence(data: AppData, cal: ShiftCalendar, plan: Plan, today: LocalDate, days: number) {
  if (!whoopActive(data)) return null
  const recs = Array.from({ length: days }, (_, i) => recommendSleep({ cal, date: addDays(today, -days + i), plan }))
  const actual: ActualSleep[] = data.whoop.sleeps.map((s) => ({ start: instantToBerlin(s.start), end: instantToBerlin(s.end), nap: s.nap }))
  return sleepAdherence(recs, actual)
}
