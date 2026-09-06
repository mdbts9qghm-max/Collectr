import type {
  ISODate,
  IntensityKey,
  SportKey,
  TrainingSession,
  ZoneKey,
} from './types.ts';
import { ENDURANCE_SPORTS } from './types.ts';
import { addDays, dateRange, diffDays, startOfWeek } from './date.ts';

/**
 * Load model
 * ----------
 * Session load = duration × sRPE, the best-validated method that does not
 * require a chest strap on every session. It is scaled so that one hour at
 * threshold equals 100 points, which puts the numbers on the same intuitive
 * scale as TSS in TrainingPeaks or Garmin's training load.
 */
export const LOAD_SCALE = 4.5;

export const INTENSITY_RPE: Record<IntensityKey, number> = {
  recovery: 2,
  easy: 3.5,
  moderate: 5.5,
  threshold: 7.5,
  vo2: 9,
  max: 10,
};

export const INTENSITY_ORDER: IntensityKey[] = [
  'recovery',
  'easy',
  'moderate',
  'threshold',
  'vo2',
  'max',
];

const ZONE_RPE: Record<ZoneKey, number> = { z1: 2, z2: 3.5, z3: 5.5, z4: 7.5, z5: 9 };

export function intensityRank(i: IntensityKey): number {
  return INTENSITY_ORDER.indexOf(i);
}

export function isAtOrBelow(candidate: IntensityKey, ceiling: IntensityKey): boolean {
  return intensityRank(candidate) <= intensityRank(ceiling);
}

/** Threshold and above counts as a hard session for spacing rules. */
export function isHardIntensity(i: IntensityKey): boolean {
  return intensityRank(i) >= intensityRank('threshold');
}

export function effectiveIntensity(s: TrainingSession): IntensityKey {
  return s.status === 'completed' ? (s.actualIntensity ?? s.plannedIntensity) : s.plannedIntensity;
}

export function effectiveDuration(s: TrainingSession): number {
  const v = s.status === 'completed' ? (s.actualDurationMin ?? s.plannedDurationMin) : s.plannedDurationMin;
  return v ?? 0;
}

export function effectiveDistance(s: TrainingSession): number {
  const v = s.status === 'completed' ? (s.actualDistanceKm ?? s.plannedDistanceKm) : s.plannedDistanceKm;
  return v ?? 0;
}

/**
 * Session load in scaled sRPE units.
 * Precision ladder: per-zone minutes > logged RPE > intensity default.
 */
export function sessionLoad(s: TrainingSession): number {
  if (s.status === 'skipped') return 0;
  const zones = s.zoneMinutes;
  if (zones) {
    const total = (Object.keys(zones) as ZoneKey[]).reduce(
      (sum, z) => sum + (zones[z] ?? 0) * ZONE_RPE[z],
      0,
    );
    if (total > 0) return round1(total / LOAD_SCALE);
  }
  const minutes = effectiveDuration(s);
  if (minutes <= 0) return 0;
  const rpe = s.status === 'completed' && s.rpe ? s.rpe : INTENSITY_RPE[effectiveIntensity(s)];
  return round1((minutes * rpe) / LOAD_SCALE);
}

export function isHardSession(s: TrainingSession): boolean {
  if (s.sport === 'recovery' || s.sport === 'mobility') return false;
  if (isHardIntensity(effectiveIntensity(s))) return true;
  // A long endurance session is a hard session for recovery purposes even at
  // low intensity — 3 hours easy still costs days of freshness.
  return ENDURANCE_SPORTS.includes(s.sport) && effectiveDuration(s) >= 120;
}

export function isLongSession(s: TrainingSession): boolean {
  if (!ENDURANCE_SPORTS.includes(s.sport)) return false;
  if (s.sport === 'run') return effectiveDistance(s) >= 15 || effectiveDuration(s) >= 90;
  return effectiveDuration(s) >= 120;
}

