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
  /**
   * False on days whose shift was never entered. The value is then a
   * placeholder the planner ignores — it must never be shown as a fact.
   */
  known: boolean;
}

/**
 * The balance of one macrocycle — two cycles, ten days.
 *
 * This replaces the old rolling seven-day target. The rotation is five days
 * long, so a seven-day count cuts every cycle in a different place; ten days is
 * the first span where the template's own arithmetic closes.
 */
export interface MacrocycleBalance {
  from: ISODate;
  to: ISODate;
  /** Complete only when both cycles of the macrocycle lie inside the horizon. */
  complete: boolean;
  load: number;
  runs: number;
  strengthSessions: number;
  restDays: number;
  /** Share of running minutes spent in zone 2. */
  zone2Share: number;
}

export interface CycleBlock {
  index: number;
  type: 'A' | 'B';
  /** 1 or 2 — position inside the macrocycle. */
  position: 1 | 2;
  isDeload: boolean;
  from: ISODate;
  to: ISODate;
  load: number;
  days: DayPlan[];
}

export interface CyclePlan {
  days: DayPlan[];
  /** The cycles the horizon covers, in order. */
  cycles: CycleBlock[];
  macrocycle: MacrocycleBalance;
  /** Acute-to-chronic load ratio and its band. */
  acwr: AcwrSummary;
  /** The settings the plan was built with, so the UI can show the same limits. */
  settings: PlannerSettings;
  violations: RuleViolation[];
  warnings: string[];
}

export interface AcwrSummary {
  ratio: number | null;
  band: 'low' | 'ok' | 'high' | 'unknown';
  message: string | null;
  /** Daily ratio over the recent past, for the trend curve. */
  history: { date: ISODate; ratio: number | null }[];
}

/**
 * Everything the planner can be tuned with.
 *
 * Deliberately short. The template fixes what is trained and when; these are
 * the two things it cannot know — the commute, and where the V-Schicht window
 * sits — plus the growth ceiling.
 */
export interface PlannerSettings {
  /** Wake time on day-shift days; depends on the commute. */
  dayShiftWakeMinutes: number;
  /** Preferred V-Schicht window: morning before the shift, or evening after. */
  vShiftWindow: 'morning' | 'evening';
  /** Maximum load growth from one macrocycle to the next. */
  maxMacrocycleGrowth: number;
}

export const DEFAULT_PLANNER_SETTINGS: PlannerSettings = {
  dayShiftWakeMinutes: 5 * 60 + 30,
  vShiftWindow: 'morning',
  maxMacrocycleGrowth: 1.08,
};
