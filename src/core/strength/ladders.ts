// Progressionsleitern Calisthenics und Beinkraft (SPEC 5.5).
// Jede Stufe hat ein Arbeitsschema und ein Aufstiegskriterium. Aufgestiegen wird nur,
// wenn das Kriterium erfüllt ist (im Krafttest oder in mehreren Sessions in Folge).

import type { Ladder } from '../types'

export interface ExerciseTemplate {
  name: string
  sets: number
  reps?: number
  holdSec?: number
  perSide?: boolean
  restSec: number
  note?: string
}

export interface Criterion {
  description: string
  /** Anzahl Sätze, die die Vorgabe erreichen müssen. */
  sets?: number
  reps?: number
  holdSec?: number
  /** Ein einzelner Satz mit mindestens so vielen Wiederholungen. */
  maxReps?: number
  /** Höchstens diese Anstrengung (RPE 1–10), z. B. für die Beine. */
  rpeMax?: number
}

export interface LadderLevel {
  name: string
  exercises: ExerciseTemplate[]
  /** Kriterium, um diese Stufe zu verlassen (auf die nächste aufzusteigen). */
  criterion: Criterion
  final?: boolean
}

export interface LadderDef {
  id: Ladder
  name: string
  levels: LadderLevel[]
  /** Höchste Stufe, die ein Krafttest direkt einstufen kann. */
  testCeiling: number
}

