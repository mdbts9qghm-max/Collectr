import type { ISODate, SportKey, TrainingPhase, TrainingPlan } from './types.ts';
import { diffDays, startOfWeek } from './date.ts';

/**
 * Within a phase the weekly volume follows a 3:1 wave (build, build, peak,
 * deload). Constant weekly volume is the most common way recreational athletes
 * dig themselves into a hole, so the deload is applied automatically rather
 * than left to discipline.
 */
export const MESOCYCLE_WAVE = [1.0, 1.07, 1.14, 0.68];

/**
 * A recovery phase runs the other way round.
 *
 * After a goal event the body is not in a position to be built — it is in a
 * position to be let go. So the volume starts at its lowest and climbs back,
 * and there is no deload week: the whole phase is one.
 */
export const RECOVERY_RAMP = [0.55, 0.7, 0.85, 1.0];

export function activePhase(plan: TrainingPlan | null, date: ISODate): TrainingPhase | null {
  if (!plan) return null;
  return plan.phases.find((p) => date >= p.startDate && date <= p.endDate) ?? null;
}

export function nextPhase(plan: TrainingPlan | null, date: ISODate): TrainingPhase | null {
  if (!plan) return null;
  return plan.phases.filter((p) => p.startDate > date).sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null;
}

/** The last day the plan covers, or null when it has no phases. */
export function planEndDate(plan: TrainingPlan | null): ISODate | null {
  if (!plan || plan.phases.length === 0) return null;
  return plan.phases.reduce((latest, p) => (p.endDate > latest ? p.endDate : latest), plan.phases[0].endDate);
}

export type PlanStatus = 'none' | 'before' | 'active' | 'ended';

/**
 * Where the date sits relative to the plan.
 *
 * This exists because a finished plan used to be indistinguishable from no plan
 * at all: both produced a null phase, and a null phase quietly meant "full
 * volume, week one of the wave, forever". A plan that has run out is a fact
 * worth stating, not a gap to paper over.
 */
export function planStatus(plan: TrainingPlan | null, date: ISODate): PlanStatus {
  if (!plan || plan.phases.length === 0) return 'none';
  if (activePhase(plan, date)) return 'active';
  const end = planEndDate(plan);
  if (end && date > end) return 'ended';
  return 'before';
}

/** Whole weeks between the end of the plan and the date, 1-based. */
export function weeksSincePlanEnd(
  plan: TrainingPlan | null,
  date: ISODate,
  weekStartsOn: 0 | 1 = 1,
): number {
  const end = planEndDate(plan);
  if (!end || date <= end) return 0;
  return Math.max(1, Math.floor(diffDays(startOfWeek(date, weekStartsOn), startOfWeek(end, weekStartsOn)) / 7) + 1);
}

/** 1-based index of the current week inside its phase. */
export function weekInPhase(phase: TrainingPhase | null, date: ISODate, weekStartsOn: 0 | 1 = 1): number {
  if (!phase) return 1;
  const phaseWeekStart = startOfWeek(phase.startDate, weekStartsOn);
  const currentWeekStart = startOfWeek(date, weekStartsOn);
  return Math.max(1, Math.floor(diffDays(currentWeekStart, phaseWeekStart) / 7) + 1);
}

export function isDeloadWeek(
  plan: TrainingPlan | null,
  phase: TrainingPhase | null,
  date: ISODate,
  weekStartsOn: 0 | 1 = 1,
): boolean {
  if (!plan || !phase) return false;
  const cycle = Math.max(2, plan.mesocycleWeeks);
  return weekInPhase(phase, date, weekStartsOn) % cycle === 0;
}

export interface WeekTarget {
  hours: number;
  minutes: number;
  /** Target minutes per sport for the week. */
  bySport: Partial<Record<SportKey, number>>;
  intensityDistribution: { easy: number; moderate: number; hard: number };
  strengthSessions: number;
  deload: boolean;
  waveFactor: number;
  phase: TrainingPhase | null;
  weekIndex: number;
  /** Where the week sits relative to the plan. */
  status: PlanStatus;
  /** Weeks past the end of the plan, 0 while it still runs. */
  weeksPastPlan: number;
}

