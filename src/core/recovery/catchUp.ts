// Nachhol-Vorschlag (SPEC 6.3): Bei sehr guter Recovery darf die App höchstens VORSCHLAGEN,
// eine ausgefallene Schlüsseleinheit nachzuholen, wenn das die Regeln aus 4 und 5 nicht verletzt.
// Es wird nie automatisch härter gemacht.

import { CONFIG } from '../config'
import { fitsWindow } from '../shift'
import { isLongOrQuality, priorityOf } from '../plan'
import { addDays, daysBetween, formatDateDE } from '../time'
import type { LocalDate, Plan, PlannedSession, SessionLog } from '../types'
import type { ReadinessResult } from './readiness'

const R = CONFIG.recovery

export interface CatchUpSuggestion {
  session: PlannedSession
  replaces: PlannedSession[]
  text: string
}

export function suggestCatchUp(plan: Plan, date: LocalDate, readiness: ReadinessResult, logs: readonly SessionLog[] = []): CatchUpSuggestion | null {
  if (readiness.traffic !== 'green' || (readiness.score ?? 0) < R.catchUpMinScore) return null
  const today = plan.days.find((d) => d.date === date)
  if (!today || !today.window || today.window.easyOnly || today.isRaceDay) return null
  if (today.shift.cycleDay !== 4 && today.shift.cycleDay !== 5) return null
  if (daysBetween(date, CONFIG.race.date) <= CONFIG.strength.noHeavyLegsDaysBeforeRace) return null

  const skipped = new Set(logs.filter((l) => l.status === 'skipped').map((l) => l.sessionId))
  const candidates: PlannedSession[] = []
  for (let i = 1; i <= R.catchUpLookbackDays; i++) {
    const d = plan.days.find((x) => x.date === addDays(date, -i))
    if (!d) continue
    for (const r of d.removed) if (r.session.isKey && r.reason !== 'moved' && r.reason !== 'replaced') candidates.push(r.session)
    for (const s of d.sessions) if (s.isKey && skipped.has(s.id) && !s.origin?.movedFrom) candidates.push(s)
  }
  // bereits verschobene Einheiten ausschließen
  const movedIds = new Set(plan.days.flatMap((d) => d.sessions).filter((s) => s.origin?.movedFrom).map((s) => s.id.split('@')[0]))
  const next = plan.days.find((x) => x.date === addDays(date, 1))
  const prev = plan.days.find((x) => x.date === addDays(date, -1))
  const sorted = candidates.filter((c) => !movedIds.has(c.id)).sort((a, b) => priorityOf(b) - priorityOf(a))
  for (const c of sorted) {
    const sameCat = today.sessions.filter((s) => s.category === c.category)
    if (sameCat.some((s) => priorityOf(s) >= priorityOf(c))) continue
    if (c.type === 'legs_heavy' && next?.sessions.some(isLongOrQuality)) continue
    if (isLongOrQuality(c) && prev?.sessions.some((s) => s.type === 'legs_heavy')) continue
    if (c.type === 'night_run' && !today.window.nightRunAllowed) continue
    const remaining = today.sessions.filter((s) => !sameCat.includes(s))
    if (!fitsWindow(today.window, [...remaining, c])) continue
    return {
      session: c,
      replaces: sameCat,
      text: `Sehr gute Recovery (${readiness.score} %): Vorschlag, die ausgefallene Einheit „${c.title}“ vom ${formatDateDE(c.date)} heute statt ${
        sameCat.length ? sameCat.map((s) => `„${s.title}“`).join(' und ') : 'eines Ruhetags'
      } zu machen. Freiwillig, kein zusätzlicher Umfang.`,
    }
  }
  return null
}
