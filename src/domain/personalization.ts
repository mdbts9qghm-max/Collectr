import type { ISODate, SportKey, TrainingSession } from './types.ts';
import { addDays, weekday } from './date.ts';
import { effectiveDuration } from './load.ts';

/**
 * Learned preferences.
 *
 * The engine does not just apply theory — it observes what actually gets done.
 * A plan the athlete reliably skips is worse than a smaller plan they finish,
 * so completion rates nudge the recommendation toward sports and weekdays that
 * have historically worked.
 *
 * Everything here degrades gracefully: with no history all factors are neutral.
 */
export interface Preferences {
  /** 0–1 completion rate per sport; null when there is no evidence yet. */
  sportCompletion: Partial<Record<SportKey, number>>;
  /** 0–1 completion rate per weekday index (0 = Sunday). */
  weekdayCompletion: (number | null)[];
  /** Total completed sessions per sport, used as a tie-breaker. */
  sportVolume: Partial<Record<SportKey, number>>;
  /** Weekday indexes where the athlete trains most often. */
  favouriteWeekdays: number[];
  /** How many planned/completed sessions this is based on. */
  sampleSize: number;
}

const MIN_SAMPLES = 4;

export function learnPreferences(sessions: TrainingSession[], upTo: ISODate, lookbackDays = 120): Preferences {
  const from = addDays(upTo, -lookbackDays);
  const relevant = sessions.filter((s) => s.date >= from && s.date <= upTo);

  const sportSeen: Partial<Record<SportKey, number>> = {};
  const sportDone: Partial<Record<SportKey, number>> = {};
  const sportVolume: Partial<Record<SportKey, number>> = {};
  const weekdaySeen = new Array(7).fill(0) as number[];
  const weekdayDone = new Array(7).fill(0) as number[];
  const weekdayMinutes = new Array(7).fill(0) as number[];

  for (const s of relevant) {
    // Only sessions that reached a terminal state carry information.
    if (s.status !== 'completed' && s.status !== 'skipped') continue;
    const dow = weekday(s.date);
    sportSeen[s.sport] = (sportSeen[s.sport] ?? 0) + 1;
    weekdaySeen[dow] += 1;
    if (s.status === 'completed') {
      sportDone[s.sport] = (sportDone[s.sport] ?? 0) + 1;
      sportVolume[s.sport] = (sportVolume[s.sport] ?? 0) + effectiveDuration(s);
      weekdayDone[dow] += 1;
      weekdayMinutes[dow] += effectiveDuration(s);
    }
  }

  const sportCompletion: Partial<Record<SportKey, number>> = {};
  for (const key of Object.keys(sportSeen) as SportKey[]) {
    const seen = sportSeen[key] ?? 0;
    if (seen >= MIN_SAMPLES) sportCompletion[key] = (sportDone[key] ?? 0) / seen;
  }

  const weekdayCompletion = weekdaySeen.map((seen, i) =>
    seen >= MIN_SAMPLES ? weekdayDone[i] / seen : null,
  );

  const favouriteWeekdays = weekdayMinutes
    .map((m, i) => ({ i, m }))
    .filter((x) => x.m > 0)
    .sort((a, b) => b.m - a.m)
    .slice(0, 3)
    .map((x) => x.i);

  return {
    sportCompletion,
    weekdayCompletion,
    sportVolume,
    favouriteWeekdays,
    sampleSize: relevant.filter((s) => s.status !== 'planned').length,
  };
}

/**
 * Score modifier in the range roughly −6 … +6 based on how reliably the athlete
 * completes this sport on this weekday. Deliberately small: preferences should
 * tilt a close call, never override recovery or load rules.
 */
export function preferenceBonus(prefs: Preferences, sport: SportKey, date: ISODate): number {
  let bonus = 0;
  const sportRate = prefs.sportCompletion[sport];
  if (sportRate != null) bonus += (sportRate - 0.7) * 14;
  const dayRate = prefs.weekdayCompletion[weekday(date)];
  if (dayRate != null) bonus += (dayRate - 0.7) * 8;
  return Math.max(-6, Math.min(6, bonus));
}
