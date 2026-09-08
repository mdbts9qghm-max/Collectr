import type { IntensityKey, ISODate, MuscleGroup, SportKey, TrainingSession } from '../types.ts';
import type { SessionKind } from './catalogue.ts';
import type { StrengthPlan } from './strength.ts';
import type { TodayDecision } from './coach.ts';
import { CATALOGUE } from './catalogue.ts';
import { formatClock } from '../aerobic/windows.ts';

/**
 * Aus der Entscheidung des Coaches eine Einheit machen, die abgehakt werden kann.
 *
 * Der Coach denkt in Einheitenarten, der Rest der App in Sportart, Intensität
 * und Dauer. Diese Übersetzung passiert an genau einer Stelle, damit das
 * Belastungsmodell dieselbe Einheit sieht, die der Coach gemeint hat.
 */

interface Shape {
  sport: SportKey;
  intensity: IntensityKey;
  muscleGroups: MuscleGroup[];
  goal: string;
}

const SHAPE: Record<SessionKind, Shape> = {
  ruhe: { sport: 'recovery', intensity: 'recovery', muscleGroups: [], goal: 'Ruhetag' },
  gehen: {
    sport: 'run',
    intensity: 'recovery',
    muscleGroups: [],
    goal: 'Bewegung ohne Laufbelastung — die letzte Stufe vor Ruhe',
  },
  lockerer_lauf: { sport: 'run', intensity: 'easy', muscleGroups: [], goal: 'lockeres Grundlagenvolumen' },
  grundlagenlauf: { sport: 'run', intensity: 'easy', muscleGroups: [], goal: 'aerobe Grundlage in Zone 2' },
  longrun_verkuerzt: {
    sport: 'run',
    intensity: 'easy',
    muscleGroups: [],
    goal: 'langer Lauf in verkürzter Fassung',
  },
  longrun: {
    sport: 'run',
    intensity: 'easy',
    muscleGroups: [],
    goal: 'aerobe Grundlage und Ermüdungsresistenz',
  },
  intervall_kurz: { sport: 'run', intensity: 'threshold', muscleGroups: [], goal: 'Intervalle, verkürzt' },
  intervall: { sport: 'run', intensity: 'vo2', muscleGroups: [], goal: 'VO2max auf der Bahn' },
  kraft_leicht: {
    sport: 'mobility',
    intensity: 'recovery',
    muscleGroups: ['core', 'calves'],
    goal: 'Mobilität und Rumpfstabilität',
  },
  kraft_oberkoerper: {
    sport: 'strength',
    intensity: 'moderate',
    muscleGroups: ['chest', 'back', 'shoulders', 'arms', 'core'],
    goal: 'Oberkörperkraft ohne Beinbelastung',
  },
  kraft_ganzkoerper: {
    sport: 'strength',
    intensity: 'threshold',
    muscleGroups: ['legs_quads', 'legs_hamstrings', 'glutes', 'back', 'core'],
    goal: 'Kraft in den Grundübungen',
  },
};

export function shapeOf(kind: SessionKind): Shape {
  return SHAPE[kind];
}

/** Der Lauf des Tages. Null an einem Ruhetag — da gibt es nichts einzuplanen. */
export function sessionFromDecision(
  decision: TodayDecision,
  ids: { id: string; createdAt: string; updatedAt: string },
): TrainingSession | null {
  if (decision.kind === 'ruhe' || decision.minutes <= 0) return null;
  const shape = SHAPE[decision.kind];
  return {
    id: ids.id,
    date: decision.date as ISODate,
    sport: shape.sport,
    title: CATALOGUE[decision.kind].label,
    status: 'planned',
    startTime: decision.startMinutes != null ? formatClock(decision.startMinutes) : undefined,
    plannedDurationMin: decision.minutes,
    plannedIntensity: shape.intensity,
    muscleGroups: shape.muscleGroups,
    goal: shape.goal,
    notes: decision.steps.join('\n'),
    source: 'manual',
    createdAt: ids.createdAt,
    updatedAt: ids.updatedAt,
  };
}

/** Die Krafteinheit des Tages, mit der gerechneten Intensität in den Notizen. */
export function sessionFromStrength(
  date: ISODate,
  plan: StrengthPlan,
  ids: { id: string; createdAt: string; updatedAt: string },
): TrainingSession | null {
  if (!plan.kind) return null;
  const shape = SHAPE[plan.kind];
  return {
    id: ids.id,
    date,
    sport: shape.sport,
    title: CATALOGUE[plan.kind].label,
    status: 'planned',
    plannedDurationMin: plan.minutes,
    plannedIntensity: shape.intensity,
    muscleGroups: shape.muscleGroups,
    goal: shape.goal,
    notes: [
      `RPE ${plan.rpe}, rund ${plan.percentOfMax} % — ${plan.repsInReserve} Wiederholungen in Reserve.`,
      ...plan.blocks.map((b) => `${b.name}: ${b.sets} × ${b.reps}`),
    ].join('\n'),
    source: 'manual',
    createdAt: ids.createdAt,
    updatedAt: ids.updatedAt,
  };
}
