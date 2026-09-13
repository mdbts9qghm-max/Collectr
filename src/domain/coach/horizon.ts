import type { ISODate } from '../types.ts';
import { addDays, diffDays } from '../date.ts';

/**
 * Das Einflussfenster — rollend, nicht statisch.
 *
 * > „Der Coach soll immer die Tage davor und die, die noch kommen, im Auge
 * > haben, innerhalb einer Woche, aber rollend und nicht statisch. Erst wenn
 * > ein Tag nicht mehr einen anderen Tag beeinflusst, weil zum Beispiel genug
 * > Tage vergangen sind, dann kann er ihn vernachlässigen."
 *
 * Genau so ist das hier gebaut, und zwar wörtlich: **jede Regel trägt ihre
 * eigene Reichweite in Tagen.** Ein Tag zählt für heute, solange mindestens
 * eine Regel so weit reicht. Reicht keine mehr, ist er nachweislich ohne
 * Einfluss — und wird nicht etwa vergessen, sondern begründet vernachlässigt.
 *
 * Es gibt deshalb kein „diese Woche". Das Fenster hat keine Kanten, an denen
 * etwas abreißt: ein Montag verliert seinen Einfluss nicht dadurch, dass eine
 * neue Kalenderwoche anfängt, sondern dadurch, dass genug Tage vergangen sind.
 *
 * Die meisten Regeln reichen eine rollende Woche weit, also sechs Tage in jede
 * Richtung. Zwei reichen weiter, und das lässt sich nicht vermeiden: die
 * Steigerungsgrenze vergleicht zehn Tage mit zehn Tagen, sie braucht also
 * neunzehn Tage Rückblick. Die Bahnstufe verlangt zwei saubere Wochen, bevor
 * sie weiterrückt.
 */

export interface InfluenceRule {
  id: string;
  label: string;
  rule: string;
  /** Tage zurück, die diese Regel anschaut. */
  back: number;
  /** Tage voraus, die diese Regel anschaut. */
  forward: number;
  /** Warum die Reichweite genau so groß ist — und nicht größer. */
  reachReason: string;
}

/** Die rollende Woche: heute plus sechs Tage in jede Richtung. */
const WEEK = 6;

