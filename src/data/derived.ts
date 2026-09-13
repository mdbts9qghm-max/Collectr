import type {
  DailyCheckIn,
  ISOTimestamp,
  Habit,
  HabitEntry,
  ISODate,
  MetricKey,
  ShiftAssignment,
  ShiftType,
  TrainingSession,
} from '../domain/types.ts';
import type { AppData } from './store.ts';
import type { DayContext } from '../domain/habits.ts';
import type { MetricValue } from '../domain/metrics.ts';
import { addDays, dateRange, lastNDays, startOfWeek, today as todayIso } from '../domain/date.ts';
import { adjustedTrainingMinutes, buildShiftContext, rotationAssignments } from '../domain/shifts.ts';
import { computeReadiness } from '../domain/readiness.ts';
import { weekTarget } from '../domain/phases.ts';
import { currentMetrics } from '../domain/metrics.ts';
import { effectiveDuration, loadStateOn, periodStats, weekStats } from '../domain/load.ts';
import { detectCycle } from '../domain/rotation/detect.ts';
import { computeRecovery as computeAerobicRecovery } from '../domain/coach/recovery.ts';
import { baselineFor } from '../domain/coach/whoop.ts';
import { vShiftWindows, windowsFor } from '../domain/coach/windows.ts';
import { buildSleepDay } from '../domain/sleep/day.ts';
import { sleepSignals } from '../domain/sleep/debt.ts';
import type { SleepNight } from '../domain/sleep/debt.ts';
import { medicalFlags } from '../domain/sleep/medical.ts';
import type { DayContext as CoachDayContext } from '../domain/coach/coach.ts';
import type { SessionKind as CoachSessionKind } from '../domain/coach/catalogue.ts';
import type { PlannedSession } from '../domain/sleep/training.ts';
import { CATALOGUE as COACH_CATALOGUE, isHardSession } from '../domain/coach/catalogue.ts';
import { buildCoachPlan } from '../domain/coach/coach.ts';
import { sessionFromDecision, sessionFromStrength } from '../domain/coach/toSession.ts';
import { HORIZON_BACK, HORIZON_FORWARD } from '../domain/coach/horizon.ts';
import { FIXED_ZONES } from '../domain/coach/zones.ts';

/** Indexes built once per render pass and shared by every derived computation. */
export interface Indexes {
  shiftAssignments: Map<ISODate, ShiftAssignment>;
  shiftTypes: Map<string, ShiftType>;
  checkIns: Map<ISODate, DailyCheckIn>;
  entriesByHabit: Map<string, Map<ISODate, HabitEntry>>;
  sessionsByDate: Map<ISODate, TrainingSession[]>;
}

export function buildIndexes(data: AppData): Indexes {
  const entriesByHabit = new Map<string, Map<ISODate, HabitEntry>>();
  for (const entry of data.habitEntries) {
    let inner = entriesByHabit.get(entry.habitId);
    if (!inner) {
      inner = new Map();
      entriesByHabit.set(entry.habitId, inner);
    }
    inner.set(entry.date, entry);
  }

  const sessionsByDate = new Map<ISODate, TrainingSession[]>();
  for (const s of data.sessions) {
    const list = sessionsByDate.get(s.date);
    if (list) list.push(s);
    else sessionsByDate.set(s.date, [s]);
  }

  return {
    shiftAssignments: shiftAssignmentsFor(data),
    shiftTypes: new Map(data.shiftTypes.map((t) => [t.id, t])),
    checkIns: new Map(Object.entries(data.checkIns)),
    entriesByHabit,
    sessionsByDate,
  };
}

/**
 * Wie viel Kalender die App überhaupt anschaut.
 *
 * Das Blickfeld des Coaches reicht 27 Tage in jede Richtung, die Auswertungen
 * blicken ein Jahr zurück, und der Kalender lässt sich ein paar Monate vorwärts
 * blättern. Ein Jahr in jede Richtung deckt alles davon ab — und begrenzt, was
 * die Fortschreibung erzeugen muss.
 */
const ROTATION_SPAN_DAYS = 400;

/**
 * Der Schichtplan, wie ihn der Rest der App sieht.
 *
 * Zwei Quellen, eine klare Rangfolge: das Rotationsmuster schreibt sich ab dem
 * Anker von selbst fort, und jeder von Hand gesetzte Tag sticht die
 * Fortschreibung. So endet der Kalender nicht mehr am letzten eingetippten Tag,
 * und eine V-Schicht, Urlaub oder ein Tauschtag bleiben trotzdem möglich.
 */
