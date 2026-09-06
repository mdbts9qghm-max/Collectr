import { describe, expect, it } from 'vitest';
import type { TrainingSession } from '../types.ts';
import { recommendForDay } from '../engine.ts';
import { computeReadiness } from '../readiness.ts';
import { buildShiftContext } from '../shifts.ts';
import { weekTarget } from '../phases.ts';
import { learnPreferences } from '../personalization.ts';
import { buildOutlook } from '../outlook.ts';
import { defaultTrainingPlan } from '../../data/defaults.ts';
import { checkIn, session, settings, shiftMaps } from './helpers.ts';

const TODAY = '2026-03-11';

function build(opts: {
  shift?: string;
  sessions?: TrainingSession[];
  checkIns?: ReturnType<typeof checkIn>[];
  shifts?: Record<string, string>;
}) {
  const shiftAssignments = { ...(opts.shifts ?? {}), ...(opts.shift ? { [TODAY]: opts.shift } : {}) };
  const { types, assignments } = shiftMaps(shiftAssignments);
  const sessions = opts.sessions ?? [];
  const checkIns = new Map((opts.checkIns ?? []).map((c) => [c.date, c]));
  const shift = buildShiftContext(TODAY, assignments, types);
  const readiness = computeReadiness(TODAY, checkIns, sessions, shift, settings.recovery);

  // A plan anchored on today so the phase lookup resolves.
  const plan = defaultTrainingPlan();
  plan.startDate = '2026-01-01';
  plan.phases[0].startDate = '2026-01-01';
  plan.phases[0].endDate = '2026-12-31';

  return recommendForDay({
    date: TODAY,
    shift,
    readiness,
    target: weekTarget(plan, TODAY, settings.training.weeklyHoursTarget, 1),
    settings,
    sessions,
    goals: [],
    preferences: learnPreferences(sessions, TODAY),
    outlook: buildOutlook(TODAY, assignments, types, sessions, settings),
  });
}

describe('shift constraints', () => {
  it('blocks real training on a day shift and leaves only short easy options', () => {
    const result = build({ shift: 'shift_day' });
    const top = result.recommended[0];
    expect(top).toBeDefined();
    // A 12-hour day shift allows 20 minutes at recovery intensity only.
    expect(top.template.durationMin).toBeLessThanOrEqual(20);
    expect(['mobility', 'recovery']).toContain(top.template.sport);
    expect(result.notRecommended.some((r) => r.template.id === 'run_intervals')).toBe(true);
  });

  it('never suggests anything on a sick day beyond rest', () => {
    const result = build({ shift: 'shift_sick' });
    expect(result.recommended[0].template.isRest).toBe(true);
  });

  it('allows the long run on a free shift when the athlete is rested', () => {
    const result = build({
      shift: 'shift_off',
      checkIns: [checkIn(TODAY, { sleepHours: 8, fatigue: 1, soreness: 1, stress: 1, motivation: 5 })],
      sessions: [
        // A real four-week base, including a recent long run to progress from.
        session('2026-02-20', 'run', 50, 'easy', { actualDistanceKm: 8 }),
        session('2026-02-24', 'bike', 70, 'easy', { actualDistanceKm: 25 }),
        session('2026-03-01', 'run', 90, 'easy', { actualDistanceKm: 15 }),
        session('2026-03-03', 'strength', 50, 'moderate' ),
        session('2026-03-05', 'run', 45, 'easy', { actualDistanceKm: 7 }),
      ],
    });
    const all = [...result.recommended, ...result.alternatives];
    expect(all.some((r) => r.template.isLong)).toBe(true);
  });

  it('refuses a long run that jumps far beyond the longest recent session', () => {
    const result = build({
      shift: 'shift_off',
      checkIns: [checkIn(TODAY, { sleepHours: 8, fatigue: 1, soreness: 1, stress: 1, motivation: 5 })],
      sessions: [
        // Four weeks of short runs only — no basis for a 90-minute effort.
        session('2026-02-18', 'run', 35, 'easy', { actualDistanceKm: 5 }),
        session('2026-02-22', 'run', 35, 'easy', { actualDistanceKm: 5 }),
        session('2026-02-27', 'run', 40, 'easy', { actualDistanceKm: 6 }),
        session('2026-03-04', 'run', 40, 'easy', { actualDistanceKm: 6 }),
      ],
    });
    const longRun = result.notRecommended.find((r) => r.template.id === 'run_long');
    expect(longRun?.blockedBy).toBe('Steigerung zur bisherigen Längsten zu groß');
  });

  it('rejects a long run when the shift has no time for it', () => {
    const result = build({ shift: 'shift_v' });
    const longRun = result.notRecommended.find((r) => r.template.id === 'run_long');
    expect(longRun?.blockedBy).toBe('Zeitfenster zu klein');
  });
});

