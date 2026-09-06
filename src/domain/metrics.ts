import type {
  AppSettings,
  DailyCheckIn,
  Exercise,
  ISODate,
  MetricKey,
  PersonalRecord,
  TrainingSession,
} from './types.ts';
import { addDays, lastNDays, nowTimestamp } from './date.ts';
import { makeId } from './ids.ts';
import { formatMetric } from './format.ts';
import {
  average,
  effectiveDistance,
  effectiveDuration,
  intensityRank,
  effectiveIntensity,
  periodStats,
  round1,
} from './load.ts';

export interface MetricValue {
  metric: MetricKey;
  label: string;
  value: number;
  unit: string;
  betterIsLower: boolean;
  /** Where the number came from, so nothing looks like it appeared by magic. */
  date?: ISODate;
  sessionId?: string;
  source: 'session' | 'checkin' | 'settings' | 'derived';
}

export const METRIC_META: Record<
  string,
  { label: string; unit: string; betterIsLower: boolean }
> = {
  run_5k_seconds: { label: 'Schnellste 5 km', unit: 's', betterIsLower: true },
  run_10k_seconds: { label: 'Schnellste 10 km', unit: 's', betterIsLower: true },
  run_longest_km: { label: 'Längster Lauf', unit: 'km', betterIsLower: false },
  run_z2_pace_sec_per_km: { label: 'Zone-2-Pace', unit: '/km', betterIsLower: true },
  run_weekly_km: { label: 'Laufkilometer / Woche', unit: 'km', betterIsLower: false },
  bike_ftp_w: { label: 'FTP', unit: 'W', betterIsLower: false },
  bike_longest_km: { label: 'Längste Radtour', unit: 'km', betterIsLower: false },
  bike_weekly_km: { label: 'Radkilometer / Woche', unit: 'km', betterIsLower: false },
  swim_100m_seconds: { label: 'Schwimmpace 100 m', unit: '/100m', betterIsLower: true },
  swim_weekly_km: { label: 'Schwimmkilometer / Woche', unit: 'km', betterIsLower: false },
  pullups_max: { label: 'Pull-ups (max)', unit: 'Wdh', betterIsLower: false },
  pushups_max: { label: 'Push-ups (max)', unit: 'Wdh', betterIsLower: false },
  bodyweight_kg: { label: 'Körpergewicht', unit: 'kg', betterIsLower: false },
  weekly_hours: { label: 'Trainingsstunden / Woche', unit: 'h', betterIsLower: false },
  strength_sessions_per_week: { label: 'Krafteinheiten / Woche', unit: '', betterIsLower: false },
};

/** Distance windows that count as a valid 5 km / 10 km effort. */
const DISTANCE_WINDOWS: Record<string, { target: number; min: number; max: number }> = {
  run_5k_seconds: { target: 5, min: 4.8, max: 5.6 },
  run_10k_seconds: { target: 10, min: 9.6, max: 11 },
};

function bestNormalisedTime(
  sessions: TrainingSession[],
  key: 'run_5k_seconds' | 'run_10k_seconds',
): MetricValue | null {
  const win = DISTANCE_WINDOWS[key];
  let best: { seconds: number; date: ISODate; id: string } | null = null;
  for (const s of sessions) {
    if (s.status !== 'completed' || s.sport !== 'run') continue;
    const km = effectiveDistance(s);
    const minutes = effectiveDuration(s);
    if (km < win.min || km > win.max || minutes <= 0) continue;
    // Normalise to the exact distance; a 5.2 km run is not a 5 km time.
    const seconds = (minutes * 60 * win.target) / km;
    if (!best || seconds < best.seconds) best = { seconds, date: s.date, id: s.id };
  }
  if (!best) return null;
  const meta = METRIC_META[key];
  return {
    metric: key,
    label: meta.label,
    value: Math.round(best.seconds),
    unit: meta.unit,
    betterIsLower: true,
    date: best.date,
    sessionId: best.id,
    source: 'session',
  };
}

