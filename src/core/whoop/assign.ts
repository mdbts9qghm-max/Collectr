// WHOOP-Zuordnung (SPEC 8): Schlaf und Recovery werden über WHOOP-Zyklen bzw. den
// Hauptschlaf dem richtigen Trainingstag zugeordnet, nicht über Kalendertage. Nach der
// Nachtschicht liegt der Hauptschlaf am Tag (08:00–14:00) und gehört zum Schlaftag.
// Reine Funktionen; der HTTP-Abruf folgt in Phase 5 (Edge Functions).

import { CONFIG } from '../config'
import type { ShiftCalendar } from '../shift'
import { trainingWindow } from '../shift'
import { addDays, berlinToInstant, instantToBerlin } from '../time'
import type { LocalDate, PlanDay, RecoveryDay, SessionCategory, SessionLog } from '../types'

const W = CONFIG.whoop

/** Normalisierte WHOOP-Daten (Abbildung der API-v2-Antworten folgt in Phase 5). */
export interface WhoopSleep {
  id: string
  cycleId?: number
  /** ISO-Zeitpunkte (UTC) */
  start: string
  end: string
  nap: boolean
  /** Tatsächlich geschlafen (ohne Wachphasen). */
  asleepMin?: number
  performancePct?: number
  efficiencyPct?: number
  needMin?: number
  debtMin?: number
}

export interface WhoopRecovery {
  cycleId: number
  sleepId?: string
  score?: number
  hrvMs?: number
  restingHr?: number
  spo2?: number
}

export interface WhoopCycle {
  id: number
  start: string
  end?: string
  strain?: number
}

export interface WhoopWorkout {
  id: string
  start: string
  end: string
  sportName: string
  strain?: number
  distanceM?: number
  altitudeGainM?: number
  avgHr?: number
  /** Minuten in HF-Zone 0–5 */
  zoneDurationsMin?: number[]
}

export interface WhoopData {
  sleeps: readonly WhoopSleep[]
  recoveries: readonly WhoopRecovery[]
  cycles?: readonly WhoopCycle[]
}

const ms = (iso: string) => Date.parse(iso)

/** Bezugszeitpunkt eines Trainingstags: Beginn des Trainingsfensters (sonst 12:00). */
export function referenceInstant(cal: ShiftCalendar, date: LocalDate): number {
  const w = trainingWindow(cal, date)
  return berlinToInstant(date, w ? w.start : W.fallbackReferenceMin)
}

/**
 * Letzter Hauptschlaf, der vor dem Trainingsfenster begann und nicht veraltet ist. Er darf über den
 * Fensterbeginn hinausgehen (Ausschlafen an freien Tagen).
 */
export function mainSleepFor(cal: ShiftCalendar, date: LocalDate, sleeps: readonly WhoopSleep[]): WhoopSleep | undefined {
  const ref = referenceInstant(cal, date)
  const minEnd = ref - W.maxSleepAgeHours * 3_600_000
  return sleeps
    .filter((s) => !s.nap && ms(s.start) < ref && ms(s.end) >= minEnd)
    .sort((a, b) => ms(b.end) - ms(a.end))[0]
}

/**
 * Erholungsdaten eines Trainingstags. undefined, wenn kein passender Hauptschlaf vorliegt
 * (die App fordert dann die manuelle Eingabe an).
 */
export function assignRecoveryDay(cal: ShiftCalendar, date: LocalDate, data: WhoopData): RecoveryDay | undefined {
  const main = mainSleepFor(cal, date, data.sleeps)
  if (!main) return undefined
  const ref = referenceInstant(cal, date)
  const recovery =
    data.recoveries.find((r) => r.sleepId !== undefined && r.sleepId === main.id) ??
    (main.cycleId !== undefined ? data.recoveries.find((r) => r.cycleId === main.cycleId) : undefined)
  const napMin = data.sleeps
    .filter((s) => s.nap && ms(s.start) >= ms(main.end) && ms(s.end) <= ref)
    .reduce((a, s) => a + (s.asleepMin ?? (ms(s.end) - ms(s.start)) / 60000), 0)
  const prevCycle = (data.cycles ?? [])
    .filter((c) => c.end !== undefined && ms(c.end) <= ms(main.start) + 3_600_000)
    .sort((a, b) => ms(b.end!) - ms(a.end!))[0]
  const start = instantToBerlin(main.start)
  const end = instantToBerlin(main.end)
  const durationMin = main.asleepMin ?? Math.round((ms(main.end) - ms(main.start)) / 60000)
  return {
    date,
    source: 'whoop',
    ...(recovery?.score !== undefined ? { recoveryScore: recovery.score } : {}),
    ...(recovery?.hrvMs !== undefined ? { hrvMs: recovery.hrvMs } : {}),
    ...(recovery?.restingHr !== undefined ? { restingHr: recovery.restingHr } : {}),
    ...(recovery?.spo2 !== undefined ? { spo2: recovery.spo2 } : {}),
    ...(prevCycle?.strain !== undefined ? { strainPrevDay: prevCycle.strain } : {}),
    sleep: {
      durationMin,
      ...(napMin > 0 ? { napMin: Math.round(napMin) } : {}),
      ...(main.performancePct !== undefined ? { performancePct: main.performancePct } : {}),
      ...(main.efficiencyPct !== undefined ? { efficiencyPct: main.efficiencyPct } : {}),
      ...(main.needMin !== undefined ? { needMin: main.needMin } : {}),
      ...(main.debtMin !== undefined ? { debtMin: main.debtMin } : {}),
      // Hauptschlaf beginnt morgens (nach der Nachtschicht) → Tagschlaf
      daySleep: start.minutes >= W.daySleepStartFrom && start.minutes < W.daySleepStartTo,
      start,
      end,
    },
  }
}

