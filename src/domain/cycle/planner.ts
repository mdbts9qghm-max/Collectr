import type { DailyCheckIn, ISODate } from '../types.ts';
import type {
  CyclePlan,
  DayPlan,
  DayShape,
  PlannedUnit,
  PlannerSettings,
  RecoveryValue,
  RuleViolation,
  SessionKind,
} from './types.ts';
import { CATALOGUE, WINDOW_TARGET, downgradeUntil, isFullBodyStrength, isHard } from './catalogue.ts';
import { checkPlacement, rollingWindow } from './rules.ts';
import type { PlacementContext } from './rules.ts';
import { computeRecovery } from './recovery.ts';
import { findSlotFor as findSlot } from './slots.ts';
import { formatClock } from './windows.ts';
import { addDays } from '../date.ts';

/**
 * The planner from section 10.
 *
 * It fills a cycle rather than scoring a single day, because the value of a
 * Tuesday only becomes clear next to the free Saturday. Where a hard rule
 * blocks a session it is weakened along its downgrade chain instead of deleted:
 * in hybrid training, keeping the frequency matters more than any one hard
 * session.
 */

export interface PlanInput {
  shapes: DayShape[];
  /** Load already completed, by date — feeds recovery and the rolling window. */
  completedLoadByDate: Map<ISODate, number>;
  checkIns: Map<ISODate, DailyCheckIn>;
  settings: PlannerSettings;
  /**
   * Which key session this cycle should carry on day 4. Rotates across cycles
   * so all three get their turn.
   */
  keyRotationIndex: number;
  /**
   * The current date, when the caller knows it. Progression is measured against
   * what was actually trained, so the growth rule only applies where the
   * previous window lies in the past.
   */
  today?: ISODate;
}

const KEY_ROTATION: SessionKind[] = ['intense_run', 'long_run', 'heavy_strength'];

/** Standard assignment from section 8, before any rule is applied. */
const STANDARD_BY_CYCLE_DAY: Record<number, SessionKind[]> = {
  1: [],
  2: ['moderate_strength', 'easy_run'],
  3: ['easy_run', 'upper_strength'],
  4: [], // filled from the key rotation
  5: ['heavy_strength'],
};

