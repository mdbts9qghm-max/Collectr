import type { ISODate, SportKey } from './types.ts';
import type { AppData } from '../data/store.ts';
import type { Indexes } from '../data/derived.ts';
import { activeHabits, buildMetrics, entriesFor, makeDayContextFn } from '../data/derived.ts';
import { addDays, dateRange, startOfWeek } from './date.ts';
import { formatDistance, formatDuration, formatHours, SPORT_META } from './format.ts';
import { average, periodStats, round1 } from './load.ts';
import { computeReadiness } from './readiness.ts';
import { buildShiftContext } from './shifts.ts';
import { overallCompletion } from './habits.ts';
import { weekTarget } from './phases.ts';
import { activePlan } from '../data/derived.ts';
import { goalProgress } from './goals.ts';

export interface WeekSummary {
  weekStart: ISODate;
  weekEnd: ISODate;
  totalMinutes: number;
  targetMinutes: number;
  load: number;
  sessions: number;
  bySport: { sport: SportKey; minutes: number; distanceKm: number; sessions: number }[];
  intensitySplit: { easy: number; moderate: number; hard: number };
  avgSleepHours: number | null;
  avgReadiness: number | null;
  habitPct: number | null;
  tasksCompleted: number;
  /** Comparison with the previous week. */
  deltaMinutes: number;
  deltaLoad: number;
  wentWell: string[];
  toImprove: string[];
  nextWeek: string[];
}

export function buildWeekSummary(
  data: AppData,
  idx: Indexes,
  anyDateInWeek: ISODate,
): WeekSummary {
  const weekStart = startOfWeek(anyDateInWeek, data.settings.weekStartsOn);
  const weekEnd = addDays(weekStart, 6);
  const stats = periodStats(data.sessions, weekStart, weekEnd);
  const prev = periodStats(data.sessions, addDays(weekStart, -7), addDays(weekStart, -1));
  const target = weekTarget(
    activePlan(data),
    weekStart,
    data.settings.training.weeklyHoursTarget,
    data.settings.weekStartsOn,
  );

  const dates = dateRange(weekStart, weekEnd);
  const sleeps = dates
    .map((d) => idx.checkIns.get(d)?.sleepHours)
    .filter((v): v is number => v != null);
  const readiness = dates
    .map(
      (d) =>
        computeReadiness(
          d,
          idx.checkIns,
          data.sessions,
          buildShiftContext(d, idx.shiftAssignments, idx.shiftTypes),
          data.settings.recovery,
        ).score,
    )
    .filter((v): v is number => v != null);

  const contextFor = makeDayContextFn(idx, weekEnd);
  const habitPct = data.habits.length
    ? overallCompletion(activeHabits(data), (id) => entriesFor(idx, id), contextFor, dates).pct
    : null;

  const tasksCompleted = data.tasks.filter(
    (t) => t.status === 'done' && t.completedAt && t.completedAt.slice(0, 10) >= weekStart && t.completedAt.slice(0, 10) <= weekEnd,
  ).length;

  const bySport = (Object.keys(stats.bySport) as SportKey[])
    .map((sport) => ({
      sport,
      minutes: stats.bySport[sport].minutes,
      distanceKm: stats.bySport[sport].distanceKm,
      sessions: stats.bySport[sport].sessions,
    }))
    .filter((s) => s.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);

  const summary: WeekSummary = {
    weekStart,
    weekEnd,
    totalMinutes: stats.total.minutes,
    targetMinutes: target.minutes,
    load: stats.total.load,
    sessions: stats.total.sessions,
    bySport,
    intensitySplit: stats.byIntensity,
    avgSleepHours: sleeps.length ? round1(average(sleeps)) : null,
    avgReadiness: readiness.length ? Math.round(average(readiness)) : null,
    habitPct,
    tasksCompleted,
    deltaMinutes: stats.total.minutes - prev.total.minutes,
    deltaLoad: stats.total.load - prev.total.load,
    wentWell: [],
    toImprove: [],
    nextWeek: [],
  };

  fillNarrative(summary, data, target.deload);
  return summary;
}

/**
 * The narrative is generated from the week's own numbers — no generic praise.
 * Every line names the figure it is based on.
 */
