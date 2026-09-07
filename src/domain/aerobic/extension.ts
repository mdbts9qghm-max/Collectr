import type { Slot } from './template.ts';
import type { PhaseKey } from './phases.ts';

/**
 * The optional volume extension.
 *
 * The athlete looks at endurance athletes training 25 to 30 hours a week. That
 * order of magnitude is **not reachable with four training windows per cycle**,
 * and the app says so once, plainly, and then never nags about it again.
 *
 * The only real lever is the number of sessions, not their hardness. So from
 * phase P2 the app offers extra windows the athlete has to switch on
 * deliberately — and every one of them is zone 1 or 2. Extra volume is never
 * created through intensity, because intensity is not what is missing.
 */

export const EXTENSION_FROM_PHASE: PhaseKey = 'P2';
/** Clean macrocycles required in a row before the extension can be switched on. */
export const EXTENSION_CLEAN_MACROCYCLES = 3;
/** The extension may add at most this much aerobic volume per macrocycle. */
export const EXTENSION_MAX_GROWTH = 0.15;
/** Second sessions need at least this recovery value. */
export const EXTENSION_MIN_RECOVERY = 75;
/** The short sleep-day session needs at least this much day sleep. */
export const EXTENSION_MIN_DAY_SLEEP_HOURS = 5.5;

export const HEADLINE =
  'Mit vier Trainingsfenstern pro Zyklus sind 25 bis 30 Wochenstunden nicht erreichbar. ' +
  'Der einzige echte Hebel ist die Zahl der Einheiten, nicht ihre Härte — dafür gibt es ab ' +
  'Phase P2 die Volumenerweiterung.';

export interface ExtensionAvailability {
  available: boolean;
  reason: string;
}

export function extensionAvailable(
  phase: PhaseKey,
  /** Macrocycles, most recent first, and whether each ran without a downgrade. */
  cleanHistory: boolean[],
): ExtensionAvailability {
  if (phase === 'P0' || phase === 'P1') {
    return { available: false, reason: 'Erst ab Phase P2 freischaltbar.' };
  }
  const recent = cleanHistory.slice(0, EXTENSION_CLEAN_MACROCYCLES);
  if (recent.length < EXTENSION_CLEAN_MACROCYCLES || !recent.every(Boolean)) {
    return {
      available: false,
      reason: `Drei Makrozyklen ohne Abstufung nötig — bisher ${recent.filter(Boolean).length}.`,
    };
  }
  return { available: true, reason: 'Freigeschaltet: drei Makrozyklen in Folge ohne Abstufung.' };
}

export interface ExtensionSettings {
  /** Second session on the two free days. */
  secondOnFreeDays: boolean;
  /** Short zone-1 ride on the sleep day, on top of the strength session. */
  shortOnSleepDay: boolean;
  /** A run before a V-Schicht starts, on top of the one during the shift. */
  earlyRunBeforeVShift: boolean;
}

export const NO_EXTENSION: ExtensionSettings = {
  secondOnFreeDays: false,
  shortOnSleepDay: false,
  earlyRunBeforeVShift: false,
};

export const anyEnabled = (s: ExtensionSettings) =>
  s.secondOnFreeDays || s.shortOnSleepDay || s.earlyRunBeforeVShift;

/**
 * The extra slots, all of them in zone 1 or 2.
 *
 * The day-shift day is not among them and never will be — that stays free with
 * the extension on, exactly as it is with it off.
 */
export function extensionSlots(settings: ExtensionSettings): Slot[] {
  const out: Slot[] = [];

  if (settings.secondOnFreeDays) {
    for (const cycleDay of [4, 5] as const) {
      out.push({
        cycleDay,
        kind: 'easy_z2',
        mode: 'bike',
        id: `ext_second_${cycleDay}`,
        weight: 1,
        minShare: 0.03,
        maxShare: 0.07,
        floorMinutes: 30,
        reason:
          'Zweite Einheit des Erweiterungspakets — Zone 1 bis 2, mindestens 6 h nach der ersten, ' +
          `nur ab Erholungswert ${EXTENSION_MIN_RECOVERY}`,
      });
    }
  }

  if (settings.shortOnSleepDay) {
    out.push({
      cycleDay: 3,
      kind: 'recovery_z1',
      mode: 'bike',
      id: 'ext_sleepday',
      weight: 1,
      minShare: 0.02,
      maxShare: 0.05,
      floorMinutes: 20,
      reason:
        'Kurzeinheit am Schlaftag zusätzlich zur Kraft — Zone 1, nur wenn der Tagschlaf ' +
        `mindestens ${EXTENSION_MIN_DAY_SLEEP_HOURS} h betrug`,
    });
  }

  return out;
}

/**
 * With the extension on, the deload every fourth cycle stops being negotiable.
 *
 * More sessions means less room between them for the adaptation to land, and the
 * deload is what buys that room back. Postponing it is exactly the decision that
 * turns an extension into an overreach.
 */
export const DELOAD_MANDATORY_WITH_EXTENSION = true;
