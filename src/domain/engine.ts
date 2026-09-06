import type {
  AppSettings,
  DailyRecommendation,
  Goal,
  ISODate,
  IntensityKey,
  MuscleGroup,
  Reason,
  Recommendation,
  SessionTemplate,
  SportKey,
  TrainingSession,
} from './types.ts';
import type { ShiftContext } from './shifts.ts';
import type { Readiness } from './readiness.ts';
import type { WeekTarget } from './phases.ts';
import type { Preferences } from './personalization.ts';
import type { Outlook } from './outlook.ts';
import { ENDURANCE_SPORTS } from './types.ts';
import { addDays, diffDays, startOfWeek } from './date.ts';
import { adjustedTrainingMinutes, suggestStartTime } from './shifts.ts';
import { preferenceBonus } from './personalization.ts';
import { SPORT_META, formatDuration, weekdayLong } from './format.ts';
import {
  INTENSITY_RPE,
  LOAD_SCALE,
  clamp,
  consecutiveTrainingDays,
  daysSince,
  effectiveDistance,
  effectiveDuration,
  intensityRank,
  isAtOrBelow,
  isHardSession,
  isLongSession,
  loadStateOn,
  periodStats,
  round1,
} from './load.ts';

/* ------------------------------------------------------------------ *
 * Context assembly
 * ------------------------------------------------------------------ */

export interface EngineContext {
  date: ISODate;
  shift: ShiftContext;
  readiness: Readiness;
  target: WeekTarget;
  settings: AppSettings;
  sessions: TrainingSession[];
  goals: Goal[];
  preferences: Preferences;
  /** What the next days offer: capacity, sleep and already-committed load. */
  outlook: Outlook;
}

interface DayFacts {
  availableMinutes: number;
  weekMinutesDone: number;
  weekMinutesPlanned: number;
  weekSessions: number;
  weekHardSessions: number;
  weekHardMinutes: number;
  weekMinutesBySport: Partial<Record<SportKey, number>>;
  weekStrengthSessions: number;
  remainingWeekDays: number;
  daysSinceBySport: Partial<Record<SportKey, number | null>>;
  hoursSinceHard: number | null;
  daysSinceLongRun: number | null;
  daysSinceLongRide: number | null;
  consecutiveDays: number;
  /** Completed sessions in the last 28 days — the basis for trusting any ramp. */
  sessionsLast28: number;
  /** Longest single completed session in that window, in minutes. */
  longestRecentMinutes: number;
  muscleGroupHoursAgo: Partial<Record<MuscleGroup, number>>;
  acwr: number;
  tsb: number;
  ctl: number;
  weeklyRunKm: number;
  recentLongRunKm: number;
  plannedToday: TrainingSession[];
  alreadyDoneTodayMinutes: number;
}

function gatherFacts(ctx: EngineContext): DayFacts {
  const { date, sessions, settings } = ctx;
  const weekStart = startOfWeek(date, settings.weekStartsOn);
  const weekEnd = addDays(weekStart, 6);

  const done = periodStats(sessions, weekStart, date, {});
  const plannedWeek = sessions.filter(
    (s) => s.date >= date && s.date <= weekEnd && s.status === 'planned',
  );

  const weekMinutesBySport: Partial<Record<SportKey, number>> = {};
  for (const sport of Object.keys(done.bySport) as SportKey[]) {
    weekMinutesBySport[sport] = done.bySport[sport].minutes;
  }

  const daysSinceBySport: Partial<Record<SportKey, number | null>> = {};
  for (const sport of Object.keys(SPORT_META) as SportKey[]) {
    daysSinceBySport[sport] = daysSince(sessions, date, (s) => s.sport === sport);
  }

  const lastHardDays = daysSince(sessions, date, isHardSession);
  const muscleGroupHoursAgo: Partial<Record<MuscleGroup, number>> = {};
  for (const s of sessions) {
    if (s.status !== 'completed' || s.date >= date) continue;
    const hours = diffDays(date, s.date) * 24;
    for (const g of s.muscleGroups) {
      const prev = muscleGroupHoursAgo[g];
      if (prev == null || hours < prev) muscleGroupHoursAgo[g] = hours;
    }
  }

  const loadState = loadStateOn(sessions, date);
  const todaySessions = sessions.filter((s) => s.date === date);

  // Days left in the week that carry any training capacity at all.
  let remainingWeekDays = 0;
  for (let d = addDays(date, 1); d <= weekEnd; d = addDays(d, 1)) remainingWeekDays += 1;

  const recentRuns = sessions.filter(
    (s) => s.status === 'completed' && s.sport === 'run' && s.date >= addDays(date, -28) && s.date < date,
  );
  const recentLongRunKm = recentRuns.reduce((max, s) => Math.max(max, effectiveDistance(s)), 0);

  const recentCompleted = sessions.filter(
    (s) => s.status === 'completed' && s.date >= addDays(date, -28) && s.date < date,
  );
  const longestRecentMinutes = recentCompleted.reduce(
    (max, s) => Math.max(max, effectiveDuration(s)),
    0,
  );

  return {
    availableMinutes: adjustedTrainingMinutes(ctx.shift),
    weekMinutesDone: done.total.minutes,
    weekMinutesPlanned: plannedWeek.reduce((sum, s) => sum + effectiveDuration(s), 0),
    weekSessions: done.total.sessions,
    weekHardSessions: done.hardSessions,
    weekHardMinutes: done.byIntensity.hard,
    weekMinutesBySport,
    weekStrengthSessions: done.bySport.strength.sessions,
    remainingWeekDays,
    daysSinceBySport,
    hoursSinceHard: lastHardDays == null ? null : lastHardDays * 24,
    daysSinceLongRun: daysSince(sessions, date, (s) => s.sport === 'run' && isLongSession(s)),
    daysSinceLongRide: daysSince(sessions, date, (s) => s.sport === 'bike' && isLongSession(s)),
    consecutiveDays: consecutiveTrainingDays(sessions, date),
    muscleGroupHoursAgo,
    acwr: loadState.acwr,
    tsb: loadState.tsb,
    ctl: loadState.ctl,
    weeklyRunKm: done.bySport.run.distanceKm,
    recentLongRunKm,
    sessionsLast28: recentCompleted.length,
    longestRecentMinutes,
    plannedToday: todaySessions.filter((s) => s.status === 'planned'),
    alreadyDoneTodayMinutes: todaySessions
      .filter((s) => s.status === 'completed')
      .reduce((sum, s) => sum + effectiveDuration(s), 0),
  };
}

