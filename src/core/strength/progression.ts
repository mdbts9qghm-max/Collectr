// Kraftprogression: Einstufung aus dem Krafttest, Aufstieg nur bei erfüllten Kriterien,
// Aufbau der Kraft-Einheiten mit Übungen, Sätzen, Wiederholungen/Haltezeiten und Pausen.

import { CONFIG } from '../config'
import type { ExercisePrescription, Ladder, Phase, SessionType, StrengthResult, StrengthState, StrengthTest } from '../types'
import { LADDER_IDS, LADDERS, levelDef, maxLevel, type Criterion } from './ladders'

const C = CONFIG.strength

function recordOf<T>(value: T): Record<Ladder, T> {
  return { pull: value, push: value, front_lever: value, back_lever: value, core: value, legs: value }
}

/** Startzustand für Anfänger (vor dem ersten Krafttest). */
export function initialStrengthState(): StrengthState {
  return {
    levels: { pull: 1, push: 1, front_lever: 0, back_lever: 0, core: 0, legs: 0 },
    streak: recordOf(0),
    sessionsAtLevel: recordOf(C.newLevelSessions),
  }
}

/**
 * Voraussetzungen, um eine Stufe betreten zu dürfen.
 * - Muscle-Up-Training (Zug ab Stufe 6) erst ab 10 Klimmzügen UND 10 Dips (Dips-Stufe ≥ 5).
 * - Front Lever ab Tuck: Negativ-Klimmzüge beherrscht (Zug ≥ 2).
 * - Back Lever ab Skin the Cat: Zug ≥ 2 und Stütz ≥ 2 (Schultergesundheit).
 * - Tuck L-Sit: Stütz ≥ 2.
 */
export function canEnterLevel(ladder: Ladder, level: number, levels: Record<Ladder, number>): boolean {
  if (level <= 0) return true
  switch (ladder) {
    case 'pull':
      return level < 6 || levels.push >= 5
    case 'front_lever':
      return levels.pull >= 2
    case 'back_lever':
      return levels.pull >= 2 && levels.push >= 2
    case 'core':
      return level < 3 || levels.push >= 2
    default:
      return true
  }
}

/** Ist das Kriterium einer Stufe mit diesem Ergebnis erfüllt? */
export function criterionMet(criterion: Criterion, result: StrengthResult): boolean {
  if (criterion.rpeMax !== undefined && (result.rpe === undefined || result.rpe > criterion.rpeMax)) return false
  if (criterion.maxReps !== undefined) return result.sets.some((s) => (s.reps ?? 0) >= criterion.maxReps!)
  const needed = criterion.sets ?? 1
  const good = result.sets.filter((s) => {
    if (criterion.reps !== undefined && (s.reps ?? 0) < criterion.reps) return false
    if (criterion.holdSec !== undefined && (s.holdSec ?? 0) < criterion.holdSec) return false
    return true
  })
  return good.length >= needed
}

export interface ProgressResult {
  state: StrengthState
  advanced: Ladder[]
  /** Kriterium erfüllt, aber Voraussetzung (z. B. 10 Dips für Muscle-Up) fehlt. */
  blocked: Ladder[]
}

/**
 * Wertet eine Kraft-Session aus. Aufstieg nur, wenn das Kriterium der aktuellen Stufe
 * in `sessionsToAdvance` Sessions in Folge erfüllt wurde und die Voraussetzungen stimmen.
 * Ergebnisse, die nicht zur aktuellen Stufe gehören, zählen nicht.
 */
export function evaluateSession(state: StrengthState, results: StrengthResult[]): ProgressResult {
  const next: StrengthState = {
    ...state,
    levels: { ...state.levels },
    streak: { ...state.streak },
    sessionsAtLevel: { ...state.sessionsAtLevel },
  }
  const advanced: Ladder[] = []
  const blocked: Ladder[] = []
  for (const r of results) {
    const lvl = next.levels[r.ladder]
    if (r.level !== lvl) continue
    const def = levelDef(r.ladder, lvl)
    next.sessionsAtLevel[r.ladder] += 1
    if (!criterionMet(def.criterion, r)) {
      next.streak[r.ladder] = 0
      continue
    }
    next.streak[r.ladder] += 1
    if (def.final || lvl >= maxLevel(r.ladder)) continue
    if (next.streak[r.ladder] < C.sessionsToAdvance) continue
    if (!canEnterLevel(r.ladder, lvl + 1, next.levels)) {
      blocked.push(r.ladder)
      continue
    }
    next.levels[r.ladder] = lvl + 1
    next.streak[r.ladder] = 0
    next.sessionsAtLevel[r.ladder] = 0
    advanced.push(r.ladder)
  }
  return { state: next, advanced, blocked }
}

