import type { CycleDayNumber } from './rotation/types.ts';

const h = (hours: number, minutes = 0) => hours * 60 + minutes;

/**
 * Schlaf- und Trainingsfenster je Tag des Schichtrhythmus.
 *
 * Der Rhythmus ist **T · N · Ü · DF · DF**, siebenmal hintereinander — 35 Tage,
 * danach fällt dasselbe Muster wieder auf denselben Wochentag. Für die Planung
 * zählen die fünf Tage; die 35 sind eine Kalenderaussage, keine Trainingsaussage.
 *
 * Die Zeiten stehen so, wie der Athlet sie angegeben hat, und nicht so, wie ein
 * Lehrbuch sie hätte. Dienstbeginn ist jeweils 15 Minuten vor Schichtbeginn.
 *
 * **T (Tagschicht, 06:45–19:00).** Auf 05:30 raus, 23:30 ins Bett. Zwölf Stunden
 * Dienst plus Wege: kein Trainingsfenster. Das ist eine harte Regel, keine
 * Abwägung.
 *
 * **N (Nachtschicht, 18:45–07:00).** Aufstehen wie im Frei um 08:00, Vorschlaf
 * 15:00–17:30. Training liegt am Vormittag und endet um 13:30 — anderthalb
 * Stunden Abstand zum Vorschlaf, sonst schläft er nicht ein, und der Vorschlaf
 * ist die wirksamste Einzelmaßnahme gegen Nachtschichtmüdigkeit.
 *
 * **Ü (Übergang, der Tag nach der Nachtschicht).** Schlaf 08:00–14:00, sechs
 * Stunden Tagschlaf, REM-arm nach 24 Stunden Wachzeit. Training am späten
 * Nachmittag ist hier funktional erwünscht: es baut Schlafdruck auf und bringt
 * den Rhythmus zurück. Aber **keine Intensität** — das ist die Regel des
 * Athleten, und sie deckt sich mit dem, was sechs Stunden fragmentierter
 * Tagschlaf tragen.
 *
 * **DF1.** Der einzige Tag mit voller Nacht davor und voller Nacht danach
 * (08:00–23:30). Hier liegt die Schlüsseleinheit.
 *
 * **DF2.** Aufstehen 08:00, aber um 22:00 ins Bett für die Tagschicht am
 * nächsten Morgen. Das Fenster endet deshalb früher: eine harte Einheit am
 * Abend vor einer 7,5-Stunden-Nacht vor zwölf Stunden Dienst ist der falsche
 * Ort dafür.
 */

export interface DayWindows {
  sleepStart: number;
  sleepEnd: number;
  sleepTargetMinutes: number;
  nap: { start: number; end: number } | null;
  /** Wann der nächste Schlaf dieses Tages beginnt. Der Vorschlaf zählt. */
  nextSleepStart: number;
  trainingWindow: { start: number; end: number } | null;
}

export function windowsFor(cycleDay: CycleDayNumber, dayShiftWakeMinutes: number): DayWindows {
  switch (cycleDay) {
    // T — Tagschicht 06:45–19:00. Kein Training.
    case 1:
      return {
        sleepStart: h(22),
        sleepEnd: dayShiftWakeMinutes,
        sleepTargetMinutes: h(7, 30),
        nap: null,
        nextSleepStart: h(23, 30),
        trainingWindow: null,
      };
    // N — Nachtschicht 18:45–07:00. Training am Vormittag, vor dem Vorschlaf.
    case 2:
      return {
        sleepStart: h(23, 30),
        sleepEnd: h(8),
        sleepTargetMinutes: h(8, 30) + h(2, 30),
        nap: { start: h(15), end: h(17, 30) },
        nextSleepStart: h(15),
        trainingWindow: { start: h(9), end: h(13, 30) },
      };
    // Ü — der Tag nach der Nachtschicht. Tagschlaf 08:00–14:00, Bett um 00:00.
    case 3:
      return {
        sleepStart: h(8),
        sleepEnd: h(14),
        sleepTargetMinutes: h(6),
        nap: null,
        nextSleepStart: h(24),
        trainingWindow: { start: h(15, 30), end: h(21) },
      };
    // DF1 — volle Nacht davor und danach. Der Tag für die Schlüsseleinheit.
    case 4:
      return {
        sleepStart: h(24),
        sleepEnd: h(8),
        sleepTargetMinutes: h(8),
        nap: null,
        nextSleepStart: h(23, 30),
        trainingWindow: { start: h(9), end: h(19) },
      };
    // DF2 — um 22:00 ins Bett für die Tagschicht. Fenster endet früher.
    case 5:
      return {
        sleepStart: h(23, 30),
        sleepEnd: h(8),
        sleepTargetMinutes: h(8, 30),
        nap: null,
        nextSleepStart: h(22),
        trainingWindow: { start: h(9), end: h(17) },
      };
  }
}

/**
 * Die V-Schicht steht nicht im 35-Tage-Rhythmus. Sie kommt unregelmäßig dazu,
 * läuft 08:00–20:00, und das Laufen passiert im Dienst.
 */
export function vShiftWindows(): DayWindows {
  return {
    sleepStart: h(22, 15),
    sleepEnd: h(6, 15),
    sleepTargetMinutes: h(8),
    nap: null,
    nextSleepStart: h(21, 45),
    trainingWindow: { start: h(12), end: h(13) },
  };
}

export const CYCLE_DAY_META: Record<number, { short: string; label: string; shift: string }> = {
  1: { short: 'T', label: 'Tagschicht', shift: '06:45–19:00' },
  2: { short: 'N', label: 'Nachtschicht', shift: '18:45–07:00' },
  3: { short: 'Ü', label: 'Übergang', shift: 'frei nach der Nacht' },
  4: { short: 'DF', label: 'Dienstfrei 1', shift: 'frei' },
  5: { short: 'DF', label: 'Dienstfrei 2', shift: 'frei' },
};

export function formatClock(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}
