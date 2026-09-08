import type { ZoneNumber } from './zones.ts';

/**
 * Die Bahnstufen — von 8×100 m bis 4×4.
 *
 * Intervalle laufen von Anfang an mit, aber nicht sofort in der Form, auf die
 * es hinausläuft. 4×4 ist das Ziel, nicht der Einstieg: die klassischen
 * Bahnmethoden bauen aufeinander auf, weil kurze schnelle Läufe erst die
 * Lauftechnik und die Sehnen vorbereiten, die eine Vier-Minuten-Belastung
 * verlangt.
 *
 * Eine Stufe wird erst verlassen, wenn zwei Zyklen sauber durchlaufen wurden —
 * sauber heißt: die Einheit wurde nicht abgestuft und nicht abgebrochen. Wer
 * eine Stufe überspringt, hat keine Anpassung gewonnen, sondern nur die
 * Rückmeldung verloren.
 */

export type StageId = 'I' | 'II' | 'III' | 'IV' | 'V';

export interface IntervalStage {
  id: StageId;
  index: number;
  label: string;
  reps: number;
  /** Länge einer Wiederholung. Entweder Meter oder Minuten. */
  distanceMeters: number | null;
  workMinutesPerRep: number | null;
  /** Trabpause zwischen den Wiederholungen, in Sekunden. */
  recoverySeconds: number;
  zone: ZoneNumber;
  purpose: string;
  /** Was auf der Bahn zu tun ist, in einem Satz. */
  instruction: string;
}

export const WARMUP_MINUTES = 15;
export const COOLDOWN_MINUTES = 10;
/** Zwei saubere Zyklen, dann die nächste Stufe. */
export const CLEAN_CYCLES_PER_STAGE = 2;

export const STAGE_TABLE: IntervalStage[] = [
  {
    id: 'I',
    index: 0,
    label: '8 × 100 m',
    reps: 8,
    distanceMeters: 100,
    workMinutesPerRep: null,
    recoverySeconds: 90,
    zone: 4,
    purpose: 'Lauftechnik und Schrittfrequenz, bevor die Belastung länger wird',
    instruction: 'Zügig, aber nicht gesprintet. Locker bleiben — die Form entscheidet, nicht die Zeit.',
  },
  {
    id: 'II',
    index: 1,
    label: '8 × 200 m',
    reps: 8,
    distanceMeters: 200,
    workMinutesPerRep: null,
    recoverySeconds: 105,
    zone: 4,
    purpose: 'Erste zusammenhängende Belastung über eine halbe Bahnrunde',
    instruction: 'Gleichmäßig durch. Die letzten beiden sollen so aussehen wie die ersten beiden.',
  },
  {
    id: 'III',
    index: 2,
    label: '6 × 400 m',
    reps: 6,
    distanceMeters: 400,
    workMinutesPerRep: null,
    recoverySeconds: 120,
    zone: 5,
    purpose: 'Die klassische Bahnrunde — hier beginnt der VO2max-Reiz',
    instruction: 'Die erste Runde fühlt sich zu leicht an. Genau so soll sie sich anfühlen.',
  },
  {
    id: 'IV',
    index: 3,
    label: '5 × 800 m',
    reps: 5,
    distanceMeters: 800,
    workMinutesPerRep: null,
    recoverySeconds: 150,
    zone: 5,
    purpose: 'Längere Belastung bei fast gleichem Tempo — die Vorstufe zu 4×4',
    instruction: 'Zwei Runden am Stück. Wenn die vierte Wiederholung einbricht, war die erste zu schnell.',
  },
  {
    id: 'V',
    index: 4,
    label: '4 × 4 Minuten',
    reps: 4,
    distanceMeters: null,
    workMinutesPerRep: 4,
    recoverySeconds: 180,
    zone: 5,
    purpose: 'Die Zielform: vier Minuten hart, drei Minuten traben, viermal',
    instruction:
      'Die letzten zwei Minuten jeder Wiederholung sind der Reiz. Bis dahin steigt die Herzfrequenz nur an.',
  },
];

export function stageByIndex(index: number): IntervalStage {
  return STAGE_TABLE[Math.max(0, Math.min(STAGE_TABLE.length - 1, index))];
}

export interface StageState {
  stage: IntervalStage;
  /** Saubere Zyklen auf dieser Stufe. */
  cleanCycles: number;
  /** Was noch fehlt, bis die nächste Stufe erreicht ist. */
  cyclesToNext: number;
  next: IntervalStage | null;
  reason: string;
}

