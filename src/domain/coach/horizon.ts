import type { ISODate } from '../types.ts';
import { addDays, dateRange, diffDays } from '../date.ts';

/**
 * # Zielsetzung
 *
 * Es gibt kein Rennen, kein Zieldatum und kein Tapering. Das Ziel ist ein
 * dauerhaft belastbares Herz-Kreislauf-System. Die 100 km sind ein Nebenprodukt
 * davon, kein Trainingsziel. Die Steuergröße ist der aerobe Reiz, nicht die
 * Kilometerzahl. Fortschritt wird an VO2max, Schwellenherzfrequenz, Ruhepuls,
 * HRV und der Herzfrequenz-Erholung nach einer Minute gemessen — nicht an
 * Bestzeiten und nicht an Wochenkilometern.
 *
 * ---
 *
 * ## Das Einflussfenster
 *
 * Ein Trainingstag steht nie für sich. Er wird von dem beeinflusst, was davor
 * lag, und er beeinflusst das, was danach kommt — über Zyklus- und
 * Wochengrenzen hinweg. Aber dieser Einfluss ist nicht unendlich: jede Regel
 * hat eine Reichweite in Tagen, und sobald keine Regel mehr über einen Tag
 * hinweg reicht, ist dieser Tag für die heutige Entscheidung nachweislich
 * bedeutungslos.
 *
 * Deshalb wird die Reichweite hier nicht geschätzt, sondern pro Regel
 * deklariert. Das Blickfeld des Coaches ist das Maximum über alle Regeln —
 * nicht mehr, damit die Begründung endlich bleibt, und nicht weniger, damit
 * keine Regel aus dem Blick fällt.
 *
 * `back` ist die Zahl der Tage, über die ein vergangener Tag den Ankertag noch
 * beeinflusst. `forward` ist die Zahl der Tage, über die der Ankertag einen
 * künftigen Tag noch beeinflusst. Die beiden sind nicht immer gleich: der
 * 28-Tage-Nenner des Belastungsverhältnisses reicht weit zurück *und* weit
 * nach vorn, der Abstand zur nächsten Schlafphase dagegen endet am selben Tag.
 */

export interface InfluenceRule {
  id: string;
  /** Kurzform für Chips und Tagesmarker. */
  label: string;
  /** Die Regel im Wortlaut, so wie sie im Regelwerk steht. */
  rule: string;
  /** Tage in die Vergangenheit, über die ein Tag den Ankertag noch beeinflusst. */
  back: number;
  /** Tage in die Zukunft, über die der Ankertag noch wirkt. */
  forward: number;
  /** Warum die Reichweite genau so lang ist — und nicht länger. */
  reachReason: string;
}

/**
 * Jede Regel mit Reichweite, die über einen einzelnen Tag hinausgeht.
 *
 * Regeln, die nur den Tag selbst betreffen — kein Training am Tagschichttag,
 * keine Intensität am Nacht-, Schlaf- oder V-Tag — stehen hier nicht, weil sie
 * das Blickfeld nicht aufspannen. Sie werden im Regelwerk geprüft, nicht hier.
 */
