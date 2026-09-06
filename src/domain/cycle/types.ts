import type { ISODate } from '../types.ts';

/**
 * The shift rotation is five days long and therefore walks through the calendar
 * week. Everything here is expressed in cycle days, never in weekdays.
 */
export type CycleDayNumber = 1 | 2 | 3 | 4 | 5;

export const SESSION_KINDS = [
  'intense_run',
  'heavy_strength',
  'long_run',
  'moderate_strength',
  'upper_strength',
  'easy_run',
  'regeneration',
] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export type Discipline = 'run' | 'strength' | 'other';

export interface SessionSpec {
  kind: SessionKind;
  label: string;
  description: string;
  /** Load points contributed to the day and to the rolling window. */
  load: number;
  /** The day's recovery value must reach this for the session to be allowed. */
  minRecovery: number;
  discipline: Discipline;
  /** True when the session loads the legs, which the pre-run rule cares about. */
  loadsLegs: boolean;
  defaultMinutes: number;
  minMinutes: number;
  maxMinutes: number;
  /** The next weaker option, used to downgrade rather than delete a session. */
  downgradeTo: SessionKind | null;
}

/** A clock window inside one day, in minutes from midnight. */
export interface Window {
  start: number;
  end: number;
}

export interface DayShape {
  date: ISODate;
  cycleDay: CycleDayNumber | null;
  /** True when a V-Schicht replaced cycle day 5. */
  isVShift: boolean;
  /** Set for days outside the rotation, e.g. holiday or sick leave. */
  outOfRotation: 'vacation' | 'sick' | 'unknown' | null;
  /** Sleep that ends on this day, as minutes from midnight of its own day. */
  sleep: { start: number; end: number; targetMinutes: number };
  /** Pre-shift nap before a night shift. */
  nap: Window | null;
  /** When the next sleep of the day begins — the nap counts. */
  nextSleepStart: number;
  /** Where a session may be placed. Null on days without a window. */
  trainingWindow: Window | null;
  /** Second permitted window, e.g. the V-Schicht evening alternative. */
  alternativeWindow: Window | null;
  /** Highest session load this day may carry at all. */
  maxLoad: number;
}

export interface PlannedUnit {
  date: ISODate;
  kind: SessionKind;
  /** Minutes from midnight. */
  start: number;
  durationMinutes: number;
  load: number;
  /** Why this session ended up here, in plain language. */
  reasons: string[];
  /** Set when the session was weakened by a rule instead of dropped. */
  downgradedFrom?: SessionKind;
}

export interface RuleViolation {
  rule: string;
  message: string;
  date: ISODate;
  kind?: SessionKind;
}

export interface DayPlan {
  shape: DayShape;
  recovery: RecoveryValue;
  units: PlannedUnit[];
  load: number;
  violations: RuleViolation[];
}

export interface RecoveryValue {
  /** 0–100 after all adjustments. */
  value: number;
  base: number;
  adjustments: { label: string; delta: number }[];
  /** Red below 45, amber to 74, green from 75. */
  band: 'red' | 'amber' | 'green';
}

export interface RollingWindowState {
  from: ISODate;
  to: ISODate;
  load: number;
  /** Load of the seven days before this window, for the 110 % rule. */
  previousLoad: number;
  counts: Record<SessionKind, number>;
  restDays: number;
  /** Share of running minutes spent in zone 2. */
  zone2Share: number;
}

export interface CyclePlan {
  days: DayPlan[];
  window: RollingWindowState;
  /** Target sessions the window still lacks. */
  missing: SessionKind[];
  violations: RuleViolation[];
  /** Objective score, higher is better. */
  score: number;
  scoreBreakdown: { goal: string; weight: number; achieved: number; points: number }[];
  warnings: string[];
}

/** Everything the planner can be tuned with, all surfaced in Settings. */
export interface PlannerSettings {
  /** Wake time on day-shift days; depends on the commute. */
  dayShiftWakeMinutes: number;
  /** Preferred V-Schicht window: morning before the shift, or evening after. */
  vShiftWindow: 'morning' | 'evening';
  /**
   * Load ceiling for the rolling seven-day window. A steady standard cycle
   * carries about 245 points over its five days, i.e. roughly 345 over seven,
   * so the default sits just above that: high enough not to starve the normal
   * rhythm, low enough to catch a genuine overreach.
   */
  weeklyLoadCap: number;
  /** Maximum growth against the previous seven-day window. */
  maxWindowGrowth: number;
  /** Session target for the rolling window. */
  targetUnits: number;
}

export const DEFAULT_PLANNER_SETTINGS: PlannerSettings = {
  dayShiftWakeMinutes: 5 * 60 + 30,
  vShiftWindow: 'morning',
  weeklyLoadCap: 360,
  maxWindowGrowth: 1.1,
  targetUnits: 6,
};
