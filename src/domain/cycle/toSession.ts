import type { IntensityKey, ISODate, MuscleGroup, SportKey, TrainingSession } from '../types.ts';
import type { PlannedUnit, SessionKind } from './types.ts';
import { CATALOGUE } from './catalogue.ts';
import { formatClock } from './windows.ts';

/**
 * Turns a planned unit into a real session the athlete can log against.
 *
 * The planner works in abstract session kinds; the rest of the app works in
 * sports, intensities and durations. This is the one place that translation
 * happens, so the load model sees the same session the planner intended.
 */

interface Shape {
  sport: SportKey;
  intensity: IntensityKey;
  muscleGroups: MuscleGroup[];
  goal: string;
}

const SHAPE: Record<SessionKind, Shape> = {
  intense_run: {
    sport: 'run',
    intensity: 'vo2',
    muscleGroups: [],
    goal: 'Tempohärte und VO2max',
  },
  heavy_strength: {
    sport: 'strength',
    intensity: 'threshold',
    muscleGroups: ['legs_quads', 'legs_hamstrings', 'glutes', 'back', 'core'],
    goal: 'Maximalkraft in den Grundübungen',
  },
  long_run: {
    sport: 'run',
    intensity: 'easy',
    muscleGroups: [],
    goal: 'aerobe Grundlage und Ermüdungsresistenz',
  },
  moderate_strength: {
    sport: 'strength',
    intensity: 'moderate',
    muscleGroups: ['legs_quads', 'glutes', 'back', 'chest', 'core'],
    goal: 'Kraft erhalten bei moderater Ermüdung',
  },
  upper_strength: {
    sport: 'strength',
    intensity: 'moderate',
    muscleGroups: ['chest', 'back', 'shoulders', 'arms', 'core'],
    goal: 'Oberkörperkraft ohne Beinbelastung',
  },
  easy_run: {
    sport: 'run',
    intensity: 'easy',
    muscleGroups: [],
    goal: 'lockeres Grundlagenvolumen',
  },
  regeneration: {
    sport: 'recovery',
    intensity: 'recovery',
    muscleGroups: [],
    goal: 'Durchblutung ohne zusätzliche Last',
  },
};

export function shapeOf(kind: SessionKind): Shape {
  return SHAPE[kind];
}

/**
 * Builds the session record for a planned unit. The id and timestamps come from
 * the caller, because only it knows whether this replaces an existing session.
 */
export function sessionFromUnit(
  unit: PlannedUnit,
  ids: { id: string; createdAt: string; updatedAt: string },
): TrainingSession {
  const spec = CATALOGUE[unit.kind];
  const shape = SHAPE[unit.kind];
  return {
    id: ids.id,
    date: unit.date as ISODate,
    sport: shape.sport,
    title: spec.label,
    status: 'planned',
    startTime: formatClock(unit.start),
    plannedDurationMin: unit.durationMinutes,
    plannedIntensity: shape.intensity,
    muscleGroups: shape.muscleGroups,
    goal: shape.goal,
    notes: unit.reasons.join('\n'),
    source: 'manual',
    createdAt: ids.createdAt,
    updatedAt: ids.updatedAt,
  };
}
