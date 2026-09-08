import type { ISODate } from '../types.ts';
import type { Mode, SessionKind } from './catalogue.ts';
import type { PhaseTarget, BlockSpec } from './phases.ts';
import type { RecoveryValue } from './recovery.ts';
import type { Slot, CycleType } from './template.ts';
import type { IntervalSession, StageState } from './intervals.ts';
import type { Violation } from './rules.ts';
import type { Zone } from './zones.ts';
import { CATALOGUE, downgradeUntil, minRecoveryFor, MODE_META } from './catalogue.ts';
import { BASE_ZONES } from './zones.ts';
import { blockFor, targetFor } from './phases.ts';
import { buildIntervalSession, stageFor } from './intervals.ts';
import {
  V_SHIFT_MAX_MINUTES,
  V_SHIFT_MIN_MINUTES,
  cycleTypeFor,
  isDeloadCycle,
  macrocycleIndexOf,
  macrocyclePosition,
  templateFor,
} from './template.ts';
import { baseShare, distribute, planVolume, DELOAD_VOLUME_FACTOR } from './volume.ts';
import { anyEnabled, extensionAvailable, extensionSlots, EXTENSION_MIN_RECOVERY, HEADLINE } from './extension.ts';
import type { ExtensionSettings } from './extension.ts';
import type { SlotRequest } from './volume.ts';
import { checkMacrocycle, checkUnit } from './rules.ts';
import { ACWR_UPPER } from '../cycle/acwr.ts';
import { addDays } from '../date.ts';
import type { PlacedUnit } from './rules.ts';
import { windowsFor, vShiftWindows } from './windows.ts';
import type { DayWindows } from './windows.ts';

/**
 * The planner, running the nine steps of section 12.
 *
 * There is no optimiser. The rotation is predictable, so the template decides
 * what is trained; the phase model decides how much; and the recovery value only
 * decides how much of it survives the morning — switching the **mode** first and
 * the intensity only after.
 */

export interface DayInput {
  date: ISODate;
  cycleDay: 1 | 2 | 3 | 4 | 5 | null;
  isVShift: boolean;
  outOfRotation: 'vacation' | 'sick' | 'unknown' | null;
  recovery: RecoveryValue;
}

export interface PlanInput {
  days: DayInput[];
  /** Cycles completed before this horizon starts. */
  cycleOffset: number;
  dayShiftWakeMinutes: number;
  /** What the previous macrocycle actually carried. */
  previousAerobicMinutes: number | null;
  previousRunMinutes: number | null;
  /** Macrocycles that ran without a downgrade, most recent first. */
  cleanHistory: boolean[];
  /** How many intensity sessions are behind us, for the track direction. */
  intensitySessionCount: number;
  /** Acute-to-chronic ratio, or null while unknown. */
  acwr: number | null;
  loadByDate: Map<ISODate, number>;
  /** Set when the athlete switched a session's mode by hand. */
  modeOverrides?: Map<string, Mode>;
  /** The optional volume extension, off unless switched on deliberately. */
  extension?: ExtensionSettings;
  /**
   * Signals from the sleep module. It never downgrades anything itself — it
   * hands over what it observed and this planner decides what follows.
   */
  sleep?: {
    debtHours: number;
    downgradeNextHard: boolean;
    forceDeload: boolean;
    /** Dates after which no hard session may be planned. */
    blockHardAfter: ISODate[];
    warnings: string[];
  };
}

export interface PlannedUnit {
  date: ISODate;
  slotId: string;
  kind: SessionKind;
  mode: Mode | null;
  zone: Zone;
  start: number;
  durationMinutes: number;
  load: number;
  reasons: string[];
  /** Set when the session was weakened or moved to another mode. */
  downgradedFrom?: { kind: SessionKind; mode: Mode | null };
  /** True for a session the optional volume extension added. */
  fromExtension?: boolean;
  /** The track session, when this is the intensity slot. */
  interval?: IntervalSession;
  appendix?: string;
  blocked?: string;
}

export interface DayPlan {
  date: ISODate;
  cycleDay: number | null;
  isVShift: boolean;
  windows: DayWindows | null;
  recovery: RecoveryValue;
  units: PlannedUnit[];
  load: number;
  violations: Violation[];
}

export interface CycleBlockPlan {
  index: number;
  type: CycleType;
  position: 1 | 2;
  isDeload: boolean;
  days: DayPlan[];
  load: number;
}