function fillNarrative(s: WeekSummary, data: AppData, isDeload: boolean): void {
  const targetHours = s.targetMinutes / 60;
  const actualHours = s.totalMinutes / 60;

  /* ---- What went well ---- */
  if (s.totalMinutes >= s.targetMinutes * 0.9) {
    s.wentWell.push(
      `Wochenumfang erreicht: ${formatHours(actualHours)} von ${formatHours(targetHours)} geplant.`,
    );
  }
  if (s.sessions >= data.settings.training.trainingDaysPerWeek) {
    s.wentWell.push(`${s.sessions} Einheiten — die geplante Frequenz hat gehalten.`);
  }
  if (s.avgSleepHours != null && s.avgSleepHours >= data.settings.recovery.sleepHoursTarget - 0.3) {
    s.wentWell.push(`Schlaf im Schnitt bei ${s.avgSleepHours.toFixed(1)} h trotz Schichtdienst.`);
  }
  if (s.habitPct != null && s.habitPct >= 80) {
    s.wentWell.push(`Habits zu ${s.habitPct} % erfüllt.`);
  }
  const strength = s.bySport.find((b) => b.sport === 'strength');
  if (strength && strength.sessions >= 2) {
    s.wentWell.push(`${strength.sessions} Krafteinheiten — Muskulatur wurde neben der Ausdauer verteidigt.`);
  }
  const longest = s.bySport.find((b) => b.sport === 'run');
  if (longest && longest.distanceKm > 0) {
    s.wentWell.push(`${formatDistance(longest.distanceKm)} gelaufen in ${longest.sessions} Einheiten.`);
  }
  if (s.deltaLoad > 0 && s.deltaLoad < s.load * 0.15) {
    s.wentWell.push('Belastung ist kontrolliert gestiegen, nicht sprunghaft.');
  }

  /* ---- What to improve ---- */
  if (s.totalMinutes < s.targetMinutes * 0.7 && !isDeload) {
    s.toImprove.push(
      `Nur ${formatHours(actualHours)} von ${formatHours(targetHours)} erreicht — fehlten ${formatDuration(s.targetMinutes - s.totalMinutes)}.`,
    );
  }
  if (s.avgSleepHours != null && s.avgSleepHours < data.settings.recovery.sleepHoursTarget - 0.5) {
    s.toImprove.push(
      `Schlaf lag bei ${s.avgSleepHours.toFixed(1)} h — ${(data.settings.recovery.sleepHoursTarget - s.avgSleepHours).toFixed(1)} h unter Ziel.`,
    );
  }
  const totalIntensity = s.intensitySplit.easy + s.intensitySplit.moderate + s.intensitySplit.hard;
  if (totalIntensity > 0) {
    const hardShare = s.intensitySplit.hard / totalIntensity;
    if (hardShare > 0.2) {
      s.toImprove.push(
        `${Math.round(hardShare * 100)} % der Zeit war intensiv — für die Grundlage sind unter 20 % besser.`,
      );
    } else if (hardShare === 0 && s.sessions >= 4 && !isDeload) {
      s.toImprove.push('Keine einzige intensive Einheit — ein Reiz pro Woche hält die Schwelle wach.');
    }
  }
  if (!strength || strength.sessions === 0) {
    s.toImprove.push('Keine Krafteinheit diese Woche — auf Dauer kostet das Muskelmasse.');
  }
  const mobility = s.bySport.find((b) => b.sport === 'mobility');
  if (!mobility || mobility.minutes < data.settings.training.mobilityMinutesTarget * 0.5) {
    s.toImprove.push('Mobility kam zu kurz — die günstigste Verletzungsprophylaxe, die es gibt.');
  }
  if (s.habitPct != null && s.habitPct < 65) {
    s.toImprove.push(`Habits nur zu ${s.habitPct} % erfüllt.`);
  }
  if (s.deltaMinutes > s.totalMinutes * 0.25 && s.totalMinutes > 0) {
    s.toImprove.push(
      `Umfang ist um ${formatDuration(s.deltaMinutes)} gegenüber der Vorwoche gesprungen — ein Sprung über 10 % erhöht das Verletzungsrisiko.`,
    );
  }

  /* ---- Recommendation for next week ---- */
  const nextTarget = weekTarget(
    activePlan(data),
    addDays(s.weekStart, 7),
    data.settings.training.weeklyHoursTarget,
    data.settings.weekStartsOn,
  );
  if (nextTarget.deload) {
    s.nextWeek.push(
      `Nächste Woche ist Deload: ${formatHours(nextTarget.minutes / 60)} und keine harten Einheiten. Das ist geplant, kein Rückschritt.`,
    );
  } else {
    const cap = Math.min(nextTarget.minutes, s.totalMinutes * (1 + data.settings.training.maxWeeklyRampRate));
    s.nextWeek.push(
      s.totalMinutes > 0
        ? `Ziel: ${formatHours(cap / 60)} — maximal +${Math.round(data.settings.training.maxWeeklyRampRate * 100)} % gegenüber dieser Woche.`
        : `Ziel: ${formatHours(nextTarget.minutes / 60)} — wieder in den Rhythmus kommen.`,
    );
  }
  if (!strength || strength.sessions < nextTarget.strengthSessions) {
    s.nextWeek.push(
      `${nextTarget.strengthSessions} Krafteinheiten fest einplanen, am besten auf Freischichten.`,
    );
  }
  const metrics = buildMetrics(data, s.weekEnd);
  const primary = data.goals.find((g) => g.active && g.primary);
  if (primary) {
    const progress = goalProgress(primary, metrics, s.weekEnd);
    if (progress.nextMilestone) {
      s.nextWeek.push(
        `Nächster Meilenstein für "${primary.title}": ${progress.nextMilestone.label}.`,
      );
    }
  }
  const runMinutes = s.bySport.find((b) => b.sport === 'run')?.minutes ?? 0;
  const runTarget = nextTarget.bySport.run ?? 0;
  if (runTarget > runMinutes * 1.3 && runMinutes > 0) {
    s.nextWeek.push(
      `Laufumfang liegt unter dem Phasenziel (${formatDuration(runMinutes)} vs. ${formatDuration(runTarget)}) — schrittweise annähern.`,
    );
  }

  if (s.wentWell.length === 0) {
    s.wentWell.push('Diese Woche gibt es wenig Daten — jeder erfasste Tag macht die Auswertung besser.');
  }
  if (s.toImprove.length === 0) {
    s.toImprove.push('Nichts Auffälliges. Struktur beibehalten.');
  }
}

export function summaryHeadline(s: WeekSummary): string {
  const pct = s.targetMinutes > 0 ? Math.round((s.totalMinutes / s.targetMinutes) * 100) : 0;
  const top = s.bySport[0];
  if (s.sessions === 0) return 'Keine Einheiten erfasst.';
  return `${s.sessions} Einheiten · ${formatHours(s.totalMinutes / 60)} · ${pct} % vom Wochenziel${
    top ? ` · Schwerpunkt ${SPORT_META[top.sport].label}` : ''
  }`;
}