function shiftAssignmentsFor(data: AppData): Map<ISODate, ShiftAssignment> {
  const out = new Map<ISODate, ShiftAssignment>();
  const anchor = todayIso();
  for (const a of rotationAssignments(
    data.settings.shiftAnchor,
    data.settings.shiftRotation,
    addDays(anchor, -ROTATION_SPAN_DAYS),
    addDays(anchor, ROTATION_SPAN_DAYS),
  )) {
    out.set(a.date, a);
  }
  for (const [date, a] of Object.entries(data.shifts)) {
    // Ein bewusst geleerter Tag hält die Fortschreibung an, statt von ihr
    // wieder gefüllt zu werden.
    if (a.cleared) out.delete(date);
    else out.set(date, a);
  }
  return out;
}

export function shiftTypeOn(idx: Indexes, date: ISODate): ShiftType | null {
  const a = idx.shiftAssignments.get(date);
  return a ? (idx.shiftTypes.get(a.shiftTypeId) ?? null) : null;
}

/**
 * A rest day is one with no training done and none planned. It matters because
 * habits with a rest-day policy are excused, which is what keeps streaks from
 * punishing correct behaviour.
 */
export function makeDayContextFn(idx: Indexes, today: ISODate): (date: ISODate) => DayContext {
  return (date: ISODate) => {
    const sessions = idx.sessionsByDate.get(date) ?? [];
    const trained = sessions.some(
      (s) => s.status !== 'skipped' && s.sport !== 'recovery' && effectiveDuration(s) >= 20,
    );
    const shift = shiftTypeOn(idx, date);
    return {
      isRestDay: !trained,
      shiftKey: shift?.key ?? null,
      isFuture: date > today,
    };
  };
}

export function entriesFor(idx: Indexes, habitId: string): Map<ISODate, HabitEntry> {
  return idx.entriesByHabit.get(habitId) ?? new Map();
}

export function activeHabits(data: AppData): Habit[] {
  return data.habits.filter((h) => !h.archived).sort((a, b) => a.order - b.order);
}

export function activePlan(data: AppData) {
  return data.plans.find((p) => p.active) ?? data.plans[0] ?? null;
}

/* ------------------------------------------------------------------ *
 * The full day view — everything the Today screen needs
 * ------------------------------------------------------------------ */

