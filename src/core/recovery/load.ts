// Trainingslast für den Lastfaktor (SPEC 6.1: Trainingslast der letzten 7 Tage).
// Last = Dauer × Faktor der Intensitätsstufe; mit WHOOP-Strain wird dieser bevorzugt.

import { CONFIG } from '../config'
import type { IntensityLevel, LoadEntry, PlannedSession, SessionLog } from '../types'

/** Last einer Einheit aus Dauer und Intensitätsstufe. */
export function sessionLoad(durationMin: number, level: IntensityLevel): number {
  return durationMin * (CONFIG.sessions.loadPerMinute[level] ?? 1)
}

/** Tägliche Last aus erledigten Einheiten (Protokoll + Plan für die Intensität). */
export function dailyLoads(logs: readonly SessionLog[], sessionsById: ReadonlyMap<string, PlannedSession>): LoadEntry[] {
  const byDate = new Map<string, number>()
  for (const l of logs) {
    if (l.status !== 'done') continue
    const s = sessionsById.get(l.sessionId)
    const load =
      l.strain !== undefined ? l.strain * CONFIG.sessions.strainToLoad : sessionLoad(l.durationMin ?? s?.durationMin ?? 0, s?.intensity.level ?? 2)
    byDate.set(l.date, (byDate.get(l.date) ?? 0) + load)
  }
  return [...byDate.entries()].map(([date, load]) => ({ date, load })).sort((a, b) => (a.date < b.date ? -1 : 1))
}
