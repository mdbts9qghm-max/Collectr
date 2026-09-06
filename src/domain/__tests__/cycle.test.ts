import { describe, expect, it } from 'vitest';
import type { DailyCheckIn, ISODate, ShiftAssignment } from '../types.ts';
import type { PlannedUnit, SessionKind } from '../cycle/types.ts';
import { DEFAULT_PLANNER_SETTINGS } from '../cycle/types.ts';
import { buildDayShapes, detectCycle } from '../cycle/detect.ts';
import { planCycle } from '../cycle/planner.ts';
import { CATALOGUE } from '../cycle/catalogue.ts';
import { defaultShiftTypes } from '../../data/defaults.ts';
import { addDays } from '../date.ts';

const START: ISODate = '2026-03-02'; // a Monday, but the cycle ignores weekdays
const TYPES = new Map(defaultShiftTypes().map((t) => [t.id, t]));

/** Builds shift assignments from a list of shift keys, starting at START. */
function shifts(keys: string[], from: ISODate = START): Map<ISODate, ShiftAssignment> {
  const byKey = new Map(defaultShiftTypes().map((t) => [t.key, t.id]));
  const map = new Map<ISODate, ShiftAssignment>();
  keys.forEach((key, i) => {
    const date = addDays(from, i);
    map.set(date, { date, shiftTypeId: byKey.get(key)!, source: 'manual' });
  });
  return map;
}

/** One full cycle: day shift, night shift, sleep day, free, free. */
const STANDARD_CYCLE = ['day', 'night', 'sleep_day', 'off', 'off'];

interface PlanOptions {
  keys?: string[];
  from?: ISODate;
  days?: number;
  keyRotationIndex?: number;
  completed?: Record<ISODate, number>;
  checkIns?: DailyCheckIn[];
  today?: ISODate;
}

function plan(options: PlanOptions = {}) {
  const keys = options.keys ?? STANDARD_CYCLE;
  const from = options.from ?? START;
  const to = addDays(from, (options.days ?? keys.length) - 1);
  const assignments = shifts(keys, from);
  const detected = detectCycle(from, to, assignments, TYPES);
  const lookup = (date: ISODate) => {
    const all = detectCycle(from, addDays(to, 1), assignments, TYPES);
    return all.find((d) => d.date === date);
  };
  const shapes = buildDayShapes(detected, DEFAULT_PLANNER_SETTINGS, (d) => lookup(addDays(d, 1)));

  return planCycle({
    shapes,
    completedLoadByDate: new Map(Object.entries(options.completed ?? {})),
    checkIns: new Map((options.checkIns ?? []).map((c) => [c.date, c])),
    settings: DEFAULT_PLANNER_SETTINGS,
    keyRotationIndex: options.keyRotationIndex ?? 0,
    today: options.today,
  });
}

const allUnits = (p: ReturnType<typeof plan>): PlannedUnit[] => p.days.flatMap((d) => d.units);
const unitsOn = (p: ReturnType<typeof plan>, date: ISODate) =>
  p.days.find((d) => d.shape.date === date)?.units ?? [];
const end = (u: PlannedUnit) => u.start + u.durationMinutes;

/* ------------------------------------------------------------------ *
 * Section 12 — the specified acceptance tests
 * ------------------------------------------------------------------ */

