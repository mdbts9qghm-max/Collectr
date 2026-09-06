/**
 * Core domain model.
 *
 * Every entity carries `source` + optional `externalId` where an external
 * integration (Garmin / WHOOP / Polar / Apple Health) could later be the origin
 * of the record. Nothing imports automatically yet — the fields exist so an
 * importer can be added without a data migration.
 */

/** 'YYYY-MM-DD' in local time. The primary key for everything day-shaped. */
export type ISODate = string;
/** Full ISO 8601 timestamp. */
export type ISOTimestamp = string;
/** 'HH:mm' local wall-clock time. */
export type ClockTime = string;

export type DataSource =
  | 'manual'
  | 'derived'
  | 'garmin'
  | 'whoop'
  | 'polar'
  | 'apple_health'
  | 'google_calendar'
  | 'import';

export const SPORTS = [
  'run',
  'bike',
  'swim',
  'strength',
  'mobility',
  'recovery',
  'hike',
  'other_endurance',
] as const;
export type SportKey = (typeof SPORTS)[number];

/** Sports whose volume counts toward aerobic base. */
export const ENDURANCE_SPORTS: SportKey[] = ['run', 'bike', 'swim', 'hike', 'other_endurance'];

export const INTENSITIES = ['recovery', 'easy', 'moderate', 'threshold', 'vo2', 'max'] as const;
export type IntensityKey = (typeof INTENSITIES)[number];

