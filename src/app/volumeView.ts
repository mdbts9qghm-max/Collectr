// Soll/Ist-Umfang für Coach und Gesamtplan: Ist-Werte aus den erledigten Einträgen.

import type { LocalDate, Plan, SessionLog } from '../core/types'

export interface Volume {
  km: number
  hm: number
  sets: number
}

/** Erledigter Umfang je Tag (Lauf-km/hm aus dem Eintrag, sonst aus der geplanten Einheit). */
export function actualByDate(plan: Plan, logs: readonly SessionLog[]): Map<LocalDate, Volume> {
  const byDate = new Map<LocalDate, Volume>()
  const sessions = new Map(plan.days.flatMap((d) => d.sessions).map((s) => [s.id, s]))
  for (const l of logs) {
    if (l.status !== 'done') continue
    const s = sessions.get(l.sessionId)
    const e = byDate.get(l.date) ?? { km: 0, hm: 0, sets: 0 }
    if (s?.category === 'run' || l.distanceKm !== undefined) {
      e.km += l.distanceKm ?? s?.distanceKm ?? 0
      e.hm += l.elevationM ?? s?.elevationM ?? 0
    }
    if (s?.category === 'strength') e.sets += s.strengthSets ?? 0
    byDate.set(l.date, e)
  }
  return byDate
}

export function sumVolume(actual: Map<LocalDate, Volume>, from: LocalDate, to: LocalDate): Volume {
  const v = { km: 0, hm: 0, sets: 0 }
  for (const [d, e] of actual) {
    if (d < from || d > to) continue
    v.km += e.km
    v.hm += e.hm
    v.sets += e.sets
  }
  return { km: Math.round(v.km * 10) / 10, hm: Math.round(v.hm), sets: v.sets }
}

/** Geplanter Lauf-Umfang in einem Zeitraum (ohne optionale Einheiten und Rennen). */
export function plannedVolume(plan: Plan, from: LocalDate, to: LocalDate): Volume {
  const v = { km: 0, hm: 0, sets: 0 }
  for (const d of plan.days) {
    if (d.date < from || d.date > to) continue
    for (const s of d.sessions) {
      if (s.optional || s.type === 'race') continue
      if (s.category === 'run') {
        v.km += s.distanceKm ?? 0
        v.hm += s.elevationM ?? 0
      }
      if (s.category === 'strength') v.sets += s.strengthSets ?? 0
    }
  }
  return { km: Math.round(v.km * 10) / 10, hm: Math.round(v.hm), sets: v.sets }
}
