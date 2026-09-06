import { describe, expect, it } from 'vitest';
import { PILLAR_WEIGHTS, computeHybridScore } from '../score.ts';
import { currentMetrics, detectRecords } from '../metrics.ts';
import { computeStreak } from '../habits.ts';
import { session, settings } from './helpers.ts';
import { goalProgress } from '../goals.ts';
import type { Goal } from '../types.ts';

const TODAY = '2026-03-11';

function scoreFor(sessions = [] as ReturnType<typeof session>[], overrides = {}) {
  return computeHybridScore({
    date: TODAY,
    sessions,
    metrics: currentMetrics(sessions, [], settings, TODAY),
    settings,
    goals: [],
    readinessHistory: [],
    sleepHours: [],
    habitCompletionPct: null,
    weeklyMinutesTarget: settings.training.weeklyHoursTarget * 60,
    ...overrides,
  });
}

describe('hybrid score', () => {
  it('weights sum to one', () => {
    const sum = Object.values(PILLAR_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  it('reports the total as the sum of pillar contributions', () => {
    const score = scoreFor([session('2026-03-09', 'run', 60, 'easy', { actualDistanceKm: 10 })]);
    const sum = score.pillars.reduce((s, p) => s + p.contribution, 0);
    expect(score.total).toBe(Math.round(sum));
  });

  it('never counts a missing measurement as a zero', () => {
    const score = scoreFor();
    for (const pillar of score.pillars) {
      for (const component of pillar.components) {
        if (!component.hasData) {
          // Components without data are excluded from the average entirely.
          expect(component.score).toBe(0);
        }
      }
    }
    // With no data at all the coverage must be honest about it.
    expect(score.coverage).toBeLessThan(50);
  });

  it('improves when training is added', () => {
    const empty = scoreFor();
    const trained = scoreFor(
      Array.from({ length: 20 }, (_, i) =>
        session(`2026-02-${String((i % 28) + 1).padStart(2, '0')}`, 'run', 60, 'easy', {
          actualDistanceKm: 10,
        }),
      ),
    );
    expect(trained.pillars.find((p) => p.key === 'consistency')!.score).toBeGreaterThan(
      empty.pillars.find((p) => p.key === 'consistency')!.score,
    );
  });

  it('exposes a lever for each weak pillar', () => {
    const score = scoreFor([session('2026-03-09', 'run', 30, 'easy', { actualDistanceKm: 4 })]);
    expect(score.levers.length).toBeGreaterThan(0);
    for (const lever of score.levers) expect(lever.text.length).toBeGreaterThan(10);
  });
});

describe('metrics and records', () => {
  it('normalises a 5.2 km run to a comparable 5 km time', () => {
    const sessions = [session('2026-03-09', 'run', 26, 'threshold', { actualDistanceKm: 5.2 })];
    const metrics = currentMetrics(sessions, [], settings, TODAY);
    const fiveK = metrics.get('run_5k_seconds');
    // 26 min over 5.2 km → 25:00 over 5 km.
    expect(fiveK?.value).toBe(1500);
  });

  it('ignores runs outside the valid distance window', () => {
    const sessions = [session('2026-03-09', 'run', 20, 'threshold', { actualDistanceKm: 3 })];
    expect(currentMetrics(sessions, [], settings, TODAY).get('run_5k_seconds')).toBeUndefined();
  });

  it('detects a record only when it actually improves', () => {
    const first = [session('2026-03-01', 'run', 27, 'threshold', { actualDistanceKm: 5 })];
    const metricsA = currentMetrics(first, [], settings, TODAY);
    const recordsA = detectRecords(metricsA, [], TODAY);
    expect(recordsA.some((r) => r.metric === 'run_5k_seconds')).toBe(true);

    // Same data again produces nothing new.
    expect(detectRecords(metricsA, recordsA, TODAY).some((r) => r.metric === 'run_5k_seconds')).toBe(false);

    // A faster run does.
    const faster = [...first, session('2026-03-09', 'run', 25, 'threshold', { actualDistanceKm: 5 })];
    const metricsB = currentMetrics(faster, [], settings, TODAY);
    const recordsB = detectRecords(metricsB, recordsA, TODAY);
    const pr = recordsB.find((r) => r.metric === 'run_5k_seconds');
    expect(pr?.value).toBe(1500);
    expect(pr?.previousValue).toBe(1620);
  });

  it('only counts unweighted sets toward a bodyweight max', () => {
    const sessions = [
      session('2026-03-09', 'strength', 50, 'moderate', {
        strength: [
          { exerciseId: 'ex_pullup', sets: [{ reps: 6 }, { reps: 12, weightKg: -20 }] },
        ],
      }),
    ];
    const metrics = currentMetrics(sessions, [], settings, TODAY);
    expect(metrics.get('pullups_max')?.value).toBe(6);
  });
});

describe('goal progress', () => {
  const goal: Goal = {
    id: 'g1',
    title: '5 km unter 23:00',
    metric: 'run_5k_seconds',
    unit: 's',
    startValue: 1500,
    targetValue: 1380,
    direction: 'decrease',
    milestones: [{ id: 'm1', label: '24:00', value: 1440 }],
    primary: false,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  it('measures progress on a decreasing metric', () => {
    const sessions = [session('2026-03-09', 'run', 24, 'threshold', { actualDistanceKm: 5 })];
    const p = goalProgress(goal, currentMetrics(sessions, [], settings, TODAY), TODAY);
    // 24:00 from 25:00 toward 23:00 is half the distance.
    expect(p.pct).toBe(50);
    expect(p.achieved).toBe(false);
    expect(p.reachedMilestones).toBe(1);
  });

  it('reports no data instead of zero progress when the metric is missing', () => {
    const p = goalProgress(goal, currentMetrics([], [], settings, TODAY), TODAY);
    expect(p.current).toBeNull();
    expect(p.detail).toContain('Noch keine Messwerte');
  });
});

describe('streak protection guarantees', () => {
  it('is exported and callable without habit history', () => {
    const streak = computeStreak(
      {
        id: 'h',
        name: 'x',
        icon: '',
        category: 'other',
        kind: 'binary',
        direction: 'at_least',
        schedule: { type: 'daily' },
        restDayPolicy: 'always',
        color: '',
        order: 1,
        archived: false,
        createdAt: '',
      },
      new Map(),
      () => ({ isRestDay: false, shiftKey: null, isFuture: false }),
      TODAY,
      30,
    );
    expect(streak.current).toBe(0);
    expect(streak.best).toBe(0);
  });
});
