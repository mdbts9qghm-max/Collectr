// Statische Schlaf-Grundwerte ohne WHOOP-Daten. Wird vom Trainingsfenster (Schlaftag endet
// 3 h vor der Schlafenszeit) und von den dynamischen Schlafempfehlungen genutzt.

import { CONFIG } from '../config'
import { effectiveShift, type ShiftCalendar } from '../shift/calendar'
import { addDays } from '../time'
import type { LocalDate, Minutes } from '../types'

const S = CONFIG.sleep

/**
 * Späteste Aufstehzeit am Morgen von `date` (Minuten an `date`) aus Arbeitsbeginn und Arbeitsweg.
 * Frühdienst (T/V/FB): Losfahren − Vorbereitungszeit. Sonst null (freie Wahl).
 */
export function latestWakeForWork(cal: ShiftCalendar, date: LocalDate): Minutes | null {
  const s = effectiveShift(cal, date)
  if (!s.work || s.code === 'N') return null
  return s.work.departure - S.morningPrepMin
}

/**
 * Grund-Zubettgehzeit am Abend von `date` (Minuten relativ zu `date`, ggf. > 1440).
 * null, wenn am Abend gearbeitet wird (Nachtschicht).
 */
export function baseBedtime(cal: ShiftCalendar, date: LocalDate, needMin: number = S.defaultNeedMin): Minutes | null {
  const today = effectiveShift(cal, date)
  if (today.code === 'N') return null
  const nextWake = latestWakeForWork(cal, addDays(date, 1))
  if (nextWake !== null) {
    const bed = nextWake + 1440 - needMin - S.latencyMin
    return Math.max(S.earliestBedtime, Math.min(bed, S.normalBedtime))
  }
  return S.normalBedtime
}