export function planCycle(input: PlanInput): CyclePlan {
  const { shapes, settings } = input;
  const shapesByDate = new Map(shapes.map((s) => [s.date, s]));

  /* 2 · Recovery for every day. */
  const recoveries = new Map<ISODate, RecoveryValue>();
  for (const shape of shapes) {
    recoveries.set(
      shape.date,
      computeRecovery(shape, { loadByDate: input.completedLoadByDate, checkIns: input.checkIns }),
    );
  }

  const units: PlannedUnit[] = [];
  const loadByDate = new Map(input.completedLoadByDate);
  const warnings: string[] = [];

  /*
   * The 110 % growth rule needs a previous window worth comparing against.
   *
   * Two ways it can be worthless. It can reach back past the data, where the
   * missing days read as zero and every plan looks like a jump. And it can lie
   * in the future, where it is the planner's own projection — throttling a
   * cycle because the projection before it came out light is a ratchet, not
   * progression. Progression is measured on what was trained, so the rule only
   * applies once the whole previous window is in the past.
   */
  const horizonStart = shapes[0]?.date ?? '1970-01-01';
  const previousWindowKnown = (date: ISODate) => {
    const oldest = addDays(date, -13);
    const newest = addDays(date, -7);
    if (input.today && newest > input.today) return false;
    return oldest >= horizonStart || input.completedLoadByDate.has(oldest);
  };

  const ctxFor = (shape: DayShape, excluding: PlannedUnit[] = []): PlacementContext => ({
    shape,
    recovery: recoveries.get(shape.date)!,
    sameDay: units.filter((u) => u.date === shape.date && !excluding.includes(u)),
    allUnits: units.filter((u) => !excluding.includes(u)),
    loadByDate: loadFromUnits(units.filter((u) => !excluding.includes(u)), input.completedLoadByDate),
    shapesByDate,
    settings,
    previousWindowKnown: previousWindowKnown(shape.date),
    // Sequential placement only; the growth rule waits for the finished plan.
    checkWindowGrowth: false,
  });

  /**
   * Places a session on a day, weakening it along the downgrade chain until the
   * rules accept it. Returns the placed unit, or null when even the weakest
   * option does not fit.
   */
  const place = (shape: DayShape, wanted: SessionKind, reasonSeed: string): PlannedUnit | null => {
    if (!shape.trainingWindow && !shape.alternativeWindow) return null;

    const accepted = downgradeUntil(wanted, (candidate) => {
      const slot = findSlot(shape, candidate, units.filter((u) => u.date === shape.date));
      if (!slot) return false;
      return checkPlacement({ ...slot, kind: candidate }, ctxFor(shape)).length === 0;
    });
    if (!accepted) return null;

    const slot = findSlot(shape, accepted, units.filter((u) => u.date === shape.date))!;
    const spec = CATALOGUE[accepted];
    const reasons = [reasonSeed, `Erholungswert ${recoveries.get(shape.date)!.value} ≥ ${spec.minRecovery}`];
    if (accepted !== wanted) {
      reasons.push(`Abgestuft von ${CATALOGUE[wanted].label}, weil eine harte Regel dagegen stand`);
    }

    const unit: PlannedUnit = {
      date: shape.date,
      kind: accepted,
      start: slot.start,
      durationMinutes: slot.durationMinutes,
      load: spec.load,
      reasons,
      downgradedFrom: accepted !== wanted ? wanted : undefined,
    };
    units.push(unit);
    loadByDate.set(shape.date, (loadByDate.get(shape.date) ?? 0) + spec.load);
    return unit;
  };

  /*
   * 4 · Key session on cycle day 4, following the rotation.
   *
   * The rotation advances per cycle, not per plan: when the horizon covers
   * several cycles, each one gets the next key session rather than repeating
   * the same one. `keyRotationIndex` says where the caller left off.
   */
  let keyOffset = 0;
  for (const shape of shapes) {
    if (shape.cycleDay !== 4 || shape.isVShift) continue;
    const keyKind =
      KEY_ROTATION[Math.abs(input.keyRotationIndex + keyOffset) % KEY_ROTATION.length];
    keyOffset += 1;
    const placed = place(
      shape,
      keyKind,
      'Schlüsseltag des Zyklus — höchster Erholungswert der Rotation',
    );
    if (!placed) warnings.push(`Schlüsseleinheit ${CATALOGUE[keyKind].label} passte an keinen Tag 4.`);
  }

  /* 5 · Remaining standard assignment. */
  for (const shape of shapes) {
    if (shape.cycleDay == null || shape.cycleDay === 4) continue;
    if (shape.outOfRotation === 'sick') continue;

    if (shape.isVShift) {
      // The heavy strength session of cycle day 5 falls away here; only an easy
      // run fits the narrow window.
      place(shape, 'easy_run', 'V-Schicht: nur ein lockerer Lauf passt ins Fenster');
      continue;
    }

    const options = STANDARD_BY_CYCLE_DAY[shape.cycleDay] ?? [];
    for (const option of options) {
      if (units.some((u) => u.date === shape.date)) break;
      const reason =
        shape.cycleDay === 2
          ? 'Nachtschichttag: mittlere Belastung vor dem Vorschlaf'
          : shape.cycleDay === 3
            ? 'Schlaftag: leichte bis mittlere Belastung am Nachmittag'
            : 'Zweiter Belastungstag des Zyklus';
      if (place(shape, option, reason)) break;
    }
  }

  /*
   * 6 · Double session, but only when the rolling window really falls short.
   *
   * Four windows per five-day cycle is 5.6 sessions per seven days against a
   * target of six, so roughly every third cycle needs a double. It is never
   * added speculatively: without a full seven days of information — planned
   * days plus completed history — the planner has no basis for the claim and
   * leaves the cycle at its four sessions.
   */
  const lastDate = shapes[shapes.length - 1]?.date;
  if (lastDate && windowIsFullyKnown(lastDate, shapes, input.completedLoadByDate)) {
    const missingNow = missingUnits(units, lastDate);
    if (missingNow.length > 0) {
      for (const shape of shapes) {
        const isFree = (shape.cycleDay === 4 || shape.cycleDay === 5) && !shape.isVShift;
        if (!isFree) continue;
        const onDay = units.filter((u) => u.date === shape.date);
        if (onDay.length !== 1) continue;

        /*
         * The second session complements the first: strength next to a run, a
         * run next to strength. Two runs on one day are one run split in half —
         * the same tissue, the same impact, no second adaptation. So the
         * candidate is picked from the missing sessions of the other discipline,
         * and the day is skipped when none is missing.
         */
        const taken = CATALOGUE[onDay[0].kind].discipline;
        const partner = missingNow.find((kind) => {
          const d = CATALOGUE[kind].discipline;
          return d !== taken && d !== 'other';
        });
        if (!partner) continue;

        if (place(shape, partner, 'Doppeleinheit, weil das 7-Tage-Fenster sonst unter Soll bleibt')) {
          // At most one double per cycle — the deficit is 0.4 sessions per week,
          // not a second training day.
          break;
        }
      }
    }
  }

  /*
   * 7 · Repair pass.
   *
   * Sessions are placed one after another, so each is checked against the plan
   * as it stood at that moment. A later placement can push an earlier one over
   * a limit — most often the rolling window. This pass re-validates the finished
   * plan and weakens the offending session along its downgrade chain, exactly as
   * section 7 prescribes. Removal is the last resort, only when nothing weaker
   * exists.
   */
  repair(units, recoveries, input.completedLoadByDate, shapesByDate, settings, previousWindowKnown);

  /* 8 · Local search: swap sessions between days while it improves the score. */
  const improved = localSearch(units, shapes, recoveries, input.completedLoadByDate, shapesByDate, settings);

  /* 9 · Assemble. */
  const days: DayPlan[] = shapes.map((shape) => {
    const dayUnits = improved.filter((u) => u.date === shape.date);
    const violations = dayUnits.flatMap((u) =>
      checkPlacement(
        { date: u.date, kind: u.kind, start: u.start, durationMinutes: u.durationMinutes },
        {
          shape,
          recovery: recoveries.get(shape.date)!,
          sameDay: dayUnits.filter((x) => x !== u),
          allUnits: improved.filter((x) => x !== u),
          loadByDate: loadFromUnits(improved, input.completedLoadByDate, u),
          shapesByDate,
          settings,
          previousWindowKnown: previousWindowKnown(u.date),
        },
      ),
    );
    return {
      shape,
      recovery: recoveries.get(shape.date)!,
      units: dayUnits.sort((a, b) => a.start - b.start),
      load: dayUnits.reduce((sum, u) => sum + u.load, 0),
      violations,
    };
  });

  const anchor = lastDate ?? shapes[0]?.date ?? '1970-01-01';
  const finalLoad = loadFromUnits(improved, input.completedLoadByDate);
  const window = rollingWindow(anchor, finalLoad);
  const counts = countKinds(improved, anchor);
  const evaluation = evaluate(improved, days, anchor, settings);

  return {
    days,
    settings,
    window: {
      from: addDays(anchor, -6),
      to: anchor,
      load: window.load,
      previousLoad: window.previousLoad,
      counts,
      restDays: window.restDays,
      zone2Share: zone2Share(improved, anchor),
    },
    missing: missingUnits(improved, anchor),
    violations: days.flatMap((d) => d.violations),
    score: evaluation.score,
    scoreBreakdown: evaluation.breakdown,
    warnings,
  };
}

