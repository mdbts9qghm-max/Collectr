import type { SessionKind, SessionSpec } from './types.ts';

/**
 * The seven sessions the planner may place, with the load they cost and the
 * recovery value a day must reach before they are allowed.
 *
 * The downgrade chains matter as much as the numbers: when a rule blocks a
 * session, the planner weakens it instead of deleting it, because keeping the
 * frequency is worth more in hybrid training than any single hard session.
 */
export const CATALOGUE: Record<SessionKind, SessionSpec> = {
  intense_run: {
    kind: 'intense_run',
    label: 'Intensiver Lauf',
    description: 'Intervalle oder Tempo, Zone 4–5',
    load: 80,
    minRecovery: 85,
    discipline: 'run',
    loadsLegs: true,
    defaultMinutes: 55,
    minMinutes: 40,
    maxMinutes: 70,
    downgradeTo: 'long_run',
  },
  heavy_strength: {
    kind: 'heavy_strength',
    label: 'Schwere Kraft',
    description: 'Grundübungen 3–6 Wdh, RPE 8',
    load: 70,
    minRecovery: 70,
    discipline: 'strength',
    loadsLegs: true,
    defaultMinutes: 60,
    minMinutes: 45,
    maxMinutes: 80,
    downgradeTo: 'moderate_strength',
  },
  long_run: {
    kind: 'long_run',
    label: 'Langer Lauf',
    description: 'Zone 2, 75–120 min',
    load: 60,
    minRecovery: 75,
    discipline: 'run',
    loadsLegs: true,
    defaultMinutes: 90,
    minMinutes: 75,
    maxMinutes: 120,
    downgradeTo: 'easy_run',
  },
  moderate_strength: {
    kind: 'moderate_strength',
    label: 'Moderate Kraft',
    description: 'Ganzkörper 6–12 Wdh, RPE 7',
    load: 45,
    minRecovery: 55,
    discipline: 'strength',
    loadsLegs: true,
    defaultMinutes: 50,
    minMinutes: 40,
    maxMinutes: 65,
    downgradeTo: 'upper_strength',
  },
  upper_strength: {
    kind: 'upper_strength',
    label: 'Oberkörperkraft',
    description: 'beinfrei',
    load: 30,
    minRecovery: 45,
    discipline: 'strength',
    loadsLegs: false,
    defaultMinutes: 40,
    minMinutes: 30,
    maxMinutes: 55,
    downgradeTo: 'regeneration',
  },
  easy_run: {
    kind: 'easy_run',
    label: 'Lockerer Lauf',
    description: 'Zone 2, 30–50 min',
    load: 25,
    minRecovery: 40,
    discipline: 'run',
    loadsLegs: true,
    defaultMinutes: 40,
    minMinutes: 30,
    maxMinutes: 50,
    downgradeTo: 'regeneration',
  },
  regeneration: {
    kind: 'regeneration',
    label: 'Regeneration',
    description: 'Mobility oder Spaziergang, höchstens 20 min',
    load: 5,
    minRecovery: 0,
    discipline: 'other',
    loadsLegs: false,
    defaultMinutes: 20,
    minMinutes: 10,
    maxMinutes: 20,
    downgradeTo: null,
  },
};

/** Every session, heaviest first — the order options are offered in. */
export const SESSION_ORDER: SessionKind[] = (Object.keys(CATALOGUE) as SessionKind[]).sort(
  (a, b) => CATALOGUE[b].load - CATALOGUE[a].load,
);

/** A session counts as hard from 60 load points upward. */
export const HARD_LOAD_THRESHOLD = 60;

export function isHard(kind: SessionKind): boolean {
  return CATALOGUE[kind].load >= HARD_LOAD_THRESHOLD;
}

/** Walks the downgrade chain until a session passes `accept`, or gives up. */
export function downgradeUntil(
  kind: SessionKind,
  accept: (candidate: SessionKind) => boolean,
): SessionKind | null {
  let current: SessionKind | null = kind;
  const seen = new Set<SessionKind>();
  while (current && !seen.has(current)) {
    if (accept(current)) return current;
    seen.add(current);
    current = CATALOGUE[current].downgradeTo;
  }
  return null;
}

/**
 * The rolling seven-day target from section 9: three runs — one intense, one
 * long, one easy — plus three strength sessions, two full-body and one upper.
 */
export const WINDOW_TARGET: { kind: SessionKind; count: number }[] = [
  { kind: 'intense_run', count: 1 },
  { kind: 'long_run', count: 1 },
  { kind: 'easy_run', count: 1 },
  { kind: 'heavy_strength', count: 1 },
  { kind: 'moderate_strength', count: 1 },
  { kind: 'upper_strength', count: 1 },
];

/** Full-body strength, as opposed to the leg-free upper session. */
export function isFullBodyStrength(kind: SessionKind): boolean {
  return kind === 'heavy_strength' || kind === 'moderate_strength';
}

/**
 * The catalogue's load figures and the sRPE model in load.ts measure the same
 * thing on two scales. Comparing them on the sessions the catalogue itself
 * describes fixes the ratio:
 *
 *   45 min easy run      25 vs. 35 sRPE   0.71
 *   60 min intense run   80 vs. 120       0.67
 *   90 min long run      60 vs.  70       0.86
 *   60 min heavy lifting 70 vs. 100       0.70
 *
 * One constant of 0.7 is close enough for every one of them, and a single
 * number is worth more here than a per-sport table nobody can check.
 */
export const SRPE_TO_CYCLE_LOAD = 0.7;

/** Converts a completed session's sRPE load onto the catalogue's scale. */
export function cycleLoadFromSrpe(srpeLoad: number): number {
  return Math.round(srpeLoad * SRPE_TO_CYCLE_LOAD);
}
