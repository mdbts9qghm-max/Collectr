import type { PhaseId } from './phases.ts';
import type { SessionKind } from './catalogue.ts';
import { CATALOGUE } from './catalogue.ts';
import { CLEAN_CYCLES_PER_STAGE } from './intervals.ts';
import { MAX_GROWTH, phaseForWeek, weekOfMacrocycle } from './phases.ts';

/**
 * Kraft — nach denselben Regeln wie das Laufen.
 *
 * Sie war lange die Ausnahme im Plan: das Laufen hatte ein Volumenziel je zehn
 * Tage, eine Wachstumsgrenze, Phasen, Bahnstufen und einen Deload — die Kraft
 * bekam, was an Zeit und Erholung übrig blieb. Das ist jetzt vorbei. Kraft hat
 * dieselben fünf Dinge:
 *
 * | Laufen | Kraft |
 * | --- | --- |
 * | Laufminuten je 10 Tage aus der Phase | Kraftminuten je 10 Tage aus derselben Phase |
 * | höchstens 8 % Wachstum je 10 Tage | dieselbe Grenze |
 * | Bahnstufen 8×100 m bis 4×4 | Kraftstufen Anpassung bis Maximalkraft |
 * | zwei saubere Zyklen je Stufe | dieselbe Regel |
 * | Deload: 40 % weniger, keine Intensität | Deload: 40 % weniger, keine schwere Beinlast |
 *
 * Was bleibt: Kraft konkurriert nicht um Laufminuten, und die eine harte Grenze
 * ist die Nachbarschaft zu Laufreizen.
 *
 * > Schwere Beinkraft liegt nie in den 24 Stunden vor einer Intensitäts- oder
 * > Longrun-Einheit.
 *
 * Diese Grenze verschiebt nicht die Last ins Leichte, sondern die Übungen nach
 * oben: Oberkörper geht auch am Tag vor der Bahn. Was wegfällt, ist die Last auf
 * den Beinen, nicht die Einheit.
 */

export type StrengthKind = Extract<
  SessionKind,
  'kraft_ganzkoerper' | 'kraft_oberkoerper' | 'kraft_leicht'
>;

/* ------------------------------------------------------------------ *
 * Das Volumenziel
 * ------------------------------------------------------------------ */

export interface StrengthPhaseTarget {
  phase: PhaseId;
  fromMinutes: number;
  toMinutes: number;
  focus: string;
}

/**
 * Kraftminuten je zehn Tage, an dieselbe Phasenuhr gehängt wie das Laufen.
 *
 * **Diese Zahlen sind Urteil, keine Messung.** Sie sind auf **drei bis vier
 * Krafteinheiten je zehn Tage** gerechnet, also zwei bis drei die Woche: 180
 * Minuten auf vier Tage sind 45 Minuten je Einheit, der gängige Richtwert. Der
 * Aufbau dorthin ist bewusst langsam, weil in P0 die Sehnen der begrenzende
 * Faktor sind und nicht die Kraft.
 *
 * In P3 wächst die Kraft **nicht mehr mit**. Das ist die eine Stelle, an der sie
 * dem Laufen bewusst nicht folgt: dort ist das Laufvolumen nach oben offen, und
 * eine Kraft, die mitwüchse, konkurrierte um dieselbe Erholung. Kraft wird
 * aufgebaut und dann gehalten — sie ist die Stütze des Laufens, nicht sein
 * Wettbewerber.
 */
export const STRENGTH_PHASES: Record<PhaseId, StrengthPhaseTarget> = {
  P0: {
    phase: 'P0',
    fromMinutes: 100,
    toMinutes: 130,
    focus: 'Technik vor Last. Die Sehnen brauchen länger als die Muskeln.',
  },
  P1: {
    phase: 'P1',
    fromMinutes: 130,
    toMinutes: 160,
    focus: 'Aufbau bis auf die zwei Einheiten die Woche, die ein Läufer trägt.',
  },
  P2: {
    phase: 'P2',
    fromMinutes: 160,
    toMinutes: 180,
    focus: 'Maximalkraft in den Grundübungen — sie trägt den Longrun.',
  },
  P3: {
    phase: 'P3',
    fromMinutes: 180,
    toMinutes: 180,
    focus: 'Halten. Hier wächst das Laufen weiter, die Kraft nicht mehr.',
  },
};

export interface StrengthTarget {
  phase: PhaseId;
  phaseTarget: number;
  growthCeiling: number | null;
  /** Kraftminuten, die tatsächlich verplant werden. */
  minutes: number;
  limitedBy: 'start' | 'phase' | 'wachstum' | 'deload';
  reason: string;
}

