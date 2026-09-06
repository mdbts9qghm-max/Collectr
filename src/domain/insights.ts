import type { ISODate } from './types.ts';
import type { AppData } from '../data/store.ts';
import type { Indexes } from '../data/derived.ts';
import { activeHabits, buildDayView, entriesFor, makeDayContextFn } from '../data/derived.ts';
import { addDays, dateRange, lastNDays, startOfWeek } from './date.ts';
import { formatDuration, formatHours, SPORT_META } from './format.ts';
import { average, periodStats } from './load.ts';
import { quotaFor } from './habits.ts';
import { summarise } from './tasks.ts';

/**
 * Insights are the content behind notifications and the daily briefing.
 *
 * Each one states a specific observation from the user's own data. Nothing
 * here nags ("du hast noch nicht trainiert") — every message either answers
 * "what should I do" or reports a trend worth reacting to.
 */

export type InsightKind = 'training' | 'recovery' | 'habit' | 'task' | 'load' | 'milestone';

export interface Insight {
  id: string;
  kind: InsightKind;
  title: string;
  body: string;
  /** Higher shows first. */
  priority: number;
  icon: string;
  /** In-app route the insight points to. */
  action?: { label: string; to: string };
}

export function buildInsights(data: AppData, idx: Indexes, today: ISODate): Insight[] {
  const out: Insight[] = [];
  const view = buildDayView(data, idx, today);
  const prefs = data.settings.notifications;

  /* ---- Today's recommendation ---- */
  const top = view.recommendation.recommended[0];
  if (top && !top.template.isRest) {
    out.push({
      id: 'today-recommendation',
      kind: 'training',
      title: `Heute wäre ${top.template.title} sinnvoll`,
      body:
        `${SPORT_META[top.template.sport].icon} ${formatDuration(top.template.durationMin)} · ${top.reasons[0]?.text ?? view.recommendation.focus}`,
      priority: 90,
      icon: SPORT_META[top.template.sport].icon,
      action: { label: 'Einplanen', to: '/training' },
    });
  } else if (top?.template.isRest) {
    out.push({
      id: 'today-rest',
      kind: 'recovery',
      title: 'Heute ist Erholung die bessere Entscheidung',
      body: top.reasons[0]?.text ?? 'Belastung und Erholung sprechen gegen einen Trainingsreiz.',
      priority: 88,
      icon: '💤',
      action: { label: 'Warum?', to: '/today' },
    });
  }

  /* ---- Plan conflicts ---- */
  if (view.recommendation.planReview && view.recommendation.planReview.verdict !== 'aligned') {
    out.push({
      id: 'plan-conflict',
      kind: 'training',
      title:
        view.recommendation.planReview.verdict === 'too_much'
          ? 'Dein Plan passt heute nicht in die Schicht'
          : 'Dein Plan wäre heute anzupassen',
      body: view.recommendation.planReview.message,
      priority: 95,
      icon: '⚠️',
      action: { label: 'Training öffnen', to: '/training' },
    });
  }

  /* ---- Load warnings ---- */
  if (prefs.loadWarnings) {
    if (view.load.acwr > data.settings.recovery.acwrCeiling) {
      out.push({
        id: 'load-acwr',
        kind: 'load',
        title: 'Belastung ist zu schnell gestiegen',
        body: `Akut:Chronisch liegt bei ${view.load.acwr.toFixed(2)} (Limit ${data.settings.recovery.acwrCeiling}). Die nächsten Tage locker halten.`,
        priority: 92,
        icon: '📈',
        action: { label: 'Analytics', to: '/analytics' },
      });
    }
    if (view.load.tsb < -20) {
      out.push({
        id: 'load-form',
        kind: 'load',
        title: 'Du trägst viel Ermüdung mit dir',
        body: `Form liegt bei ${view.load.tsb}. Ein bewusster Ruhetag zahlt sich jetzt mehr aus als eine weitere Einheit.`,
        priority: 80,
        icon: '🔋',
      });
    }
  }

  /* ---- Sleep trend ---- */
  const sleepDates = lastNDays(today, 7);
  const sleeps = sleepDates
    .map((d) => idx.checkIns.get(d)?.sleepHours)
    .filter((v): v is number => v != null);
  if (sleeps.length >= 3) {
    const avg = average(sleeps);
    const target = data.settings.recovery.sleepHoursTarget;
    if (avg < target - 0.5) {
      out.push({
        id: 'sleep-trend',
        kind: 'recovery',
        title: 'Dein Schlaf lag diese Woche unter dem Ziel',
        body: `${avg.toFixed(1)} h im Schnitt statt ${target} h. Bei Schichtdienst ist das der teuerste Rückstand.`,
        priority: 75,
        icon: '😴',
        action: { label: 'Check-in', to: '/today' },
      });
    }
  }

  /* ---- Missing check-in ---- */
  if (!view.checkIn) {
    out.push({
      id: 'checkin-missing',
      kind: 'recovery',
      title: 'Tages-Check-in fehlt noch',
      body: 'Ohne Schlaf und Befinden schätzt die Empfehlung nur anhand deiner Trainingshistorie.',
      priority: 70,
      icon: '📝',
      action: { label: 'Jetzt eintragen', to: '/today' },
    });
  }

  /* ---- Shift gaps ---- */
  const upcoming = dateRange(today, addDays(today, 6));
  const missingShifts = upcoming.filter((d) => !idx.shiftAssignments.get(d)).length;
  if (missingShifts >= 3) {
    out.push({
      id: 'shifts-missing',
      kind: 'training',
      title: `${missingShifts} Tage ohne Schicht`,
      body: 'Ohne Schichtplan kann die App die Woche nicht sinnvoll verteilen.',
      priority: 65,
      icon: '🗓️',
      action: { label: 'Schichten eintragen', to: '/week' },
    });
  }

  /* ---- Weekly volume pacing ---- */
  const weekStart = startOfWeek(today, data.settings.weekStartsOn);
  const done = periodStats(data.sessions, weekStart, today).total.minutes;
  const daysLeft = 7 - dateRange(weekStart, today).length;
  if (daysLeft <= 2 && done < view.target.minutes * 0.6 && view.target.minutes > 0) {
    out.push({
      id: 'week-behind',
      kind: 'training',
      title: 'Die Woche liegt hinter dem Ziel',
      body: `${formatHours(done / 60)} von ${formatHours(view.target.minutes / 60)} bei ${daysLeft} verbleibenden Tagen. Lieber das Ziel anpassen als es in zwei Tagen aufzuholen.`,
      priority: 60,
      icon: '⏱️',
    });
  }

  /* ---- Habits ---- */
  if (prefs.habitNudges) {
    const contextFor = makeDayContextFn(idx, today);
    const weekDates = dateRange(weekStart, today);
    for (const habit of activeHabits(data)) {
      const q = quotaFor(habit, entriesFor(idx, habit.id), contextFor, weekDates);
      if (q.required >= 3 && q.pct < 50) {
        out.push({
          id: `habit-${habit.id}`,
          kind: 'habit',
          title: `${habit.name} liegt zurück`,
          body: `${q.done} von ${q.required} diese Woche erreicht.`,
          priority: 40,
          icon: habit.icon,
          action: { label: 'Habits', to: '/habits' },
        });
      }
    }
  }

  /* ---- Tasks ---- */
  const tasks = summarise(data.tasks, today);
  if (tasks.overdue > 0) {
    out.push({
      id: 'tasks-overdue',
      kind: 'task',
      title: `${tasks.overdue} überfällige Aufgabe${tasks.overdue === 1 ? '' : 'n'}`,
      body: tasks.dueToday > 0 ? `Dazu ${tasks.dueToday} heute fällig.` : 'Aufräumen oder neu terminieren.',
      priority: 55,
      icon: '📋',
      action: { label: 'Aufgaben', to: '/tasks' },
    });
  }

  /* ---- Recent records ---- */
  const recentRecords = data.records.filter((r) => r.date >= addDays(today, -7));
  for (const r of recentRecords.slice(-2)) {
    out.push({
      id: `record-${r.id}`,
      kind: 'milestone',
      title: `Neue Bestleistung: ${r.label}`,
      body: r.previousValue != null ? 'Damit hast du deinen bisherigen Rekord verbessert.' : 'Erster Eintrag für diese Kategorie.',
      priority: 50,
      icon: '🏆',
      action: { label: 'Records', to: '/analytics' },
    });
  }

  return out.sort((a, b) => b.priority - a.priority);
}

/** The single most important thing right now, used for the briefing headline. */
export function primaryInsight(insights: Insight[]): Insight | null {
  return insights[0] ?? null;
}
