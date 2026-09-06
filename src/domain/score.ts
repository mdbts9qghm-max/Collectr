import type {
  AppSettings,
  Goal,
  ISODate,
  MetricKey,
  TrainingSession,
} from './types.ts';
import type { MetricValue } from './metrics.ts';
import type { Readiness } from './readiness.ts';
import { addDays, lastNDays } from './date.ts';
import { formatMetric } from './format.ts';
import { average, clamp, periodStats, round1, scoreBetween } from './load.ts';

/**
 * Hybrid Athlete Score
 * --------------------
 * Six pillars, each 0–100, combined with fixed weights. Every pillar reports
 * the components it was built from — value, target, weight and the points it
 * contributed — so the question "why is my score 78?" always has a complete
 * answer in the UI rather than a black box.
 *
 * Benchmarks are anchored to the athlete's own goals where one exists, and
 * otherwise to reasonable amateur hybrid-athlete standards.
 */

export type PillarKey = 'endurance' | 'strength' | 'consistency' | 'recovery' | 'mobility' | 'habits';

export const PILLAR_WEIGHTS: Record<PillarKey, number> = {
  endurance: 0.26,
  strength: 0.19,
  consistency: 0.2,
  recovery: 0.16,
  habits: 0.12,
  mobility: 0.07,
};

export const PILLAR_META: Record<PillarKey, { label: string; icon: string; color: string; description: string }> = {
  endurance: {
    label: 'Endurance',
    icon: '🏃',
    color: 'var(--sport-run)',
    description: 'Laufen, Rad und Schwimmen gemessen an deinen Zielwerten.',
  },
  strength: {
    label: 'Strength',
    icon: '🏋️',
    color: 'var(--sport-strength)',
    description: 'Kraftwerte relativ zum Körpergewicht plus Trainingsfrequenz.',
  },
  consistency: {
    label: 'Consistency',
    icon: '📈',
    color: 'var(--accent)',
    description: 'Wie zuverlässig du über die letzten vier Wochen trainiert hast.',
  },
  recovery: {
    label: 'Recovery',
    icon: '💤',
    color: 'var(--info)',
    description: 'Schlaf, Readiness und ein Belastungsverhältnis im sicheren Bereich.',
  },
  mobility: {
    label: 'Mobility',
    icon: '🧘',
    color: 'var(--sport-mobility)',
    description: 'Beweglichkeitsarbeit als Verletzungsprophylaxe.',
  },
  habits: {
    label: 'Habits',
    icon: '✅',
    color: 'var(--sport-swim)',
    description: 'Alltagsgewohnheiten, die das Training überhaupt erst tragen.',
  },
};

export interface ScoreComponent {
  label: string;
  /** 0–100 sub-score. */
  score: number;
  /** Share of the pillar. */
  weight: number;
  /** Human-readable "45 km von 60 km" style detail. */
  detail: string;
  /** False when there is no data — the component is excluded from the average. */
  hasData: boolean;
}

export interface Pillar {
  key: PillarKey;
  score: number;
  weight: number;
  /** Points this pillar contributed to the total. */
  contribution: number;
  components: ScoreComponent[];
  /** The single most valuable thing to improve in this pillar. */
  lever: string | null;
}

export interface HybridScore {
  date: ISODate;
  total: number;
  pillars: Pillar[];
  /** Sorted worst-first, the concrete next steps. */
  levers: { pillar: PillarKey; text: string; gain: number }[];
  /** Share of scoring components that actually have data behind them. */
  coverage: number;
  /** True while there is too little data for the total to mean much. */
  provisional: boolean;
}

interface ScoreInput {
  date: ISODate;
  sessions: TrainingSession[];
  metrics: Map<MetricKey, MetricValue>;
  settings: AppSettings;
  goals: Goal[];
  readinessHistory: Readiness[];
  sleepHours: (number | null)[];
  habitCompletionPct: number | null;
  weeklyMinutesTarget: number;
}