/**
 * Die Stufe aus der Vorgeschichte.
 *
 * `cleanCycles` ist eine Liste über die Zyklen von hinten nach vorn: `true`,
 * wenn die Intervalleinheit dieses Zyklus ohne Abstufung und ohne Abbruch
 * gelaufen wurde. Ein Zyklus ohne Intervalleinheit ist weder sauber noch
 * unsauber — er zählt einfach nicht mit.
 */
export function stageFor(history: boolean[]): StageState {
  let index = 0;
  let clean = 0;
  for (const wasClean of history) {
    if (!wasClean) {
      // Ein unsauberer Zyklus setzt den Zähler zurück, aber wirft die Stufe
      // nicht weg. Zurückgestuft wird über die Abstufungskette, nicht hier.
      clean = 0;
      continue;
    }
    clean += 1;
    if (clean >= CLEAN_CYCLES_PER_STAGE && index < STAGE_TABLE.length - 1) {
      index += 1;
      clean = 0;
    }
  }

  const stage = STAGE_TABLE[index];
  const next = index < STAGE_TABLE.length - 1 ? STAGE_TABLE[index + 1] : null;
  const cyclesToNext = next ? CLEAN_CYCLES_PER_STAGE - clean : 0;

  const reason = next
    ? clean === 0
      ? `Stufe ${stage.id}: ${stage.label}. Zwei saubere Zyklen führen auf ${next.label}.`
      : `Stufe ${stage.id}: ${stage.label}. Noch ${cyclesToNext} sauberer Zyklus bis ${next.label}.`
    : `Stufe ${stage.id}: ${stage.label}. Die Zielform ist erreicht — hier bleibt es.`;

  return { stage, cleanCycles: clean, cyclesToNext, next, reason };
}

export interface IntervalSession {
  stage: IntervalStage;
  reps: number;
  warmupMinutes: number;
  cooldownMinutes: number;
  /** Reine Belastungsminuten, ohne Pausen. */
  workMinutes: number;
  /** Trabpausen zusammengerechnet. */
  recoveryMinutes: number;
  totalMinutes: number;
  zone: ZoneNumber;
  /** Zeile für Zeile, was auf der Bahn passiert. */
  steps: string[];
}

/** Grobes Tempo für die Umrechnung Meter in Minuten: 4:00 min/km auf der Bahn. */
const TRACK_PACE_MIN_PER_KM = 4;

/**
 * Eine Einheit aus einer Stufe bauen.
 *
 * `repsOverride` ist die verkürzte Fassung: dieselbe Stufe, weniger
 * Wiederholungen. Sie ist die erste Abstufung — die Stufe selbst bleibt, weil
 * eine halbe Einheit auf der richtigen Stufe mehr sagt als eine ganze auf der
 * falschen.
 */
export function buildIntervalSession(stage: IntervalStage, repsOverride?: number): IntervalSession {
  const reps = Math.max(2, repsOverride ?? stage.reps);
  const perRep =
    stage.workMinutesPerRep ??
    ((stage.distanceMeters ?? 0) / 1000) * TRACK_PACE_MIN_PER_KM;
  const workMinutes = Math.round(reps * perRep * 10) / 10;
  const recoveryMinutes = Math.round(((reps - 1) * stage.recoverySeconds) / 60);
  const totalMinutes = Math.round(WARMUP_MINUTES + workMinutes + recoveryMinutes + COOLDOWN_MINUTES);

  const repLabel = stage.distanceMeters
    ? `${stage.distanceMeters} m`
    : `${stage.workMinutesPerRep} Minuten`;

  return {
    stage,
    reps,
    warmupMinutes: WARMUP_MINUTES,
    cooldownMinutes: COOLDOWN_MINUTES,
    workMinutes,
    recoveryMinutes,
    totalMinutes,
    zone: stage.zone,
    steps: [
      `${WARMUP_MINUTES} Minuten einlaufen, Zone 1 bis unteres Zone 2`,
      `${reps} × ${repLabel} in Zone ${stage.zone}`,
      `Dazwischen ${Math.round(stage.recoverySeconds / 15) * 15} Sekunden traben`,
      `${COOLDOWN_MINUTES} Minuten auslaufen`,
    ],
  };
}

/**
 * Ohne Bahn.
 *
 * Die Meterangaben brauchen eine vermessene Runde. Wo keine ist, wird nach Zeit
 * gelaufen — das ist eine Ersatzform derselben Stufe, keine andere Stufe.
 */
export function trackFallback(stage: IntervalStage): string {
  if (!stage.distanceMeters) return 'Nach Zeit gelaufen — keine Bahn nötig.';
  const seconds = Math.round((stage.distanceMeters / 1000) * TRACK_PACE_MIN_PER_KM * 60);
  return `Ohne Bahn: statt ${stage.distanceMeters} m jeweils ${seconds} Sekunden laufen, auf flacher Strecke.`;
}
