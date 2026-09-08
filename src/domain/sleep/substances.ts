/**
 * What the app may and may not say about substances.
 *
 * The line is drawn once, here, and every screen reads it from this file rather
 * than deciding for itself. Caffeine is the single exception: it is an everyday
 * item and its timing is directly relevant to the plan, so the app schedules it.
 * For everything else it may explain the mechanism and must point at a pharmacy
 * or a doctor — no dose, no product, no intake plan.
 */

export interface SubstanceInfo {
  key: string;
  name: string;
  /** How it works. Allowed. */
  mechanism: string;
  /** Why the app stops here. Shown with the referral. */
  boundary: string;
}

export const MELATONIN: SubstanceInfo = {
  key: 'melatonin',
  name: 'Melatonin',
  mechanism:
    'Melatonin wirkt in niedriger Dosierung chronobiologisch: es verschiebt die innere Uhr. ' +
    'Es ist kein Schlafmittel — es macht nicht müde, sondern signalisiert dem Körper, wann Nacht ist. ' +
    'Deshalb ist der Einnahmezeitpunkt entscheidender als die Menge.',
  boundary:
    'Zu Dosierung und Einnahmeplan sagt diese App nichts. Ob Melatonin rezeptfrei oder ' +
    'rezeptpflichtig ist, hängt von Dosierung und Land ab.',
};

export const REFERRAL = 'Frag in der Apotheke oder bei deinem Hausarzt nach.';

/** Every substance except caffeine is answered the same way. */
export function substanceAnswer(info: SubstanceInfo): {
  mechanism: string;
  boundary: string;
  referral: string;
} {
  return { mechanism: info.mechanism, boundary: info.boundary, referral: REFERRAL };
}

export const SUBSTANCES: SubstanceInfo[] = [MELATONIN];

/**
 * The one sentence that has to sit somewhere visible on the screen.
 *
 * Not buried in a settings page: a module that gives behavioural advice about
 * sleep has to say plainly that it is not a diagnosis, where the reader is
 * actually reading.
 */
export const DISCLAIMER =
  'Verhaltensempfehlungen auf Basis schlafmedizinischer Standardliteratur. Keine Diagnose, ' +
  'kein Ersatz für ärztliche Beratung.';
