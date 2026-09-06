import type {
  DailyCheckIn,
  ISODate,
  IntensityKey,
  RecoverySettings,
  TrainingSession,
} from './types.ts';
import type { ShiftContext } from './shifts.ts';
import { addDays, lastNDays } from './date.ts';
import { average, clamp, consecutiveTrainingDays, loadStateOn, round1, scoreBetween } from './load.ts';

export type ReadinessLevel = 'ready' | 'moderate' | 'recovery' | 'unknown';

export interface ReadinessComponent {
  key: string;
  label: string;
  /** 0–100 sub-score. */
  score: number;
  /** Share of the final score this component carried. */
  weight: number;
  detail: string;
}

export interface Readiness {
  date: ISODate;
  /** 0–100, or null when there is not enough input to judge. */
  score: number | null;
  level: ReadinessLevel;
  /** Highest intensity the body state supports today. */
  intensityCeiling: IntensityKey;
  components: ReadinessComponent[];
  /** Short plain-language summary shown on the dashboard. */
  headline: string;
  /** What the user could log to make tomorrow's estimate better. */
  missingInputs: string[];
}

/**
 * Readiness is a weighted blend of whatever inputs exist. Weights of missing
 * components are redistributed across the rest, so the score stays honest
 * instead of silently assuming a default for data the user never entered.
 *
 * This is a training-guidance heuristic, not a medical assessment.
 */
const WEIGHTS = {
  sleep: 0.26,
  subjective: 0.24,
  loadBalance: 0.26,
  whoop: 0.14,
  hrv: 0.1,
} as const;

