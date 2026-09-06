import type { Goal, ISODate, MetricKey } from './types.ts';
import type { MetricValue } from './metrics.ts';
import { diffDays, today } from './date.ts';
import { formatMetric } from './format.ts';
import { clamp, round1 } from './load.ts';

export interface GoalProgress {
  goal: Goal;
  /** Current measured value, or null when the metric has no data yet. */
  current: number | null;
  /** 0–100 along the start → target path. */
  pct: number;
  /** Progress that "should" have been made by now, if a target date exists. */
  expectedPct: number | null;
  onTrack: boolean | null;
  daysLeft: number | null;
  nextMilestone: { label: string; value: number; pct: number } | null;
  reachedMilestones: number;
  detail: string;
  achieved: boolean;
}

export function goalProgress(
  goal: Goal,
  metrics: Map<MetricKey, MetricValue>,
  todayIso: ISODate = today(),
): GoalProgress {
  const measured = metrics.get(goal.metric);
  const current = measured?.value ?? null;

  const span = goal.targetValue - goal.startValue;
  let pct = 0;
  if (current != null && span !== 0) {
    pct = clamp(((current - goal.startValue) / span) * 100, 0, 100);
  } else if (current != null && span === 0) {
    pct = 100;
  }

  const achieved =
    current != null &&
    (goal.direction === 'increase' ? current >= goal.targetValue : current <= goal.targetValue);

  const daysLeft = goal.targetDate ? diffDays(goal.targetDate, todayIso) : null;
  let expectedPct: number | null = null;
  if (goal.targetDate) {
    const totalDays = diffDays(goal.targetDate, goal.createdAt.slice(0, 10));
    const elapsed = diffDays(todayIso, goal.createdAt.slice(0, 10));
    expectedPct = totalDays > 0 ? clamp((elapsed / totalDays) * 100, 0, 100) : null;
  }

  const sortedMilestones = [...goal.milestones].sort((a, b) =>
    goal.direction === 'increase' ? a.value - b.value : b.value - a.value,
  );
  const reached = sortedMilestones.filter((m) =>
    current == null ? false : goal.direction === 'increase' ? current >= m.value : current <= m.value,
  );
  const next = sortedMilestones.find((m) => !reached.includes(m));

  return {
    goal,
    current,
    pct: round1(pct),
    expectedPct: expectedPct == null ? null : round1(expectedPct),
    onTrack: expectedPct == null ? null : pct >= expectedPct - 8,
    daysLeft,
    nextMilestone: next
      ? {
          label: next.label,
          value: next.value,
          pct: span === 0 ? 100 : round1(clamp(((next.value - goal.startValue) / span) * 100, 0, 100)),
        }
      : null,
    reachedMilestones: reached.length,
    detail:
      current == null
        ? 'Noch keine Messwerte für dieses Ziel'
        : `${formatMetric(goal.metric as string, current)} von ${formatMetric(goal.metric as string, goal.targetValue)}`,
    achieved,
  };
}

/** A short, honest status line: on track, behind, or missing data. */
export function goalStatusText(p: GoalProgress): { text: string; tone: 'good' | 'warn' | 'muted' | 'bad' } {
  if (p.current == null) return { text: 'Keine Daten', tone: 'muted' };
  if (p.achieved) return { text: 'Erreicht 🎉', tone: 'good' };
  if (p.onTrack == null) return { text: `${Math.round(p.pct)} % geschafft`, tone: 'muted' };
  if (p.onTrack) return { text: 'Im Plan', tone: 'good' };
  const behind = Math.round((p.expectedPct ?? 0) - p.pct);
  return { text: `${behind} % hinter Plan`, tone: behind > 25 ? 'bad' : 'warn' };
}

/** Auto-generates evenly spaced milestones between start and target. */
export function generateMilestones(
  startValue: number,
  targetValue: number,
  count = 3,
): { label: string; value: number }[] {
  const out: { label: string; value: number }[] = [];
  const step = (targetValue - startValue) / (count + 1);
  for (let i = 1; i <= count; i++) {
    const value = round1(startValue + step * i);
    out.push({ label: `Zwischenziel ${i}`, value });
  }
  return out;
}