/** Einstufung aus dem Krafttest (nur die testbaren Leitern). */
export function testLevels(test: StrengthTest): Partial<Record<Ladder, number>> {
  let pull: number
  if (test.maxPullups <= 0) {
    const hang = test.deadHangSec ?? 0
    const rows = test.maxAustralianRows ?? 0
    pull = hang >= 30 && rows >= 12 ? 2 : hang >= 30 || rows >= 8 ? 1 : 0
  } else if (test.maxPullups <= 2) pull = 3
  else if (test.maxPullups <= 4) pull = 4
  else if (test.maxPullups < C.muscleUpPrereq.pullups) pull = 5
  else pull = test.maxDips >= C.muscleUpPrereq.dips ? 6 : 5

  let push: number
  if (test.maxDips <= 0) {
    const pu = test.maxPushups ?? 10
    push = pu >= 15 ? 2 : pu >= 10 ? 1 : 0
  } else if (test.maxDips <= 4) push = 3
  else if (test.maxDips < C.muscleUpPrereq.dips) push = 4
  else push = 5

  const lever = (stage: number, holdSec: number, ladder: Ladder): number => {
    if (stage <= 0) return ladder === 'front_lever' ? (test.hollowHoldSec >= 30 ? 1 : 0) : holdSec >= 30 ? 1 : 0
    const def = levelDef(ladder, stage)
    const met = def.criterion.holdSec !== undefined && holdSec >= def.criterion.holdSec
    return Math.min(maxLevel(ladder), met ? stage + 1 : stage)
  }

  return {
    pull,
    push,
    front_lever: lever(test.frontLever.stage, test.frontLever.holdSec, 'front_lever'),
    back_lever: lever(test.backLever.stage, test.backLever.holdSec, 'back_lever'),
    core: test.hollowHoldSec >= 30 ? 1 : 0,
  }
}

/**
 * Wendet einen Krafttest an (alle 35 Tage bzw. im Onboarding). Die Ergebnisse steuern
 * die nächsten Stufen: Unterhalb der Test-Obergrenze gilt der Testwert (auf- oder abwärts),
 * an der Obergrenze bleibt eine höhere, per Session erreichte Stufe erhalten.
 * Voraussetzungen werden geprüft (sonst eine Stufe tiefer).
 */
export function applyStrengthTest(state: StrengthState, test: StrengthTest, opts: { onboarding?: boolean } = {}): StrengthState {
  const tl = testLevels(test)
  const levels = { ...state.levels }
  for (const ladder of LADDER_IDS) {
    const t = tl[ladder]
    if (t === undefined) continue
    const ceiling = LADDERS[ladder].testCeiling
    levels[ladder] = t >= ceiling ? Math.max(state.levels[ladder], ceiling) : t
  }
  // Voraussetzungen prüfen (mehrfach, weil Leitern voneinander abhängen).
  for (let pass = 0; pass < 3; pass++) {
    for (const ladder of LADDER_IDS) {
      while (levels[ladder] > 0 && !canEnterLevel(ladder, levels[ladder], levels)) levels[ladder] -= 1
    }
  }
  const sessionsAtLevel = { ...state.sessionsAtLevel }
  const streak = { ...state.streak }
  for (const ladder of LADDER_IDS) {
    if (levels[ladder] !== state.levels[ladder]) {
      sessionsAtLevel[ladder] = opts.onboarding ? C.newLevelSessions : 0
      streak[ladder] = 0
    }
  }
  return { levels, streak, sessionsAtLevel, lastTest: test }
}

/** Die aktuelle Stufe ist neu (erste Sessions nach dem Aufstieg). */
export function isNewLevel(state: StrengthState, ladder: Ladder): boolean {
  return state.levels[ladder] > 0 && state.sessionsAtLevel[ladder] < C.newLevelSessions
}

export interface StrengthSessionOptions {
  /** Schwere Sätze werden technische Sätze (Gelb, Vorausschau). */
  technique?: boolean
  /** Neue Skill-Stufe wird durch Training auf der vorherigen Stufe ersetzt. */
  avoidNewLevels?: boolean
}

export interface StrengthSessionContent {
  exercises: ExercisePrescription[]
  strengthSets: number
  containsNewLevel: boolean
  summary: string
}

interface LadderUse {
  ladder: Ladder
  /** Satzfaktor */
  volume: number
  /** Haltezeit-/Wiederholungsfaktor */
  intensity?: number
  /** Stufe relativ zur aktuellen (−1 = leichter) */
  levelOffset?: number
}

function laddersFor(type: SessionType, phase: Phase): LadderUse[] {
  const v = C.phaseVolume[phase]
  switch (type) {
    case 'calisthenics_main':
      if (phase === 'base')
        // Grundlage: Hauptfokus Kraft, Skills nur kurz.
        return [
          { ladder: 'pull', volume: v },
          { ladder: 'push', volume: v },
          { ladder: 'core', volume: v },
          { ladder: 'front_lever', volume: 0.6 * v },
          { ladder: 'back_lever', volume: 0.6 * v },
        ]
      return [
        { ladder: 'pull', volume: v },
        { ladder: 'push', volume: 0.8 * v },
        { ladder: 'front_lever', volume: v },
        { ladder: 'back_lever', volume: v },
        { ladder: 'core', volume: 0.8 * v },
      ]
    case 'calisthenics_maintenance':
      return [
        { ladder: 'pull', volume: 0.6 },
        { ladder: 'push', volume: 0.6 },
        { ladder: 'front_lever', volume: 0.5 },
        { ladder: 'core', volume: 0.6 },
      ]
    case 'skill_light':
      return [
        { ladder: 'front_lever', volume: 0.5, intensity: 0.7, levelOffset: -1 },
        { ladder: 'back_lever', volume: 0.5, intensity: 0.7, levelOffset: -1 },
        { ladder: 'core', volume: 0.5, intensity: 0.7, levelOffset: -1 },
      ]
    case 'legs_heavy':
      return [{ ladder: 'legs', volume: phase === 'specific' ? 0.7 : 1 }]
    case 'strength_short':
      return [
        { ladder: 'pull', volume: 0.5 },
        { ladder: 'push', volume: 0.5 },
        { ladder: 'core', volume: 0.5 },
      ]
    default:
      return []
  }
}

