import type { DailyCheckIn, ISODate } from '../types.ts';
import type {
  AcwrSummary,
  CycleBlock,
  CyclePlan,
  DayPlan,
  DayShape,
  MacrocycleBalance,
  PlannedUnit,
  PlannerSettings,
  RecoveryValue,
  SessionKind,
} from './types.ts';
import { CATALOGUE, downgradeUntil } from './catalogue.ts';
import { checkPlacement, restDayViolation } from './rules.ts';
import { computeRecovery } from './recovery.ts';
import { findSlotFor } from './slots.ts';
import { computeAcwr } from './acwr.ts';
import {
  DELOAD_DURATION_FACTOR,
  cycleTypeFor,
  deloadKind,
  isDeloadCycle,
  macrocyclePosition,
  templateFor,
} from './template.ts';
import { addDays } from '../date.ts';

/**
 * The planner: a fixed template plus two filters, in that order.
 *
 * There is no optimiser here, and that is the point. The rotation is completely
 * predictable, so an optimiser would produce different plans from the same
 * starting position — bad for consistency and bad for comparing one cycle
 * against the next. Adaptation comes from repeated, alike stimuli, not from a
 * chain of locally optimal decisions. So the template decides *what* is
 * trained, and the recovery value only decides *how much of it survives the
 * morning*.
 *
 * The sequence from section 9:
 *
 *   1. cycle day and cycle type (A or B)
 *   2. load the template
 *   3. apply the V-Schicht exception
 *   4. apply the deload, every fourth cycle
 *   5. recovery value in the morning → downgrade where it falls short
 *   6. acute-to-chronic ratio → warn and downgrade the next hard session
 *   7. hard rules as the last layer
 *   8. output the plan, the downgrades applied, and the reasons
 */

export interface PlanInput {
  shapes: DayShape[];
  /** Load already completed, by date. Feeds the acute-to-chronic ratio. */
  completedLoadByDate: Map<ISODate, number>;
  /** Days that are known to have happened, rest days included. */
  knownDates?: Set<ISODate>;
  checkIns: Map<ISODate, DailyCheckIn>;
  settings: PlannerSettings;
  /**
   * How many cycles were completed before this horizon starts. Decides which
   * cycle is A and which is B, and where the deload falls.
   */
  cycleOffset: number;
  /** The athlete's normal resting heart rate, for the recovery filter. */
  restingHrNorm?: number | null;
  today?: ISODate;
}

