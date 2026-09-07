import type { BlockSpec } from './phases.ts';

/**
 * Interval progression on the track.
 *
 * The athlete gets a real intensity session **from cycle one**. What climbs in
 * stages is the form of it, not its existence — a plan that postpones intensity
 * for three months postpones the adaptation that only intensity produces.
 *
 * **Why the track and not the road.** Tartan is more compliant than asphalt and
 * evenly flat; both measurably lower the peak load per step. On top of that
 * comes exact distance control, and that matters more than it sounds: the most
 * common beginner mistake in interval training is running the first repetition
 * too fast. On a track that is visible immediately and correctable on the next
 * lap. Together those two things let the running intervals start far earlier
 * than they safely could on the road.
 */

export const STAGES = ['I', 'II', 'III', 'IV', 'V'] as const;
export type StageKey = (typeof STAGES)[number];

export interface StageSpec {
  key: StageKey;
  /** Macrocycle index this stage becomes available at. */
  fromMacrocycle: number;
  label: string;
  /** Repetitions on the track. Null in stage V — the block decides. */
  reps: number | null;
  /** Distance of one repetition in metres. Null in stage V. */
  metres: number | null;
  rest: string;
  /** The neuromuscular appendix to cycle day 2. */
  appendix: { reps: number; seconds: number };
}

export const STAGE_TABLE: Record<StageKey, StageSpec> = {
  I: {
    key: 'I',
    fromMacrocycle: 0,
    label: '8 × 100 m zügig',
    reps: 8,
    metres: 100,
    rest: '100 m gehen',
    appendix: { reps: 4, seconds: 10 },
  },
  II: {
    key: 'II',
    fromMacrocycle: 3,
    label: '8–10 × 200 m',
    reps: 10,
    metres: 200,
    rest: '200 m gehen oder traben',
    appendix: { reps: 6, seconds: 10 },
  },
  III: {
    key: 'III',
    fromMacrocycle: 6,
    label: '6–8 × 400 m',
    reps: 8,
    metres: 400,
    rest: '400 m traben',
    appendix: { reps: 6, seconds: 12 },
  },
  IV: {
    key: 'IV',
    fromMacrocycle: 9,
    label: '5–6 × 800 m',
    reps: 6,
    metres: 800,
    rest: '400 m traben',
    appendix: { reps: 8, seconds: 12 },
  },
  V: {
    key: 'V',
    fromMacrocycle: 18,
    label: 'nach Blockschwerpunkt',
    reps: null,
    metres: null,
    rest: 'nach Vorgabe',
    appendix: { reps: 8, seconds: 12 },
  },
};

/** Warm-up and cool-down, without which the session does not happen at all. */
export const WARMUP_MINUTES = 18;
export const COOLDOWN_MINUTES = 5;

/** A stage change needs two macrocycles on the current stage without a downgrade. */
export const MACROCYCLES_WITHOUT_DOWNGRADE = 2;

export interface StageState {
  stage: StageSpec;
  /** True when the stage was held back rather than advanced. */
  heldBack: boolean;
  reason: string;
}

/**
 * Which stage a macrocycle runs.
 *
 * Calendar weeks alone do not earn a stage change: two macrocycles on the
 * current stage have to have gone through without a downgrade first. A stage
 * reached by the calendar while the body kept saying no is not a stage.
 */
export function stageFor(
  macrocycleIndex: number,
  /** Macrocycles, most recent first, and whether each ran clean. */
  cleanHistory: boolean[],
): StageState {
  let earned: StageSpec = STAGE_TABLE.I;
  for (const key of STAGES) {
    if (macrocycleIndex >= STAGE_TABLE[key].fromMacrocycle) earned = STAGE_TABLE[key];
  }
  if (earned.key === 'I') {
    return { stage: earned, heldBack: false, reason: 'Einstiegsstufe' };
  }

  const recent = cleanHistory.slice(0, MACROCYCLES_WITHOUT_DOWNGRADE);
  const clean = recent.length >= MACROCYCLES_WITHOUT_DOWNGRADE && recent.every(Boolean);
  if (clean) {
    return { stage: earned, heldBack: false, reason: `Stufe ${earned.key} nach zwei sauberen Makrozyklen` };
  }

  const previous = STAGE_TABLE[STAGES[Math.max(0, STAGES.indexOf(earned.key) - 1)]];
  return {
    stage: previous,
    heldBack: true,
    reason: `Stufe ${earned.key} wäre fällig, aber die letzten zwei Makrozyklen liefen nicht ohne Abstufung`,
  };
}

