import { describe, expect, it } from 'vitest';
import type { DailyCheckIn, ISODate, ShiftAssignment } from '../types.ts';
import type { PlannedUnit } from '../cycle/types.ts';
import { DEFAULT_PLANNER_SETTINGS } from '../cycle/types.ts';
import { buildDayShapes, detectCycle } from '../cycle/detect.ts';
import { planCycle } from '../cycle/planner.ts';
import { checkPlacement } from '../cycle/rules.ts';
import { CATALOGUE } from '../cycle/catalogue.ts';
import { ACWR_LOWER, ACWR_UPPER, computeAcwr } from '../cycle/acwr.ts';
import { defaultShiftTypes } from '../../data/defaults.ts';
import { addDays } from '../date.ts';

const START: ISODate = '2026-03-02';
const TYPES = new Map(defaultShiftTypes().map((t) => [t.id, t]));

/** One full cycle: day shift, night shift, sleep day, free, free. */
const CYCLE = ['day', 'night', 'sleep_day', 'off', 'off'];
const cycles = (n: number) => Array.from({ length: n }, () => CYCLE).flat();

function shifts(keys: string[], from: ISODate = START): Map<ISODate, ShiftAssignment> {
  const byKey = new Map(defaultShiftTypes().map((t) => [t.key, t.id]));
  const map = new Map<ISODate, ShiftAssignment>();
  keys.forEach((key, i) => {
    const date = addDays(from, i);
    map.set(date, { date, shiftTypeId: byKey.get(key)!, source: 'manual' });
  });
  return map;
}

interface PlanOptions {
  keys?: string[];
  from?: ISODate;
  days?: number;
  cycleOffset?: number;
  completed?: Record<ISODate, number>;
  knownDates?: ISODate[];
  checkIns?: DailyCheckIn[];
  restingHrNorm?: number;
  today?: ISODate;
}

function plan(options: PlanOptions = {}) {
  const keys = options.keys ?? CYCLE;
  const from = options.from ?? START;
  const to = addDays(from, (options.days ?? keys.length) - 1);
  const assignments = shifts(keys, from);
  const detected = detectCycle(from, to, assignments, TYPES);
  const all = detectCycle(from, addDays(to, 1), assignments, TYPES);
  const shapes = buildDayShapes(detected, DEFAULT_PLANNER_SETTINGS, (d) =>
    all.find((x) => x.date === addDays(d, 1)),
  );

  return planCycle({
    shapes,
    completedLoadByDate: new Map(Object.entries(options.completed ?? {})),
    knownDates: new Set(options.knownDates ?? Object.keys(options.completed ?? {})),
    checkIns: new Map((options.checkIns ?? []).map((c) => [c.date, c])),
    settings: DEFAULT_PLANNER_SETTINGS,
    cycleOffset: options.cycleOffset ?? 0,
    restingHrNorm: options.restingHrNorm,
    today: options.today,
  });
}

const allUnits = (p: ReturnType<typeof plan>): PlannedUnit[] => p.days.flatMap((d) => d.units);
const unitsOn = (p: ReturnType<typeof plan>, date: ISODate) =>
  p.days.find((d) => d.shape.date === date)?.units ?? [];
const end = (u: PlannedUnit) => u.start + u.durationMinutes;
const dayN = (cycle: number, day: number) => addDays(START, cycle * 5 + day - 1);

/* ------------------------------------------------------------------ *
 * Section 11 — the specified test cases
 * ------------------------------------------------------------------ */

describe('Zyklus A und B alternieren', () => {
  it('wechselt über vier Zyklen korrekt A → B → A → B', () => {
    const p = plan({ keys: cycles(4), days: 20 });
    expect(p.cycles.map((c) => c.type)).toEqual(['A', 'B', 'A', 'B']);
  });

  it('setzt in A den intensiven, in B den langen Lauf auf Tag 4', () => {
    const p = plan({ keys: cycles(4), days: 20 });
    // The fourth cycle is a deload, where the intensive run drops out — so the
    // check covers the three that are not.
    expect(unitsOn(p, dayN(0, 4))[0].kind).toBe('intense_run');
    expect(unitsOn(p, dayN(1, 4))[0].kind).toBe('long_run');
    expect(unitsOn(p, dayN(2, 4))[0].kind).toBe('intense_run');
  });

  it('erzeugt aus derselben Ausgangslage immer denselben Plan', () => {
    // The whole reason for a fixed template rather than an optimiser.
    const a = allUnits(plan({ keys: cycles(4), days: 20 }));
    const b = allUnits(plan({ keys: cycles(4), days: 20 }));
    expect(a.map((u) => `${u.date}:${u.kind}@${u.start}`)).toEqual(
      b.map((u) => `${u.date}:${u.kind}@${u.start}`),
    );
  });
});