describe('Testfälle aus Abschnitt 12', () => {
  it('Standardzyklus → genau 4 Einheiten, Tagschichttag bleibt leer', () => {
    const p = plan();
    expect(allUnits(p).length).toBe(4);
    // Cycle day 1 is the day shift and carries no window at all.
    expect(unitsOn(p, START)).toHaveLength(0);
    expect(p.days[0].load).toBe(0);
  });

  it('Nachtschichttag → keine Einheit endet nach 13:30, kein intensiver Lauf', () => {
    const p = plan();
    const nightDay = addDays(START, 1);
    for (const unit of unitsOn(p, nightDay)) {
      expect(end(unit)).toBeLessThanOrEqual(13 * 60 + 30);
      expect(unit.kind).not.toBe('intense_run');
    }
    expect(unitsOn(p, nightDay).length).toBeGreaterThan(0);
  });

  it('Schlaftag → keine Einheit beginnt vor 16:00 oder endet nach 20:00', () => {
    const p = plan();
    const sleepDay = addDays(START, 2);
    const units = unitsOn(p, sleepDay);
    expect(units.length).toBeGreaterThan(0);
    for (const unit of units) {
      expect(unit.start).toBeGreaterThanOrEqual(16 * 60);
      expect(end(unit)).toBeLessThanOrEqual(20 * 60);
    }
  });

  it('V-Schicht mit Tagschicht am Folgetag → Lauf liegt morgens, nicht abends', () => {
    // …, free, V-Schicht, day shift
    const p = plan({ keys: ['day', 'night', 'sleep_day', 'off', 'v_shift', 'day'], days: 6 });
    const vDay = addDays(START, 4);
    const units = unitsOn(p, vDay);
    expect(units.length).toBe(1);
    expect(units[0].start).toBeGreaterThanOrEqual(6 * 60 + 15);
    expect(end(units[0])).toBeLessThanOrEqual(7 * 60 + 15);
  });

  it('V-Schicht ohne Tagschicht am Folgetag → Abendfenster zulässig, Ende spätestens 21:00', () => {
    const p = plan({ keys: ['day', 'night', 'sleep_day', 'off', 'v_shift', 'off'], days: 6 });
    const vDay = addDays(START, 4);
    const units = unitsOn(p, vDay);
    expect(units.length).toBe(1);
    // Either window is acceptable; the evening one must respect the 21:00 limit.
    const isMorning = units[0].start >= 6 * 60 && end(units[0]) <= 7 * 60 + 15;
    const isEvening = units[0].start >= 20 * 60 && end(units[0]) <= 21 * 60;
    expect(isMorning || isEvening).toBe(true);
  });

  it('Intensiver Lauf an Tag 4 und schwere Kraft an Tag 5 → zulässig', () => {
    const p = plan({ keyRotationIndex: 0 });
    const day4 = unitsOn(p, addDays(START, 3));
    const day5 = unitsOn(p, addDays(START, 4));
    expect(day4.map((u) => u.kind)).toContain('intense_run');
    expect(day5.map((u) => u.kind)).toContain('heavy_strength');
    // Different disciplines need 24 h, which consecutive days provide.
    expect(p.violations).toHaveLength(0);
  });

  it('Zwei harte Läufe an Folgetagen → 48-h-Regel stuft den zweiten ab, löscht ihn nicht', () => {
    // A long run is already completed on cycle day 4; the planner must not put
    // another hard run on day 5, but it must still put *something* there.
    const day4 = addDays(START, 3);
    const day5 = addDays(START, 4);
    const p = plan({
      keys: ['day', 'night', 'sleep_day', 'off', 'off'],
      keyRotationIndex: 1, // long run is the key session
    });
    const runsOnBoth = [...unitsOn(p, day4), ...unitsOn(p, day5)].filter(
      (u) => CATALOGUE[u.kind].discipline === 'run' && CATALOGUE[u.kind].load >= 60,
    );
    // At most one hard run across the two consecutive days.
    expect(runsOnBoth.length).toBeLessThanOrEqual(1);
    // And day 5 is not left empty.
    expect(unitsOn(p, day5).length).toBeGreaterThan(0);
  });

  it('Über 3 Zyklen → jede Schlüsseleinheit kam mindestens einmal auf Tag 4', () => {
    const onDay4: SessionKind[] = [];
    for (let cycle = 0; cycle < 3; cycle++) {
      const from = addDays(START, cycle * 5);
      const p = plan({ from, keyRotationIndex: cycle });
      onDay4.push(...unitsOn(p, addDays(from, 3)).map((u) => u.kind));
    }
    for (const key of ['intense_run', 'long_run', 'heavy_strength'] as SessionKind[]) {
      expect(onDay4).toContain(key);
    }
  });

  it('Jedes rollierende 7-Tage-Fenster enthält mindestens einen Tag mit Belastung 0', () => {
    // Two full cycles, so a seven-day window always spans a day shift.
    const p = plan({ keys: [...STANDARD_CYCLE, ...STANDARD_CYCLE], days: 10 });
    expect(p.window.restDays).toBeGreaterThanOrEqual(1);
    const zeroDays = p.days.filter((d) => d.load === 0);
    expect(zeroDays.length).toBeGreaterThanOrEqual(2);
  });
});

/* ------------------------------------------------------------------ *
 * The hard rules, checked directly
 * ------------------------------------------------------------------ */