export interface IntervalSession {
  /** Written out for the athlete, e.g. "8 × 400 m, 400 m traben". */
  label: string;
  totalMinutes: number;
  workMinutes: number;
  /** Which lap direction this session runs. */
  direction: 'links' | 'rechts';
  notes: string[];
}

/**
 * Rough pace assumptions used only to turn a distance session into minutes.
 *
 * They are not a prescription — the session is steered by effort, not by these
 * numbers. They exist so the volume allocator knows what the session costs.
 */
const WORK_PACE_MIN_PER_KM = 4.5;
const REST_MINUTES_PER_REP = 1.5;

export function buildIntervalSession(
  stage: StageSpec,
  block: BlockSpec | null,
  /** How many intensity sessions have been done, for the direction alternation. */
  sessionIndex: number,
  phaseKey: string,
): IntervalSession {
  const notes: string[] = [];

  /*
   * Lap direction alternates every session.
   *
   * Running left-hand bends exclusively loads hip, knee and Achilles
   * asymmetrically, because the inside leg works differently from the outside
   * one. Alternating costs nothing and removes the asymmetry.
   */
  const direction: 'links' | 'rechts' = sessionIndex % 2 === 0 ? 'links' : 'rechts';
  notes.push(`Laufrichtung ${direction}herum — nächste Einheit andersherum`);
  notes.push(`Aufwärmen ${WARMUP_MINUTES} min plus Lauf-ABC, danach ${COOLDOWN_MINUTES} min auslaufen`);
  notes.push('Trabpausen auf einer Außenbahn, nicht auf Bahn 1');

  if (stage.key === 'V' && block) {
    const work = block.intervals.reps * block.intervals.minutes;
    const rest = block.intervals.reps * block.intervals.restMinutes;
    return {
      label: block.intensitySession,
      workMinutes: work,
      totalMinutes: WARMUP_MINUTES + work + rest + COOLDOWN_MINUTES,
      direction,
      notes,
    };
  }

  const reps = stage.reps ?? 8;
  const metres = stage.metres ?? 400;
  const work = Math.round(((reps * metres) / 1000) * WORK_PACE_MIN_PER_KM);
  const rest = Math.round(reps * REST_MINUTES_PER_REP);

  if (phaseKey === 'P0' || phaseKey === 'P1') {
    /*
     * The short distances tempt an untrained tendon structure into a sprint,
     * which is where the injuries in a first interval block come from. "Zügig"
     * is a seven out of ten, and the target is an even set — not a fast first
     * repetition.
     */
    notes.push('Zügig heißt 7 von 10, kein Sprint — die letzte Wiederholung darf nicht langsamer sein als die erste');
    notes.push('Keine Spikes vor Phase P2');
  }

  return {
    label: `${reps} × ${metres} m, ${stage.rest}`,
    workMinutes: work,
    totalMinutes: WARMUP_MINUTES + work + rest + COOLDOWN_MINUTES,
    direction,
    notes,
  };
}

/** Warns when the set fell apart, and blocks the next stage change. */
export const PACE_FADE_LIMIT = 0.05;

export function paceFade(firstSeconds: number, lastSeconds: number): { fade: number; warn: boolean } {
  if (firstSeconds <= 0) return { fade: 0, warn: false };
  const fade = (lastSeconds - firstSeconds) / firstSeconds;
  return { fade: Math.round(fade * 1000) / 1000, warn: fade > PACE_FADE_LIMIT };
}

/**
 * Where to run the session when no track is available.
 *
 * The order matters: a measured flat trail keeps both the surface and the
 * distance control, cross-training keeps the interval structure by time and
 * drops the impact entirely, and the road keeps neither. It is last for a
 * reason.
 */
export const TRACK_FALLBACK = [
  { key: 'trail', label: 'Ebener Feldweg mit markierten Abschnitten', keeps: 'Untergrund und Distanzkontrolle' },
  { key: 'cross', label: 'Rad oder Rudergerät, gleiche Struktur nach Zeit', keeps: 'Struktur, keine Stoßbelastung' },
  { key: 'road', label: 'Straße', keeps: 'nur die Distanz — letzte Wahl' },
] as const;
