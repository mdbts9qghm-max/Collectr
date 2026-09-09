import type { Advice } from './types.ts';

/**
 * Was das Training des Tages für den Schlaf bedeutet.
 *
 * Die Kopplung läuft in beide Richtungen, aber nicht symmetrisch. Das
 * Schlafmodul liefert Signale an den Erholungswert und stuft **nie selbst** eine
 * Einheit ab — darüber entscheidet ein einziger Ort, und das ist der Coach.
 * Umgekehrt darf es die Einheit kennen: wann sie endet, bestimmt, wann gegessen
 * wird und wie viel Abstand bis zum Schlaf bleibt.
 *
 * Vorher wusste dieses Modul nichts vom Plan. Die Eiweiß-Empfehlung „innerhalb
 * 60 Minuten nach dem Lauf" stand fest am Nachtschichttag in einem festen
 * Zeitfenster — auch wenn dort gar nicht gelaufen wurde, und nie an den Tagen,
 * an denen tatsächlich eine Einheit lag.
 */

export interface PlannedSession {
  /** Der Name der Einheit, wie ihn auch der Coach benutzt. */
  label: string;
  discipline: 'lauf' | 'kraft';
  startMinutes: number;
  endMinutes: number;
  /** Harte Einheiten brauchen Abstand zum Schlaf. */
  isHard: boolean;
}

/** Belastung ab 60 endet mindestens 3 Stunden vor der nächsten Schlafphase. */
export const LOAD_SLEEP_GAP_MINUTES = 180;

/** Eiweiß möglichst innerhalb einer Stunde nach der Belastung. */
const PROTEIN_WINDOW_MINUTES = 60;

export function trainingAdvice(
  sessions: PlannedSession[],
  nextSleepStart: number | null,
): Advice[] {
  if (!sessions.length) return [];
  const out: Advice[] = [];

  // Die letzte Einheit des Tages bestimmt Essen und Abstand zum Schlaf.
  const last = [...sessions].sort((a, b) => a.endMinutes - b.endMinutes)[sessions.length - 1];

  out.push({
    id: 'food-post-training-protein',
    track: 'food',
    from: last.endMinutes,
    to: last.endMinutes + PROTEIN_WINDOW_MINUTES,
    label: `Eiweiß innerhalb 60 min nach ${last.discipline === 'lauf' ? 'dem Lauf' : 'der Krafteinheit'}`,
    why:
      'Vorschlaf und verschobener Nachtschlaf verkürzen die Regenerationsfenster — hier zählt das Timing mehr als sonst.',
    priority: 'normal',
  });

  if (last.isHard && nextSleepStart != null) {
    const gap = nextSleepStart - last.endMinutes;
    const hours = Math.round((gap / 60) * 10) / 10;
    out.push({
      id: 'sleep-load-gap',
      track: 'sleep',
      from: last.endMinutes,
      to: nextSleepStart,
      label:
        gap >= LOAD_SLEEP_GAP_MINUTES
          ? `${hours} h zwischen ${last.label} und dem Schlaf — passt`
          : `Nur ${hours} h zwischen ${last.label} und dem Schlaf`,
      why:
        gap >= LOAD_SLEEP_GAP_MINUTES
          ? 'Nach einer harten Einheit braucht die Körperkerntemperatur drei Stunden, um wieder zu fallen. Vorher schläft es sich schlecht ein.'
          : 'Drei Stunden braucht die Körperkerntemperatur, um nach einer harten Einheit wieder zu fallen. Weniger heißt: länger wach liegen, flacher schlafen.',
      priority: gap >= LOAD_SLEEP_GAP_MINUTES ? 'normal' : 'high',
    });
  }

  return out;
}
