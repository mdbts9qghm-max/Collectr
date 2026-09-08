import type { ISODate } from '../types.ts';

/**
 * Sleep debt, and how it reaches the training plan.
 *
 * **The behavioural recommendations in this module never downgrade training
 * themselves.** They produce signals; the aerobic planner consumes them and
 * decides. One place decides about downgrades, and it is not this one — two
 * places deciding is how a plan starts contradicting itself.
 */

export const DEBT_WARNING_HOURS = 5;
export const DEBT_DELOAD_HOURS = 8;
/** Day sleep below this triggers its own penalty and blocks the next hard day. */
export const SHORT_DAY_SLEEP_HOURS = 5;

export interface SleepNight {
  date: ISODate;
  /** Target for that cycle day, in hours. */
  targetHours: number;
  actualHours: number | null;
  cycleDay: number | null;
  napTaken?: boolean;
  napExpected: boolean;
}

export interface SleepSignals {
  /** Accumulated shortfall across the macrocycle, in hours. */
  debtHours: number;
  /** Nights that contributed, for the explanation. */
  contributing: { date: ISODate; shortfall: number }[];
  /** Recovery penalty this module contributes for the given date. */
  recoveryPenalty: number;
  penaltyReasons: { label: string; delta: number }[];
  /** True when the next hard session should be downgraded. */
  downgradeNextHard: boolean;
  /** True when a deload is due regardless of where the cycle rhythm stands. */
  forceDeload: boolean;
  /** Days after which no hard session may be planned. */
  blockHardAfter: ISODate[];
  warnings: string[];
}

export function sleepSignals(nights: SleepNight[], forDate: ISODate): SleepSignals {
  const contributing: { date: ISODate; shortfall: number }[] = [];
  let debt = 0;

  for (const night of nights) {
    if (night.actualHours == null) continue;
    const shortfall = night.targetHours - night.actualHours;
    if (shortfall > 0) {
      debt += shortfall;
      contributing.push({ date: night.date, shortfall: Math.round(shortfall * 10) / 10 });
    }
  }
  debt = Math.round(debt * 10) / 10;

  const penaltyReasons: { label: string; delta: number }[] = [];
  const today = nights.find((n) => n.date === forDate);

  if (today?.napExpected && today.napTaken === false) {
    penaltyReasons.push({ label: 'Vorschlaf ausgefallen', delta: -15 });
  }

  /*
   * Short day sleep is its own signal, not just a slice of the debt total. Six
   * hours is the plan for the sleep day; under five the following day carries a
   * different kind of tiredness than a night that was merely short.
   */
  const blockHardAfter: ISODate[] = [];
  for (const night of nights) {
    if (night.cycleDay !== 3 || night.actualHours == null) continue;
    if (night.actualHours < SHORT_DAY_SLEEP_HOURS) {
      blockHardAfter.push(night.date);
      if (night.date === forDate) {
        penaltyReasons.push({
          label: `Tagschlaf nur ${night.actualHours.toFixed(1)} h`,
          delta: -15,
        });
      }
    }
  }

  const warnings: string[] = [];
  if (debt >= DEBT_DELOAD_HOURS) {
    warnings.push(
      `Schlafschuld ${debt.toFixed(1)} h im Makrozyklus — ein Deload wird ausgelöst, unabhängig vom Zyklusrhythmus.`,
    );
  } else if (debt >= DEBT_WARNING_HOURS) {
    warnings.push(
      `Schlafschuld ${debt.toFixed(1)} h im Makrozyklus — die nächste harte Einheit wird abgestuft.`,
    );
  }

  return {
    debtHours: debt,
    contributing,
    recoveryPenalty: penaltyReasons.reduce((sum, r) => sum + r.delta, 0),
    penaltyReasons,
    downgradeNextHard: debt >= DEBT_WARNING_HOURS,
    forceDeload: debt >= DEBT_DELOAD_HOURS,
    blockHardAfter,
    warnings,
  };
}

/**
 * Caffeine limits that were repeatedly missed.
 *
 * This one is deliberately toothless: a hint in the check-in and nothing more.
 * Caffeine timing is a behaviour, and automatically cutting someone's training
 * because they had a coffee too late turns a nudge into a punishment.
 */
export const CAFFEINE_HINT_THRESHOLD = 3;

export function caffeineHint(missesInMacrocycle: number): string | null {
  if (missesInMacrocycle < CAFFEINE_HINT_THRESHOLD) return null;
  return (
    `Die Koffeingrenze wurde ${missesInMacrocycle} Mal überschritten. ` +
    'Das kostet vor allem den Vorschlaf und den Tagschlaf — am Training ändert die App deswegen nichts.'
  );
}