describe('Bilanz des Makrozyklus', () => {
  it('enthält genau 4 Läufe und 4 Krafteinheiten', () => {
    const p = plan({ keys: cycles(2), days: 10 });
    expect(p.macrocycle.complete).toBe(true);
    expect(p.macrocycle.runs).toBe(4);
    expect(p.macrocycle.strengthSessions).toBe(4);
  });

  it('hält den Zone-2-Anteil hoch', () => {
    const p = plan({ keys: cycles(2), days: 10 });
    // Two easy runs at 40 min plus the 90 min long run against the 55 min
    // intensive run: 170 of 225 running minutes, so 76 %.
    expect(p.macrocycle.zone2Share).toBeGreaterThanOrEqual(0.75);
  });

  it('kommt auf die Gesamtbelastung der Vorlage', () => {
    const p = plan({ keys: cycles(2), days: 10 });
    // A: 30 + 30 + 80 + 70 = 210 · B: 30 + 30 + 60 + 70 = 190 · zusammen 400.
    expect(p.macrocycle.load).toBe(400);
  });
});

describe('Nachtschichttag', () => {
  it('lässt keine Einheit nach 13:30 enden', () => {
    const p = plan({ keys: cycles(2), days: 10 });
    for (const cycle of [0, 1]) {
      for (const unit of unitsOn(p, dayN(cycle, 2))) {
        expect(end(unit)).toBeLessThanOrEqual(13 * 60 + 30);
      }
    }
  });

  it('trägt weder schwere Kraft noch intensiven Lauf', () => {
    const p = plan({ keys: cycles(4), days: 20 });
    for (const cycle of [0, 1, 2, 3]) {
      for (const unit of unitsOn(p, dayN(cycle, 2))) {
        expect(unit.kind).not.toBe('heavy_strength');
        expect(unit.kind).not.toBe('intense_run');
      }
    }
  });
});

describe('Schlaftag', () => {
  it('trainiert strikt beinfrei und läuft nicht', () => {
    const p = plan({ keys: cycles(4), days: 20 });
    for (const cycle of [0, 1, 2, 3]) {
      for (const unit of unitsOn(p, dayN(cycle, 3))) {
        expect(CATALOGUE[unit.kind].discipline).not.toBe('run');
        expect(CATALOGUE[unit.kind].loadsLegs).toBe(false);
      }
    }
  });

  it('hält das Fenster 16:00–20:00 ein', () => {
    const p = plan({ keys: cycles(2), days: 10 });
    for (const cycle of [0, 1]) {
      for (const unit of unitsOn(p, dayN(cycle, 3))) {
        expect(unit.start).toBeGreaterThanOrEqual(16 * 60);
        expect(end(unit)).toBeLessThanOrEqual(20 * 60);
      }
    }
  });
});

describe('Reihenfolge von Kraft und Lauf', () => {
  it('legt schwere Kraft nie an den Tag vor einem langen oder intensiven Lauf', () => {
    const p = plan({ keys: cycles(4), days: 20 });
    const units = allUnits(p);
    for (const lift of units.filter((u) => u.kind === 'heavy_strength')) {
      for (const run of units.filter((u) => u.kind === 'long_run' || u.kind === 'intense_run')) {
        const hours =
          (Date.parse(`${run.date}T00:00:00`) + run.start * 60000 -
            Date.parse(`${lift.date}T00:00:00`) - lift.start * 60000) / 3_600_000;
        if (hours > 0) expect(hours).toBeGreaterThanOrEqual(24);
      }
    }
  });

  it('erzeugt den Plan ganz ohne Regelverstöße', () => {
    const p = plan({ keys: cycles(4), days: 20 });
    expect(p.violations).toEqual([]);
  });
});

