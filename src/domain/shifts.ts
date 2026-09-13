import type {
  ClockTime,
  ISODate,
  ShiftAnchor,
  ShiftAssignment,
  ShiftType,
} from './types.ts';
import {
  addDays,
  clockToMinutes,
  dateRange,
  diffDays,
  isBefore,
  minutesToClock,
  windowDurationMinutes,
} from './date.ts';

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
 * Welche Stelle des Musters auf einen Tag fällt.
 *
 * Das Muster wiederholt sich ohne Ende, also ist die Stelle reine Modulorechnung
 * — und sie gilt in beide Richtungen, damit auch ein Tag vor dem Anker eine
 * Antwort hat, wenn jemand danach fragt.
 */
export function rotationIndexOn(date: ISODate, anchor: ShiftAnchor, length: number): number {
  if (length <= 0) return 0;
  const offset = diffDays(date, anchor.date) + anchor.index;
  return ((offset % length) + length) % length;
}

/**
 * Der Schichtplan, wie er sich aus dem Anker ergibt.
 *
 * Erst mit dieser Funktion hört der Kalender auf, am letzten eingetippten Tag
 * zu enden. Erzeugt wird nur ab dem Anker vorwärts: was davor liegt, ist
 * Vergangenheit und steht so, wie es eingetragen wurde — erfunden wird sie nicht.
 */
export function rotationAssignments(
  anchor: ShiftAnchor | null | undefined,
  rotation: string[],
  from: ISODate,
  to: ISODate,
): ShiftAssignment[] {
  if (!anchor || rotation.length === 0) return [];
  const start = isBefore(from, anchor.date) ? anchor.date : from;
  if (isBefore(to, start)) return [];
  return dateRange(start, to).map((date) => ({
    date,
    shiftTypeId: rotation[rotationIndexOn(date, anchor, rotation.length)],
    // 'derived' heißt: fortgeschrieben, nicht von Hand gesetzt. Die Oberfläche
    // unterscheidet daran, was sie als Ausnahme zeigen darf.
    source: 'derived' as const,
  }));
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
