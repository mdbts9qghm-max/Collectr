import type {
  ClockTime,
  ISODate,
  ShiftAssignment,
  ShiftType,
} from './types.ts';
import { addDays, clockToMinutes, minutesToClock, windowDurationMinutes } from './date.ts';

export interface ShiftContext {
  date: ISODate;
  type: ShiftType | null;
  /** Yesterday's shift — a night shift casts a shadow on the next day. */
  previous: ShiftType | null;
  next: ShiftType | null;
  /** Minutes of training the shift allows before other limits apply. */
  availableMinutes: number;
  /** Suggested start time inside the shift's training window. */
  suggestedStart?: ClockTime;
}

export function shiftTypeFor(
  date: ISODate,
  assignments: Map<ISODate, ShiftAssignment>,
  types: Map<string, ShiftType>,
): ShiftType | null {
  const a = assignments.get(date);
  if (!a) return null;
  return types.get(a.shiftTypeId) ?? null;
}

export function buildShiftContext(
  date: ISODate,
  assignments: Map<ISODate, ShiftAssignment>,
  types: Map<string, ShiftType>,
): ShiftContext {
  const type = shiftTypeFor(date, assignments, types);
  const previous = shiftTypeFor(addDays(date, -1), assignments, types);
  const next = shiftTypeFor(addDays(date, 1), assignments, types);

  // With no shift assigned the app must not invent a restriction. It falls back
  // to a normal free day and the UI prompts the user to set the shift.
  const availableMinutes = type ? type.training.maxMinutes : 150;

  return {
    date,
    type,
    previous,
    next,
    availableMinutes,
    suggestedStart: type?.training.window?.start,
  };
}

/**
 * Reduces available training time when the day after is a night shift that
 * requires a pre-shift nap, or when the previous day ended with a night shift.
 */
export function adjustedTrainingMinutes(ctx: ShiftContext): number {
  let minutes = ctx.availableMinutes;
  if (ctx.previous?.key === 'night' && ctx.type?.key !== 'sleep_day') {
    minutes = Math.min(minutes, 60);
  }
  return minutes;
}

export function shiftWorkMinutes(type: ShiftType | null): number {
  if (!type?.work) return 0;
  return windowDurationMinutes(type.work.start, type.work.end);
}

export function shiftSleepMinutes(type: ShiftType | null): number {
  if (!type?.sleep) return 0;
  return windowDurationMinutes(type.sleep.start, type.sleep.end);
}

/**
 * Places a session of `durationMin` inside the shift's training window.
 *
 * A tight window (a pre-shift slot before a night shift) centres the session so
 * there is buffer on both sides. A wide window — a whole free day — starts at
 * the beginning instead, because "some time this morning" is more useful than a
 * precise time in the middle of the afternoon. Times are rounded to five
 * minutes; a suggestion of 13:02 looks like a calculation, not a plan.
 */
export function suggestStartTime(type: ShiftType | null, durationMin: number): ClockTime | undefined {
  const win = type?.training.window;
  if (!win) return undefined;
  const span = windowDurationMinutes(win.start, win.end);
  const start = clockToMinutes(win.start);
  if (durationMin >= span || span > durationMin * 2) return minutesToClock(roundTo5(start));
  const offset = Math.floor((span - durationMin) / 2);
  return minutesToClock(roundTo5(start + offset));
}

function roundTo5(minutes: number): number {
  return Math.round(minutes / 5) * 5;
}

/**
 * Fills a date range with a repeating rotation. Used by the shift planner so
 * the user does not have to tap 30 days one by one.
 */
export function applyRotation(
  from: ISODate,
  days: number,
  rotation: string[],
  startOffset = 0,
): ShiftAssignment[] {
  if (rotation.length === 0) return [];
  const out: ShiftAssignment[] = [];
  for (let i = 0; i < days; i++) {
    out.push({
      date: addDays(from, i),
      shiftTypeId: rotation[(i + startOffset) % rotation.length],
      source: 'manual',
    });
  }
  return out;
}

/** Counts each shift type across a range — feeds the weekly planning view. */
export function countShifts(
  dates: ISODate[],
  assignments: Map<ISODate, ShiftAssignment>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const d of dates) {
    const a = assignments.get(d);
    if (!a) continue;
    counts.set(a.shiftTypeId, (counts.get(a.shiftTypeId) ?? 0) + 1);
  }
  return counts;
}

/** Training days available in a range, weighted by how usable each shift is. */
export function trainingCapacityMinutes(
  dates: ISODate[],
  assignments: Map<ISODate, ShiftAssignment>,
  types: Map<string, ShiftType>,
): number {
  let total = 0;
  for (const d of dates) {
    const t = shiftTypeFor(d, assignments, types);
    total += t ? t.training.maxMinutes : 150;
  }
  return total;
}