/**
 * Baut den Inhalt einer Kraft-Einheit aus dem aktuellen Kraftstand.
 * Für den Krafttest wird das Testprotokoll ausgegeben.
 */
export function buildStrengthSession(type: SessionType, state: StrengthState, phase: Phase, opts: StrengthSessionOptions = {}): StrengthSessionContent {
  if (type === 'strength_test') return strengthTestProtocol(state)
  if (type === 'mobility') return mobilityRoutine()
  const exercises: ExercisePrescription[] = []
  let containsNewLevel = false
  for (const use of laddersFor(type, phase)) {
    let level = Math.max(0, state.levels[use.ladder] + (use.levelOffset ?? 0))
    const isNew = (use.levelOffset ?? 0) >= 0 && isNewLevel(state, use.ladder)
    if (isNew && opts.avoidNewLevels) level = Math.max(0, level - 1)
    else if (isNew) containsNewLevel = true
    const def = levelDef(use.ladder, level)
    def.exercises.forEach((ex, i) => {
      // Nebenübungen bei reduziertem Volumen weglassen.
      if (i > 0 && use.volume < 0.6 && use.ladder !== 'legs') return
      let sets = Math.max(1, Math.round(ex.sets * use.volume))
      if (opts.technique) sets = Math.max(2, sets - 1)
      const intensity = (use.intensity ?? 1) * (opts.technique && use.ladder !== 'legs' ? 0.8 : 1)
      exercises.push({
        ladder: use.ladder,
        level,
        name: ex.name,
        sets,
        ...(ex.reps !== undefined ? { reps: Math.max(1, Math.round(ex.reps * intensity)) } : {}),
        ...(ex.holdSec !== undefined ? { holdSec: Math.max(3, Math.round(ex.holdSec * intensity)) } : {}),
        ...(ex.perSide ? { perSide: true } : {}),
        restSec: ex.restSec,
        ...(opts.technique
          ? { note: use.ladder === 'legs' ? 'Technik-Satz: ca. 60 % der Last, RPE ≤ 5' : 'Technik-Satz: sauber, weit weg vom Muskelversagen' }
          : ex.note
            ? { note: ex.note }
            : {}),
      })
    })
  }
  const strengthSets = exercises.reduce((a, e) => a + e.sets, 0)
  const summary = exercises.map((e) => e.name).join(', ')
  return { exercises, strengthSets, containsNewLevel, summary }
}

function strengthTestProtocol(state: StrengthState): StrengthSessionContent {
  const fl = levelDef('front_lever', state.levels.front_lever).name
  const bl = levelDef('back_lever', state.levels.back_lever).name
  const exercises: ExercisePrescription[] = [
    { name: 'Max. saubere Klimmzüge (ein Satz)', sets: 1, restSec: 300, note: 'Voller Hang, Kinn über die Stange, kein Schwung' },
    { name: 'Max. Dips (ein Satz)', sets: 1, restSec: 300, note: 'Schulter unter Ellbogenhöhe, volle Streckung' },
    { name: 'Hollow Body Hold (max. Zeit)', sets: 1, restSec: 180 },
    { name: `Front Lever: beste Stufe halten (aktuell ${fl})`, sets: 1, restSec: 240, note: 'Stufe und Haltezeit notieren' },
    { name: `Back Lever: beste Stufe halten (aktuell ${bl})`, sets: 1, restSec: 240, note: 'Stufe und Haltezeit notieren' },
  ]
  return { exercises, strengthSets: exercises.length, containsNewLevel: false, summary: 'Krafttest' }
}

function mobilityRoutine(): StrengthSessionContent {
  const exercises: ExercisePrescription[] = [
    { name: 'Hüftbeuger-Dehnung', sets: 2, holdSec: 45, perSide: true, restSec: 15 },
    { name: 'Waden an der Wand', sets: 2, holdSec: 45, perSide: true, restSec: 15 },
    { name: 'Brustwirbelsäule rotieren', sets: 2, reps: 8, perSide: true, restSec: 15 },
    { name: 'Schulter-Dislocates mit Band', sets: 2, reps: 10, restSec: 15 },
    { name: 'Tiefe Hocke halten', sets: 2, holdSec: 45, restSec: 15 },
  ]
  return { exercises, strengthSets: 0, containsNewLevel: false, summary: 'Mobility' }
}
