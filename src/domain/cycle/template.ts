import type { CycleDayNumber, SessionKind } from './types.ts';

/**
 * The fixed cycle template — the central design decision.
 *
 * Earlier versions scored every day on its own and then optimised the result.
 * That is the wrong shape for this problem, for three reasons:
 *
 * 1. The rotation is **completely predictable**. An optimiser would produce
 *    different plans from the same starting position — bad for training
 *    consistency, and bad for comparing one cycle against the next.
 * 2. Adaptation comes from **repeated, alike stimuli**, not from a sequence of
 *    locally optimal one-off decisions.
 * 3. So: a fixed template that rotates across a macrocycle. The recovery value
 *    is used only as a **downgrade filter**, never as a planning input.
 *
 * ## The capacity the rotation actually has
 *
 * Four usable windows per five-day cycle is 5.6 sessions per seven days. The
 * often-quoted 3 + 3 = 6 sessions per week is therefore **not reachable on this
 * rotation without forced doubles** — and forced doubles cost quality in both
 * sessions while raising interference. So the target is restated rather than
 * forced:
 *
 *   **8 sessions per macrocycle (2 cycles = 10 days): 4 runs + 4 strength**
 *   = 2.8 runs and 2.8 strength sessions per week
 *
 * which is 3 + 3 in practice, without overstretching the rotation.
 */

export type CycleType = 'A' | 'B';

export interface TemplateEntry {
  cycleDay: CycleDayNumber;
  kind: SessionKind | null;
  /** Why this session sits on this day. Shown verbatim in the UI. */
  reason: string;
}

/*
 * Why each session sits where it does.
 *
 * **Day 2 — easy run, never strength.** The morning is the circadian
 * performance trough: core temperature at its minimum, maximal strength
 * typically 3–8 % below the daily peak, joint stiffness raised. Heavy lifting
 * there is inefficient and riskier. A zone-2 run is practically unaffected by
 * it. The strides keep neuromuscular quality alive at minimal systemic cost —
 * they do not replace the intensive session. Warm-up is extended by half.
 *
 * **Day 3 — upper body only, no running.** After six hours of day sleep and
 * roughly 24 hours of prior wakefulness, neuromuscular control is reduced.
 * Impact loading from running is the single largest injury risk in the cycle
 * here. Upper-body strength has low systemic cost and **zero impact**. Strictly
 * leg-free, because the key run follows the next day.
 *
 * **Day 4 — the key run.** Two nights of regular sleep behind it and the whole
 * window free. The only day in the cycle that carries a maximal stimulus.
 *
 * **Day 5 — heavy strength.** Hard run → heavy leg work is the correct order.
 * The other way round, the leg session would damage the next day's run quality.
 * That is why heavy strength never moves onto day 4.
 *
 * **Day 1 — rest.** The day shift satisfies the rest-day requirement by itself.
 * No substitute session, no early-morning workaround.
 */

const SHARED: TemplateEntry[] = [
  {
    cycleDay: 1,
    kind: null,
    reason: 'Tagschicht 07:00–19:00 — der Ruhetag des Zyklus, kein Ersatztraining',
  },
  {
    cycleDay: 2,
    kind: 'easy_run',
    reason:
      'Vormittag ist das zirkadiane Leistungstief: Maximalkraft 3–8 % unter dem Tageshoch, ' +
      'ein Z2-Lauf ist davon unbeeinflusst. Steigerungen erhalten die Schnelligkeit.',
  },
  {
    cycleDay: 3,
    kind: 'upper_strength',
    reason:
      'Nach 6 h Tagschlaf ist die neuromuskuläre Kontrolle reduziert — Stoßbelastung wäre hier ' +
      'das größte Verletzungsrisiko. Strikt beinfrei, weil morgen der Schlüssellauf steht.',
  },
];

const DAY_5: TemplateEntry = {
  cycleDay: 5,
  kind: 'heavy_strength',
  reason:
    'Harter Lauf → schwere Beinkraft ist die richtige Reihenfolge. Umgekehrt würde die ' +
    'Beinkraft die Laufqualität am Folgetag beschädigen.',
};

export const CYCLE_A: TemplateEntry[] = [
  ...SHARED,
  {
    cycleDay: 4,
    kind: 'intense_run',
    reason: 'Zwei Nächte regulärer Schlaf davor, ganzes Fenster frei — der einzige Maximalreiz des Zyklus',
  },
  DAY_5,
];

export const CYCLE_B: TemplateEntry[] = [
  ...SHARED,
  {
    cycleDay: 4,
    kind: 'long_run',
    reason: 'Zwei Nächte regulärer Schlaf davor, ganzes Fenster frei — der einzige Maximalreiz des Zyklus',
  },
  DAY_5,
];

export function templateFor(type: CycleType): TemplateEntry[] {
  return type === 'A' ? CYCLE_A : CYCLE_B;
}

/** A and B alternate; the macrocycle is one A plus one B. */
export function cycleTypeFor(cycleIndex: number): CycleType {
  return cycleIndex % 2 === 0 ? 'A' : 'B';
}

/** Position inside the macrocycle: 1 for the A cycle, 2 for the B cycle. */
export function macrocyclePosition(cycleIndex: number): 1 | 2 {
  return cycleIndex % 2 === 0 ? 1 : 2;
}

/** Which macrocycle a cycle belongs to, counted from the start of tracking. */
export function macrocycleIndex(cycleIndex: number): number {
  return Math.floor(cycleIndex / 2);
}

/**
 * Deload every fourth cycle (20 days): total load −40 %, the intensive run
 * drops out, heavy strength becomes moderate, volumes are halved.
 */
export const DELOAD_EVERY_CYCLES = 4;

export function isDeloadCycle(cycleIndex: number): boolean {
  return cycleIndex > 0 && (cycleIndex + 1) % DELOAD_EVERY_CYCLES === 0;
}

/** The deload substitutions from section 6. */
export function deloadKind(kind: SessionKind | null): SessionKind | null {
  if (kind === 'intense_run') return null;
  if (kind === 'heavy_strength') return 'moderate_strength';
  return kind;
}

/** Volumes are halved in a deload cycle. */
export const DELOAD_DURATION_FACTOR = 0.5;

/** Load may grow by at most 8 % per macrocycle. */
export const MAX_MACROCYCLE_GROWTH = 1.08;