// ---------------------------------------------------------------------------
// Workouts → geplante Einheiten
// ---------------------------------------------------------------------------

export function sportCategory(sportName: string): SessionCategory | undefined {
  const n = sportName.toLowerCase()
  if (W.strengthSports.some((k) => n.includes(k))) return 'strength'
  if (W.mobilitySports.some((k) => n.includes(k))) return 'mobility'
  if (W.runSports.some((k) => n.includes(k))) return 'run'
  return undefined
}

export interface WorkoutMatch {
  workoutId: string
  sessionId: string | null
  confidence: 'auto' | 'suggested' | 'manual' | 'none'
}

/**
 * Ordnet Workouts den geplanten Einheiten zu: gleicher Trainingstag (Nachtläufe nach Mitternacht
 * zählen zum Vortag), passende Sportart, bei mehreren Kandidaten die nächstliegende Startzeit.
 * Manuelle Korrekturen haben Vorrang.
 */
export function matchWorkouts(
  workouts: readonly WhoopWorkout[],
  days: readonly PlanDay[],
  corrections: Readonly<Record<string, string | null>> = {},
): WorkoutMatch[] {
  const byDate = new Map(days.map((d) => [d.date, d]))
  const used = new Set<string>(Object.values(corrections).filter((v): v is string => v !== null))
  const out: WorkoutMatch[] = []
  for (const w of [...workouts].sort((a, b) => ms(a.start) - ms(b.start))) {
    if (w.id in corrections) {
      out.push({ workoutId: w.id, sessionId: corrections[w.id] ?? null, confidence: 'manual' })
      continue
    }
    const local = instantToBerlin(w.start)
    let day = byDate.get(local.date)
    const prev = byDate.get(addDays(local.date, -1))
    if (local.minutes < W.nightRunCarryoverUntil && prev?.sessions.some((s) => s.type === 'night_run')) day = prev
    const cat = sportCategory(w.sportName)
    const candidates = (day?.sessions ?? []).filter((s) => !used.has(s.id) && (cat === undefined || s.category === cat || (cat === 'mobility' && s.type === 'skill_light')))
    if (candidates.length === 0) {
      out.push({ workoutId: w.id, sessionId: null, confidence: 'none' })
      continue
    }
    const startMin = day!.date === local.date ? local.minutes : local.minutes + 1440
    const best = [...candidates].sort((a, b) => Math.abs((a.startMin ?? startMin) - startMin) - Math.abs((b.startMin ?? startMin) - startMin))[0]!
    used.add(best.id)
    out.push({ workoutId: w.id, sessionId: best.id, confidence: candidates.length === 1 && cat !== undefined ? 'auto' : 'suggested' })
  }
  return out
}

/** Ist-Werte aus einem Workout als Protokoll-Eintrag. */
export function workoutToLog(w: WhoopWorkout, sessionId: string, date: LocalDate): SessionLog {
  return {
    sessionId,
    date,
    status: 'done',
    whoopWorkoutId: w.id,
    durationMin: Math.round((ms(w.end) - ms(w.start)) / 60000),
    ...(w.distanceM !== undefined ? { distanceKm: Math.round(w.distanceM / 100) / 10 } : {}),
    ...(w.altitudeGainM !== undefined ? { elevationM: Math.round(w.altitudeGainM) } : {}),
    ...(w.strain !== undefined ? { strain: w.strain } : {}),
  }
}
