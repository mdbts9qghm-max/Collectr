import type { Mode } from './catalogue.ts';

/**
 * How the macrocycle's aerobic minutes get distributed — and where the
 * difference goes when running cannot keep up.
 *
 * **This is the structural heart of the plan.** Aerobic minutes may grow by up
 * to 10 % per macrocycle; running minutes only by 8 %, because tendon, bone and
 * connective tissue adapt more slowly than the cardiovascular system does. The
 * naive response would be to cut the aerobic target down to what running
 * allows. This plan does the opposite: **the target stands, and the difference
 * lands on the bike or the rower.**
 *
 * The heart cannot tell which muscles are moving. Stroke volume, plasma volume
 * and mitochondrial density respond to duration at a moderate intensity, not to
 * the impact of a footstrike. So a running progression limit is not a limit on
 * the heart — it is a question of distribution.
 */

export const MAX_AEROBIC_GROWTH = 0.1;
export const MAX_RUN_GROWTH = 0.08;
/** In P0 a single run session may not grow by more than this. */
export const P0_RUN_SESSION_GROWTH_MINUTES = 10;
/** The long session grows by at most this much per step. */
export const LONG_SESSION_GROWTH_MINUTES = 10;
/** Zone 1 and 2 must hold at least this share of the aerobic volume. */
export const MIN_BASE_SHARE = 0.8;

export interface VolumeInput {
  /** What the phase model asks for this macrocycle. */
  targetAerobicMinutes: number;
  targetRunShare: number;
  /** What the previous macrocycle actually carried, or null at the start. */
  previousAerobicMinutes: number | null;
  previousRunMinutes: number | null;
  /** True in P0, where a single run session is additionally capped. */
  isP0: boolean;
  /** Number of run sessions the template puts in this macrocycle. */
  runSessionCount: number;
  /** True when the interval stage changes — volume then holds still. */
  stageChange: boolean;
  /** True in a deload macrocycle. */
  isDeload: boolean;
}

export interface VolumePlan {
  aerobicMinutes: number;
  runMinutes: number;
  crossMinutes: number;
  /** Minutes that wanted to be run but landed on the bike or rower instead. */
  spilledToCross: number;
  notes: string[];
}

export const DELOAD_VOLUME_FACTOR = 0.6;

export function planVolume(input: VolumeInput): VolumePlan {
  const notes: string[] = [];

  let aerobic = input.targetAerobicMinutes;

  /*
   * A macrocycle that changes interval stage holds its volume still. Two new
   * stresses at once is how a plan produces an injury instead of an adaptation.
   */
  if (input.stageChange && input.previousAerobicMinutes) {
    aerobic = input.previousAerobicMinutes;
    notes.push('Stufenwechsel der Intervalle — das aerobe Volumen bleibt unverändert');
  }

  // Aerobic growth ceiling.
  if (input.previousAerobicMinutes) {
    // Floor, not round: a ceiling that rounding can push past is not a ceiling.
    const ceiling = Math.floor(input.previousAerobicMinutes * (1 + MAX_AEROBIC_GROWTH));
    if (aerobic > ceiling) {
      notes.push(
        `Aerobes Ziel ${input.targetAerobicMinutes} min auf ${ceiling} min gedeckelt — höchstens 10 % pro Makrozyklus`,
      );
      aerobic = ceiling;
    }
  }

  if (input.isDeload) {
    aerobic = Math.round(aerobic * DELOAD_VOLUME_FACTOR);
    notes.push('Deload-Zyklus — Gesamtvolumen 40 % niedriger, keine Intensitätseinheit');
  }

  // What the run share asks for, before the running limits are applied.
  const wantedRun = Math.round(aerobic * input.targetRunShare);
  let run = wantedRun;

  if (input.previousRunMinutes) {
    const ceiling = Math.floor(input.previousRunMinutes * (1 + MAX_RUN_GROWTH));
    if (run > ceiling) {
      notes.push(
        `Laufminuten von ${wantedRun} auf ${ceiling} begrenzt — höchstens 8 % pro Makrozyklus`,
      );
      run = ceiling;
    }

    if (input.isP0 && input.runSessionCount > 0) {
      const perSessionCeiling =
        input.previousRunMinutes + P0_RUN_SESSION_GROWTH_MINUTES * input.runSessionCount;
      if (run > perSessionCeiling) {
        notes.push(
          `In P0 zusätzlich auf +${P0_RUN_SESSION_GROWTH_MINUTES} min je Laufeinheit gedeckelt`,
        );
        run = perSessionCeiling;
      }
    }
  }

  const spilled = Math.max(0, wantedRun - run);
  const cross = aerobic - run;

  if (spilled > 0) {
    notes.push(
      `${spilled} min, die das Laufen nicht hergibt, laufen auf Rad oder Rudergerät weiter — ` +
        'das aerobe Ziel wird nicht gekürzt',
    );
  }

  return { aerobicMinutes: aerobic, runMinutes: run, crossMinutes: cross, spilledToCross: spilled, notes };
}

