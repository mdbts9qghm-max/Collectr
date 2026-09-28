// Mikrozyklus-Reduktion (SPEC 6.3): Mehrere gelbe/rote Tage in Folge oder ein wachsendes
// Schlafdefizit senken automatisch den Umfang des NÄCHSTEN Mikrozyklus.

import { CONFIG } from '../config'
import type { LocalDate, Microcycle, TrafficLight } from '../types'

const M = CONFIG.recovery.microReduction

export interface DayStatus {
  date: LocalDate
  traffic?: TrafficLight
  debtMin?: number
}

export interface MicroReduction {
  /** Faktor für den nächsten Mikrozyklus (1 = keine Reduktion). */
  factor: number
  reasons: string[]
}

function longestStreak(days: DayStatus[], match: (t: TrafficLight) => boolean): number {
  let best = 0
  let cur = 0
  for (const d of days) {
    if (d.traffic && match(d.traffic)) {
      cur += 1
      best = Math.max(best, cur)
    } else if (d.traffic) cur = 0
    // Tage ohne Daten unterbrechen die Serie nicht, zählen aber auch nicht.
  }
  return best
}

/** Bewertet die Tage eines Mikrozyklus und liefert den Faktor für den folgenden. */
export function microcycleReduction(days: readonly DayStatus[]): MicroReduction {
  const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : 1))
  let reduction = 0
  const reasons: string[] = []
  const red = longestStreak(sorted, (t) => t === 'red')
  if (red >= M.redStreak) {
    reduction = Math.max(reduction, M.redStreakReduction)
    reasons.push(`${red} rote Tage in Folge`)
  }
  const yr = longestStreak(sorted, (t) => t !== 'green')
  if (yr >= M.yellowRedStreak) {
    reduction = Math.max(reduction, M.yellowRedStreakReduction)
    reasons.push(`${yr} gelbe/rote Tage in Folge`)
  }
  const lastDebt = [...sorted].reverse().find((d) => d.debtMin !== undefined)?.debtMin
  if (lastDebt !== undefined && lastDebt >= M.debtThresholdMin) {
    reduction = Math.max(reduction, M.debtReduction)
    reasons.push(`Schlafdefizit ${Math.round(lastDebt / 60)} h`)
  }
  return { factor: 1 - reduction, reasons }
}

/**
 * Faktoren für generatePlan: Jeder abgeschlossene (oder laufende) Mikrozyklus bestimmt den
 * Faktor des folgenden Mikrozyklus.
 */
export function microModifiersFromHistory(micros: readonly Microcycle[], statuses: readonly DayStatus[]): Record<number, number> {
  const out: Record<number, number> = {}
  for (const m of micros) {
    const days = statuses.filter((s) => s.date >= m.start && s.date <= m.end)
    if (days.length === 0) continue
    const { factor } = microcycleReduction(days)
    if (factor < 1) out[m.index + 1] = factor
  }
  return out
}