function maxReps(
  sessions: TrainingSession[],
  exerciseId: string,
  key: MetricKey,
): MetricValue | null {
  let best: { reps: number; date: ISODate; id: string } | null = null;
  for (const s of sessions) {
    if (s.status !== 'completed' || !s.strength) continue;
    for (const entry of s.strength) {
      if (entry.exerciseId !== exerciseId) continue;
      for (const set of entry.sets) {
        // A bodyweight max means unassisted and unweighted. Added weight makes
        // the rep harder, band assistance (a negative value) makes it easier —
        // neither is comparable to a clean max, so both are excluded.
        if (set.weightKg != null && set.weightKg !== 0) continue;
        if (!best || set.reps > best.reps) best = { reps: set.reps, date: s.date, id: s.id };
      }
    }
  }
  if (!best) return null;
  const meta = METRIC_META[key as string];
  return {
    metric: key,
    label: meta.label,
    value: best.reps,
    unit: meta.unit,
    betterIsLower: false,
    date: best.date,
    sessionId: best.id,
    source: 'session',
  };
}

function maxOf(
  sessions: TrainingSession[],
  sport: TrainingSession['sport'],
  key: MetricKey,
): MetricValue | null {
  let best: { km: number; date: ISODate; id: string } | null = null;
  for (const s of sessions) {
    if (s.status !== 'completed' || s.sport !== sport) continue;
    const km = effectiveDistance(s);
    if (km <= 0) continue;
    if (!best || km > best.km) best = { km, date: s.date, id: s.id };
  }
  if (!best) return null;
  const meta = METRIC_META[key as string];
  return {
    metric: key,
    label: meta.label,
    value: round1(best.km),
    unit: meta.unit,
    betterIsLower: false,
    date: best.date,
    sessionId: best.id,
    source: 'session',
  };
}

function bestSwimPace(sessions: TrainingSession[]): MetricValue | null {
  let best: { pace: number; date: ISODate; id: string } | null = null;
  for (const s of sessions) {
    if (s.status !== 'completed' || s.sport !== 'swim') continue;
    const km = effectiveDistance(s);
    const minutes = effectiveDuration(s);
    if (km < 0.2 || minutes <= 0) continue;
    const pace = (minutes * 60) / (km * 10); // seconds per 100 m
    if (!best || pace < best.pace) best = { pace, date: s.date, id: s.id };
  }
  if (!best) return null;
  return {
    metric: 'swim_100m_seconds',
    label: METRIC_META.swim_100m_seconds.label,
    value: Math.round(best.pace),
    unit: METRIC_META.swim_100m_seconds.unit,
    betterIsLower: true,
    date: best.date,
    sessionId: best.id,
    source: 'session',
  };
}

/** Average pace of easy/recovery runs over the last 42 days. */
function z2Pace(sessions: TrainingSession[], today: ISODate): MetricValue | null {
  const from = addDays(today, -42);
  const paces: number[] = [];
  for (const s of sessions) {
    if (s.status !== 'completed' || s.sport !== 'run' || s.date < from) continue;
    if (intensityRank(effectiveIntensity(s)) > intensityRank('easy')) continue;
    const km = effectiveDistance(s);
    const minutes = effectiveDuration(s);
    if (km < 2 || minutes <= 0) continue;
    paces.push((minutes * 60) / km);
  }
  if (paces.length === 0) return null;
  return {
    metric: 'run_z2_pace_sec_per_km',
    label: METRIC_META.run_z2_pace_sec_per_km.label,
    value: Math.round(average(paces)),
    unit: '/km',
    betterIsLower: true,
    source: 'derived',
  };
}

/**
 * Current value of every tracked metric. Returns only metrics that actually
 * have data behind them — a missing metric is shown as "noch keine Daten"
 * rather than as a zero.
 */
