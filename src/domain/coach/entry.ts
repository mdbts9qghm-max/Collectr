/**
 * Wo ein Plan anfängt, wenn es noch nichts zu messen gibt.
 *
 * Die App hat diesen Wert einmal als Zahl erfragt — „Laufminuten der letzten
 * zehn Tage". Das ist die falsche Frage: sie verlangt eine Buchhaltung, die
 * niemand führt, der noch nicht strukturiert trainiert. Wer sie beantworten
 * könnte, bräuchte sie nicht.
 *
 * Gefragt wird deshalb, was man über sich weiß: wie lange man am Stück laufen
 * kann und wie oft man es tut. Daraus rechnet der Plan die Minuten selbst.
 *
 * **Warum die Zahlen so niedrig aussehen.** Der begrenzende Faktor beim
 * Laufeinstieg ist nicht das Herz-Kreislauf-System, sondern Knochen, Sehnen und
 * Faszien. Die kardiale Anpassung kommt in Wochen, die des Stützgewebes in
 * Monaten — Knochenumbau läuft über Zyklen von drei bis vier Monaten. Genau
 * deshalb häufen sich Stressreaktionen an Schienbein und Mittelfuß in den
 * ersten acht bis zwölf Wochen eines Laufprogramms, und zwar bei Leuten, deren
 * Puls längst mehr hergäbe. Die Lunge ist nie der Grund, warum jemand aufhören
 * muss.
 *
 * Ein Einstieg, der sich zu leicht anfühlt, ist deshalb kein Fehler, sondern
 * die Bedingung dafür, dass in sechs Monaten noch gelaufen wird. Die
 * 8-%-Grenze je zehn Tage bringt einen von 130 Minuten in einem halben Jahr auf
 * über 500 — ohne dass eine einzige Woche einen Sprung macht.
 */

export interface EntryLevel {
  id: 'wieder' | 'anfang' | 'regelmaessig' | 'fortgeschritten';
  label: string;
  /** Was man über sich weiß — die Frage, die man beantworten kann. */
  description: string;
  /** Läufe die Woche, die dieser Einstufung zugrunde liegen. */
  runsPerWeek: number;
  /** Minuten je Lauf. */
  minutesPerRun: number;
  /** Laufminuten je zehn Tage. Daraus rechnet der Plan weiter. */
  minutesPerTenDays: number;
}

function level(
  id: EntryLevel['id'],
  label: string,
  description: string,
  runsPerWeek: number,
  minutesPerRun: number,
): EntryLevel {
  return {
    id,
    label,
    description,
    runsPerWeek,
    minutesPerRun,
    // Zehn Tage sind zehn Siebtel einer Woche. Auf fünf Minuten gerundet, weil
    // eine Zahl wie 128,57 eine Genauigkeit vortäuscht, die es nicht gibt.
    minutesPerTenDays: Math.round((runsPerWeek * minutesPerRun * 10) / 7 / 5) * 5,
  };
}

export const ENTRY_LEVELS: EntryLevel[] = [
  level(
    'wieder',
    'Wiedereinstieg',
    'Ich laufe gerade kaum oder komme nach einer Pause zurück. 20 Minuten am Stück gehen, mehr ist unsicher.',
    2,
    20,
  ),
  level(
    'anfang',
    'Anfänger mit Grundlage',
    'Ich bin kein Anfänger bei null: 30 Minuten am Stück laufe ich locker durch, aber unregelmäßig und ohne Plan.',
    3,
    30,
  ),
  level(
    'regelmaessig',
    'Regelmäßig',
    'Ich laufe seit Monaten drei- bis viermal die Woche, 40 bis 50 Minuten, ohne dass es mich umwirft.',
    3,
    45,
  ),
  level(
    'fortgeschritten',
    'Fortgeschritten',
    'Vier Läufe die Woche sind Routine, ein langer Lauf über eine Stunde gehört dazu.',
    4,
    50,
  ),
];

export function entryLevel(id: EntryLevel['id']): EntryLevel {
  return ENTRY_LEVELS.find((l) => l.id === id) ?? ENTRY_LEVELS[1];
}

/**
 * Die Einstufung, die gilt, solange keine gewählt wurde.
 *
 * „Anfänger mit Grundlage" ist bewusst die Vorauswahl und nicht der
 * Wiedereinstieg: zu niedrig einzusteigen kostet ein paar Wochen, zu hoch
 * kostet eine Verletzung. Aber wer gar nichts einstellt, hat meistens eine
 * Grundlage — sonst hätte er keinen Trainingsplan geöffnet.
 */
export const DEFAULT_ENTRY_LEVEL: EntryLevel['id'] = 'anfang';