export const INFLUENCE_RULES: InfluenceRule[] = [
  {
    id: 'tagschicht',
    label: 'Tagschicht',
    rule: 'Am Tagschichttag findet kein Training statt.',
    back: 0,
    forward: 0,
    reachReason:
      'Gilt für den Tag selbst. Zwölf Stunden Dienst plus Wege lassen kein Fenster, und das hängt an keinem anderen Tag.',
  },
  {
    id: 'intensitaet_uebergang',
    label: 'Keine Intensität am Übergangstag',
    rule: 'Keine Intensitätseinheit an Schlaf- oder V-Schichttagen.',
    back: 0,
    forward: 0,
    reachReason:
      'Eine Eigenschaft des Tages: sechs Stunden fragmentierter Tagschlaf nach 24 Stunden wach tragen keine Intensität.',
  },
  {
    id: 'abstand_zum_schlaf',
    label: 'Abstand zum Schlaf',
    rule: 'Zwischen Belastungsende und Schlafbeginn liegen mindestens 90 Minuten.',
    back: 0,
    forward: 0,
    reachReason: 'Betrifft nur die Uhrzeit dieses einen Tages.',
  },
  {
    id: 'beinkraft_longrun',
    label: 'Beinkraft und langer Lauf',
    rule: 'Schwere Beinkraft nie in den 24 Stunden vor einem langen Lauf.',
    back: 1,
    forward: 1,
    reachReason: 'Genau vierundzwanzig Stunden — ein Tag in jede Richtung, mehr nicht.',
  },
  {
    id: 'abstand_harte_laeufe',
    label: 'Abstand zwischen harten Läufen',
    rule: 'Mindestens 48 Stunden zwischen zwei harten Läufen.',
    back: 2,
    forward: 2,
    reachReason:
      'Achtundvierzig Stunden sind zwei Tage. Der dritte Tag danach ist frei — die Regel reicht nicht weiter, also zählt er nicht mehr.',
  },
  {
    id: 'eine_harte_pro_woche',
    label: 'Eine harte Einheit je Woche',
    rule: 'Höchstens eine Intensitätseinheit in sieben rollenden Tagen.',
    back: WEEK,
    forward: WEEK,
    reachReason:
      'Sieben rollende Tage: sechs zurück und sechs voraus, damit jedes Fenster, in dem heute liegt, geprüft ist.',
  },
  {
    id: 'ein_longrun_pro_woche',
    label: 'Ein langer Lauf je Woche',
    rule: 'Höchstens ein langer Lauf in sieben rollenden Tagen.',
    back: WEEK,
    forward: WEEK,
    reachReason: 'Dieselbe rollende Woche wie bei der harten Einheit.',
  },
  {
    id: 'ruhetag',
    label: 'Ein Tag ohne Belastung',
    rule: 'Mindestens ein Tag mit Belastung null in sieben rollenden Tagen.',
    back: WEEK,
    forward: WEEK,
    reachReason:
      'Ob heute ruhen muss, hängt daran, ob in den sieben Tagen um heute herum schon ein leerer Tag liegt.',
  },
  {
    id: 'zone2_anteil',
    label: 'Zone-2-Anteil',
    rule: 'Mindestens 80 % der Laufminuten liegen in Zone 2.',
    back: WEEK,
    forward: WEEK,
    reachReason:
      'Ein Anteil braucht eine Menge, über die er gebildet wird. Sieben rollende Tage sind diese Menge.',
  },
  {
    id: 'deload',
    label: 'Entlastungswoche',
    rule: 'Jede vierte Woche: Laufminuten −40 %, keine Intensität, langer Lauf halbiert.',
    back: WEEK,
    forward: WEEK,
    reachReason: 'Die Entlastung gilt für eine ganze Woche, also für jeden Tag darin.',
  },
  {
    id: 'intervallstufe',
    label: 'Bahnstufe',
    rule: 'Eine Stufe wird erst weitergerückt, wenn zwei Wochen sauber gelaufen sind.',
    back: 13,
    forward: 13,
    reachReason:
      'Zwei Wochen sind vierzehn Tage. Was davor liegt, hat die Stufe schon nicht mehr bewegt.',
  },
  {
    id: 'longrun_steigerung',
    label: 'Steigerung des langen Laufs',
    rule: 'Höchstens 10 Minuten Zuwachs je Schritt, nie zweimal in Folge gesteigert.',
    back: 19,
    forward: 9,
    reachReason:
      'Zwei Schritte zurück, damit „nie zweimal in Folge" prüfbar ist — das sind zwei Zehn-Tage-Fenster.',
  },
  {
    id: 'volumen_wachstum',
    label: 'Steigerung der Laufminuten',
    rule: 'Höchstens 8 % mehr Laufminuten je zehn Tage.',
    back: 19,
    forward: 9,
    reachReason:
      'Die Regel vergleicht zehn Tage mit zehn Tagen. Das ist die einzige Regel, die über die rollende Woche hinausreicht, und sie kann es nicht kürzer.',
  },
];

export const HORIZON_BACK = Math.max(...INFLUENCE_RULES.map((r) => r.back));
export const HORIZON_FORWARD = Math.max(...INFLUENCE_RULES.map((r) => r.forward));

/** Alle Tage, die heute überhaupt beeinflussen können. */
export function horizonDays(anchor: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let i = -HORIZON_BACK; i <= HORIZON_FORWARD; i++) out.push(addDays(anchor, i));
  return out;
}

/**
 * Welche Regeln von `anchor` aus bis `date` reichen.
 *
 * Leer heißt: dieser Tag beeinflusst heute nichts mehr. Das ist eine Aussage,
 * keine Lücke — und die Oberfläche sagt sie auch so.
 */
export function rulesReaching(anchor: ISODate, date: ISODate): InfluenceRule[] {
  const offset = diffDays(date, anchor);
  const distance = Math.abs(offset);
  return INFLUENCE_RULES.filter((r) => distance <= (offset <= 0 ? r.back : r.forward));
}

/** Die rollende Woche um einen Tag herum: drei zurück, drei voraus. */
export function rollingWeek(anchor: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let i = -3; i <= 3; i++) out.push(addDays(anchor, i));
  return out;
}
