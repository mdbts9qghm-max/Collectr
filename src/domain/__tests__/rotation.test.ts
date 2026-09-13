import { describe, expect, it } from 'vitest';
import type { AppData } from '../../data/store.ts';
import type { ISODate, ShiftAnchor } from '../types.ts';
import { buildIndexes, shiftTypeOn } from '../../data/derived.ts';
import {
  defaultExercises,
  defaultHabits,
  defaultSettings,
  defaultShiftTypes,
  defaultTrainingPlan,
} from '../../data/defaults.ts';
import { rotationAssignments, rotationIndexOn } from '../shifts.ts';
import { addDays, today as todayIso } from '../date.ts';

/**
 * Der Schichtrhythmus schreibt sich selbst fort.
 *
 * Vorher endete der Kalender am letzten von Hand eingetragenen Tag — dahinter
 * sah der Coach keine Schicht, also auch keine Schichtlast, und plante ins
 * Leere. Hier steht fest, dass aus einem Muster und einem Ankertag jeder
 * kommende Tag folgt, und dass eine Ausnahme trotzdem sticht.
 */

const TODAY: ISODate = todayIso();
const MUSTER = ['shift_day', 'shift_night', 'shift_sleep_day', 'shift_off', 'shift_off'];

function data(anchor: ShiftAnchor | null, shifts: AppData['shifts'] = {}): AppData {
  return {
    settings: { ...defaultSettings(), shiftRotation: MUSTER, shiftAnchor: anchor },
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

describe('rotationIndexOn', () => {
  const anchor: ShiftAnchor = { date: TODAY, index: 0 };

  it('läuft im Kreis, vorwärts wie rückwärts', () => {
    expect(rotationIndexOn(TODAY, anchor, 5)).toBe(0);
    expect(rotationIndexOn(addDays(TODAY, 4), anchor, 5)).toBe(4);
    expect(rotationIndexOn(addDays(TODAY, 5), anchor, 5)).toBe(0);
    expect(rotationIndexOn(addDays(TODAY, 127), anchor, 5)).toBe(2);
    expect(rotationIndexOn(addDays(TODAY, -1), anchor, 5)).toBe(4);
    expect(rotationIndexOn(addDays(TODAY, -5), anchor, 5)).toBe(0);
  });

  it('rechnet von der Stelle aus, auf der der Anker sitzt', () => {
    const dritterTag: ShiftAnchor = { date: TODAY, index: 2 };
    expect(rotationIndexOn(TODAY, dritterTag, 5)).toBe(2);
    expect(rotationIndexOn(addDays(TODAY, 3), dritterTag, 5)).toBe(0);
  });
});

describe('rotationAssignments', () => {
  it('erzeugt nichts ohne Anker — erfunden wird keine Schicht', () => {
    expect(rotationAssignments(null, MUSTER, TODAY, addDays(TODAY, 30))).toEqual([]);
  });

  it('erzeugt nichts vor dem Anker — die Vergangenheit bleibt wie eingetragen', () => {
    const anchor: ShiftAnchor = { date: TODAY, index: 0 };
    const out = rotationAssignments(anchor, MUSTER, addDays(TODAY, -30), addDays(TODAY, 2));
    expect(out.map((a) => a.date)).toEqual([TODAY, addDays(TODAY, 1), addDays(TODAY, 2)]);
  });

  it('schreibt das Muster ohne Ende fort', () => {
    const anchor: ShiftAnchor = { date: TODAY, index: 0 };
    const out = rotationAssignments(anchor, MUSTER, TODAY, addDays(TODAY, 11));
    expect(out.map((a) => a.shiftTypeId)).toEqual([
      ...MUSTER,
      ...MUSTER,
      'shift_day',
      'shift_night',
    ]);
    expect(out.every((a) => a.source === 'derived')).toBe(true);
  });
});

describe('der Kalender, den der Rest der App sieht', () => {
  it('steht auch weit hinter dem letzten eingetragenen Tag', () => {
    const idx = buildIndexes(data({ date: TODAY, index: 0 }));
    const inHundertTagen = shiftTypeOn(idx, addDays(TODAY, 100));
    expect(inHundertTagen?.id).toBe(MUSTER[100 % 5]);
  });

  it('ist leer, solange kein Anker gesetzt ist', () => {
    const idx = buildIndexes(data(null));
    expect(shiftTypeOn(idx, addDays(TODAY, 3))).toBeNull();
  });

  it('lässt eine Ausnahme den Rhythmus stechen', () => {
    const tag = addDays(TODAY, 7);
    const idx = buildIndexes(
      data(
        { date: TODAY, index: 0 },
        { [tag]: { date: tag, shiftTypeId: 'shift_v', source: 'manual' } },
      ),
    );
    expect(shiftTypeOn(idx, tag)?.id).toBe('shift_v');
    // Der Tag danach folgt wieder dem Muster — eine Ausnahme verschiebt nichts.
    expect(shiftTypeOn(idx, addDays(tag, 1))?.id).toBe(MUSTER[8 % 5]);
  });

  it('hält einen bewusst geleerten Tag leer', () => {
    const tag = addDays(TODAY, 4);
    const idx = buildIndexes(
      data(
        { date: TODAY, index: 0 },
        { [tag]: { date: tag, shiftTypeId: '', source: 'manual', cleared: true } },
      ),
    );
    expect(shiftTypeOn(idx, tag)).toBeNull();
    expect(shiftTypeOn(idx, addDays(tag, 1))?.id).toBe(MUSTER[0]);
  });
});