export const LADDERS: Record<Ladder, LadderDef> = {
  pull: {
    id: 'pull',
    name: 'Klimmzug / Muscle-Up',
    testCeiling: 6,
    levels: [
      {
        name: 'Hängen + Scapula-Pulls',
        exercises: [
          { name: 'Aktives Hängen', sets: 3, holdSec: 20, restSec: 90 },
          { name: 'Scapula-Pulls', sets: 3, reps: 8, restSec: 90 },
        ],
        criterion: { description: '3 × 30 s aktives Hängen', sets: 3, holdSec: 30 },
      },
      {
        name: 'Australian Rows',
        exercises: [
          { name: 'Australian Rows', sets: 3, reps: 8, restSec: 90 },
          { name: 'Aktives Hängen', sets: 2, holdSec: 30, restSec: 60 },
        ],
        criterion: { description: '3 × 12 Australian Rows', sets: 3, reps: 12 },
      },
      {
        name: 'Negativ-Klimmzüge',
        exercises: [
          { name: 'Negativ-Klimmzüge (5 s absenken)', sets: 4, reps: 3, restSec: 120 },
          { name: 'Australian Rows', sets: 3, reps: 10, restSec: 90 },
        ],
        criterion: { description: '3 × 5 Negativ-Klimmzüge à 5 s', sets: 3, reps: 5 },
      },
      {
        name: 'Band-Klimmzüge',
        exercises: [
          { name: 'Klimmzüge mit Band', sets: 4, reps: 6, restSec: 120 },
          { name: 'Negativ-Klimmzüge (5 s absenken)', sets: 2, reps: 3, restSec: 120 },
        ],
        criterion: { description: '3 × 8 Klimmzüge mit leichtem Band', sets: 3, reps: 8 },
      },
      {
        name: 'Strikte Klimmzüge (Aufbau)',
        exercises: [
          { name: 'Strikte Klimmzüge', sets: 5, reps: 3, restSec: 150 },
          { name: 'Negativ-Klimmzüge (5 s absenken)', sets: 2, reps: 3, restSec: 120 },
        ],
        criterion: { description: '3 × 5 strikte Klimmzüge', sets: 3, reps: 5 },
      },
      {
        name: 'Strikte Klimmzüge (Volumen)',
        exercises: [
          { name: 'Strikte Klimmzüge', sets: 4, reps: 6, restSec: 150 },
          { name: 'Australian Rows (Füße erhöht)', sets: 2, reps: 10, restSec: 90 },
        ],
        criterion: { description: '1 Satz mit 10 sauberen Klimmzügen (und 10 Dips für den Aufstieg)', maxReps: 10 },
      },
      {
        name: 'Explosive Klimmzüge (bis Brust)',
        exercises: [
          { name: 'Explosive Klimmzüge bis zur Brust', sets: 5, reps: 3, restSec: 150 },
          { name: 'Strikte Klimmzüge', sets: 3, reps: 6, restSec: 120 },
        ],
        criterion: { description: '3 × 5 Klimmzüge bis zur Brust', sets: 3, reps: 5 },
      },
      {
        name: 'Übergang (Hüfthöhe, Band/tiefe Stange)',
        exercises: [
          { name: 'Explosive Klimmzüge bis zur Hüfte', sets: 5, reps: 3, restSec: 180 },
          { name: 'Übergang an tiefer Stange / mit Band', sets: 4, reps: 5, restSec: 120 },
          { name: 'Dips an der geraden Stange', sets: 3, reps: 6, restSec: 90 },
        ],
        criterion: { description: '3 × 3 explosive Klimmzüge bis zur Hüfte', sets: 3, reps: 3 },
      },
      {
        name: 'Muscle-Up',
        exercises: [
          { name: 'Muscle-Ups', sets: 5, reps: 2, restSec: 180, note: 'Nur saubere Wiederholungen' },
          { name: 'Explosive Klimmzüge bis zur Hüfte', sets: 3, reps: 3, restSec: 150 },
        ],
        criterion: { description: '3 × 3 Muscle-Ups', sets: 3, reps: 3 },
        final: true,
      },
    ],
  },
  push: {
    id: 'push',
    name: 'Dips / Drücken',
    testCeiling: 5,
    levels: [
      {
        name: 'Liegestütz erhöht / auf Knien',
        exercises: [{ name: 'Liegestütz erhöht', sets: 3, reps: 10, restSec: 90 }],
        criterion: { description: '3 × 12 erhöhte Liegestütz', sets: 3, reps: 12 },
      },
      {
        name: 'Liegestütz',
        exercises: [{ name: 'Liegestütz', sets: 3, reps: 10, restSec: 90 }],
        criterion: { description: '3 × 15 Liegestütz', sets: 3, reps: 15 },
      },
      {
        name: 'Stütz halten',
        exercises: [
          { name: 'Stütz am Barren', sets: 3, holdSec: 20, restSec: 90 },
          { name: 'Liegestütz', sets: 3, reps: 12, restSec: 90 },
        ],
        criterion: { description: '3 × 30 s Stütz', sets: 3, holdSec: 30 },
      },
      {
        name: 'Negativ-Dips',
        exercises: [
          { name: 'Negativ-Dips (5 s absenken)', sets: 4, reps: 4, restSec: 120 },
          { name: 'Stütz am Barren', sets: 2, holdSec: 30, restSec: 90 },
        ],
        criterion: { description: '3 × 5 Negativ-Dips', sets: 3, reps: 5 },
      },
      {
        name: 'Dips',
        exercises: [
          { name: 'Dips', sets: 4, reps: 5, restSec: 120 },
          { name: 'Liegestütz', sets: 2, reps: 15, restSec: 90 },
        ],
        criterion: { description: '1 Satz mit 10 Dips', maxReps: 10 },
      },
      {
        name: 'Dips mit Zusatzgewicht',
        exercises: [
          { name: 'Dips (ggf. mit 5–10 kg)', sets: 4, reps: 8, restSec: 150 },
          { name: 'Pike-Liegestütz', sets: 3, reps: 8, restSec: 90 },
        ],
        criterion: { description: '3 × 12 Dips', sets: 3, reps: 12 },
        final: true,
      },
    ],
  },
  front_lever: {
    id: 'front_lever',
    name: 'Front Lever',
    testCeiling: 4,
    levels: [
      {
        name: 'Hollow Body Hold',
        exercises: [{ name: 'Hollow Body Hold', sets: 3, holdSec: 20, restSec: 60 }],
        criterion: { description: '3 × 30 s Hollow Body Hold', sets: 3, holdSec: 30 },
      },
      {
        name: 'Tuck Front Lever',
        exercises: [
          { name: 'Tuck Front Lever', sets: 5, holdSec: 8, restSec: 120 },
          { name: 'Front-Lever-Rows (Tuck)', sets: 3, reps: 5, restSec: 90 },
        ],
        criterion: { description: '3 × 12 s Tuck Front Lever', sets: 3, holdSec: 12 },
      },
      {
        name: 'Advanced Tuck Front Lever',
        exercises: [
          { name: 'Advanced Tuck Front Lever', sets: 5, holdSec: 8, restSec: 120 },
          { name: 'Front-Lever-Negativ', sets: 3, reps: 3, restSec: 120 },
        ],
        criterion: { description: '3 × 10 s Advanced Tuck', sets: 3, holdSec: 10 },
      },
      {
        name: 'One Leg Front Lever',
        exercises: [{ name: 'One Leg Front Lever', sets: 5, holdSec: 6, restSec: 150 }],
        criterion: { description: '3 × 8 s One Leg', sets: 3, holdSec: 8 },
      },
      {
        name: 'Straddle Front Lever',
        exercises: [{ name: 'Straddle Front Lever', sets: 5, holdSec: 5, restSec: 180 }],
        criterion: { description: '3 × 8 s Straddle', sets: 3, holdSec: 8 },
        final: true,
      },
    ],
  },
  back_lever: {
    id: 'back_lever',
    name: 'Back Lever',
    testCeiling: 4,
    levels: [
      {
        name: 'German Hang',
        exercises: [{ name: 'German Hang (Schultern langsam gewöhnen)', sets: 3, holdSec: 15, restSec: 90 }],
        criterion: { description: '3 × 30 s German Hang', sets: 3, holdSec: 30 },
      },
      {
        name: 'Skin the Cat',
        exercises: [
          { name: 'Skin the Cat (kontrolliert)', sets: 3, reps: 3, restSec: 120 },
          { name: 'German Hang', sets: 2, holdSec: 20, restSec: 90 },
        ],
        criterion: { description: '3 × 5 Skin the Cat kontrolliert', sets: 3, reps: 5 },
      },
      {
        name: 'Tuck Back Lever',
        exercises: [{ name: 'Tuck Back Lever', sets: 5, holdSec: 8, restSec: 120 }],
        criterion: { description: '3 × 12 s Tuck Back Lever', sets: 3, holdSec: 12 },
      },
      {
        name: 'Advanced Tuck Back Lever',
        exercises: [{ name: 'Advanced Tuck Back Lever', sets: 5, holdSec: 8, restSec: 120 }],
        criterion: { description: '3 × 10 s Advanced Tuck', sets: 3, holdSec: 10 },
      },
      {
        name: 'One Leg Back Lever',
        exercises: [{ name: 'One Leg Back Lever', sets: 5, holdSec: 6, restSec: 150 }],
        criterion: { description: '3 × 8 s One Leg', sets: 3, holdSec: 8 },
        final: true,
      },
    ],
  },
  core: {
    id: 'core',
    name: 'Core',
    testCeiling: 1,
    levels: [
      {
        name: 'Hollow Body',
        exercises: [{ name: 'Hollow Body Hold', sets: 3, holdSec: 20, restSec: 60 }],
        criterion: { description: '3 × 30 s Hollow Body', sets: 3, holdSec: 30 },
      },
      {
        name: 'Hanging Knee Raises',
        exercises: [{ name: 'Hanging Knee Raises', sets: 3, reps: 8, restSec: 90 }],
        criterion: { description: '3 × 12 Hanging Knee Raises', sets: 3, reps: 12 },
      },
      {
        name: 'Hanging Leg Raises',
        exercises: [{ name: 'Hanging Leg Raises', sets: 3, reps: 6, restSec: 90 }],
        criterion: { description: '3 × 10 Hanging Leg Raises', sets: 3, reps: 10 },
      },
      {
        name: 'Tuck L-Sit',
        exercises: [{ name: 'Tuck L-Sit (Barren/Boden)', sets: 4, holdSec: 10, restSec: 90 }],
        criterion: { description: '3 × 20 s Tuck L-Sit', sets: 3, holdSec: 20 },
      },
      {
        name: 'L-Sit',
        exercises: [{ name: 'L-Sit', sets: 4, holdSec: 10, restSec: 120 }],
        criterion: { description: '3 × 15 s L-Sit', sets: 3, holdSec: 15 },
        final: true,
      },
    ],
  },
  legs: {
    id: 'legs',
    name: 'Beine (Trail-Robustheit)',
    testCeiling: 0,
    levels: [
      {
        name: 'Grundlagen',
        exercises: [
          { name: 'Goblet-Kniebeuge', sets: 3, reps: 10, restSec: 90 },
          { name: 'Split Squats', sets: 3, reps: 8, perSide: true, restSec: 90 },
          { name: 'Step-ups (Kasten kniehoch)', sets: 3, reps: 10, perSide: true, restSec: 60 },
          { name: 'Wadenheben', sets: 3, reps: 15, restSec: 60 },
          { name: 'Glute Bridge', sets: 3, reps: 12, restSec: 60 },
        ],
        criterion: { description: '2 Sessions: alle Sätze sauber mit RPE ≤ 7', sets: 3, reps: 10, rpeMax: 7 },
      },
      {
        name: 'Exzentrisch (Bergab)',
        exercises: [
          { name: 'Tempo-Kniebeuge (3 s absenken)', sets: 3, reps: 8, restSec: 120 },
          { name: 'Bulgarische Split Squats', sets: 3, reps: 8, perSide: true, restSec: 90 },
          { name: 'Step-downs (langsam)', sets: 3, reps: 10, perSide: true, restSec: 60 },
          { name: 'Nordic Curls (negativ)', sets: 3, reps: 4, restSec: 120 },
          { name: 'Wadenheben einbeinig', sets: 3, reps: 12, perSide: true, restSec: 60 },
        ],
        criterion: { description: '2 Sessions: 3 × 8 Tempo-Kniebeuge mit RPE ≤ 7', sets: 3, reps: 8, rpeMax: 7 },
      },
      {
        name: 'Kraft-Robustheit',
        exercises: [
          { name: 'Kniebeuge (Langhantel, RPE 7)', sets: 4, reps: 6, restSec: 150 },
          { name: 'Rumänisches Kreuzheben (moderat, RPE ≤ 7)', sets: 3, reps: 8, restSec: 120 },
          { name: 'Bulgarische Split Squats mit Kurzhanteln', sets: 3, reps: 8, perSide: true, restSec: 90 },
          { name: 'Step-downs mit Gewicht', sets: 3, reps: 10, perSide: true, restSec: 60 },
          { name: 'Nordic Curls', sets: 3, reps: 6, restSec: 120 },
          { name: 'Wadenheben einbeinig mit Gewicht', sets: 3, reps: 12, perSide: true, restSec: 60 },
        ],
        criterion: { description: 'Erhaltung', sets: 4, reps: 6, rpeMax: 7 },
        final: true,
      },
    ],
  },
}

export const LADDER_IDS: Ladder[] = ['pull', 'push', 'front_lever', 'back_lever', 'core', 'legs']

export function levelDef(ladder: Ladder, level: number): LadderLevel {
  const levels = LADDERS[ladder].levels
  return levels[Math.max(0, Math.min(level, levels.length - 1))]!
}

export function maxLevel(ladder: Ladder): number {
  return LADDERS[ladder].levels.length - 1
}
