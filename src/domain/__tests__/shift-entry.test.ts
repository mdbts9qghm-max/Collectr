import { describe, expect, it } from 'vitest';
import type { AppData } from '../../data/store.ts';
import type { ISODate } from '../types.ts';
import { buildCoach, buildIndexes } from '../../data/derived.ts';
import {
  defaultExercises,
  defaultHabits,
  defaultSettings,
  defaultShiftTypes,
  defaultTrainingPlan,
} from '../../data/defaults.ts';
import { addDays, today as todayIso } from '../date.ts';

/**
 * Eine von Hand eingetragene Schicht, und der Plan fügt sich ein.
 *
 * Der Plan hängt an der Schicht: sie bestimmt den Zyklustag, das Zeitfenster
 * und die Schichtlast. Wird sie geändert, muss sich die Planung des Tages
 * mitbewegen — sonst stünde eine Einheit in einem Fenster, das es an dem Tag
 * gar nicht gibt.
 */

const TODAY: ISODate = todayIso();
const MUSTER = ['shift_day', 'shift_night', 'shift_sleep_day', 'shift_off', 'shift_off'];

function data(overrides: AppData['shifts'] = {}): AppData {
  return {
    settings: {
      ...defaultSettings(),
      shiftRotation: MUSTER,
      shiftAnchor: { date: TODAY, index: 0 },
      trainingStart: addDays(TODAY, -30),
    },
    shiftTypes: defaultShiftTypes(),
    shifts: overrides,
    sessions: [],
    exercises: defaultExercises(),
    habits: defaultHabits(),
    habitEntries: [],
    goals: [],
    records: [],
    checkIns: {},
    reviews: {},
    plans: [defaultTrainingPlan()],
  };
}

function planWith(overrides: AppData['shifts'] = {}) {
  const d = data(overrides);
  return buildCoach(d, buildIndexes(d), TODAY);
}

function dayOf(plan: ReturnType<typeof planWith>, date: ISODate) {
  return plan.timeline.days.find((x) => x.date === date) ?? null;
}

/** Der erste künftige Tag, an dem der Rhythmus einen Lauf vorsieht. */
function lauftag(): ISODate {
  const plan = planWith();
  for (let i = 1; i <= 12; i++) {
    const date = addDays(TODAY, i);
    if (dayOf(plan, date)?.run) return date;
  }
  throw new Error('kein Lauftag im Blickfeld');
}

describe('eine eingetragene Schicht', () => {
  it('sticht den fortgeschriebenen Rhythmus an genau diesem Tag', () => {
    const date = addDays(TODAY, 3);
    const vorher = dayOf(planWith(), date);
    expect(vorher?.cycleDay).toBe(4);

    const nachher = dayOf(
      planWith({ [date]: { date, shiftTypeId: 'shift_night', source: 'manual' } }),
      date,
    );
    expect(nachher?.cycleDay).toBe(2);
  });

  it('nimmt dem Tag den Lauf, wenn daraus eine Tagschicht wird', () => {
    const date = lauftag();
    expect(dayOf(planWith(), date)?.run).toBeTruthy();

    // Tagschicht: zwölf Stunden Dienst, kein Trainingsfenster.
    const nachher = dayOf(
      planWith({ [date]: { date, shiftTypeId: 'shift_day', source: 'manual' } }),
      date,
    );
    expect(nachher?.run).toBeFalsy();
  });

  it('plant einen Tag ohne eingetragene Schicht nicht', () => {
    const date = addDays(TODAY, 3);
    const leer = dayOf(
      planWith({ [date]: { date, shiftTypeId: '', source: 'manual', cleared: true } }),
      date,
    );
    expect(leer?.cycleDay).toBeNull();
    expect(leer?.run).toBeFalsy();
  });

  it('trägt die V-Schicht als das ein, was sie ist: außer der Reihe', () => {
    const date = addDays(TODAY, 3);
    const tag = dayOf(planWith({ [date]: { date, shiftTypeId: 'shift_v', source: 'manual' } }), date);
    expect(tag?.isVShift).toBe(true);
  });

  /*
   * Zyklustage sind Positionen, keine Etiketten: die beiden freien Tage
   * unterscheiden sich nur dadurch, welcher nach dem Schlaftag der erste ist.
   * Wer einen Tag ändert, ändert damit auch die Rollen der Tage danach — das
   * ist richtig so, denn die Rotation hat sich dann wirklich verschoben. Der
   * Test hält fest, dass das passiert, damit es niemand für einen Fehler hält.
   */
  it('verschiebt die Rollen der folgenden Tage mit, wenn die Reihe sich ändert', () => {
    const date = addDays(TODAY, 3);
    const danach = addDays(TODAY, 4);
    expect(dayOf(planWith(), danach)?.cycleDay).toBe(5);
    const nachher = planWith({ [date]: { date, shiftTypeId: 'shift_v', source: 'manual' } });
    expect(nachher.timeline.days.find((x) => x.date === danach)?.cycleDay).toBe(4);
  });
});