function comp(
  label: string,
  score: number | null,
  weight: number,
  detail: string,
): ScoreComponent {
  return {
    label,
    score: score == null ? 0 : round1(clamp(score, 0, 100)),
    weight,
    detail,
    hasData: score != null,
  };
}

function combine(components: ScoreComponent[]): number {
  const withData = components.filter((c) => c.hasData);
  const totalWeight = withData.reduce((s, c) => s + c.weight, 0);
  if (totalWeight === 0) return 0;
  return round1(withData.reduce((s, c) => s + c.score * c.weight, 0) / totalWeight);
}

/** Target for a metric: the athlete's own goal if set, else a sane benchmark. */
function targetFor(metric: MetricKey, goals: Goal[], fallback: number): number {
  const goal = goals.find((g) => g.active && g.metric === metric);
  return goal ? goal.targetValue : fallback;
}

/* ------------------------------------------------------------------ *
 * Pillars
 * ------------------------------------------------------------------ */

function endurancePillar(input: ScoreInput): Pillar {
  const { metrics, goals, settings } = input;
  const bw = metrics.get('bodyweight_kg')?.value ?? settings.profile.bodyweightKg;

  const fiveK = metrics.get('run_5k_seconds');
  const z2 = metrics.get('run_z2_pace_sec_per_km');
  const ftp = metrics.get('bike_ftp_w');
  const swim = metrics.get('swim_100m_seconds');
  const longest = metrics.get('run_longest_km');

  const fiveKTarget = targetFor('run_5k_seconds', goals, 1380); // 23:00
  const ftpTarget = targetFor('bike_ftp_w', goals, 200);
  const longestTarget = targetFor('run_longest_km', goals, 42.2);

  const fourWeek = periodStats(input.sessions, addDays(input.date, -27), input.date);
  const enduranceMinutes =
    fourWeek.bySport.run.minutes +
    fourWeek.bySport.bike.minutes +
    fourWeek.bySport.swim.minutes +
    fourWeek.bySport.hike.minutes +
    fourWeek.bySport.other_endurance.minutes;

  const components: ScoreComponent[] = [
    comp(
      '5-km-Zeit',
      // Zero at 33:00, full at the goal time.
      fiveK ? scoreBetween(fiveK.value, 1980, fiveKTarget) : null,
      0.22,
      fiveK
        ? `${formatMetric('run_5k_seconds', fiveK.value)} · Ziel ${formatMetric('run_5k_seconds', fiveKTarget)}`
        : 'Noch kein 5-km-Lauf erfasst',
    ),
    comp(
      'Zone-2-Pace',
      // Zero at 7:30/km, full at 5:20/km.
      z2 ? scoreBetween(z2.value, 450, 320) : null,
      0.18,
      z2 ? `${formatMetric('run_z2_pace_sec_per_km', z2.value)} im Schnitt (42 Tage)` : 'Noch keine lockeren Läufe erfasst',
    ),
    comp(
      'FTP relativ',
      // 1.6 W/kg zero, 3.5 W/kg full — solid amateur hybrid range.
      ftp && bw > 0 ? scoreBetween(ftp.value / bw, 1.6, 3.5) : null,
      0.18,
      ftp && bw > 0
        ? `${(ftp.value / bw).toFixed(2)} W/kg · ${ftp.value} W bei ${bw.toFixed(0)} kg · Ziel ${ftpTarget} W`
        : 'FTP in den Einstellungen hinterlegen',
    ),
    comp(
      'Schwimmpace',
      // Zero at 2:40/100 m, full at 1:35/100 m.
      swim ? scoreBetween(swim.value, 160, 95) : null,
      0.1,
      swim ? `${formatMetric('swim_100m_seconds', swim.value)} bestes 100 m` : 'Noch keine Schwimmeinheit erfasst',
    ),
    comp(
      'Längster Lauf',
      longest ? scoreBetween(longest.value, 5, longestTarget) : null,
      0.16,
      longest
        ? `${longest.value.toFixed(1)} km · nächster Meilenstein ${longestTarget.toFixed(0)} km`
        : 'Noch kein Lauf mit Distanz erfasst',
    ),
    comp(
      'Ausdauerumfang',
      enduranceMinutes > 0 ? scoreBetween(enduranceMinutes / 4, 90, input.weeklyMinutesTarget * 0.75) : null,
      0.16,
      enduranceMinutes > 0
        ? `Ø ${Math.round(enduranceMinutes / 4 / 60 * 10) / 10} h/Woche Ausdauer über 4 Wochen`
        : 'Noch keine Ausdauereinheiten erfasst',
    ),
  ];

  const score = combine(components);
  return {
    key: 'endurance',
    score,
    weight: PILLAR_WEIGHTS.endurance,
    contribution: round1(score * PILLAR_WEIGHTS.endurance),
    components,
    lever: pickLever(components, {
      '5-km-Zeit': 'Eine Schwelleneinheit pro Woche hebt die 5-km-Zeit am schnellsten.',
      'Zone-2-Pace': 'Mehr lockeres Laufvolumen verbessert die Zone-2-Pace über Wochen.',
      'FTP relativ': 'Zwei FTP-Intervalleinheiten pro Woche auf dem Direto zahlen sich direkt aus.',
      Schwimmpace: 'Bei 2:00/100 m bringt Technik mehr als Umfang — kurze Techniksessions.',
      'Längster Lauf': 'Den Long Run alle 7–10 Tage um 10 % verlängern.',
      Ausdauerumfang: `Wochenumfang Richtung ${Math.round(input.weeklyMinutesTarget / 60)} h aufbauen.`,
    }),
  };
}

