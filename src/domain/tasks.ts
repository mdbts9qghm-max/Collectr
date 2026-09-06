import type { ISODate, ShiftAssignment, Task, TaskCategory, TaskPriority } from './types.ts';
import { addDays, diffDays, weekday } from './date.ts';
import { nowTimestamp } from './date.ts';
import { makeId } from './ids.ts';

export const PRIORITY_META: Record<TaskPriority, { label: string; color: string; rank: number; dot: string }> = {
  high: { label: 'Wichtig', color: 'var(--bad)', rank: 0, dot: '🔴' },
  normal: { label: 'Normal', color: 'var(--warn)', rank: 1, dot: '🟡' },
  low: { label: 'Niedrig', color: 'var(--good)', rank: 2, dot: '🟢' },
};

export const CATEGORY_META: Record<TaskCategory, { label: string; icon: string }> = {
  work: { label: 'Arbeit', icon: '💼' },
  private: { label: 'Privat', icon: '🏠' },
  sport: { label: 'Sport', icon: '🏃' },
  nutrition: { label: 'Ernährung', icon: '🥗' },
  organisation: { label: 'Organisation', icon: '🗂️' },
  learning: { label: 'Lernen', icon: '📚' },
  other: { label: 'Sonstiges', icon: '•' },
};

export function isOverdue(task: Task, today: ISODate): boolean {
  return task.status === 'open' && !!task.dueDate && task.dueDate < today;
}

export function isDueOn(task: Task, date: ISODate): boolean {
  return task.status === 'open' && task.dueDate === date;
}

/** Open tasks for a day: due that day plus anything still overdue. */
export function tasksForDay(tasks: Task[], date: ISODate, today: ISODate): Task[] {
  return tasks
    .filter((t) => t.status === 'open' && (isDueOn(t, date) || (date === today && isOverdue(t, today))))
    .sort(compareTasks);
}

export function compareTasks(a: Task, b: Task): number {
  const dueA = a.dueDate ?? '9999-12-31';
  const dueB = b.dueDate ?? '9999-12-31';
  if (dueA !== dueB) return dueA.localeCompare(dueB);
  const prio = PRIORITY_META[a.priority].rank - PRIORITY_META[b.priority].rank;
  if (prio !== 0) return prio;
  const timeA = a.dueTime ?? '99:99';
  const timeB = b.dueTime ?? '99:99';
  if (timeA !== timeB) return timeA.localeCompare(timeB);
  return a.order - b.order;
}

/**
 * The next occurrence after `from`. Shift-based recurrence needs the shift
 * calendar, which is why assignments are passed in.
 */
export function nextOccurrence(
  task: Task,
  from: ISODate,
  shifts: Map<ISODate, ShiftAssignment>,
): ISODate | null {
  const r = task.recurrence;
  switch (r.type) {
    case 'none':
      return null;
    case 'daily':
      return addDays(from, Math.max(1, r.interval));
    case 'weekly': {
      if (r.days.length === 0) return addDays(from, 7);
      for (let i = 1; i <= 7; i++) {
        const candidate = addDays(from, i);
        if (r.days.includes(weekday(candidate))) return candidate;
      }
      return addDays(from, 7);
    }
    case 'monthly': {
      const d = new Date(from);
      const target = new Date(d.getFullYear(), d.getMonth() + 1, Math.min(r.day, 28));
      const y = target.getFullYear();
      const m = String(target.getMonth() + 1).padStart(2, '0');
      const day = String(target.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    case 'shift': {
      for (let i = 1; i <= 60; i++) {
        const candidate = addDays(from, i);
        if (shifts.get(candidate)?.shiftTypeId === r.shiftTypeId) return candidate;
      }
      return null;
    }
  }
}

/**
 * Completing a recurring task closes it and spawns the next instance, so the
 * history stays honest instead of a single row silently moving forward.
 */
export function completeTask(
  task: Task,
  shifts: Map<ISODate, ShiftAssignment>,
): { completed: Task; next: Task | null } {
  const ts = nowTimestamp();
  const completed: Task = { ...task, status: 'done', completedAt: ts };
  if (task.recurrence.type === 'none') return { completed, next: null };

  const base = task.dueDate ?? ts.slice(0, 10);
  const nextDue = nextOccurrence(task, base, shifts);
  if (!nextDue) return { completed, next: null };

  const next: Task = {
    ...task,
    id: makeId('task'),
    status: 'open',
    dueDate: nextDue,
    completedAt: undefined,
    createdAt: ts,
  };
  return { completed, next };
}

export interface TaskSummary {
  open: number;
  overdue: number;
  dueToday: number;
  doneToday: number;
  byPriority: Record<TaskPriority, number>;
  estimatedMinutes: number;
}

export function summarise(tasks: Task[], today: ISODate): TaskSummary {
  const summary: TaskSummary = {
    open: 0,
    overdue: 0,
    dueToday: 0,
    doneToday: 0,
    byPriority: { high: 0, normal: 0, low: 0 },
    estimatedMinutes: 0,
  };
  for (const t of tasks) {
    if (t.status === 'done') {
      if (t.completedAt?.slice(0, 10) === today) summary.doneToday += 1;
      continue;
    }
    summary.open += 1;
    summary.byPriority[t.priority] += 1;
    if (isOverdue(t, today)) summary.overdue += 1;
    if (isDueOn(t, today)) {
      summary.dueToday += 1;
      summary.estimatedMinutes += t.effortMin ?? 0;
    }
  }
  return summary;
}

export function describeRecurrence(r: Task['recurrence'], shiftLabel?: string): string {
  switch (r.type) {
    case 'none':
      return 'Einmalig';
    case 'daily':
      return r.interval === 1 ? 'Täglich' : `Alle ${r.interval} Tage`;
    case 'weekly': {
      if (r.days.length === 0) return 'Wöchentlich';
      const names = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
      return `Wöchentlich · ${r.days.map((d) => names[d]).join(', ')}`;
    }
    case 'monthly':
      return `Monatlich am ${r.day}.`;
    case 'shift':
      return `Bei jeder ${shiftLabel ?? 'Schicht'}`;
  }
}

export function dueLabel(task: Task, today: ISODate): { text: string; tone: 'bad' | 'warn' | 'muted' } {
  if (!task.dueDate) return { text: 'Kein Datum', tone: 'muted' };
  const delta = diffDays(task.dueDate, today);
  if (delta < 0) return { text: `${-delta} Tag${delta === -1 ? '' : 'e'} überfällig`, tone: 'bad' };
  if (delta === 0) return { text: task.dueTime ? `Heute ${task.dueTime}` : 'Heute', tone: 'warn' };
  if (delta === 1) return { text: 'Morgen', tone: 'muted' };
  return { text: `In ${delta} Tagen`, tone: 'muted' };
}