/* ------------------------------------------------------------------ *
 * Candidate templates
 * ------------------------------------------------------------------ */

interface Archetype {
  id: string;
  sport: SportKey;
  title: string;
  intensity: IntensityKey;
  /** Ideal duration in minutes. */
  preferredMin: number;
  /** Below this the session stops being worth doing. */
  floorMin: number;
  goal: string;
  muscleGroups: MuscleGroup[];
  isLong?: boolean;
  isRest?: boolean;
  /** Pace used to derive a distance estimate, seconds per km. */
  paceKey?: 'z2' | 'threshold';
}

function archetypes(ctx: EngineContext, facts: DayFacts): Archetype[] {
  const t = ctx.settings.training;
  // The long run grows from what the athlete has actually run recently, capped
  // by the share-of-week rule. It never jumps more than 15 % over the best
  // recent long run.
  const weeklyRunTarget = ctx.target.bySport.run ?? 0;
  const longRunMinutes = clamp(
    Math.max(
      75,
      Math.min(
        weeklyRunTarget * t.longRunShareCap,
        facts.recentLongRunKm > 0 ? (facts.recentLongRunKm * 1.15 * t.z2PaceSecPerKm) / 60 : 90,
      ),
    ),
    75,
    300,
  );

  return [
    {
      id: 'run_z2',
      sport: 'run',
      title: 'Zone-2-Lauf',
      intensity: 'easy',
      preferredMin: 55,
      floorMin: 25,
      goal: 'Aerobe Grundlage, Fettstoffwechsel, Laufökonomie',
      muscleGroups: ['legs_quads', 'legs_hamstrings', 'calves'],
      paceKey: 'z2',
    },
    {
      id: 'run_long',
      sport: 'run',
      title: 'Long Run',
      intensity: 'easy',
      preferredMin: Math.round(longRunMinutes),
      floorMin: 75,
      goal: 'Grundlagenausdauer für das 100-km-Ziel, Ermüdungswiderstand',
      muscleGroups: ['legs_quads', 'legs_hamstrings', 'calves', 'glutes'],
      isLong: true,
      paceKey: 'z2',
    },
    {
      id: 'run_tempo',
      sport: 'run',
      title: 'Tempolauf an der Schwelle',
      intensity: 'threshold',
      preferredMin: 50,
      floorMin: 35,
      goal: 'Laktatschwelle anheben — zahlt auf die 5-km-Zeit ein',
      muscleGroups: ['legs_quads', 'legs_hamstrings', 'calves'],
      paceKey: 'threshold',
    },
    {
      id: 'run_intervals',
      sport: 'run',
      title: 'VO2max-Intervalle',
      intensity: 'vo2',
      preferredMin: 55,
      floorMin: 40,
      goal: 'Maximale Sauerstoffaufnahme und Laufökonomie',
      muscleGroups: ['legs_quads', 'legs_hamstrings', 'calves'],
      paceKey: 'threshold',
    },
    {
      id: 'run_recovery',
      sport: 'run',
      title: 'Regenerationslauf',
      intensity: 'recovery',
      preferredMin: 30,
      floorMin: 20,
      goal: 'Durchblutung fördern, ohne neue Ermüdung zu erzeugen',
      muscleGroups: ['legs_quads', 'calves'],
      paceKey: 'z2',
    },
    {
      id: 'bike_z2',
      sport: 'bike',
      title: 'Grundlagen-Ride',
      intensity: 'easy',
      preferredMin: 80,
      floorMin: 40,
      goal: 'Aerober Umfang ohne Laufbelastung für die Gelenke',
      muscleGroups: ['legs_quads', 'glutes'],
    },
    {
      id: 'bike_long',
      sport: 'bike',
      title: 'Long Ride',
      intensity: 'easy',
      preferredMin: 150,
      floorMin: 100,
      goal: 'Langer aerober Reiz mit geringer Aufprallbelastung',
      muscleGroups: ['legs_quads', 'glutes'],
      isLong: true,
    },
    {
      id: 'bike_ftp',
      sport: 'bike',
      title: 'FTP-Intervalle (Direto)',
      intensity: 'threshold',
      preferredMin: 65,
      floorMin: 45,
      goal: `FTP von ${t.ftpWatts} W Richtung Ziel anheben`,
      muscleGroups: ['legs_quads', 'glutes'],
    },
    {
      id: 'bike_recovery',
      sport: 'bike',
      title: 'Recovery Spin',
      intensity: 'recovery',
      preferredMin: 40,
      floorMin: 20,
      goal: 'Lockeres Kurbeln zur Regeneration',
      muscleGroups: ['legs_quads'],
    },
    {
      id: 'swim_technique',
      sport: 'swim',
      title: 'Techniktraining',
      intensity: 'easy',
      preferredMin: 45,
      floorMin: 30,
      goal: 'Wasserlage und Effizienz — größter Hebel bei 2:00/100 m',
      muscleGroups: ['back', 'shoulders', 'core'],
    },
    {
      id: 'swim_intervals',
      sport: 'swim',
      title: 'Schwimm-Intervalle',
      intensity: 'threshold',
      preferredMin: 45,
      floorMin: 30,
      goal: 'Schwimmspezifische Ausdauer',
      muscleGroups: ['back', 'shoulders', 'core'],
    },
    {
      id: 'strength_full',
      sport: 'strength',
      title: 'Ganzkörper-Kraft',
      intensity: 'moderate',
      preferredMin: 55,
      floorMin: 35,
      goal: 'Maximalkraft erhalten und aufbauen, Verletzungsprophylaxe',
      muscleGroups: ['legs_quads', 'glutes', 'back', 'chest', 'core'],
    },
    {
      id: 'strength_upper',
      sport: 'strength',
      title: 'Oberkörper-Kraft',
      intensity: 'moderate',
      preferredMin: 45,
      floorMin: 30,
      goal: 'Pull-ups und Push-ups gezielt steigern',
      muscleGroups: ['back', 'chest', 'shoulders', 'arms', 'core'],
    },
    {
      id: 'strength_lower',
      sport: 'strength',
      title: 'Unterkörper & Rumpf',
      intensity: 'moderate',
      preferredMin: 50,
      floorMin: 30,
      goal: 'Beinkraft und Rumpfstabilität für lange Läufe',
      muscleGroups: ['legs_quads', 'legs_hamstrings', 'glutes', 'calves', 'core'],
    },
    {
      id: 'strength_short',
      sport: 'strength',
      title: 'Kurze Athletikeinheit',
      intensity: 'moderate',
      preferredMin: 25,
      floorMin: 15,
      goal: 'Kraft erhalten, wenn wenig Zeit da ist',
      muscleGroups: ['core', 'glutes', 'legs_hamstrings'],
    },
    {
      id: 'mobility',
      sport: 'mobility',
      title: 'Mobility & Dehnen',
      intensity: 'recovery',
      preferredMin: 20,
      floorMin: 10,
      goal: 'Beweglichkeit von Hüfte, Sprunggelenk und Brustwirbelsäule',
      muscleGroups: ['full_body'],
    },
    {
      id: 'recovery_walk',
      sport: 'recovery',
      title: 'Lockerer Spaziergang',
      intensity: 'recovery',
      preferredMin: 30,
      floorMin: 15,
      goal: 'Aktive Erholung ohne Trainingsreiz',
      muscleGroups: [],
    },
    {
      id: 'rest',
      sport: 'recovery',
      title: 'Ruhetag',
      intensity: 'recovery',
      preferredMin: 0,
      floorMin: 0,
      goal: 'Superkompensation zulassen — Erholung ist Teil des Trainings',
      muscleGroups: [],
      isRest: true,
    },
  ];
}