describe('V-Schicht', () => {
  const keys = ['day', 'night', 'sleep_day', 'off', 'v_shift', 'day'];

  it('legt den Lauf ins Morgenfenster, wenn danach eine Tagschicht kommt', () => {
    const p = plan({ keys, days: 6 });
    const units = unitsOn(p, dayN(0, 5));
    expect(units).toHaveLength(1);
    expect(units[0].kind).toBe('easy_run');
    expect(units[0].start).toBe(6 * 60 + 15);
    expect(end(units[0])).toBeLessThanOrEqual(7 * 60 + 15);
  });

  it('verschiebt die Krafteinheit als moderate Kraft auf Tag 4', () => {
    const p = plan({ keys, days: 6 });
    const dayFour = unitsOn(p, dayN(0, 4));
    expect(dayFour).toHaveLength(2);
    expect(dayFour.some((u) => u.kind === 'moderate_strength')).toBe(true);
    // Total day load stays under the 125 a double day is allowed.
    const load = dayFour.reduce((sum, u) => sum + u.load, 0);
    expect(load).toBeLessThanOrEqual(125);
  });

  it('lässt die Krafteinheit ersatzlos entfallen, wenn Tag 4 unter 85 liegt', () => {
    const p = plan({
      keys,
      days: 6,
      checkIns: [{ date: dayN(0, 4), wellbeing: 2, source: 'manual', updatedAt: '' }],
    });
    const dayFour = unitsOn(p, dayN(0, 4));
    expect(dayFour.some((u) => CATALOGUE[u.kind].discipline === 'strength')).toBe(false);
    expect(p.warnings.some((w) => w.includes('entfällt ersatzlos'))).toBe(true);
  });
});

describe('Der Erholungswert stuft ab, statt zu streichen', () => {
  it('macht aus dem intensiven Lauf bei Erholungswert 75 einen langen Lauf', () => {
    // Base 100 on day 4, wellbeing 2 costs 25: exactly the 75 a long run needs.
    const p = plan({
      keys: CYCLE,
      checkIns: [{ date: dayN(0, 4), wellbeing: 2, source: 'manual', updatedAt: '' }],
    });
    const units = unitsOn(p, dayN(0, 4));
    expect(units).toHaveLength(1);
    expect(units[0].kind).toBe('long_run');
    expect(units[0].downgradedFrom).toBe('intense_run');
    expect(p.days.find((d) => d.shape.date === dayN(0, 4))!.recovery.value).toBe(75);
  });

  it('geht bei Erholungswert 70 eine Stufe weiter, weil der lange Lauf 75 braucht', () => {
    /*
     * The written test case expects a long run at a recovery value of 70, but
     * the minimum table in the same specification puts the long run at 75. The
     * table wins: it is the rule, the test case was the illustration. At 70 the
     * chain therefore takes one more step, to the easy run — still a downgrade,
     * never a deletion.
     */
    const p = plan({
      keys: CYCLE,
      checkIns: [{ date: dayN(0, 4), wellbeing: 1, source: 'manual', updatedAt: '' }],
    });
    const units = unitsOn(p, dayN(0, 4));
    expect(p.days.find((d) => d.shape.date === dayN(0, 4))!.recovery.value).toBe(70);
    expect(units).toHaveLength(1);
    expect(units[0].kind).toBe('easy_run');
    expect(units[0].downgradedFrom).toBe('intense_run');
  });

  it('zieht Schlafmangel, Muskelkater und Ruhepuls zusammen ab', () => {
    const date = dayN(0, 4);
    const p = plan({
      keys: CYCLE,
      restingHrNorm: 50,
      checkIns: [
        { date, sleepHours: 6, soreness: 4, restingHr: 59, source: 'manual', updatedAt: '' },
      ],
    });
    const recovery = p.days.find((d) => d.shape.date === date)!.recovery;
    // 100 − 20 (2 h unter 8 h Ziel) − 15 (Muskelkater 4) − 15 (Puls +9) = 50.
    expect(recovery.value).toBe(50);
  });

  it('zieht den ausgefallenen Vorschlaf ab', () => {
    const date = dayN(0, 2);
    const p = plan({
      keys: CYCLE,
      checkIns: [{ date, napTaken: false, source: 'manual', updatedAt: '' }],
    });
    const recovery = p.days.find((d) => d.shape.date === date)!.recovery;
    expect(recovery.value).toBe(60);
    expect(recovery.adjustments.some((a) => a.label.includes('Vorschlaf'))).toBe(true);
  });

  it('streicht nie, sondern stuft bis zur Regeneration ab', () => {
    const p = plan({
      keys: cycles(2),
      days: 10,
      checkIns: [dayN(0, 2), dayN(0, 3), dayN(0, 4), dayN(0, 5)].map((date) => ({
        date,
        wellbeing: 1,
        source: 'manual' as const,
        updatedAt: '',
      })),
    });
    // Four sessions per cycle: none of them may simply disappear.
    for (const day of [2, 3, 4, 5]) {
      expect(unitsOn(p, dayN(0, day))).toHaveLength(1);
    }
  });
});