/* ------------------------------------------------------------------ *
 * Time series
 * ------------------------------------------------------------------ */

export interface LoadPoint {
  date: ISODate;
  load: number;
  /** Acute load — 7-day exponentially weighted average. "Fatigue". */
  atl: number;
  /** Chronic load — 42-day exponentially weighted average. "Fitness". */
  ctl: number;
  /** Form: chronic minus acute. Positive = fresh, negative = loaded. */
  tsb: number;
  /** Acute:chronic workload ratio over 7 vs 28 rolling days. */
  acwr: number;
}

const ATL_TAU = 7;
const CTL_TAU = 42;

export function dailyLoadMap(sessions: TrainingSession[]): Map<ISODate, number> {
  const map = new Map<ISODate, number>();
  for (const s of sessions) {
    if (s.status !== 'completed') continue;
    map.set(s.date, (map.get(s.date) ?? 0) + sessionLoad(s));
  }
  return map;
}

/**
 * Builds the full load series. Starts 60 days before the requested window so
 * the exponential averages have warmed up by the time the window begins.
 */
export function loadSeries(
  sessions: TrainingSession[],
  from: ISODate,
  to: ISODate,
): LoadPoint[] {
  const daily = dailyLoadMap(sessions);
  const warmupStart = addDays(from, -60);
  const dates = dateRange(warmupStart, to);
  const recent: number[] = [];
  let atl = 0;
  let ctl = 0;
  const out: LoadPoint[] = [];

  for (const date of dates) {
    const load = daily.get(date) ?? 0;
    atl += (load - atl) / ATL_TAU;
    ctl += (load - ctl) / CTL_TAU;
    recent.push(load);
    if (recent.length > 28) recent.shift();

    const acute = average(recent.slice(-7));
    const chronic = average(recent);
    const acwr = chronic > 0.5 ? round2(acute / chronic) : 0;

    if (date >= from) {
      out.push({
        date,
        load: round1(load),
        atl: round1(atl),
        ctl: round1(ctl),
        tsb: round1(ctl - atl),
        acwr,
      });
    }
  }
  return out;
}

export function loadStateOn(sessions: TrainingSession[], date: ISODate): LoadPoint {
  const series = loadSeries(sessions, date, date);
  return series[0] ?? { date, load: 0, atl: 0, ctl: 0, tsb: 0, acwr: 0 };
}

/** CTL change over the last 7 days — how fast fitness is being built. */
export function rampRate(sessions: TrainingSession[], date: ISODate): number {
  const series = loadSeries(sessions, addDays(date, -7), date);
  if (series.length < 2) return 0;
  return round1(series[series.length - 1].ctl - series[0].ctl);
}

/* ------------------------------------------------------------------ *
 * Aggregates
 * ------------------------------------------------------------------ */

export interface VolumeTotals {
  minutes: number;
  distanceKm: number;
  load: number;
  sessions: number;
  elevationM: number;
}

const EMPTY_TOTALS: VolumeTotals = {
  minutes: 0,
  distanceKm: 0,
  load: 0,
  sessions: 0,
  elevationM: 0,
};

export interface PeriodStats {
  from: ISODate;
  to: ISODate;
  total: VolumeTotals;
  bySport: Record<SportKey, VolumeTotals>;
  /** Minutes spent in each intensity band. */
  byIntensity: Record<'easy' | 'moderate' | 'hard', number>;
  hardSessions: number;
  longSessions: number;
  /** Distinct days with at least one completed session. */
  activeDays: number;
}

function emptySportMap(): Record<SportKey, VolumeTotals> {
  return {
    run: { ...EMPTY_TOTALS },
    bike: { ...EMPTY_TOTALS },
    swim: { ...EMPTY_TOTALS },
    strength: { ...EMPTY_TOTALS },
    mobility: { ...EMPTY_TOTALS },
    recovery: { ...EMPTY_TOTALS },
    hike: { ...EMPTY_TOTALS },
    other_endurance: { ...EMPTY_TOTALS },
  };
}