const MAX_REPAIR_PASSES = 24;

/**
 * Repeatedly finds a rule-violating session and weakens it, until the plan is
 * clean or nothing can be weakened further.
 */
function repair(
  units: PlannedUnit[],
  recoveries: Map<ISODate, RecoveryValue>,
  baseLoad: Map<ISODate, number>,
  shapesByDate: Map<ISODate, DayShape>,
  settings: PlannerSettings,
  previousWindowKnown: (date: ISODate) => boolean,
): void {
  for (let pass = 0; pass < MAX_REPAIR_PASSES; pass++) {
    const offender = findOffender(units, recoveries, baseLoad, shapesByDate, settings, previousWindowKnown);
    if (!offender) return;

    const { unit, index } = offender;
    const weaker = CATALOGUE[unit.kind].downgradeTo;
    const shape = shapesByDate.get(unit.date);

    if (weaker && shape) {
      const slot = findSlot(shape, weaker, units.filter((u) => u !== unit && u.date === unit.date));
      if (slot) {
        units[index] = {
          ...unit,
          kind: weaker,
          load: CATALOGUE[weaker].load,
          start: slot.start,
          durationMinutes: slot.durationMinutes,
          downgradedFrom: unit.downgradedFrom ?? unit.kind,
          reasons: [...unit.reasons, `Abgestuft auf ${CATALOGUE[weaker].label}, weil eine harte Regel dagegen stand`],
        };
        continue;
      }
    }
    // Nothing weaker fits: dropping it is the only remaining option.
    units.splice(index, 1);
  }
}

