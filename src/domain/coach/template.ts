import type { SessionKind } from './catalogue.ts';
import { CATALOGUE } from './catalogue.ts';

/**
 * Die Rollenverteilung im Makrozyklus.
 *
 * Zehn Tage, zwei Zyklen der Fünf-Tage-Rotation. Die Rollen liegen fest, weil
 * die Rotation feststeht: Wer weiß, dass Tag 4 immer frei ist, kann Tag 4 immer
 * für die harte Einheit vorsehen. Ein Optimierer würde aus derselben
 * Ausgangslage jedes Mal einen anderen Plan bauen — Anpassung entsteht aber aus
 * der Wiederholung ähnlicher Reize, nicht aus der besten Einzelentscheidung.
 *
 * ```
 * Tag 1  T1  Tagschicht     Ruhe
 * Tag 2  T2  Nachtschicht   lockerer Lauf + Kraft            09:00–13:30
 * Tag 3  T3  Schlaftag      Grundlagenlauf + Kraft Oberkörper 16:00–20:00
 * Tag 4  T4  frei           Intervalle                        08:00–19:00
 * Tag 5  T5  frei           Grundlagenlauf + Kraft            08:00–19:00
 * Tag 6  T1  Tagschicht     Ruhe
 * Tag 7  T2  Nachtschicht   lockerer Lauf + Kraft            09:00–13:30
 * Tag 8  T3  Schlaftag      Grundlagenlauf + Kraft            16:00–20:00
 * Tag 9  T4  frei           Grundlagenlauf                    08:00–19:00
 * Tag 10 T5  frei           Longrun                           08:00–19:00
 * ```
 *
 * Die 48 Stunden zwischen den harten Einheiten sind darin schon enthalten:
 * Intervalle an Tag 4, Longrun an Tag 10. Jeder Zyklus hat genau einen
 * lastfreien Tag und höchstens eine Schlüsseleinheit.
 *
 * Kraft steht an Tag 3 bewusst ohne Beine — Tag 4 ist die Bahn, und schwere
 * Beinkraft liegt nie in den 24 Stunden davor. An Tag 9 steht keine Kraft, weil
 * Tag 10 der Longrun ist.
 */

export interface Slot {
  /** Tag im Makrozyklus, 0 bis 9. */
  index: number;
  cycleDay: 1 | 2 | 3 | 4 | 5;
  kind: SessionKind;
  /** Anteil am Restvolumen, nachdem Schlüsseleinheiten abgezogen sind. */
  weight: number;
  /** Ob an diesem Tag zusätzlich Kraft vorgesehen ist. */
  strength: boolean;
  role: string;
}

export const MACROCYCLE_TEMPLATE: Slot[] = [
  { index: 0, cycleDay: 1, kind: 'ruhe', weight: 0, strength: false, role: 'Ruhetag' },
  { index: 1, cycleDay: 2, kind: 'lockerer_lauf', weight: 0.8, strength: true, role: 'Lauf im Vormittagsfenster' },
  { index: 2, cycleDay: 3, kind: 'grundlagenlauf', weight: 1.2, strength: true, role: 'Grundlage am Nachmittag' },
  { index: 3, cycleDay: 4, kind: 'intervall', weight: 0, strength: false, role: 'Schlüsseleinheit: Bahn' },
  { index: 4, cycleDay: 5, kind: 'grundlagenlauf', weight: 1.2, strength: true, role: 'Grundlage' },
  { index: 5, cycleDay: 1, kind: 'ruhe', weight: 0, strength: false, role: 'Ruhetag' },
  { index: 6, cycleDay: 2, kind: 'lockerer_lauf', weight: 0.8, strength: true, role: 'Lauf im Vormittagsfenster' },
  { index: 7, cycleDay: 3, kind: 'grundlagenlauf', weight: 1.2, strength: true, role: 'Grundlage am Nachmittag' },
  { index: 8, cycleDay: 4, kind: 'grundlagenlauf', weight: 1.2, strength: false, role: 'Grundlage vor dem Longrun' },
  { index: 9, cycleDay: 5, kind: 'longrun', weight: 0, strength: false, role: 'Schlüsseleinheit: Longrun' },
];

/** Anteil des Zehn-Tage-Ziels, den der Longrun bekommt. Die Regel deckelt bei 35 %. */
export const LONGRUN_SHARE = 0.28;