export function buildDayView(data: AppData, idx: Indexes, date: ISODate) {
  const today = todayIso();
  const shift = buildShiftContext(date, idx.shiftAssignments, idx.shiftTypes);
  const readiness = computeReadiness(date, idx.checkIns, data.sessions, shift, data.settings.recovery);
  const target = weekTarget(
    activePlan(data),
    date,
    data.settings.training.weeklyHoursTarget,
    data.settings.weekStartsOn,
  );

  return {
    date,
    isToday: date === today,
    shift,
    readiness,
    target,
    sessions: (idx.sessionsByDate.get(date) ?? []).slice().sort((a, b) =>
      (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99'),
    ),
    checkIn: idx.checkIns.get(date),
    load: loadStateOn(data.sessions, date),
    week: weekStats(data.sessions, date, data.settings.weekStartsOn),
    weekPlanned: weekStats(data.sessions, date, data.settings.weekStartsOn, { includePlanned: true }),
  };
}

export type DayView = ReturnType<typeof buildDayView>;

/* ------------------------------------------------------------------ *
 * Metrics & score
 * ------------------------------------------------------------------ */

export function buildMetrics(data: AppData, date: ISODate): Map<MetricKey, MetricValue> {
  return currentMetrics(data.sessions, Object.values(data.checkIns), data.settings, date);
}

/* ------------------------------------------------------------------ *
 * Week view
 * ------------------------------------------------------------------ */

export interface WeekDayCell {
  date: ISODate;
  shift: ShiftType | null;
  sessions: TrainingSession[];
  plannedMinutes: number;
  completedMinutes: number;
  /** Training minutes the shift allows, after cross-day adjustments. */
  capacityMinutes: number;
  /** Capacity still unspent after what is already planned or done. */
  freeMinutes: number;
  sleepHours: number | null;
  readinessScore: number | null;
  habitPct: number | null;
  isToday: boolean;
  isPast: boolean;
}

export function buildWeek(data: AppData, idx: Indexes, anyDate: ISODate): WeekDayCell[] {
  const today = todayIso();
  const start = startOfWeek(anyDate, data.settings.weekStartsOn);
  const contextFor = makeDayContextFn(idx, today);
  const habits = activeHabits(data);

  return dateRange(start, addDays(start, 6)).map((date) => {
    const sessions = idx.sessionsByDate.get(date) ?? [];
    const checkIn = idx.checkIns.get(date);
    const shift = buildShiftContext(date, idx.shiftAssignments, idx.shiftTypes);

    let habitDone = 0;
    let habitTotal = 0;
    for (const habit of habits) {
      const ctx = contextFor(date);
      if (ctx.shiftKey === 'sick') continue;
      const entry = entriesFor(idx, habit.id).get(date);
      habitTotal += 1;
      if (entry && habit.kind === 'binary' && entry.value >= 1) habitDone += 1;
      else if (entry && habit.target && entry.value >= habit.target) habitDone += 1;
      else if (entry && habit.minimum && entry.value >= habit.minimum) habitDone += 0.5;
    }

    const readiness =
      checkIn || date <= today
        ? computeReadiness(date, idx.checkIns, data.sessions, shift, data.settings.recovery).score
        : null;

    const plannedMinutes = sessions
      .filter((s) => s.status === 'planned')
      .reduce((sum, s) => sum + effectiveDuration(s), 0);
    const completedMinutes = sessions
      .filter((s) => s.status === 'completed')
      .reduce((sum, s) => sum + effectiveDuration(s), 0);
    const capacityMinutes = adjustedTrainingMinutes(shift);

    return {
      date,
      shift: shift.type,
      sessions,
      plannedMinutes,
      completedMinutes,
      capacityMinutes,
      freeMinutes: Math.max(0, capacityMinutes - plannedMinutes - completedMinutes),
      sleepHours: checkIn?.sleepHours ?? null,
      readinessScore: readiness,
      habitPct: habitTotal > 0 ? Math.round((habitDone / habitTotal) * 100) : null,
      isToday: date === today,
      isPast: date < today,
    };
  });
}

/* ------------------------------------------------------------------ *
 * Analytics helpers
 * ------------------------------------------------------------------ */

export function weeklySeries(data: AppData, endDate: ISODate, weeks: number) {
  const out = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const anchor = addDays(startOfWeek(endDate, data.settings.weekStartsOn), -i * 7);
    const stats = periodStats(data.sessions, anchor, addDays(anchor, 6));
    out.push({ weekStart: anchor, stats });
  }
  return out;
}


/**
 * Die Einheiten eines Tages in der Form, die das Schlafmodul versteht.
 *
 * Damit weiß der Schlaftab, wann gegessen werden sollte und wie viel Abstand bis
 * zum Schlaf bleibt — statt es aus dem Zyklustag zu raten.
 */