describe('harte Regeln', () => {
  it('hält jede Einheit in ihrem Fenster', () => {
    const p = plan();
    for (const day of p.days) {
      const windows = [day.shape.trainingWindow, day.shape.alternativeWindow].filter(Boolean);
      for (const unit of day.units) {
        const fits = windows.some((w) => w && unit.start >= w.start && end(unit) <= w.end);
        expect(fits).toBe(true);
      }
    }
  });

  it('respektiert die Mindestanforderung an den Erholungswert', () => {
    const p = plan();
    for (const day of p.days) {
      for (const unit of day.units) {
        expect(day.recovery.value).toBeGreaterThanOrEqual(CATALOGUE[unit.kind].minRecovery);
      }
    }
  });

  it('lässt keine harte Einheit weniger als 3 h vor dem Vorschlaf enden', () => {
    const p = plan();
    for (const day of p.days) {
      for (const unit of day.units) {
        if (CATALOGUE[unit.kind].load < 60) continue;
        expect(day.shape.nextSleepStart - end(unit)).toBeGreaterThanOrEqual(180);
      }
    }
  });

  it('erzeugt einen Plan ganz ohne Regelverstöße', () => {
    const p = plan({ keys: [...STANDARD_CYCLE, ...STANDARD_CYCLE], days: 10 });
    expect(p.violations).toHaveLength(0);
  });

  it('senkt den Erholungswert bei schlechtem Befinden und kurzem Schlaf', () => {
    const day4 = addDays(START, 3);
    const good = plan();
    const bad = plan({
      checkIns: [
        { date: day4, wellbeing: 3, sleepHours: 5, source: 'manual', updatedAt: '' },
      ],
    });
    const goodValue = good.days.find((d) => d.shape.date === day4)!.recovery.value;
    const badValue = bad.days.find((d) => d.shape.date === day4)!.recovery.value;
    // Base 100 plus the rest-day bonus is clamped to 100; the bad day is
    // 105 − 20 (Befinden 3) − 10 (Schlaf 5 h statt 8 h) = 75.
    expect(goodValue).toBe(100);
    expect(badValue).toBe(75);
  });

  it('stuft ab statt zu streichen, wenn der Erholungswert nicht reicht', () => {
    const day4 = addDays(START, 3);
    const p = plan({
      keyRotationIndex: 0, // wants an intense run, needs recovery 85
      // Base 100 + 5 rest bonus − 25 (Befinden 2) = 80, just under the 85 an
      // intense run demands, so the planner must weaken it instead of dropping it.
      checkIns: [{ date: day4, wellbeing: 2, source: 'manual', updatedAt: '' }],
    });
    const units = unitsOn(p, day4);
    expect(units.length).toBe(1);
    expect(units[0].kind).not.toBe('intense_run');
    expect(units[0].downgradedFrom).toBe('intense_run');
  });
});

/* ------------------------------------------------------------------ *
 * Progression is measured on what was trained, not on a projection
 * ------------------------------------------------------------------ */

describe('Steigerungsregel', () => {
  it('rotiert die Schlüsseleinheit über mehrere Zyklen', () => {
    const p = plan({ keys: [...STANDARD_CYCLE, ...STANDARD_CYCLE], days: 10, today: START });
    const keyDays = [addDays(START, 3), addDays(START, 8)];
    const kinds = keyDays.map((d) => unitsOn(p, d).map((u) => u.downgradedFrom ?? u.kind));
    // The second cycle must not repeat the first cycle's key session.
    expect(kinds[0][0]).not.toBe(kinds[1][0]);
  });

  it('drosselt einen künftigen Zyklus nicht wegen des davor geplanten', () => {
    // With `today` at the start of the horizon every previous window lies in the
    // future, where it is the planner's own projection. Throttling against it
    // would ratchet the plan down instead of progressing it.
    const p = plan({
      keys: [...STANDARD_CYCLE, ...STANDARD_CYCLE, ...STANDARD_CYCLE],
      days: 15,
      today: START,
    });
    const load = (cycle: number) =>
      p.days
        .filter((d) => d.shape.date >= addDays(START, cycle * 5) && d.shape.date < addDays(START, (cycle + 1) * 5))
        .reduce((sum, d) => sum + d.load, 0);

    expect(p.violations).toHaveLength(0);
    // No cycle collapses to a fraction of the first one.
    expect(load(1)).toBeGreaterThan(load(0) * 0.6);
    expect(load(2)).toBeGreaterThan(load(0) * 0.6);
  });
});