/**
 * The week's target volume: the phase baseline, shaped by the mesocycle wave
 * and capped at the user's realistic weekly hours.
 */
export function weekTarget(
  plan: TrainingPlan | null,
  date: ISODate,
  weeklyHoursCap: number,
  weekStartsOn: 0 | 1 = 1,
): WeekTarget {
  const phase = activePhase(plan, date);
  const status = planStatus(plan, date);
  const weeksPastPlan = status === 'ended' ? weeksSincePlanEnd(plan, date, weekStartsOn) : 0;

  // Past the end of the plan the wave keeps counting from the plan's last day.
  // Without this the week index froze at one and the deload never came again:
  // the app would have prescribed a peak week every week, indefinitely.
  const weekIndex = phase ? weekInPhase(phase, date, weekStartsOn) : Math.max(1, weeksPastPlan);
  const cycle = Math.max(2, plan?.mesocycleWeeks ?? 4);
  const waveIndex = (weekIndex - 1) % cycle;

  // A recovery phase ramps back up instead of waving; everywhere else the
  // 3:1 wave applies.
  const ramp = phase?.kind === 'recovery' ? RECOVERY_RAMP : MESOCYCLE_WAVE;
  const waveFactor =
    cycle === ramp.length
      ? ramp[waveIndex]
      : phase?.kind === 'recovery'
        ? 0.55 + (0.45 * waveIndex) / Math.max(1, cycle - 1)
        : waveIndex === cycle - 1
          ? 0.68
          : 1 + waveIndex * 0.07;

  const baseHours = phase?.weeklyHoursTarget ?? weeklyHoursCap;
  const hours = Math.min(baseHours * waveFactor, weeklyHoursCap * 1.15);
  const minutes = Math.round(hours * 60);

  const focus = phase?.sportFocus ?? { run: 0.45, bike: 0.25, swim: 0.08, strength: 0.15, mobility: 0.07 };
  const sum = Object.values(focus).reduce((a, b) => a + (b ?? 0), 0) || 1;
  const bySport: Partial<Record<SportKey, number>> = {};
  for (const [sport, share] of Object.entries(focus) as [SportKey, number][]) {
    bySport[sport] = Math.round((share / sum) * minutes);
  }

  return {
    hours: Math.round(hours * 10) / 10,
    minutes,
    bySport,
    intensityDistribution: phase?.intensityDistribution ?? { easy: 0.8, moderate: 0.12, hard: 0.08 },
    strengthSessions: phase?.strengthSessionsPerWeek ?? 2,
    deload: isDeloadWeek(plan, phase, date, weekStartsOn) || (status === 'ended' && waveIndex === cycle - 1),
    waveFactor: Math.round(waveFactor * 100) / 100,
    phase,
    weekIndex,
    status,
    weeksPastPlan,
  };
}

export const PHASE_META: Record<
  TrainingPhase['kind'],
  { label: string; color: string; description: string }
> = {
  base: {
    label: 'Base',
    color: 'var(--sport-mobility)',
    description: 'Grundlagenausdauer, Technik und Kraftbasis. Umfang vor Intensität.',
  },
  build: {
    label: 'Build',
    color: 'var(--info)',
    description: 'Mehr Umfang plus gezielte Intensität. Der Long Run wächst.',
  },
  peak: {
    label: 'Peak',
    color: 'var(--sport-run)',
    description: 'Wettkampfspezifische Belastung. Kraft nur noch erhaltend.',
  },
  taper: {
    label: 'Taper',
    color: 'var(--sport-strength)',
    description: 'Umfang runter, Häufigkeit und kurze Reize halten.',
  },
  recovery: {
    label: 'Recovery',
    color: 'var(--text-muted)',
    description: 'Bewusster Rückschritt im Umfang, um Fitness zu konsolidieren.',
  },
};