export function plannedSessionsFor(plan: CoachView, date: ISODate): PlannedSession[] {
  const day = plan.timeline.days.find((d) => d.date === date);
  if (!day) return [];
  const out: PlannedSession[] = [];
  for (const item of [day.run, day.strength]) {
    if (!item || item.startMinutes == null) continue;
    const entry = COACH_CATALOGUE[item.kind];
    out.push({
      label: entry.label,
      discipline: entry.discipline === 'kraft' ? 'kraft' : 'lauf',
      startMinutes: item.startMinutes,
      endMinutes: item.startMinutes + item.minutes,
      isHard: isHardSession(item.kind, item.minutes),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Geplante Einheiten dem Coach nachführen
 * ------------------------------------------------------------------ */

/**
 * Felder, die der Coach besitzt. Alles andere an einer Einheit gehört dem
 * Athleten und wird hier nie angefasst.
 */
const COACH_OWNED = [
  'sport',
  'title',
  'startTime',
  'plannedDurationMin',
  'plannedIntensity',
  'goal',
  'notes',
  'muscleGroups',
] as const;

export interface CoachSessionDiff {
  /** Einheiten, deren gespeicherte Werte nicht mehr zum Coach passen. */
  update: TrainingSession[];
  /** Ids von Einheiten, die der Coach heute nicht mehr vorsieht. */
  remove: string[];
}

function coachFieldsEqual(a: TrainingSession, b: TrainingSession): boolean {
  return COACH_OWNED.every((f) => JSON.stringify(a[f]) === JSON.stringify(b[f]));
}

/**
 * Der Unterschied zwischen dem, was für heute gespeichert ist, und dem, was der
 * Coach heute sagt.
 *
 * Der Coach rechnet jeden Tag neu, die gespeicherte Einheit nicht. Ohne diesen
 * Abgleich steht unter einer Empfehlung von 24 Minuten eine eingeplante Einheit
 * über 40 — zwei Zahlen für dieselbe Einheit, und der Haken würde die falsche
 * ins Belastungsmodell schreiben.
 *
 * Angefasst wird nur, was der Coach selbst angelegt hat und was noch geplant
 * ist: `source: 'coach'` und `status: 'planned'`. Wer die Einheit von Hand
 * bearbeitet, macht sie zu seiner eigenen (`source: 'manual'`), und dann bleibt
 * sie stehen. Abgehakte Einheiten sind Aufzeichnung und werden nie umgeschrieben.
 */
export function coachSessionDiff(
  sessions: TrainingSession[],
  plan: CoachView,
  date: ISODate,
  now: ISOTimestamp,
): CoachSessionDiff {
  const out: CoachSessionDiff = { update: [], remove: [] };
  const decision = plan.today.date === date ? plan.today : null;

  for (const stored of sessions) {
    if (stored.date !== date) continue;
    if (stored.source !== 'coach' || stored.status !== 'planned') continue;

    const ids = { id: stored.id, createdAt: stored.createdAt, updatedAt: now };
    const isStrength = stored.sport === 'strength' || stored.sport === 'mobility';
    const fresh = !decision
      ? null
      : isStrength
        ? decision.strength
          ? sessionFromStrength(date, decision.strength, ids)
          : null
        : sessionFromDecision(decision, ids);

    if (!fresh) {
      out.remove.push(stored.id);
      continue;
    }
    if (coachFieldsEqual(stored, fresh)) continue;

    const patch: Partial<TrainingSession> = {};
    for (const f of COACH_OWNED) Object.assign(patch, { [f]: fresh[f] });
    out.update.push({ ...stored, ...patch, updatedAt: now });
  }
  return out;
}

/**
 * Die Signale des Schlafmoduls, so wie der Erholungswert sie braucht.
 *
 * Das Schlafmodul stuft nie selbst ab. Es liefert Signale, und diese eine Stelle
 * macht daraus Abzüge auf den Erholungswert — ein einziger Ort entscheidet über
 * Abstufungen.
 */
function sleepSignalsFor(data: AppData, idx: Indexes, date: ISODate) {
  const { signals } = buildSleepView(data, idx, date, 0);
  return {
    debtHours: signals.debtHours,
    downgradeNextHard: signals.downgradeNextHard,
    forceDeload: signals.forceDeload,
    blockHardAfter: signals.blockHardAfter,
    /** Fertig gerechnete Abzüge für genau diesen Tag, z. B. ein ausgefallener Vorschlaf. */
    penaltyReasons: signals.penaltyReasons,
    warnings: signals.warnings,
  };
}

/* ------------------------------------------------------------------ *
 * Der Coach
 * ------------------------------------------------------------------ */

/**
 * Der Coach für einen Tag — mit dem ganzen Blickfeld darum herum.
 *
 * Es wird bewusst das gesamte Einflussfenster geladen, 27 Tage in jede
 * Richtung, und nicht ein Zyklus: der Coach entscheidet den Tag aus den Tagen
 * davor und danach, und was er nicht sieht, kann er nicht begründen. Alles
 * jenseits davon fehlt nicht — es ist nachweislich ohne Einfluss.
 */
export function buildCoach(data: AppData, idx: Indexes, anchor: ISODate) {
  const wake = data.settings.planner.dayShiftWakeMinutes;
  const from = addDays(anchor, -HORIZON_BACK);
  const to = addDays(anchor, HORIZON_FORWARD);

  const detected = detectCycle(from, to, idx.shiftAssignments, idx.shiftTypes);
  const cycleDayByDate = new Map(detected.map((d) => [d.date, d.cycleDay]));

  // Baselines je Zyklustag: unter Schichtarbeit sagt ein absoluter Wert nichts.
  const metricHistory = (pick: (c: DailyCheckIn) => number | undefined) =>
    lastNDays(anchor, 120).map((date) => ({
      date,
      cycleDay: cycleDayByDate.get(date) ?? null,
      value: idx.checkIns.get(date) ? pick(idx.checkIns.get(date)!) : undefined,
    }));
  const recoveryHistory = metricHistory((c) => c.whoopRecovery);
  const restingHrHistory = metricHistory((c) => c.restingHr);
  const sleep = sleepSignalsFor(data, idx, anchor);

  const days: CoachDayContext[] = detected.map((d) => {
    const w = d.cycleDay ? (d.isVShift ? vShiftWindows() : windowsFor(d.cycleDay, wake)) : null;
    const checkIn = idx.checkIns.get(d.date);
    const recovery = computeAerobicRecovery({
      date: d.date,
      cycleDay: d.cycleDay,
      isVShift: d.isVShift,
      outOfRotation: d.outOfRotation,
      sleepTargetMinutes: w?.sleepTargetMinutes ?? 8 * 60,
      napExpected: !!w?.nap,
      napTaken: checkIn?.napTaken,
      sleepHours: checkIn?.sleepHours,
      wellbeing: checkIn?.wellbeing,
      soreness: checkIn?.soreness,
      painWhileWalking: checkIn?.painWhileWalking,
      recoveryPct: checkIn?.whoopRecovery,
      recoveryBaseline: baselineFor(recoveryHistory, d.cycleDay),
      restingHr: checkIn?.restingHr,
      restingHrBaseline: baselineFor(restingHrHistory, d.cycleDay),
      /*
       * Die Abzüge des Schlafmoduls, an genau einer Stelle in einen
       * Erholungswert übersetzt. Die tagesbezogenen Gründe — ein ausgefallener
       * Vorschlaf etwa — gelten nur für den Tag, für den sie gerechnet wurden.
       */
      sleepPenalties: [
        ...(sleep.blockHardAfter.includes(addDays(d.date, -1))
          ? [{ label: 'Tagschlaf gestern unter 5 h', delta: -25 }]
          : []),
        ...(d.date === anchor ? sleep.penaltyReasons : []),
      ],
    });

    return {
      date: d.date,
      cycleDay: d.cycleDay,
      isVShift: d.isVShift,
      outOfRotation: d.outOfRotation,
      recovery: recovery.value,
      /*
       * Erledigt heißt vergangen, nicht „vor dem Ankertag". Der Anker ist der
       * Tag, über den entschieden wird — der Kalender setzt ihn auch mal in
       * einen anderen Monat, und dann wären die Tage bis dahin sonst
       * fälschlich erledigt und ohne Einheit.
       */
      done: d.date < todayIso(),
      actual: actualFor(idx, d.date),
    };
  });

  // Zyklen seit Trainingsbeginn: jeder erkannte Tagschichttag beginnt einen.
  const history = detectCycle(addDays(from, -365), addDays(from, -1), idx.shiftAssignments, idx.shiftTypes);
  const cyclesBefore = history.filter((d) => d.cycleDay === 1).length;
  const cyclesToAnchor = detected.filter((d) => d.cycleDay === 1 && d.date <= anchor).length;

  return buildCoachPlan({
    anchor,
    days,
    dayShiftWakeMinutes: wake,
    cycleIndex: cyclesBefore + Math.max(0, cyclesToAnchor - 1),
    previousRunMinutes: runMinutesInWindow(data, addDays(anchor, -19), addDays(anchor, -10)),
    previousStrengthMinutes: strengthMinutesInWindow(data, addDays(anchor, -19), addDays(anchor, -10)),
    zones: data.settings.coachZones ?? FIXED_ZONES,
    sleep: {
      debtHours: sleep.debtHours,
      downgradeNextHard: sleep.downgradeNextHard,
      forceDeload: sleep.forceDeload,
    },
  });
}

/** Was an einem vergangenen Tag tatsächlich gelaufen und gehoben wurde. */
function actualFor(idx: Indexes, date: ISODate): CoachDayContext['actual'] {
  const sessions = (idx.sessionsByDate.get(date) ?? []).filter((s) => s.status === 'completed');
  if (!sessions.length) return undefined;
  const run = sessions.find((s) => s.sport === 'run');
  const strength = sessions.find((s) => s.sport === 'strength');
  if (!run && !strength) return undefined;
  return {
    kind: run ? runKindOf(run) : 'ruhe',
    minutes: run ? effectiveDuration(run) : 0,
    strengthKind: strength ? 'kraft_ganzkoerper' : undefined,
    strengthMinutes: strength ? effectiveDuration(strength) : undefined,
  };
}

/**
 * Aus einer erfassten Einheit die Katalogform ableiten.
 *
 * Es wird an der Intensität und der Dauer festgemacht, nicht am Titel: der
 * Titel ist frei getippt, die Intensität kommt aus dem Formular.
 */
function runKindOf(session: TrainingSession): CoachSessionKind {
  const minutes = effectiveDuration(session);
  const intensity = session.plannedIntensity;
  if (intensity === 'vo2' || intensity === 'max') return minutes >= 50 ? 'intervall' : 'intervall_kurz';
  if (intensity === 'threshold') return 'intervall_kurz';
  if (minutes >= 70) return 'longrun';
  if (minutes >= 50) return 'longrun_verkuerzt';
  if (minutes >= 40) return 'grundlagenlauf';
  return 'lockerer_lauf';
}

/** Tatsächlich gehobene Minuten in einem Zeitraum. Null ohne jede Einheit. */
function strengthMinutesInWindow(data: AppData, from: ISODate, to: ISODate): number | null {
  const inRange = data.sessions.filter(
    (s) =>
      s.status === 'completed' &&
      (s.sport === 'strength' || s.sport === 'mobility') &&
      s.date >= from &&
      s.date <= to,
  );
  if (!inRange.length) return null;
  return inRange.reduce((sum, s) => sum + effectiveDuration(s), 0);
}

/** Tatsächlich gelaufene Minuten in einem Zeitraum. Null ohne jede Einheit. */
function runMinutesInWindow(data: AppData, from: ISODate, to: ISODate): number | null {
  const inRange = data.sessions.filter(
    (s) => s.status === 'completed' && s.sport === 'run' && s.date >= from && s.date <= to,
  );
  if (!inRange.length) return null;
  return inRange.reduce((sum, s) => sum + effectiveDuration(s), 0);
}

export type CoachView = ReturnType<typeof buildCoach>;


/* ------------------------------------------------------------------ *
 * Sleep and recovery coaching
 * ------------------------------------------------------------------ */

/** The sleep signals for a date, and the day's four advice tracks. */
export function buildSleepView(
  data: AppData,
  idx: Indexes,
  date: ISODate,
  nowMinutes: number,
  /*
   * Was für diesen Tag geplant ist. Wird von außen hereingereicht und nicht hier
   * geholt: `buildCoach` fragt seinerseits die Schlafsignale ab, und ein Aufruf
   * in die andere Richtung schlösse den Kreis.
   */
  training: PlannedSession[] = [],
) {
  const wake = data.settings.planner.dayShiftWakeMinutes;
  const detected = detectCycle(addDays(date, -13), date, idx.shiftAssignments, idx.shiftTypes);
  const todayEntry = detected.find((d) => d.date === date);
  const ctx = { cycleDay: todayEntry?.cycleDay ?? null, isVShift: !!todayEntry?.isVShift };

  const windows = ctx.cycleDay
    ? ctx.isVShift
      ? vShiftWindows()
      : windowsFor(ctx.cycleDay, wake)
    : null;

  const day = buildSleepDay(
    ctx,
    windows
      ? {
          start: windows.sleepStart,
          end: windows.sleepEnd,
          targetMinutes: windows.sleepTargetMinutes,
          nap: windows.nap,
        }
      : null,
    nowMinutes,
    { offerCoffeeNap: data.settings.sleepCoaching?.offerCoffeeNap ?? false },
    training,
    windows?.nextSleepStart ?? null,
  );

  /*
   * Sleep debt is measured over the macrocycle — ten days — because that is the
   * span the training plan itself balances on.
   */
  const nights: SleepNight[] = detected.slice(-10).map((d) => {
    const w = d.cycleDay ? (d.isVShift ? vShiftWindows() : windowsFor(d.cycleDay, wake)) : null;
    const checkIn = idx.checkIns.get(d.date);
    return {
      date: d.date,
      targetHours: (w?.sleepTargetMinutes ?? 8 * 60) / 60,
      actualHours: checkIn?.sleepHours ?? null,
      cycleDay: d.cycleDay,
      napTaken: checkIn?.napTaken,
      napExpected: !!w?.nap,
    };
  });
  const signals = sleepSignals(nights, date);

  const history = lastNDays(date, 28).map((d) => idx.checkIns.get(d));
  const flags = medicalFlags({
    sleepHours: history.map((c) => c?.sleepHours ?? null),
    sleepQuality: history.map((c) => c?.sleepQuality ?? null),
    daytimeSleepinessDespiteSleep: data.settings.sleepCoaching?.daytimeSleepiness ?? false,
    involuntarySleepOnset: data.settings.sleepCoaching?.involuntarySleepOnset ?? false,
    observedApnea: data.settings.sleepCoaching?.observedApnea ?? false,
  });

  return { ctx, day, signals, flags, nights };
}

export type SleepView = ReturnType<typeof buildSleepView>;
