// Trainingsfenster pro Tag (SPEC 4.3) aus dem tatsächlichen Schichtkontext.

import { CONFIG } from '../config'
import { baseBedtime } from '../sleep/baseline'
import { addDays } from '../time'
import type { LocalDate, Minutes, PlannedSession, TrainingWindow } from '../types'
import { effectiveShift, type ShiftCalendar } from './calendar'

const W = CONFIG.windows

export interface WindowOptions {
  /** Empfohlene Schlafenszeit (dynamisch aus der Schlafempfehlung). */
  bedtime?: Minutes
  /** Nap-Beginn vor der Nachtschicht. */
  napStart?: Minutes
}

/** Trainingsfenster oder null (kein Training: Tagdienst, V, krank, Nacht auf Nacht). */
export function trainingWindow(cal: ShiftCalendar, date: LocalDate, opts: WindowOptions = {}): TrainingWindow | null {
  const s = effectiveShift(cal, date)
  switch (s.dayKind) {
    case 'work':
    case 'sick':
    case 'night_to_night':
      return null
    case 'pre_night': {
      const napStart = opts.napStart ?? CONFIG.sleep.napStart
      return { start: W.preNightStart, end: napStart - W.preNightGapBeforeNapMin, easyOnly: false, nightRunAllowed: false }
    }
    case 'sleep_day': {
      const bed = opts.bedtime ?? baseBedtime(cal, date) ?? CONFIG.sleep.normalBedtime
      const end = bed - W.sleepDayEndBeforeBedMin
      if (end <= W.sleepDayStart) return null
      return { start: W.sleepDayStart, end, easyOnly: true, nightRunAllowed: false }
    }
    case 'free': {
      const next = effectiveShift(cal, addDays(date, 1))
      return { start: W.freeStart, end: W.freeEnd, easyOnly: false, nightRunAllowed: next.dayKind === 'free' }
    }
  }
}

/** Dauer des Fensters in Minuten (inkl. Nachtfenster, wenn erlaubt und gewünscht). */
export function windowLength(w: TrainingWindow, includeNight = false): number {
  if (includeNight && w.nightRunAllowed) return W.nightRunEnd - W.nightRunStart
  return w.end - w.start
}

/** Passt eine Liste von Einheiten (nacheinander, mit Wechselzeit) ins Fenster? */
export function fitsWindow(w: TrainingWindow | null, sessions: Pick<PlannedSession, 'durationMin' | 'type'>[]): boolean {
  if (!w) return sessions.length === 0
  const night = sessions.filter((x) => x.type === 'night_run')
  const day = sessions.filter((x) => x.type !== 'night_run')
  if (night.length > 0) {
    if (!w.nightRunAllowed) return false
    const nightTotal = night.reduce((a, x) => a + x.durationMin, 0) + (night.length - 1) * W.transitionMin
    if (nightTotal > W.nightRunEnd - W.nightRunStart) return false
  }
  if (day.length === 0) return true
  const total = day.reduce((a, x) => a + x.durationMin, 0) + (day.length - 1) * W.transitionMin
  return total <= w.end - w.start
}
