import { describe, expect, it } from 'vitest';
import type { TrainingSession } from '../types.ts';
import { buildOutlook } from '../outlook.ts';
import { recommendForDay } from '../engine.ts';
import { computeReadiness } from '../readiness.ts';
import { buildShiftContext } from '../shifts.ts';
import { weekTarget } from '../phases.ts';
import { learnPreferences } from '../personalization.ts';
import { defaultTrainingPlan } from '../../data/defaults.ts';
import { checkIn, session, settings, shiftMaps } from './helpers.ts';

// A Wednesday, so there are four days left in the week after today.
const TODAY = '2026-03-11';
const FUTURE = ['2026-03-12', '2026-03-13', '2026-03-14', '2026-03-15'];

/** A believable four-week base so cold-start rules do not dominate. */
function baseHistory(): TrainingSession[] {
  return [
    session('2026-02-20', 'run', 50, 'easy', { actualDistanceKm: 8 }),
    session('2026-02-24', 'bike', 70, 'easy', { actualDistanceKm: 25 }),
    session('2026-03-01', 'run', 95, 'easy', { actualDistanceKm: 16 }),
    session('2026-03-04', 'run', 45, 'easy', { actualDistanceKm: 7 }),
    session('2026-03-09', 'run', 40, 'easy', { actualDistanceKm: 6 }),
  ];
}

function build(opts: {
  today?: string;
  future?: Record<string, string>;
  sessions?: TrainingSession[];
  rested?: boolean;
}) {
  const shifts: Record<string, string> = { [TODAY]: opts.today ?? 'shift_off', ...(opts.future ?? {}) };
  const { types, assignments } = shiftMaps(shifts);
  const sessions = opts.sessions ?? baseHistory();
  const checkIns = new Map(
    opts.rested === false
      ? []
      : [[TODAY, checkIn(TODAY, { sleepHours: 8, fatigue: 1, soreness: 1, stress: 1, motivation: 4 })]],
  );
  const shift = buildShiftContext(TODAY, assignments, types);
  const plan = defaultTrainingPlan();
  plan.startDate = '2026-01-01';
  plan.phases[0].startDate = '2026-01-01';
  plan.phases[0].endDate = '2026-12-31';

  const outlook = buildOutlook(TODAY, assignments, types, sessions, settings);
  const result = recommendForDay({
    date: TODAY,
    shift,
    readiness: computeReadiness(TODAY, checkIns, sessions, shift, settings.recovery),
    target: weekTarget(plan, TODAY, settings.training.weeklyHoursTarget, 1),
    settings,
    sessions,
    goals: [],
    preferences: learnPreferences(sessions, TODAY),
    outlook,
  });
  return { result, outlook };
}

const allFuture = (shiftId: string) => Object.fromEntries(FUTURE.map((d) => [d, shiftId]));

describe('outlook', () => {
  it('measures usable capacity, not calendar days', () => {
    const free = build({ future: allFuture('shift_off') }).outlook;
    const day = build({ future: allFuture('shift_day') }).outlook;

    expect(free.days).toHaveLength(7);
    // Four free shifts against four day shifts is a difference of hours.
    expect(free.restOfWeekFreeMinutes).toBeGreaterThan(day.restOfWeekFreeMinutes * 5);
    expect(free.longCapableDays).toBeGreaterThan(0);
    expect(day.longCapableDays).toBe(0);
  });

  it('reads expected sleep out of the shift plan', () => {
    const nights = build({ future: allFuture('shift_night') }).outlook;
    const free = build({ future: allFuture('shift_off') }).outlook;

    // Night shifts allow a 14:00–17:00 pre-shift nap: three hours.
    expect(nights.expectedSleepAhead).toBe(3);
    expect(nights.sleepConstrainedAhead).toBe(true);
    expect(free.sleepConstrainedAhead).toBe(false);
  });

  it('recognises the last day of the training week', () => {
    // 2026-03-11 is a Wednesday, so the week still has days left.
    expect(build({ future: allFuture('shift_off') }).outlook.isLastDayOfWeek).toBe(false);
  });

  it('makes no claims about days without a shift', () => {
    const { outlook } = build({ future: {} });
    expect(outlook.complete).toBe(false);
    expect(outlook.unknownDays).toBe(7);
    expect(outlook.restOfWeekComplete).toBe(false);
    expect(outlook.bestLongDay).toBeNull();
    expect(outlook.expectedSleepAhead).toBeNull();
    expect(outlook.sleepConstrainedAhead).toBe(false);
  });
});

