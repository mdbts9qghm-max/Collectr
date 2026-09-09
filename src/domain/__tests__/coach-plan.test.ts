import { describe, expect, it } from 'vitest';
import type { ISODate } from '../types.ts';
import type { DayContext } from '../coach/coach.ts';
import { buildCoachPlan } from '../coach/coach.ts';
import { CATALOGUE, HARD_LOAD, bearableStep, chainFor, stepDown } from '../coach/catalogue.ts';
import { FIXED_ZONES, proposeZones, retestState, zoneFor } from '../coach/zones.ts';
import { isDeloadCycle, targetFor } from '../coach/phases.ts';
import { STAGE_TABLE, stageFor } from '../coach/intervals.ts';
import { planStrength } from '../coach/strength.ts';
import { addDays, diffDays } from '../date.ts';

const ROT: (1 | 2 | 3 | 4 | 5)[] = [1, 2, 3, 4, 5];
const RECOVERY: Record<number, number> = { 1: 0, 2: 75, 3: 62, 4: 95, 5: 88 };

/**
 * Ein Blickfeld um `anchor`, in dem die Rotation sauber durchläuft. Der
 * Ankertag bekommt den gewünschten Zyklustag, alles andere zählt von dort weg.
 */
function context(
  anchor: ISODate,
  anchorCycleDay: 1 | 2 | 3 | 4 | 5,
  overrides: Partial<Record<number, Partial<DayContext>>> = {},
): DayContext[] {
  const from = addDays(anchor, -27);
  return Array.from({ length: 55 }, (_, i) => {
    const offset = i - 27;
    const cycleDay = ROT[(((anchorCycleDay - 1 + offset) % 5) + 5) % 5];
    const date = addDays(from, i);
    return {
      date,
      cycleDay,
      isVShift: false,
      outOfRotation: null,
      recovery: RECOVERY[cycleDay],
      done: date < anchor,
      ...(overrides[offset] ?? {}),
    } as DayContext;
  });
}

function plan(anchor: ISODate, cycleDay: 1 | 2 | 3 | 4 | 5, extra: Record<string, unknown> = {}) {
  return buildCoachPlan({
    anchor,
    days: context(anchor, cycleDay, (extra.overrides as never) ?? {}),
    dayShiftWakeMinutes: 5 * 60 + 30,
    cycleIndex: 4,
    previousRunMinutes: 300,
    ...extra,
  });
}

const ANCHOR: ISODate = '2026-09-10';

describe('Coach-Plan — der Tag', () => {
  it('trainiert am Tagschichttag nicht und sagt warum', () => {
    const p = plan(ANCHOR, 1);
    expect(p.today.kind).toBe('ruhe');
    expect(p.today.verdict).toBe('ruhe');
    expect(p.today.headline).toMatch(/Tagschicht/);
  });

  it('legt die Bahn auf den ersten freien Tag und nennt die Stufe', () => {
    const p = plan(ANCHOR, 4);
    expect(p.today.kind).toBe('intervall');
    expect(p.today.verdict).toBe('los');
    expect(p.today.headline).toMatch(/Bahn/);
    expect(p.today.reasons.some((r) => r.title.startsWith('Bahnstufe'))).toBe(true);
    expect(p.today.steps.join(' ')).toMatch(/einlaufen/);
  });

  it('stuft bei schlechter Erholung ab, statt die Einheit zu streichen', () => {
    const p = plan(ANCHOR, 4, { overrides: { 0: { recovery: 45 } } });
    expect(p.today.plannedKind).toBe('intervall');
    expect(p.today.kind).toBe('lockerer_lauf');
    expect(p.today.stepsDown).toBe(2);
    expect(p.today.verdict).toBe('reduziert');
    expect(p.today.reasons.some((r) => r.effect === 'stuft ab')).toBe(true);
  });

  it('geht bei sehr schlechter Erholung bis aufs Gehen zurück, nicht aufs Rad', () => {
    const p = plan(ANCHOR, 4, { overrides: { 0: { recovery: 20 } } });
    expect(p.today.kind).toBe('gehen');
    expect(p.today.steps.join(' ')).toMatch(/letzte Stufe vor Ruhe/);
  });

  it('läuft an der V-Schicht im Dienst, 30 bis 60 Minuten locker', () => {
    const p = plan(ANCHOR, 4, { overrides: { 0: { isVShift: true, recovery: 65 } } });
    expect(p.today.kind).toBe('lockerer_lauf');
    expect(p.today.minutes).toBeGreaterThanOrEqual(30);
    expect(p.today.minutes).toBeLessThanOrEqual(60);
    expect(p.today.reasons.some((r) => r.title === 'V-Schicht')).toBe(true);
  });
});