export function planCycle(input: PlanInput): CyclePlan {
  const { shapes, settings } = input;
  const shapesByDate = new Map(shapes.map((s) => [s.date, s]));
  const warnings: string[] = [];

  /* 1 · Group the horizon into cycles and give each its type and position. */
  const groups = groupCycles(shapes);

  /* 5a · The recovery value for every day, computed before anything is placed. */
  const recoveries = new Map<ISODate, RecoveryValue>();
  for (const shape of shapes) {
    recoveries.set(
      shape.date,
      computeRecovery(shape, { checkIns: input.checkIns, restingHrNorm: input.restingHrNorm }),
    );
  }

  /* 6 · Acute against chronic, from what was actually completed. */
  const anchor = input.today ?? shapes[0]?.date ?? '1970-01-01';
  const known = input.knownDates ?? new Set(input.completedLoadByDate.keys());
  const acwrNow = computeAcwr(anchor, input.completedLoadByDate, known);
  if (acwrNow.message) warnings.push(acwrNow.message);
  /** One downgrade only: the *next* hard session, not every one of them. */
  let acwrDowngradePending = acwrNow.band === 'high';

  const units: PlannedUnit[] = [];
  const cycles: CycleBlock[] = [];

  for (const group of groups) {
    const cycleIndex = input.cycleOffset + group.indexInHorizon;
    const type = cycleTypeFor(cycleIndex);
    const deload = isDeloadCycle(cycleIndex);
    const byCycleDay = new Map(templateFor(type).map((e) => [e.cycleDay, e]));
    const cycleUnits: PlannedUnit[] = [];

    /* 3 · A V-Schicht replaces day 5 and pushes its strength onto day 4. */
    const vShiftDay = group.days.find((s) => s.isVShift) ?? null;

    for (const shape of group.days) {
      if (shape.cycleDay == null || shape.outOfRotation === 'sick') continue;

      const entry = byCycleDay.get(shape.cycleDay);
      if (!entry) continue;

      /* 2 · The template's session for this cycle day. */
      let wanted: SessionKind | null = entry.kind;
      const reasons: string[] = entry.kind ? [entry.reason] : [];

      if (shape.isVShift) {
        // Only an easy run fits the narrow V-Schicht window.
        wanted = 'easy_run';
        reasons.length = 0;
        reasons.push('V-Schicht: nur ein lockerer Lauf passt in das enge Fenster');
      }

      /* 4 · Deload every fourth cycle. */
      let durationFactor = 1;
      if (deload && wanted) {
        const reduced = deloadKind(wanted);
        if (reduced !== wanted) {
          reasons.push(
            reduced === null
              ? 'Deload-Zyklus: der intensive Lauf entfällt'
              : `Deload-Zyklus: ${CATALOGUE[wanted].label} wird zu ${CATALOGUE[reduced].label}`,
          );
        }
        wanted = reduced;
        durationFactor = DELOAD_DURATION_FACTOR;
        if (wanted) reasons.push('Deload-Zyklus: Umfang halbiert');
      }

      if (!wanted) continue;

      const placed = place({
        shape,
        wanted,
        reasons,
        durationFactor,
        recovery: recoveries.get(shape.date)!,
        existingOnDay: [],
        acwrDowngrade: acwrDowngradePending,
        acwrRatio: acwrNow.ratio,
      });
      if (!placed) {
        warnings.push(`${CATALOGUE[wanted].label} passte am ${shape.date} in kein Fenster.`);
        continue;
      }
      if (acwrDowngradePending && CATALOGUE[placed.kind].load >= 60) acwrDowngradePending = false;
      units.push(placed);
      cycleUnits.push(placed);
    }

    /* 3b · The V-Schicht's strength session moves to day 4 as a second unit. */
    if (vShiftDay) {
      const dayFour = group.days.find((s) => s.cycleDay === 4 && !s.isVShift);
      const recovery = dayFour ? recoveries.get(dayFour.date)! : null;
      if (dayFour && recovery && recovery.value >= 85) {
        const existing = cycleUnits.filter((u) => u.date === dayFour.date);
        const moved = place({
          shape: dayFour,
          // Downgraded on the way: a double day caps out at 125 total load.
          wanted: 'moderate_strength',
          reasons: [
            'V-Schicht ersetzt Tag 5 — die Krafteinheit wandert auf Tag 4, abgestuft auf moderate Kraft',
          ],
          durationFactor: deload ? DELOAD_DURATION_FACTOR : 1,
          recovery,
          existingOnDay: existing,
          acwrDowngrade: false,
          acwrRatio: acwrNow.ratio,
        });
        if (moved) {
          units.push(moved);
          cycleUnits.push(moved);
        } else {
          warnings.push(
            `Die Krafteinheit dieses Zyklus entfällt: sie passte am ${dayFour.date} in kein zweites Fenster.`,
          );
        }
      } else {
        // Not carried forward: the deficit is not made up in the next cycle.
        warnings.push(
          'V-Schicht in diesem Zyklus und Tag 4 unter Erholungswert 85 — die Krafteinheit entfällt ersatzlos.',
        );
      }
    }

    cycles.push({
      index: cycleIndex,
      type,
      position: macrocyclePosition(cycleIndex),
      isDeload: deload,
      from: group.days[0]?.date ?? '',
      to: group.days[group.days.length - 1]?.date ?? '',
      load: cycleUnits.reduce((sum, u) => sum + u.load, 0),
      days: [],
    });
  }

  /* 7 · Hard rules as the last layer, over the finished plan. */
  const loadByDate = loadFromUnits(units, input.completedLoadByDate);
  const days: DayPlan[] = shapes.map((shape) => {
    const dayUnits = units.filter((u) => u.date === shape.date).sort((a, b) => a.start - b.start);
    const violations = dayUnits.flatMap((u) =>
      checkPlacement(
        { date: u.date, kind: u.kind, start: u.start, durationMinutes: u.durationMinutes },
        {
          shape,
          recovery: recoveries.get(shape.date)!,
          sameDay: dayUnits.filter((x) => x !== u),
          allUnits: units.filter((x) => x !== u),
          loadByDate,
          shapesByDate,
          settings,
        },
      ),
    );
    return {
      shape,
      recovery: recoveries.get(shape.date)!,
      units: dayUnits,
      load: dayUnits.reduce((sum, u) => sum + u.load, 0),
      violations,
    };
  });

  const daysByDate = new Map(days.map((d) => [d.shape.date, d]));
  for (const cycle of cycles) {
    cycle.days = groups
      .find((g) => g.days[0]?.date === cycle.from)!
      .days.map((s) => daysByDate.get(s.date)!)
      .filter(Boolean);
  }

  const violations = days.flatMap((d) => d.violations);
  for (const cycle of cycles) {
    const missing = restDayViolation(
      cycle.days.map((d) => d.shape.date),
      loadByDate,
    );
    if (missing) violations.push(missing);
  }

  return {
    days,
    cycles,
    macrocycle: macrocycleBalance(cycles),
    acwr: acwrSummary(acwrNow, anchor, input.completedLoadByDate, known),
    settings,
    violations,
    warnings,
  };

  /* ---------------- helpers that close over the plan being built ---------------- */

  /**
   * Places one session, weakening it along its chain until it fits.
   *
   * Two things can force a downgrade: the day's recovery value falling below
   * the session's minimum, and the acute-to-chronic ratio sitting above its
   * band. Never a deletion — with four sessions per cycle, keeping the
   * frequency matters more than any single intensity, and a dropped session
   * cannot be made up on this rotation.
   */
  function place(args: {
    shape: DayShape;
    wanted: SessionKind;
    reasons: string[];
    durationFactor: number;
    recovery: RecoveryValue;
    existingOnDay: PlannedUnit[];
    acwrDowngrade: boolean;
    acwrRatio: number | null;
  }): PlannedUnit | null {
    const { shape, wanted, recovery, existingOnDay } = args;
    const reasons = [...args.reasons];

    // One forced step down when the recent load ratio is running hot.
    let start: SessionKind = wanted;
    if (args.acwrDowngrade && CATALOGUE[wanted].load >= 60) {
      const softer = CATALOGUE[wanted].downgradeTo;
      if (softer) {
        reasons.push(
          `Belastungsverhältnis ${args.acwrRatio?.toFixed(2)} über dem Zielband — eine Stufe zurück`,
        );
        start = softer;
      }
    }

    const accepted = downgradeUntil(start, (candidate) => {
      if (recovery.value < CATALOGUE[candidate].minRecovery) return false;
      return findSlotFor(shape, candidate, existingOnDay) !== null;
    });
    if (!accepted) return null;

    const slot = findSlotFor(shape, accepted, existingOnDay)!;
    const spec = CATALOGUE[accepted];

    if (accepted !== wanted) {
      reasons.push(
        recovery.value < CATALOGUE[wanted].minRecovery
          ? `Erholungswert ${recovery.value} unter den ${CATALOGUE[wanted].minRecovery}, die ${CATALOGUE[wanted].label} braucht — abgestuft statt gestrichen`
          : `${CATALOGUE[wanted].label} passte nicht ins Fenster — abgestuft statt gestrichen`,
      );
    } else {
      reasons.push(`Erholungswert ${recovery.value} ≥ ${spec.minRecovery}`);
    }

    const duration = Math.max(
      spec.minMinutes,
      Math.min(slot.durationMinutes, Math.round(spec.defaultMinutes * args.durationFactor)),
    );

    /*
     * Load follows the duration actually planned, not the factor asked for.
     *
     * Halving a volume runs into each session's minimum — a long run does not
     * go below 75 minutes whatever the deload says. Scaling the load by the
     * requested factor rather than the achieved one would then book a session
     * as half the cost while it is still five sixths the length.
     */
    const load = Math.round((spec.load * duration) / spec.defaultMinutes);

    return {
      date: shape.date,
      kind: accepted,
      start: slot.start,
      durationMinutes: duration,
      load,
      reasons,
      downgradedFrom: accepted !== wanted ? wanted : undefined,
    };
  }
}

