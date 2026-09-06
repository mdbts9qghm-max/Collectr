import type { Habit, HabitEntry, ISODate } from './types.ts';
import { addDays, dateRange, startOfWeek, weekday } from './date.ts';

export type HabitStatus = 'complete' | 'partial' | 'missed' | 'skipped' | 'pending';

/** Per-day facts the habit rules need, supplied by the store. */
export interface DayContext {
  /** True when no training was completed and none was planned. */
  isRestDay: boolean;
  shiftKey: string | null;
  isFuture: boolean;
}

export function isScheduledOn(habit: Habit, date: ISODate): boolean {
  switch (habit.schedule.type) {
    case 'daily':
      return true;
    case 'weekdays':
      return habit.schedule.days.includes(weekday(date));
    case 'times_per_week':
      // Flexible habits are never "due" on a specific day; the weekly quota governs.
      return true;
  }
}

/** Days the habit is deliberately excused — these never break a streak. */
export function isExcused(habit: Habit, ctx: DayContext): boolean {
  if (ctx.shiftKey === 'sick') return true;
  if (habit.restDayPolicy === 'skip_on_rest_day' && ctx.isRestDay) return true;
  if (habit.restDayPolicy === 'skip_on_day_shift' && ctx.shiftKey === 'day') return true;
  return false;
}

export function habitValue(entry: HabitEntry | undefined): number {
  return entry?.value ?? 0;
}

function statusFor(habit: Habit, entry: HabitEntry | undefined, ctx: DayContext): HabitStatus {
  if (isExcused(habit, ctx)) return 'skipped';
  const value = habitValue(entry);
  if (habit.kind === 'binary') {
    if (value >= 1) return 'complete';
    return ctx.isFuture ? 'pending' : 'missed';
  }
  const target = habit.target ?? 1;
  const minimum = habit.minimum ?? target;
  const reached = habit.direction === 'at_least' ? value >= target : value > 0 && value <= target;
  if (reached) return 'complete';
  const partial =
    habit.direction === 'at_least' ? value >= minimum : value > 0 && value <= minimum;
  if (partial) return 'partial';
  if (value > 0) return ctx.isFuture ? 'pending' : 'missed';
  return ctx.isFuture ? 'pending' : 'missed';
}

/** Status for a specific date, accounting for weekday scheduling. */
export function statusOn(
  habit: Habit,
  date: ISODate,
  entry: HabitEntry | undefined,
  ctx: DayContext,
): HabitStatus {
  if (!isScheduledOn(habit, date)) return 'skipped';
  return statusFor(habit, entry, ctx);
}

export function progressPct(habit: Habit, entry: HabitEntry | undefined): number {
  const value = habitValue(entry);
  if (habit.kind === 'binary') return value >= 1 ? 100 : 0;
  const target = habit.target ?? 1;
  if (target <= 0) return 0;
  return Math.min(100, Math.round((value / target) * 100));
}

/**
 * Streak length in days.
 *
 * Excused days (planned rest, sickness, a shift the habit is exempt from) are
 * transparent: they neither extend nor break the streak. Partial credit keeps a
 * streak alive — the point is momentum, not perfection.
 */
export interface StreakInfo {
  current: number;
  best: number;
  /** Days that were skipped rather than failed, inside the current streak. */
  protectedDays: number;
  lastCompleted: ISODate | null;
}