export function currentMetrics(
  sessions: TrainingSession[],
  checkIns: DailyCheckIn[],
  settings: AppSettings,
  today: ISODate,
): Map<MetricKey, MetricValue> {
  const out = new Map<MetricKey, MetricValue>();
  const push = (m: MetricValue | null) => {
    if (m) out.set(m.metric, m);
  };

  push(bestNormalisedTime(sessions, 'run_5k_seconds'));
  push(bestNormalisedTime(sessions, 'run_10k_seconds'));
  push(maxOf(sessions, 'run', 'run_longest_km'));
  push(maxOf(sessions, 'bike', 'bike_longest_km'));
  push(z2Pace(sessions, today));
  push(bestSwimPace(sessions));
  push(maxReps(sessions, 'ex_pullup', 'pullups_max'));
  push(maxReps(sessions, 'ex_pushup', 'pushups_max'));

  // FTP is a configured value: it comes from a test the user runs, not from
  // guessing at ride data.
  out.set('bike_ftp_w', {
    metric: 'bike_ftp_w',
    label: METRIC_META.bike_ftp_w.label,
    value: settings.training.ftpWatts,
    unit: 'W',
    betterIsLower: false,
    source: 'settings',
  });

  const latestWeight = checkIns
    .filter((c) => c.bodyweightKg != null)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  out.set('bodyweight_kg', {
    metric: 'bodyweight_kg',
    label: METRIC_META.bodyweight_kg.label,
    value: latestWeight?.bodyweightKg ?? settings.profile.bodyweightKg,
    unit: 'kg',
    betterIsLower: false,
    date: latestWeight?.date,
    source: latestWeight ? 'checkin' : 'settings',
  });

  const week = periodStats(sessions, addDays(today, -6), today);
  out.set('weekly_hours', {
    metric: 'weekly_hours',
    label: METRIC_META.weekly_hours.label,
    value: round1(week.total.minutes / 60),
    unit: 'h',
    betterIsLower: false,
    source: 'derived',
  });
  out.set('run_weekly_km', {
    metric: 'run_weekly_km',
    label: METRIC_META.run_weekly_km.label,
    value: week.bySport.run.distanceKm,
    unit: 'km',
    betterIsLower: false,
    source: 'derived',
  });
  out.set('bike_weekly_km', {
    metric: 'bike_weekly_km',
    label: METRIC_META.bike_weekly_km.label,
    value: week.bySport.bike.distanceKm,
    unit: 'km',
    betterIsLower: false,
    source: 'derived',
  });
  out.set('swim_weekly_km', {
    metric: 'swim_weekly_km',
    label: METRIC_META.swim_weekly_km.label,
    value: week.bySport.swim.distanceKm,
    unit: 'km',
    betterIsLower: false,
    source: 'derived',
  });

  const month = periodStats(sessions, addDays(today, -27), today);
  out.set('strength_sessions_per_week', {
    metric: 'strength_sessions_per_week',
    label: METRIC_META.strength_sessions_per_week.label,
    value: round1(month.bySport.strength.sessions / 4),
    unit: '',
    betterIsLower: false,
    source: 'derived',
  });

  return out;
}

/* ------------------------------------------------------------------ *
 * Personal records
 * ------------------------------------------------------------------ */

/** Metrics that make sense as an all-time record. */
const PR_METRICS: MetricKey[] = [
  'run_5k_seconds',
  'run_10k_seconds',
  'run_longest_km',
  'bike_longest_km',
  'swim_100m_seconds',
  'pullups_max',
  'pushups_max',
];

/**
 * Compares the current best values against stored records and returns the ones
 * that improved. Called after every session save, so records appear the moment
 * they are earned.
 */
export function detectRecords(
  metrics: Map<MetricKey, MetricValue>,
  existing: PersonalRecord[],
  today: ISODate,
): PersonalRecord[] {
  // Records are kept as history, so the comparison must be against the best
  // row for each metric, not simply the most recently written one.
  const byMetric = new Map<MetricKey, PersonalRecord>();
  for (const r of existing) {
    const prev = byMetric.get(r.metric);
    if (!prev || (r.betterIsLower ? r.value < prev.value : r.value > prev.value)) {
      byMetric.set(r.metric, r);
    }
  }
  const fresh: PersonalRecord[] = [];

  for (const key of PR_METRICS) {
    const value = metrics.get(key);
    if (!value) continue;
    const prev = byMetric.get(key);
    const improved =
      !prev ||
      (value.betterIsLower ? value.value < prev.value - 0.001 : value.value > prev.value + 0.001);
    if (!improved) continue;
    fresh.push({
      id: makeId('pr'),
      metric: key,
      label: value.label,
      value: value.value,
      unit: value.unit,
      date: value.date ?? today,
      sessionId: value.sessionId,
      betterIsLower: value.betterIsLower,
      previousValue: prev?.value,
    });
  }
  return fresh;
}