function strengthPillar(input: ScoreInput): Pillar {
  const { metrics, goals, settings } = input;
  const bw = metrics.get('bodyweight_kg')?.value ?? settings.profile.bodyweightKg;
  const pullups = metrics.get('pullups_max');
  const pushups = metrics.get('pushups_max');
  const strengthPerWeek = metrics.get('strength_sessions_per_week');

  const pullTarget = targetFor('pullups_max', goals, 12);
  const pushTarget = targetFor('pushups_max', goals, 45);

  const fourWeek = periodStats(input.sessions, addDays(input.date, -27), input.date);
  const volume = fourWeek.bySport.strength.minutes;

  const components: ScoreComponent[] = [
    comp(
      'Pull-ups',
      pullups ? scoreBetween(pullups.value, 0, pullTarget) : null,
      0.28,
      pullups ? `${pullups.value} Wdh · Ziel ${pullTarget}` : 'Noch keine Pull-ups im Krafttraining erfasst',
    ),
    comp(
      'Push-ups',
      pushups ? scoreBetween(pushups.value, 5, pushTarget) : null,
      0.22,
      pushups ? `${pushups.value} Wdh · Ziel ${pushTarget}` : 'Noch keine Push-ups erfasst',
    ),
    comp(
      'Krafthäufigkeit',
      strengthPerWeek ? scoreBetween(strengthPerWeek.value, 0, 2) : null,
      0.3,
      strengthPerWeek
        ? `${strengthPerWeek.value.toFixed(1)} Einheiten/Woche im 4-Wochen-Schnitt`
        : 'Noch keine Krafteinheiten erfasst',
    ),
    comp(
      'Kraftumfang',
      volume > 0 ? scoreBetween(volume / 4, 20, 100) : null,
      0.2,
      volume > 0 ? `Ø ${Math.round(volume / 4)} min/Woche Krafttraining` : 'Noch kein Kraftvolumen erfasst',
    ),
  ];

  const score = combine(components);
  return {
    key: 'strength',
    score,
    weight: PILLAR_WEIGHTS.strength,
    contribution: round1(score * PILLAR_WEIGHTS.strength),
    components,
    lever: pickLever(components, {
      'Pull-ups': `Von ${pullups?.value ?? 0} auf ${pullTarget}: 3× pro Woche Negativ-Wiederholungen und Dead Hangs.`,
      'Push-ups': 'Push-ups als Grease-the-Groove über den Tag verteilen.',
      Krafthäufigkeit: `${bw.toFixed(0)} kg Körpergewicht zu tragen kostet Kraft — zwei kurze Einheiten pro Woche reichen, um sie zu halten.`,
      Kraftumfang: 'Auch 30 Minuten Ganzkörperkraft zählen, wenn sie regelmäßig stattfinden.',
    }),
  };
}

