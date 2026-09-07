import type { Mode, SessionKind } from './catalogue.ts';
import type { PhaseKey } from './phases.ts';

/**
 * The cycle templates. A macrocycle is two cycles, ten days, eight windows.
 *
 * Six aerobic sessions and two strength sessions per macrocycle, of which one is
 * the intensity session and one the long session. Everything else is base.
 */

export type CycleType = 'A' | 'B';

export interface Slot {
  cycleDay: 1 | 2 | 3 | 4 | 5;
  kind: SessionKind | null;
  /** Null for strength, which has no mode. */
  mode: Mode | null;
  /** Identifies the slot to the volume allocator. */
  id: string;
  /** Relative share of the remaining minutes within its mode. */
  weight: number;
  /**
   * Bounds as a share of the macrocycle's aerobic target rather than as fixed
   * minutes.
   *
   * A 25-minute floor is sensible in P0 and absurd in P3; a 150-minute ceiling
   * is the reverse. Scaling both with the phase target keeps one set of numbers
   * honest across the whole plan, and stops a single session from swallowing a
   * beginner's entire ten-day block.
   */
  minShare: number;
  maxShare: number;
  /** Never shorter than this, whatever the share works out to. */
  floorMinutes: number;
  reason: string;
  /** True for the intensity session, whose duration comes from the stage. */
  fixedByStage?: boolean;
  /** Appended to cycle day 2 in the B cycle. */
  appendix?: 'strides' | null;
}

const REST: Slot = {
  cycleDay: 1,
  kind: null,
  mode: null,
  id: 'rest',
  weight: 0,
  minShare: 0,
  maxShare: 0,
  floorMinutes: 0,
  reason: 'Tagschicht 07:00–19:00 — der Ruhetag des Zyklus',
};

const EASY_RUN = (id: string, appendix: 'strides' | null): Slot => ({
  cycleDay: 2,
  kind: 'easy_z2',
  mode: 'run',
  id,
  weight: 1,
  minShare: 0.06,
  maxShare: 0.12,
  floorMinutes: 20,
  appendix,
  reason:
    'Der Vormittag ist das zirkadiane Leistungstief — Maximalkraft liegt 3–8 % unter dem Tageshoch, ' +
    'ein Z2-Lauf ist davon praktisch unbeeinflusst.',
});

const STRENGTH = (kind: SessionKind, reason: string): Slot => ({
  cycleDay: 3,
  kind,
  mode: null,
  id: 'strength',
  weight: 0,
  minShare: 0,
  maxShare: 0,
  floorMinutes: 40,
  reason,
});

/*
 * Why cycle day 5 is not a run in P0 to P2.
 *
 * The day after the hard or long session carries the highest injury
 * susceptibility of the whole cycle. Bike or rower deliver the aerobic stimulus
 * there at zero impact, and the improved circulation speeds the recovery on top
 * of that. From P2 the B cycle can carry a run there, once the tissue has three
 * blocks of adaptation behind it.
 */
const CROSS = (id: string, kind: SessionKind, weight: number, reason: string): Slot => ({
  cycleDay: 5,
  kind,
  mode: 'bike',
  id,
  weight,
  /*
   * Cross-training carries the widest band on purpose. It is the slot the
   * spilled-over minutes land in, so it has to be able to absorb them — 30 % of
   * a ten-day block is a normal endurance ride, and the bike does not care about
   * the volume the way tendons do.
   */
  minShare: 0.08,
  maxShare: 0.3,
  floorMinutes: 25,
  reason,
});

const INTENSITY: Slot = {
  cycleDay: 4,
  kind: 'vo2_intervals',
  mode: 'run',
  id: 'intensity',
  weight: 0,
  minShare: 0,
  maxShare: 0,
  floorMinutes: 35,
  fixedByStage: true,
  reason: 'Zwei Nächte regulärer Schlaf davor, ganzes Fenster frei — der einzige Maximalreiz des Zyklus',
};

const LONG: Slot = {
  cycleDay: 4,
  kind: 'long_z2',
  mode: 'run',
  id: 'long',
  weight: 3,
  minShare: 0.13,
  maxShare: 0.2,
  floorMinutes: 40,
  reason: 'Die Dauer in Zone 2 ist der Reiz, der die linke Herzkammer vergrößert — nichts ersetzt sie',
};

/** P0 and P1: cycle day 5 is always cross-training. */
const EARLY_A: Slot[] = [
  REST,
  EASY_RUN('easy_a', null),
  STRENGTH('strength_moderate', 'Kraft am Schlaftag: keine Stoßbelastung, moderater Reiz vor dem Schlüsseltag'),
  INTENSITY,
  CROSS('cross_a', 'recovery_z1', 1, 'Der Tag nach der harten Einheit — aerober Reiz bei null Stoßbelastung'),
];

const EARLY_B: Slot[] = [
  REST,
  EASY_RUN('easy_b', 'strides'),
  STRENGTH('strength_moderate', 'Kraft am Schlaftag: keine Stoßbelastung, moderater Reiz vor dem Schlüsseltag'),
  LONG,
  CROSS('cross_b', 'easy_z2', 2, 'Der Tag nach der langen Einheit — Rad oder Rudern statt Stoßbelastung'),
];

/** P2 and P3: the B cycle carries a run on day 5. */
const LATE_A: Slot[] = [
  REST,
  EASY_RUN('easy_a', null),
  STRENGTH('strength_heavy', 'Kraft am Schlaftag — vor dem Schlüsseltag beinfrei oder moderat gehalten'),
  INTENSITY,
  CROSS('cross_a', 'recovery_z1', 1, 'Der Tag nach der Intensitätseinheit — regenerativ, null Stoßbelastung'),
];

const LATE_B: Slot[] = [
  REST,
  EASY_RUN('easy_b', 'strides'),
  STRENGTH('strength_heavy', 'Kraft am Schlaftag — vor dem Schlüsseltag beinfrei oder moderat gehalten'),
  { ...LONG, minShare: 0.15, maxShare: 0.22, floorMinutes: 90 },
  {
    cycleDay: 5,
    kind: 'easy_z2',
    mode: 'run',
    id: 'run_b5',
    weight: 2,
    minShare: 0.07,
    maxShare: 0.14,
    floorMinutes: 30,
    reason: 'Ab P2 trägt der Tag nach der langen Einheit einen lockeren Lauf mittlerer Dauer',
  },
];

export function templateFor(phase: PhaseKey, type: CycleType): Slot[] {
  const early = phase === 'P0' || phase === 'P1';
  if (early) return type === 'A' ? EARLY_A : EARLY_B;
  return type === 'A' ? LATE_A : LATE_B;
}

export const cycleTypeFor = (cycleIndex: number): CycleType => (cycleIndex % 2 === 0 ? 'A' : 'B');
export const macrocycleIndexOf = (cycleIndex: number) => Math.floor(cycleIndex / 2);
export const macrocyclePosition = (cycleIndex: number): 1 | 2 => (cycleIndex % 2 === 0 ? 1 : 2);

/** Deload every fourth cycle. */
export const isDeloadCycle = (cycleIndex: number) => cycleIndex > 0 && (cycleIndex + 1) % 4 === 0;

/**
 * The V-Schicht replaces cycle day 5.
 *
 * It is **not a write-off**: the athlete can run during the shift and shower on
 * site afterwards, so it is a full training window with a length limit. What
 * falls away is only the length, and it is not made up in the next cycle.
 */
export const V_SHIFT_WINDOW = { start: 12 * 60, end: 13 * 60 };
export const V_SHIFT_MIN_MINUTES = 30;
export const V_SHIFT_MAX_MINUTES = 60;
