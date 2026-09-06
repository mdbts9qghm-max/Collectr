import type { DailyCheckIn, ISODate } from '../types.ts';
import type { DayShape, RecoveryValue } from './types.ts';
import { addDays } from '../date.ts';

/**
 * Recovery value per day, 0–100.
 *
 * A start value follows from the cycle position alone — what the rotation did
 * to sleep is known before anything is logged. Everything the athlete actually
 * enters then adjusts it: yesterday's load, the training streak, subjective
 * wellbeing, and how far real sleep fell short of the target for that day.
 *
 * The next day influences today only through the hard rules, not through this
 * value; the rules are where a night shift tomorrow shortens today's session.
 */

const BASE_BY_CYCLE_DAY: Record<number, { value: number; why: string }> = {
  4: { value: 100, why: 'Freier Tag nach zwei Nächten regulärem Schlaf' },
  5: { value: 90, why: 'Freier Tag, Vortag war aber bereits Trainingstag' },
  2: { value: 75, why: 'Ausgeschlafen, aber zirkadianes Vormittagstief' },
  3: { value: 60, why: 'Nur 6 h Tagschlaf, REM-arm, nach 24 h Wachzeit' },
  1: { value: 0, why: '12-h-Tagschicht ohne Trainingsfenster' },
};

const V_SHIFT_BASE = { value: 55, why: 'V-Schicht: enges Fenster, 12 h Dienst' };
const OUT_OF_ROTATION_BASE = { value: 85, why: 'Außerhalb der Rotation' };

export interface RecoveryInputs {
  /** Total load per day, from what was actually completed. */
  loadByDate: Map<ISODate, number>;
  checkIns: Map<ISODate, DailyCheckIn>;
}

export function computeRecovery(shape: DayShape, inputs: RecoveryInputs): RecoveryValue {
  if (shape.outOfRotation === 'sick') {
    return {
      value: 0,
      base: 0,
      adjustments: [{ label: 'Krank gemeldet', delta: 0 }],
      band: 'red',
    };
  }

  const baseEntry = shape.isVShift
    ? V_SHIFT_BASE
    : shape.cycleDay != null
      ? BASE_BY_CYCLE_DAY[shape.cycleDay]
      : OUT_OF_ROTATION_BASE;

  const adjustments: { label: string; delta: number }[] = [];
  let value = baseEntry.value;

  const previousDate = addDays(shape.date, -1);
  const previousLoad = inputs.loadByDate.get(previousDate) ?? 0;

  if (previousLoad >= 60) {
    adjustments.push({ label: `Vortag mit hoher Belastung (${previousLoad})`, delta: -12 });
    value -= 12;
  } else if (previousLoad === 0) {
    adjustments.push({ label: 'Vortag war echter Ruhetag', delta: +5 });
    value += 5;
  }

  // From the third consecutive training day onward, ten points per further day.
  const streak = consecutiveTrainingDays(shape.date, inputs.loadByDate);
  if (streak >= 2) {
    const delta = -10 * (streak - 1);
    adjustments.push({ label: `${streak + 1}. Trainingstag in Folge`, delta });
    value += delta;
  }

  const checkIn = inputs.checkIns.get(shape.date);
  if (checkIn?.wellbeing != null) {
    const delta = (checkIn.wellbeing - 7) * 5;
    adjustments.push({ label: `Befinden ${checkIn.wellbeing}/10`, delta });
    value += delta;
  }

  if (checkIn?.sleepHours != null) {
    const actual = checkIn.sleepHours * 60;
    if (actual <= shape.sleep.targetMinutes - 60) {
      adjustments.push({
        label: `Schlaf ${checkIn.sleepHours.toFixed(1)} h statt ${(shape.sleep.targetMinutes / 60).toFixed(1)} h`,
        delta: -10,
      });
      value -= 10;
    }
  }

  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return {
    value: clamped,
    base: baseEntry.value,
    adjustments,
    band: clamped < 45 ? 'red' : clamped < 75 ? 'amber' : 'green',
  };
}

/** Consecutive days with load before `date`, stopping at the first rest day. */
function consecutiveTrainingDays(date: ISODate, loadByDate: Map<ISODate, number>): number {
  let count = 0;
  let cursor = addDays(date, -1);
  while ((loadByDate.get(cursor) ?? 0) > 0 && count < 14) {
    count += 1;
    cursor = addDays(cursor, -1);
  }
  return count;
}

export function baseReasonFor(shape: DayShape): string {
  if (shape.outOfRotation === 'sick') return 'Krank gemeldet';
  if (shape.isVShift) return V_SHIFT_BASE.why;
  if (shape.cycleDay == null) return OUT_OF_ROTATION_BASE.why;
  return BASE_BY_CYCLE_DAY[shape.cycleDay].why;
}
