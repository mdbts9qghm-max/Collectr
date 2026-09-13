/**
 * Das Phasenmodell — als Charakter, nicht als Minutenzahl.
 *
 * Die ursprüngliche Vorgabe hatte eine Spalte „aerobe Minuten je 10 Tage"
 * (300 → 850). Die ist auf Ansage des Athleten gestrichen, und das ist die
 * sicherere Konstruktion: eine absolute Vorgabe kennt den Ausgangspunkt nicht.
 * Wer bei 120 Laufminuten steht und eine Tabelle liest, die 300 verlangt,
 * bekommt entweder eine Überlastung oder eine Zahl, die zwei Monate lang
 * unerreichbar bleibt und deshalb nichts steuert.
 *
 * Gesteuert wird stattdessen über die **Steigerung**: das Volumen wächst aus
 * dem, was tatsächlich gelaufen wurde, um höchstens 8 % je zehn Tage. Der
 * Ausgangspunkt ist gemessen, nicht gesetzt. Das ist dieselbe Regel, die der
 * Athlet ohnehin vorgegeben hat — sie ist jetzt nur die einzige, statt die
 * zweite neben einem Ziel, das ihr widerspricht.
 *
 * > Verlangt das Phasenziel mehr, gilt die Grenze. Das Ziel wird nach hinten
 * > verschoben, nicht die Grenze gedehnt.
 *
 * Ohne Ziel gibt es nichts mehr zu verschieben: es gibt nur noch die Grenze.
 *
 * Was die Phase dann noch bestimmt, ist der **Charakter** — wie die Minuten
 * verteilt werden, wie oft Intensität vorkommt, wie lang der lange Lauf werden
 * darf. Das sind Anteile, keine Beträge, und Anteile funktionieren auf jedem
 * Niveau.
 */

export type PhaseId = 'P0' | 'P1' | 'P2' | 'P3';

export interface Phase {
  id: PhaseId;
  label: string;
  span: string;
  /** Erste Woche der Phase, ab 0 gezählt. */
  fromWeek: number;
  /** Letzte Woche der Phase, ab 0 gezählt. Null in der offenen Phase. */
  toWeek: number | null;
  /**
   * Wie viele Läufe die Woche vorsieht. Der Planer füllt so viele Lauftage,
   * wie das Volumen und die Regeln hergeben — nie mehr als diese Zahl.
   */
  runsPerWeek: number;
  /** Harte Einheiten je rollender Woche. Nie mehr als eine, so die Vorgabe. */
  hardPerWeek: 0 | 1;
  /** Obergrenze des langen Laufs, als Anteil der Laufminuten von zehn Tagen. */
  longRunShare: number;
  focus: string;
}

/*
 * Wochen statt Monate, weil der Rhythmus in Tagen läuft und ein Monat keine
 * ganze Zahl von Wochen ist. Monat 3 beginnt in Woche 9, Monat 7 in Woche 27,
 * Monat 11 in Woche 44.
 */
export const PHASES: Phase[] = [
  {
    id: 'P0',
    label: 'Einstieg',
    span: 'Woche 1–8',
    fromWeek: 0,
    toWeek: 7,
    runsPerWeek: 3,
    hardPerWeek: 1,
    longRunShare: 0.3,
    focus:
      'Laufgewöhnung. Die Intervalle laufen von Anfang an mit, aber kurz und wenige — der Reiz soll da sein, ohne dass das Gewebe ihn bezahlt.',
  },
  {
    id: 'P1',
    label: 'Volumen',
    span: 'Monat 3–6',
    fromWeek: 8,
    toWeek: 25,
    runsPerWeek: 4,
    hardPerWeek: 1,
    longRunShare: 0.33,
    focus:
      'Die Zone-2-Minuten tragen den Zuwachs. Ein vierter Lauf kommt dazu, bevor die einzelnen Läufe länger werden.',
  },
  {
    id: 'P2',
    label: 'Kapazität',
    span: 'Monat 7–10',
    fromWeek: 26,
    toWeek: 43,
    runsPerWeek: 4,
    hardPerWeek: 1,
    longRunShare: 0.35,
    focus:
      'VO2max und Schwelle. Die Bahnstufen wandern nach oben, der lange Lauf bekommt Gewicht, der Grundlagenanteil fällt nicht.',
  },
  {
    id: 'P3',
    label: 'Dauerbetrieb',
    span: 'ab Monat 11',
    fromWeek: 44,
    toWeek: null,
    runsPerWeek: 4,
    hardPerWeek: 1,
    longRunShare: 0.35,
    focus:
      'Kein Ende und kein Tapering. Rotierende Blöcke: das Volumen läuft hoch, der Deload holt es zurück, die Stufen wandern weiter.',
  },
];

/** Die rollende Woche ist das Regelfenster. Sieben Tage, nicht der Schichtzyklus. */
export const RULE_WINDOW_DAYS = 7;
/** Das Volumen wird über zehn Tage gemessen und verglichen. */
export const VOLUME_WINDOW_DAYS = 10;
/** Jede vierte Woche ist eine Entlastungswoche. */
export const DELOAD_EVERY_WEEKS = 4;

/** Höchstens 8 % mehr Laufminuten je 10 Tage. */
export const MAX_GROWTH = 0.08;
/** In P0 zusätzlich: eine einzelne Einheit wächst um höchstens 10 Minuten. */
export const P0_MAX_SESSION_GROWTH = 10;
/** Der lange Lauf wächst um höchstens 10 Minuten je Schritt. */
export const LONGRUN_MAX_STEP = 10;
/** Mindestanteil Zone 2 an den Laufminuten. */
export const MIN_ZONE2_SHARE = 0.8;
/** Der Deload nimmt 40 % der Laufminuten weg. */
export const DELOAD_CUT = 0.4;