/** The first session that breaks a rule, checked against the finished plan. */
function findOffender(
  units: PlannedUnit[],
  recoveries: Map<ISODate, RecoveryValue>,
  baseLoad: Map<ISODate, number>,
  shapesByDate: Map<ISODate, DayShape>,
  settings: PlannerSettings,
  previousWindowKnown: (date: ISODate) => boolean,
): { unit: PlannedUnit; index: number } | null {
  /*
   * Least-recovered day first, heaviest session within a day.
   *
   * When two sessions clash it is always one of them that has to give, and the
   * choice is not arbitrary: the day that can carry the least should lose the
   * most. Sorting by load alone used to gut the key day — two equally heavy
   * strength sessions on consecutive days, and the one on the freshest day of
   * the cycle was the one walked down to a twenty-minute stroll.
   */
  const order = units
    .map((unit, index) => ({ unit, index }))
    .sort((a, b) => {
      const ra = recoveries.get(a.unit.date)?.value ?? 0;
      const rb = recoveries.get(b.unit.date)?.value ?? 0;
      if (ra !== rb) return ra - rb;
      return b.unit.load - a.unit.load;
    });

  for (const entry of order) {
    const shape = shapesByDate.get(entry.unit.date);
    if (!shape) continue;
    const violations = checkPlacement(
      {
        date: entry.unit.date,
        kind: entry.unit.kind,
        start: entry.unit.start,
        durationMinutes: entry.unit.durationMinutes,
      },
      {
        shape,
        recovery: recoveries.get(entry.unit.date)!,
        sameDay: units.filter((u) => u.date === entry.unit.date && u !== entry.unit),
        allUnits: units.filter((u) => u !== entry.unit),
        loadByDate: loadFromUnits(units, baseLoad, entry.unit),
        shapesByDate,
        settings,
        previousWindowKnown: previousWindowKnown(entry.unit.date),
      },
    );
    if (violations.length > 0) return entry;
  }
  return null;
}

/**
 * True when every day of the rolling window is either being planned now or has
 * recorded history. Anything less and a shortfall cannot be distinguished from
 * a gap in knowledge.
 */
