import type { DailyCheckIn, ISODate } from '../types.ts';
import type { PlannedUnit, SessionKind } from './types.ts';
import { CATALOGUE } from './catalogue.ts';
import { addDays } from '../date.ts';

/**
 * Adjusting the day's plan to how the morning actually feels.
 *
 * The planner builds the cycle from what it knew yesterday. A morning can
 * contradict that, and the honest response is to change the session rather than
 * to insist on the plan. The trigger is a deviation of two points or more from
 * the athlete's own normal — not from an absolute number, because someone who
 * reports a six every day is not permanently under-recovered.
 */

/** The neutral value the recovery model is calibrated on. */
export const NEUTRAL_WELLBEING = 7;

/** How far the morning has to deviate before the plan is questioned. */
export const ADJUST_THRESHOLD = 2;

/**
 * One step up the chain: the session that downgrades into `kind`.
 *
 * Two sessions downgrade into regeneration, so that one step is ambiguous. It
 * resolves to the easy run, because the way back from a rest day is a light
 * run, not a lifting session.
 */
export function upgradeOf(kind: SessionKind): SessionKind | null {
  if (kind === 'regeneration') return 'easy_run';
  for (const spec of Object.values(CATALOGUE)) {
    if (spec.downgradeTo === kind) return spec.kind;
  }
  return null;
}

/**
 * The athlete's own baseline: the median of the last two weeks of reported
 * wellbeing. A median rather than a mean, because one wrecked night should not
 * move the yardstick the next day is measured against.
 */
export function wellbeingBaseline(
  checkIns: Map<ISODate, DailyCheckIn>,
  date: ISODate,
  days = 14,
): number {
  const values: number[] = [];
  for (let i = 1; i <= days; i++) {
    const value = checkIns.get(addDays(date, -i))?.wellbeing;
    if (value != null) values.push(value);
  }
  if (values.length < 3) return NEUTRAL_WELLBEING;
  values.sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  return values.length % 2 === 1 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}

export interface Adjustment {
  direction: 'up' | 'down';
  from: SessionKind;
  to: SessionKind;
  /** Difference against the baseline, rounded to one decimal. */
  deviation: number;
  reason: string;
}

/**
 * Suggests a change to today's planned session, or null when the morning does
 * not contradict the plan. Never applied automatically — the athlete decides.
 */
export function suggestAdjustment(
  unit: PlannedUnit | null,
  wellbeing: number | undefined,
  baseline: number,
  /** The day's recovery value. An upgrade the day cannot carry is not offered. */
  recovery?: number,
): Adjustment | null {
  if (!unit || wellbeing == null) return null;
  const deviation = Math.round((wellbeing - baseline) * 10) / 10;
  if (Math.abs(deviation) < ADJUST_THRESHOLD) return null;

  if (deviation <= -ADJUST_THRESHOLD) {
    const to = CATALOGUE[unit.kind].downgradeTo;
    if (!to) return null;
    return {
      direction: 'down',
      from: unit.kind,
      to,
      deviation,
      reason: `Befinden ${wellbeing} liegt ${Math.abs(deviation)} Punkte unter deinem Normalwert ${baseline}.`,
    };
  }

  const to = upgradeOf(unit.kind);
  if (!to) return null;
  // A good morning does not create recovery that is not there. The hard rule
  // stands: a session whose minimum the day misses is never suggested.
  if (recovery != null && recovery < CATALOGUE[to].minRecovery) return null;
  return {
    direction: 'up',
    from: unit.kind,
    to,
    deviation,
    reason: `Befinden ${wellbeing} liegt ${deviation} Punkte über deinem Normalwert ${baseline}.`,
  };
}