export interface MacrocyclePlan {
  index: number;
  target: PhaseTarget;
  block: BlockSpec | null;
  stage: StageState;
  aerobicMinutes: number;
  runMinutes: number;
  crossMinutes: number;
  spilledToCross: number;
  baseShare: number;
  notes: string[];
}

export interface AerobicPlan {
  days: DayPlan[];
  cycles: CycleBlockPlan[];
  macrocycle: MacrocyclePlan;
  violations: Violation[];
  warnings: string[];
  /** Whether the optional volume extension is available and switched on. */
  extension: { available: boolean; reason: string; active: boolean };
}

export function planAerobic(input: PlanInput): AerobicPlan {
  const warnings: string[] = [];

  /* 1 · Cycle day, cycle type, phase and block focus. */
  const groups = groupCycles(input.days);
  const firstCycleIndex = input.cycleOffset;
  const macroIndex = macrocycleIndexOf(firstCycleIndex);
  const target = targetFor(macroIndex);
  const block = blockFor(macroIndex);
  const stage = stageFor(macroIndex, input.cleanHistory);
  if (stage.heldBack) warnings.push(stage.reason);

  const availability = extensionAvailable(target.phase.key, input.cleanHistory);
  const extensionOn = !!input.extension && anyEnabled(input.extension) && availability.available;
  if (input.extension && anyEnabled(input.extension) && !availability.available) {
    warnings.push(`Volumenerweiterung noch nicht aktiv: ${availability.reason}`);
  }

  /*
   * Sleep debt reaches the plan here and nowhere else.
   *
   * Above eight hours it forces a deload regardless of where the cycle rhythm
   * stands; above five it costs the next hard session one step. The sleep module
   * only reported the numbers — this is the single place that acts on them.
   */
  const sleep = input.sleep;
  if (sleep) warnings.push(...sleep.warnings);
  const sleepForcesDeload = !!sleep?.forceDeload;

  /*
   * Which days may not carry a hard session, and why — one sentence per reason,
   * resolved here so every session on the day gets the same answer.
   */
  const acwrHot = input.acwr != null && input.acwr > ACWR_UPPER;
  let hardBudgetSpent = false;
  const forcedStepFor = (date: ISODate, wantedKind: SessionKind): string | null => {
    const yesterday = addDays(date, -1);
    if (sleep?.blockHardAfter.includes(yesterday)) {
      return 'Tagschlaf gestern unter 5 h — heute keine harte Einheit';
    }

    /*
     * The ratio and the sleep debt each cost the *next hard session* one step —
     * not the next session of any kind. Spending the budget on an easy run would
     * leave the intensity session untouched, which is the opposite of the point.
     */
    if (hardBudgetSpent || CATALOGUE[wantedKind].load < 60) return null;
    if (acwrHot) {
      hardBudgetSpent = true;
      return `Belastungsverhältnis ${input.acwr?.toFixed(2)} über dem Zielband — eine Stufe zurück`;
    }
    if (sleep?.downgradeNextHard) {
      hardBudgetSpent = true;
      return `Schlafschuld ${sleep.debtHours.toFixed(1)} h im Makrozyklus — eine Stufe zurück`;
    }
    return null;
  };

  /* 2 · Load the template for each cycle in the horizon. */
  const cycleTemplates = groups.map((group, i) => {
    const cycleIndex = firstCycleIndex + i;
    return {
      group,
      cycleIndex,
      type: cycleTypeFor(cycleIndex),
      isDeload: isDeloadCycle(cycleIndex) || sleepForcesDeload,
      slots: [
        ...templateFor(target.phase.key, cycleTypeFor(cycleIndex)),
        // Extra windows only where the athlete switched them on and earned them.
        ...(extensionOn ? extensionSlots(input.extension!) : []),
      ],
    };
  });

  /*
   * 4 · Deload check.
   *
   * A deload is one **cycle**, not a macrocycle. Reducing the whole ten days
   * because one of its halves is a deload cuts twice as much as intended, so the
   * macrocycle budget is computed at full size and only the deload cycle's own
   * sessions are scaled down afterwards.
   */

  /* The intensity session's duration comes from the stage, not the allocator. */
  const interval = buildIntervalSession(stage.stage, block, input.intensitySessionCount, target.phase.key);

  /* 3 + 5 + 7 · Volume for the macrocycle, with the spill onto bike and rower. */
  const runSlots = cycleTemplates.flatMap((c) => c.slots.filter((s) => s.mode === 'run' && s.kind));
  const volume = planVolume({
    targetAerobicMinutes: target.aerobicMinutes,
    targetRunShare: target.runShare,
    previousAerobicMinutes: input.previousAerobicMinutes,
    previousRunMinutes: input.previousRunMinutes,
    isP0: target.phase.key === 'P0',
    runSessionCount: runSlots.length,
    stageChange: !stage.heldBack && stage.stage.fromMacrocycle === macroIndex && macroIndex > 0,
    isDeload: false,
  });
  warnings.push(...volume.notes);

  const requests: SlotRequest[] = [];
  for (const cycle of cycleTemplates) {
    for (const slot of cycle.slots) {
      if (!slot.kind || CATALOGUE[slot.kind].discipline !== 'aerobic') continue;
      const isIntensity = slot.fixedByStage && !cycle.isDeload;
      requests.push({
        id: `${cycle.cycleIndex}:${slot.id}`,
        mode: slot.mode ?? 'bike',
        fixedMinutes: isIntensity ? interval.totalMinutes : undefined,
        weight: slot.weight,
        ...boundsFor(slot, volume.aerobicMinutes),
      });
    }
  }
  const spread = distribute(requests, volume.runMinutes, volume.crossMinutes);
  const minutes = new Map(spread.slots.map((r) => [r.id, r.minutes]));
  if (spread.unplacedMinutes !== 0) {
    const short = Math.abs(spread.unplacedMinutes);
    warnings.push(
      spread.unplacedMinutes > 0
        ? `${short} min des aeroben Ziels passen nicht in die ${extensionOn ? 'vorhandenen' : 'vier'} Einheiten dieses Makrozyklus. ` +
          (extensionOn
            ? 'Auch mit Erweiterung sind die Obergrenzen je Einheit erreicht.'
            : HEADLINE)
        : `${short} min mehr als geplant, weil die Mindestdauern der Einheiten zusammen über dem Ziel liegen.`,
    );
  }

  /* 6 · Build each day, downgrading where the recovery value falls short. */
  const dayByDate = new Map(input.days.map((d) => [d.date, d]));
  const units: PlannedUnit[] = [];
  const cycles: CycleBlockPlan[] = [];

  for (const cycle of cycleTemplates) {
    const cycleUnits: PlannedUnit[] = [];

    for (const day of cycle.group) {
      const slot = cycle.slots.find((s) => s.cycleDay === day.cycleDay);
      if (!slot?.kind || day.outOfRotation === 'sick' || day.cycleDay == null) continue;

      const w = day.isVShift ? vShiftWindows() : windowsFor(day.cycleDay, input.dayShiftWakeMinutes);
      if (!w.trainingWindow) continue;

      const isIntensitySlot = !!slot.fixedByStage;
      if (isIntensitySlot && cycle.isDeload) continue; // deload drops the intensity session

      /*
       * A V-Schicht replaces cycle day 5 with a run during the shift. Whatever
       * the template put on that day — cross-training in P0 to P2, a run in P3 —
       * becomes an easy run of 30 to 60 minutes. It is not a write-off: the
       * athlete runs and showers on site.
       */
      const effectiveSlot: Slot = day.isVShift
        ? { ...slot, kind: 'easy_z2', mode: 'run', fixedByStage: false }
        : slot;

      const built = buildUnit({
        day,
        slot: effectiveSlot,
        windows: w,
        recovery: day.recovery,
        plannedMinutes: Math.round(
          (minutes.get(`${cycle.cycleIndex}:${slot.id}`) ??
            boundsFor(effectiveSlot, volume.aerobicMinutes).minMinutes) *
            (cycle.isDeload ? DELOAD_VOLUME_FACTOR : 1),
        ),
        deload: cycle.isDeload,
        forceStepDown: effectiveSlot.kind ? forcedStepFor(day.date, effectiveSlot.kind) : null,
        interval: isIntensitySlot && !day.isVShift ? interval : undefined,
        override: input.modeOverrides?.get(`${day.date}:${slot.id}`),
      });
      if (!built) continue;
      units.push(built);
      cycleUnits.push(built);
    }

    cycles.push({
      index: cycle.cycleIndex,
      type: cycle.type,
      position: macrocyclePosition(cycle.cycleIndex),
      isDeload: cycle.isDeload,
      days: [],
      load: cycleUnits.reduce((sum, u) => sum + u.load, 0),
    });
  }

  /* 7 · Zone share across the macrocycle. */
  const share = baseShare(
    units
      .filter((u) => CATALOGUE[u.kind].discipline === 'aerobic')
      .map((u) => ({ minutes: u.durationMinutes, isBase: BASE_ZONES.includes(u.zone) })),
  );

  /* 8 · The hard rules, as the last layer, over the finished plan. */
  const loadByDate = new Map(input.loadByDate);
  for (const unit of units) loadByDate.set(unit.date, (loadByDate.get(unit.date) ?? 0) + unit.load);

  const days: DayPlan[] = input.days.map((day) => {
    const dayUnits = units.filter((u) => u.date === day.date).sort((a, b) => a.start - b.start);
    const w = day.cycleDay
      ? day.isVShift
        ? vShiftWindows()
        : windowsFor(day.cycleDay, input.dayShiftWakeMinutes)
      : null;
    const cycleDates = groups.find((g) => g.some((d) => d.date === day.date))?.map((d) => d.date) ?? [];

    const violations = dayUnits.flatMap((u) =>
      checkUnit({
        unit: toPlaced(u, day),
        others: units.filter((x) => x !== u).map((x) => toPlaced(x, dayByDate.get(x.date)!)),
        sameDay: dayUnits.filter((x) => x !== u).map((x) => toPlaced(x, day)),
        nextSleepStart: w?.nextSleepStart ?? 24 * 60,
        window: w?.trainingWindow ?? null,
        loadByDate,
        cycleDates,
        baseShare: share,
        acwr: input.acwr,
      }),
    );

    return {
      date: day.date,
      cycleDay: day.cycleDay,
      isVShift: day.isVShift,
      windows: w,
      recovery: day.recovery,
      units: dayUnits,
      load: dayUnits.reduce((sum, u) => sum + u.load, 0),
      violations,
    };
  });

  const daysByDate = new Map(days.map((d) => [d.date, d]));
  for (let i = 0; i < cycles.length; i++) {
    cycles[i].days = groups[i].map((d) => daysByDate.get(d.date)!).filter(Boolean);
  }

  const violations = days.flatMap((d) => d.violations);
  const first = units[0];
  if (first) {
    violations.push(
      ...checkMacrocycle({
        unit: toPlaced(first, dayByDate.get(first.date)!),
        others: [],
        sameDay: [],
        nextSleepStart: 24 * 60,
        window: null,
        loadByDate,
        cycleDates: groups[0]?.map((d) => d.date) ?? [],
        baseShare: share,
        acwr: input.acwr,
      }),
    );
  }

  return {
    days,
    cycles,
    macrocycle: {
      index: macroIndex,
      target,
      block,
      stage,
      aerobicMinutes: units
        .filter((u) => CATALOGUE[u.kind].discipline === 'aerobic')
        .reduce((sum, u) => sum + u.durationMinutes, 0),
      runMinutes: units.filter((u) => u.mode === 'run').reduce((sum, u) => sum + u.durationMinutes, 0),
      crossMinutes: units
        .filter((u) => u.mode === 'bike' || u.mode === 'row')
        .reduce((sum, u) => sum + u.durationMinutes, 0),
      spilledToCross: volume.spilledToCross,
      baseShare: share,
      notes: volume.notes,
    },
    violations,
    warnings,
    extension: { ...availability, active: extensionOn },
  };
}

