import type { ISODate } from '../types.ts';
import type { Baseline } from './whoop.ts';
import type { CycleDayNumber } from './types.ts';

/**
 * The recovery value **does not plan, it downgrades**.
 *
 * What is trained comes from the cycle template. This value, computed in the
 * morning, decides how much of it survives — and the first step it takes is
 * always a change of mode, not a cut in intensity.
 */

const BASE_BY_CYCLE_DAY: Record<number, { value: number; why: string }> = {
  4: { value: 100, why: 'Freier Tag nach zwei Nächten regulärem Schlaf' },
  5: { value: 90, why: 'Freier Tag, Vortag war bereits Trainingstag' },
  2: { value: 75, why: 'Ausgeschlafen, aber zirkadianes Vormittagstief' },
  3: { value: 60, why: 'Nur 6 h Tagschlaf, REM-arm, nach 24 h Wachzeit' },
  1: { value: 0, why: '12-h-Tagschicht ohne Trainingsfenster' },
};

const V_SHIFT_BASE = { value: 65, why: 'V-Schicht: Laufen im Dienst möglich, 12 h Dienst' };
const VACATION_BASE = { value: 85, why: 'Urlaub: kein Dienst, freier Schlaf' };
const UNKNOWN_BASE = { value: 50, why: 'Keine Schicht eingetragen — Erholung unbekannt' };

export interface RecoveryInput {
  date: ISODate;
  cycleDay: CycleDayNumber | null;
  isVShift: boolean;
  outOfRotation: 'vacation' | 'sick' | 'unknown' | null;
  /** Target sleep for this cycle day, in minutes. */
  sleepTargetMinutes: number;

  recoveryPct?: number;
  /** The 28-day mean of recovery **for this cycle day**. */
  recoveryBaseline?: Baseline;
  restingHr?: number;
  restingHrBaseline?: Baseline;

  sleepHours?: number;
  napExpected: boolean;
  napTaken?: boolean;
  wellbeing?: number;
  soreness?: number;
  /** Pain while walking. Not a deduction — it cancels the session. */
  painWhileWalking?: boolean;
  /**
   * Penalties handed over by the sleep module, already computed there.
   *
   * They arrive as finished numbers rather than as raw sleep data, because the
   * sleep module never decides about training — it produces signals and this one
   * place turns them into a recovery value. Two places deciding is how a plan
   * starts contradicting itself.
   */
  sleepPenalties?: { label: string; delta: number }[];
}

export interface RecoveryValue {
  value: number;
  base: number;
  adjustments: { label: string; delta: number }[];
  band: 'red' | 'amber' | 'green';
  known: boolean;
  /** True when the session must not happen at all. */
  blocked: boolean;
  blockedReason: string | null;
  /** True while the baselines are still filling up. */
  manualMode: boolean;
}

