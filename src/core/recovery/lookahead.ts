// Vorausschauende Erholung (SPEC 6.3a): Schlüsseleinheiten der nächsten 1–2 Tage schützen.
// Greift nur ab Gelb (Entscheidung Phase 2). Reduziert harte Einheiten, streicht nie.

import { CONFIG } from '../config'
import { effectiveShift, type ShiftCalendar } from '../shift'
import { addDays } from '../time'
import type { LocalDate, Plan, PlannedSession } from '../types'
import type { ReadinessResult } from './readiness'

const L = CONFIG.recovery.lookahead

export interface UpcomingKey {
  date: LocalDate
  daysAhead: number
  session: PlannedSession
  /** Zwischen heute und der Einheit liegt eine Nachtschicht (inkl. heute Abend). */
  nightShiftBetween: boolean
}

/** Schlüsseleinheiten der nächsten Tage (Horizont aus der Konfiguration). */
export function upcomingKeySessions(plan: Plan, date: LocalDate, cal: ShiftCalendar): UpcomingKey[] {
  const out: UpcomingKey[] = []
  for (let i = 1; i <= L.horizonDays; i++) {
    const d = addDays(date, i)
    const day = plan.days.find((x) => x.date === d)
    if (!day) continue
    let night = false
    for (let k = 0; k < i; k++) if (effectiveShift(cal, addDays(date, k)).code === 'N') night = true
    for (const s of day.sessions) {
      if (s.optional) continue
      if (CONFIG.sessions.lookaheadImportance[s.type] === undefined) continue
      out.push({ date: d, daysAhead: i, session: s, nightShiftBetween: night })
    }
  }
  return out
}

export interface LookaheadResult {
  strength: number
  target?: UpcomingKey
}

/**
 * Stärke der Vorausschau: Wichtigkeit der kommenden Einheit × Nähe, plus Verstärker
 * (fallender HRV-Trend, wachsendes Schlafdefizit, Nachtschicht dazwischen, erwarteter Abfall).
 * 0, wenn die Ampel nicht mindestens gelb ist oder keine Schlüsseleinheit ansteht.
 */
export function lookaheadStrength(readiness: ReadinessResult, upcoming: readonly UpcomingKey[], expectedDropPct = 0): LookaheadResult {
  if (readiness.traffic !== 'yellow' && readiness.traffic !== 'red') return { strength: 0 }
  let best: LookaheadResult = { strength: 0 }
  for (const u of upcoming) {
    const importance = CONFIG.sessions.lookaheadImportance[u.session.type] ?? 0
    const proximity = L.proximity[u.daysAhead - 1] ?? 0
    let s = importance * proximity
    if (readiness.hrvTrendFalling) s += L.boostHrvFalling
    if (readiness.debtGrowing) s += L.boostDebtGrowing
    if (u.nightShiftBetween) s += L.boostNightShift
    s += (Math.max(0, expectedDropPct) / 10) * L.boostPerExpectedDrop10
    s = Math.min(1, s)
    if (s > best.strength) best = { strength: s, target: u }
  }
  return best
}
