import type {
  AppSettings,
  ISODate,
  IntensityKey,
  Rating,
  ShiftAssignment,
  ShiftType,
  TrainingSession,
} from './types.ts';
import { addDays, endOfWeek } from './date.ts';
import { adjustedTrainingMinutes, buildShiftContext, shiftSleepMinutes } from './shifts.ts';
import { effectiveDuration, intensityRank, isLongSession, sessionLoad } from './load.ts';

/**
 * Forward horizon.
 *
 * The engine already knows a great deal about the past — six weeks of load, a
 * month of session history, a four-month behaviour profile. This module gives
 * it the matching view of what is coming: how much training time the next days
 * actually offer, how much sleep the shifts allow, and what load is already
 * committed.
 *
 * Everything here is derived from the shift plan, not predicted. Days without a
 * shift are marked `known: false` and deliberately produce no conclusions —
 * an empty calendar must never be read as "no good day is coming".
 */

export interface DayOutlook {
  date: ISODate;
  /** 1 = tomorrow. */
  daysAhead: number;
  /** False when no shift is assigned; the day carries no reliable information. */
  known: boolean;
  shift: ShiftType | null;
  /** Training minutes the shift allows, after cross-day adjustments. */
  capacityMinutes: number;
  maxIntensity: IntensityKey;
  rating: Rating | null;
  plannedMinutes: number;
  plannedLoad: number;
  /** Capacity left after what is already planned. */
  freeMinutes: number;
  /** Main-sleep hours the shift's sleep window allows. */
  expectedSleepHours: number | null;
  /** Enough room and freedom for a long endurance session. */
  canHostLong: boolean;
  /** A long session is already planned on this day. */
  hasLongPlanned: boolean;
  /** An intensive session is already planned on this day. */
  hasHardPlanned: boolean;
}

export interface Outlook {
  from: ISODate;
  horizonDays: number;
  days: DayOutlook[];
  /** True when every day in the horizon has a shift assigned. */
  complete: boolean;
  unknownDays: number;

  /** Free training minutes across the whole horizon. */
  totalFreeMinutes: number;
  /** Free training minutes until the end of the current week. */
  restOfWeekFreeMinutes: number;
  /** Whether every remaining day of this week has a shift assigned. */
  restOfWeekComplete: boolean;
  /** True when today is the final day of the training week. */
  isLastDayOfWeek: boolean;

  /** Next day rated green, if any. */
  nextGreenDay: DayOutlook | null;
  /** Best upcoming day for a long session — most free time, earliest on a tie. */
  bestLongDay: DayOutlook | null;
  /** Days in the horizon that could host a long session. */
  longCapableDays: number;

  /** Load already committed to the coming days. */
  plannedLoadAhead: number;
  /** The soonest day with an intensive session already planned. */
  nextHardPlanned: DayOutlook | null;
  /** The soonest day with a long session already planned. */
  nextLongPlanned: DayOutlook | null;

  /** Mean expected sleep over the next three known days. */
  expectedSleepAhead: number | null;
  /** True when the coming days structurally do not allow enough sleep. */
  sleepConstrainedAhead: boolean;
}

const LONG_SESSION_MINUTES = 90;