export const INFLUENCE_RULES: InfluenceRule[] = [
  {
    id: 'belastung_vor_schlaf',
    label: 'Abstand zum Schlaf',
    rule: 'Belastung ab 60 endet mindestens 3 Stunden vor der nächsten Schlafphase. Der Vorschlaf zählt als Schlafphase.',
    back: 0,
    forward: 0,
    reachReason:
      'Betrifft nur die Uhrzeit innerhalb eines Tages. Sobald der Tag vorbei ist, wirkt die Regel nicht mehr weiter.',
  },
  {
    id: 'beinkraft_vor_intensitaet',
    label: 'Beinkraft 24 h',
    rule: 'Schwere Beinkraft liegt nie in den 24 Stunden vor einer Intensitäts- oder Longrun-Einheit.',
    back: 1,
    forward: 1,
    reachReason:
      'Genau ein Tag: eine Beinkraftheit von gestern blockiert heute, eine von heute blockiert morgen. Am übernächsten Tag ist die Sperre abgelaufen.',
  },
  {
    id: 'harte_einheiten_abstand',
    label: '48 h zwischen hart',
    rule: 'Zwischen zwei harten Laufeinheiten liegen mindestens 48 Stunden.',
    back: 2,
    forward: 2,
    reachReason:
      'Zwei Tage. Eine harte Einheit vorgestern lässt heute wieder eine zu, eine von gestern nicht.',
  },
  {
    id: 'ruhetag_pro_zyklus',
    label: 'Ruhetag je Zyklus',
    rule: 'Mindestens ein Tag ohne jede Belastung pro Zyklus.',
    back: 4,
    forward: 4,
    reachReason:
      'Der Zyklus ist fünf Tage lang. Was fünf Tage her ist, gehört zum vorigen Zyklus und zählt für dessen Ruhetag, nicht für diesen.',
  },
  {
    id: 'schluessel_pro_zyklus',
    label: 'Schlüsseleinheiten je Zyklus',
    rule: 'Höchstens eine Intensitätseinheit und höchstens ein Longrun pro Zyklus.',
    back: 4,
    forward: 4,
    reachReason:
      'Wie der Ruhetag an den Fünf-Tage-Zyklus gebunden. Das Budget füllt sich mit dem nächsten Zyklus wieder auf.',
  },
  {
    id: 'zone2_anteil',
    label: 'Zone-2-Anteil',
    rule: 'Zone 2 macht mindestens 80 % der Laufminuten je 10 Tage aus. Diese Regel steht über jedem Volumenziel.',
    back: 9,
    forward: 9,
    reachReason:
      'Das Zehn-Tage-Fenster ist rollend: heute liegt in jedem Fenster, das an einem der neun Vortage beginnt, und in jedem, das an einem der neun Folgetage endet.',
  },
  {
    id: 'longrun_steigerung',
    label: 'Longrun-Schritt',
    rule: 'Der Longrun wächst höchstens 10 Minuten pro Schritt, nie zweimal hintereinander, und liegt nie über 35 % der Laufminuten von 10 Tagen.',
    back: 10,
    forward: 10,
    reachReason:
      'Ein Schritt ist ein Makrozyklus von zehn Tagen. Der vorletzte Longrun entscheidet, ob der nächste wieder wachsen darf.',
  },
  {
    id: 'intervallstufe',
    label: 'Bahnstufe',
    rule: 'Eine Intervallstufe wird erst verlassen, wenn zwei Zyklen sauber durchlaufen wurden.',
    back: 9,
    forward: 9,
    reachReason:
      'Zwei Zyklen sind zehn Tage. Ein Abbruch, der länger her ist, hält die Stufe nicht mehr auf.',
  },
  {
    id: 'volumen_wachstum',
    label: 'Volumenwachstum',
    rule: 'Die Laufminuten wachsen höchstens 8 % je 10 Tage. Verlangt das Phasenziel mehr, gilt die Grenze — das Ziel wird nach hinten verschoben, nicht die Grenze gedehnt.',
    back: 19,
    forward: 9,
    reachReason:
      'Der Vergleich braucht zwei Zehn-Tage-Fenster: das laufende und das davor. Nach vorn reicht ein Tag nur bis ans Ende seines eigenen Fensters.',
  },
  {
    id: 'abstiegsserie',
    label: 'Abstiegsserie',
    rule: 'Zwei aufeinanderfolgende 10-Tage-Blöcke mit Abstufungen erzwingen einen Deload.',
    back: 19,
    forward: 19,
    reachReason:
      'Zwei Blöcke à zehn Tage. Eine Abstufung von vor drei Blöcken kann keine Serie mehr bilden.',
  },
  {
    id: 'deload_rhythmus',
    label: 'Deload-Rhythmus',
    rule: 'Jeder vierte Zyklus ist ein Deload: 40 % weniger Laufminuten, keine Intensität, Longrun halbiert.',
    back: 19,
    forward: 19,
    reachReason:
      'Vier Zyklen sind zwanzig Tage. Der Abstand zum letzten Deload legt fest, wann der nächste fällig ist.',
  },
  {
    id: 'belastungsverhaeltnis',
    label: 'Belastungsverhältnis',
    rule: 'Das Verhältnis aus 7-Tage-Belastung und dem Tagesmittel von 28 Tagen bleibt zwischen 0,8 und 1,3.',
    back: 27,
    forward: 27,
    reachReason:
      'Der 28-Tage-Nenner ist die längste Regel im Regelwerk. Sie spannt damit das gesamte Blickfeld auf — was älter ist, steht in keinem Nenner mehr.',
  },
];

const RULE_BY_ID = new Map(INFLUENCE_RULES.map((r) => [r.id, r]));

export function influenceRuleById(id: string): InfluenceRule | null {
  return RULE_BY_ID.get(id) ?? null;
}

/** Weiter zurück schaut keine Regel. */
export const HORIZON_BACK: number = INFLUENCE_RULES.reduce((m, r) => Math.max(m, r.back), 0);
/** Weiter nach vorn wirkt kein heutiger Tag. */
export const HORIZON_FORWARD: number = INFLUENCE_RULES.reduce((m, r) => Math.max(m, r.forward), 0);