/* ------------------------------------------------------------------ *
 * Plain helpers
 * ------------------------------------------------------------------ */

interface CycleGroup {
  indexInHorizon: number;
  days: DayShape[];
}

/** Splits the horizon at every cycle day 1. */
function groupCycles(shapes: DayShape[]): CycleGroup[] {
  const groups: CycleGroup[] = [];
  let current: DayShape[] = [];
  for (const shape of shapes) {
    if (shape.cycleDay === 1 && current.length > 0) {
      groups.push({ indexInHorizon: groups.length, days: current });
      current = [];
    }
    current.push(shape);
  }
  if (current.length > 0) groups.push({ indexInHorizon: groups.length, days: current });
  return groups;
}

function loadFromUnits(
  units: PlannedUnit[],
  base: Map<ISODate, number>,
): Map<ISODate, number> {
  const map = new Map(base);
  for (const unit of units) {
    map.set(unit.date, (map.get(unit.date) ?? 0) + unit.load);
  }
  return map;
}

/**
 * The macrocycle balance: the first complete A + B pair in the horizon.
 *
 * Ten days rather than seven, because the rotation is five days long and any
 * seven-day count cuts every cycle in a different place.
 */
function macrocycleBalance(cycles: CycleBlock[]): MacrocycleBalance {
  const pairStart = cycles.findIndex((c) => c.position === 1);
  const pair =
    pairStart >= 0 && cycles[pairStart + 1] ? cycles.slice(pairStart, pairStart + 2) : cycles.slice(0, 2);
  const days = pair.flatMap((c) => c.days);
  const allUnits = days.flatMap((d) => d.units);

  const runMinutes = allUnits
    .filter((u) => CATALOGUE[u.kind].discipline === 'run')
    .reduce((sum, u) => sum + u.durationMinutes, 0);
  const zone2Minutes = allUnits
    .filter((u) => u.kind === 'easy_run' || u.kind === 'long_run')
    .reduce((sum, u) => sum + u.durationMinutes, 0);

  return {
    from: days[0]?.shape.date ?? '',
    to: days[days.length - 1]?.shape.date ?? '',
    complete: pair.length === 2 && pair[0].position === 1 && pair[1].position === 2,
    load: allUnits.reduce((sum, u) => sum + u.load, 0),
    runs: allUnits.filter((u) => CATALOGUE[u.kind].discipline === 'run').length,
    strengthSessions: allUnits.filter((u) => CATALOGUE[u.kind].discipline === 'strength').length,
    restDays: days.filter((d) => d.load === 0).length,
    zone2Share: runMinutes > 0 ? Math.round((zone2Minutes / runMinutes) * 100) / 100 : 0,
  };
}

/** The ratio today plus the last four weeks of it, for the trend curve. */
function acwrSummary(
  now: ReturnType<typeof computeAcwr>,
  anchor: ISODate,
  loadByDate: Map<ISODate, number>,
  known: Set<ISODate>,
): AcwrSummary {
  const history: { date: ISODate; ratio: number | null }[] = [];
  for (let i = 27; i >= 0; i--) {
    const date = addDays(anchor, -i);
    history.push({ date, ratio: computeAcwr(date, loadByDate, known).ratio });
  }
  return { ratio: now.ratio, band: now.band, message: now.message, history };
}