function toTemplate(a: Archetype, durationMin: number, ctx: EngineContext): SessionTemplate {
  const t = ctx.settings.training;
  let distanceKm: number | undefined;
  if (a.paceKey && durationMin > 0) {
    const pace = a.paceKey === 'z2' ? t.z2PaceSecPerKm : t.thresholdPaceSecPerKm;
    // Interval sessions spend part of the time on recovery, so use a blended pace.
    const blended = a.intensity === 'vo2' ? pace * 1.12 : pace;
    distanceKm = round1((durationMin * 60) / blended);
  }
  return {
    id: a.id,
    sport: a.sport,
    title: a.title,
    intensity: a.intensity,
    durationMin,
    distanceKm,
    goal: a.goal,
    muscleGroups: a.muscleGroups,
    isLong: a.isLong,
    isRest: a.isRest,
  };
}

/* ------------------------------------------------------------------ *
 * Scoring
 * ------------------------------------------------------------------ */

interface Scored {
  template: SessionTemplate;
  score: number;
  reasons: Reason[];
  blockedBy?: string;
}

function evaluate(a: Archetype, ctx: EngineContext, facts: DayFacts): Scored {
  const { settings, target, readiness, shift } = ctx;
  const reasons: Reason[] = [];
  let score = 50;

  const add = (text: string, points: number, impact: Reason['impact'] = points >= 0 ? 'positive' : 'negative') => {
    score += points;
    reasons.push({ text, impact, points: Math.round(points) });
  };

  /* ---------- Rest is always available ---------- */
  if (a.isRest) {
    const template = toTemplate(a, 0, ctx);
    const restReasons: Reason[] = [];
    let restScore = 24;
    if (readiness.level === 'recovery') {
      restScore += 40;
      restReasons.push({ text: 'Readiness im roten Bereich', impact: 'positive', points: 40 });
    }
    if (facts.consecutiveDays >= 4) {
      const points = (facts.consecutiveDays - 3) * 22;
      restScore += points;
      restReasons.push({
        text: `${facts.consecutiveDays} Trainingstage in Folge`,
        impact: 'positive',
        points,
      });
    }
    if (facts.acwr > settings.recovery.acwrCeiling) {
      restScore += 25;
      restReasons.push({
        text: `Belastungssprung zu groß (ACWR ${facts.acwr.toFixed(2)})`,
        impact: 'positive',
        points: 25,
      });
    }
    if (shift.type?.training.rating === 'red') {
      restScore += 20;
      restReasons.push({
        text: shift.type.training.note,
        impact: 'positive',
        points: 20,
      });
    }
    if (facts.weekMinutesDone >= target.minutes) {
      restScore += 15;
      restReasons.push({ text: 'Wochenziel bereits erreicht', impact: 'positive', points: 15 });
    }
    // A rest day is worth more right before a day that can actually be used.
    const nextGreen = ctx.outlook.nextGreenDay;
    if (nextGreen && nextGreen.daysAhead <= 2) {
      const points = nextGreen.daysAhead === 1 ? 16 : 10;
      restScore += points;
      restReasons.push({
        text: `${weekdayLong(nextGreen.date)} ist ${nextGreen.shift?.label ?? 'frei'} — heute erholen macht diesen Tag wertvoller`,
        impact: 'positive',
        points,
      });
    }
    if (ctx.outlook.sleepConstrainedAhead) {
      restScore += 12;
      restReasons.push({
        text: `Die nächsten Tage lassen im Schnitt nur ${ctx.outlook.expectedSleepAhead} h Schlaf zu`,
        impact: 'positive',
        points: 12,
      });
    }
    // Conversely: if the coming days offer almost nothing, today is the chance.
    if (
      ctx.outlook.restOfWeekComplete &&
      ctx.outlook.restOfWeekFreeMinutes < 60 &&
      facts.weekMinutesDone < target.minutes * 0.7
    ) {
      restScore -= 20;
      restReasons.push({
        text: `Rest der Woche bietet nur noch ${formatDuration(ctx.outlook.restOfWeekFreeMinutes)} — heute ist die Gelegenheit`,
        impact: 'negative',
        points: -20,
      });
    }
    if (restReasons.length === 0) {
      restReasons.push({
        text: 'Immer verfügbar — ein geplanter Ruhetag kostet keine Streak',
        impact: 'neutral',
      });
    }
    return { template, score: restScore, reasons: restReasons };
  }

  /* ---------- Duration fit ---------- */
  const budget = Math.max(0, facts.availableMinutes - facts.alreadyDoneTodayMinutes);
  const duration = Math.min(a.preferredMin, budget);
  const template = toTemplate(a, duration, ctx);

  if (duration < a.floorMin) {
    return {
      template: toTemplate(a, a.floorMin, ctx),
      score: 0,
      reasons: [
        {
          text: shift.type
            ? `${shift.type.label} lässt nur ${formatDuration(budget)} zu — diese Einheit braucht mindestens ${formatDuration(a.floorMin)}`
            : `Zeitfenster zu klein (${formatDuration(budget)})`,
          impact: 'negative',
        },
      ],
      blockedBy: 'Zeitfenster zu klein',
    };
  }

  /* ---------- Hard gates ---------- */
  const shiftCeiling = shift.type?.training.maxIntensity ?? 'max';
  if (!isAtOrBelow(a.intensity, shiftCeiling)) {
    return {
      template,
      score: 0,
      reasons: [
        {
          text: shift.type?.training.note ?? 'Die Schicht lässt diese Intensität nicht zu',
          impact: 'negative',
        },
      ],
      blockedBy: `${shift.type?.label ?? 'Schicht'} erlaubt maximal ${intensityLabel(shiftCeiling)}`,
    };
  }

  if (readiness.score != null && !isAtOrBelow(a.intensity, readiness.intensityCeiling)) {
    return {
      template,
      score: 0,
      reasons: [{ text: readiness.headline, impact: 'negative' }],
      blockedBy: `Readiness ${readiness.score} erlaubt maximal ${intensityLabel(readiness.intensityCeiling)}`,
    };
  }

  const isHardCandidate = intensityRank(a.intensity) >= intensityRank('threshold') || a.isLong;
  if (isHardCandidate && facts.hoursSinceHard != null) {
    if (facts.hoursSinceHard < settings.training.minHoursBetweenHard) {
      return {
        template,
        score: 0,
        reasons: [
          {
            text: `Letzte harte Einheit vor ${Math.round(facts.hoursSinceHard)} h — mindestens ${settings.training.minHoursBetweenHard} h Abstand einplanen`,
            impact: 'negative',
          },
        ],
        blockedBy: 'Zu kurzer Abstand zur letzten harten Einheit',
      };
    }
  }

  if (a.sport === 'strength') {
    const stale = a.muscleGroups.find((g) => {
      const hours = facts.muscleGroupHoursAgo[g];
      return hours != null && hours < settings.training.strengthRecoveryHours;
    });
    if (stale) {
      return {
        template,
        score: 0,
        reasons: [
          {
            text: `${muscleLabel(stale)} wurde vor ${Math.round(facts.muscleGroupHoursAgo[stale] ?? 0)} h belastet`,
            impact: 'negative',
          },
        ],
        blockedBy: 'Muskelgruppe noch nicht erholt',
      };
    }
  }

  /*
   * Cold start. With fewer than four logged sessions in the last four weeks the
   * app knows nothing about current capacity, and the safe assumption is not an
   * optimistic one. Long and hard sessions are withheld until a baseline exists,
   * and durations stay near what has actually been done recently.
   */
  const COLD_START_SESSIONS = 4;
  const coldStart = facts.sessionsLast28 < COLD_START_SESSIONS;
  if (coldStart && (a.isLong || intensityRank(a.intensity) >= intensityRank('threshold'))) {
    return {
      template,
      score: 0,
      reasons: [
        {
          text: `Erst ${facts.sessionsLast28} erfasste Einheiten in den letzten 4 Wochen — für lange oder intensive Einheiten fehlt die Belastungsbasis`,
          impact: 'negative',
        },
      ],
      blockedBy: 'Noch keine Belastungsbasis',
    };
  }
  if (coldStart && duration > 75) {
    return {
      template,
      score: 0,
      reasons: [
        {
          text: 'Zu wenig Historie, um eine Einheit dieser Länge zu verantworten. Erst ein paar Wochen aufbauen.',
          impact: 'negative',
        },
      ],
      blockedBy: 'Noch keine Belastungsbasis',
    };
  }

  // A long session already committed within two days makes a second one today
  // a scheduling error, not a training decision.
  const committedLong = ctx.outlook.nextLongPlanned;
  if (a.isLong && committedLong && committedLong.daysAhead <= 2) {
    return {
      template,
      score: 0,
      reasons: [
        {
          text: `Für ${weekdayLong(committedLong.date)} ist bereits eine lange Einheit geplant`,
          impact: 'negative',
        },
      ],
      blockedBy: 'Lange Einheit steht schon im Plan',
    };
  }

  const isEasyish = intensityRank(a.intensity) <= intensityRank('easy');
  if (facts.acwr > settings.recovery.acwrCeiling && !isEasyish) {
    return {
      template,
      score: 0,
      reasons: [
        {
          text: `Akut:Chronisch-Verhältnis bei ${facts.acwr.toFixed(2)} — über deinem Limit von ${settings.recovery.acwrCeiling}`,
          impact: 'negative',
        },
      ],
      blockedBy: 'Belastungssprung zu groß',
    };
  }

  if (facts.weekSessions >= settings.training.maxSessionsPerWeek && a.sport !== 'mobility') {
    return {
      template,
      score: 0,
      reasons: [
        { text: `Bereits ${facts.weekSessions} Einheiten diese Woche`, impact: 'negative' },
      ],
      blockedBy: 'Wöchentliches Einheiten-Limit erreicht',
    };
  }

  const isRegenerative = a.intensity === 'recovery' || a.sport === 'mobility';
  if (facts.consecutiveDays >= 5 && !isRegenerative) {
    return {
      template,
      score: 0,
      reasons: [
        { text: `${facts.consecutiveDays} Trainingstage in Folge ohne Pause`, impact: 'negative' },
      ],
      blockedBy: 'Zu viele Trainingstage am Stück',
    };
  }

  if (facts.weekMinutesDone > target.minutes * 1.25 && !isEasyish && a.sport !== 'mobility') {
    return {
      template,
      score: 0,
      reasons: [
        {
          text: `Wochenumfang bereits ${formatDuration(facts.weekMinutesDone)} von ${formatDuration(target.minutes)} Ziel`,
          impact: 'negative',
        },
      ],
      blockedBy: 'Wochenumfang deutlich über Ziel',
    };
  }

  /* ---------- Soft scoring ---------- */

  // 1. Weekly volume gap for this sport.
  const sportTarget = target.bySport[a.sport] ?? 0;
  const sportDone = facts.weekMinutesBySport[a.sport] ?? 0;
  if (sportTarget > 0) {
    const fill = clamp((sportTarget - sportDone) / sportTarget, -0.5, 1);
    if (fill > 0.15) {
      add(
        `${SPORT_META[a.sport].label}: ${formatDuration(sportDone)} von ${formatDuration(sportTarget)} Wochenziel`,
        fill * 26,
      );
    } else if (fill < 0) {
      add(`${SPORT_META[a.sport].label} diese Woche bereits über Ziel`, fill * 20);
    }
  }

  // 2. Overall weekly volume gap.
  const weekFill = target.minutes > 0 ? (facts.weekMinutesDone + facts.weekMinutesPlanned) / target.minutes : 1;
  if (weekFill < 0.75 && facts.remainingWeekDays <= 3) {
    add('Wochenumfang liegt zurück, nur noch wenige Trainingstage übrig', 12);
  } else if (weekFill > 1.05 && !isEasyish) {
    add('Wochenumfang bereits erreicht', -14);
  }

  // 3. Recency per sport.
  const since = facts.daysSinceBySport[a.sport];
  if (since == null) {
    add(`${SPORT_META[a.sport].label} zuletzt nicht in den Daten — Zeit dafür`, 10);
  } else if (since >= 4) {
    add(`Letzte Einheit ${SPORT_META[a.sport].label} vor ${since} Tagen`, Math.min(16, since * 3));
  } else if (since <= 1) {
    add(`${SPORT_META[a.sport].label} erst gestern`, -9);
  }

  // 4. Intensity distribution vs. the phase's polarisation target.
  const totalWeekMinutes = Math.max(1, facts.weekMinutesDone);
  const hardShare = facts.weekHardMinutes / totalWeekMinutes;
  if (isHardCandidate && !a.isLong) {
    if (hardShare >= target.intensityDistribution.hard * 1.4) {
      add(
        `Harter Anteil dieser Woche schon bei ${Math.round(hardShare * 100)} % (Ziel ${Math.round(target.intensityDistribution.hard * 100)} %)`,
        -22,
      );
    } else if (facts.weekHardSessions === 0 && facts.remainingWeekDays <= 4) {
      add('Noch keine intensive Einheit diese Woche', 16);
    }
  }
  if (isEasyish && hardShare > target.intensityDistribution.hard) {
    add('Lockere Einheit bringt die Woche zurück ins polarisierte Verhältnis', 10);
  }

  // 5. Readiness fit.
  if (readiness.score != null) {
    if (readiness.level === 'ready' && isHardCandidate) {
      add(`Readiness ${readiness.score} — der Körper verträgt einen Reiz`, 14);
    } else if (readiness.level === 'ready' && a.intensity === 'recovery') {
      add('Für eine reine Regenerationseinheit bist du zu frisch', -10);
    } else if (readiness.level === 'moderate' && a.intensity === 'easy') {
      add('Lockere Einheit passt zur aktuellen Erholung', 12);
    } else if (readiness.level === 'recovery' && a.intensity === 'recovery') {
      add('Regeneration ist heute die richtige Entscheidung', 18);
    }
  }

  // 6. Shift fit.
  const rating = shift.type?.training.rating;
  if (rating === 'green') {
    if (a.isLong) add(`${shift.type?.label}: idealer Tag für die lange Einheit`, 20);
    else if (isHardCandidate) add(`${shift.type?.label}: Zeit für eine Qualitätseinheit`, 10);
  } else if (rating === 'amber') {
    if (a.isLong) add(`${shift.type?.label} bietet zu wenig Puffer für eine lange Einheit`, -18);
    if (duration <= 60) add(`Kompakte Einheit passt zur ${shift.type?.label}`, 8);
  }
  if (shift.next?.key === 'night' && isHardCandidate) {
    add('Morgen Nachtschicht — harte Einheit heute belastet die Erholung doppelt', -10);
  }
  if (shift.previous?.key === 'night' && isHardCandidate) {
    add('Nach einer Nachtschicht ist die Belastungstoleranz reduziert', -12);
  }

  // 7a. Never jump more than ~25 % beyond the longest session of the last four
  // weeks — the single most common way runners get hurt building toward an ultra.
  if (a.isLong && facts.longestRecentMinutes > 0 && duration > facts.longestRecentMinutes * 1.25) {
    return {
      template,
      score: 0,
      reasons: [
        {
          text: `Längste Einheit der letzten 4 Wochen war ${formatDuration(facts.longestRecentMinutes)} — ein Sprung auf ${formatDuration(duration)} ist zu groß`,
          impact: 'negative',
        },
      ],
      blockedBy: 'Steigerung zur bisherigen Längsten zu groß',
    };
  }

  // 7. Long-run spacing and progression toward the ultra goal.
  if (a.isLong && a.sport === 'run') {
    const gap = facts.daysSinceLongRun;
    if (gap == null) add('Noch kein Long Run in den Daten — Basis für das 100-km-Ziel', 22);
    else if (gap >= 6) add(`Letzter Long Run vor ${gap} Tagen`, Math.min(26, gap * 3));
    else add(`Letzter Long Run erst vor ${gap} Tagen`, -30);
  }
  if (a.isLong && a.sport === 'bike') {
    const gap = facts.daysSinceLongRide;
    if (gap != null && gap < 5) add(`Letzter Long Ride vor ${gap} Tagen`, -20);
  }

  // 8. Strength frequency.
  if (a.sport === 'strength') {
    const needed = target.strengthSessions - facts.weekStrengthSessions;
    if (needed > 0) {
      add(`Noch ${needed} Krafteinheit${needed > 1 ? 'en' : ''} bis zum Wochenziel`, needed * 11);
    } else {
      add('Kraft-Wochenziel bereits erfüllt', -12);
    }
    // Strength protects muscle mass on a high-endurance plan — worth defending.
    if (facts.weekMinutesDone > 240 && facts.weekStrengthSessions === 0) {
      add('Viel Ausdauer ohne Kraftreiz — Muskulatur braucht einen Gegenpol', 12);
    }
  }

  // 9. Mobility baseline.
  if (a.sport === 'mobility') {
    const mobilityDone = facts.weekMinutesBySport.mobility ?? 0;
    if (mobilityDone < settings.training.mobilityMinutesTarget) {
      add(
        `Mobility diese Woche ${formatDuration(mobilityDone)} von ${formatDuration(settings.training.mobilityMinutesTarget)}`,
        10,
      );
    }
    if (rating === 'red') add('Passt auch in einen 12-h-Diensttag', 14);
  }

  // 10. Goal alignment.
  const primaryGoal = ctx.goals.find((g) => g.active && g.primary);
  if (primaryGoal?.sport === a.sport) {
    add(`Zahlt direkt auf "${primaryGoal.title}" ein`, 9);
  }

  // 11. Phase emphasis.
  if (target.phase) {
    const share = target.phase.sportFocus[a.sport] ?? 0;
    if (share >= 0.25) add(`${target.phase.label}-Phase betont ${SPORT_META[a.sport].label}`, 8);
    if (target.deload && isHardCandidate) add('Deload-Woche — Intensität bewusst zurücknehmen', -20);
    if (target.deload && isEasyish) add('Deload-Woche — lockere Einheiten sind genau richtig', 10);
  }

  // 12. Consecutive-day fatigue. Easy work is cheaper but not free — five days
  // of easy running still leaves no day for the adaptation to land.
  if (facts.consecutiveDays >= 3 && a.sport !== 'mobility') {
    const perDay = isEasyish ? 5 : 8;
    add(`${facts.consecutiveDays} Trainingstage in Folge`, -(facts.consecutiveDays - 2) * perDay);
  }

  // 13. Impact management — run volume is the main injury lever.
  if (a.sport === 'run' && facts.weeklyRunKm > 0) {
    const runTargetKm = ((target.bySport.run ?? 0) * 60) / settings.training.z2PaceSecPerKm;
    if (runTargetKm > 0 && facts.weeklyRunKm > runTargetKm * 1.15) {
      add(`Laufumfang bereits ${facts.weeklyRunKm.toFixed(0)} km diese Woche`, -14);
    }
  }
  if (ENDURANCE_SPORTS.includes(a.sport) && a.sport !== 'run') {
    const runSince = facts.daysSinceBySport.run;
    if (runSince != null && runSince <= 1 && a.intensity === 'easy') {
      add('Cross-Training entlastet die Laufmuskulatur', 7);
    }
  }

  // 14. Learned preferences.
  const bonus = preferenceBonus(ctx.preferences, a.sport, ctx.date);
  if (Math.abs(bonus) >= 2) {
    add(
      bonus > 0
        ? `${SPORT_META[a.sport].label} setzt du erfahrungsgemäß zuverlässig um`
        : `${SPORT_META[a.sport].label} lässt du an solchen Tagen oft ausfallen`,
      bonus,
    );
  }

  // 15. Time efficiency.
  if (duration < a.preferredMin) {
    add(`Auf ${formatDuration(duration)} gekürzt, damit es in den Tag passt`, -4, 'neutral');
  }

  /* ---------- Forward horizon ---------- */

  const outlook = ctx.outlook;

  // 16. Placement of key sessions. A long run belongs on the day that can carry
  // it, not on the first day the athlete happens to open the app.
  if (a.isLong) {
    const todayFree = Math.max(0, budget);
    const better = outlook.bestLongDay;
    if (rating !== 'green' && better && better.daysAhead <= 3) {
      add(
        `${weekdayLong(better.date)} ist ${better.shift?.label ?? 'frei'} — die lange Einheit passt dort deutlich besser`,
        -20,
      );
    } else if (rating === 'green' && better && better.freeMinutes > todayFree * 1.4) {
      add(`${weekdayLong(better.date)} bietet mehr Zeit für die lange Einheit`, -9);
    } else if (rating === 'green' && outlook.complete && outlook.longCapableDays === 0) {
      add('Einziger Tag der nächsten Woche mit Zeit für eine lange Einheit', 20);
    }
  }

  // 17. Weekly capacity, measured in usable minutes rather than calendar days.
  // This applies to every real training session — including the long run, which
  // is low in intensity but is precisely the session that needs a free day.
  if (!isRegenerative) {
    const gap = target.minutes - facts.weekMinutesDone - facts.weekMinutesPlanned;
    if (outlook.restOfWeekComplete && gap > 0) {
      if (outlook.isLastDayOfWeek) {
        add('Letzter Tag dieser Trainingswoche — danach beginnt die Zählung neu', 14);
      } else if (outlook.restOfWeekFreeMinutes < gap * 0.5) {
        add(
          `Der Rest der Woche bietet nur ${formatDuration(outlook.restOfWeekFreeMinutes)} — das Wochenziel entscheidet sich heute`,
          16,
        );
      } else if (outlook.restOfWeekFreeMinutes > gap * 2.5) {
        add('Die Restwoche hat reichlich Zeit — heute muss nichts erzwungen werden', -7);
      }
    }
  }

  // 18. Sleep outlook. A hard stimulus needs the nights after it, and the shift
  // plan already says whether those nights exist.
  if (isHardCandidate) {
    if (outlook.sleepConstrainedAhead) {
      add(
        `Die nächsten Tage lassen nur ${outlook.expectedSleepAhead} h Schlaf zu — ein harter Reiz würde nicht verarbeitet`,
        -16,
      );
    } else if (
      outlook.expectedSleepAhead != null &&
      outlook.expectedSleepAhead >= settings.recovery.sleepHoursTarget
    ) {
      add('Die kommenden Nächte lassen gute Erholung zu', 9);
    }
  }

  // 19. Load already committed to the coming days.
  const hardAhead = outlook.nextHardPlanned;
  if (isHardCandidate && hardAhead && hardAhead.daysAhead <= 2) {
    add(
      `${weekdayLong(hardAhead.date)} ist bereits eine intensive Einheit geplant`,
      hardAhead.daysAhead === 1 ? -20 : -12,
    );
  }
  if (isEasyish && hardAhead && hardAhead.daysAhead === 1) {
    add(`Morgen steht eine intensive Einheit an — heute locker hält sie qualitativ`, 11);
  }

  return { template, score, reasons };
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

export function recommendForDay(ctx: EngineContext): DailyRecommendation {
  const facts = gatherFacts(ctx);
  const scored = archetypes(ctx, facts).map((a) => evaluate(a, ctx, facts));

  const viable = scored
    .filter((s) => !s.blockedBy)
    .sort((a, b) => b.score - a.score);
  const blocked = scored
    .filter((s) => s.blockedBy)
    .sort((a, b) => a.template.title.localeCompare(b.template.title));

  const toRec = (s: Scored, verdict: Recommendation['verdict']): Recommendation => ({
    id: `${ctx.date}_${s.template.id}`,
    template: s.template,
    verdict,
    score: Math.round(s.score),
    reasons: s.reasons.slice().sort((a, b) => Math.abs(b.points ?? 0) - Math.abs(a.points ?? 0)).slice(0, 5),
    blockedBy: s.blockedBy,
    suggestedStart: s.template.isRest
      ? undefined
      : suggestStartTime(ctx.shift.type, s.template.durationMin),
    estimatedLoad: Math.round((s.template.durationMin * INTENSITY_RPE[s.template.intensity]) / LOAD_SCALE),
  });

  const recommended = viable.slice(0, 1).map((s) => toRec(s, 'recommended'));

  // Alternatives should not be near-duplicates. A rest day is bucketed on its
  // own: "Ruhetag" and "lockerer Spaziergang" are different decisions, even
  // though both live under the recovery sport.
  const bucketOf = (t: SessionTemplate) => (t.isRest ? 'rest' : t.sport);
  const alternatives: Recommendation[] = [];
  for (const s of viable.slice(1)) {
    if (alternatives.length >= 3) break;
    const bucket = bucketOf(s.template);
    const sameAsTop = recommended[0] && bucketOf(recommended[0].template) === bucket;
    const sameAsAlt = alternatives.some((a) => bucketOf(a.template) === bucket);
    if (sameAsTop && alternatives.length < 2) continue;
    if (sameAsAlt) continue;
    alternatives.push(toRec(s, 'alternative'));
  }

  // Resting is always a legitimate answer, so it is always on the table —
  // with its own reasoning, not as the absence of a choice.
  const restOffered = [...recommended, ...alternatives].some((r) => r.template.isRest);
  if (!restOffered) {
    const rest = viable.find((s) => s.template.isRest);
    if (rest) alternatives.push(toRec(rest, 'alternative'));
  }

  return {
    date: ctx.date,
    recommended,
    alternatives,
    notRecommended: blocked.map((s) => toRec(s, 'not_recommended')),
    planReview: reviewPlan(ctx, facts, recommended[0]),
    focus: focusText(ctx, facts),
  };
}

function reviewPlan(
  ctx: EngineContext,
  facts: DayFacts,
  top: Recommendation | undefined,
): DailyRecommendation['planReview'] {
  if (facts.plannedToday.length === 0) return undefined;

  const totalPlanned = facts.plannedToday.reduce((sum, s) => sum + effectiveDuration(s), 0);
  const ids = facts.plannedToday.map((s) => s.id);
  const shiftMax = facts.availableMinutes;

  if (totalPlanned > shiftMax) {
    return {
      sessionIds: ids,
      verdict: 'too_much',
      message: `${formatDuration(totalPlanned)} geplant, die ${ctx.shift.type?.label ?? 'heutige Schicht'} gibt aber nur ${formatDuration(shiftMax)} her. Kürzen oder verschieben.`,
    };
  }

  const hardPlanned = facts.plannedToday.some(
    (s) => intensityRank(s.plannedIntensity) >= intensityRank('threshold'),
  );
  if (hardPlanned && ctx.readiness.level === 'recovery') {
    return {
      sessionIds: ids,
      verdict: 'adjust',
      message: `Du hast eine intensive Einheit geplant, die Readiness liegt aber bei ${ctx.readiness.score}. Locker machen oder auf morgen schieben.`,
    };
  }
  if (hardPlanned && facts.hoursSinceHard != null && facts.hoursSinceHard < ctx.settings.training.minHoursBetweenHard) {
    return {
      sessionIds: ids,
      verdict: 'adjust',
      message: `Die letzte harte Einheit ist erst ${Math.round(facts.hoursSinceHard)} h her. Heute besser locker.`,
    };
  }
  if (top && facts.plannedToday.every((s) => s.sport !== top.template.sport) && top.score > 70) {
    return {
      sessionIds: ids,
      verdict: 'adjust',
      message: `Dein Plan passt grundsätzlich. ${SPORT_META[top.template.sport].label} hätte diese Woche aber die größere Lücke.`,
    };
  }
  return {
    sessionIds: ids,
    verdict: 'aligned',
    message: 'Dein geplantes Training passt zu Schicht, Erholung und Wochenziel.',
  };
}

function focusText(ctx: EngineContext, facts: DayFacts): string {
  if (ctx.readiness.level === 'recovery') return 'Erholung wiederherstellen';
  if (ctx.target.deload) return 'Deload — Belastung bewusst reduzieren';

  // The focus follows the constraint that binds soonest, and the shift plan
  // often makes that constraint a future one.
  const outlook = ctx.outlook;
  const gap = ctx.target.minutes - facts.weekMinutesDone - facts.weekMinutesPlanned;
  if (
    outlook.restOfWeekComplete &&
    gap > 0 &&
    !outlook.isLastDayOfWeek &&
    outlook.restOfWeekFreeMinutes < gap * 0.5
  ) {
    return 'Letzte nutzbare Gelegenheit dieser Woche';
  }
  if (
    facts.weekStrengthSessions === 0 &&
    ctx.target.strengthSessions > 0 &&
    outlook.restOfWeekComplete &&
    outlook.restOfWeekFreeMinutes < 120
  ) {
    return 'Krafteinheit der Woche sichern';
  }
  if (facts.weekStrengthSessions === 0 && ctx.target.strengthSessions > 0 && facts.remainingWeekDays <= 3) {
    return 'Krafteinheit der Woche sichern';
  }
  if (outlook.sleepConstrainedAhead) return 'Vor schlafarmen Tagen konservativ bleiben';
  if (facts.daysSinceLongRun != null && facts.daysSinceLongRun >= 7 && ctx.shift.type?.training.rating === 'green') {
    return 'Long Run — Ermüdungswiderstand aufbauen';
  }
  if (outlook.nextGreenDay?.daysAhead === 1 && ctx.shift.type?.training.rating !== 'green') {
    return 'Heute vorbereiten, morgen den freien Tag nutzen';
  }
  const phaseFocus = ctx.target.phase?.focus[0];
  if (phaseFocus) return phaseFocus;
  return 'Konstanz halten';
}

function intensityLabel(i: IntensityKey): string {
  const labels: Record<IntensityKey, string> = {
    recovery: 'Regeneration',
    easy: 'Locker (Z2)',
    moderate: 'Moderat (Z3)',
    threshold: 'Schwelle (Z4)',
    vo2: 'VO2max (Z5)',
    max: 'Maximal',
  };
  return labels[i];
}

export function muscleLabel(g: MuscleGroup): string {
  const labels: Record<MuscleGroup, string> = {
    legs_quads: 'Quadrizeps',
    legs_hamstrings: 'Beinbeuger',
    glutes: 'Gesäß',
    calves: 'Waden',
    chest: 'Brust',
    back: 'Rücken',
    shoulders: 'Schultern',
    arms: 'Arme',
    core: 'Rumpf',
    full_body: 'Ganzkörper',
  };
  return labels[g];
}

export { intensityLabel };