export type DayDirection = 'past' | 'today' | 'future';

export interface HorizonDay {
  date: ISODate;
  /** Negative in der Vergangenheit, 0 heute, positiv in der Zukunft. */
  offset: number;
  direction: DayDirection;
  /** Die Regeln, über die dieser Tag den Ankertag noch berührt. */
  rules: InfluenceRule[];
  /**
   * Die längste noch greifende Reichweite minus dem Abstand — wie viele Tage
   * dieser Tag noch mitzählt, bevor er aus dem Blickfeld fällt.
   */
  daysLeft: number;
  /** Anteil der Regeln, die diesen Tag noch erfassen. 1 heute, 0 außerhalb. */
  weight: number;
}

export interface Horizon {
  anchor: ISODate;
  from: ISODate;
  to: ISODate;
  back: number;
  forward: number;
  days: HorizonDay[];
}

/**
 * Die Regeln, über die `date` den Ankertag noch beeinflusst.
 *
 * Für vergangene Tage zählt `back`, für künftige `forward` — es ist dieselbe
 * Wirkung aus zwei Richtungen betrachtet: gestern wirkt auf heute, weil heute
 * auf morgen wirkt.
 */
export function rulesReaching(anchor: ISODate, date: ISODate): InfluenceRule[] {
  const offset = diffDays(date, anchor);
  const distance = Math.abs(offset);
  return INFLUENCE_RULES.filter((r) => distance <= (offset <= 0 ? r.back : r.forward));
}

/** Ob dieser Tag für die heutige Entscheidung überhaupt noch zählt. */
export function stillMatters(anchor: ISODate, date: ISODate): boolean {
  return rulesReaching(anchor, date).length > 0;
}

/**
 * Warum ein Tag aus dem Blickfeld gefallen ist — oder `null`, solange er noch
 * darin liegt. Der Coach soll auch das Vergessen begründen können.
 */
export function dropReason(anchor: ISODate, date: ISODate): string | null {
  if (stillMatters(anchor, date)) return null;
  const offset = diffDays(date, anchor);
  const distance = Math.abs(offset);
  return offset < 0
    ? `Liegt ${distance} Tage zurück. Die längste Regel reicht ${HORIZON_BACK} Tage — dieser Tag beeinflusst heute nichts mehr.`
    : `Liegt ${distance} Tage voraus. Kein heutiger Tag wirkt länger als ${HORIZON_FORWARD} Tage — was heute entschieden wird, erreicht ihn nicht.`;
}

export function buildHorizon(anchor: ISODate): Horizon {
  const from = addDays(anchor, -HORIZON_BACK);
  const to = addDays(anchor, HORIZON_FORWARD);

  const days: HorizonDay[] = dateRange(from, to).map((date) => {
    const offset = diffDays(date, anchor);
    const distance = Math.abs(offset);
    const rules = rulesReaching(anchor, date);
    const longest = rules.reduce((m, r) => Math.max(m, offset <= 0 ? r.back : r.forward), 0);
    return {
      date,
      offset,
      direction: offset < 0 ? 'past' : offset > 0 ? 'future' : 'today',
      rules,
      daysLeft: rules.length ? longest - distance : 0,
      weight: rules.length / INFLUENCE_RULES.length,
    };
  });

  return { anchor, from, to, back: HORIZON_BACK, forward: HORIZON_FORWARD, days };
}

/**
 * Der Datenbereich, den eine einzelne Regel um den Ankertag herum braucht.
 *
 * Damit lädt der Coach pro Regel genau so viel Vergangenheit, wie die Regel
 * begründen kann — und nicht das ganze Blickfeld für jede Prüfung.
 */
export function windowForRule(anchor: ISODate, ruleId: string): { from: ISODate; to: ISODate } | null {
  const rule = RULE_BY_ID.get(ruleId);
  if (!rule) return null;
  return { from: addDays(anchor, -rule.back), to: addDays(anchor, rule.forward) };
}

/** Das engste Fenster, das alle genannten Regeln abdeckt. */
export function windowCovering(anchor: ISODate, ruleIds: string[]): { from: ISODate; to: ISODate } {
  let back = 0;
  let forward = 0;
  for (const id of ruleIds) {
    const rule = RULE_BY_ID.get(id);
    if (!rule) continue;
    back = Math.max(back, rule.back);
    forward = Math.max(forward, rule.forward);
  }
  return { from: addDays(anchor, -back), to: addDays(anchor, forward) };
}
