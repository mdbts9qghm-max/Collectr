import { describe, expect, it } from 'vitest';
import type { AppData } from '../../data/store.ts';
import type { ISODate } from '../types.ts';
import { buildCoach, buildIndexes, planStartFor } from '../../data/derived.ts';
import {
  defaultExercises,
  defaultHabits,
  defaultSettings,
  defaultShiftTypes,
  defaultTrainingPlan,
} from '../../data/defaults.ts';
import { addDays, today as todayIso } from '../date.ts';

/**
 * Ab wann der Plan mit Woche 1 zählt.
 *
 * Vorher war das keine Angabe, sondern ein Nebeneffekt: gezählt wurde jeder
 * erkannte Zyklus des letzten Jahres. Wer Schichten nachtrug, sprang damit
 * ungewollt Wochen nach vorn — und mit der Woche wanderten Phase, Volumenziel,
 * Bahnstufe und Deload-Rhythmus mit.
 */

const TODAY: ISODate = todayIso();
const MUSTER = ['shift_day', 'shift_night', 'shift_sleep_day', 'shift_off', 'shift_off'];

function data(opts: { start?: ISODate | null; shiftsFrom?: number } = {}): AppData {
  const shifts: AppData['shifts'] = {};
  const from = opts.shiftsFrom ?? -60;
  for (let i = from; i <= 40; i++) {
    const date = addDays(TODAY, i);
    shifts[date] = {
      date,
      shiftTypeId: MUSTER[(((i % 5) + 5) % 5)],
      source: 'manual',
    };
  }
  return {
    settings: {
      ...defaultSettings(),
      shiftRotation: MUSTER,
      shiftAnchor: null,
      trainingStart: opts.start ?? null,
    },
    shiftTypes: defaultShiftTypes(),
    shifts,
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

/** Die Woche, die im Coach steht: am Kalender gezählt, ab 1. */
function weekOn(d: AppData): number {
  return buildCoach(d, buildIndexes(d), TODAY).planWeek;
}

/** Die Woche, mit der das Phasenmodell rechnet: je Makrozyklus, ab 0. */
function phaseWeekOn(d: AppData): number {
  return buildCoach(d, buildIndexes(d), TODAY).target.week;
}

describe('planStartFor', () => {
  it('nimmt die Einstellung, wenn es eine gibt', () => {
    const d = data({ start: addDays(TODAY, -30) });
    expect(planStartFor(d, buildIndexes(d), TODAY)).toBe(addDays(TODAY, -30));
  });

  it('fällt ohne Einstellung auf den ersten bekannten Schichttag zurück', () => {
    const d = data({ shiftsFrom: -45 });
    expect(planStartFor(d, buildIndexes(d), TODAY)).toBe(addDays(TODAY, -45));
  });

  it('schaut nicht weiter als ein Jahr zurück', () => {
    const d = data({ shiftsFrom: -60 });
    const alt = addDays(TODAY, -500);
    d.shifts[alt] = { date: alt, shiftTypeId: 'shift_day', source: 'manual' };
    expect(planStartFor(d, buildIndexes(d), TODAY)).toBe(addDays(TODAY, -60));
  });
});

describe('die Woche, in der der Plan steht', () => {
  it('folgt dem eingestellten Beginn', () => {
    // 70 Tage sind zehn volle Wochen, also die elfte; 21 Tage die vierte.
    expect(weekOn(data({ start: addDays(TODAY, -70) }))).toBe(11);
    expect(weekOn(data({ start: addDays(TODAY, -21) }))).toBe(4);
  });

  it('zählt am Kalender, nicht an eingetragenen Schichten', () => {
    /*
     * Der Fehler, den dieser Test festhält: gezählt wurden erkannte
     * Zyklusanfänge. Ein Planbeginn vor zehn Wochen ergab Woche 2, wenn nur
     * zwei Wochen Schichten erfasst waren — eine Lücke im Schichtplan fror den
     * Plan ein, statt ihn laufen zu lassen.
     */
    const start = addDays(TODAY, -70);
    expect(weekOn(data({ start, shiftsFrom: -14 }))).toBe(11);
    expect(weekOn(data({ start, shiftsFrom: -200 }))).toBe(11);
  });

  it('beginnt bei Woche 1, wenn der Plan heute anfängt', () => {
    expect(weekOn(data({ start: TODAY }))).toBe(1);
    expect(phaseWeekOn(data({ start: TODAY }))).toBe(0);
  });

  it('beginnt bei Woche 1, wenn der Beginn in der Zukunft liegt', () => {
    expect(weekOn(data({ start: addDays(TODAY, 10) }))).toBe(1);
    expect(phaseWeekOn(data({ start: addDays(TODAY, 10) }))).toBe(0);
  });

  it('hängt nicht mehr daran, wie viel Vergangenheit eingetragen ist', () => {
    // Derselbe Planbeginn, einmal mit 60 und einmal mit 200 Tagen Historie.
    const start = addDays(TODAY, -30);
    const kurz = data({ start, shiftsFrom: -60 });
    const lang = data({ start, shiftsFrom: -200 });
    expect(weekOn(kurz)).toBe(weekOn(lang));
  });

  it('springt genau am siebten Tag auf die nächste Woche', () => {
    expect(weekOn(data({ start: addDays(TODAY, -6) }))).toBe(1);
    expect(weekOn(data({ start: addDays(TODAY, -7) }))).toBe(2);
  });

  /*
   * Die Woche des Phasenmodells ist bewusst gröber: das Volumenziel steht je
   * Makrozyklus fest, also je zehn Tage. Sie darf der Kalenderwoche hinterher
   * hinken, aber nie vorauseilen — sonst stünde ein Phasenziel im Plan, das
   * nach dem Kalender noch gar nicht dran ist.
   */
  it('lässt die Phasenwoche der Kalenderwoche nie vorauseilen', () => {
    for (const tage of [0, 3, 7, 10, 21, 45, 70, 130, 300]) {
      const d = data({ start: addDays(TODAY, -tage), shiftsFrom: -400 });
      expect(phaseWeekOn(d) + 1).toBeLessThanOrEqual(weekOn(d));
    }
  });
});
