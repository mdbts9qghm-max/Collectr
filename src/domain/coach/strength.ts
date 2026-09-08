import type { SessionKind } from './catalogue.ts';
import { CATALOGUE } from './catalogue.ts';

/**
 * Kraft geht immer.
 *
 * Kraft ist die einzige Belastungsform in diesem Plan, die nicht um Laufminuten
 * konkurriert. Sie wird deshalb nicht weggelassen, wenn es eng wird — sie wird
 * dorthin gelegt, wo sie passt, und in der Intensität an den Tag angepasst.
 *
 * Die eine harte Grenze ist die Nachbarschaft zu Laufreizen:
 *
 * > Schwere Beinkraft liegt nie in den 24 Stunden vor einer Intensitäts- oder
 * > Longrun-Einheit.
 *
 * Diese Grenze verschiebt die Beine nicht ins Leichte, sondern die Übungen nach
 * oben: Oberkörper geht auch am Tag vor der Bahn. Was wegfällt, ist die Last auf
 * den Beinen, nicht die Einheit.
 */

export type StrengthKind = Extract<
  SessionKind,
  'kraft_ganzkoerper' | 'kraft_oberkoerper' | 'kraft_leicht'
>;

export interface StrengthBlock {
  name: string;
  sets: number;
  reps: string;
  note: string;
}

export interface StrengthPlan {
  kind: StrengthKind | null;
  minutes: number;
  /** Zielanstrengung auf der Skala von 1 bis 10. */
  rpe: number;
  /** Anhaltswert in Prozent des Einer-Maximums. */
  percentOfMax: number;
  /** Wiederholungen in Reserve — die praktisch brauchbare Fassung der RPE. */
  repsInReserve: number;
  blocks: StrengthBlock[];
  reason: string;
  /** Was die Intensität gedrückt oder gehoben hat, einzeln aufgeführt. */
  factors: { label: string; delta: number }[];
}

/** Unter diesem Erholungswert bringt Krafttraining keinen Reiz mehr, nur Müdigkeit. */
const MIN_RECOVERY_FOR_STRENGTH = 25;

const RPE_TO_PERCENT: Record<number, number> = {
  5: 65,
  6: 70,
  7: 75,
  8: 82,
  9: 87,
};

export interface StrengthInput {
  /** Erholungswert des Tages. */
  recovery: number;
  /** Kein Trainingsfenster — Tagschicht oder blockierter Tag. */
  hasWindow: boolean;
  /** Minuten, die neben dem Laufen an diesem Tag noch übrig sind. */
  availableMinutes: number;
  /** Morgen steht Intensität oder Longrun an — dann keine schweren Beine. */
  hardRunTomorrow: boolean;
  /** Heute wurde oder wird hart gelaufen. */
  hardRunToday: boolean;
  /** Gestern wurde hart gelaufen. */
  hardRunYesterday: boolean;
  /** Deload-Zyklus: die Kraft geht mit runter. */
  isDeload: boolean;
  /** Tage seit der letzten Krafteinheit. Null, wenn es noch keine gab. */
  daysSinceStrength: number | null;
}