describe('Deload', () => {
  it('greift im vierten Zyklus', () => {
    const p = plan({ keys: cycles(4), days: 20 });
    expect(p.cycles.map((c) => c.isDeload)).toEqual([false, false, false, true]);
  });

  it('nimmt die Belastung um rund 40 % zurück', () => {
    const p = plan({ keys: cycles(4), days: 20 });
    const normal = p.cycles.filter((c) => !c.isDeload);
    const deload = p.cycles.find((c) => c.isDeload)!;
    const average = normal.reduce((sum, c) => sum + c.load, 0) / normal.length;
    const reduction = 1 - deload.load / average;
    expect(reduction).toBeGreaterThan(0.25);
    expect(reduction).toBeLessThan(0.5);
  });

  it('lässt weder intensiven Lauf noch schwere Kraft im Deload zu', () => {
    const p = plan({ keys: cycles(4), days: 20 });
    const deload = p.cycles.find((c) => c.isDeload)!;
    for (const day of deload.days) {
      for (const unit of day.units) {
        expect(unit.kind).not.toBe('intense_run');
        expect(unit.kind).not.toBe('heavy_strength');
      }
    }
  });

  it('fällt strukturbedingt immer auf einen B-Zyklus', () => {
    /*
     * Four cycles is two macrocycles, so "every fourth cycle" always lands on
     * the same position: the second half of every second macrocycle, which is
     * always a B cycle. The consequence is that the deload's "the intensive run
     * drops out" clause never actually fires — a B cycle has no intensive run
     * to drop. The heavy-to-moderate substitution and the halved volumes carry
     * the whole reduction.
     */
    const p = plan({ keys: cycles(8), days: 40 });
    for (const cycle of p.cycles.filter((c) => c.isDeload)) {
      expect(cycle.type).toBe('B');
    }
  });
});

describe('Belastungsverhältnis akut zu chronisch', () => {
  const known = (n: number) => Array.from({ length: n }, (_, i) => addDays(START, -i));

  it('meldet unbekannt, solange die Historie zu kurz ist', () => {
    const state = computeAcwr(START, new Map([[addDays(START, -1), 50]]), new Set(known(3)));
    expect(state.ratio).toBeNull();
    expect(state.band).toBe('unknown');
  });

  it('erkennt einen Ausreißer nach oben und warnt', () => {
    const load = new Map<ISODate, number>();
    for (let i = 7; i < 28; i++) load.set(addDays(START, -i), 10);
    for (let i = 0; i < 7; i++) load.set(addDays(START, -i), 80);
    const state = computeAcwr(START, load, new Set(known(28)));
    expect(state.band).toBe('high');
    expect(state.ratio!).toBeGreaterThan(ACWR_UPPER);
    expect(state.message).toBeTruthy();
  });

  it('erkennt auch das Abfallen nach unten', () => {
    const load = new Map<ISODate, number>();
    for (let i = 7; i < 28; i++) load.set(addDays(START, -i), 60);
    for (let i = 0; i < 7; i++) load.set(addDays(START, -i), 5);
    const state = computeAcwr(START, load, new Set(known(28)));
    expect(state.band).toBe('low');
    expect(state.ratio!).toBeLessThan(ACWR_LOWER);
  });

  it('stuft die nächste harte Einheit ab, wenn das Band überschritten ist', () => {
    const completed: Record<ISODate, number> = {};
    for (let i = 7; i < 28; i++) completed[addDays(START, -i)] = 10;
    for (let i = 1; i <= 7; i++) completed[addDays(START, -i)] = 90;
    const p = plan({
      keys: CYCLE,
      completed,
      knownDates: Array.from({ length: 28 }, (_, i) => addDays(START, -i)),
      today: START,
    });
    const key = unitsOn(p, dayN(0, 4))[0];
    expect(key.kind).not.toBe('intense_run');
    expect(key.reasons.some((r) => r.includes('Belastungsverhältnis'))).toBe(true);
    expect(p.warnings.some((w) => w.includes('Belastungsverhältnis'))).toBe(true);
  });
});

