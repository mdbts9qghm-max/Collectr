import { describe, expect, it } from 'vitest';
import type { ISODate } from '../types.ts';
import type { DayInput, PlanInput } from '../aerobic/planner.ts';
import { planAerobic } from '../aerobic/planner.ts';
import { CATALOGUE, chainFor } from '../aerobic/catalogue.ts';
import { computeRecovery } from '../aerobic/recovery.ts';
import { baselineFor, assignSleep } from '../aerobic/whoop.ts';
import { STAGE_TABLE, TRACK_FALLBACK, buildIntervalSession, paceFade, stageFor } from '../aerobic/intervals.ts';
import { blockFor, phaseFor, targetFor } from '../aerobic/phases.ts';
import { MIN_BASE_SHARE, planVolume } from '../aerobic/volume.ts';
import { windowsFor } from '../aerobic/windows.ts';
import { RULES, ruleById } from '../aerobic/rules.ts';
import { addDays } from '../date.ts';

const START: ISODate = '2026-09-07';

const ROTATION: (1 | 2 | 3 | 4 | 5)[] = [1, 2, 3, 4, 5];

function days(count: number, opts: { vShiftOn?: number; recovery?: Map<number, number> } = {}): DayInput[] {
  return Array.from({ length: count }, (_, i) => {
    const cycleDay = ROTATION[i % 5];
    const isVShift = opts.vShiftOn === i;
    const date = addDays(START, i);
    const w = windowsFor(cycleDay, 5 * 60 + 30);
    const forced = opts.recovery?.get(i);
    const recovery = computeRecovery({
      date,
      cycleDay,
      isVShift,
      outOfRotation: null,
      sleepTargetMinutes: w.sleepTargetMinutes,
      napExpected: !!w.nap,
      wellbeing: forced != null ? undefined : undefined,
    });
    return {
      date,
      cycleDay,
      isVShift,
      outOfRotation: null,
      recovery: forced != null ? { ...recovery, value: forced, band: forced < 45 ? 'red' : forced < 75 ? 'amber' : 'green' } : recovery,
    } satisfies DayInput;
  });
}

function plan(overrides: Partial<PlanInput> = {}) {
  return planAerobic({
    days: overrides.days ?? days(10),
    cycleOffset: 0,
    dayShiftWakeMinutes: 5 * 60 + 30,
    previousAerobicMinutes: null,
    previousRunMinutes: null,
    cleanHistory: [],
    intensitySessionCount: 0,
    acwr: null,
    loadByDate: new Map(),
    ...overrides,
  });
}

const unitsOn = (p: ReturnType<typeof plan>, i: number) =>
  p.days.find((d) => d.date === addDays(START, i))?.units ?? [];
const allUnits = (p: ReturnType<typeof plan>) => p.days.flatMap((d) => d.units);

/* ------------------------------------------------------------------ *
 * Section 15 — the specified test cases
 * ------------------------------------------------------------------ */

describe('Intensität ab Woche 1', () => {
  it('erzeugt in Woche 1 eine echte Intensitätseinheit als Bahneinheit 8 × 100 m', () => {
    const p = plan();
    const intensity = allUnits(p).find((u) => u.kind === 'vo2_intervals');
    expect(intensity).toBeTruthy();
    expect(intensity!.interval?.label).toBe('8 × 100 m, 100 m gehen');
    expect(intensity!.mode).toBe('run');
  });

  it('geht in den ersten acht Wochen nicht über 200 m hinaus', () => {
    // Six macrocycles is roughly eight weeks; stage III starts after that.
    for (let macro = 0; macro < 3; macro++) {
      const state = stageFor(macro, [true, true, true]);
      expect(state.stage.metres ?? 0).toBeLessThanOrEqual(200);
    }
  });

  it('steigert die aeroben Minuten trotzdem nach Phasenziel', () => {
    expect(targetFor(0).aerobicMinutes).toBe(300);
    expect(targetFor(5).aerobicMinutes).toBe(420);
    expect(targetFor(5).aerobicMinutes).toBeGreaterThan(targetFor(0).aerobicMinutes);
  });

  it('wechselt die Laufrichtung von Einheit zu Einheit', () => {
    const a = buildIntervalSession(STAGE_TABLE.I, null, 0, 'P0');
    const b = buildIntervalSession(STAGE_TABLE.I, null, 1, 'P0');
    expect(a.direction).not.toBe(b.direction);
    expect(a.notes.join(' ')).toMatch(/Laufrichtung/);
  });

  it('warnt bei über 5 % Tempoabfall und hält die Stufe zurück', () => {
    expect(paceFade(60, 62).warn).toBe(false);
    expect(paceFade(60, 64).warn).toBe(true);
    // A macrocycle that was not clean blocks the next stage.
    const held = stageFor(6, [false, true]);
    expect(held.heldBack).toBe(true);
    expect(held.stage.key).toBe('II');
  });

  it('nennt die Ersatzreihenfolge ohne Bahn: Feldweg, dann Rad oder Rudern, Straße zuletzt', () => {
    expect(TRACK_FALLBACK.map((f) => f.key)).toEqual(['trail', 'cross', 'road']);
  });
});