describe('the coming days change today\'s decision', () => {
  it('defers the long run when a better day is imminent', () => {
    // Today is a sleep day; Friday and Saturday are free.
    const deferred = build({
      today: 'shift_sleep_day',
      future: { '2026-03-12': 'shift_off', '2026-03-13': 'shift_off', '2026-03-14': 'shift_off', '2026-03-15': 'shift_off' },
    }).result;
    const longRun = [
      ...deferred.recommended,
      ...deferred.alternatives,
      ...deferred.notRecommended,
    ].find((r) => r.template.id === 'run_long');

    // Either it is blocked outright by the shift, or it carries the deferral reason.
    const deferralReason = longRun?.reasons.some((r) => /passt dort deutlich besser/.test(r.text));
    expect(longRun?.blockedBy ?? (deferralReason ? 'deferred' : undefined)).toBeTruthy();
  });

  it('raises urgency when the rest of the week has no capacity left', () => {
    const scarce = build({ future: allFuture('shift_day') }).result;
    const plenty = build({ future: allFuture('shift_off') }).result;

    const scarceTop = scarce.recommended[0];
    const plentyTop = plenty.recommended[0];

    // Identical history, opposite futures: the decision must not be identical.
    const sameChoice =
      scarceTop.template.id === plentyTop.template.id && scarceTop.score === plentyTop.score;
    expect(sameChoice).toBe(false);
  });

  it('names the scarcity in the reasons rather than silently reweighting', () => {
    const scarce = build({ future: allFuture('shift_day') }).result;
    const texts = [...scarce.recommended, ...scarce.alternatives].flatMap((r) =>
      r.reasons.map((x) => x.text),
    );
    expect(texts.some((t) => /Rest der Woche bietet|entscheidet sich heute/.test(t))).toBe(true);
  });

  it('holds back intensity before a run of sleep-poor days', () => {
    const beforeNights = build({ future: allFuture('shift_night') }).result;
    const texts = [
      ...beforeNights.recommended,
      ...beforeNights.alternatives,
      ...beforeNights.notRecommended,
    ].flatMap((r) => r.reasons.map((x) => x.text));
    expect(texts.some((t) => /Schlaf zu|nicht verarbeitet/.test(t))).toBe(true);
  });

  it('does not stack a hard session in front of one already planned', () => {
    const planned = session('2026-03-12', 'run', 60, 'vo2', { status: 'planned' });
    const { result } = build({
      future: allFuture('shift_off'),
      sessions: [...baseHistory(), planned],
    });
    const tempo = [...result.recommended, ...result.alternatives, ...result.notRecommended].find(
      (r) => r.template.id === 'run_tempo',
    );
    const texts = tempo?.reasons.map((r) => r.text) ?? [];
    expect(texts.some((t) => /bereits eine intensive Einheit geplant/.test(t))).toBe(true);
  });

  it('blocks a second long session when one is already committed', () => {
    const planned = session('2026-03-12', 'run', 120, 'easy', {
      status: 'planned',
      plannedDistanceKm: 20,
      plannedDurationMin: 120,
    });
    const { result } = build({
      future: allFuture('shift_off'),
      sessions: [...baseHistory(), planned],
    });
    const longRun = result.notRecommended.find((r) => r.template.id === 'run_long');
    expect(longRun?.blockedBy).toBe('Lange Einheit steht schon im Plan');
  });

  it('values a rest day more when tomorrow is usable', () => {
    const beforeFreeDay = build({
      today: 'shift_v',
      // Spread first, then override: tomorrow free, the rest day shifts.
      future: { ...allFuture('shift_day'), '2026-03-12': 'shift_off' },
    }).result;
    const rest = [...beforeFreeDay.recommended, ...beforeFreeDay.alternatives].find(
      (r) => r.template.isRest,
    );
    const texts = rest?.reasons.map((r) => r.text) ?? [];
    expect(texts.some((t) => /wertvoller/.test(t))).toBe(true);
  });
});