function windowIsFullyKnown(
  anchor: ISODate,
  shapes: DayShape[],
  completed: Map<ISODate, number>,
): boolean {
  const planned = new Set(shapes.map((s) => s.date));
  for (let i = 0; i < 7; i++) {
    const date = addDays(anchor, -i);
    if (!planned.has(date) && !completed.has(date)) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ *
 * Targets, objective, local search
 * ------------------------------------------------------------------ */

function countKinds(units: PlannedUnit[], anchor: ISODate): Record<SessionKind, number> {
  const counts = Object.fromEntries(
    Object.keys(CATALOGUE).map((k) => [k, 0]),
  ) as Record<SessionKind, number>;
  const from = addDays(anchor, -6);
  for (const u of units) {
    if (u.date < from || u.date > anchor) continue;
    counts[u.kind] += 1;
  }
  return counts;
}

/** Target sessions the rolling window still lacks. */
export function missingUnits(units: PlannedUnit[], anchor: ISODate): SessionKind[] {
  const counts = countKinds(units, anchor);
  const missing: SessionKind[] = [];
  const fullBody = counts.heavy_strength + counts.moderate_strength;

  for (const target of WINDOW_TARGET) {
    if (isFullBodyStrength(target.kind)) continue;
    for (let i = counts[target.kind]; i < target.count; i++) missing.push(target.kind);
  }
  for (let i = fullBody; i < 2; i++) missing.push('moderate_strength');
  return missing;
}

function loadFromUnits(
  units: PlannedUnit[],
  completed: Map<ISODate, number>,
  exclude?: PlannedUnit,
): Map<ISODate, number> {
  const map = new Map(completed);
  for (const u of units) {
    if (u === exclude) continue;
    map.set(u.date, (map.get(u.date) ?? 0) + u.load);
  }
  return map;
}

function zone2Share(units: PlannedUnit[], anchor: ISODate): number {
  const from = addDays(anchor, -6);
  let zone2 = 0;
  let total = 0;
  for (const u of units) {
    if (u.date < from || u.date > anchor) continue;
    if (CATALOGUE[u.kind].discipline !== 'run') continue;
    total += u.durationMinutes;
    if (u.kind === 'easy_run' || u.kind === 'long_run') zone2 += u.durationMinutes;
  }
  return total > 0 ? zone2 / total : 1;
}

/** The weighted goals from section 9. */
function evaluate(
  units: PlannedUnit[],
  days: DayPlan[],
  anchor: ISODate,
  settings: PlannerSettings,
): { score: number; breakdown: CyclePlan['scoreBreakdown'] } {
  const breakdown: CyclePlan['scoreBreakdown'] = [];
  const add = (goal: string, weight: number, achieved: number) => {
    breakdown.push({ goal, weight, achieved, points: Math.round(weight * achieved * 10) / 10 });
  };

  const missing = missingUnits(units, anchor).length;
  add('Soll im 7-Tage-Fenster', 10, Math.max(0, 1 - missing / settings.targetUnits));

  // Key sessions belong on the days with the highest recovery value.
  const keyUnits = units.filter((u) => isHard(u.kind));
  const byDate = new Map(days.map((d) => [d.shape.date, d.recovery.value]));
  const recoveryValues = days
    .filter((d) => d.shape.trainingWindow)
    .map((d) => d.recovery.value)
    .sort((a, b) => b - a);
  let keyFit = 1;
  if (keyUnits.length > 0 && recoveryValues.length > 0) {
    const best = recoveryValues.slice(0, keyUnits.length).reduce((a, b) => a + b, 0);
    const actual = keyUnits.reduce((sum, u) => sum + (byDate.get(u.date) ?? 0), 0);
    keyFit = best > 0 ? Math.min(1, actual / best) : 1;
  }
  add('Schlüsseleinheiten auf erholte Tage', 8, keyFit);

  const share = zone2Share(units, anchor);
  add('Polarisierung ≥ 70 % Zone 2', 6, Math.min(1, share / 0.7));

  const loads = days.filter((d) => d.shape.trainingWindow).map((d) => d.load);
  const spread = loads.length > 1 ? standardDeviation(loads) : 0;
  add('Gleichmäßige Tagesbelastung', 4, Math.max(0, 1 - spread / 60));

  const keyKinds = new Set(units.filter((u) => isHard(u.kind)).map((u) => u.kind));
  add('Rotation der Schlüsseleinheit', 3, Math.min(1, keyKinds.size / 2));

  return {
    score: Math.round(breakdown.reduce((sum, b) => sum + b.points, 0) * 10) / 10,
    breakdown,
  };
}

function standardDeviation(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

const MAX_ITERATIONS = 200;

/**
 * Hill climbing by swapping sessions between days. Capped at 200 passes — this
 * is a scheduling nicety, not a search problem worth minutes of CPU on a phone.
 */
function localSearch(
  units: PlannedUnit[],
  shapes: DayShape[],
  recoveries: Map<ISODate, RecoveryValue>,
  baseLoad: Map<ISODate, number>,
  shapesByDate: Map<ISODate, DayShape>,
  settings: PlannerSettings,
): PlannedUnit[] {
  if (units.length < 2) return units;
  const anchor = shapes[shapes.length - 1].date;

  let current = units.map((u) => ({ ...u }));
  let currentScore = scoreOf(current, shapes, recoveries, anchor, settings);

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    let improvedThisPass = false;

    for (let i = 0; i < current.length && !improvedThisPass; i++) {
      for (let j = i + 1; j < current.length; j++) {
        if (current[i].date === current[j].date) continue;
        const candidate = current.map((u) => ({ ...u }));
        const a = candidate[i];
        const b = candidate[j];

        const shapeA = shapesByDate.get(a.date);
        const shapeB = shapesByDate.get(b.date);
        if (!shapeA || !shapeB) continue;

        const slotA = findSlot(shapeA, b.kind, candidate.filter((u) => u.date === a.date && u !== a));
        const slotB = findSlot(shapeB, a.kind, candidate.filter((u) => u.date === b.date && u !== b));
        if (!slotA || !slotB) continue;

        const swappedA: PlannedUnit = {
          ...a,
          kind: b.kind,
          load: CATALOGUE[b.kind].load,
          start: slotA.start,
          durationMinutes: slotA.durationMinutes,
        };
        const swappedB: PlannedUnit = {
          ...b,
          kind: a.kind,
          load: CATALOGUE[a.kind].load,
          start: slotB.start,
          durationMinutes: slotB.durationMinutes,
        };
        candidate[i] = swappedA;
        candidate[j] = swappedB;

        if (!allowed(candidate, shapesByDate, recoveries, baseLoad, settings)) continue;

        const score = scoreOf(candidate, shapes, recoveries, anchor, settings);
        if (score > currentScore + 0.01) {
          current = candidate;
          currentScore = score;
          improvedThisPass = true;
          break;
        }
      }
    }

    if (!improvedThisPass) break;
  }

  return current;
}

function allowed(
  units: PlannedUnit[],
  shapesByDate: Map<ISODate, DayShape>,
  recoveries: Map<ISODate, RecoveryValue>,
  baseLoad: Map<ISODate, number>,
  settings: PlannerSettings,
): boolean {
  const loadByDate = loadFromUnits(units, baseLoad);
  for (const unit of units) {
    const shape = shapesByDate.get(unit.date);
    if (!shape) return false;
    const violations = checkPlacement(
      { date: unit.date, kind: unit.kind, start: unit.start, durationMinutes: unit.durationMinutes },
      {
        shape,
        recovery: recoveries.get(unit.date)!,
        sameDay: units.filter((u) => u.date === unit.date && u !== unit),
        allUnits: units.filter((u) => u !== unit),
        loadByDate: loadFromUnits(units, baseLoad, unit),
        shapesByDate,
        settings,
      },
    );
    if (violations.length > 0) return false;
  }
  void loadByDate;
  return true;
}

function scoreOf(
  units: PlannedUnit[],
  shapes: DayShape[],
  recoveries: Map<ISODate, RecoveryValue>,
  anchor: ISODate,
  settings: PlannerSettings,
): number {
  const days: DayPlan[] = shapes.map((shape) => {
    const dayUnits = units.filter((u) => u.date === shape.date);
    return {
      shape,
      recovery: recoveries.get(shape.date)!,
      units: dayUnits,
      load: dayUnits.reduce((sum, u) => sum + u.load, 0),
      violations: [] as RuleViolation[],
    };
  });
  return evaluate(units, days, anchor, settings).score;
}

/** Human-readable summary of one planned session, for the UI. */
export function describeUnit(unit: PlannedUnit): string {
  const spec = CATALOGUE[unit.kind];
  return `${spec.label} · ${formatClock(unit.start)}–${formatClock(unit.start + unit.durationMinutes)} · Belastung ${unit.load}`;
}
