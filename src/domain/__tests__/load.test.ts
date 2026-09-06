import { describe, expect, it } from 'vitest';
import {
  consecutiveTrainingDays,
  daysSince,
  isHardSession,
  isLongSession,
  loadStateOn,
  periodStats,
  sessionLoad,
} from '../load.ts';
import { session } from './helpers.ts';

describe('sessionLoad', () => {
  it('scales one hour at threshold to 100 points', () => {
    expect(sessionLoad(session('2026-01-05', 'run', 60, 'threshold'))).toBe(100);
  });

  it('prefers a logged RPE over the intensity default', () => {
    const withRpe = session('2026-01-05', 'run', 60, 'easy', { rpe: 9 });
    expect(sessionLoad(withRpe)).toBe(120);
  });

  it('prefers per-zone minutes over everything else', () => {
    const zoned = session('2026-01-05', 'run', 60, 'easy', {
      zoneMinutes: { z2: 30, z4: 30 },
    });
    // (30 × 3.5 + 30 × 7.5) / 4.5
    expect(sessionLoad(zoned)).toBe(73.3);
  });

  it('counts a skipped session as zero', () => {
    expect(sessionLoad(session('2026-01-05', 'run', 60, 'easy', { status: 'skipped' }))).toBe(0);
  });

  it('ignores planned sessions in period stats but keeps them when asked', () => {
    const sessions = [session('2026-01-05', 'run', 60, 'easy', { status: 'planned' })];
    expect(periodStats(sessions, '2026-01-01', '2026-01-07').total.minutes).toBe(0);
    expect(
      periodStats(sessions, '2026-01-01', '2026-01-07', { includePlanned: true }).total.minutes,
    ).toBe(60);
  });
});

describe('hard and long sessions', () => {
  it('treats threshold work as hard', () => {
    expect(isHardSession(session('2026-01-05', 'run', 40, 'threshold'))).toBe(true);
  });

  it('treats a long easy endurance session as hard for recovery purposes', () => {
    expect(isHardSession(session('2026-01-05', 'bike', 150, 'easy'))).toBe(true);
  });

  it('never treats mobility as hard', () => {
    expect(isHardSession(session('2026-01-05', 'mobility', 180, 'max'))).toBe(false);
  });

  it('recognises a long run by distance or duration', () => {
    expect(isLongSession(session('2026-01-05', 'run', 60, 'easy', { actualDistanceKm: 16 }))).toBe(true);
    expect(isLongSession(session('2026-01-05', 'run', 95, 'easy'))).toBe(true);
    expect(isLongSession(session('2026-01-05', 'run', 40, 'easy', { actualDistanceKm: 7 }))).toBe(false);
  });
});

describe('load series', () => {
  it('builds fitness and fatigue that respond at different speeds', () => {
    // Four weeks of steady daily training.
    const sessions = Array.from({ length: 28 }, (_, i) => {
      const day = String(i + 1).padStart(2, '0');
      return session(`2026-01-${day}`, 'run', 60, 'easy');
    });
    const state = loadStateOn(sessions, '2026-01-28');
    // ATL reacts faster, so fatigue outruns fitness during a steady block.
    expect(state.atl).toBeGreaterThan(state.ctl);
    expect(state.tsb).toBeLessThan(0);
    // A perfectly steady block puts acute and chronic load in balance.
    expect(state.acwr).toBeCloseTo(1, 1);
  });

  it('returns a zeroed state when there is no history', () => {
    const state = loadStateOn([], '2026-01-29');
    expect(state.ctl).toBe(0);
    expect(state.atl).toBe(0);
    expect(state.acwr).toBe(0);
  });
});

describe('recency helpers', () => {
  const sessions = [
    session('2026-01-01', 'run', 60),
    session('2026-01-04', 'strength', 50, 'moderate'),
    session('2026-01-05', 'run', 45),
  ];

  it('measures days since the last matching session', () => {
    expect(daysSince(sessions, '2026-01-06', (s) => s.sport === 'run')).toBe(1);
    expect(daysSince(sessions, '2026-01-06', (s) => s.sport === 'strength')).toBe(2);
    expect(daysSince(sessions, '2026-01-06', (s) => s.sport === 'swim')).toBeNull();
  });

  it('counts consecutive training days before a date', () => {
    expect(consecutiveTrainingDays(sessions, '2026-01-06')).toBe(2);
    expect(consecutiveTrainingDays(sessions, '2026-01-03')).toBe(0);
  });
});