describe('Coach — das Blickfeld', () => {
  it('schaut 27 Tage zurück und 27 voraus', () => {
    const p = plan(ANCHOR, 4);
    expect(p.horizon.back).toBe(27);
    expect(p.horizon.forward).toBe(27);
    expect(p.notes[0].offset).toBe(-27);
    expect(p.notes[p.notes.length - 1].offset).toBe(27);
  });

  it('begründet den Tag mit anderen Tagen', () => {
    const p = plan(ANCHOR, 5);
    const dated = p.today.reasons.filter((r) => r.date != null && r.date !== ANCHOR);
    expect(dated.length).toBeGreaterThan(0);
  });

  it('lässt an den Rändern des Blickfelds keine Regel mehr greifen', () => {
    const p = plan(ANCHOR, 4);
    expect(p.notes.find((n) => n.offset === -27)!.reaching.length).toBe(1);
    expect(p.notes.find((n) => n.offset === 0)!.reaching.length).toBeGreaterThan(5);
  });
});

describe('Coach — die harten Regeln im erzeugten Plan', () => {
  const p = plan(ANCHOR, 4);
  const future = p.timeline.days.filter((d) => d.date >= ANCHOR);

  it('erzeugt keinen Plan, der die eigenen Regeln verletzt', () => {
    expect(p.findings.filter((f) => f.severity === 'blocker')).toEqual([]);
  });

  it('hält 48 Stunden zwischen harten Läufen', () => {
    const hard = future.filter((d) => d.run && d.run.load >= HARD_LOAD).map((d) => d.date);
    for (let i = 1; i < hard.length; i++) {
      expect(diffDays(hard[i], hard[i - 1])).toBeGreaterThanOrEqual(2);
    }
  });

  it('plant nie zwei Läufe an einem Tag, aber Kraft neben dem Lauf', () => {
    for (const day of future) {
      expect(Array.isArray(day.run)).toBe(false);
      if (day.strength) expect(CATALOGUE[day.strength.kind].discipline).toBe('kraft');
    }
    expect(future.some((d) => d.run && d.strength)).toBe(true);
  });

  it('legt keine schwere Beinkraft in die 24 Stunden vor einer Schlüsseleinheit', () => {
    for (const day of future) {
      if (!day.strength || !CATALOGUE[day.strength.kind].legHeavy) continue;
      const next = future.find((d) => d.date === addDays(day.date, 1));
      expect(next?.run ? CATALOGUE[next.run.kind].isKeySession : false).toBe(false);
    }
  });

  it('beendet das Training am Nachtschichttag vor 13:30', () => {
    for (const day of future.filter((d) => d.cycleDay === 2)) {
      for (const item of [day.run, day.strength]) {
        if (!item) continue;
        expect((item.startMinutes ?? 0) + item.minutes).toBeLessThanOrEqual(13 * 60 + 30);
      }
    }
  });

  it('gibt jedem Zyklus einen lastfreien Tag und höchstens eine Schlüsseleinheit', () => {
    const cycles: (typeof future)[] = [];
    let cur: typeof future = [];
    for (const d of future) {
      if (d.cycleDay === 1 && cur.length) {
        cycles.push(cur);
        cur = [];
      }
      cur.push(d);
    }
    for (const cycle of cycles.filter((c) => c.length === 5)) {
      expect(cycle.some((d) => !d.run && !d.strength)).toBe(true);
      const keys = cycle.filter((d) => d.run && CATALOGUE[d.run.kind].isKeySession);
      expect(keys.length).toBeLessThanOrEqual(1);
    }
  });

  it('hält den Grundlagenanteil über 80 % der Laufminuten', () => {
    const window = future.slice(0, 10);
    const total = window.reduce((s, d) => s + (d.run?.minutes ?? 0), 0);
    const hard = window.reduce((s, d) => s + (d.run?.hardMinutes ?? 0), 0);
    expect((total - hard) / total).toBeGreaterThanOrEqual(0.8);
  });

  it('kennt keine andere Sportart als Laufen', () => {
    const kinds = new Set(future.map((d) => d.run?.kind).filter((k) => k != null));
    for (const kind of kinds) {
      expect(CATALOGUE[kind!].discipline).toBe('lauf');
    }
  });
});

describe('Abstufungsketten', () => {
  it('enden auf Gehen und dann Ruhe', () => {
    for (const kind of ['intervall', 'longrun', 'grundlagenlauf', 'lockerer_lauf'] as const) {
      const chain = chainFor(kind);
      expect(chain[chain.length - 1]).toBe('ruhe');
      expect(chain[chain.length - 2]).toBe('gehen');
    }
  });

  it('führen die Intensität über die kürzere Fassung zum lockeren Lauf', () => {
    expect(chainFor('intervall')).toEqual([
      'intervall',
      'intervall_kurz',
      'lockerer_lauf',
      'gehen',
      'ruhe',
    ]);
    expect(stepDown('intervall')).toBe('intervall_kurz');
    expect(stepDown('ruhe')).toBeNull();
  });

  it('führen den Longrun über die verkürzte Fassung', () => {
    expect(chainFor('longrun')[1]).toBe('longrun_verkuerzt');
  });

  it('wählen die tiefste Stufe, die der Erholungswert trägt', () => {
    expect(bearableStep('intervall', 95)).toBe('intervall');
    expect(bearableStep('intervall', 72)).toBe('intervall_kurz');
    expect(bearableStep('intervall', 40)).toBe('lockerer_lauf');
    expect(bearableStep('intervall', 10)).toBe('gehen');
  });
});

