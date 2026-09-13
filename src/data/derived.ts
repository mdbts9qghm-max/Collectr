import type {
  DailyCheckIn,
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
import {
  addDays,
  dateRange,
  lastNDays,
  startOfWeek,
  today as todayIso,
} from '../domain/date.ts';
import { adjustedTrainingMinutes, buildShiftContext, rotationAssignments } from '../domain/shifts.ts';
import { computeReadiness } from '../domain/readiness.ts';
import { weekTarget } from '../domain/phases.ts';
import { currentMetrics } from '../domain/metrics.ts';
import { effectiveDuration, loadStateOn, periodStats, weekStats } from '../domain/load.ts';
import { clockToMinutes, diffDays } from '../domain/date.ts';
import { detectCycle } from '../domain/rotation/detect.ts';
import { computeRecovery as computeAerobicRecovery } from '../domain/recovery.ts';
import { baselineFor } from '../domain/whoop.ts';
import { vShiftWindows, windowsFor } from '../domain/windows.ts';
import type { DayContext as CoachDayContext } from '../domain/coach/coach.ts';
import type { SessionKind as CoachSessionKind } from '../domain/coach/catalogue.ts';
import { buildCoachPlan } from '../domain/coach/coach.ts';
import { HORIZON_BACK, HORIZON_FORWARD } from '../domain/coach/horizon.ts';
import { FIXED_ZONES } from '../domain/zones.ts';
import { buildSleepDay } from '../domain/sleep/day.ts';
import { sleepSignals } from '../domain/sleep/debt.ts';
import type { SleepNight } from '../domain/sleep/debt.ts';
import { medicalFlags } from '../domain/sleep/medical.ts';
import type { PlannedSession } from '../domain/sleep/training.ts';

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

  // Der Zyklustag steht hier, weil ihn mehrere Bildschirme brauchen und ihn
  // sonst jeder für sich aus der Schicht ableiten würde.
  const detected = detectCycle(date, date, idx.shiftAssignments, idx.shiftTypes)[0];

  return {
    date,
    isToday: date === today,
    shift,
    cycleDay: detected?.cycleDay ?? null,
    isVShift: !!detected?.isVShift,
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
 * Gelesen wird, was eingetragen ist — geplant oder schon abgehakt. Vorher kam
 * das aus dem Coach; seit der weg ist, gibt es nur noch eine Quelle für die
 * Einheiten eines Tages, und das ist die Einheit selbst.
 */
export function plannedSessionsFor(
  idx: Indexes,
  types: Map<string, ShiftType>,
  date: ISODate,
): PlannedSession[] {
  void types;
  const sessions = (idx.sessionsByDate.get(date) ?? []).filter((s) => s.status !== 'skipped');
  const out: PlannedSession[] = [];
  for (const s of sessions) {
    if (!s.startTime) continue;
    const minutes = effectiveDuration(s);
    const start = clockToMinutes(s.startTime);
    out.push({
      label: s.title,
      discipline: s.sport === 'strength' || s.sport === 'mobility' ? 'kraft' : 'lauf',
      startMinutes: start,
      endMinutes: start + minutes,
      // Hart heißt: zehrt am Schlaf. Zone und Dauer entscheiden das, nicht der Titel.
      isHard:
        minutes >= 120 ||
        s.plannedIntensity === 'threshold' ||
        s.plannedIntensity === 'vo2' ||
        s.plannedIntensity === 'max',
    });
  }
  return out.sort((a, b) => a.startMinutes - b.startMinutes);
}



/* ------------------------------------------------------------------ *
 * Sleep and recovery coaching
 * ------------------------------------------------------------------ */

/** The sleep signals for a date, and the day's four advice tracks. */
/* ------------------------------------------------------------------ *
 * Der Coach
 * ------------------------------------------------------------------ */

/** Tatsächlich gelaufene Minuten in einem Zeitraum. Null ohne jede Einheit. */
function runMinutesInWindow(data: AppData, from: ISODate, to: ISODate): number | null {
  const inRange = data.sessions.filter(
    (s) => s.status === 'completed' && s.sport === 'run' && s.date >= from && s.date <= to,
  );
  if (!inRange.length) return null;
  return inRange.reduce((sum, s) => sum + effectiveDuration(s), 0);
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

/**
 * Aus einer erfassten Einheit die Katalogform ableiten.
 *
 * Festgemacht an Intensität und Dauer, nicht am Titel: der Titel ist frei
 * getippt, die Intensität kommt aus dem Formular.
 */
function runKindOf(session: TrainingSession): CoachSessionKind {
  const minutes = effectiveDuration(session);
  const intensity = session.plannedIntensity;
  if (session.sport === 'bike') return 'rad';
  if (intensity === 'vo2' || intensity === 'max') return minutes >= 50 ? 'intervall' : 'intervall_kurz';
  if (intensity === 'threshold') return 'intervall_kurz';
  if (minutes >= 70) return 'longrun';
  if (minutes >= 50) return 'longrun_verkuerzt';
  if (minutes >= 40) return 'grundlagenlauf';
  return 'lockerer_lauf';
}

/** Was an einem vergangenen Tag tatsächlich gelaufen und gehoben wurde. */
function actualFor(idx: Indexes, date: ISODate): CoachDayContext['actual'] {
  const sessions = (idx.sessionsByDate.get(date) ?? []).filter((s) => s.status === 'completed');
  if (!sessions.length) return undefined;
  const run = sessions.find((s) => s.sport === 'run' || s.sport === 'bike');
  const strength = sessions.find((s) => s.sport === 'strength' || s.sport === 'mobility');
  if (!run && !strength) return undefined;
  return {
    kind: run ? runKindOf(run) : 'ruhe',
    minutes: run ? effectiveDuration(run) : 0,
    strengthKind: strength ? (strength.sport === 'mobility' ? 'kraft_leicht' : 'kraft_ganzkoerper') : undefined,
    strengthMinutes: strength ? effectiveDuration(strength) : undefined,
  };
}

/** Die Längen der letzten langen Läufe, älteste zuerst. */
function longrunHistory(data: AppData, before: ISODate): number[] {
  return data.sessions
    .filter(
      (s) =>
        s.status === 'completed' &&
        s.sport === 'run' &&
        s.date < before &&
        effectiveDuration(s) >= 50,
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-6)
    .map(effectiveDuration);
}

/** Je harter Einheit: sauber durchgezogen? Gemessen an der geplanten Dauer. */
function sessionHistory(
  data: AppData,
  before: ISODate,
  match: (s: TrainingSession) => boolean,
): boolean[] {
  return data.sessions
    .filter((s) => s.status === 'completed' && s.date < before && match(s))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-8)
    .map((s) => effectiveDuration(s) >= (s.plannedDurationMin ?? 0) * 0.9);
}

/**
 * Der Coach für einen Tag — mit dem ganzen Einflussfenster darum herum.
 *
 * Geladen wird das gesamte Fenster, nicht ein Zyklus: der Coach entscheidet den
 * Tag aus den Tagen davor und danach, und was er nicht sieht, kann er nicht
 * begründen. Alles jenseits davon fehlt nicht — es ist nachweislich ohne
 * Einfluss.
 */
export function buildCoach(data: AppData, idx: Indexes, anchor: ISODate) {
  const wake = data.settings.planner.dayShiftWakeMinutes;
  const from = addDays(anchor, -HORIZON_BACK);
  const to = addDays(anchor, HORIZON_FORWARD);

  const detected = detectCycle(from, to, idx.shiftAssignments, idx.shiftTypes);
  const sleep = buildSleepView(data, idx, anchor, 0).signals;

  const days: CoachDayContext[] = detected.map((d) => ({
    date: d.date,
    cycleDay: d.cycleDay,
    isVShift: d.isVShift,
    outOfRotation: d.outOfRotation,
    recovery: recoveryOn(data, idx, d.date).value,
    /*
     * Erledigt heißt vergangen, nicht „vor dem Ankertag". Der Anker ist der Tag,
     * über den entschieden wird — der Kalender setzt ihn auch mal in einen
     * anderen Monat, und dann wären die Tage bis dahin sonst fälschlich
     * erledigt und ohne Einheit.
     */
    done: d.date < todayIso(),
    actual: actualFor(idx, d.date),
  }));

  const planStart = planStartFor(data, idx, anchor);
  /*
   * Die Woche seit Planbeginn, am Kalender gezählt. Nicht an erkannten
   * Zyklusanfängen: eine Lücke im Schichtplan fror den Plan sonst ein, und wer
   * Schichten nachträgt, sprang ungewollt Wochen nach vorn.
   */
  const week = anchor < planStart ? 0 : Math.floor(diffDays(anchor, planStart) / 7);

  return {
    ...buildCoachPlan({
      anchor,
      days,
      week,
      dayShiftWakeMinutes: wake,
      measuredRunMinutes: runMinutesInWindow(data, addDays(anchor, -10), addDays(anchor, -1)),
      startRunMinutes: data.settings.startRunMinutes ?? null,
      measuredStrengthMinutes: strengthMinutesInWindow(
        data,
        addDays(anchor, -10),
        addDays(anchor, -1),
      ),
      longrunHistory: longrunHistory(data, anchor),
      intervalHistory: sessionHistory(
        data,
        anchor,
        (s) => s.sport === 'run' && (s.plannedIntensity === 'vo2' || s.plannedIntensity === 'max'),
      ),
      strengthHistory: sessionHistory(data, anchor, (s) => s.sport === 'strength'),
      zones: data.settings.hrZones ?? FIXED_ZONES,
      sleep: {
        debtHours: sleep.debtHours,
        downgradeNextHard: sleep.downgradeNextHard,
        forceDeload: sleep.forceDeload,
      },
    }),
    planStart,
    planWeek: week + 1,
  };
}

export type CoachView = ReturnType<typeof buildCoach>;

/**
 * Ab wann der Plan mit Woche 1 zählt.
 *
 * Eingestellt sticht alles andere. Ohne Einstellung fängt der Plan am ersten
 * Tag an, an dem überhaupt eine Schicht bekannt ist — der früheste Zeitpunkt,
 * an dem ein Zyklus erkennbar wäre. Weiter als ein Jahr zurück wird nicht
 * gesucht; was länger her ist, sagt über die heutige Form nichts mehr.
 */
export function planStartFor(data: AppData, idx: Indexes, anchor: ISODate): ISODate {
  const configured = data.settings.trainingStart;
  if (configured) return configured;
  const earliest = addDays(anchor, -365);
  let found: ISODate | null = null;
  for (const date of idx.shiftAssignments.keys()) {
    if (date < earliest || date > anchor) continue;
    if (!found || date < found) found = date;
  }
  return found ?? anchor;
}

/* ------------------------------------------------------------------ *
 * Erholung
 * ------------------------------------------------------------------ */

/**
 * Der Erholungswert eines Tages.
 *
 * Er **misst**, er plant nicht. Der Unterschied ist der Grund, warum es ihn
 * nach dem Ausbau des Coaches noch gibt: was trainiert wird, entscheidet der
 * Athlet; dieser Wert sagt nur, wie der Tag dasteht — Schicht, Schlaf,
 * Befinden, und was die Uhr gemessen hat.
 */
export function recoveryOn(data: AppData, idx: Indexes, date: ISODate) {
  const wake = data.settings.planner.dayShiftWakeMinutes;
  const detected = detectCycle(date, date, idx.shiftAssignments, idx.shiftTypes);
  const entry = detected.find((d) => d.date === date);
  const cycleDay = entry?.cycleDay ?? null;
  const isVShift = !!entry?.isVShift;
  const windows = cycleDay ? (isVShift ? vShiftWindows() : windowsFor(cycleDay, wake)) : null;
  const checkIn = idx.checkIns.get(date);

  // Baselines je Zyklustag: unter Schichtarbeit sagt ein absoluter Wert nichts.
  const history = (pick: (c: DailyCheckIn) => number | undefined) =>
    lastNDays(date, 120).map((d) => {
      const c = idx.checkIns.get(d);
      const dayEntry = detectCycle(d, d, idx.shiftAssignments, idx.shiftTypes)[0];
      return { date: d, cycleDay: dayEntry?.cycleDay ?? null, value: c ? pick(c) : undefined };
    });

  const { signals } = buildSleepView(data, idx, date, 0);

  return computeAerobicRecovery({
    date,
    cycleDay,
    isVShift,
    outOfRotation: entry?.outOfRotation ?? null,
    sleepTargetMinutes: windows?.sleepTargetMinutes ?? 8 * 60,
    napExpected: !!windows?.nap,
    napTaken: checkIn?.napTaken,
    sleepHours: checkIn?.sleepHours,
    wellbeing: checkIn?.wellbeing,
    soreness: checkIn?.soreness,
    painWhileWalking: checkIn?.painWhileWalking,
    recoveryPct: checkIn?.whoopRecovery,
    recoveryBaseline: baselineFor(history((c) => c.whoopRecovery), cycleDay),
    restingHr: checkIn?.restingHr,
    restingHrBaseline: baselineFor(history((c) => c.restingHr), cycleDay),
    sleepPenalties: [
      ...(signals.blockHardAfter.includes(addDays(date, -1))
        ? [{ label: 'Tagschlaf gestern unter 5 h', delta: -25 }]
        : []),
      ...signals.penaltyReasons,
    ],
  });
}

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
