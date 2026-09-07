import type { DailyCheckIn, ISODate } from '../types.ts';
import type { DayShape, RecoveryValue } from './types.ts';

/**
 * The recovery value does not plan. It downgrades.
 *
 * The plan comes from the fixed template — same rotation position, same
 * session, every cycle. This value is the filter that sits in front of it:
 * computed in the morning, compared against the session's minimum, and where it
 * falls short the session is weakened along its chain. It never chooses what to
 * train, only how much of it survives the morning.
 *
 * A start value follows from the cycle position alone, because what the
 * rotation does to sleep is known before anything is logged. Everything the
 * athlete actually enters then adjusts it.
 */

const BASE_BY_CYCLE_DAY: Record<number, { value: number; why: string }> = {
  4: { value: 100, why: 'Freier Tag nach zwei Nächten regulärem Schlaf' },
  5: { value: 90, why: 'Freier Tag, Vortag war aber bereits Trainingstag' },
  2: { value: 75, why: 'Ausgeschlafen, aber zirkadianes Vormittagstief' },
  3: { value: 60, why: 'Nur 6 h Tagschlaf, REM-arm, nach 24 h Wachzeit' },
  1: { value: 0, why: '12-h-Tagschicht ohne Trainingsfenster' },
};

const V_SHIFT_BASE = { value: 55, why: 'V-Schicht: enges Fenster, 12 h Dienst' };
const VACATION_BASE = { value: 85, why: 'Urlaub: kein Dienst, freier Schlaf' };
/**
 * A day whose shift was never entered.
 *
 * The number is a placeholder, not an estimate: without the shift the app does
 * not know what the day did to sleep. The planner skips these days entirely and
 * the UI shows them as unknown.
 */
const UNKNOWN_BASE = { value: 50, why: 'Keine Schicht eingetragen — Erholung unbekannt' };

/** Soreness on the 1–5 scale counts against the day from 3 upward. */
export const SORENESS_THRESHOLD = 3;
/** Resting heart rate this far above the norm counts as a warning sign. */
export const RESTING_HR_MARGIN = 7;

export interface RecoveryInputs {
  checkIns: Map<ISODate, DailyCheckIn>;
  /** The athlete's normal resting heart rate, from the profile or a baseline. */
  restingHrNorm?: number | null;
}

export function computeRecovery(shape: DayShape, inputs: RecoveryInputs): RecoveryValue {
  if (shape.outOfRotation === 'sick') {
    return {
      value: 0,
      base: 0,
      adjustments: [{ label: 'Krank gemeldet', delta: 0 }],
      band: 'red',
      known: true,
    };
  }

  const known = shape.outOfRotation !== 'unknown';
  const baseEntry = shape.isVShift
    ? V_SHIFT_BASE
    : shape.cycleDay != null
      ? BASE_BY_CYCLE_DAY[shape.cycleDay]
      : shape.outOfRotation === 'vacation'
        ? VACATION_BASE
        : UNKNOWN_BASE;

  const adjustments: { label: string; delta: number }[] = [];
  let value = baseEntry.value;
  const add = (label: string, delta: number) => {
    if (delta === 0) return;
    adjustments.push({ label, delta });
    value += delta;
  };

  const checkIn = inputs.checkIns.get(shape.date);

  // Sleep: ten points per full hour below the target for this cycle day.
  if (checkIn?.sleepHours != null) {
    const shortfallHours = (shape.sleep.targetMinutes - checkIn.sleepHours * 60) / 60;
    if (shortfallHours >= 1) {
      const hours = Math.floor(shortfallHours);
      add(
        `Schlaf ${checkIn.sleepHours.toFixed(1)} h statt ${(shape.sleep.targetMinutes / 60).toFixed(1)} h`,
        -10 * hours,
      );
    }
  }

  // The prophylactic nap is half of what makes a night shift survivable, so
  // missing it costs more than the lost minutes alone would suggest.
  if (shape.nap && checkIn?.napTaken === false) {
    add('Vorschlaf vor dem Nachtdienst ausgefallen', -15);
  }

  if (checkIn?.wellbeing != null) {
    add(`Befinden ${checkIn.wellbeing}/10`, (checkIn.wellbeing - 7) * 5);
  }

  if (checkIn?.soreness != null && checkIn.soreness >= SORENESS_THRESHOLD) {
    add(`Muskelkater ${checkIn.soreness}/5`, -15);
  }

  const norm = inputs.restingHrNorm;
  if (checkIn?.restingHr != null && norm != null && norm > 0) {
    const above = checkIn.restingHr - norm;
    if (above >= RESTING_HR_MARGIN) {
      add(`Ruhepuls ${checkIn.restingHr} bpm, ${above} über deinem Normwert`, -15);
    }
  }

  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return {
    value: clamped,
    base: baseEntry.value,
    adjustments,
    band: clamped < 45 ? 'red' : clamped < 75 ? 'amber' : 'green',
    known,
  };
}

export function baseReasonFor(shape: DayShape): string {
  if (shape.outOfRotation === 'sick') return 'Krank gemeldet';
  if (shape.isVShift) return V_SHIFT_BASE.why;
  if (shape.cycleDay == null) {
    return shape.outOfRotation === 'vacation' ? VACATION_BASE.why : UNKNOWN_BASE.why;
  }
  return BASE_BY_CYCLE_DAY[shape.cycleDay].why;
}

/**
 * How a recovery value reads on screen. The thresholds are the same ones
 * `computeRecovery` bands on, kept in one place so the colour and the number
 * can never disagree.
 */
export const RECOVERY_BAND_META: Record<
  RecoveryValue['band'],
  { label: string; color: string; advice: string }
> = {
  red: {
    label: 'wenig erholt',
    color: 'var(--bad)',
    advice: 'Die Einheit des Tages wird abgestuft, nicht gestrichen.',
  },
  amber: {
    label: 'teilweise erholt',
    color: 'var(--warn)',
    advice: 'Mittlere Belastung geht. Alles Intensive wird abgestuft.',
  },
  green: {
    label: 'gut erholt',
    color: 'var(--good)',
    advice: 'Der Tag trägt die vorgesehene Einheit.',
  },
};