function consistencyPillar(input: ScoreInput): Pillar {
  const { sessions, date, settings } = input;
  const window = lastNDays(date, 28);
  const from = window[0];
  const stats = periodStats(sessions, from, date);

  const planned = sessions.filter((s) => s.date >= from && s.date <= date && s.status !== 'planned');
  const completed = planned.filter((s) => s.status === 'completed');
  const adherence = planned.length >= 3 ? (completed.length / planned.length) * 100 : null;

  const sessionsPerWeek = stats.total.sessions / 4;
  const targetPerWeek = settings.training.trainingDaysPerWeek;

  // Longest gap between training days in the window.
  const activeDates = new Set(completed.map((s) => s.date));
  let longestGap = 0;
  let gap = 0;
  for (const d of window) {
    if (activeDates.has(d)) gap = 0;
    else {
      gap += 1;
      longestGap = Math.max(longestGap, gap);
    }
  }

  const weeklyMinutes = [3, 2, 1, 0].map((i) => {
    const end = addDays(date, -i * 7);
    return periodStats(sessions, addDays(end, -6), end).total.minutes;
  });
  const activeWeeks = weeklyMinutes.filter((m) => m > 0).length;
  const variability = weeklyVariability(weeklyMinutes);

  const components: ScoreComponent[] = [
    comp(
      'Trainingstage',
      stats.total.sessions > 0 ? scoreBetween(sessionsPerWeek, 1, targetPerWeek) : null,
      0.3,
      stats.total.sessions > 0
        ? `${sessionsPerWeek.toFixed(1)} Einheiten/Woche · Ziel ${targetPerWeek}`
        : 'Noch keine Einheiten in den letzten 4 Wochen',
    ),
    comp(
      'Plan-Umsetzung',
      adherence,
      0.26,
      adherence != null
        ? `${completed.length} von ${planned.length} geplanten Einheiten absolviert`
        : 'Noch zu wenige abgeschlossene Einheiten für eine Quote',
    ),
    comp(
      'Keine langen Pausen',
      stats.total.sessions > 0 ? scoreBetween(longestGap, 7, 1) : null,
      0.22,
      stats.total.sessions > 0
        ? `Längste Pause: ${longestGap} Tag${longestGap === 1 ? '' : 'e'}`
        : 'Noch keine Daten',
    ),
    comp(
      'Gleichmäßige Wochen',
      activeWeeks >= 2 ? scoreBetween(variability, 0.7, 0.15) : null,
      0.22,
      activeWeeks >= 2
        ? `${activeWeeks} von 4 Wochen aktiv, Schwankung ${Math.round(variability * 100)} %`
        : 'Noch keine 2 vergleichbaren Wochen',
    ),
  ];

  const score = combine(components);
  return {
    key: 'consistency',
    score,
    weight: PILLAR_WEIGHTS.consistency,
    contribution: round1(score * PILLAR_WEIGHTS.consistency),
    components,
    lever: pickLever(components, {
      Trainingstage: `Auf ${targetPerWeek} Trainingstage pro Woche kommen — auch kurze Einheiten zählen.`,
      'Plan-Umsetzung': 'Weniger, aber realistischer planen schlägt ehrgeizige Pläne, die liegen bleiben.',
      'Keine langen Pausen': 'Nach der Nachtschicht lieber 20 Minuten locker als gar nichts.',
      'Gleichmäßige Wochen': 'Umfang gleichmäßiger verteilen statt eine große Woche und dann Einbruch.',
    }),
  };
}