export function buildOutlook(
  date: ISODate,
  assignments: Map<ISODate, ShiftAssignment>,
  types: Map<string, ShiftType>,
  sessions: TrainingSession[],
  settings: AppSettings,
  horizonDays = 7,
): Outlook {
  const weekEnd = endOfWeek(date, settings.weekStartsOn);
  const byDate = new Map<ISODate, TrainingSession[]>();
  for (const s of sessions) {
    const list = byDate.get(s.date);
    if (list) list.push(s);
    else byDate.set(s.date, [s]);
  }

  const days: DayOutlook[] = [];
  for (let i = 1; i <= horizonDays; i++) {
    const d = addDays(date, i);
    const assignment = assignments.get(d);
    const ctx = buildShiftContext(d, assignments, types);
    const shift = ctx.type;

    const planned = (byDate.get(d) ?? []).filter((s) => s.status === 'planned');
    const plannedMinutes = planned.reduce((sum, s) => sum + effectiveDuration(s), 0);
    const capacityMinutes = adjustedTrainingMinutes(ctx);
    const freeMinutes = Math.max(0, capacityMinutes - plannedMinutes);
    const sleepMinutes = shiftSleepMinutes(shift);

    days.push({
      date: d,
      daysAhead: i,
      known: !!assignment && !!shift,
      shift,
      capacityMinutes,
      maxIntensity: shift?.training.maxIntensity ?? 'max',
      rating: shift?.training.rating ?? null,
      plannedMinutes,
      plannedLoad: planned.reduce((sum, s) => sum + sessionLoad(s), 0),
      freeMinutes,
      expectedSleepHours: sleepMinutes > 0 ? Math.round((sleepMinutes / 60) * 10) / 10 : null,
      canHostLong:
        !!shift && shift.training.rating === 'green' && freeMinutes >= LONG_SESSION_MINUTES,
      hasLongPlanned: planned.some(isLongSession),
      hasHardPlanned: planned.some(
        (s) => intensityRank(s.plannedIntensity) >= intensityRank('threshold'),
      ),
    });
  }

  const known = days.filter((d) => d.known);
  const restOfWeek = days.filter((d) => d.date <= weekEnd);
  const longCapable = days.filter((d) => d.canHostLong);

  // Most free time wins; an earlier date breaks the tie, because a plan that
  // happens sooner is a plan that is more likely to survive contact with life.
  const bestLongDay =
    longCapable.slice().sort((a, b) => b.freeMinutes - a.freeMinutes || a.daysAhead - b.daysAhead)[0] ??
    null;

  const sleepSample = known
    .slice(0, 3)
    .map((d) => d.expectedSleepHours)
    .filter((v): v is number => v != null);
  const expectedSleepAhead =
    sleepSample.length > 0
      ? Math.round((sleepSample.reduce((a, b) => a + b, 0) / sleepSample.length) * 10) / 10
      : null;

  return {
    from: date,
    horizonDays,
    days,
    complete: days.every((d) => d.known),
    unknownDays: days.length - known.length,

    totalFreeMinutes: days.reduce((sum, d) => sum + (d.known ? d.freeMinutes : 0), 0),
    restOfWeekFreeMinutes: restOfWeek.reduce((sum, d) => sum + (d.known ? d.freeMinutes : 0), 0),
    restOfWeekComplete: restOfWeek.every((d) => d.known),
    isLastDayOfWeek: restOfWeek.length === 0,

    nextGreenDay: days.find((d) => d.rating === 'green') ?? null,
    bestLongDay,
    longCapableDays: longCapable.length,

    plannedLoadAhead: days.reduce((sum, d) => sum + d.plannedLoad, 0),
    nextHardPlanned: days.find((d) => d.hasHardPlanned) ?? null,
    nextLongPlanned: days.find((d) => d.hasLongPlanned) ?? null,

    expectedSleepAhead,
    // Two or more known days averaging more than an hour below target is a
    // structural sleep deficit, not a bad night.
    sleepConstrainedAhead:
      sleepSample.length >= 2 && expectedSleepAhead != null
        ? expectedSleepAhead < settings.recovery.sleepHoursTarget - 1
        : false,
  };
}

/** Empty horizon, used where no shift data is available at all. */
export function emptyOutlook(date: ISODate, horizonDays = 7): Outlook {
  return {
    from: date,
    horizonDays,
    days: [],
    complete: false,
    unknownDays: horizonDays,
    totalFreeMinutes: 0,
    restOfWeekFreeMinutes: 0,
    restOfWeekComplete: false,
    isLastDayOfWeek: false,
    nextGreenDay: null,
    bestLongDay: null,
    longCapableDays: 0,
    plannedLoadAhead: 0,
    nextHardPlanned: null,
    nextLongPlanned: null,
    expectedSleepAhead: null,
    sleepConstrainedAhead: false,
  };
}