export function slotFor(macroDayIndex: number): Slot {
  return MACROCYCLE_TEMPLATE[((macroDayIndex % 10) + 10) % 10];
}

export interface Distribution {
  /** Minuten je Makrozyklustag, Index 0 bis 9. */
  minutes: number[];
  /** Die Einheit je Tag — im Deload weicht sie von der Vorlage ab. */
  kinds: SessionKind[];
  /** Tatsächlich verplante Laufminuten. Im Deload unter dem Ziel, mit Absicht. */
  total: number;
  /** Die Longrun-Länge vor der Deload-Halbierung — der Bezugswert des nächsten Schritts. */
  longrunBase: number;
  /** Ob dieser Longrun gegenüber dem vorigen gewachsen ist. */
  longrunGrew: boolean;
  /** Minuten, die das Ziel verlangt, aber keine Einheit mehr aufnehmen kann. */
  unplaced: number;
  /** Minuten, die über dem Ziel liegen, weil die Mindestlängen sie erzwingen. */
  overshoot: number;
}

/** Der Deload nimmt 40 % der Laufminuten seines Zyklus. */
export const DELOAD_FACTOR = 0.6;
/** Der Longrun wächst höchstens 10 Minuten pro Schritt. */
export const LONGRUN_MAX_GROWTH = 10;

const INTERVAL_SLOT = 3;
const LONGRUN_SLOT = 9;

/**
 * Die Laufminuten des Makrozyklus auf die Tage verteilen.
 *
 * Die Schlüsseleinheiten werden zuerst bedient, weil ihre Länge aus eigenen
 * Regeln kommt: die Intervalleinheit aus der Bahnstufe, der Longrun aus seinem
 * Anteil am Zehn-Tage-Volumen. Was bleibt, geht nach Gewicht auf die
 * Grundlagenläufe — und wird an deren Mindest- und Höchstlängen gestutzt.
 *
 * `deloadCycle` ist 0 oder 1, je nachdem, welcher der beiden Zyklen im
 * Makrozyklus ein Deload ist, und null, wenn keiner es ist. Der Abzug trifft nur
 * die fünf Tage dieses Zyklus. Ein Deload über den ganzen Makrozyklus wäre der
 * doppelte Einschnitt.
 */
