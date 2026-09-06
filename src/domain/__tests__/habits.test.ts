import { describe, expect, it } from 'vitest';
import type { Habit, HabitEntry, ISODate } from '../types.ts';
import type { DayContext } from '../habits.ts';
import { computeStreak, quotaFor, statusOn } from '../habits.ts';
import { dateRange } from '../date.ts';

const base: Habit = {
  id: 'h1',
  name: 'Mobility',
  icon: '🧘',
  category: 'recovery',
  kind: 'quantity',
  unit: 'min',
  target: 10,
  minimum: 5,
  direction: 'at_least',
  schedule: { type: 'daily' },
  restDayPolicy: 'always',
  color: '#fff',
  order: 1,
  archived: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function entries(values: Record<ISODate, number>): Map<ISODate, HabitEntry> {
  return new Map(
    Object.entries(values).map(([date, value]) => [
      date,
      { id: date, habitId: 'h1', date, value, source: 'manual' as const, updatedAt: '' },
    ]),
  );
}

const normalDay = (): DayContext => ({ isRestDay: false, shiftKey: 'off', isFuture: false });

describe('habit status', () => {
  it('marks a full target as complete and the minimum as partial', () => {
    expect(statusOn(base, '2026-03-10', entries({ '2026-03-10': 10 }).get('2026-03-10'), normalDay())).toBe('complete');
    expect(statusOn(base, '2026-03-10', entries({ '2026-03-10': 6 }).get('2026-03-10'), normalDay())).toBe('partial');
    expect(statusOn(base, '2026-03-10', entries({ '2026-03-10': 2 }).get('2026-03-10'), normalDay())).toBe('missed');
  });

  it('skips days the habit is not scheduled for', () => {
    const weekly: Habit = { ...base, schedule: { type: 'weekdays', days: [1, 3, 5] } };
    // 2026-03-10 is a Tuesday.
    expect(statusOn(weekly, '2026-03-10', undefined, normalDay())).toBe('skipped');
    expect(statusOn(weekly, '2026-03-11', undefined, normalDay())).toBe('missed');
  });

  it('excuses the habit on a rest day when configured that way', () => {
    const restAware: Habit = { ...base, restDayPolicy: 'skip_on_rest_day' };
    const ctx: DayContext = { isRestDay: true, shiftKey: 'off', isFuture: false };
    expect(statusOn(restAware, '2026-03-10', undefined, ctx)).toBe('skipped');
    expect(statusOn(base, '2026-03-10', undefined, ctx)).toBe('missed');
  });

  it('excuses every habit on a sick day', () => {
    const ctx: DayContext = { isRestDay: true, shiftKey: 'sick', isFuture: false };
    expect(statusOn(base, '2026-03-10', undefined, ctx)).toBe('skipped');
  });
});

describe('streaks', () => {
  const contextFor = () => normalDay();

  it('counts consecutive complete days', () => {
    const map = entries({ '2026-03-08': 10, '2026-03-09': 10, '2026-03-10': 10 });
    expect(computeStreak(base, map, contextFor, '2026-03-10').current).toBe(3);
  });

  it('keeps the streak alive on a partial day', () => {
    const map = entries({ '2026-03-08': 10, '2026-03-09': 6, '2026-03-10': 10 });
    expect(computeStreak(base, map, contextFor, '2026-03-10').current).toBe(3);
  });

  it('does not break the streak just because today is not logged yet', () => {
    const map = entries({ '2026-03-08': 10, '2026-03-09': 10 });
    expect(computeStreak(base, map, contextFor, '2026-03-10').current).toBe(2);
  });

  it('carries the streak through an excused rest day rather than resetting it', () => {
    const restAware: Habit = { ...base, restDayPolicy: 'skip_on_rest_day' };
    const map = entries({ '2026-03-08': 10, '2026-03-10': 10 });
    const ctxFor = (date: ISODate): DayContext => ({
      isRestDay: date === '2026-03-09',
      shiftKey: 'off',
      isFuture: false,
    });
    const streak = computeStreak(restAware, map, ctxFor, '2026-03-10');
    expect(streak.current).toBe(2);
    expect(streak.protectedDays).toBe(1);
  });

  it('breaks the streak on a genuinely missed day', () => {
    const map = entries({ '2026-03-08': 10, '2026-03-10': 10 });
    expect(computeStreak(base, map, contextFor, '2026-03-10').current).toBe(1);
  });
});

describe('quotas', () => {
  it('counts a times-per-week habit against its own target, not every day', () => {
    const flexible: Habit = { ...base, schedule: { type: 'times_per_week', count: 3 } };
    const map = entries({ '2026-03-09': 10, '2026-03-11': 10 });
    const q = quotaFor(flexible, map, () => normalDay(), dateRange('2026-03-09', '2026-03-15'));
    expect(q.done).toBe(2);
    expect(q.required).toBe(3);
    expect(q.pct).toBe(67);
  });

  it('reduces the required count when days are excused', () => {
    const restAware: Habit = { ...base, restDayPolicy: 'skip_on_rest_day' };
    const ctxFor = (date: ISODate): DayContext => ({
      isRestDay: date > '2026-03-12',
      shiftKey: 'off',
      isFuture: false,
    });
    const map = entries({ '2026-03-09': 10, '2026-03-10': 10, '2026-03-11': 10, '2026-03-12': 10 });
    const q = quotaFor(restAware, map, ctxFor, dateRange('2026-03-09', '2026-03-15'));
    expect(q.required).toBe(4);
    expect(q.pct).toBe(100);
  });
});
