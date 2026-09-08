import type { ISODate, ShiftAssignment, ShiftType } from '../types.ts';
import type { CycleDayNumber, DayShape, PlannerSettings } from './types.ts';
import { addDays, dateRange } from '../date.ts';
import { buildDayShape } from './windows.ts';

/**
 * Derives the cycle position from the shifts the athlete already enters.
 *
 * Nothing extra has to be logged: the shift kind identifies the cycle day
 * directly, except for the two free days, which are told apart by their
 * position after the sleep day. A V-Schicht is an irregular replacement for
 * cycle day 5, not a fixed part of the rotation.
 */

export interface DetectedDay {
  date: ISODate;
  cycleDay: CycleDayNumber | null;
  isVShift: boolean;
  outOfRotation: DayShape['outOfRotation'];
  shiftKey: string | null;
}

function cycleDayFromShiftKey(key: string | null, previous: DetectedDay | undefined): {
  cycleDay: CycleDayNumber | null;
  isVShift: boolean;
  outOfRotation: DayShape['outOfRotation'];
} {
  switch (key) {
    case 'day':
      return { cycleDay: 1, isVShift: false, outOfRotation: null };
    case 'night':
      return { cycleDay: 2, isVShift: false, outOfRotation: null };
    case 'sleep_day':
      return { cycleDay: 3, isVShift: false, outOfRotation: null };
    case 'v_shift':
      // Replaces cycle day 5, wherever it falls.
      return { cycleDay: 5, isVShift: true, outOfRotation: null };
    case 'off': {
      // The first free day after the sleep day is cycle day 4, the second is 5.
      // A free day in any other position is treated as a day 4, because that is
      // the role it plays: the first recovered day of a block.
      const prev = previous?.cycleDay;
      if (prev === 4 && !previous?.isVShift) return { cycleDay: 5, isVShift: false, outOfRotation: null };
      return { cycleDay: 4, isVShift: false, outOfRotation: null };
    }
    case 'vacation':
      return { cycleDay: null, isVShift: false, outOfRotation: 'vacation' };
    case 'sick':
      return { cycleDay: null, isVShift: false, outOfRotation: 'sick' };
    default:
      return { cycleDay: null, isVShift: false, outOfRotation: 'unknown' };
  }
}

export function detectCycle(
  from: ISODate,
  to: ISODate,
  assignments: Map<ISODate, ShiftAssignment>,
  types: Map<string, ShiftType>,
): DetectedDay[] {
  // Look back a few days so the free-day numbering has context at the edge.
  const dates = dateRange(addDays(from, -4), to);
  const out: DetectedDay[] = [];

  for (const date of dates) {
    const assignment = assignments.get(date);
    const key = assignment ? (types.get(assignment.shiftTypeId)?.key ?? null) : null;
    const previous = out[out.length - 1];
    const { cycleDay, isVShift, outOfRotation } = cycleDayFromShiftKey(key, previous);
    out.push({ date, cycleDay, isVShift, outOfRotation, shiftKey: key });
  }

  return out.filter((d) => d.date >= from);
}

export function buildDayShapes(
  detected: DetectedDay[],
  settings: PlannerSettings,
  lookupAfter: (date: ISODate) => DetectedDay | undefined,
): DayShape[] {
  return detected.map((day) => {
    const next = lookupAfter(day.date);
    const followingIsDayShift = next?.cycleDay === 1;
    return buildDayShape(
      day.date,
      day.cycleDay,
      day.isVShift,
      followingIsDayShift,
      day.outOfRotation,
      settings,
    );
  });
}

/**
 * Groups detected days into cycles. A cycle starts on a day-shift day; days
 * before the first one form a partial leading cycle.
 */
export function groupIntoCycles(days: DetectedDay[]): DetectedDay[][] {
  const cycles: DetectedDay[][] = [];
  let current: DetectedDay[] = [];
  for (const day of days) {
    if (day.cycleDay === 1 && current.length > 0) {
      cycles.push(current);
      current = [];
    }
    current.push(day);
  }
  if (current.length > 0) cycles.push(current);
  return cycles;
}

/** Index of the cycle a date belongs to, counted from the first day shift. */
export function cycleIndexOf(days: DetectedDay[], date: ISODate): number {
  let index = 0;
  for (const day of days) {
    if (day.cycleDay === 1 && day.date !== days[0]?.date) index += 1;
    if (day.date === date) return index;
  }
  return index;
}
