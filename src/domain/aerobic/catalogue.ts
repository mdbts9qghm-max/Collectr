import type { Zone } from './zones.ts';

/**
 * What a session is, and what it costs.
 *
 * The load numbers and the recovery minimums are the ones from section 9. The
 * modes matter as much as the kinds: this plan's whole point is that the aerobic
 * stimulus does not have to come from running.
 */

export const MODES = ['run', 'bike', 'row'] as const;
export type Mode = (typeof MODES)[number];

export const MODE_META: Record<Mode, { label: string; icon: string; impact: boolean }> = {
  run: { label: 'Laufen', icon: '🏃', impact: true },
  bike: { label: 'Rad', icon: '🚴', impact: false },
  row: { label: 'Rudern', icon: '🚣', impact: false },
};

export const SESSION_KINDS = [
  'vo2_intervals',
  'threshold',
  'long_z2',
  'easy_z2',
  'recovery_z1',
  'strength_heavy',
  'strength_moderate',
  'strength_legfree',
  'regeneration',
] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export type Discipline = 'aerobic' | 'strength';

export interface SessionSpec {
  kind: SessionKind;
  label: string;
  description: string;
  /** Load points, from the table in section 9. */
  load: number;
  /** The day's recovery value must reach this. */
  minRecovery: number;
  discipline: Discipline;
  /** Which zone the session is meant to sit in. */
  zone: Zone;
  /** True when the session loads the legs enough to matter before a run. */
  loadsLegs: boolean;
  /** Modes this session can be done in. Strength has none. */
  modes: Mode[];
}

export const CATALOGUE: Record<SessionKind, SessionSpec> = {
  vo2_intervals: {
    kind: 'vo2_intervals',
    label: 'Intensitätseinheit',
    description: 'Intervalle nahe 90–95 % der maximalen Herzfrequenz',
    load: 85,
    minRecovery: 85,
    discipline: 'aerobic',
    zone: 'z5',
    loadsLegs: true,
    modes: ['run', 'bike', 'row'],
  },
  threshold: {
    kind: 'threshold',
    label: 'Schwelleneinheit',
    description: 'Zone 4, 20–40 min im Schwellenbereich',
    load: 75,
    minRecovery: 80,
    discipline: 'aerobic',
    zone: 'z4',
    loadsLegs: true,
    modes: ['run', 'bike', 'row'],
  },
  long_z2: {
    kind: 'long_z2',
    label: 'Lange Einheit',
    description: 'Zone 2 — der Reiz, der die linke Herzkammer vergrößert',
    load: 60,
    minRecovery: 70,
    discipline: 'aerobic',
    zone: 'z2',
    loadsLegs: true,
    modes: ['run', 'bike', 'row'],
  },
  easy_z2: {
    kind: 'easy_z2',
    label: 'Lockere Einheit',
    description: 'Zone 2 — ein vollständiger Satz bleibt sprechbar',
    load: 30,
    minRecovery: 40,
    discipline: 'aerobic',
    zone: 'z2',
    loadsLegs: true,
    modes: ['run', 'bike', 'row'],
  },
  recovery_z1: {
    kind: 'recovery_z1',
    label: 'Regeneratives Fahren',
    description: 'Zone 1 — Durchblutung ohne nennenswerte Last',
    load: 25,
    minRecovery: 35,
    discipline: 'aerobic',
    zone: 'z1',
    loadsLegs: false,
    modes: ['bike', 'row'],
  },
  strength_heavy: {
    kind: 'strength_heavy',
    label: 'Kraft schwer',
    description: 'Grundübungen, Maximalkraftbereich',
    load: 70,
    minRecovery: 70,
    discipline: 'strength',
    zone: 'z3',
    loadsLegs: true,
    modes: [],
  },
  strength_moderate: {
    kind: 'strength_moderate',
    label: 'Kraft moderat',
    description: 'Ganzkörper, moderates Niveau',
    load: 45,
    minRecovery: 55,
    discipline: 'strength',
    zone: 'z3',
    loadsLegs: true,
    modes: [],
  },
  strength_legfree: {
    kind: 'strength_legfree',
    label: 'Kraft beinfrei',
    description: 'Oberkörper und Rumpf, keine Beinbelastung',
    load: 30,
    minRecovery: 45,
    discipline: 'strength',
    zone: 'z2',
    loadsLegs: false,
    modes: [],
  },
  regeneration: {
    kind: 'regeneration',
    label: 'Regeneration',
    description: 'Mobility oder Spaziergang',
    load: 5,
    minRecovery: 0,
    discipline: 'aerobic',
    zone: 'z1',
    loadsLegs: false,
    modes: ['bike', 'row'],
  },
};

/** A session is hard from 60 load points upward. */
export const HARD_LOAD_THRESHOLD = 60;
export const isHard = (kind: SessionKind) => CATALOGUE[kind].load >= HARD_LOAD_THRESHOLD;

/* ------------------------------------------------------------------ *
 * Downgrade chains
 * ------------------------------------------------------------------ */

export interface Step {
  kind: SessionKind;
  mode: Mode | null;
  /** Applied to the session's planned duration at this step. */
  durationFactor: number;
  /** Shown to the athlete as the reason for this step. */
  why: string;
}

/**
 * How much a switch away from running lowers the recovery requirement.
 *
 * The minimum recovery values guard against doing a session the body cannot
 * absorb, and on a running session most of what it is guarding against is the
 * impact — thousands of footstrikes on tissue that is not ready for them. Take
 * the impact away and the same aerobic work is markedly easier to absorb, so the
 * bar drops with it.
 *
 * Twenty points is what makes the mode switch actually reachable rather than
 * decorative: a VO2 session needs 85, and at 65 the bike version has to be a
 * real option, or the chain would skip straight past it to an easy spin and
 * throw the whole stimulus away. That is the case section 15 names explicitly.
 */