describe('Phasen und Volumen', () => {
  it('startet P0 bei 300 Laufminuten je 10 Tage', () => {
    const t = targetFor({ macrocycleIndex: 0, previousRunMinutes: null });
    expect(t.phase.id).toBe('P0');
    expect(t.runMinutes).toBe(300);
    expect(t.limitedBy).toBe('start');
  });

  it('lässt die Grenze gewinnen, wenn das Phasenziel mehr verlangt', () => {
    const t = targetFor({ macrocycleIndex: 4, previousRunMinutes: 300 });
    expect(t.phaseTarget).toBeGreaterThan(t.runMinutes);
    expect(t.runMinutes).toBe(324);
    expect(t.limitedBy).toBe('wachstum');
    expect(t.reason).toMatch(/verschiebt sich nach hinten/);
  });

  it('hält das Volumen im Phasenwechsel konstant', () => {
    const t = targetFor({ macrocycleIndex: 6, previousRunMinutes: 400, phaseChanging: true });
    expect(t.runMinutes).toBe(400);
    expect(t.limitedBy).toBe('phasenwechsel');
  });

  it('macht jeden vierten Zyklus zum Deload', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(isDeloadCycle)).toEqual([
      false, false, false, true, false, false, false, true,
    ]);
  });

  it('wächst nie über 8 % je Makrozyklus', () => {
    let previous = 300;
    for (let m = 1; m < 30; m++) {
      const t = targetFor({ macrocycleIndex: m, previousRunMinutes: previous });
      expect(t.runMinutes).toBeLessThanOrEqual(Math.floor(previous * 1.08));
      previous = t.runMinutes;
    }
    expect(previous).toBeGreaterThan(700);
  });
});

describe('Bahnstufen', () => {
  it('beginnt bei 8 × 100 m', () => {
    expect(stageFor([]).stage.id).toBe('I');
    expect(STAGE_TABLE[STAGE_TABLE.length - 1].label).toBe('4 × 4 Minuten');
  });

  it('braucht zwei saubere Zyklen je Stufe', () => {
    expect(stageFor([true]).stage.id).toBe('I');
    expect(stageFor([true, true]).stage.id).toBe('II');
    expect(stageFor([true, true, true, true]).stage.id).toBe('III');
  });

  it('setzt den Zähler bei einem unsauberen Zyklus zurück, ohne die Stufe zu verlieren', () => {
    expect(stageFor([true, true, true, false, true]).stage.id).toBe('II');
  });

  it('bleibt auf der letzten Stufe stehen', () => {
    expect(stageFor(new Array(40).fill(true)).stage.id).toBe('V');
  });
});

describe('Kraft', () => {
  const base = {
    recovery: 90,
    hasWindow: true,
    availableMinutes: 120,
    hardRunTomorrow: false,
    hardRunToday: false,
    hardRunYesterday: false,
    isDeload: false,
    daysSinceStrength: 3,
  };

  it('plant bei guter Erholung schwere Beine und rechnet die Intensität', () => {
    const p = planStrength(base);
    expect(p.kind).toBe('kraft_ganzkoerper');
    expect(p.rpe).toBeGreaterThanOrEqual(8);
    expect(p.percentOfMax).toBeGreaterThanOrEqual(82);
    expect(p.blocks.some((b) => b.name.includes('Kniebeuge'))).toBe(true);
  });

  it('nimmt die Beine raus, wenn morgen die Bahn steht — ohne die Einheit zu streichen', () => {
    const p = planStrength({ ...base, hardRunTomorrow: true });
    expect(p.kind).toBe('kraft_oberkoerper');
    expect(p.blocks.every((b) => !b.name.includes('Kniebeuge'))).toBe(true);
    expect(p.reason).toMatch(/24-Stunden-Sperre/);
  });

  it('macht die Einheit leichter statt sie ausfallen zu lassen', () => {
    const p = planStrength({ ...base, recovery: 40, hardRunToday: true });
    expect(p.kind).toBe('kraft_leicht');
    expect(p.reason).toMatch(/Kraft fällt nicht aus/);
  });

  it('lässt sie nur ohne Fenster und bei sehr schlechter Erholung ganz weg', () => {
    expect(planStrength({ ...base, hasWindow: false }).kind).toBeNull();
    expect(planStrength({ ...base, recovery: 20 }).kind).toBeNull();
  });
});