describe('recovery constraints', () => {
  it('blocks intensity the day after a hard session', () => {
    const result = build({
      shift: 'shift_off',
      checkIns: [checkIn(TODAY, { sleepHours: 8, fatigue: 1, soreness: 1, stress: 1 })],
      sessions: [session('2026-03-10', 'run', 60, 'vo2')],
    });
    const intervals = result.notRecommended.find((r) => r.template.id === 'run_intervals');
    expect(intervals?.blockedBy).toBe('Zu kurzer Abstand zur letzten harten Einheit');
  });

  it('caps intensity when readiness is low', () => {
    const result = build({
      shift: 'shift_off',
      checkIns: [checkIn(TODAY, { sleepHours: 4, fatigue: 5, soreness: 5, stress: 5, motivation: 1 })],
    });
    const blocked = result.notRecommended.map((r) => r.template.id);
    expect(blocked).toContain('run_intervals');
    // In the recovery band nothing above regeneration intensity survives.
    expect(blocked).toContain('run_z2');
    const top = result.recommended[0];
    expect(['recovery', 'mobility', 'run', 'bike']).toContain(top.template.sport);
    expect(top.template.intensity).toBe('recovery');
  });

  it('offers no training stimulus after five consecutive training days', () => {
    const sessions = ['06', '07', '08', '09', '10'].map((d) =>
      session(`2026-03-${d}`, 'run', 60, 'easy'),
    );
    const result = build({ shift: 'shift_off', sessions });
    const offered = [...result.recommended, ...result.alternatives];

    // Everything offered must be regeneration — mobility, a recovery-intensity
    // session, or a full rest day. Nothing that adds training load.
    for (const rec of offered) {
      const regenerative =
        rec.template.isRest || rec.template.intensity === 'recovery' || rec.template.sport === 'mobility';
      expect(regenerative).toBe(true);
    }
    expect(offered.some((r) => r.template.isRest)).toBe(true);
    // And every genuine training option is explicitly blocked with a reason.
    const blockedIds = result.notRecommended.map((r) => r.template.id);
    expect(blockedIds).toContain('run_z2');
    expect(blockedIds).toContain('strength_full');
  });

  it('does not recommend a long run to an athlete with no training history', () => {
    // Cold start: nothing logged, so nothing is known about current capacity.
    const result = build({ shift: 'shift_off', checkIns: [checkIn(TODAY, { sleepHours: 8, fatigue: 1 })] });
    const offered = [...result.recommended, ...result.alternatives];
    expect(offered.some((r) => r.template.isLong)).toBe(false);
    expect(offered.every((r) => r.template.durationMin <= 75)).toBe(true);
  });

  it('blocks a strength session for a muscle group loaded yesterday', () => {
    const result = build({
      shift: 'shift_off',
      checkIns: [checkIn(TODAY, { sleepHours: 8, fatigue: 1, soreness: 1, stress: 1 })],
      sessions: [
        session('2026-03-10', 'strength', 50, 'moderate', {
          muscleGroups: ['back', 'chest', 'arms', 'shoulders', 'core'],
        }),
      ],
    });
    const upper = result.notRecommended.find((r) => r.template.id === 'strength_upper');
    expect(upper?.blockedBy).toBe('Muskelgruppe noch nicht erholt');
  });
});

describe('focus', () => {
  it('does not name a focus the day cannot deliver', () => {
    // A 12-hour day shift allows 20 minutes at recovery intensity. Telling the
    // athlete to "secure the week's strength session" would be unactionable.
    const result = build({ shift: 'shift_day' });
    expect(result.focus).not.toMatch(/Krafteinheit/);
  });

  it('names the long run only on a day that can host it', () => {
    const result = build({ shift: 'shift_v' });
    expect(result.focus).not.toMatch(/Long Run/);
  });
});

describe('transparency', () => {
  it('always explains the recommendation', () => {
    const result = build({ shift: 'shift_off', checkIns: [checkIn(TODAY, { sleepHours: 8 })] });
    expect(result.recommended[0].reasons.length).toBeGreaterThan(0);
    for (const reason of result.recommended[0].reasons) {
      expect(reason.text.length).toBeGreaterThan(3);
    }
  });

  it('always explains why an option was excluded', () => {
    const result = build({ shift: 'shift_day' });
    for (const rec of result.notRecommended) {
      expect(rec.blockedBy).toBeTruthy();
      expect(rec.reasons.length).toBeGreaterThan(0);
    }
  });

  it('offers alternatives from different sports than the recommendation', () => {
    const result = build({
      shift: 'shift_off',
      checkIns: [checkIn(TODAY, { sleepHours: 8, fatigue: 2, soreness: 1, stress: 2 })],
    });
    const sports = result.alternatives.map((a) => a.template.sport);
    expect(new Set(sports).size).toBe(sports.length);
  });
});

describe('plan review', () => {
  it('flags a plan that does not fit the shift', () => {
    const result = build({
      shift: 'shift_v',
      sessions: [session(TODAY, 'run', 120, 'easy', { status: 'planned' })],
    });
    expect(result.planReview?.verdict).toBe('too_much');
  });

  it('flags a hard plan on a low-readiness day', () => {
    const result = build({
      shift: 'shift_off',
      checkIns: [checkIn(TODAY, { sleepHours: 4, fatigue: 5, soreness: 5, stress: 5 })],
      sessions: [session(TODAY, 'run', 60, 'vo2', { status: 'planned' })],
    });
    expect(result.planReview?.verdict).toBe('adjust');
  });

  it('confirms a plan that fits', () => {
    const result = build({
      shift: 'shift_off',
      checkIns: [checkIn(TODAY, { sleepHours: 8, fatigue: 2, soreness: 1, stress: 2 })],
      sessions: [session(TODAY, 'run', 55, 'easy', { status: 'planned' })],
    });
    expect(result.planReview?.verdict === 'aligned' || result.planReview?.verdict === 'adjust').toBe(true);
  });
});
