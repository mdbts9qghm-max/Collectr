import type { CycleDayNumber } from './recovery.ts';

const h = (hours: number, minutes = 0) => hours * 60 + minutes;

/**
 * Sleep and training windows per cycle day.
 *
 * **Hold the anchor.** Wake times sit between 05:30 and 07:00, bedtimes between
 * 21:45 and 22:45. A spread of at most 1.5 hours is what keeps the circadian
 * rhythm stable despite a rotation that walks through the week.
 *
 * **Extend before night duty.** 8:45 instead of 7:45. Sleep extension plus a
 * prophylactic nap are the two most effective countermeasures against
 * night-shift fatigue — more effective than anything done during the shift.
 *
 * **Later to bed on the sleep day.** After six hours of day sleep the evening
 * sleep pressure is low. The afternoon session is functionally wanted there: it
 * builds sleep pressure and stabilises the return to the night rhythm.
 */

export interface DayWindows {
  sleepStart: number;
  sleepEnd: number;
  sleepTargetMinutes: number;
  nap: { start: number; end: number } | null;
  /** When the next sleep of this day begins. The nap counts. */
  nextSleepStart: number;
  trainingWindow: { start: number; end: number } | null;
}

export function windowsFor(
  cycleDay: CycleDayNumber,
  dayShiftWakeMinutes: number,
): DayWindows {
  switch (cycleDay) {
    case 1:
      return {
        sleepStart: h(21, 45),
        sleepEnd: dayShiftWakeMinutes,
        sleepTargetMinutes: h(7, 45),
        nap: null,
        nextSleepStart: h(22, 15),
        trainingWindow: null,
      };
    case 2:
      return {
        sleepStart: h(22, 15),
        sleepEnd: h(7),
        sleepTargetMinutes: h(8, 45) + h(2, 30),
        nap: { start: h(15), end: h(17, 30) },
        nextSleepStart: h(15),
        trainingWindow: { start: h(9), end: h(13, 30) },
      };
    case 3:
      return {
        sleepStart: h(8),
        sleepEnd: h(14),
        sleepTargetMinutes: h(6),
        nap: null,
        nextSleepStart: h(22, 45),
        trainingWindow: { start: h(16), end: h(20) },
      };
    case 4:
      return {
        sleepStart: h(22, 45),
        sleepEnd: h(6, 45),
        sleepTargetMinutes: h(8),
        nap: null,
        nextSleepStart: h(22, 15),
        trainingWindow: { start: h(8), end: h(19) },
      };
    case 5:
      return {
        sleepStart: h(22, 15),
        sleepEnd: h(6, 30),
        sleepTargetMinutes: h(8, 15),
        nap: null,
        nextSleepStart: h(21, 45),
        trainingWindow: { start: h(8), end: h(19) },
      };
  }
}

/** The V-Schicht runs 08:00–20:00 and the run happens during the shift. */
export function vShiftWindows(): DayWindows {
  return {
    sleepStart: h(22, 15),
    sleepEnd: h(6, 15),
    sleepTargetMinutes: h(8),
    nap: null,
    nextSleepStart: h(21, 45),
    trainingWindow: { start: h(12), end: h(13) },
  };
}

export const CYCLE_DAY_META: Record<number, { short: string; label: string; shift: string }> = {
  1: { short: 'T1', label: 'Tagschicht', shift: '07:00–19:00' },
  2: { short: 'T2', label: 'Nachtschicht', shift: '19:00–07:00' },
  3: { short: 'T3', label: 'Schlaftag', shift: 'frei' },
  4: { short: 'T4', label: 'Frei', shift: 'frei' },
  5: { short: 'T5', label: 'Frei', shift: 'frei' },
};

export function formatClock(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}