export function computeRecovery(input: RecoveryInput): RecoveryValue {
  /*
   * Pain while walking is not a number in a formula. It is the one input that
   * cancels the session outright, because the difference between soreness and
   * an injury is exactly whether it hurts to walk.
   */
  if (input.painWhileWalking) {
    return {
      value: 0,
      base: 0,
      adjustments: [{ label: 'Schmerz beim Gehen gemeldet', delta: 0 }],
      band: 'red',
      known: true,
      blocked: true,
      blockedReason:
        'Schmerz beim Gehen — die Einheit entfällt. Das ist der Unterschied zwischen Muskelkater und einer Verletzung.',
      manualMode: false,
    };
  }

  if (input.outOfRotation === 'sick') {
    return {
      value: 0,
      base: 0,
      adjustments: [{ label: 'Krank gemeldet', delta: 0 }],
      band: 'red',
      known: true,
      blocked: true,
      blockedReason: 'Krank gemeldet.',
      manualMode: false,
    };
  }

  const known = input.outOfRotation !== 'unknown';
  const baseEntry = input.isVShift
    ? V_SHIFT_BASE
    : input.cycleDay != null
      ? BASE_BY_CYCLE_DAY[input.cycleDay]
      : input.outOfRotation === 'vacation'
        ? VACATION_BASE
        : UNKNOWN_BASE;

  const adjustments: { label: string; delta: number }[] = [];
  let value = baseEntry.value;
  const add = (label: string, delta: number) => {
    if (delta === 0) return;
    adjustments.push({ label, delta });
    value += delta;
  };

  /*
   * Recovery is read as a deviation from this cycle day's own baseline, never
   * as an absolute. 45 % on a sleep day whose baseline is 48 % is a normal sleep
   * day, not a warning.
   */
  const recoveryReady = input.recoveryBaseline?.ready && input.recoveryBaseline.value != null;
  if (input.recoveryPct != null && recoveryReady) {
    const delta = input.recoveryPct - input.recoveryBaseline!.value!;
    if (delta <= -20) {
      add(`Recovery ${input.recoveryPct} %, ${Math.abs(Math.round(delta))} Punkte unter deinem Wert für diesen Zyklustag`, -30);
    } else if (delta <= -10) {
      add(`Recovery ${input.recoveryPct} %, ${Math.abs(Math.round(delta))} Punkte unter deinem Wert für diesen Zyklustag`, -15);
    }
  }

  if (input.sleepHours != null) {
    const shortfall = (input.sleepTargetMinutes - input.sleepHours * 60) / 60;
    if (shortfall >= 1) {
      add(
        `Schlaf ${input.sleepHours.toFixed(1)} h statt ${(input.sleepTargetMinutes / 60).toFixed(1)} h`,
        -10 * Math.floor(shortfall),
      );
    }
  }

  const hrReady = input.restingHrBaseline?.ready && input.restingHrBaseline.value != null;
  if (input.restingHr != null && hrReady) {
    const above = input.restingHr - input.restingHrBaseline!.value!;
    if (above >= 7) {
      add(`Ruhepuls ${input.restingHr} bpm, ${Math.round(above)} über deiner Baseline`, -15);
    }
  }

  if (input.wellbeing != null) {
    add(`Befinden ${input.wellbeing}/10`, (input.wellbeing - 7) * 5);
  }

  if (input.soreness != null && input.soreness >= 3) {
    add(`Muskelkater ${input.soreness}/5`, -15);
  }

  for (const penalty of input.sleepPenalties ?? []) {
    add(penalty.label, penalty.delta);
  }

  const clamped = Math.max(0, Math.min(100, Math.round(value)));

  /*
   * Manual mode: with the baselines still filling, the device numbers are shown
   * but never act. An automatic downgrade off four samples would be a guess
   * wearing the costume of a measurement.
   */
  const manualMode = !recoveryReady && input.recoveryPct != null;

  return {
    value: clamped,
    base: baseEntry.value,
    adjustments,
    band: clamped < 45 ? 'red' : clamped < 75 ? 'amber' : 'green',
    known,
    blocked: false,
    blockedReason: null,
    manualMode,
  };
}

export function baseReasonFor(input: Pick<RecoveryInput, 'cycleDay' | 'isVShift' | 'outOfRotation'>): string {
  if (input.outOfRotation === 'sick') return 'Krank gemeldet';
  if (input.isVShift) return V_SHIFT_BASE.why;
  if (input.cycleDay == null) {
    return input.outOfRotation === 'vacation' ? VACATION_BASE.why : UNKNOWN_BASE.why;
  }
  return BASE_BY_CYCLE_DAY[input.cycleDay].why;
}

export const RECOVERY_BAND_META: Record<
  RecoveryValue['band'],
  { label: string; color: string; advice: string }
> = {
  red: {
    label: 'wenig erholt',
    color: 'var(--bad)',
    advice: 'Die Einheit wird kürzer oder leichter — bis hin zu Gehen oder Ruhe.',
  },
  amber: {
    label: 'teilweise erholt',
    color: 'var(--warn)',
    advice: 'Trägt eine kürzere Einheit. Weniger laufen, nicht anders trainieren.',
  },
  green: {
    label: 'gut erholt',
    color: 'var(--good)',
    advice: 'Der Tag trägt die vorgesehene Einheit.',
  },
};
