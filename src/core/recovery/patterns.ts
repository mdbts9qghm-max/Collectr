// Gelernte Muster (SPEC 6.4): Wie reagieren Recovery und HRV auf Nachtschichten, lange Läufe und
// schweres Krafttraining? Verglichen wird mit Tagen derselben Tagesart ohne das Ereignis, damit
// z. B. der Schlaftag-Effekt der Nachtschicht nicht dem Beintraining (Tag 2) zugeschrieben wird.

import { CONFIG } from '../config'
import { effectiveShift, type ShiftCalendar } from '../shift'
import { addDays } from '../time'
import type { DayKind, LocalDate, PlannedSession, RecoveryDay, SessionLog } from '../types'

const P = CONFIG.recovery.patterns

export type PatternKey = 'night_shift' | 'long_run' | 'legs_heavy'

export interface PatternEffect {
  key: PatternKey
  label: string
  /** Mittlere Differenz der Recovery in Prozentpunkten (negativ = schlechter). */
  recoveryDelta?: number
  /** Mittlere Differenz der HRV in Prozent. */
  hrvDeltaPct?: number
  observations: number
  reliable: boolean
  sentence: string
}

export interface Patterns {
  daysWithData: number
  enoughData: boolean
  effects: PatternEffect[]
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : NaN)
const round = (x: number) => Math.round(x)

interface DayPoint {
  date: LocalDate
  kind: DayKind
  score?: number
  hrv?: number
}

/** Differenz der Tage mit Ereignis gegen Tage gleicher Tagesart ohne Ereignis. */
function effect(points: DayPoint[], affected: Set<LocalDate>, compareKind: (p: DayPoint) => DayKind): { rec?: number; hrv?: number; n: number } {
  const recDiffs: number[] = []
  const hrvDiffs: number[] = []
  for (const p of points.filter((x) => affected.has(x.date))) {
    const peers = points.filter((x) => !affected.has(x.date) && x.kind === compareKind(p))
    if (p.score !== undefined) {
      const base = mean(peers.filter((x) => x.score !== undefined).map((x) => x.score!))
      if (Number.isFinite(base)) recDiffs.push(p.score - base)
    }
    if (p.hrv !== undefined) {
      const base = mean(peers.filter((x) => x.hrv !== undefined).map((x) => x.hrv!))
      if (Number.isFinite(base) && base > 0) hrvDiffs.push(((p.hrv - base) / base) * 100)
    }
  }
  return {
    ...(recDiffs.length ? { rec: mean(recDiffs) } : {}),
    ...(hrvDiffs.length ? { hrv: mean(hrvDiffs) } : {}),
    n: Math.max(recDiffs.length, hrvDiffs.length),
  }
}

function sentenceFor(label: string, rec: number | undefined, hrv: number | undefined, n: number, reliable: boolean): string {
  if (n === 0) return `${label}: noch keine Beobachtungen.`
  const parts: string[] = []
  if (rec !== undefined) parts.push(`Recovery im Schnitt ${Math.abs(round(rec))} Punkte ${rec < 0 ? 'niedriger' : 'höher'}`)
  if (hrv !== undefined) parts.push(`HRV ${Math.abs(round(hrv))} % ${hrv < 0 ? 'niedriger' : 'höher'}`)
  return `${label}: ${parts.join(', ')} (${n} Beobachtung${n === 1 ? '' : 'en'}${reliable ? '' : ', noch wenig aussagekräftig'}).`
}

export function learnPatterns(input: {
  cal: ShiftCalendar
  days: readonly RecoveryDay[]
  logs: readonly SessionLog[]
  sessionsById: ReadonlyMap<string, PlannedSession>
}): Patterns {
  const points: DayPoint[] = input.days
    .filter((d) => d.recoveryScore !== undefined || d.hrvMs !== undefined)
    .map((d) => ({
      date: d.date,
      kind: effectiveShift(input.cal, d.date).dayKind,
      ...(d.recoveryScore !== undefined ? { score: d.recoveryScore } : {}),
      ...(d.hrvMs !== undefined ? { hrv: d.hrvMs } : {}),
    }))
  const done = input.logs.filter((l) => l.status === 'done')
  const longRunDays = new Set<LocalDate>()
  const legsDays = new Set<LocalDate>()
  for (const l of done) {
    const s = input.sessionsById.get(l.sessionId)
    if (!s) continue
    const km = l.distanceKm ?? s.distanceKm ?? 0
    if (s.category === 'run' && (km >= P.longRunMinKm || ['long_run', 'b2b_1', 'b2b_2', 'night_run', 'mountain_day'].includes(s.type))) longRunDays.add(addDays(l.date, 1))
    if (s.type === 'legs_heavy') legsDays.add(addDays(l.date, 1))
  }
  // Nachtschicht: Schlaftag gegen freie Tage
  const sleepDays = new Set(points.filter((p) => p.kind === 'sleep_day').map((p) => p.date))
  const night = effect(points, sleepDays, () => 'free')
  const long = effect(points, longRunDays, (p) => p.kind)
  const legs = effect(points, legsDays, (p) => p.kind)
  const mk = (key: PatternKey, label: string, e: { rec?: number; hrv?: number; n: number }): PatternEffect => {
    const reliable = e.n >= P.minObservations
    return {
      key,
      label,
      ...(e.rec !== undefined ? { recoveryDelta: round(e.rec) } : {}),
      ...(e.hrv !== undefined ? { hrvDeltaPct: round(e.hrv) } : {}),
      observations: e.n,
      reliable,
      sentence: sentenceFor(label, e.rec, e.hrv, e.n, reliable),
    }
  }
  return {
    daysWithData: points.length,
    enoughData: points.length >= P.minDays,
    effects: [mk('night_shift', 'Nach Nachtschichten', night), mk('long_run', 'Nach langen Läufen', long), mk('legs_heavy', 'Nach schwerem Beintraining', legs)],
  }
}

/**
 * Erwarteter Recovery-Abfall (Prozentpunkte) vor einer kommenden Schlüsseleinheit, für die Vorausschau.
 * Nur mit genügend Daten und aussagekräftigen Effekten.
 */
export function expectedDrop(patterns: Patterns, opts: { nightShiftBetween: boolean; longRunBetween: boolean }): number {
  if (!patterns.enoughData) return 0
  let drop = 0
  for (const e of patterns.effects) {
    if (!e.reliable || e.recoveryDelta === undefined || e.recoveryDelta >= 0) continue
    if (e.key === 'night_shift' && opts.nightShiftBetween) drop = Math.max(drop, -e.recoveryDelta)
    if (e.key === 'long_run' && opts.longRunBetween) drop = Math.max(drop, -e.recoveryDelta)
  }
  return drop
}
