import { describe, expect, it } from 'vitest';
import type { AppData } from '../../data/store.ts';
import type { DailyCheckIn, ISODate } from '../types.ts';
import { buildCoach, buildIndexes } from '../../data/derived.ts';
import {
  defaultExercises,
  defaultHabits,
  defaultShiftTypes,
  defaultTrainingPlan,
} from '../../data/defaults.ts';
import { settings } from './helpers.ts';
import { addDays } from '../date.ts';

/**
 * Die Verdrahtung zwischen Schlafmodul und Coach.
 *
 * Diese Tests sitzen bewusst in der Datenschicht und nicht im reinen Planer:
 * gerissen ist beim Neuaufbau nicht die Rechnung, sondern die Leitung. Das
 * Schlafmodul rechnete korrekt weiter, und der Coach bekam das Ergebnis nie zu
 * sehen. Genau diese Leitung wird hier geprüft.
 */

const TODAY: ISODate = '2026-03-11';

/** Der Zyklustag, an dem ein Vorschlaf erwartet wird, ist der Nachtschichttag. */
const ROTATION = ['shift_day', 'shift_night', 'shift_sleep_day', 'shift_off', 'shift_off'];

function data(checkIns: Record<ISODate, DailyCheckIn> = {}): AppData {
  const shifts: AppData['shifts'] = {};
  for (let i = -40; i <= 40; i++) {
    const date = addDays(TODAY, i);
    shifts[date] = {
      date,
      shiftTypeId: ROTATION[(((i % 5) + 5) % 5)],
      source: 'manual',
    };
  }
  return {
    settings,
    shiftTypes: defaultShiftTypes(),
    shifts,
    sessions: [],
    exercises: defaultExercises(),
    habits: defaultHabits(),
    habitEntries: [],
    goals: [],
    records: [],
    checkIns,
    reviews: {},
    plans: [defaultTrainingPlan()],
  };
}

/** Der Tag, an dem der Vorschlaf ansteht — Zyklustag 2. */
function nightShiftDay(): ISODate {
  for (let i = 0; i < 5; i++) {
    const date = addDays(TODAY, i);
    if (ROTATION[(((i % 5) + 5) % 5)] === 'shift_night') return date;
  }
  throw new Error('kein Nachtschichttag in der Rotation');
}

function coachOn(date: ISODate, checkIns: Record<ISODate, DailyCheckIn> = {}) {
  const d = data(checkIns);
  return buildCoach(d, buildIndexes(d), date);
}

describe('Schlafmodul erreicht den Erholungswert', () => {
  it('zieht den ausgefallenen Vorschlaf vom Erholungswert ab', () => {
    const date = nightShiftDay();

    const withNap = coachOn(date, {
      [date]: { date, source: 'manual', updatedAt: '', sleepHours: 8.75, napTaken: true },
    });
    const withoutNap = coachOn(date, {
      [date]: { date, source: 'manual', updatedAt: '', sleepHours: 8.75, napTaken: false },
    });

    const before = withNap.timeline.days.find((d) => d.date === date)!.recovery;
    const after = withoutNap.timeline.days.find((d) => d.date === date)!.recovery;

    expect(after).toBeLessThan(before);
    expect(before - after).toBe(15);
  });

  it('lässt den Erholungswert unberührt, wenn der Vorschlaf genommen wurde', () => {
    const date = nightShiftDay();
    const taken = coachOn(date, {
      [date]: { date, source: 'manual', updatedAt: '', sleepHours: 8.75, napTaken: true },
    });
    const unknown = coachOn(date, {
      [date]: { date, source: 'manual', updatedAt: '', sleepHours: 8.75 },
    });
    const a = taken.timeline.days.find((d) => d.date === date)!.recovery;
    const b = unknown.timeline.days.find((d) => d.date === date)!.recovery;
    expect(a).toBe(b);
  });

  it('reicht die Schlafsignale überhaupt an den Planer weiter', () => {
    // Ohne Vorgeschichte gibt es keine Schuld — der Plan darf trotzdem stehen.
    const plan = coachOn(TODAY);
    expect(plan.today).toBeDefined();
    expect(plan.timeline.days.length).toBeGreaterThan(50);
  });
});