describe('Zonen', () => {
  it('stehen fest in Schlägen', () => {
    expect(FIXED_ZONES.ranges).toEqual([
      [114, 138],
      [139, 160],
      [161, 175],
      [176, 190],
      [191, 205],
    ]);
    expect(zoneFor(150)).toBe(2);
    expect(zoneFor(200)).toBe(5);
    expect(zoneFor(90)).toBeNull();
  });

  it('schlägt nach dem Test neue Grenzen vor, ohne sie zu setzen', () => {
    const p = proposeZones(182, FIXED_ZONES, '2026-09-10');
    expect(p.delta).toBe(7);
    expect(p.proposed.ranges[2][1]).toBe(182);
    expect(p.proposed.ranges[3][0]).toBe(183);
    expect(p.withinNoise).toBe(false);
    expect(FIXED_ZONES.ranges[2][1]).toBe(175);
  });

  it('nennt eine Verschiebung im Rauschen beim Namen', () => {
    const p = proposeZones(177, FIXED_ZONES, '2026-09-10');
    expect(p.withinNoise).toBe(true);
    expect(p.verdict).toMatch(/Rauschen/);
  });

  it('warnt vor einem tieferen Wert, statt ihn als Formverlust zu verkaufen', () => {
    expect(proposeZones(165, FIXED_ZONES, '2026-09-10').verdict).toMatch(/Ermüdung/);
  });

  it('meldet den Test nach zehn bis zwölf Wochen als fällig', () => {
    const bounds = { ...FIXED_ZONES, acceptedOn: '2026-06-01' };
    expect(retestState(bounds, '2026-08-20').status).toBe('faellig');
    expect(retestState(bounds, '2026-09-10').status).toBe('ueberfaellig');
    expect(retestState(FIXED_ZONES, '2026-09-10').status).toBe('nie');
  });
});

/**
 * Die Signale des Schlafmoduls.
 *
 * Diese Tests stehen hier, weil genau diese Drähte beim Neuaufbau des Coaches
 * schon einmal abgerissen sind: das Schlafmodul rechnete weiter, und niemand
 * hörte zu. Ein Signal ohne Test ist ein Signal, das man verlieren kann.
 */
describe('Schlafsignale greifen ins Training', () => {
  const withSleep = (sleep: {
    debtHours: number;
    downgradeNextHard: boolean;
    forceDeload: boolean;
  }) => plan(ANCHOR, 4, { sleep });

  it('stuft bei Schlafschuld genau die nächste harte Einheit ab', () => {
    const before = plan(ANCHOR, 4);
    expect(before.today.kind).toBe('intervall');

    const after = withSleep({ debtHours: 6.2, downgradeNextHard: true, forceDeload: false });
    expect(after.today.kind).toBe('intervall_kurz');
    expect(after.today.stepsDown).toBe(1);
    expect(after.today.reasons.some((r) => r.title.includes('Schlafschuld'))).toBe(true);
  });

  it('stuft nur eine einzige harte Einheit ab, nicht jede', () => {
    const after = withSleep({ debtHours: 6.2, downgradeNextHard: true, forceDeload: false });
    const future = after.timeline.days.filter((d) => d.date >= ANCHOR);
    const downgraded = future.filter((d) => d.downgraded && d.run && d.run.load >= 40);
    expect(downgraded.length).toBeLessThanOrEqual(1);

    // Der Longrun weiter hinten bleibt stehen — die Schuld ist abgegolten.
    const longrun = future.find((d) => d.run?.kind === 'longrun');
    expect(longrun).toBeDefined();
  });

  it('erzwingt bei großer Schlafschuld einen Deload, egal wo der Rhythmus steht', () => {
    const normal = plan(ANCHOR, 4);
    expect(normal.isDeload).toBe(false);

    const forced = withSleep({ debtHours: 9.4, downgradeNextHard: true, forceDeload: true });
    expect(forced.isDeload).toBe(true);
    expect(forced.today.reasons.some((r) => r.title.includes('Deload erzwungen'))).toBe(true);
    // Ein Deload-Zyklus trägt keine Intensität.
    const cycle = forced.timeline.days.filter((d) => d.date >= ANCHOR).slice(0, 5);
    expect(cycle.every((d) => d.run?.kind !== 'intervall')).toBe(true);
  });

  it('lässt ohne Signale alles, wie es ist', () => {
    const quiet = withSleep({ debtHours: 1.2, downgradeNextHard: false, forceDeload: false });
    expect(quiet.today.kind).toBe(plan(ANCHOR, 4).today.kind);
    expect(quiet.isDeload).toBe(false);
  });
});