export function phaseForWeek(week: number): Phase {
  for (let i = PHASES.length - 1; i >= 0; i--) {
    if (week >= PHASES[i].fromWeek) return PHASES[i];
  }
  return PHASES[0];
}

/**
 * Wo ein Einstieg beginnt, wenn es keine Vorgeschichte gibt.
 *
 * Das ist der einzige Wert im ganzen Modell, den die App nicht herleiten kann:
 * wie viel gerade gelaufen wird, weiß nur der Athlet. Geraten wäre er in beide
 * Richtungen falsch — zu hoch ist eine Verletzung, zu niedrig sind Wochen, in
 * denen der Plan unter dem bleibt, was längst geht, und dabei nicht einmal die
 * Bahneinheit trägt.
 *
 * Deshalb steht er in den Einstellungen (`settings.startRunMinutes`) und hier
 * nur als Rückfallwert: 150 Minuten auf zehn Tage, also rund dreimal 35 Minuten
 * die Woche. Sobald zehn Tage mit erfassten Läufen vorliegen, ist er
 * bedeutungslos — dann misst der Plan.
 */
export const COLD_START_MINUTES = 150;

export type LimitedBy = 'start' | 'wachstum' | 'deload' | 'phasenwechsel';

export interface VolumeTarget {
  phase: Phase;
  week: number;
  /** Die Laufminuten, die für die kommenden zehn Tage geplant werden. */
  runMinutes: number;
  /** Was tatsächlich gelaufen wurde, als Grundlage. Null ohne Vorgeschichte. */
  measured: number | null;
  /** Was die Wachstumsgrenze zulässt. Null ohne Vorgeschichte. */
  ceiling: number | null;
  isDeload: boolean;
  limitedBy: LimitedBy;
  reason: string;
}

/**
 * Das Laufminutenziel für die kommenden zehn Tage.
 *
 * `measuredMinutes` sind die tatsächlich gelaufenen Minuten der zehn Tage
 * davor. Es gibt kein Phasenziel mehr, das dagegen anträte: die Zahl wächst aus
 * der Messung, oder sie gibt es nicht.
 */
export function targetFor(input: {
  week: number;
  measuredMinutes: number | null;
  isDeload: boolean;
  /** Das eingestellte Startvolumen. Gilt nur, solange nichts gemessen ist. */
  startMinutes?: number | null;
  /** Wahr in der Woche, in der die Phase wechselt. */
  phaseChanging?: boolean;
}): VolumeTarget {
  const phase = phaseForWeek(input.week);
  const measured = input.measuredMinutes;
  const coldStart = input.startMinutes ?? COLD_START_MINUTES;

  if (measured == null || measured <= 0) {
    return {
      phase,
      week: input.week,
      runMinutes: input.isDeload ? Math.round(coldStart * (1 - DELOAD_CUT)) : coldStart,
      measured: null,
      ceiling: null,
      isDeload: input.isDeload,
      limitedBy: 'start',
      reason: `Noch keine zehn Tage mit erfassten Läufen. Es gilt dein Startvolumen: ${coldStart} Laufminuten auf zehn Tage. Sobald du zehn Tage eingetragen hast, misst der Plan statt zu übernehmen.`,
    };
  }

  // Eine Obergrenze, die man durch Runden überschreiten kann, ist keine.
  const ceiling = Math.floor(measured * (1 + MAX_GROWTH));

  if (input.isDeload) {
    const cut = Math.round(measured * (1 - DELOAD_CUT));
    return {
      phase,
      week: input.week,
      runMinutes: cut,
      measured,
      ceiling,
      isDeload: true,
      limitedBy: 'deload',
      reason: `Entlastungswoche: ${cut} statt ${measured} Laufminuten, keine harte Einheit, langer Lauf halbiert. Die Anpassung passiert in der Erholung, nicht im Reiz.`,
    };
  }

  /*
   * Ein Phasenwechsel ändert die Art des Trainings. Beides gleichzeitig zu
   * ändern macht hinterher unmöglich zu sagen, woran eine Überlastung lag.
   */
  if (input.phaseChanging) {
    return {
      phase,
      week: input.week,
      runMinutes: measured,
      measured,
      ceiling,
      isDeload: false,
      limitedBy: 'phasenwechsel',
      reason: `Phasenwechsel auf ${phase.id}: die Laufminuten bleiben bei ${measured}. Umfang und Intensität wachsen nie gleichzeitig.`,
    };
  }

  return {
    phase,
    week: input.week,
    runMinutes: ceiling,
    measured,
    ceiling,
    isDeload: false,
    limitedBy: 'wachstum',
    reason: `${measured} Laufminuten in den zehn Tagen davor, plus höchstens 8 % — also ${ceiling}. Die Grenze wird nicht gedehnt.`,
  };
}

/** Ob die Woche mit diesem Index eine Entlastungswoche ist. Gezählt ab 0. */
export function isDeloadWeek(weekIndex: number): boolean {
  return weekIndex > 0 && (weekIndex + 1) % DELOAD_EVERY_WEEKS === 0;
}

/** Wie viele Wochen noch bis zur nächsten Entlastung. */
export function weeksUntilDeload(weekIndex: number): number {
  for (let i = 1; i <= DELOAD_EVERY_WEEKS; i++) {
    if (isDeloadWeek(weekIndex + i)) return i;
  }
  return DELOAD_EVERY_WEEKS;
}
