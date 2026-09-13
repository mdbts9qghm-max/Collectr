import type { SessionKind } from './catalogue.ts';
import { CATALOGUE } from './catalogue.ts';

/**
 * Trägt dieser Tag eine zweite Einheit?
 *
 * Vorher stand die Antwort in der Zyklusvorlage: `strength: true`. Die
 * Kennzahlen durften danach nur noch entscheiden, *wie schwer* die Einheit wird —
 * ob sie überhaupt kommt, war eine Tabellenzeile. Damit konnten Vorschläge
 * entstehen, die aus Erholung und Belastung nie gefolgt wären.
 *
 * Jetzt rechnet der Tag es selbst aus. Was bleibt, nachdem Schicht und schon
 * geplantes Training abgezogen sind, ist das Budget für eine zweite Einheit:
 *
 * ```
 * Restkapazität = Erholung − Schichtlast − geplante Trainingslast
 * ```
 *
 * Die Schwelle ist kein gefitteter Wert. Die kleinste sinnvolle zweite Einheit —
 * Mobilität und Rumpf — kostet 12 Punkte. Wer die gerade so bezahlen kann, hat
 * keinen Reiz mehr übrig, sondern nur noch Müdigkeit. 20 ist diese Untergrenze
 * plus etwas Luft.
 */

/** Darunter trägt der Tag keine zweite Einheit mehr. */
export const MIN_CAPACITY = 20;

/** Puffer zwischen den beiden Einheiten eines Tages. */
export const GAP_MINUTES = 15;

export interface CapacityInput {
  recovery: number;
  /** Was die Schicht dieses Tages schon kostet. */
  shiftLoad: number;
  /** Belastung dessen, was für diesen Tag bereits geplant ist. */
  plannedLoad: number;
  /** Länge des Trainingsfensters in Minuten. 0 ohne Fenster. */
  windowMinutes: number;
  /** Minuten, die der Lauf des Tages davon belegt. */
  runMinutes: number;
  /** Ob der Lauf dieses Tages eine Schlüsseleinheit ist. */
  keySessionToday: boolean;
  /** Tage seit der letzten Krafteinheit. Null, wenn es noch keine gab. */
  daysSinceStrength: number | null;
}

export interface Capacity {
  ok: boolean;
  /** Was nach Schicht und geplantem Training übrig ist. */
  remaining: number;
  /** Minuten, die im Fenster noch frei sind. */
  freeMinutes: number;
  /** Ein Satz, der im Coach als Begründung stehen kann. */
  reason: string;
}

export function secondUnitCapacity(input: CapacityInput): Capacity {
  const remaining = input.recovery - input.shiftLoad - input.plannedLoad;
  const freeMinutes = Math.max(
    0,
    input.windowMinutes - input.runMinutes - (input.runMinutes > 0 ? GAP_MINUTES : 0),
  );
  const no = (reason: string): Capacity => ({ ok: false, remaining, freeMinutes, reason });

  if (input.windowMinutes <= 0) return no('Kein Trainingsfenster an diesem Tag.');

  /*
   * Ein Schlüsseltag wird nie gedoppelt. Bahn und Longrun sind der Reiz des
   * Zyklus; alles, was daneben liegt, geht von ihrer Qualität ab — und die
   * Qualität ist der Grund, warum sie überhaupt geplant werden.
   */
  if (input.keySessionToday) {
    return no('Schlüsseleinheit heute — der Tag gehört ihr allein.');
  }

  if (input.daysSinceStrength != null && input.daysSinceStrength < 1) {
    return no('Gestern schon Kraft — dazwischen gehört ein Tag.');
  }

  const shortest = CATALOGUE.kraft_leicht.minMinutes;
  if (freeMinutes < shortest) {
    return no(`Nur ${freeMinutes} Minuten im Fenster frei, die kürzeste Einheit braucht ${shortest}.`);
  }

  if (remaining < MIN_CAPACITY) {
    return no(
      `Erholung ${input.recovery} minus Schicht ${input.shiftLoad} minus geplantes Training ${input.plannedLoad} lässt ${remaining} übrig — unter ${MIN_CAPACITY} trägt der Tag keine zweite Einheit.`,
    );
  }

  return {
    ok: true,
    remaining,
    freeMinutes,
    reason: `Erholung ${input.recovery} minus Schicht ${input.shiftLoad} minus geplantes Training ${input.plannedLoad} lässt ${remaining} übrig — das trägt eine zweite Einheit.`,
  };
}

/** Die Einheitenarten, die als zweite Einheit eines Tages in Frage kommen. */
export function isSecondUnitKind(kind: SessionKind): boolean {
  return CATALOGUE[kind].discipline === 'kraft';
}