/* ------------------------------------------------------------------ *
 * Distribution across the sessions of the macrocycle
 * ------------------------------------------------------------------ */

export interface SlotRequest {
  /** Identifies the slot back to the caller. */
  id: string;
  mode: Mode;
  /** Fixed sessions — the intensity session — bring their own duration. */
  fixedMinutes?: number;
  /** Relative share of what is left, among slots of the same mode. */
  weight: number;
  /** Never planned shorter than this. */
  minMinutes: number;
  maxMinutes: number;
}

export interface SlotResult {
  id: string;
  mode: Mode;
  minutes: number;
}

/**
 * Hands each slot its minutes.
 *
 * Deterministic on purpose, like everything else here: fixed sessions first,
 * then the remainder split by weight within each mode, then clamped and the
 * rounding error pushed onto the largest slot so the totals actually add up.
 */
export function distribute(
  slots: SlotRequest[],
  runMinutes: number,
  crossMinutes: number,
): { slots: SlotResult[]; unplacedMinutes: number } {
  const results = new Map<string, number>();
  let unplaced = 0;

  for (const pool of [
    { mode: 'run' as const, budget: runMinutes },
    { mode: 'cross' as const, budget: crossMinutes },
  ]) {
    const inPool = slots.filter((s) => (pool.mode === 'run' ? s.mode === 'run' : s.mode !== 'run'));
    if (inPool.length === 0) continue;

    const fixed = inPool.filter((s) => s.fixedMinutes != null);
    const flexible = inPool.filter((s) => s.fixedMinutes == null);
    for (const slot of fixed) results.set(slot.id, slot.fixedMinutes!);

    let remaining = pool.budget - fixed.reduce((sum, s) => sum + s.fixedMinutes!, 0);
    if (flexible.length === 0) continue;
    remaining = Math.max(0, remaining);

    const totalWeight = flexible.reduce((sum, s) => sum + s.weight, 0) || 1;
    let assigned = 0;
    for (const slot of flexible) {
      const share = Math.round((remaining * slot.weight) / totalWeight);
      const clamped = Math.max(slot.minMinutes, Math.min(slot.maxMinutes, share));
      results.set(slot.id, clamped);
      assigned += clamped;
    }

    /*
     * Spread the rounding and clamping error across the slots that still have
     * headroom, largest first, until it is gone or nothing can take it.
     *
     * What is left over after that is reported rather than swallowed: a plan
     * that quietly delivers less than its target is worse than one that says it
     * could not place the last twenty minutes.
     */
    let drift = remaining - assigned;
    const byHeadroom = flexible.slice().sort((a, b) => b.maxMinutes - a.maxMinutes);
    for (const slot of byHeadroom) {
      if (drift === 0) break;
      const current = results.get(slot.id)!;
      const room = drift > 0 ? slot.maxMinutes - current : slot.minMinutes - current;
      const take = drift > 0 ? Math.min(drift, room) : Math.max(drift, room);
      if (take === 0) continue;
      results.set(slot.id, current + take);
      drift -= take;
    }
    if (drift !== 0) unplaced += drift;
  }

  return {
    slots: slots.map((slot) => ({
      id: slot.id,
      mode: slot.mode,
      minutes: results.get(slot.id) ?? slot.minMinutes,
    })),
    unplacedMinutes: unplaced,
  };
}

/**
 * The share of aerobic minutes spent in zone 1 or 2.
 *
 * Section 10 puts this rule above every other volume goal, so it is computed
 * over the whole macrocycle rather than per session: one hard session does not
 * break it, a drift in the base volume does.
 */
export function baseShare(entries: { minutes: number; isBase: boolean }[]): number {
  const total = entries.reduce((sum, e) => sum + e.minutes, 0);
  if (total <= 0) return 1;
  const base = entries.filter((e) => e.isBase).reduce((sum, e) => sum + e.minutes, 0);
  return Math.round((base / total) * 100) / 100;
}
