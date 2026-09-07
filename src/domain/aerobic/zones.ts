/**
 * Five heart-rate zones from the **threshold** heart rate, not the maximum.
 *
 * Formulas for maximum heart rate carry an error of ten beats or more in either
 * direction, which is wider than the zones themselves. Steering a plan by them
 * means steering by noise. The threshold heart rate is measured, individual, and
 * moves with fitness — so the zones move with it.
 */

export const ZONES = ['z1', 'z2', 'z3', 'z4', 'z5'] as const;
export type Zone = (typeof ZONES)[number];

export interface ZoneSpec {
  zone: Zone;
  label: string;
  /** Share of the threshold heart rate, as a closed lower and open upper bound. */
  from: number;
  to: number;
  purpose: string;
}

export const ZONE_TABLE: Record<Zone, ZoneSpec> = {
  z1: { zone: 'z1', label: 'Z1', from: 0, to: 0.82, purpose: 'Regeneration' },
  z2: { zone: 'z2', label: 'Z2', from: 0.82, to: 0.9, purpose: 'Grundlage — die Hauptzone' },
  z3: { zone: 'z3', label: 'Z3', from: 0.9, to: 0.95, purpose: 'Tempo, sparsam einsetzen' },
  z4: { zone: 'z4', label: 'Z4', from: 0.95, to: 1.03, purpose: 'Schwelle' },
  z5: { zone: 'z5', label: 'Z5', from: 1.03, to: Infinity, purpose: 'VO2max' },
};

/** Zones that count toward the 80 % base share. */
export const BASE_ZONES: Zone[] = ['z1', 'z2'];

export interface ZoneRange {
  zone: Zone;
  /** Null when no threshold heart rate has been measured yet. */
  fromBpm: number | null;
  toBpm: number | null;
}

/**
 * The zone boundaries in beats per minute for a measured threshold.
 *
 * Returns nulls when nothing has been measured. That is deliberate: an invented
 * boundary is worse than none, because it reads as a measurement.
 */
export function zoneRanges(thresholdHr: number | null): ZoneRange[] {
  return ZONES.map((zone) => {
    const spec = ZONE_TABLE[zone];
    if (!thresholdHr || thresholdHr <= 0) return { zone, fromBpm: null, toBpm: null };
    return {
      zone,
      fromBpm: spec.from > 0 ? Math.round(thresholdHr * spec.from) : null,
      toBpm: Number.isFinite(spec.to) ? Math.round(thresholdHr * spec.to) : null,
    };
  });
}

export function zoneForHr(bpm: number, thresholdHr: number | null): Zone | null {
  if (!thresholdHr || thresholdHr <= 0) return null;
  const share = bpm / thresholdHr;
  for (const zone of ZONES) {
    const spec = ZONE_TABLE[zone];
    if (share >= spec.from && share < spec.to) return zone;
  }
  return 'z5';
}

/**
 * What to steer by until the first threshold test.
 *
 * The talk test is not a fallback of last resort — it tracks the ventilatory
 * threshold closely enough that it is worth more than a heart-rate zone derived
 * from a formula.
 */
export const SUBJECTIVE_GUIDANCE: Record<Zone, string> = {
  z1: 'Unterhaltung mühelos, Atmung wie im Sitzen',
  z2: 'Ein vollständiger Satz bleibt sprechbar — das ist die Definition',
  z3: 'Sprechen nur noch in kurzen Sätzen',
  z4: 'Einzelne Wörter, Atmung deutlich angestrengt',
  z5: 'Sprechen unmöglich',
};

/* ------------------------------------------------------------------ *
 * The threshold test
 * ------------------------------------------------------------------ */

export interface ThresholdTest {
  date: string;
  mode: 'run' | 'bike';
  /** Average heart rate of the final 20 minutes of a 30-minute time trial. */
  thresholdHr: number;
  note?: string;
}

/** Weeks between threshold tests, per section 2. */
export const THRESHOLD_TEST_INTERVAL_WEEKS = 10;
/** No test in the first eight weeks — there is nothing stable to measure yet. */
export const THRESHOLD_TEST_EARLIEST_WEEK = 9;

/**
 * The threshold for a mode.
 *
 * The bike threshold sits five to ten beats below the running one, because less
 * muscle mass is active and the athlete is seated. When only the running value
 * has been measured, the bike value is *not* estimated from it — the app says it
 * is unmeasured and steers that mode subjectively.
 */
export function thresholdFor(tests: ThresholdTest[], mode: 'run' | 'bike' | 'row'): number | null {
  // Rowing sits close enough to cycling in posture and active muscle mass to
  // share its threshold; it does not get an invented one of its own.
  const wanted = mode === 'run' ? 'run' : 'bike';
  const matching = tests.filter((t) => t.mode === wanted).sort((a, b) => b.date.localeCompare(a.date));
  return matching[0]?.thresholdHr ?? null;
}