export function computeReadiness(
  date: ISODate,
  checkIns: Map<ISODate, DailyCheckIn>,
  sessions: TrainingSession[],
  shift: ShiftContext,
  settings: RecoverySettings,
): Readiness {
  const today = checkIns.get(date);
  const components: ReadinessComponent[] = [];
  const missing: string[] = [];

  /* ---- Sleep ---- */
  if (today?.sleepHours != null) {
    const target = settings.sleepHoursTarget;
    // Full credit at target, zero 3.5 h below it. Slight penalty for oversleep
    // beyond target + 2.5 h, which usually signals accumulated debt.
    let score = scoreBetween(today.sleepHours, target - 3.5, target);
    if (today.sleepHours > target + 2.5) score = Math.min(score, 88);
    if (today.sleepQuality != null) {
      score = score * 0.75 + scoreBetween(today.sleepQuality, 1, 5) * 0.25;
    }
    components.push({
      key: 'sleep',
      label: 'Schlaf',
      score: round1(score),
      weight: WEIGHTS.sleep,
      detail: `${today.sleepHours.toFixed(1)} h von ${target} h Ziel`,
    });
  } else {
    missing.push('Schlafdauer');
  }

  /* ---- Subjective state ---- */
  const subjective: number[] = [];
  if (today?.fatigue != null) subjective.push(scoreBetween(6 - today.fatigue, 1, 5));
  if (today?.soreness != null) subjective.push(scoreBetween(6 - today.soreness, 1, 5));
  if (today?.stress != null) subjective.push(scoreBetween(6 - today.stress, 1, 5));
  if (today?.motivation != null) subjective.push(scoreBetween(today.motivation, 1, 5) * 0.6 + 40);
  if (subjective.length > 0) {
    components.push({
      key: 'subjective',
      label: 'Befinden',
      score: round1(average(subjective)),
      weight: WEIGHTS.subjective,
      detail: describeSubjective(today),
    });
  } else {
    missing.push('Befinden (Müdigkeit, Muskelkater, Stress)');
  }

  /* ---- Load balance ---- */
  const load = loadStateOn(sessions, date);
  const streak = consecutiveTrainingDays(sessions, date);
  let loadScore = 70;
  const loadNotes: string[] = [];

  // Form (TSB) relative to fitness: deeply negative form means accumulated fatigue.
  if (load.ctl > 5) {
    const relative = load.tsb / Math.max(load.ctl, 1);
    loadScore = clamp(70 + relative * 120, 15, 100);
    loadNotes.push(`Form ${load.tsb > 0 ? '+' : ''}${load.tsb}`);
  } else {
    loadNotes.push('noch wenig Trainingshistorie');
  }
  if (load.acwr > settings.acwrCeiling) {
    loadScore -= 18;
    loadNotes.push(`ACWR ${load.acwr.toFixed(2)} über Limit`);
  } else if (load.acwr > 0) {
    loadNotes.push(`ACWR ${load.acwr.toFixed(2)}`);
  }
  if (streak >= 3) {
    loadScore -= (streak - 2) * 7;
    loadNotes.push(`${streak} Trainingstage in Folge`);
  }
  components.push({
    key: 'load',
    label: 'Belastung',
    score: round1(clamp(loadScore, 0, 100)),
    weight: WEIGHTS.loadBalance,
    detail: loadNotes.join(' · '),
  });

  /* ---- WHOOP ---- */
  if (today?.whoopRecovery != null) {
    components.push({
      key: 'whoop',
      label: 'WHOOP Recovery',
      score: clamp(today.whoopRecovery, 0, 100),
      weight: WEIGHTS.whoop,
      detail: `${Math.round(today.whoopRecovery)} %`,
    });
  }

  /* ---- HRV / resting HR against a rolling baseline ---- */
  const hrvScore = hrvComponent(date, checkIns, today);
  if (hrvScore) components.push(hrvScore);

  if (!today?.whoopRecovery && !hrvScore) missing.push('WHOOP Recovery oder HRV/Ruhepuls');

  /* ---- Blend ---- *
   * The load component is always available (it is derived, not reported), but
   * it alone cannot say how recovered someone is. Without at least one reported
   * or measured input the honest answer is "unknown", not a confident READY.
   */
  const reported = components.some((c) => c.key !== 'load');
  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  if (totalWeight === 0 || !reported) {
    return {
      date,
      score: null,
      level: 'unknown',
      // Without recovery data the engine stays at moderate: enough to train,
      // not enough to justify a hard session on an unknown body state.
      intensityCeiling: 'moderate',
      components,
      headline: 'Noch kein Check-in für heute — die Empfehlung rechnet nur mit deiner Trainingshistorie.',
      missingInputs: missing,
    };
  }

  let raw = components.reduce((sum, c) => sum + c.score * c.weight, 0) / totalWeight;
  const normalised = components.map((c) => ({ ...c, weight: round1((c.weight / totalWeight) * 100) / 100 }));

  /* ---- Shift modifiers ---- */
  const shiftNote = shiftReadinessModifier(shift);
  raw += shiftNote.delta;

  const score = round1(clamp(raw, 0, 100));
  const level: ReadinessLevel =
    score >= settings.readyThreshold ? 'ready' : score >= settings.recoveryThreshold ? 'moderate' : 'recovery';

  return {
    date,
    score,
    level,
    intensityCeiling: ceilingFor(level),
    components: shiftNote.delta !== 0
      ? [
          ...normalised,
          {
            key: 'shift',
            label: 'Schicht',
            score: clamp(70 + shiftNote.delta * 3, 0, 100),
            weight: 0,
            detail: shiftNote.reason,
          },
        ]
      : normalised,
    headline: headlineFor(level, score, shiftNote.reason),
    missingInputs: missing,
  };
}

function describeSubjective(c: DailyCheckIn | undefined): string {
  if (!c) return '';
  const parts: string[] = [];
  if (c.fatigue != null) parts.push(`Müdigkeit ${c.fatigue}/5`);
  if (c.soreness != null) parts.push(`Muskelkater ${c.soreness}/5`);
  if (c.stress != null) parts.push(`Stress ${c.stress}/5`);
  return parts.join(' · ');
}