export const CROSS_MODE_RECOVERY_RELIEF = 20;

/** What a step actually demands of the day, after the mode relief. */
export function minRecoveryFor(step: Step, originalMode: Mode | null): number {
  const base = CATALOGUE[step.kind].minRecovery;
  const wasRun = originalMode === 'run';
  const nowCross = step.mode === 'bike' || step.mode === 'row';
  return wasRun && nowCross ? Math.max(0, base - CROSS_MODE_RECOVERY_RELIEF) : base;
}

/**
 * **The first downgrade step is a change of mode, never a cut in intensity.**
 *
 * This is the core of the whole plan. On a middling morning with intact
 * motivation, the same session on the bike is the better answer than a watered
 * down run: the aerobic stimulus survives in full — the heart cannot tell which
 * muscles are moving — and only the orthopaedic load disappears. Cutting the
 * intensity instead throws away the stimulus and keeps the impact, which is
 * exactly the wrong trade.
 *
 * Only once the mode has already been switched does intensity come down.
 */
export function chainFor(kind: SessionKind, mode: Mode | null): Step[] {
  const cross: Mode = mode === 'row' ? 'row' : 'bike';

  switch (kind) {
    case 'vo2_intervals':
    case 'threshold': {
      const head: Step[] =
        mode === 'run'
          ? [
              { kind, mode: 'run', durationFactor: 1, why: 'wie geplant' },
              {
                kind,
                mode: cross,
                durationFactor: 1,
                why: 'Dieselbe Einheit auf dem Rad — der aerobe Reiz bleibt, die Stoßbelastung fällt weg',
              },
            ]
          : [{ kind, mode: mode ?? cross, durationFactor: 1, why: 'wie geplant' }];
      const tail: Step[] = [
        { kind: 'threshold', mode: cross, durationFactor: 1, why: 'Von VO2max auf Schwelle zurück' },
        { kind: 'easy_z2', mode: cross, durationFactor: 1, why: 'Nur noch locker in Zone 2' },
        { kind: 'regeneration', mode: cross, durationFactor: 1, why: 'Nur noch Regeneration' },
      ];
      // A threshold session already at threshold does not step "down" to itself.
      return [...head, ...tail].filter(
        (step, i, all) => all.findIndex((x) => x.kind === step.kind && x.mode === step.mode) === i,
      );
    }

    case 'long_z2': {
      const head: Step[] =
        mode === 'run'
          ? [
              { kind, mode: 'run', durationFactor: 1, why: 'wie geplant' },
              {
                kind,
                mode: cross,
                durationFactor: 1,
                why: 'Die lange Einheit auf dem Rad — gleiche Dauer, keine Stoßbelastung',
              },
            ]
          : [{ kind, mode: mode ?? cross, durationFactor: 1, why: 'wie geplant' }];
      return [
        ...head,
        { kind: 'long_z2', mode: cross, durationFactor: 0.6, why: 'Verkürzt statt gestrichen' },
        { kind: 'regeneration', mode: cross, durationFactor: 1, why: 'Nur noch Regeneration' },
      ];
    }

    case 'strength_heavy':
      return [
        { kind: 'strength_heavy', mode: null, durationFactor: 1, why: 'wie geplant' },
        { kind: 'strength_moderate', mode: null, durationFactor: 1, why: 'Auf moderates Niveau zurück' },
        { kind: 'strength_legfree', mode: null, durationFactor: 1, why: 'Beinfrei, damit der Lauftag trägt' },
        { kind: 'regeneration', mode: null, durationFactor: 1, why: 'Nur noch Regeneration' },
      ];

    case 'strength_moderate':
      return [
        { kind: 'strength_moderate', mode: null, durationFactor: 1, why: 'wie geplant' },
        { kind: 'strength_legfree', mode: null, durationFactor: 1, why: 'Beinfrei, damit der Lauftag trägt' },
        { kind: 'regeneration', mode: null, durationFactor: 1, why: 'Nur noch Regeneration' },
      ];

    case 'strength_legfree':
      return [
        { kind: 'strength_legfree', mode: null, durationFactor: 1, why: 'wie geplant' },
        { kind: 'regeneration', mode: null, durationFactor: 1, why: 'Nur noch Regeneration' },
      ];

    case 'easy_z2': {
      const head: Step[] =
        mode === 'run'
          ? [
              { kind, mode: 'run', durationFactor: 1, why: 'wie geplant' },
              { kind, mode: cross, durationFactor: 1, why: 'Auf das Rad statt zu kürzen' },
            ]
          : [{ kind, mode: mode ?? cross, durationFactor: 1, why: 'wie geplant' }];
      return [
        ...head,
        { kind: 'recovery_z1', mode: cross, durationFactor: 1, why: 'Nur noch Zone 1' },
        { kind: 'regeneration', mode: cross, durationFactor: 1, why: 'Nur noch Regeneration' },
      ];
    }

    case 'recovery_z1':
      return [
        { kind: 'recovery_z1', mode: mode ?? cross, durationFactor: 1, why: 'wie geplant' },
        { kind: 'regeneration', mode: mode ?? cross, durationFactor: 1, why: 'Nur noch Regeneration' },
      ];

    case 'regeneration':
      return [{ kind: 'regeneration', mode: mode ?? cross, durationFactor: 1, why: 'wie geplant' }];
  }
}

/** Walks the chain until a step is accepted, or returns null if none is. */
export function downgradeUntil(
  kind: SessionKind,
  mode: Mode | null,
  accept: (step: Step) => boolean,
): Step | null {
  for (const step of chainFor(kind, mode)) {
    if (accept(step)) return step;
  }
  return null;
}