function recoveryPillar(input: ScoreInput): Pillar {
  const { readinessHistory, sleepHours, settings, sessions, date } = input;
  const scores = readinessHistory.map((r) => r.score).filter((s): s is number => s != null);
  const sleeps = sleepHours.filter((s): s is number => s != null);
  const loadPoint = periodStats(sessions, addDays(date, -6), date);
  const series = input.sessions.length > 0 ? loadAcwr(input) : null;

  const components: ScoreComponent[] = [
    comp(
      'Readiness Ø',
      scores.length >= 3 ? average(scores) : null,
      0.36,
      scores.length >= 3
        ? `${Math.round(average(scores))} im Schnitt über ${scores.length} Tage`
        : 'Noch zu wenige Check-ins',
    ),
    comp(
      'Schlafdauer',
      sleeps.length >= 3 ? scoreBetween(average(sleeps), settings.recovery.sleepHoursTarget - 2.5, settings.recovery.sleepHoursTarget) : null,
      0.34,
      sleeps.length >= 3
        ? `${average(sleeps).toFixed(1)} h Ø · Ziel ${settings.recovery.sleepHoursTarget} h`
        : 'Noch zu wenige Schlafdaten',
    ),
    comp(
      'Belastungsverhältnis',
      series != null ? acwrScore(series, settings.recovery.acwrCeiling) : null,
      0.3,
      series != null
        ? `ACWR ${series.toFixed(2)} (sicher: 0,80–${settings.recovery.acwrCeiling.toFixed(2)})`
        : 'Noch keine Belastungshistorie',
    ),
  ];

  const score = combine(components);
  return {
    key: 'recovery',
    score,
    weight: PILLAR_WEIGHTS.recovery,
    contribution: round1(score * PILLAR_WEIGHTS.recovery),
    components,
    lever: pickLever(components, {
      'Readiness Ø': 'Täglicher Check-in macht die Empfehlung deutlich präziser.',
      Schlafdauer: `${settings.recovery.sleepHoursTarget} h sind bei Schichtdienst das wichtigste Trainingsmittel — auch geteilter Schlaf zählt.`,
      Belastungsverhältnis:
        loadPoint.total.minutes > 0
          ? 'Umfang in kleineren Schritten steigern, damit das akute Verhältnis im Rahmen bleibt.'
          : 'Regelmäßig trainieren, damit sich eine Belastungsbasis aufbaut.',
    }),
  };
}

function mobilityPillar(input: ScoreInput): Pillar {
  const { sessions, date, settings } = input;
  const fourWeek = periodStats(sessions, addDays(date, -27), date);
  const minutes = fourWeek.bySport.mobility.minutes / 4;
  const sessionsPerWeek = fourWeek.bySport.mobility.sessions / 4;

  const components: ScoreComponent[] = [
    comp(
      'Mobility-Minuten',
      fourWeek.bySport.mobility.sessions > 0
        ? scoreBetween(minutes, 0, settings.training.mobilityMinutesTarget)
        : null,
      0.6,
      fourWeek.bySport.mobility.sessions > 0
        ? `${Math.round(minutes)} min/Woche · Ziel ${settings.training.mobilityMinutesTarget} min`
        : 'Noch keine Mobility-Einheiten erfasst',
    ),
    comp(
      'Häufigkeit',
      fourWeek.bySport.mobility.sessions > 0 ? scoreBetween(sessionsPerWeek, 0, 3) : null,
      0.4,
      fourWeek.bySport.mobility.sessions > 0
        ? `${sessionsPerWeek.toFixed(1)}× pro Woche`
        : 'Kurze Einheiten zählen — 10 Minuten reichen',
    ),
  ];

  const score = combine(components);
  return {
    key: 'mobility',
    score,
    weight: PILLAR_WEIGHTS.mobility,
    contribution: round1(score * PILLAR_WEIGHTS.mobility),
    components,
    lever: pickLever(components, {
      'Mobility-Minuten': '10 Minuten Hüfte und Sprunggelenk nach jedem Lauf reichen für das Wochenziel.',
      Häufigkeit: 'Mobility an einen bestehenden Anker koppeln — direkt nach dem Duschen.',
    }),
  };
}

