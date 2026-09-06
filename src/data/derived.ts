import type {
  DailyCheckIn,
  Habit,
  HabitEntry,
  ISODate,
  MetricKey,
  ShiftAssignment,
  ShiftType,
  TrainingSession,
} from '../domain/types.ts';
import type { AppData } from './store.ts';
import type { DayContext } from '../domain/habits.ts';
import type { MetricValue } from '../domain/metrics.ts';
import { addDays, dateRange, lastNDays, startOfWeek, today as todayIso } from '../domain/date.ts';
import { adjustedTrainingMinutes, buildShiftContext } from '../domain/shifts.ts';
import { computeReadiness } from '../domain/readiness.ts';
import { weekTarget } from '../domain/phases.ts';
import { recommendForDay } from '../domain/engine.ts';
import { buildOutlook } from '../domain/outlook.ts';
import { learnPreferences } from '../domain/personalization.ts';
import { currentMetrics } from '../domain/metrics.ts';
import { computeHybridScore } from '../domain/score.ts';
import { overallCompletion } from '../domain/habits.ts';
import { effectiveDuration, loadStateOn, periodStats, weekStats } from '../domain/load.ts';

/** Indexes built once per render pass and shared by every derived computation. */
export interface Indexes {
  shiftAssignments: Map<ISODate, ShiftAssignment>;
  shiftTypes: Map<string, ShiftType>;
  checkIns: Map<ISODate, DailyCheckIn>;
  entriesByHabit: Map<string, Map<ISODate, HabitEntry>>;
  sessionsByDate: Map<ISODate, TrainingSession[]>;
}

export function buildIndexes(data: AppData): Indexes {
  const entriesByHabit = new Map<string, Map<ISODate, HabitEntry>>();
  for (const entry of data.habitEntries) {
    let inner = entriesByHabit.get(entry.habitId);
    if (!inner) {
      inner = new Map();
      entriesByHabit.set(entry.habitId, inner);
    }
    inner.set(entry.date, entry);
  }

  const sessionsByDate = new Map<ISODate, TrainingSession[]>();
  for (const s of data.sessions) {
    const list = sessionsByDate.get(s.date);
    if (list) list.push(s);
    else sessionsByDate.set(s.date, [s]);
  }

  return {
    shiftAssignments: new Map(Object.entries(data.shifts)),
    shiftTypes: new Map(data.shiftTypes.map((t) => [t.id, t])),
    checkIns: new Map(Object.entries(data.checkIns)),
    entriesByHabit,
    sessionsByDate,
  };
}

export function shiftTypeOn(idx: Indexes, date: ISODate): ShiftType | null {
  const a = idx.shiftAssignments.get(date);
  return a ? (idx.shiftTypes.get(a.shiftTypeId) ?? null) : null;
}

/**
 * A rest day is one with no training done and none planned. It matters because
 * habits with a rest-day policy are excused, which is what keeps streaks from
 * punishing correct behaviour.
 */
export function makeDayContextFn(idx: Indexes, today: ISODate): (date: ISODate) => DayContext {
  return (date: ISODate) => {
    const sessions = idx.sessionsByDate.get(date) ?? [];
    const trained = sessions.some(
      (s) => s.status !== 'skipped' && s.sport !== 'recovery' && effectiveDuration(s) >= 20,
    );
    const shift = shiftTypeOn(idx, date);
    return {
      isRestDay: !trained,
      shiftKey: shift?.key ?? null,
      isFuture: date > today,
    };
  };
}

export function entriesFor(idx: Indexes, habitId: string): Map<ISODate, HabitEntry> {
  return idx.entriesByHabit.get(habitId) ?? new Map();
}

export function activeHabits(data: AppData): Habit[] {
  return data.habits.filter((h) => !h.archived).sort((a, b) => a.order - b.order);
}

export function activePlan(data: AppData) {
  return data.plans.find((p) => p.active) ?? data.plans[0] ?? null;
}

/* ------------------------------------------------------------------ *
 * The full day view — everything the Today screen needs
 * ------------------------------------------------------------------ */

