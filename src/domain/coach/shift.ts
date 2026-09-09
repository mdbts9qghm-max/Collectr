import type { CycleDayNumber } from './types.ts';

/**
 * Die Schicht ist eine Belastung, nicht nur ein Fenster.
 *
 * Vorher kam der Dienst im Modell ausschließlich als Einschränkung vor: er sagte,
 * *wann* trainiert werden kann, nie *wie viel schon getragen wird*. Zwölf Stunden
 * Nachtdienst zählten null. Genau daraus entstehen Vorschläge, die niemand
 * gemacht hätte, der den Tag kennt — zwei Einheiten am Vormittag vor einer
 * Zwölf-Stunden-Nacht.
 *
 * **Diese Zahlen sind Urteil, keine Messung.** Sie liegen auf derselben Skala wie
 * die Trainingslast, damit sie sich mit ihr verrechnen lassen: ein lockerer Lauf
 * kostet rund 30, ein Longrun 75. Was ein Zwölf-Stunden-Dienst auf dieser Skala
 * wiegt, ist nicht gemessen worden und lässt sich auch nicht aus der Literatur
 * ableiten — die Größenordnung stammt aus dem Vergleich: eine Nachtschicht kostet
 * mehr Erholung als ein lockerer Lauf und weniger als ein Longrun.
 */

export interface ShiftLoad {
  load: number;
  why: string;
}

const BY_CYCLE_DAY: Record<CycleDayNumber, ShiftLoad> = {
  1: {
    load: 30,
    why: 'Zwölf Stunden Tagdienst — anstrengend, aber im Takt des Tages',
  },
  2: {
    load: 55,
    why: 'Zwölf Stunden Nachtdienst gegen den zirkadianen Rhythmus, der teuerste Tag der Rotation',
  },
  3: {
    load: 20,
    why: 'Der Dienst ist vorbei, der Preis nicht: 24 h Wachzeit und nur 6 h Tagschlaf',
  },
  4: { load: 0, why: 'Frei' },
  5: { load: 0, why: 'Frei' },
};

const V_SHIFT: ShiftLoad = {
  load: 30,
  why: 'Zwölf Stunden V-Dienst, der Lauf liegt darin',
};

const UNKNOWN: ShiftLoad = {
  load: 0,
  why: 'Keine Schicht eingetragen — die App nimmt keine an',
};

export function shiftLoadFor(cycleDay: CycleDayNumber | null, isVShift: boolean): ShiftLoad {
  if (isVShift) return V_SHIFT;
  if (cycleDay == null) return UNKNOWN;
  return BY_CYCLE_DAY[cycleDay];
}

/**
 * Warum die Schichtlast **nicht** ins Belastungsverhältnis eingeht.
 *
 * Das Verhältnis aus 7- und 28-Tage-Last ist in der Literatur ein Verhältnis von
 * *Trainingslast*. Die Rotation ist regelmäßig, also stiege mit der Schichtlast
 * der Zähler ungefähr so wie der Nenner — das Verhältnis bliebe fast gleich, aber
 * es würde unempfindlicher gegen genau die Änderung, die es messen soll. Ein
 * Trainingssprung ginge im Dienstrauschen unter.
 *
 * Und in den Erholungswert des Folgetags geht sie auch nicht ein, weil sie dort
 * schon steckt: der Grundwert des Schlaftags ist 60 „nach 24 h Wachzeit", der des
 * Tagschichttags 0. Die Schicht ein zweites Mal abzuziehen hieße, sie doppelt zu
 * zählen.
 *
 * Sie wirkt deshalb an genau einer Stelle: im Tagesbudget, das entscheidet, ob
 * ein Tag eine zweite Einheit trägt.
 */
export const SHIFT_LOAD_SCOPE =
  'Die Schichtlast wirkt im Tagesbudget. Nicht im Belastungsverhältnis, weil das ein Verhältnis von Trainingslast ist, und nicht im Erholungswert des Folgetags, weil sie dort schon im Grundwert steckt.';