/** Compares today's HRV / resting HR against the trailing 30-day baseline. */
function hrvComponent(
  date: ISODate,
  checkIns: Map<ISODate, DailyCheckIn>,
  today: DailyCheckIn | undefined,
): ReadinessComponent | null {
  if (!today || (today.hrvMs == null && today.restingHr == null)) return null;

  const window = lastNDays(addDays(date, -1), 30)
    .map((d) => checkIns.get(d))
    .filter((c): c is DailyCheckIn => !!c);

  if (today.hrvMs != null) {
    const baseline = average(window.map((c) => c.hrvMs).filter((v): v is number => v != null));
    if (baseline > 0) {
      const deviation = (today.hrvMs - baseline) / baseline;
      return {
        key: 'hrv',
        label: 'HRV',
        score: round1(clamp(70 + deviation * 220, 0, 100)),
        weight: WEIGHTS.hrv,
        detail: `${Math.round(today.hrvMs)} ms vs. ${Math.round(baseline)} ms Baseline`,
      };
    }
    return {
      key: 'hrv',
      label: 'HRV',
      score: 70,
      weight: WEIGHTS.hrv * 0.5,
      detail: `${Math.round(today.hrvMs)} ms — Baseline wird noch aufgebaut`,
    };
  }

  const baseline = average(window.map((c) => c.restingHr).filter((v): v is number => v != null));
  if (baseline > 0 && today.restingHr != null) {
    const deviation = today.restingHr - baseline;
    return {
      key: 'rhr',
      label: 'Ruhepuls',
      score: round1(clamp(80 - deviation * 7, 0, 100)),
      weight: WEIGHTS.hrv,
      detail: `${today.restingHr} bpm vs. ${Math.round(baseline)} bpm Baseline`,
    };
  }
  return null;
}

function shiftReadinessModifier(shift: ShiftContext): { delta: number; reason: string } {
  const key = shift.type?.key;
  const prev = shift.previous?.key;
  if (key === 'sick') return { delta: -40, reason: 'Krank gemeldet — Belastung pausiert' };
  if (key === 'sleep_day') {
    return { delta: -8, reason: 'Schlaftag nach Nachtschicht — der Schlaf war fragmentiert' };
  }
  if (key === 'night') {
    return { delta: -4, reason: 'Nachtschicht heute Abend — danach folgen 12 h wach' };
  }
  if (prev === 'night' && key !== 'sleep_day') {
    return { delta: -6, reason: 'Nachtschicht in der letzten Nacht' };
  }
  if (key === 'day') return { delta: -3, reason: '12-h-Tagschicht' };
  return { delta: 0, reason: '' };
}

function ceilingFor(level: ReadinessLevel): IntensityKey {
  if (level === 'ready') return 'max';
  if (level === 'moderate') return 'moderate';
  // In the recovery band the point is to restore, not to hold a habit: even an
  // easy Z2 session adds fatigue the athlete cannot currently absorb.
  return 'recovery';
}

function headlineFor(level: ReadinessLevel, score: number, shiftReason: string): string {
  const suffix = shiftReason ? ` (${shiftReason})` : '';
  if (level === 'ready') return `Bereit für harte Einheiten — Readiness ${score}${suffix}`;
  if (level === 'moderate') return `Moderates Training sinnvoll — Readiness ${score}${suffix}`;
  return `Regeneration bevorzugen — Readiness ${score}${suffix}`;
}

export const READINESS_LEVEL_META: Record<
  ReadinessLevel,
  { label: string; tone: 'good' | 'warn' | 'bad' | 'muted'; description: string }
> = {
  ready: { label: 'READY', tone: 'good', description: 'Hartes Training möglich' },
  moderate: { label: 'MODERATE', tone: 'warn', description: 'Moderates Training' },
  recovery: { label: 'RECOVERY', tone: 'bad', description: 'Regeneration bevorzugen' },
  unknown: { label: 'KEINE DATEN', tone: 'muted', description: 'Check-in ausstehend' },
};