export const MUSCLE_GROUPS = [
  'legs_quads',
  'legs_hamstrings',
  'glutes',
  'calves',
  'chest',
  'back',
  'shoulders',
  'arms',
  'core',
  'full_body',
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export type SessionStatus = 'planned' | 'completed' | 'skipped';

export type Rating = 'green' | 'amber' | 'red';

/* ------------------------------------------------------------------ *
 * Shifts
 * ------------------------------------------------------------------ */

/**
 * A configurable shift template. The user owns these: labels, times and
 * training capacity are all editable in Settings, nothing is hard-coded
 * into the engine.
 */
export interface ShiftType {
  id: string;
  /** Stable slug used by defaults and recurrence rules. */
  key: string;
  label: string;
  /** 1–3 char badge for dense calendar cells. */
  short: string;
  color: string;
  icon: string;
  /** Work window. Absent for days off. */
  work?: { start: ClockTime; end: ClockTime };
  /** Expected main sleep window on this kind of day. */
  sleep?: { start: ClockTime; end: ClockTime };
  training: ShiftTrainingPolicy;
  order: number;
}

export interface ShiftTrainingPolicy {
  /** Hard ceiling on total training minutes the engine will suggest. */
  maxMinutes: number;
  /** Highest intensity the engine may suggest on this shift. */
  maxIntensity: IntensityKey;
  /** May the engine suggest two sessions on this day? */
  allowDouble: boolean;
  /** Preferred training window, used for the suggested start time. */
  window?: { start: ClockTime; end: ClockTime };
  rating: Rating;
  /** Shown verbatim in the UI as the reason behind the ceiling. */
  note: string;
}

/** Assignment of a shift type to a calendar day. */
export interface ShiftAssignment {
  date: ISODate;
  shiftTypeId: string;
  source: DataSource;
  note?: string;
}

/* ------------------------------------------------------------------ *
 * Training
 * ------------------------------------------------------------------ */

export interface StrengthSet {
  reps: number;
  weightKg?: number;
  rpe?: number;
  /** For timed holds (planks, hangs). */
  seconds?: number;
}

export interface StrengthEntry {
  exerciseId: string;
  sets: StrengthSet[];
  note?: string;
}

export interface Exercise {
  id: string;
  name: string;
  muscleGroups: MuscleGroup[];
  /** How a "best" is measured for PR detection. */
  metric: 'weight' | 'reps' | 'seconds' | 'distance';
  isBodyweight: boolean;
  archived?: boolean;
}

export type ZoneKey = 'z1' | 'z2' | 'z3' | 'z4' | 'z5';

export interface TrainingSession {
  id: string;
  date: ISODate;
  sport: SportKey;
  title: string;
  status: SessionStatus;
  startTime?: ClockTime;

  plannedDurationMin?: number;
  plannedDistanceKm?: number;
  plannedIntensity: IntensityKey;

  actualDurationMin?: number;
  actualDistanceKm?: number;
  actualIntensity?: IntensityKey;

  /** Session RPE 1–10. The primary input to the load model. */
  rpe?: number;
  avgHr?: number;
  maxHr?: number;
  elevationGainM?: number;
  avgPowerW?: number;
  normalizedPowerW?: number;
  /** Minutes spent per HR/pace zone, when known. */
  zoneMinutes?: Partial<Record<ZoneKey, number>>;

  strength?: StrengthEntry[];
  muscleGroups: MuscleGroup[];

  /** Purpose of the session, e.g. "aerobe Grundlage". */
  goal?: string;
  notes?: string;
  /** Set when the session was created from an engine recommendation. */
  fromRecommendationId?: string;

  source: DataSource;
  externalId?: string;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}

export type PhaseKind = 'base' | 'build' | 'peak' | 'taper' | 'recovery';

export interface TrainingPhase {
  id: string;
  kind: PhaseKind;
  label: string;
  startDate: ISODate;
  endDate: ISODate;
  /** Baseline weekly training hours before the 3:1 wave is applied. */
  weeklyHoursTarget: number;
  /** Share of weekly endurance time per sport. Values are normalised on read. */
  sportFocus: Partial<Record<SportKey, number>>;
  /** Target share of time spent easy / moderate / hard. Sums to 1. */
  intensityDistribution: { easy: number; moderate: number; hard: number };
  /** Minimum strength sessions per week during this phase. */
  strengthSessionsPerWeek: number;
  focus: string[];
  notes?: string;
}

export interface TrainingPlan {
  id: string;
  name: string;
  goalId?: string;
  startDate: ISODate;
  targetDate: ISODate;
  phases: TrainingPhase[];
  /** Weeks in a build block before a deload week. */
  mesocycleWeeks: number;
  active: boolean;
}

/* ------------------------------------------------------------------ *
 * Habits
 * ------------------------------------------------------------------ */

export type HabitSchedule =
  | { type: 'daily' }
  | { type: 'weekdays'; days: number[] } // 0 = Sunday … 6 = Saturday
  | { type: 'times_per_week'; count: number };

/**
 * Habits that should not count against the user on days where skipping is the
 * correct behaviour (a planned rest day, a day shift with no training window).
 */
export type RestDayPolicy = 'always' | 'skip_on_rest_day' | 'skip_on_day_shift';

export type HabitCategory =
  | 'sleep'
  | 'nutrition'
  | 'training'
  | 'recovery'
  | 'mind'
  | 'care'
  | 'other';

export interface Habit {
  id: string;
  name: string;
  icon: string;
  category: HabitCategory;
  kind: 'binary' | 'quantity';
  /** Display unit for quantity habits, e.g. 'g', 'l', 'h', 'Schritte'. */
  unit?: string;
  /** The value that counts as a full success. */
  target?: number;
  /** Partial credit threshold — reaching this keeps a streak alive. */
  minimum?: number;
  direction: 'at_least' | 'at_most';
  /** Step used by the quick +/- buttons. */
  step?: number;
  schedule: HabitSchedule;
  restDayPolicy: RestDayPolicy;
  /**
   * Auto-fill the entry from another part of the app instead of asking the
   * user to log the same number twice.
   */
  autoSource?: 'sleep_hours' | 'training_minutes' | 'mobility_minutes' | 'steps';
  color: string;
  order: number;
  archived: boolean;
  createdAt: ISOTimestamp;
}

export interface HabitEntry {
  id: string;
  habitId: string;
  date: ISODate;
  value: number;
  note?: string;
  source: DataSource;
  updatedAt: ISOTimestamp;
}

/* ------------------------------------------------------------------ *
 * Tasks
 * ------------------------------------------------------------------ */

export type TaskPriority = 'high' | 'normal' | 'low';

export const TASK_CATEGORIES = [
  'work',
  'private',
  'sport',
  'nutrition',
  'organisation',
  'learning',
  'other',
] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export type TaskRecurrence =
  | { type: 'none' }
  | { type: 'daily'; interval: number }
  | { type: 'weekly'; days: number[] }
  | { type: 'monthly'; day: number }
  /** Repeats on every day carrying a given shift type — e.g. every sleep day. */
  | { type: 'shift'; shiftTypeId: string };

export interface Task {
  id: string;
  title: string;
  notes?: string;
  priority: TaskPriority;
  dueDate?: ISODate;
  dueTime?: ClockTime;
  category: TaskCategory;
  recurrence: TaskRecurrence;
  status: 'open' | 'done';
  /** Rough effort in minutes, used for day-load awareness. */
  effortMin?: number;
  habitId?: string;
  completedAt?: ISOTimestamp;
  createdAt: ISOTimestamp;
  order: number;
}

/* ------------------------------------------------------------------ *
 * Goals, metrics, records
 * ------------------------------------------------------------------ */

/** Metrics the app can measure automatically from logged sessions. */
export const TRACKED_METRICS = [
  'run_5k_seconds',
  'run_10k_seconds',
  'run_longest_km',
  'run_z2_pace_sec_per_km',
  'run_weekly_km',
  'bike_ftp_w',
  'bike_longest_km',
  'bike_weekly_km',
  'swim_100m_seconds',
  'swim_weekly_km',
  'pullups_max',
  'pushups_max',
  'bodyweight_kg',
  'weekly_hours',
  'strength_sessions_per_week',
] as const;
export type MetricKey = (typeof TRACKED_METRICS)[number] | `custom:${string}`;

export interface Goal {
  id: string;
  title: string;
  metric: MetricKey;
  unit: string;
  startValue: number;
  targetValue: number;
  /** Whether progress means the number goes up or down. */
  direction: 'increase' | 'decrease';
  targetDate?: ISODate;
  /** Auto-generated checkpoints between start and target. */
  milestones: GoalMilestone[];
  /** Goals flagged primary steer the training engine's sport weighting. */
  primary: boolean;
  sport?: SportKey;
  notes?: string;
  active: boolean;
  createdAt: ISOTimestamp;
}

export interface GoalMilestone {
  id: string;
  label: string;
  value: number;
  targetDate?: ISODate;
  reachedOn?: ISODate;
}

export interface PersonalRecord {
  id: string;
  metric: MetricKey;
  label: string;
  value: number;
  unit: string;
  date: ISODate;
  sessionId?: string;
  betterIsLower: boolean;
  /** The record it replaced, for "improved by" messaging. */
  previousValue?: number;
}

/* ------------------------------------------------------------------ *
 * Recovery & daily state
 * ------------------------------------------------------------------ */

/** Everything the user (or a future integration) reports about a single day. */
export interface DailyCheckIn {
  date: ISODate;
  /** Total main-sleep hours. */
  sleepHours?: number;
  sleepStart?: ClockTime;
  sleepEnd?: ClockTime;
  /** 1 = terrible … 5 = excellent. */
  sleepQuality?: number;
  /** 1 = fresh … 5 = exhausted. */
  fatigue?: number;
  /** 1 = none … 5 = severe. */
  soreness?: number;
  /** 1 = calm … 5 = very stressed. */
  stress?: number;
  /** 1 = no drive … 5 = very motivated. */
  motivation?: number;
  /**
   * Overall wellbeing on a 1–10 scale, asked in the morning check-in.
   * The planner's recovery value uses it directly: (value − 7) × 5.
   */
  wellbeing?: number;
  restingHr?: number;
  hrvMs?: number;
  /** WHOOP recovery percentage, if entered or imported. */
  whoopRecovery?: number;
  bodyweightKg?: number;
  steps?: number;
  notes?: string;
  source: DataSource;
  updatedAt: ISOTimestamp;
}

export interface WeeklyReview {
  /** Monday of the reviewed week. */
  weekStart: ISODate;
  wentWell?: string;
  toImprove?: string;
  notes?: string;
  /** User's own 1–5 rating of the week. */
  rating?: number;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

export interface UserProfile {
  name: string;
  birthYear: number;
  sex: 'male' | 'female' | 'other';
  heightCm: number;
  bodyweightKg: number;
  maxHr?: number;
  restingHr?: number;
  /** Lactate-threshold heart rate, if known — used for zone display. */
  thresholdHr?: number;
}

export interface TrainingSettings {
  /** Realistic weekly training hours. */
  weeklyHoursTarget: number;
  /** Realistic training days per week. */
  trainingDaysPerWeek: number;
  /** Session count ceiling per week, protects against over-scheduling. */
  maxSessionsPerWeek: number;
  ftpWatts: number;
  z2PaceSecPerKm: number;
  thresholdPaceSecPerKm: number;
  swimPaceSecPer100m: number;
  /** Minimum hours between two hard sessions. */
  minHoursBetweenHard: number;
  /** Minimum rest hours for a muscle group before loading it hard again. */
  strengthRecoveryHours: number;
  /** Weekly mobility minutes considered "on target". */
  mobilityMinutesTarget: number;
  /** Long-run cap as a share of weekly running volume. */
  longRunShareCap: number;
  /** Max week-over-week volume increase, as a ratio (0.1 = +10%). */
  maxWeeklyRampRate: number;
}

export interface RecoverySettings {
  sleepHoursTarget: number;
  /** Readiness at or above this allows hard training. */
  readyThreshold: number;
  /** Below this, the engine only offers recovery options. */
  recoveryThreshold: number;
  /** Acute:chronic workload ratio considered the top of the safe band. */
  acwrCeiling: number;
}

export interface NotificationSettings {
  enabled: boolean;
  morningBriefing: boolean;
  morningBriefingTime: ClockTime;
  eveningCheckIn: boolean;
  eveningCheckInTime: ClockTime;
  weeklyReview: boolean;
  loadWarnings: boolean;
  habitNudges: boolean;
  /** Browser notification permission mirror; the app never assumes it. */
  systemPermissionGranted: boolean;
}

export interface AppSettings {
  version: number;
  profile: UserProfile;
  training: TrainingSettings;
  recovery: RecoverySettings;
  notifications: NotificationSettings;
  theme: 'dark' | 'light' | 'system';
  weekStartsOn: 0 | 1;
  locale: 'de' | 'en';
  units: 'metric' | 'imperial';
  /** Rotation used by the shift planner's "fill pattern" tool. */
  shiftRotation: string[];
  updatedAt: ISOTimestamp;
}

/* ------------------------------------------------------------------ *
 * Engine output (computed, never persisted as truth)
 * ------------------------------------------------------------------ */

export type ReasonImpact = 'positive' | 'negative' | 'neutral';

export interface Reason {
  text: string;
  impact: ReasonImpact;
  /** Points this reason added to (or removed from) the candidate score. */
  points?: number;
}

export type RecommendationVerdict = 'recommended' | 'alternative' | 'not_recommended';

export interface SessionTemplate {
  id: string;
  sport: SportKey;
  title: string;
  intensity: IntensityKey;
  durationMin: number;
  distanceKm?: number;
  goal: string;
  muscleGroups: MuscleGroup[];
  /** Marks long runs / long rides for spacing rules. */
  isLong?: boolean;
  isRest?: boolean;
}

export interface Recommendation {
  id: string;
  template: SessionTemplate;
  verdict: RecommendationVerdict;
  score: number;
  reasons: Reason[];
  /** Populated when a hard rule excluded the candidate. */
  blockedBy?: string;
  suggestedStart?: ClockTime;
  estimatedLoad: number;
}

export interface DailyRecommendation {
  date: ISODate;
  recommended: Recommendation[];
  alternatives: Recommendation[];
  notRecommended: Recommendation[];
  /** Assessment of what is already planned for the day, if anything. */
  planReview?: {
    sessionIds: string[];
    verdict: 'aligned' | 'adjust' | 'too_much';
    message: string;
  };
  focus: string;
}
