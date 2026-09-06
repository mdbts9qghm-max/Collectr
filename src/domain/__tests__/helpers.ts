import type {
  DailyCheckIn,
  ISODate,
  IntensityKey,
  ShiftAssignment,
  SportKey,
  TrainingSession,
} from '../types.ts';
import { nowTimestamp } from '../date.ts';
import { defaultSettings, defaultShiftTypes } from '../../data/defaults.ts';

let counter = 0;

export function session(
  date: ISODate,
  sport: SportKey,
  minutes: number,
  intensity: IntensityKey = 'easy',
  extra: Partial<TrainingSession> = {},
): TrainingSession {
  return {
    id: `s${counter++}`,
    date,
    sport,
    title: `${sport} ${minutes}`,
    status: 'completed',
    plannedIntensity: intensity,
    plannedDurationMin: minutes,
    actualDurationMin: minutes,
    muscleGroups: [],
    source: 'manual',
    createdAt: nowTimestamp(),
    updatedAt: nowTimestamp(),
    ...extra,
  };
}

export function checkIn(date: ISODate, extra: Partial<DailyCheckIn> = {}): DailyCheckIn {
  return { date, source: 'manual', updatedAt: nowTimestamp(), ...extra };
}

export function shiftMaps(assignments: Record<ISODate, string>) {
  const types = new Map(defaultShiftTypes().map((t) => [t.id, t]));
  const map = new Map<ISODate, ShiftAssignment>(
    Object.entries(assignments).map(([date, shiftTypeId]) => [
      date,
      { date, shiftTypeId, source: 'manual' as const },
    ]),
  );
  return { types, assignments: map };
}

export const settings = defaultSettings();