export function distribute(input: {
  runMinutes: number;
  /** Gesamtdauer der Intervalleinheit aus der Bahnstufe. */
  intervalMinutes: number;
  /** Obergrenze für den Longrun aus der Longrun-Regel. */
  longrunCap: number;
  deloadCycle: 0 | 1 | null;
  /** Die Longrun-Länge des vorigen Makrozyklus, vor einer Deload-Halbierung. */
  longrunPrevious?: number | null;
  /** Ob der vorige Longrun gewachsen ist — dann steht dieser auf gleicher Länge. */
  longrunGrewLast?: boolean;
  /** In P0: höchstens 10 Minuten mehr als dieselbe Einheit im Makrozyklus davor. */
  perSlotCap?: (number | null)[];
}): Distribution {
  const minutes = new Array<number>(10).fill(0);
  const kinds: SessionKind[] = MACROCYCLE_TEMPLATE.map((s) => s.kind);

  const inDeload = (index: number) =>
    input.deloadCycle != null && Math.floor(index / 5) === input.deloadCycle;

  /*
   * Keine Intensität im Deload-Zyklus. Der Bahntag fällt nicht weg — er wird ein
   * Grundlagenlauf, sonst verlöre der Zyklus einen ganzen Laufreiz.
   */
  if (inDeload(INTERVAL_SLOT)) {
    kinds[INTERVAL_SLOT] = 'grundlagenlauf';
  } else {
    minutes[INTERVAL_SLOT] = input.intervalMinutes;
  }

  /*
   * Longrun: Anteil am Zehn-Tage-Volumen, gedeckelt durch die Longrun-Regel und
   * durch den vorigen Schritt. Der Bezugswert ist die Länge *vor* einer
   * Deload-Halbierung — sonst gälte der Rücksprung nach dem Deload als
   * Steigerung um vierzig Minuten und wäre auf Jahre nicht mehr aufzuholen.
   */
  const longrunEntry = CATALOGUE.longrun;
  let base = Math.min(Math.round(input.runMinutes * LONGRUN_SHARE), input.longrunCap);
  const previous = input.longrunPrevious;
  if (previous != null) {
    base = Math.min(base, input.longrunGrewLast ? previous : previous + LONGRUN_MAX_GROWTH);
  }
  base = Math.max(longrunEntry.minMinutes, Math.min(longrunEntry.maxMinutes, base));
  const longrunGrew = previous != null && base > previous;

  if (inDeload(LONGRUN_SLOT)) {
    // Halbiert — und damit ist es kein Longrun mehr, sondern ein verkürzter.
    kinds[LONGRUN_SLOT] = 'longrun_verkuerzt';
    const short = CATALOGUE.longrun_verkuerzt;
    minutes[LONGRUN_SLOT] = Math.max(
      short.minMinutes,
      Math.min(short.maxMinutes, Math.round(base / 2)),
    );
  } else {
    minutes[LONGRUN_SLOT] = base;
  }

  const baseSlots = MACROCYCLE_TEMPLATE.filter(
    (s) => s.weight > 0 || (kinds[s.index] === 'grundlagenlauf' && s.index === INTERVAL_SLOT),
  ).map((s) => ({ index: s.index, weight: s.weight > 0 ? s.weight : 1 }));

  const boundsOf = (index: number) => {
    const entry = CATALOGUE[kinds[index]];
    const cap = input.perSlotCap?.[index];
    const scale = inDeload(index) ? DELOAD_FACTOR : 1;
    // Die Mindestlänge bleibt auch im Deload stehen. Ein Zwölf-Minuten-Lauf ist
    // keine leichtere Einheit, sondern gar keine.
    return {
      min: entry.minMinutes,
      max: Math.max(entry.minMinutes, Math.round(Math.min(entry.maxMinutes, cap ?? entry.maxMinutes) * scale)),
    };
  };

  const remaining = input.runMinutes - minutes[INTERVAL_SLOT] - minutes[LONGRUN_SLOT];
  const totalWeight = baseSlots.reduce((sum, s) => sum + s.weight, 0);

  for (const slot of baseSlots) {
    const wanted = Math.round(
      ((remaining * slot.weight) / totalWeight) * (inDeload(slot.index) ? DELOAD_FACTOR : 1),
    );
    const b = boundsOf(slot.index);
    minutes[slot.index] = Math.max(b.min, Math.min(b.max, wanted));
  }

  /*
   * Nach dem Stutzen stimmt die Summe nicht mehr. Der Rest wird auf die Tage
   * verteilt, die noch Luft haben — was dann noch fehlt oder übrig ist, wird
   * gemeldet statt stillschweigend in eine Einheit gedrückt. Der Deload-Zyklus
   * bleibt dabei außen vor: er soll ja kürzer sein.
   */
  const target = expectedTotal(input);
  let diff = target - minutes.reduce((a, b) => a + b, 0);
  for (let pass = 0; pass < 5 && diff !== 0; pass++) {
    const movable = baseSlots.filter((s) => {
      const b = boundsOf(s.index);
      return diff > 0 ? minutes[s.index] < b.max : minutes[s.index] > b.min;
    });
    if (!movable.length) break;
    const step = Math.trunc(diff / movable.length) || Math.sign(diff);
    for (const s of movable) {
      if (diff === 0) break;
      const b = boundsOf(s.index);
      const before = minutes[s.index];
      minutes[s.index] = Math.max(b.min, Math.min(b.max, before + step));
      diff -= minutes[s.index] - before;
    }
  }

  return {
    minutes,
    kinds,
    total: minutes.reduce((a, b) => a + b, 0),
    longrunBase: base,
    longrunGrew,
    unplaced: Math.max(0, diff),
    overshoot: Math.max(0, -diff),
  };
}

/** Das Ziel, nachdem der Deload seinen Zyklus gekürzt hat. */
export function expectedTotal(input: { runMinutes: number; deloadCycle: 0 | 1 | null }): number {
  if (input.deloadCycle == null) return input.runMinutes;
  // Die beiden Zyklen tragen nicht dasselbe: Zyklus A hat die Bahn, Zyklus B den
  // Longrun. Gekürzt wird die Hälfte, in der der Deload liegt.
  return Math.round(input.runMinutes * (0.5 + 0.5 * DELOAD_FACTOR));
}