describe('Volumen und Überlauf auf Rad und Rudern', () => {
  it('verteilt die Differenz auf Rad oder Rudern, statt das Ziel zu kürzen', () => {
    // The aerobic goal wants +10 %, running is only allowed +8 %.
    const v = planVolume({
      targetAerobicMinutes: 660,
      targetRunShare: 0.5,
      previousAerobicMinutes: 600,
      previousRunMinutes: 300,
      isP0: false,
      runSessionCount: 4,
      stageChange: false,
      isDeload: false,
    });
    expect(v.aerobicMinutes).toBe(660);
    expect(v.runMinutes).toBe(324); // 300 × 1,08
    expect(v.spilledToCross).toBe(6);
    expect(v.runMinutes + v.crossMinutes).toBe(660);
    expect(v.notes.join(' ')).toMatch(/Rad oder Rudergerät/);
  });

  it('hält das aerobe Volumen bei einem Stufenwechsel still', () => {
    const v = planVolume({
      targetAerobicMinutes: 500,
      targetRunShare: 0.5,
      previousAerobicMinutes: 450,
      previousRunMinutes: 220,
      isP0: false,
      runSessionCount: 4,
      stageChange: true,
      isDeload: false,
    });
    expect(v.aerobicMinutes).toBe(450);
    expect(v.notes.join(' ')).toMatch(/Stufenwechsel/);
  });

  it('deckelt in P0 zusätzlich auf +10 min je Laufeinheit', () => {
    const v = planVolume({
      targetAerobicMinutes: 420,
      targetRunShare: 0.4,
      previousAerobicMinutes: 400,
      previousRunMinutes: 120,
      isP0: true,
      runSessionCount: 4,
      stageChange: false,
      isDeload: false,
    });
    expect(v.runMinutes).toBeLessThanOrEqual(120 * 1.08);
  });

  it('hält den Zone-1/2-Anteil über 80 %', () => {
    const p = plan();
    expect(p.macrocycle.baseShare).toBeGreaterThanOrEqual(MIN_BASE_SHARE);
  });
});

describe('Abstufung wechselt zuerst den Modus', () => {
  it('schickt die Intensitätseinheit bei Erholungswert 65 aufs Rad, nicht in den lockeren Lauf', () => {
    const p = plan({ days: days(10, { recovery: new Map([[3, 65]]) }) });
    const unit = unitsOn(p, 3)[0];
    expect(unit.mode).toBe('bike');
    expect(unit.downgradedFrom?.mode).toBe('run');
    expect(unit.reasons.join(' ')).toMatch(/auf dem Rad/);
  });

  it('macht den Moduswechsel zum ersten Kettenglied', () => {
    const chain = chainFor('vo2_intervals', 'run');
    expect(chain[0]).toMatchObject({ kind: 'vo2_intervals', mode: 'run' });
    expect(chain[1]).toMatchObject({ kind: 'vo2_intervals', mode: 'bike' });
    // Only after the mode change does the intensity come down.
    expect(chain[2].kind).toBe('threshold');
  });

  it('verlegt auch die lange Einheit erst aufs Rad, bevor sie kürzt', () => {
    const chain = chainFor('long_z2', 'run');
    expect(chain[1]).toMatchObject({ kind: 'long_z2', mode: 'bike', durationFactor: 1 });
    expect(chain[2].durationFactor).toBeLessThan(1);
  });

  it('stuft Kraft über moderat und beinfrei ab', () => {
    expect(chainFor('strength_heavy', null).map((s) => s.kind)).toEqual([
      'strength_heavy',
      'strength_moderate',
      'strength_legfree',
      'regeneration',
    ]);
  });
});