/** Strength records per exercise: best weight for reps, or best rep count. */
export interface StrengthRecord {
  exerciseId: string;
  exerciseName: string;
  bestWeightKg?: number;
  bestWeightReps?: number;
  bestReps?: number;
  bestSeconds?: number;
  /** Estimated one-rep max via Epley — a comparison aid, not a tested number. */
  estimated1RM?: number;
  date: ISODate;
  totalVolumeKg: number;
}

export function strengthRecords(
  sessions: TrainingSession[],
  exercises: Exercise[],
): StrengthRecord[] {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const acc = new Map<string, StrengthRecord>();

  for (const s of sessions) {
    if (s.status !== 'completed' || !s.strength) continue;
    for (const entry of s.strength) {
      const exercise = byId.get(entry.exerciseId);
      if (!exercise) continue;
      const rec =
        acc.get(entry.exerciseId) ??
        ({
          exerciseId: entry.exerciseId,
          exerciseName: exercise.name,
          date: s.date,
          totalVolumeKg: 0,
        } as StrengthRecord);

      for (const set of entry.sets) {
        if (set.weightKg && set.weightKg > 0) {
          rec.totalVolumeKg += set.weightKg * set.reps;
          const e1rm = set.weightKg * (1 + set.reps / 30);
          if (!rec.estimated1RM || e1rm > rec.estimated1RM) {
            rec.estimated1RM = Math.round(e1rm);
            rec.date = s.date;
          }
          if (!rec.bestWeightKg || set.weightKg > rec.bestWeightKg) {
            rec.bestWeightKg = set.weightKg;
            rec.bestWeightReps = set.reps;
          }
        } else if (set.seconds) {
          if (!rec.bestSeconds || set.seconds > rec.bestSeconds) rec.bestSeconds = set.seconds;
        } else if (!rec.bestReps || set.reps > rec.bestReps) {
          rec.bestReps = set.reps;
        }
      }
      acc.set(entry.exerciseId, rec);
    }
  }
  return [...acc.values()].sort((a, b) => a.exerciseName.localeCompare(b.exerciseName));
}

/** "Beste Trainingswoche" — highest completed weekly load. */
export function bestWeek(
  sessions: TrainingSession[],
  today: ISODate,
  weeks = 52,
): { weekStart: ISODate; load: number; minutes: number } | null {
  let best: { weekStart: ISODate; load: number; minutes: number } | null = null;
  for (let i = 0; i < weeks; i++) {
    const end = addDays(today, -i * 7);
    const start = addDays(end, -6);
    const stats = periodStats(sessions, start, end);
    if (stats.total.load <= 0) continue;
    if (!best || stats.total.load > best.load) {
      best = { weekStart: start, load: stats.total.load, minutes: stats.total.minutes };
    }
  }
  return best;
}

export function describeRecord(pr: PersonalRecord): string {
  const value = formatMetric(pr.metric as string, pr.value);
  if (pr.previousValue == null) return value;
  const delta = Math.abs(pr.value - pr.previousValue);
  const deltaText = pr.metric.toString().endsWith('_seconds')
    ? `${Math.round(delta)} s`
    : `${round1(delta)} ${pr.unit}`;
  return `${value} (${pr.betterIsLower ? '−' : '+'}${deltaText})`;
}

export function newRecordTimestamp(): string {
  return nowTimestamp();
}

export function recentDates(today: ISODate, n: number): ISODate[] {
  return lastNDays(today, n);
}