export function planStrength(input: StrengthInput): StrengthPlan {
  const none = (reason: string): StrengthPlan => ({
    kind: null,
    minutes: 0,
    rpe: 0,
    percentOfMax: 0,
    repsInReserve: 0,
    blocks: [],
    reason,
    factors: [],
  });

  if (!input.hasWindow) return none('Kein Trainingsfenster an diesem Tag.');
  if (input.recovery < MIN_RECOVERY_FOR_STRENGTH) {
    return none(
      `Erholung ${input.recovery} — unter ${MIN_RECOVERY_FOR_STRENGTH} bringt auch Kraft keinen Reiz mehr, sondern nur Müdigkeit.`,
    );
  }
  if (input.availableMinutes < CATALOGUE.kraft_leicht.minMinutes) {
    return none(
      `Nur ${input.availableMinutes} Minuten frei — das reicht neben dem Laufen für keine Krafteinheit.`,
    );
  }

  const factors: { label: string; delta: number }[] = [];
  const add = (label: string, delta: number) => {
    if (delta !== 0) factors.push({ label, delta });
  };

  /*
   * Die Intensität wird gerechnet, nicht gewählt. Ausgangspunkt ist der
   * Erholungswert; alles, was die Beine in den nächsten 24 Stunden noch
   * gebraucht werden lässt, zieht davon ab.
   */
  let score = input.recovery;
  add(`Erholung ${input.recovery}`, 0);

  let legsAllowed = true;
  if (input.hardRunTomorrow) {
    legsAllowed = false;
    add('Morgen Intensität oder Longrun — Beine bleiben frei', -15);
    score -= 15;
  }
  if (input.hardRunToday) {
    add('Heute schon hart gelaufen', -20);
    score -= 20;
  }
  if (input.hardRunYesterday) {
    add('Gestern hart gelaufen', -10);
    score -= 10;
  }
  if (input.isDeload) {
    add('Deload-Zyklus', -15);
    score -= 15;
  }
  if (input.daysSinceStrength != null && input.daysSinceStrength <= 1) {
    add(`Letzte Krafteinheit vor ${input.daysSinceStrength} Tag`, -20);
    score -= 20;
  }
  if (input.daysSinceStrength != null && input.daysSinceStrength >= 6) {
    add(`Seit ${input.daysSinceStrength} Tagen keine Kraft`, 8);
    score += 8;
  }

  const kind: StrengthKind = !legsAllowed
    ? score >= 45
      ? 'kraft_oberkoerper'
      : 'kraft_leicht'
    : score >= 60
      ? 'kraft_ganzkoerper'
      : score >= 40
        ? 'kraft_oberkoerper'
        : 'kraft_leicht';

  const entry = CATALOGUE[kind];
  const minutes = Math.max(
    entry.minMinutes,
    Math.min(entry.maxMinutes, entry.defaultMinutes, input.availableMinutes),
  );

  const rpe = Math.max(5, Math.min(9, Math.round(5 + (score - 40) / 15)));
  const percentOfMax = RPE_TO_PERCENT[rpe];
  const repsInReserve = 10 - rpe;

  const reason =
    kind === 'kraft_ganzkoerper'
      ? `Der Tag trägt schwere Beine: RPE ${rpe}, rund ${percentOfMax} % — ${repsInReserve} Wiederholungen in Reserve.`
      : kind === 'kraft_oberkoerper'
        ? legsAllowed
          ? `Erholung reicht für Kraft, aber nicht für schwere Beine: Oberkörper mit RPE ${rpe}, rund ${percentOfMax} %.`
          : `Die 24-Stunden-Sperre vor der harten Laufeinheit gilt: Oberkörper mit RPE ${rpe}, Beine bleiben frisch.`
        : `Wenig übrig für Kraft: kurze Einheit auf Mobilität und Rumpf, RPE ${rpe}. Kraft fällt nicht aus, sie wird leichter.`;

  return {
    kind,
    minutes,
    rpe,
    percentOfMax,
    repsInReserve,
    blocks: blocksFor(kind, rpe),
    reason,
    factors,
  };
}

function blocksFor(kind: StrengthKind, rpe: number): StrengthBlock[] {
  const reps = rpe >= 8 ? '4–6' : rpe >= 7 ? '6–8' : '8–12';
  const sets = rpe >= 8 ? 4 : 3;

  const core: StrengthBlock = {
    name: 'Rumpf: Unterarmstütz seitlich und Pallof-Press',
    sets: 3,
    reps: '30–40 s je Seite',
    note: 'Nicht bis zum Zittern. Der Rumpf soll den Lauf tragen, nicht ihn ersetzen.',
  };

  if (kind === 'kraft_leicht') {
    return [
      {
        name: 'Hüft- und Sprunggelenk mobilisieren',
        sets: 2,
        reps: '8–10 je Seite',
        note: 'Bewegen, nicht dehnen bis zur Grenze.',
      },
      core,
      {
        name: 'Wadenheben einbeinig',
        sets: 2,
        reps: '12–15',
        note: 'Ohne Zusatzlast. Achillessehne und Wade vertragen das täglich.',
      },
    ];
  }

  const upper: StrengthBlock[] = [
    {
      name: 'Ziehen: Klimmzug oder Langhantelrudern',
      sets,
      reps,
      note: `RPE ${rpe} — die letzte Wiederholung muss sauber aussehen.`,
    },
    {
      name: 'Drücken: Bankdrücken oder Liegestütz',
      sets,
      reps,
      note: 'Schulterblätter fixiert, Ellbogen nicht ausstellen.',
    },
    {
      name: 'Überkopfdrücken',
      sets: 3,
      reps,
      note: 'Aus dem Stand, Rumpf fest. Kein Hohlkreuz zum Ausgleich.',
    },
  ];

  if (kind === 'kraft_oberkoerper') return [...upper, core];

  return [
    {
      name: 'Kniebeuge',
      sets,
      reps,
      note: `RPE ${rpe}. Tiefe vor Last — wenn die Tiefe geht, geht die Last auch.`,
    },
    {
      name: 'Hüftstreckung: Kreuzheben rumänisch',
      sets: 3,
      reps,
      note: 'Rücken gerade, Bewegung aus der Hüfte. Das ist die Übung, die den Longrun trägt.',
    },
    {
      name: 'Ausfallschritt gehend',
      sets: 3,
      reps: '8–10 je Bein',
      note: 'Einbeinige Stabilität — genau das, was beim Laufen passiert.',
    },
    ...upper.slice(0, 2),
    core,
  ];
}
