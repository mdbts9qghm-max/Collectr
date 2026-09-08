/**
 * Sleep and recovery coaching — the behavioural half of the plan.
 *
 * This module gives behavioural recommendations from standard sleep-medicine
 * literature. It makes no diagnosis and replaces no medical advice.
 *
 * **Why it exists at all.** Shift work produces a permanent misalignment between
 * the internal clock and the working day. The athlete cannot resolve that, but
 * can soften it. The three levers, in order of effect:
 *
 *   1. **Light** — by far the strongest zeitgeber, stronger than everything else
 *   2. **Sleep timing** — fixed anchor times beat high total duration
 *   3. **Caffeine timing** — the hour decides, not the amount
 *
 * Nutrition acts weakly on the rhythm but strongly on how the night shift feels.
 *
 * **For the training goal this module is not optional.** Sleep is when tendon
 * and bone adaptation happens — exactly the limiting factor in the aerobic plan.
 * Chronic sleep loss also measurably lowers the injury threshold.
 */

export type Track = 'sleep' | 'light' | 'caffeine' | 'food';

export const TRACK_META: Record<Track, { label: string; icon: string; color: string }> = {
  sleep: { label: 'Schlaf', icon: '😴', color: 'var(--sport-strength)' },
  light: { label: 'Licht', icon: '💡', color: 'var(--warn)' },
  caffeine: { label: 'Koffein', icon: '☕', color: 'var(--sport-run)' },
  food: { label: 'Essen', icon: '🍽️', color: 'var(--good)' },
};

export interface Advice {
  id: string;
  track: Track;
  /** Minutes from midnight. `to` may exceed 1440 for a window past midnight. */
  from: number;
  to: number;
  label: string;
  /**
   * One sentence, always. No instruction without a visible reason — an
   * unexplained rule is a rule that gets dropped the first time it is
   * inconvenient.
   */
  why: string;
  /**
   * High for the two measures with the largest effect: the sunglasses on the
   * way home and the pre-shift nap alarm.
   */
  priority: 'normal' | 'high';
  /** A "do not" rather than a "do" — rendered differently. */
  avoid?: boolean;
}

export type CycleDayNumber = 1 | 2 | 3 | 4 | 5;

export interface DayContext {
  cycleDay: CycleDayNumber | null;
  isVShift: boolean;
}
