import type { ISODate } from '../types.ts';
import type { SessionKind } from './catalogue.ts';
import type { ZoneNumber } from './zones.ts';
import { CATALOGUE, HARD_LOAD } from './catalogue.ts';
import { isBaseZone } from './zones.ts';

/**
 * Der Tag, wie der Coach ihn sieht.
 *
 * Vergangene, heutige und künftige Tage haben dieselbe Form. Das ist Absicht:
 * jede Regel prüft dieselbe Struktur, egal in welche Richtung sie schaut. Der
 * Unterschied liegt allein in `done` — ob der Tag stattgefunden hat oder noch
 * geplant ist.
 */

export type CycleDayNumber = 1 | 2 | 3 | 4 | 5;

export interface PlannedItem {
  kind: SessionKind;
  minutes: number;
  zone: ZoneNumber | null;
  load: number;
  /** Startzeit in Minuten seit Mitternacht. Null, solange sie offen ist. */
  startMinutes: number | null;
  /** Reine Belastungsminuten oberhalb der Grundlagenzonen. */
  hardMinutes: number;
}

export interface CoachDay {
  date: ISODate;
  cycleDay: CycleDayNumber | null;
  isVShift: boolean;
  outOfRotation: 'vacation' | 'sick' | 'unknown' | null;
  /** Trainingsfenster des Tages in Minuten seit Mitternacht. */
  window: { start: number; end: number } | null;
  /** Beginn der nächsten Schlafphase. Der Vorschlaf zählt. */
  nextSleepStart: number;
  recovery: number;
  /** Der Lauf des Tages. Höchstens einer. */
  run: PlannedItem | null;
  /** Die Krafteinheit des Tages. */
  strength: PlannedItem | null;
  /** Wahr, sobald der Tag stattgefunden hat und erfasst ist. */
  done: boolean;
  /** Wahr, wenn die Einheit dieses Tages abgestuft wurde. */
  downgraded: boolean;
  /** Wahr, wenn für einen erledigten Tag tatsächlich etwas erfasst ist. */
  hasRecord: boolean;
  /** Wahr, wenn der Tag in einem Deload-Zyklus liegt. */
  isDeloadDay: boolean;
}

export interface Timeline {
  anchor: ISODate;
  days: CoachDay[];
}

export function dayOn(t: Timeline, date: ISODate): CoachDay | null {
  return t.days.find((d) => d.date === date) ?? null;
}

export function itemsOf(day: CoachDay): PlannedItem[] {
  const out: PlannedItem[] = [];
  if (day.run) out.push(day.run);
  if (day.strength) out.push(day.strength);
  return out;
}

export function loadOf(day: CoachDay): number {
  return itemsOf(day).reduce((sum, i) => sum + i.load, 0);
}

export function isHardDay(day: CoachDay): boolean {
  return !!day.run && day.run.load >= HARD_LOAD;
}

export function hasHeavyLegs(day: CoachDay): boolean {
  return !!day.strength && CATALOGUE[day.strength.kind].legHeavy;
}

export function runMinutesIn(days: CoachDay[]): number {
  return days.reduce((sum, d) => sum + (d.run?.minutes ?? 0), 0);
}

/** Laufminuten in den Grundlagenzonen — Aufwärmen und Auslaufen zählen mit. */
export function baseMinutesIn(days: CoachDay[]): number {
  return days.reduce((sum, d) => {
    if (!d.run) return sum;
    // Eine Intervalleinheit ist nicht eine einzige Zone: der harte Teil sind die
    // Belastungsminuten, der Rest ist Ein- und Auslaufen und damit Grundlage.
    if (d.run.hardMinutes > 0) return sum + Math.max(0, d.run.minutes - d.run.hardMinutes);
    return sum + (d.run.zone != null && isBaseZone(d.run.zone) ? d.run.minutes : 0);
  }, 0);
}

/**
 * Ob ein Zehn-Tage-Fenster überhaupt messbar ist.
 *
 * Ein vergangener Trainingstag ohne Eintrag macht jede Summe über das Fenster
 * falsch. Der Coach sagt dann lieber nichts, als etwas Falsches: die Regel
 * schweigt, statt eine Verletzung zu melden, die nur eine Datenlücke ist. Der
 * Tagschichttag ist davon ausgenommen — an ihm wird nie trainiert, sein leerer
 * Eintrag ist die Wahrheit.
 */
export function windowMeasurable(days: CoachDay[]): boolean {
  return !days.some((d) => d.done && !d.hasRecord && d.cycleDay !== 1);
}

/** Die Tage eines Fensters um einen Anker, beide Enden eingeschlossen. */
export function windowDays(t: Timeline, from: ISODate, to: ISODate): CoachDay[] {
  return t.days.filter((d) => d.date >= from && d.date <= to);
}