describe('Ruhetag', () => {
  it('enthält in jedem Zyklus mindestens einen Tag mit Belastung 0', () => {
    const p = plan({ keys: cycles(4), days: 20 });
    for (const cycle of p.cycles) {
      expect(cycle.days.some((d) => d.load === 0)).toBe(true);
    }
  });

  it('trainiert am Tagschichttag gar nicht', () => {
    const p = plan({ keys: cycles(4), days: 20 });
    for (const cycle of [0, 1, 2, 3]) {
      expect(unitsOn(p, dayN(cycle, 1))).toHaveLength(0);
    }
  });
});

/* ------------------------------------------------------------------ *
 * The hard rules, checked directly
 * ------------------------------------------------------------------ */

function shapeFor(key: string) {
  const assignments = shifts([key]);
  return buildDayShapes(detectCycle(START, START, assignments, TYPES), DEFAULT_PLANNER_SETTINGS, () => undefined)[0];
}

function violationsFor(
  key: string,
  placement: { kind: PlannedUnit['kind']; start: number; durationMinutes: number },
  extra: { sameDay?: PlannedUnit[]; allUnits?: PlannedUnit[]; recovery?: number } = {},
) {
  const shape = shapeFor(key);
  return checkPlacement(
    { date: START, ...placement },
    {
      shape,
      recovery: {
        value: extra.recovery ?? 100,
        base: 100,
        adjustments: [],
        band: 'green',
        known: true,
      },
      sameDay: extra.sameDay ?? [],
      allUnits: extra.allUnits ?? [],
      loadByDate: new Map(),
      shapesByDate: new Map([[START, shape]]),
      settings: DEFAULT_PLANNER_SETTINGS,
    },
  ).map((v) => v.rule);
}