describe('Harte Regeln', () => {
  it('hat für jede Regel eine Beschreibung in Klartext', () => {
    for (const rule of RULES) {
      expect(rule.description.length).toBeGreaterThan(20);
      expect(ruleById(rule.id)).toBe(rule);
    }
  });

  it('erzeugt den Plan ganz ohne Regelverstöße', () => {
    const p = plan();
    expect(p.violations).toEqual([]);
  });

  it('lässt am Nachtschichttag nichts nach 13:30 enden und keine Intensität zu', () => {
    const p = plan({ days: days(20) });
    for (const day of p.days.filter((d) => d.cycleDay === 2)) {
      for (const unit of day.units) {
        expect(unit.start + unit.durationMinutes).toBeLessThanOrEqual(13 * 60 + 30);
        expect(unit.kind).not.toBe('vo2_intervals');
        expect(unit.kind).not.toBe('strength_heavy');
      }
    }
  });

  it('hält am Schlaftag das Fenster 16:00–20:00 und plant Kraft, keinen Lauf', () => {
    const p = plan({ days: days(20) });
    for (const day of p.days.filter((d) => d.cycleDay === 3)) {
      for (const unit of day.units) {
        expect(unit.start).toBeGreaterThanOrEqual(16 * 60);
        expect(unit.start + unit.durationMinutes).toBeLessThanOrEqual(20 * 60);
        expect(CATALOGUE[unit.kind].discipline).toBe('strength');
      }
    }
  });

  it('lässt den Tagschichttag leer', () => {
    const p = plan({ days: days(20) });
    for (const day of p.days.filter((d) => d.cycleDay === 1)) {
      expect(day.units).toHaveLength(0);
      expect(day.load).toBe(0);
    }
  });

  it('hält am Schlaftag vor dem Lauftag die Kraft beinfrei oder moderat', () => {
    const p = plan({ days: days(10) });
    for (const day of p.days.filter((d) => d.cycleDay === 3)) {
      for (const unit of day.units) {
        expect(['strength_moderate', 'strength_legfree']).toContain(unit.kind);
      }
    }
  });
});

describe('V-Schicht', () => {
  it('plant den Lauf im Dienst mit 30 bis 60 min und holt nichts nach', () => {
    const p = plan({ days: days(10, { vShiftOn: 4 }) });
    const units = unitsOn(p, 4);
    expect(units).toHaveLength(1);
    expect(units[0].mode).toBe('run');
    expect(units[0].durationMinutes).toBeGreaterThanOrEqual(30);
    expect(units[0].durationMinutes).toBeLessThanOrEqual(60);
    expect(units[0].reasons.join(' ')).toMatch(/im Dienst/);
    // The lost minutes are not added to the following cycle.
    const laterCycle = unitsOn(p, 9);
    const normal = plan({ days: days(10) });
    expect(laterCycle[0]?.durationMinutes).toBe(
      normal.days.find((d) => d.date === addDays(START, 9))?.units[0]?.durationMinutes,
    );
  });
});

describe('WHOOP', () => {
  it('erkennt den Vorschlaf 15:00–17:30 als Nap', () => {
    const nap = assignSleep({ start: '2026-09-08T15:00:00', end: '2026-09-08T17:30:00', kind: 'main' });
    expect(nap.kind).toBe('nap');
    expect(nap.assignedTo).toBe('2026-09-08');
  });

  it('ordnet den Tagschlaf 08:00–14:00 dem Zyklustag 3 zu', () => {
    const sleep = assignSleep({ start: '2026-09-09T08:00:00', end: '2026-09-09T14:00:00', kind: 'main' });
    expect(sleep.kind).toBe('main');
    expect(sleep.assignedTo).toBe('2026-09-09');
  });

  it('ordnet den gewöhnlichen Nachtschlaf dem Aufwachtag zu', () => {
    const sleep = assignSleep({ start: '2026-09-08T22:45:00', end: '2026-09-09T06:45:00', kind: 'main' });
    expect(sleep.assignedTo).toBe('2026-09-09');
  });

  it('stuft bei Recovery 45 % nicht ab, wenn die Baseline dieses Zyklustags 48 % ist', () => {
    const history = Array.from({ length: 10 }, (_, i) => ({
      date: addDays(START, -i * 5) as ISODate,
      cycleDay: 3,
      value: 48,
    }));
    const baseline = baselineFor(history, 3);
    expect(baseline.ready).toBe(true);
    expect(baseline.value).toBe(48);

    const w = windowsFor(3, 5 * 60 + 30);
    const recovery = computeRecovery({
      date: START,
      cycleDay: 3,
      isVShift: false,
      outOfRotation: null,
      sleepTargetMinutes: w.sleepTargetMinutes,
      napExpected: false,
      recoveryPct: 45,
      recoveryBaseline: baseline,
    });
    // 45 against a baseline of 48 is a normal sleep day, not a warning.
    expect(recovery.adjustments).toEqual([]);
    expect(recovery.value).toBe(60);
  });

  it('arbeitet ohne genug Historie im manuellen Modus ohne automatische Abstufung', () => {
    const w = windowsFor(4, 5 * 60 + 30);
    const recovery = computeRecovery({
      date: START,
      cycleDay: 4,
      isVShift: false,
      outOfRotation: null,
      sleepTargetMinutes: w.sleepTargetMinutes,
      napExpected: false,
      recoveryPct: 30,
      recoveryBaseline: { value: null, samples: 2, ready: false },
    });
    expect(recovery.manualMode).toBe(true);
    expect(recovery.adjustments).toEqual([]);
  });
});