export function computeStreak(
  habit: Habit,
  entriesByDate: Map<ISODate, HabitEntry>,
  contextFor: (date: ISODate) => DayContext,
  today: ISODate,
  lookbackDays = 400,
): StreakInfo {
  let current = 0;
  let protectedDays = 0;
  let lastCompleted: ISODate | null = null;
  let cursor = today;

  // Today counts only once it has been logged; an un-logged today does not
  // break a streak that is still live.
  for (let i = 0; i < lookbackDays; i++) {
    const ctx = contextFor(cursor);
    const status = statusOn(habit, cursor, entriesByDate.get(cursor), ctx);
    if (status === 'skipped') {
      protectedDays += 1;
      cursor = addDays(cursor, -1);
      continue;
    }
    if (status === 'complete' || status === 'partial') {
      current += 1;
      if (!lastCompleted) lastCompleted = cursor;
      cursor = addDays(cursor, -1);
      continue;
    }
    if (cursor === today) {
      // Not logged yet today — look further back without penalty.
      cursor = addDays(cursor, -1);
      continue;
    }
    break;
  }

  // Best streak over the same window.
  let best = 0;
  let run = 0;
  for (const date of dateRange(addDays(today, -lookbackDays), today)) {
    const ctx = contextFor(date);
    const status = statusOn(habit, date, entriesByDate.get(date), ctx);
    if (status === 'complete' || status === 'partial') {
      run += 1;
      best = Math.max(best, run);
    } else if (status === 'skipped' || (date === today && status === 'missed')) {
      // carry the run through
    } else {
      run = 0;
    }
  }

  return { current, best: Math.max(best, current), protectedDays, lastCompleted };
}

export interface QuotaInfo {
  done: number;
  required: number;
  /** Days in the window where the habit was scheduled and not excused. */
  opportunities: number;
  pct: number;
}

export function weekQuota(
  habit: Habit,
  entriesByDate: Map<ISODate, HabitEntry>,
  contextFor: (date: ISODate) => DayContext,
  anyDateInWeek: ISODate,
  weekStartsOn: 0 | 1 = 1,
): QuotaInfo {
  const start = startOfWeek(anyDateInWeek, weekStartsOn);
  return quotaFor(habit, entriesByDate, contextFor, dateRange(start, addDays(start, 6)));
}

export function quotaFor(
  habit: Habit,
  entriesByDate: Map<ISODate, HabitEntry>,
  contextFor: (date: ISODate) => DayContext,
  dates: ISODate[],
): QuotaInfo {
  let done = 0;
  let opportunities = 0;
  for (const date of dates) {
    const ctx = contextFor(date);
    const status = statusOn(habit, date, entriesByDate.get(date), ctx);
    if (status === 'skipped') continue;
    opportunities += 1;
    if (status === 'complete') done += 1;
    else if (status === 'partial') done += 0.5;
  }
  const required =
    habit.schedule.type === 'times_per_week'
      ? Math.min(habit.schedule.count, opportunities)
      : opportunities;
  return {
    done: Math.round(done * 10) / 10,
    required,
    opportunities,
    pct: required > 0 ? Math.min(100, Math.round((done / required) * 100)) : 0,
  };
}

/** Aggregate completion across all active habits — feeds the Hybrid Score. */
export function overallCompletion(
  habits: Habit[],
  entriesFor: (habitId: string) => Map<ISODate, HabitEntry>,
  contextFor: (date: ISODate) => DayContext,
  dates: ISODate[],
): { pct: number; done: number; opportunities: number } {
  let done = 0;
  let opportunities = 0;
  for (const habit of habits) {
    if (habit.archived) continue;
    const q = quotaFor(habit, entriesFor(habit.id), contextFor, dates);
    done += q.done;
    opportunities += q.required;
  }
  return {
    pct: opportunities > 0 ? Math.round((done / opportunities) * 100) : 0,
    done: Math.round(done * 10) / 10,
    opportunities,
  };
}

/** Rolling per-day completion percentage, for the habit trend chart. */
export function dailyCompletionSeries(
  habits: Habit[],
  entriesFor: (habitId: string) => Map<ISODate, HabitEntry>,
  contextFor: (date: ISODate) => DayContext,
  dates: ISODate[],
): { date: ISODate; pct: number }[] {
  return dates.map((date) => {
    let done = 0;
    let total = 0;
    for (const habit of habits) {
      if (habit.archived) continue;
      const ctx = contextFor(date);
      const status = statusOn(habit, date, entriesFor(habit.id).get(date), ctx);
      if (status === 'skipped') continue;
      total += 1;
      if (status === 'complete') done += 1;
      else if (status === 'partial') done += 0.5;
    }
    return { date, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  });
}