describe('Harte Regeln', () => {
  it('verbietet jedes Training am Tagschichttag', () => {
    expect(violationsFor('day', { kind: 'easy_run', start: 5 * 60, durationMinutes: 40 })).toContain(
      'tagschicht',
    );
  });

  it('verbietet den intensiven Lauf an Nachtschicht- und Schlaftagen', () => {
    expect(
      violationsFor('night', { kind: 'intense_run', start: 9 * 60, durationMinutes: 55 }),
    ).toContain('intensitaet_schicht');
    expect(
      violationsFor('sleep_day', { kind: 'intense_run', start: 16 * 60, durationMinutes: 55 }),
    ).toContain('intensitaet_schicht');
  });

  it('erzwingt den Puffer vor dem Vorschlaf', () => {
    expect(
      violationsFor('night', { kind: 'easy_run', start: 13 * 60, durationMinutes: 45 }),
    ).toContain('vorschlaf_puffer');
  });

  it('erzwingt am Schlaftag den Beginn ab 16:00 und das Ende bis 20:00', () => {
    expect(
      violationsFor('sleep_day', { kind: 'upper_strength', start: 15 * 60, durationMinutes: 40 }),
    ).toContain('schlaftraegheit');
    expect(
      violationsFor('sleep_day', { kind: 'upper_strength', start: 19 * 60 + 30, durationMinutes: 40 }),
    ).toContain('schlaftag_ende');
  });

  it('fordert 48 h zwischen zwei harten Einheiten derselben Disziplin', () => {
    const yesterday: PlannedUnit = {
      date: addDays(START, -1), kind: 'long_run', start: 8 * 60, durationMinutes: 90, load: 60, reasons: [],
    };
    expect(
      violationsFor('off', { kind: 'intense_run', start: 8 * 60, durationMinutes: 55 }, { allUnits: [yesterday] }),
    ).toContain('abstand_gleiche_disziplin');
  });

  it('lässt genau 24 h zwischen harten Einheiten verschiedener Disziplin genügen', () => {
    // Same time of day, one day apart: exactly 24 h, which both rules allow.
    const yesterday: PlannedUnit = {
      date: addDays(START, -1), kind: 'heavy_strength', start: 8 * 60, durationMinutes: 60, load: 70, reasons: [],
    };
    const rules = violationsFor(
      'off',
      { kind: 'intense_run', start: 8 * 60, durationMinutes: 55 },
      { allUnits: [yesterday] },
    );
    expect(rules).toEqual([]);
  });

  it('verbietet schwere Beinkraft innerhalb der 24 h vor einem harten Lauf', () => {
    // Yesterday afternoon is 18 h before this morning's run — inside the window.
    const yesterday: PlannedUnit = {
      date: addDays(START, -1), kind: 'heavy_strength', start: 14 * 60, durationMinutes: 60, load: 70, reasons: [],
    };
    expect(
      violationsFor('off', { kind: 'intense_run', start: 8 * 60, durationMinutes: 55 }, { allUnits: [yesterday] }),
    ).toContain('beinkraft_vor_lauf');
  });

  it('erlaubt schwere Beinkraft nach dem harten Lauf', () => {
    const yesterday: PlannedUnit = {
      date: addDays(START, -1), kind: 'intense_run', start: 8 * 60, durationMinutes: 55, load: 80, reasons: [],
    };
    expect(
      violationsFor('off', { kind: 'heavy_strength', start: 8 * 60, durationMinutes: 60 }, { allUnits: [yesterday] }),
    ).not.toContain('beinkraft_vor_lauf');
  });

  it('lässt von zwei Läufen an Nachbartagen nur einen hart sein', () => {
    const yesterday: PlannedUnit = {
      date: addDays(START, -1), kind: 'intense_run', start: 8 * 60, durationMinutes: 55, load: 80, reasons: [],
    };
    expect(
      violationsFor('off', { kind: 'long_run', start: 8 * 60, durationMinutes: 90 }, { allUnits: [yesterday] }),
    ).toContain('zwei_harte_laeufe');
  });

  it('begrenzt den zweiten Lauf eines Paares auf 35 min', () => {
    const yesterday: PlannedUnit = {
      date: addDays(START, -1), kind: 'intense_run', start: 8 * 60, durationMinutes: 55, load: 80, reasons: [],
    };
    expect(
      violationsFor('off', { kind: 'easy_run', start: 9 * 60, durationMinutes: 45 }, { allUnits: [yesterday] }),
    ).toContain('zweiter_lauf_umfang');
  });

  it('verlangt bei zwei Einheiten am Tag sechs Stunden Abstand und Kraft zuerst', () => {
    const strength: PlannedUnit = {
      date: START, kind: 'moderate_strength', start: 8 * 60, durationMinutes: 50, load: 45, reasons: [],
    };
    expect(
      violationsFor('off', { kind: 'easy_run', start: 11 * 60, durationMinutes: 40 }, { sameDay: [strength] }),
    ).toContain('doppel_abstand');
    expect(
      violationsFor('off', { kind: 'easy_run', start: 6 * 60, durationMinutes: 40 }, { sameDay: [strength] }),
    ).toContain('doppel_reihenfolge');
  });

  it('lässt Kraft vormittags und Lauf am Nachmittag zu', () => {
    const strength: PlannedUnit = {
      date: START, kind: 'moderate_strength', start: 8 * 60, durationMinutes: 50, load: 45, reasons: [],
    };
    expect(
      violationsFor('off', { kind: 'easy_run', start: 15 * 60, durationMinutes: 40 }, { sameDay: [strength] }),
    ).toEqual([]);
  });
});