describe('Schmerz und Deload', () => {
  it('lässt die Einheit bei Schmerz beim Gehen entfallen und warnt', () => {
    const w = windowsFor(4, 5 * 60 + 30);
    const recovery = computeRecovery({
      date: START,
      cycleDay: 4,
      isVShift: false,
      outOfRotation: null,
      sleepTargetMinutes: w.sleepTargetMinutes,
      napExpected: false,
      painWhileWalking: true,
    });
    expect(recovery.blocked).toBe(true);
    expect(recovery.blockedReason).toMatch(/Schmerz/);
  });

  it('macht jeden vierten Zyklus zum Deload ohne Intensitätseinheit', () => {
    const p = plan({ days: days(20) });
    const deloads = p.cycles.filter((c) => c.isDeload);
    expect(deloads.length).toBeGreaterThan(0);
    for (const cycle of deloads) {
      for (const day of cycle.days) {
        for (const unit of day.units) expect(unit.kind).not.toBe('vo2_intervals');
      }
    }
  });
});

describe('Der Plan endet nicht', () => {
  it('wechselt nach P2 in die Blockrotation statt aufzuhören', () => {
    expect(phaseFor(40).key).toBe('P3');
    expect(blockFor(30)?.key).toBe('volume');
    expect(blockFor(33)?.key).toBe('vo2max');
    expect(blockFor(36)?.key).toBe('threshold');
    expect(blockFor(39)?.key).toBe('volume');
  });

  it('hat für jede Phase ein aerobes Ziel und einen Laufanteil', () => {
    for (const macro of [0, 6, 18, 30, 60]) {
      const t = targetFor(macro);
      expect(t.aerobicMinutes).toBeGreaterThan(0);
      expect(t.runShare).toBeGreaterThan(0);
      expect(t.runShare).toBeLessThanOrEqual(0.75);
    }
  });

  it('kennt keinen Zieltermin und keinen Taper', () => {
    // P3 has no successor: the phase table simply stops handing out new ones.
    expect(phaseFor(1000).key).toBe('P3');
  });
});

describe('Signale aus dem Schlafmodul', () => {
  it('löst bei Schlafschuld über 8 h einen Deload aus, unabhängig vom Rhythmus', () => {
    const p = plan({
      sleep: {
        debtHours: 9,
        downgradeNextHard: true,
        forceDeload: true,
        blockHardAfter: [],
        warnings: ['Schlafschuld 9.0 h im Makrozyklus — ein Deload wird ausgelöst.'],
      },
    });
    // Every cycle in the horizon is a deload, whatever the four-cycle rhythm says.
    expect(p.cycles.every((c) => c.isDeload)).toBe(true);
    expect(p.warnings.join(' ')).toMatch(/Deload/);
    for (const unit of allUnits(p)) expect(unit.kind).not.toBe('vo2_intervals');
  });

  it('stuft bei Schlafschuld über 5 h genau die nächste harte Einheit ab', () => {
    const p = plan({
      sleep: {
        debtHours: 6,
        downgradeNextHard: true,
        forceDeload: false,
        blockHardAfter: [],
        warnings: [],
      },
    });
    const key = unitsOn(p, 3)[0];
    expect(key.kind).not.toBe('vo2_intervals');
    expect(key.reasons.join(' ')).toMatch(/Schlafschuld/);
    // Only the next one: the long session of the second cycle stays.
    const second = unitsOn(p, 8)[0];
    expect(second.reasons.join(' ')).not.toMatch(/Schlafschuld/);
  });

  it('lässt nach einem Tagschlaf unter 5 h am Folgetag keine harte Einheit zu', () => {
    const p = plan({
      sleep: {
        debtHours: 0,
        downgradeNextHard: false,
        forceDeload: false,
        blockHardAfter: [addDays(START, 2)],
        warnings: [],
      },
    });
    const dayAfter = unitsOn(p, 3)[0];
    expect(CATALOGUE[dayAfter.kind].load).toBeLessThan(60);
    expect(dayAfter.reasons.join(' ')).toMatch(/Tagschlaf gestern unter 5 h/);
  });

  it('ändert ohne Signale nichts', () => {
    const withSignals = plan({
      sleep: { debtHours: 2, downgradeNextHard: false, forceDeload: false, blockHardAfter: [], warnings: [] },
    });
    const without = plan();
    expect(allUnits(withSignals).map((u) => u.kind)).toEqual(allUnits(without).map((u) => u.kind));
  });
});
