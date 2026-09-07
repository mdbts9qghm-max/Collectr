import type { ISODate } from '../types.ts';

/**
 * WHOOP data, and the two things that go wrong if you take it at face value on
 * a shift rotation.
 *
 * **1 · The physiological cycle does not line up with the calendar day.**
 * WHOOP defines a day by sleep periods with a boundary around 04:00. When the
 * main sleep runs 08:00 to 14:00 — which it does on cycle day 3 — the WHOOP
 * cycle and the shift day come apart. Every sleep period therefore has to be
 * assigned to a cycle day explicitly, and the 15:00–17:30 pre-shift sleep has to
 * be recognised as a nap and booked separately from the main sleep.
 *
 * **2 · Absolute recovery thresholds are useless under shift work.**
 * Recovery and HRV are systematically lower after night duty without training
 * tolerance dropping by the same amount. Reading 45 % as "bad" on a sleep day
 * would downgrade a session that the athlete could have done perfectly well.
 * The fix is a rolling baseline **per cycle day**: what is compared is the
 * deviation from that cycle day's own 28-day mean, never the raw number.
 *
 * Below 28 days of data the app works in manual mode and makes no automatic
 * downgrades at all — an average of four readings is not a baseline.
 */

export const BASELINE_WINDOW_DAYS = 28;
export const MIN_BASELINE_SAMPLES = 5;
/** Days of history before the automatic filter is trusted at all. */
export const BASELINE_READY_DAYS = 28;

export type SleepKind = 'main' | 'nap';

export interface SleepPeriod {
  /** Start and end as full ISO timestamps, because these cross midnight. */
  start: string;
  end: string;
  kind: SleepKind;
  /** The cycle day this sleep belongs to, once assigned. */
  assignedTo?: ISODate;
}

export interface WhoopDay {
  date: ISODate;
  recoveryPct?: number;
  hrvMs?: number;
  restingHr?: number;
  sleepPerformancePct?: number;
  /** Hours of accumulated sleep debt, as WHOOP reports it. */
  sleepDebtHours?: number;
  /** Kept for display only — never used to steer the plan. */
  dayStrain?: number;
  sleep: SleepPeriod[];
}

/**
 * Assigns a sleep period to a shift day.
 *
 * A sleep is booked to the day it *ends* on when it ends before noon, and to the
 * day it starts on otherwise. That single rule handles both the ordinary night
 * (22:45 → 06:45, books to the waking day) and the day sleep after night duty
 * (08:00 → 14:00, books to the same day). The pre-shift nap is recognised by its
 * window, not by its length: a 2.5-hour sleep in the afternoon is a nap here
 * even though WHOOP might call it a sleep period of its own.
 */
export function assignSleep(period: Omit<SleepPeriod, 'assignedTo'>): SleepPeriod {
  const end = new Date(period.end);
  const start = new Date(period.start);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const startHour = start.getHours();
  const isAfternoonNap = startHour >= 13 && startHour <= 18;
  const kind: SleepKind = isAfternoonNap ? 'nap' : period.kind;

  const assignedTo = end.getHours() < 12 && !isAfternoonNap ? iso(end) : iso(start);
  return { ...period, kind, assignedTo };
}

export interface Baseline {
  /** Null until there are enough samples for the number to mean anything. */
  value: number | null;
  samples: number;
  ready: boolean;
}

/**
 * The 28-day mean for one metric on one cycle day.
 *
 * Separated by cycle day, because that is the only way the comparison says
 * anything: a sleep day's recovery belongs next to other sleep days, not next
 * to a rest day's.
 */
export function baselineFor(
  history: { date: ISODate; cycleDay: number | null; value: number | undefined }[],
  cycleDay: number | null,
): Baseline {
  const samples = history
    .filter((h) => h.cycleDay === cycleDay && h.value != null)
    .slice(0, BASELINE_WINDOW_DAYS)
    .map((h) => h.value!);

  if (samples.length < MIN_BASELINE_SAMPLES) {
    return { value: null, samples: samples.length, ready: false };
  }
  const mean = samples.reduce((sum, v) => sum + v, 0) / samples.length;
  return { value: Math.round(mean * 10) / 10, samples: samples.length, ready: true };
}

/** A 28-day trend, for the progress markers that are only readable long-term. */
export function trend(
  history: { date: ISODate; value: number | undefined }[],
  days = BASELINE_WINDOW_DAYS,
): { date: ISODate; value: number }[] {
  return history
    .filter((h) => h.value != null)
    .slice(0, days)
    .map((h) => ({ date: h.date, value: h.value! }))
    .reverse();
}