function habitsPillar(input: ScoreInput): Pillar {
  const pct = input.habitCompletionPct;
  const components: ScoreComponent[] = [
    comp(
      'Habit-Erfüllung',
      pct,
      1,
      pct != null ? `${Math.round(pct)} % über die letzten 28 Tage` : 'Noch keine Habit-Einträge',
    ),
  ];
  const score = combine(components);
  return {
    key: 'habits',
    score,
    weight: PILLAR_WEIGHTS.habits,
    contribution: round1(score * PILLAR_WEIGHTS.habits),
    components,
    lever:
      pct != null && pct < 80
        ? 'Lieber drei Habits zuverlässig als zehn halb — den schwächsten Habit diese Woche priorisieren.'
        : null,
  };
}

/* ------------------------------------------------------------------ *
 * Assembly
 * ------------------------------------------------------------------ */

export function computeHybridScore(input: ScoreInput): HybridScore {
  const raw = [
    endurancePillar(input),
    strengthPillar(input),
    consistencyPillar(input),
    recoveryPillar(input),
    habitsPillar(input),
    mobilityPillar(input),
  ];

  // A pillar with no data at all is not a pillar scoring zero — it is a pillar
  // that cannot be judged yet. Its weight is redistributed across the pillars
  // that do have data, exactly as components are handled inside a pillar.
  const measured = raw.filter((p) => p.components.some((c) => c.hasData));
  const measuredWeight = measured.reduce((sum, p) => sum + p.weight, 0);

  const pillars = raw.map((p) => {
    const hasData = measured.includes(p);
    const weight = hasData && measuredWeight > 0 ? p.weight / measuredWeight : 0;
    return { ...p, weight, contribution: round1(p.score * weight) };
  });

  const total = round1(pillars.reduce((sum, p) => sum + p.contribution, 0));

  const allComponents = raw.flatMap((p) => p.components);
  const coverage = allComponents.length
    ? Math.round((allComponents.filter((c) => c.hasData).length / allComponents.length) * 100)
    : 0;

  // The levers with the biggest potential: low pillar score × high weight.
  const levers = pillars
    .filter((p) => p.lever)
    .map((p) => ({
      pillar: p.key,
      text: p.lever as string,
      gain: round1((100 - p.score) * p.weight),
    }))
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 3);

  return {
    date: input.date,
    total: Math.round(total),
    pillars,
    levers,
    coverage,
    // Below this the number says more about missing data than about fitness,
    // so the UI presents it as provisional rather than as a verdict.
    provisional: coverage < 45,
  };
}

export type { ScoreInput };

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function pickLever(components: ScoreComponent[], texts: Record<string, string>): string | null {
  const weakest = components
    .filter((c) => c.hasData)
    .sort((a, b) => a.score * a.weight - b.score * b.weight)[0];
  const missing = components.find((c) => !c.hasData);
  if (weakest && weakest.score < 75) return texts[weakest.label] ?? null;
  if (missing) return texts[missing.label] ?? null;
  return null;
}

function weeklyVariability(minutes: number[]): number {
  const active = minutes.filter((m) => m > 0);
  if (active.length < 2) return 1;
  const mean = average(active);
  if (mean === 0) return 1;
  const variance = average(active.map((m) => (m - mean) ** 2));
  return Math.sqrt(variance) / mean;
}

function loadAcwr(input: ScoreInput): number | null {
  const acute = periodStats(input.sessions, addDays(input.date, -6), input.date).total.load / 7;
  const chronic = periodStats(input.sessions, addDays(input.date, -27), input.date).total.load / 28;
  if (chronic < 1) return null;
  return acute / chronic;
}

/** Full marks inside the safe band, falling off on both sides. */
function acwrScore(acwr: number, ceiling: number): number {
  if (acwr >= 0.8 && acwr <= ceiling) return 100;
  if (acwr < 0.8) return clamp(scoreBetween(acwr, 0.2, 0.8), 25, 100);
  return clamp(100 - (acwr - ceiling) * 130, 0, 100);
}
