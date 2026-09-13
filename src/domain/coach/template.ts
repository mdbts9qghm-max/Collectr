import type { SessionKind } from './catalogue.ts';
import type { CycleDayNumber } from '../rotation/types.ts';

/**
 * Die Rollenverteilung im Fünftagerhythmus.
 *
 * Der Dienstplan ist **T · N · Ü · DF · DF**, siebenmal — 35 Tage, danach fällt
 * dasselbe Muster wieder auf denselben Wochentag. Geplant wird auf den fünf
 * Tagen; die 35 sind eine Kalenderaussage.
 *
 * Hier steht **keine Einheit**, sondern eine **Rolle**. Welche Einheit daraus
 * wird und wie lang sie ist, entscheidet das Volumen; ob sie stattfindet,
 * entscheiden die Regeln und die Erholung. Getrennt, weil sonst drei Dinge an
 * einer Stelle hängen und keins davon einzeln prüfbar ist.
 *
 * Warum die Rollen so und nicht anders liegen:
 *
 * **T — kein Training.** Harte Regel. Zwölf Stunden Dienst ab 06:45, dazu die
 * Wege. Das ist zugleich der Tag mit Belastung null, den die Woche braucht.
 *
 * **N — lockerer Lauf am Vormittag.** Aufstehen um 08:00, Vorschlaf ab 15:00,
 * Dienstbeginn 18:45. Das Fenster ist 09:00–13:30. Locker, weil danach zwölf
 * Stunden Wachzeit folgen und der Vormittag ohnehin ein zirkadianes Leistungs-
 * tief ist. Eine harte Einheit hier kostet den Vorschlaf, und der Vorschlaf ist
 * die wirksamste Einzelmaßnahme gegen Nachtschichtmüdigkeit.
 *
 * **Ü — Kraft oder locker, nie Intensität.** Sechs Stunden Tagschlaf, REM-arm,
 * nach 24 Stunden wach. Bewegung am späten Nachmittag ist hier funktional
 * erwünscht: sie baut Schlafdruck auf und bringt den Rhythmus zurück. Aber der
 * Tag trägt keinen harten Reiz, und die Vorgabe verbietet ihn ausdrücklich.
 *
 * **DF1 — die Schlüsseleinheit.** Der einzige Tag mit voller Nacht davor und
 * voller Nacht danach. Hier liegt die harte Einheit oder der lange Lauf.
 *
 * Schwere Beinlast darf auf Ü und DF2 liegen — aber die Regel „nicht in den
 * 24 Stunden vor einem langen Lauf" sticht das: fällt der lange Lauf auf DF1,
 * bleibt Ü ohne Beine. Das entscheidet die Regel, nicht diese Tabelle, weil es
 * vom Inhalt des nächsten Tages abhängt und nicht von der Rolle.
 *
 * **DF2 — Grundlage, und Kraft, wenn der Tag sie trägt.** Aufstehen 08:00, aber
 * um 22:00 ins Bett für die Tagschicht. Kürzeres Fenster, kein harter Reiz am
 * Abend vor einer kurzen Nacht vor zwölf Stunden Dienst.
 *
 * Die Schlüsseleinheit wechselt zwischen Bahn und langem Lauf, von Rhythmus zu
 * Rhythmus. Damit liegen beide bei je einem Vorkommen in zehn Tagen, und die
 * rollende Woche sieht nie zwei davon.
 */

export type Role = 'ruhe' | 'locker' | 'grundlage' | 'schluessel';

export interface Slot {
  cycleDay: CycleDayNumber;
  role: Role;
  /** Darf hier Kraft dazukommen, wenn Budget und Regeln es hergeben? */
  strengthAllowed: boolean;
  /** Darf hier schwere Beinlast liegen? */
  heavyLegsAllowed: boolean;
  why: string;
}

export const TEMPLATE: Record<CycleDayNumber, Slot> = {
  1: {
    cycleDay: 1,
    role: 'ruhe',
    strengthAllowed: false,
    heavyLegsAllowed: false,
    why: 'Tagschicht 06:45–19:00 — kein Fenster, und der Tag ohne Belastung, den die Woche braucht.',
  },
  2: {
    cycleDay: 2,
    role: 'locker',
    strengthAllowed: true,
    heavyLegsAllowed: false,
    why: 'Vormittagsfenster vor dem Vorschlaf. Locker, weil danach zwölf Stunden Dienst folgen.',
  },
  3: {
    cycleDay: 3,
    role: 'locker',
    strengthAllowed: true,
    heavyLegsAllowed: true,
    why: 'Nach sechs Stunden Tagschlaf. Bewegung baut Schlafdruck auf — aber keine Intensität.',
  },
  4: {
    cycleDay: 4,
    role: 'schluessel',
    strengthAllowed: false,
    heavyLegsAllowed: false,
    why: 'Volle Nacht davor, volle Nacht danach. Der einzige Tag, der eine harte Einheit trägt.',
  },
  5: {
    cycleDay: 5,
    role: 'grundlage',
    strengthAllowed: true,
    heavyLegsAllowed: true,
    why: 'Grundlage am Tag vor der Tagschicht. Kein harter Reiz vor einer kurzen Nacht.',
  },
};

/** Die Schlüsseleinheit wechselt: Bahn, langer Lauf, Bahn, langer Lauf. */
export function keyKindFor(rhythmIndex: number): 'intervall' | 'longrun' {
  return rhythmIndex % 2 === 0 ? 'intervall' : 'longrun';
}

/** Die Einheit, die zu einer Rolle gehört, bevor irgendetwas abgestuft wird. */
export function kindForRole(role: Role, key: 'intervall' | 'longrun'): SessionKind {
  switch (role) {
    case 'ruhe':
      return 'ruhe';
    case 'locker':
      return 'lockerer_lauf';
    case 'grundlage':
      return 'grundlagenlauf';
    case 'schluessel':
      return key;
  }
}
