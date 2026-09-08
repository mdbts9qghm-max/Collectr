import type { ISODate } from '../types.ts';

/**
 * When the app has to stop coaching and say: get this looked at.
 *
 * These are not softened. A module that spends its time on light hygiene and
 * caffeine cutoffs has an obligation to recognise the point where behaviour is
 * no longer the answer, and to say so without hedging.
 */

export interface MedicalFlag {
  id: string;
  headline: string;
  detail: string;
}

export interface MedicalInput {
  /** Sleep hours per day, most recent first. */
  sleepHours: (number | null)[];
  /** Sleep quality 1–5, most recent first. */
  sleepQuality: (number | null)[];
  /** Self-reported daytime sleepiness despite adequate sleep. */
  daytimeSleepinessDespiteSleep: boolean;
  /** Falling asleep against one's will, e.g. at the wheel or on shift. */
  involuntarySleepOnset: boolean;
  /** Breathing pauses reported by someone else. */
  observedApnea: boolean;
}

const DAYS_FOUR_WEEKS = 28;

function mean(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v != null);
  if (present.length < 7) return null;
  return present.reduce((sum, v) => sum + v, 0) / present.length;
}

export function medicalFlags(input: MedicalInput): MedicalFlag[] {
  const flags: MedicalFlag[] = [];

  if (input.observedApnea) {
    flags.push({
      id: 'apnea',
      headline: 'Beobachtete Atemaussetzer — bitte ärztlich abklären',
      detail:
        'Atemaussetzer im Schlaf sind nichts, was sich mit Schlafhygiene lösen lässt. ' +
        'Das gehört untersucht, unabhängig von der Schichtarbeit.',
    });
  }

  if (input.involuntarySleepOnset) {
    flags.push({
      id: 'involuntary',
      headline: 'Einschlafen gegen den Willen — bitte ärztlich abklären',
      detail:
        'Gegen den eigenen Willen einzuschlafen ist ein Warnsignal, das über normale ' +
        'Schichtmüdigkeit hinausgeht — und im Straßenverkehr gefährlich.',
    });
  }

  if (input.daytimeSleepinessDespiteSleep) {
    flags.push({
      id: 'sleepiness',
      headline: 'Anhaltende Tagesschläfrigkeit trotz ausreichendem Schlaf',
      detail:
        'Wenn genug Schlaf nicht mehr erholt, liegt es nicht mehr an der Menge. Das gehört abgeklärt.',
    });
  }

  const recentSleep = input.sleepHours.slice(0, DAYS_FOUR_WEEKS);
  const average = mean(recentSleep);
  if (average != null && average < 6) {
    flags.push({
      id: 'short-sleep',
      headline: `Schlaf im Schnitt ${average.toFixed(1)} h — dauerhaft unter sechs Stunden`,
      detail:
        'Unter sechs Stunden im Dauerbetrieb ist keine Frage der Gewöhnung. Das gehört besprochen, ' +
        'auch weil es die Verletzungsanfälligkeit im Training messbar erhöht.',
    });
  }

  /*
   * A declining trend matters even when the absolute numbers still look fine —
   * four weeks of slow deterioration is the pattern that gets normalised.
   */
  const firstHalf = mean(input.sleepQuality.slice(0, 14));
  const secondHalf = mean(input.sleepQuality.slice(14, DAYS_FOUR_WEEKS));
  if (firstHalf != null && secondHalf != null && firstHalf < secondHalf - 0.5) {
    flags.push({
      id: 'declining-quality',
      headline: 'Schlafqualität sinkt seit über vier Wochen',
      detail:
        'Ein langsamer Abwärtstrend fällt im Alltag nicht auf, weil jeder einzelne Tag noch erklärbar ist. ' +
        'Vier Wochen sind der Punkt, an dem es sich lohnt, das anzusprechen.',
    });
  }

  return flags;
}

export interface SleepEntry {
  date: ISODate;
  hours: number | null;
  quality: number | null;
}