export function periodStats(
  sessions: TrainingSession[],
  from: ISODate,
  to: ISODate,
  opts: { includePlanned?: boolean } = {},
): PeriodStats {
  const bySport = emptySportMap();
  const total: VolumeTotals = { ...EMPTY_TOTALS };
  const byIntensity = { easy: 0, moderate: 0, hard: 0 };
  const activeDates = new Set<ISODate>();
  let hardSessions = 0;
  let longSessions = 0;

  for (const s of sessions) {
    if (s.date < from || s.date > to) continue;
    const counts = s.status === 'completed' || (opts.includePlanned && s.status === 'planned');
    if (!counts) continue;

    const minutes = effectiveDuration(s);
    const distance = effectiveDistance(s);
    const load = sessionLoad(s);
    const bucket = bySport[s.sport];

    bucket.minutes += minutes;
    bucket.distanceKm += distance;
    bucket.load += load;
    bucket.sessions += 1;
    bucket.elevationM += s.elevationGainM ?? 0;

    total.minutes += minutes;
    total.distanceKm += distance;
    total.load += load;
    total.sessions += 1;
    total.elevationM += s.elevationGainM ?? 0;

    const rank = intensityRank(effectiveIntensity(s));
    if (rank <= intensityRank('easy')) byIntensity.easy += minutes;
    else if (rank <= intensityRank('moderate')) byIntensity.moderate += minutes;
    else byIntensity.hard += minutes;

    if (isHardSession(s)) hardSessions += 1;
    if (isLongSession(s)) longSessions += 1;
    if (s.status === 'completed') activeDates.add(s.date);
  }

  roundTotals(total);
  for (const key of Object.keys(bySport) as SportKey[]) roundTotals(bySport[key]);

  return {
    from,
    to,
    total,
    bySport,
    byIntensity,
    hardSessions,
    longSessions,
    activeDays: activeDates.size,
  };
}

export function weekStats(
  sessions: TrainingSession[],
  anyDateInWeek: ISODate,
  weekStartsOn: 0 | 1 = 1,
  opts: { includePlanned?: boolean } = {},
): PeriodStats {
  const start = startOfWeek(anyDateInWeek, weekStartsOn);
  return periodStats(sessions, start, addDays(start, 6), opts);
}

/** Days since the most recent completed session matching a predicate. */
export function daysSince(
  sessions: TrainingSession[],
  reference: ISODate,
  match: (s: TrainingSession) => boolean,
): number | null {
  let best: ISODate | null = null;
  for (const s of sessions) {
    if (s.status !== 'completed') continue;
    if (s.date >= reference) continue;
    if (!match(s)) continue;
    if (!best || s.date > best) best = s.date;
  }
  return best ? diffDays(reference, best) : null;
}

/** Consecutive days with training immediately before `reference`. */
export function consecutiveTrainingDays(
  sessions: TrainingSession[],
  reference: ISODate,
): number {
  const active = new Set(
    sessions
      .filter((s) => s.status === 'completed' && s.sport !== 'recovery' && effectiveDuration(s) >= 20)
      .map((s) => s.date),
  );
  let count = 0;
  let cursor = addDays(reference, -1);
  while (active.has(cursor) && count < 30) {
    count += 1;
    cursor = addDays(cursor, -1);
  }
  return count;
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function roundTotals(t: VolumeTotals): void {
  t.minutes = Math.round(t.minutes);
  t.distanceKm = round1(t.distanceKm);
  t.load = Math.round(t.load);
  t.elevationM = Math.round(t.elevationM);
}

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Maps a value onto 0–100 with linear interpolation between two anchors. */
export function scoreBetween(value: number, zero: number, full: number): number {
  if (full === zero) return value >= full ? 100 : 0;
  return clamp(((value - zero) / (full - zero)) * 100, 0, 100);
}