/**
 * Das Kraftminutenziel für einen Makrozyklus — dieselbe Rechnung wie beim Laufen.
 *
 * Das Phasenziel ist eine Absicht, die Wachstumsgrenze ist ein Gesetz. Wo beide
 * sich widersprechen, gewinnt die Grenze und das Ziel rutscht nach hinten.
 */
export function strengthTargetFor(input: {
  macrocycleIndex: number;
  previousStrengthMinutes: number | null;
  /** Anteil des Makrozyklus, der im Deload liegt: 0, 0.5 oder 1. */
  deloadShare?: number;
}): StrengthTarget {
  const week = weekOfMacrocycle(input.macrocycleIndex);
  const phase = phaseForWeek(week);
  const table = STRENGTH_PHASES[phase.id];

  const spanWeeks = phase.toWeek == null ? 20 : phase.toWeek - phase.fromWeek;
  const progress = spanWeeks <= 0 ? 1 : Math.min(1, (week - phase.fromWeek) / spanWeeks);
  const phaseTarget = Math.round(
    table.fromMinutes + (table.toMinutes - table.fromMinutes) * progress,
  );

  const previous = input.previousStrengthMinutes;
  const growthCeiling = previous != null ? Math.floor(previous * (1 + MAX_GROWTH)) : null;
  const deloadShare = input.deloadShare ?? 0;

  const withDeload = (minutes: number) => Math.round(minutes * (1 - 0.4 * deloadShare));

  if (previous == null || growthCeiling == null) {
    const minutes = withDeload(table.fromMinutes);
    return {
      phase: phase.id,
      phaseTarget,
      growthCeiling: null,
      minutes,
      limitedBy: deloadShare > 0 ? 'deload' : 'start',
      reason: `Noch keine zehn Tage Vorgeschichte. Einstieg in ${phase.id} mit ${minutes} Kraftminuten.`,
    };
  }

  if (phaseTarget > growthCeiling) {
    const minutes = withDeload(growthCeiling);
    return {
      phase: phase.id,
      phaseTarget,
      growthCeiling,
      minutes,
      limitedBy: 'wachstum',
      reason: `${phase.id} sähe ${phaseTarget} Kraftminuten vor, gewachsen wird aber höchstens 8 % — also ${growthCeiling}${deloadShare > 0 ? `, im Deload ${minutes}` : ''}.`,
    };
  }

  const minutes = withDeload(phaseTarget);
  return {
    phase: phase.id,
    phaseTarget,
    growthCeiling,
    minutes,
    limitedBy: deloadShare > 0 ? 'deload' : 'phase',
    reason:
      deloadShare > 0
        ? `Deload: ${minutes} statt ${phaseTarget} Kraftminuten, und keine schwere Beinlast.`
        : `${phase.id}: ${minutes} Kraftminuten in zehn Tagen. ${table.focus}`,
  };
}

/* ------------------------------------------------------------------ *
 * Die Stufen
 * ------------------------------------------------------------------ */

export interface StrengthStage {
  id: 'A' | 'B' | 'C' | 'D';
  index: number;
  label: string;
  sets: number;
  reps: string;
  /** Zielanstrengung dieser Stufe. Die Erholung darf sie nur senken, nie heben. */
  targetRpe: number;
  purpose: string;
}

/**
 * Die Kraftstufen — dieselbe Mechanik wie die Bahnstufen.
 *
 * Eine Stufe wird erst verlassen, wenn zwei Zyklen sauber durchlaufen wurden.
 * Wer von Anpassung direkt auf Maximalkraft springt, hat keine Anpassung
 * gewonnen, sondern nur die Rückmeldung verloren, ob die Technik trägt.
 */
export const STRENGTH_STAGES: StrengthStage[] = [
  {
    id: 'A',
    index: 0,
    label: 'Anpassung',
    sets: 2,
    reps: '12–15',
    targetRpe: 6,
    purpose: 'Bewegungen lernen, Sehnen an Last gewöhnen',
  },
  {
    id: 'B',
    index: 1,
    label: 'Hypertrophie',
    sets: 3,
    reps: '8–12',
    targetRpe: 7,
    purpose: 'Muskelquerschnitt als Grundlage für alles Weitere',
  },
  {
    id: 'C',
    index: 2,
    label: 'Kraft',
    sets: 4,
    reps: '6–8',
    targetRpe: 8,
    purpose: 'Kraft bei überschaubarer Ermüdung — der Bereich, in dem ein Läufer lebt',
  },
  {
    id: 'D',
    index: 3,
    label: 'Maximalkraft',
    sets: 4,
    reps: '4–6',
    targetRpe: 9,
    purpose: 'Neuronale Ansteuerung, wenig Volumen, wenig Muskelkater',
  },
];