export function buildDayView(data: AppData, idx: Indexes, date: ISODate) {
  const today = todayIso();
  const shift = buildShiftContext(date, idx.shiftAssignments, idx.shiftTypes);
  const readiness = computeReadiness(date, idx.checkIns, data.sessions, shift, data.settings.recovery);
  const target = weekTarget(
    activePlan(data),
    date,
    data.settings.training.weeklyHoursTarget,
    data.settings.weekStartsOn,
  );
  const preferences = learnPreferences(data.sessions, date);
  const outlook = buildOutlook(
    date,
    idx.shiftAssignments,
    idx.shiftTypes,
    data.sessions,
    data.settings,
  );
  const recommendation = recommendForDay({
    date,
    shift,
    readiness,
    target,
    settings: data.settings,
    sessions: data.sessions,
    goals: data.goals,
    preferences,
    outlook,
  });

  return {
    date,
    isToday: date === today,
    shift,
    readiness,
    target,
    outlook,
    recommendation,
    sessions: (idx.sessionsByDate.get(date) ?? []).slice().sort((a, b) =>
      (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99'),
    ),
    checkIn: idx.checkIns.get(date),
    load: loadStateOn(data.sessions, date),
    week: weekStats(data.sessions, date, data.settings.weekStartsOn),
    weekPlanned: weekStats(data.sessions, date, data.settings.weekStartsOn, { includePlanned: true }),
  };
}

export type DayView = ReturnType<typeof buildDayView>;

/* ------------------------------------------------------------------ *
 * Metrics & score
 * ------------------------------------------------------------------ */

export function buildMetrics(data: AppData, date: ISODate): Map<MetricKey, MetricValue> {
  return currentMetrics(data.sessions, Object.values(data.checkIns), data.settings, date);
}

export function buildScore(
  data: AppData,
  idx: Indexes,
  date: ISODate,
  metrics: Map<MetricKey, MetricValue>,
) {
  const window = lastNDays(date, 28);
  const contextFor = makeDayContextFn(idx, date);
  const habitPct = data.habits.length
    ? overallCompletion(activeHabits(data), (id) => entriesFor(idx, id), contextFor, window).pct
    : null;

  // Readiness for the last 14 days, so the recovery pillar reflects a trend
  // rather than a single morning.
  const readinessHistory = lastNDays(date, 14).map((d) =>
    computeReadiness(
      d,
      idx.checkIns,
      data.sessions,
      buildShiftContext(d, idx.shiftAssignments, idx.shiftTypes),
      data.settings.recovery,
    ),
  );

  const sleepHours = lastNDays(date, 14).map((d) => idx.checkIns.get(d)?.sleepHours ?? null);

  return computeHybridScore({
    date,
    sessions: data.sessions,
    metrics,
    settings: data.settings,
    goals: data.goals,
    readinessHistory,
    sleepHours,
    habitCompletionPct: habitPct,
    weeklyMinutesTarget: data.settings.training.weeklyHoursTarget * 60,
  });
}

/** Hybrid score sampled weekly, for the trend chart. */
export function scoreHistory(
  data: AppData,
  idx: Indexes,
  date: ISODate,
  weeks = 12,
): { date: ISODate; total: number }[] {
  const out: { date: ISODate; total: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = addDays(date, -i * 7);
    const metrics = buildMetrics(data, d);
    out.push({ date: d, total: buildScore(data, idx, d, metrics).total });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Week view
 * ------------------------------------------------------------------ */

export interface WeekDayCell {
  date: ISODate;
  shift: ShiftType | null;
  sessions: TrainingSession[];
  plannedMinutes: number;
  completedMinutes: number;
  /** Training minutes the shift allows, after cross-day adjustments. */
  capacityMinutes: number;
  /** Capacity still unspent after what is already planned or done. */
  freeMinutes: number;
  sleepHours: number | null;
  readinessScore: number | null;
  habitPct: number | null;
  openTasks: number;
  isToday: boolean;
  isPast: boolean;
}

export function buildWeek(data: AppData, idx: Indexes, anyDate: ISODate): WeekDayCell[] {
  const today = todayIso();
  const start = startOfWeek(anyDate, data.settings.weekStartsOn);
  const contextFor = makeDayContextFn(idx, today);
  const habits = activeHabits(data);

  return dateRange(start, addDays(start, 6)).map((date) => {
    const sessions = idx.sessionsByDate.get(date) ?? [];
    const checkIn = idx.checkIns.get(date);
    const shift = buildShiftContext(date, idx.shiftAssignments, idx.shiftTypes);

    let habitDone = 0;
    let habitTotal = 0;
    for (const habit of habits) {
      const ctx = contextFor(date);
      if (ctx.shiftKey === 'sick') continue;
      const entry = entriesFor(idx, habit.id).get(date);
      habitTotal += 1;
      if (entry && habit.kind === 'binary' && entry.value >= 1) habitDone += 1;
      else if (entry && habit.target && entry.value >= habit.target) habitDone += 1;
      else if (entry && habit.minimum && entry.value >= habit.minimum) habitDone += 0.5;
    }

    const readiness =
      checkIn || date <= today
        ? computeReadiness(date, idx.checkIns, data.sessions, shift, data.settings.recovery).score
        : null;

    const plannedMinutes = sessions
      .filter((s) => s.status === 'planned')
      .reduce((sum, s) => sum + effectiveDuration(s), 0);
    const completedMinutes = sessions
      .filter((s) => s.status === 'completed')
      .reduce((sum, s) => sum + effectiveDuration(s), 0);
    const capacityMinutes = adjustedTrainingMinutes(shift);

    return {
      date,
      shift: shift.type,
      sessions,
      plannedMinutes,
      completedMinutes,
      capacityMinutes,
      freeMinutes: Math.max(0, capacityMinutes - plannedMinutes - completedMinutes),
      sleepHours: checkIn?.sleepHours ?? null,
      readinessScore: readiness,
      habitPct: habitTotal > 0 ? Math.round((habitDone / habitTotal) * 100) : null,
      openTasks: data.tasks.filter((t) => t.status === 'open' && t.dueDate === date).length,
      isToday: date === today,
      isPast: date < today,
    };
  });
}

/* ------------------------------------------------------------------ *
 * Analytics helpers
 * ------------------------------------------------------------------ */

export function weeklySeries(data: AppData, endDate: ISODate, weeks: number) {
  const out = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const anchor = addDays(startOfWeek(endDate, data.settings.weekStartsOn), -i * 7);
    const stats = periodStats(data.sessions, anchor, addDays(anchor, 6));
    out.push({ weekStart: anchor, stats });
  }
  return out;
}
