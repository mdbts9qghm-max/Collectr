/**
 * The phase model — and the reason it has no end.
 *
 * The athlete is not training for a race. The goal is a durably capable
 * cardiovascular system; being able to run 100 km is a welcome by-product, not
 * the planning purpose. So there is no target date and no taper: after phase P2
 * the plan rotates through blocks indefinitely.
 *
 * **The run share is the lever.** Aerobic minutes climb briskly from the start,
 * because the non-running part may grow as fast as it likes. Running minutes
 * climb slowly, bounded by tendon and bone adaptation. The heart is not held
 * back by that limit — the difference simply lands on the bike or the rower.
 */

export const PHASES = ['P0', 'P1', 'P2', 'P3'] as const;
export type PhaseKey = (typeof PHASES)[number];

export interface PhaseSpec {
  key: PhaseKey;
  label: string;
  focus: string;
  /** Macrocycle index this phase begins at, counted from the very first. */
  fromMacrocycle: number;
  /** Aerobic minutes per macrocycle at the start and end of the phase. */
  aerobicFrom: number;
  aerobicTo: number;
  /** Share of those minutes spent running. */
  runShareFrom: number;
  runShareTo: number;
}

/*
 * Macrocycles rather than weeks, because the rotation is five days long and
 * walks through the calendar. Eight weeks is 56 days is roughly 5.6
 * macrocycles, so P0 runs for 6; months 3–6 is another 12; months 7–10 another
 * 12; from there it never ends.
 */
export const PHASE_TABLE: PhaseSpec[] = [
  {
    key: 'P0',
    label: 'Einstieg',
    focus: 'Laufgewöhnung, aerober Einstieg',
    fromMacrocycle: 0,
    aerobicFrom: 300,
    aerobicTo: 420,
    runShareFrom: 0.4,
    runShareTo: 0.4,
  },
  {
    key: 'P1',
    label: 'Volumen',
    focus: 'Grundlagenvolumen aufbauen',
    fromMacrocycle: 6,
    aerobicFrom: 420,
    aerobicTo: 600,
    runShareFrom: 0.5,
    runShareTo: 0.5,
  },
  {
    key: 'P2',
    label: 'Kapazität',
    focus: 'VO2max und Schwelle entwickeln',
    fromMacrocycle: 18,
    aerobicFrom: 600,
    aerobicTo: 750,
    runShareFrom: 0.6,
    runShareTo: 0.6,
  },
  {
    key: 'P3',
    label: 'Dauerbetrieb',
    focus: 'rotierende Blöcke, unbefristet',
    fromMacrocycle: 30,
    aerobicFrom: 700,
    aerobicTo: 850,
    runShareFrom: 0.6,
    runShareTo: 0.75,
  },
];

export function phaseFor(macrocycleIndex: number): PhaseSpec {
  let current = PHASE_TABLE[0];
  for (const phase of PHASE_TABLE) {
    if (macrocycleIndex >= phase.fromMacrocycle) current = phase;
  }
  return current;
}

/** How far through its phase a macrocycle sits, 0 to 1. */
function phaseProgress(macrocycleIndex: number, phase: PhaseSpec): number {
  const next = PHASE_TABLE[PHASE_TABLE.indexOf(phase) + 1];
  if (!next) {
    // P3 never ends, so it oscillates across its band rather than climbing out
    // of it: six macrocycles up, then back to the floor. Endless linear growth
    // is not a plan, it is a countdown to injury.
    const span = 6;
    const position = (macrocycleIndex - phase.fromMacrocycle) % span;
    return position / (span - 1);
  }
  const span = next.fromMacrocycle - phase.fromMacrocycle;
  return span <= 1 ? 0 : Math.min(1, (macrocycleIndex - phase.fromMacrocycle) / (span - 1));
}

export interface PhaseTarget {
  phase: PhaseSpec;
  macrocycleIndex: number;
  /** Aerobic minutes this macrocycle is aiming at, before any deload. */
  aerobicMinutes: number;
  /** Share of them that should be running. */
  runShare: number;
}

export function targetFor(macrocycleIndex: number): PhaseTarget {
  const phase = phaseFor(macrocycleIndex);
  const t = phaseProgress(macrocycleIndex, phase);
  return {
    phase,
    macrocycleIndex,
    aerobicMinutes: Math.round(phase.aerobicFrom + (phase.aerobicTo - phase.aerobicFrom) * t),
    runShare: Math.round((phase.runShareFrom + (phase.runShareTo - phase.runShareFrom) * t) * 100) / 100,
  };
}

/* ------------------------------------------------------------------ *
 * The endless block rotation from P3
 * ------------------------------------------------------------------ */

export const BLOCKS = ['volume', 'vo2max', 'threshold'] as const;
export type BlockKey = (typeof BLOCKS)[number];

export interface BlockSpec {
  key: BlockKey;
  label: string;
  emphasis: string;
  /** The intensity session on cycle day 4, written out. */
  intensitySession: string;
  /** Work intervals: how many, how long, and the zone. */
  intervals: { reps: number; minutes: number; zone: 'z4' | 'z5'; restMinutes: number };
}

export const BLOCK_TABLE: Record<BlockKey, BlockSpec> = {
  volume: {
    key: 'volume',
    label: 'Volumenblock',
    emphasis: 'Aerobe Minuten +10 %, Intensität konstant',
    intensitySession: '2 × 12 min Zone 4',
    intervals: { reps: 2, minutes: 12, zone: 'z4', restMinutes: 3 },
  },
  vo2max: {
    key: 'vo2max',
    label: 'VO2max-Block',
    emphasis: 'Volumen konstant, Intensität hoch',
    intensitySession: '4 × 4 min Zone 5, 3 min Trabpause',
    intervals: { reps: 4, minutes: 4, zone: 'z5', restMinutes: 3 },
  },
  threshold: {
    key: 'threshold',
    label: 'Schwellenblock',
    emphasis: 'Volumen konstant, Schwellenanteil hoch',
    intensitySession: '3 × 10 min Zone 4, 3 min Pause',
    intervals: { reps: 3, minutes: 10, zone: 'z4', restMinutes: 3 },
  },
};

/** A block runs three macrocycles, then one deload cycle. */
export const MACROCYCLES_PER_BLOCK = 3;

export function blockFor(macrocycleIndex: number): BlockSpec | null {
  const p3 = PHASE_TABLE[PHASE_TABLE.length - 1];
  if (macrocycleIndex < p3.fromMacrocycle) return null;
  const since = macrocycleIndex - p3.fromMacrocycle;
  return BLOCK_TABLE[BLOCKS[Math.floor(since / MACROCYCLES_PER_BLOCK) % BLOCKS.length]];
}