export interface StrengthStageState {
  stage: StrengthStage;
  cleanCycles: number;
  cyclesToNext: number;
  next: StrengthStage | null;
  reason: string;
}

/** Die Stufe aus der Vorgeschichte — Zyklus für Zyklus, sauber oder nicht. */
export function strengthStageFor(history: boolean[]): StrengthStageState {
  let index = 0;
  let clean = 0;
  for (const wasClean of history) {
    if (!wasClean) {
      clean = 0;
      continue;
    }
    clean += 1;
    if (clean >= CLEAN_CYCLES_PER_STAGE && index < STRENGTH_STAGES.length - 1) {
      index += 1;
      clean = 0;
    }
  }
  const stage = STRENGTH_STAGES[index];
  const next = index < STRENGTH_STAGES.length - 1 ? STRENGTH_STAGES[index + 1] : null;
  const cyclesToNext = next ? CLEAN_CYCLES_PER_STAGE - clean : 0;
  return {
    stage,
    cleanCycles: clean,
    cyclesToNext,
    next,
    reason: next
      ? `Kraftstufe ${stage.id}: ${stage.label}, ${stage.sets} × ${stage.reps} bei RPE ${stage.targetRpe}. Noch ${cyclesToNext} sauberer Zyklus bis ${next.label}.`
      : `Kraftstufe ${stage.id}: ${stage.label}. Die letzte Stufe — hier bleibt es.`,
  };
}

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
  /** Deload-Zyklus: die Kraft geht mit runter, und schwere Beinlast entfällt. */
  isDeload: boolean;
  /** Tage seit der letzten Krafteinheit. Null, wenn es noch keine gab. */
  daysSinceStrength: number | null;
  /** Die Stufe aus der Vorgeschichte. Sie setzt die Zielanstrengung. */
  stage: StrengthStage;
  /** Die Minuten, die die Volumenverteilung diesem Tag zugeteilt hat. */
  targetMinutes: number;
  /** Schwere Beinlast liegt weniger als 48 h zurück. */
  legsRecentlyLoaded?: boolean;
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
  if (input.isDeload) {
    // Im Deload keine schwere Beinlast — wie beim Laufen keine Intensität.
    legsAllowed = false;
    add('Deload-Zyklus — keine schwere Beinlast', 0);
  }
  if (input.legsRecentlyLoaded) {
    legsAllowed = false;
    add('Schwere Beinlast vor weniger als 48 Stunden', -10);
    score -= 10;
  }
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
  /*
   * Die Länge kommt aus der Volumenverteilung, nicht aus dem Katalog — genau wie
   * beim Laufen. Der Katalog gibt nur noch die Grenzen, in denen sie liegen darf.
   */
  const minutes = Math.max(
    entry.minMinutes,
    Math.min(entry.maxMinutes, input.targetMinutes, input.availableMinutes),
  );

  /*
   * Die Stufe setzt die Zielanstrengung, die Erholung darf sie nur senken. Das
   * ist dieselbe Rangfolge wie beim Laufen: die Phase setzt, der Erholungswert
   * stuft ab — nie umgekehrt.
   */
  const fromRecovery = Math.max(5, Math.min(9, Math.round(5 + (score - 40) / 15)));
  const rpe = Math.min(input.stage.targetRpe, fromRecovery);
  const percentOfMax = RPE_TO_PERCENT[rpe];
  const repsInReserve = 10 - rpe;

  const stageNote =
    rpe < input.stage.targetRpe
      ? ` Stufe ${input.stage.id} sähe RPE ${input.stage.targetRpe} vor — die Erholung trägt heute ${rpe}.`
      : ` Stufe ${input.stage.id}, ${input.stage.label}.`;

  const reason =
    kind === 'kraft_ganzkoerper'
      ? `Der Tag trägt schwere Beine: RPE ${rpe}, rund ${percentOfMax} % — ${repsInReserve} Wiederholungen in Reserve.${stageNote}`
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
    blocks: blocksFor(kind, rpe, input.stage),
    reason,
    factors,
  };
}

function blocksFor(kind: StrengthKind, rpe: number, stage: StrengthStage): StrengthBlock[] {
  // Sätze und Wiederholungen kommen aus der Stufe, nicht aus der Tagesform.
  const reps = stage.reps;
  const sets = stage.sets;

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
