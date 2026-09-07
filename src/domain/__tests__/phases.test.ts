import { describe, expect, it } from 'vitest';
import type { ISODate, TrainingPlan } from '../types.ts';
import {
  MESOCYCLE_WAVE,
  RECOVERY_RAMP,
  planEndDate,
  planStatus,
  weekTarget,
  weeksSincePlanEnd,
} from '../phases.ts';
import { defaultTrainingPlan } from '../../data/defaults.ts';
import { addDays } from '../date.ts';

const CAP = 12;

/**
 * The default plan, pinned to a fixed Monday so the week maths is stable.
 *
 * The day offsets are preserved exactly. Rounding them to whole weeks would
 * collapse the one-day gap between the taper's last day and the recovery
 * phase's first, and the two phases would overlap.
 */
function plan(): TrainingPlan {
  const p = defaultTrainingPlan();
  const start: ISODate = '2026-01-05'; // a Monday
  const days = (date: ISODate) =>
    Math.round((new Date(date).getTime() - new Date(p.startDate).getTime()) / 864e5);
  const offsets = p.phases.map((phase) => ({ start: days(phase.startDate), end: days(phase.endDate) }));
  p.phases = p.phases.map((phase, i) => ({
    ...phase,
    startDate: addDays(start, offsets[i].start),
    endDate: addDays(start, offsets[i].end),
  }));
  p.startDate = start;
  return p;
}

describe('Der Plan endet nicht im Nichts', () => {
  it('hängt eine Erholungsphase hinter den Taper', () => {
    const kinds = defaultTrainingPlan().phases.map((p) => p.kind);
    expect(kinds).toEqual(['base', 'build', 'peak', 'taper', 'recovery']);
  });

  it('lässt die Erholungsphase direkt an den Taper anschließen, ohne Lücke', () => {
    const phases = defaultTrainingPlan().phases;
    const taper = phases[3];
    const recovery = phases[4];
    expect(recovery.startDate).toBe(addDays(taper.endDate, 1));
  });

  it('nimmt in der Erholungsphase Intensität und Laufanteil zurück', () => {
    const recovery = defaultTrainingPlan().phases[4];
    expect(recovery.intensityDistribution.hard).toBe(0);
    // Less running than any other phase: the impact is what needs the break.
    const runShares = defaultTrainingPlan().phases.map((p) => p.sportFocus.run ?? 0);
    expect(recovery.sportFocus.run).toBe(Math.min(...runShares));
  });
});

describe('Erholungsphase baut auf, statt zu wellen', () => {
  it('startet niedrig und steigt über die Phase an', () => {
    const p = plan();
    const recovery = p.phases[4];
    const factors = [0, 1, 2, 3].map(
      (w) => weekTarget(p, addDays(recovery.startDate, w * 7), CAP, 1).waveFactor,
    );
    expect(factors).toEqual(RECOVERY_RAMP);
    // Strictly rising — no peak week, no deload inside a recovery phase.
    for (let i = 1; i < factors.length; i++) expect(factors[i]).toBeGreaterThan(factors[i - 1]);
  });

  it('wellt in einer normalen Phase weiter wie bisher', () => {
    const p = plan();
    const base = p.phases[0];
    const factors = [0, 1, 2, 3].map(
      (w) => weekTarget(p, addDays(base.startDate, w * 7), CAP, 1).waveFactor,
    );
    expect(factors).toEqual(MESOCYCLE_WAVE);
  });
});

describe('Nach dem Ende des Plans', () => {
  const p = plan();
  const end = planEndDate(p)!;

  it('erkennt, dass der Plan ausgelaufen ist', () => {
    expect(planStatus(p, end)).toBe('active');
    expect(planStatus(p, addDays(end, 1))).toBe('ended');
    expect(planStatus(null, end)).toBe('none');
    expect(planStatus(p, addDays(p.startDate, -7))).toBe('before');
  });

  it('zählt die Wochen seit dem Planende', () => {
    expect(weeksSincePlanEnd(p, end, 1)).toBe(0);
    expect(weeksSincePlanEnd(p, addDays(end, 7), 1)).toBe(2);
  });

  it('lässt die Welle weiterlaufen, statt auf Woche eins einzufrieren', () => {
    // This is the bug: without an active phase the week index used to freeze at
    // one, so the factor stayed 1.0 and the deload never came again — the app
    // quietly prescribed a full week, every week, forever.
    const factors = [1, 2, 3, 4, 5, 6, 7, 8].map(
      (w) => weekTarget(p, addDays(end, w * 7), CAP, 1).waveFactor,
    );
    expect(new Set(factors).size).toBeGreaterThan(1);
    expect(factors).toContain(0.68);
  });

  it('legt nach dem Planende weiter Entlastungswochen ein', () => {
    const deloads = [1, 2, 3, 4, 5, 6, 7, 8]
      .map((w) => weekTarget(p, addDays(end, w * 7), CAP, 1))
      .filter((t) => t.deload);
    expect(deloads.length).toBeGreaterThanOrEqual(2);
  });

  it('meldet den Zustand nach außen, statt ihn zu verschlucken', () => {
    const t = weekTarget(p, addDays(end, 14), CAP, 1);
    expect(t.status).toBe('ended');
    expect(t.weeksPastPlan).toBeGreaterThan(0);
    expect(t.phase).toBeNull();
  });

  it('ändert nichts an einer laufenden Phase', () => {
    const t = weekTarget(p, addDays(p.startDate, 7), CAP, 1);
    expect(t.status).toBe('active');
    expect(t.weeksPastPlan).toBe(0);
  });
});
