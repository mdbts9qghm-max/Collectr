import type { CycleDayNumber, DayShape, PlannerSettings, Window } from './types.ts';

const h = (hours: number, minutes = 0) => hours * 60 + minutes;

/**
 * Sleep and training windows per cycle day.
 *
 * The reasoning behind the times, because it is not obvious from the numbers:
 *
 * **Anchor principle.** Wake times sit between 05:30 and 07:00, bedtimes between
 * 21:45 and 22:45. That spread of roughly 1.5 h is what keeps the circadian
 * rhythm stable despite the rotation — a wider swing would not.
 *
 * **Cycle day 1 → 2.** Sleep before the night shift is deliberately extended,
 * 8:45 instead of 7:45. Sleep extension before a night shift plus a prophylactic
 * nap are the two most effective measures against night-shift fatigue.
 *
 * **Cycle day 2.** Training sits *before* the nap and ends by 13:30 at the
 * latest, leaving at least 90 minutes of buffer so falling asleep at 15:00
 * actually works. The morning is a circadian performance trough, which is why
 * this day never carries maximum intensity.
 *
 * **Cycle day 3.** After six hours of day sleep, sleep pressure in the evening
 * is low, so bedtime moves back to 22:45. Afternoon training is functionally
 * wanted here: it builds sleep pressure and stabilises the return to night
 * sleep. It still has to end by 20:00.
 *
 * **Cycle day 5 → 1.** Bedtime moves forward to 21:45 to absorb the 05:30 wake
 * on the day-shift day.
 */

interface CycleDayShape {
  sleepStart: number;
  sleepEnd: number;
  nap: Window | null;
  /** Bedtime — or nap — that begins the next sleep after this day's window. */
  nextSleepStart: number;
  trainingWindow: Window | null;
}

/** The table for a normal cycle. The V-Schicht variant is handled separately. */
export function cycleDayShape(
  cycleDay: CycleDayNumber,
  settings: PlannerSettings,
): CycleDayShape {
  switch (cycleDay) {
    case 1:
      // Day shift 07:00–19:00. No window at all: the day is a rest day, and it
      // is what satisfies the "one zero-load day per rolling week" rule.
      return {
        sleepStart: h(21, 45),
        sleepEnd: settings.dayShiftWakeMinutes,
        nap: null,
        nextSleepStart: h(22, 15),
        trainingWindow: null,
      };
    case 2:
      // Night shift 19:00–07:00, preceded by the nap.
      return {
        sleepStart: h(22, 15),
        sleepEnd: h(7),
        nap: { start: h(15), end: h(17, 30) },
        nextSleepStart: h(15),
        trainingWindow: { start: h(9), end: h(13, 30) },
      };
    case 3:
      // Sleep day after the night shift: six hours of day sleep, REM-poor.
      return {
        sleepStart: h(8),
        sleepEnd: h(14),
        nap: null,
        nextSleepStart: h(22, 45),
        trainingWindow: { start: h(16), end: h(20) },
      };
    case 4:
      return {
        sleepStart: h(22, 45),
        sleepEnd: h(6, 45),
        nap: null,
        nextSleepStart: h(22, 15),
        trainingWindow: { start: h(8), end: h(19) },
      };
    case 5:
      return {
        sleepStart: h(22, 15),
        sleepEnd: h(6, 30),
        nap: null,
        nextSleepStart: h(21, 45),
        trainingWindow: { start: h(8), end: h(19) },
      };
  }
}

/**
 * V-Schicht, 08:00–20:00, replacing cycle day 5.
 *
 * The evening window after the shift (20:15–21:30) collides with bedtime: only
 * minutes would remain between finishing and falling asleep, which lengthens
 * sleep latency considerably. The morning slot is therefore the default, and
 * the evening is only allowed when the following day is not a day shift.
 */
export function vShiftShape(followingIsDayShift: boolean, settings: PlannerSettings): CycleDayShape {
  const morning: Window = { start: h(6, 15), end: h(7, 15) };
  const evening: Window = { start: h(20, 15), end: h(21) };
  const eveningAllowed = !followingIsDayShift;
  const preferEvening = settings.vShiftWindow === 'evening' && eveningAllowed;

  return {
    sleepStart: h(22, 15),
    sleepEnd: h(6),
    nap: null,
    nextSleepStart: h(21, 45),
    trainingWindow: preferEvening ? evening : morning,
  };
}

export function vShiftAlternativeWindow(followingIsDayShift: boolean, settings: PlannerSettings): Window | null {
  if (followingIsDayShift) return null;
  const morning: Window = { start: h(6, 15), end: h(7, 15) };
  const evening: Window = { start: h(20, 15), end: h(21) };
  return settings.vShiftWindow === 'evening' ? morning : evening;
}

/** Target sleep in minutes, used by the "1 h below target" recovery penalty. */
export function sleepTargetMinutes(shape: CycleDayShape): number {
  const night = shape.sleepEnd >= shape.sleepStart
    ? shape.sleepEnd - shape.sleepStart
    : 24 * 60 - shape.sleepStart + shape.sleepEnd;
  const nap = shape.nap ? shape.nap.end - shape.nap.start : 0;
  return night + nap;
}

/** Highest load a day may carry: doubles are capped at 105 by the rules. */
export function maxLoadForDay(cycleDay: CycleDayNumber | null, isVShift: boolean): number {
  if (cycleDay === null) return 105;
  if (cycleDay === 1) return 0;
  if (isVShift) return 25; // only an easy run fits the V-Schicht window
  if (cycleDay === 4 || cycleDay === 5) return 105;
  return 80;
}

export function buildDayShape(
  date: string,
  cycleDay: CycleDayNumber | null,
  isVShift: boolean,
  followingIsDayShift: boolean,
  outOfRotation: DayShape['outOfRotation'],
  settings: PlannerSettings,
): DayShape {
  if (outOfRotation === 'sick') {
    return {
      date,
      cycleDay,
      isVShift,
      outOfRotation,
      sleep: { start: h(22), end: h(7), targetMinutes: 9 * 60 },
      nap: null,
      nextSleepStart: h(22),
      trainingWindow: null,
      alternativeWindow: null,
      maxLoad: 0,
    };
  }

  if (cycleDay === null) {
    // Outside the rotation — holiday, or a shift the app does not know. Treat it
    // as a generous free day rather than inventing constraints.
    return {
      date,
      cycleDay,
      isVShift,
      outOfRotation,
      sleep: { start: h(22, 45), end: h(7), targetMinutes: h(8, 15) },
      nap: null,
      nextSleepStart: h(22, 45),
      trainingWindow: { start: h(8), end: h(19) },
      alternativeWindow: null,
      maxLoad: 105,
    };
  }

  const shape = isVShift ? vShiftShape(followingIsDayShift, settings) : cycleDayShape(cycleDay, settings);

  return {
    date,
    cycleDay,
    isVShift,
    outOfRotation,
    sleep: {
      start: shape.sleepStart,
      end: shape.sleepEnd,
      targetMinutes: sleepTargetMinutes(shape),
    },
    nap: shape.nap,
    nextSleepStart: shape.nextSleepStart,
    trainingWindow: shape.trainingWindow,
    alternativeWindow: isVShift ? vShiftAlternativeWindow(followingIsDayShift, settings) : null,
    maxLoad: maxLoadForDay(cycleDay, isVShift),
  };
}

export function formatClock(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