/* ------------------------------------------------------------------ *
 * Building one unit
 * ------------------------------------------------------------------ */

function buildUnit(args: {
  day: DayInput;
  slot: Slot;
  windows: DayWindows;
  recovery: RecoveryValue;
  plannedMinutes: number;
  interval?: IntervalSession;
  override?: Mode;
  deload?: boolean;
  /** One forced step down, and the sentence that explains it. */
  forceStepDown?: string | null;
}): PlannedUnit | null {
  const { day, slot, windows, recovery } = args;
  const reasons = [slot.reason];
  if (args.deload) reasons.push('Deload-Zyklus — Umfang 40 % niedriger, keine Intensitätseinheit');

  if (recovery.blocked) {
    return {
      date: day.date,
      slotId: slot.id,
      kind: 'regeneration',
      mode: null,
      zone: 'z1',
      start: windows.trainingWindow!.start,
      durationMinutes: 0,
      load: 0,
      reasons,
      blocked: recovery.blockedReason ?? 'Einheit entfällt',
    };
  }

  const wantedKind = slot.kind!;
  const wantedMode = args.override ?? slot.mode;

  // The extension's own gate, on top of the ordinary minimum for the session.
  if (slot.id.startsWith('ext_') && recovery.value < EXTENSION_MIN_RECOVERY) return null;
  if (args.override) {
    reasons.push(`Modus von Hand auf ${MODE_META[args.override].label} gestellt`);
  }

  /*
   * The downgrade walks the chain, and the chain's first step off the plan is
   * always the mode change. Manual mode is the exception: while the baselines
   * are still filling, the app makes no automatic downgrades at all.
   */
  /*
   * A forced step down comes from outside the recovery value: a load ratio
   * running hot, sleep debt over five hours, or a day sleep under five hours
   * yesterday. It is expressed as a ban on hard sessions rather than as a
   * subtraction, because the reason is not that the day feels worse — it is that
   * a hard session is the wrong thing to do today whatever the day feels like.
   */
  if (args.forceStepDown) reasons.push(args.forceStepDown);

  const step = recovery.manualMode
    ? { kind: wantedKind, mode: wantedMode, durationFactor: 1, why: 'wie geplant' }
    : downgradeUntil(wantedKind, wantedMode, (s) => {
        if (args.forceStepDown && CATALOGUE[s.kind].load >= 60) return false;
        return recovery.value >= minRecoveryFor(s, wantedMode);
      });

  if (!step) return null;
  if (recovery.manualMode) {
    reasons.push('Noch zu wenig Gerätehistorie für eine automatische Abstufung — manueller Modus');
  }

  const spec = CATALOGUE[step.kind];
  const changed = step.kind !== wantedKind || step.mode !== wantedMode;
  if (changed) {
    reasons.push(
      `Erholungswert ${recovery.value} unter den ${CATALOGUE[wantedKind].minRecovery}, die ${CATALOGUE[wantedKind].label} braucht — ${step.why}`,
    );
  } else {
    reasons.push(`Erholungswert ${recovery.value} ≥ ${spec.minRecovery}`);
  }

  const window = windows.trainingWindow!;
  const available = window.end - window.start;

  let duration =
    args.interval && step.kind === wantedKind && step.mode === wantedMode
      ? args.interval.totalMinutes
      : Math.round(args.plannedMinutes * step.durationFactor);

  if (day.isVShift) {
    duration = Math.max(V_SHIFT_MIN_MINUTES, Math.min(V_SHIFT_MAX_MINUTES, duration));
    reasons.push('V-Schicht: Laufen im Dienst, 30–60 min, danach vor Ort duschen');
  }
  duration = Math.max(15, Math.min(available, duration));

  /*
   * A session with load ≥ 60 has to finish three hours before the next sleep,
   * so it is pulled forward rather than placed at the top of the window and
   * failed by the rule afterwards.
   */
  const latestEnd = spec.load >= 60 ? Math.min(window.end, windows.nextSleepStart - 180) : window.end;
  const start = Math.max(window.start, Math.min(window.start, latestEnd - duration));

  return {
    date: day.date,
    slotId: slot.id,
    kind: step.kind,
    mode: step.mode,
    zone: spec.zone,
    start,
    durationMinutes: duration,
    load: Math.round((spec.load * duration) / Math.max(1, args.plannedMinutes || duration)),
    reasons,
    downgradedFrom: changed ? { kind: wantedKind, mode: wantedMode } : undefined,
    fromExtension: slot.id.startsWith('ext_'),
    interval: args.interval && step.kind === wantedKind ? args.interval : undefined,
    appendix:
      slot.appendix === 'strides'
        ? 'Anschließend Bergsprints, ersatzweise Steigerungen in der Ebene'
        : undefined,
  };
}

function toPlaced(unit: PlannedUnit, day: DayInput): PlacedUnit {
  return {
    date: unit.date,
    cycleDay: day.cycleDay,
    isVShift: day.isVShift,
    kind: unit.kind,
    mode: unit.mode,
    start: unit.start,
    durationMinutes: unit.durationMinutes,
    load: unit.load,
  };
}

/** A slot's minute bounds for a given macrocycle target. */
function boundsFor(slot: Slot, aerobicTarget: number): { minMinutes: number; maxMinutes: number } {
  const min = Math.max(slot.floorMinutes, Math.round(aerobicTarget * slot.minShare));
  const max = Math.max(min, Math.round(aerobicTarget * slot.maxShare));
  return { minMinutes: min, maxMinutes: max };
}

function groupCycles(days: DayInput[]): DayInput[][] {
  const out: DayInput[][] = [];
  let current: DayInput[] = [];
  for (const day of days) {
    if (day.cycleDay === 1 && current.length > 0) {
      out.push(current);
      current = [];
    }
    current.push(day);
  }
  if (current.length) out.push(current);
  return out;
}
