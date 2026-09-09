import type { ISODate } from '../types.ts';
import type { CoachDay, CycleDayNumber, PlannedItem, Timeline } from './types.ts';
import type { RuleFinding } from './rules.ts';
import type { StrengthPlan } from './strength.ts';
import type { VolumeTarget } from './phases.ts';
import type { Distribution } from './template.ts';
import type { StageState } from './intervals.ts';
import type { Horizon, InfluenceRule } from './horizon.ts';
import type { SessionKind } from './catalogue.ts';
import type { ZoneBounds, ZoneNumber } from './zones.ts';

import { CATALOGUE, HARD_LOAD, bearableStep, describeStepDown, stepDown, stepsTaken } from './catalogue.ts';
import { FIXED_ZONES, formatZone } from './zones.ts';
import { buildHorizon, rulesReaching } from './horizon.ts';
import { MACROCYCLE_TEMPLATE, distribute, slotFor } from './template.ts';
import { secondUnitCapacity } from './capacity.ts';
import { shiftLoadFor } from './shift.ts';
import { buildIntervalSession, stageFor, trackFallback } from './intervals.ts';
import { isDeloadCycle, targetFor } from './phases.ts';
import { planStrength } from './strength.ts';
import { RULES, checkAll } from './rules.ts';
import { loadOf } from './types.ts';
import { addDays, diffDays } from '../date.ts';
import { formatClock, vShiftWindows, windowsFor } from './windows.ts';

/**
 * # Zielsetzung
 *
 * Es gibt kein Rennen, kein Zieldatum und kein Tapering. Das Ziel ist ein
 * dauerhaft belastbares Herz-Kreislauf-System. Die 100 km sind ein Nebenprodukt,
 * kein Trainingsziel. Die Steuergröße ist der aerobe Reiz, nicht die
 * Kilometerzahl. Fortschritt wird an VO2max, Schwellenherzfrequenz, Ruhepuls,
 * HRV und der Ein-Minuten-Herzfrequenzerholung gemessen.
 *
 * ---
 *
 * # Der Coach
 *
 * Ein Tag wird nie allein entschieden. Der Coach legt das gesamte Blickfeld an —
 * so viele Tage zurück und voraus, wie irgendeine Regel reicht —, plant es
 * durch, prüft die Regeln darauf und liest die Antwort für heute daraus ab.
 *
 * Damit ist jede Begründung nachvollziehbar an einen anderen Tag gebunden: „Weil
 * vorgestern die Bahn war“, „weil übermorgen der Longrun steht“. Und alles, was
 * außerhalb des Blickfelds liegt, ist nachweislich ohne Einfluss und wird nicht
 * erwähnt — nicht aus Nachlässigkeit, sondern weil keine Regel so weit reicht.
 */

export interface DayContext {
  date: ISODate;
  cycleDay: CycleDayNumber | null;
  isVShift: boolean;
  outOfRotation: 'vacation' | 'sick' | 'unknown' | null;
  recovery: number;
  /** Wahr, wenn der Tag stattgefunden hat. */
  done: boolean;
  /** Was tatsächlich gelaufen wurde. Nur bei erledigten Tagen. */
  actual?: {
    kind: SessionKind;
    minutes: number;
    strengthKind?: SessionKind;
    strengthMinutes?: number;
    downgraded?: boolean;
  };
}

export interface CoachInput {
  anchor: ISODate;
  days: DayContext[];
  dayShiftWakeMinutes: number;
  /** Zyklen seit Trainingsbeginn, ab 0. Legt Phase, Deload und Makrozyklus fest. */
  cycleIndex: number;
  /** Laufminuten der zehn Tage vor dem laufenden Makrozyklus. */
  previousRunMinutes: number | null;
  /** Longrun-Länge des vorigen Makrozyklus, vor einer Deload-Halbierung. */
  previousLongrunMinutes?: number | null;
  /** Ob dieser vorige Longrun schon gewachsen war. */
  previousLongrunGrew?: boolean;
  phaseChanging?: boolean;
  /** Je Zyklus von alt nach neu: war die Intervalleinheit sauber? */
  intervalHistory?: boolean[];
  zones?: ZoneBounds;
  /**
   * Die Signale des Schlafmoduls.
   *
   * Das Schlafmodul stuft nie selbst ab — es liefert Signale, und hier werden
   * sie zu Entscheidungen. Ein einziger Ort entscheidet über Abstufungen, und
   * das ist diese Datei.
   */
  sleep?: {
    debtHours: number;
    /** Schlafschuld über der Warnschwelle: die nächste harte Einheit geht eine Stufe zurück. */
    downgradeNextHard: boolean;
    /** Schlafschuld über der Deload-Schwelle: Deload, unabhängig vom Rhythmus. */
    forceDeload: boolean;
  };
}

export interface Reason {
  /** Die Regel, aus der die Begründung stammt. Null bei Phasen- und Planwerten. */
  ruleId: string | null;
  title: string;
  detail: string;
  /** Der Tag, an dem es hängt — der Kern des Einflussfensters. */
  date: ISODate | null;
  effect: 'setzt' | 'begrenzt' | 'stuft ab' | 'sperrt' | 'meldet';
}

export interface HorizonNote {
  date: ISODate;
  offset: number;
  cycleDay: CycleDayNumber | null;
  label: string;
  kind: SessionKind | null;
  minutes: number;
  load: number;
  /** Warum dieser Tag heute noch zählt. Leer, sobald keine Regel mehr reicht. */
  reaching: InfluenceRule[];
  done: boolean;
  isAnchor: boolean;
}

export type Verdict = 'los' | 'reduziert' | 'ruhe';

export interface TodayDecision {
  date: ISODate;
  verdict: Verdict;
  /** Ein Satz, groß auf dem Schirm. */
  headline: string;
  kind: SessionKind;
  minutes: number;
  zone: ZoneNumber | null;
  zoneLabel: string | null;
  window: { start: number; end: number } | null;
  startMinutes: number | null;
  /** Was zu tun ist, Zeile für Zeile. */
  steps: string[];
  strength: StrengthPlan | null;
  /** Die geplante Einheit, bevor die Erholung sie abgestuft hat. */
  plannedKind: SessionKind;
  stepsDown: number;
  reasons: Reason[];
  /** Regelverstöße, die diesen Tag betreffen. */
  blockers: RuleFinding[];
}

export interface CoachPlan {
  anchor: ISODate;
  horizon: Horizon;
  timeline: Timeline;
  target: VolumeTarget;
  stage: StageState;
  isDeload: boolean;
  /** Zyklusindex des Ankertags, ab 0 seit Trainingsbeginn. */
  anchorCycleIndex: number;
  today: TodayDecision;
  notes: HorizonNote[];
  findings: RuleFinding[];
  /** Was das Blickfeld ausmacht, für die Anzeige. */
  horizonSummary: string;
}

/* ------------------------------------------------------------------ *
 * Makrozyklus-Index aus der Rotation
 * ------------------------------------------------------------------ */

/**
 * Jedem Tag im Blickfeld seinen Zyklusindex geben.
 *
 * Gezählt wird an den Zyklusanfängen entlang, nicht über den Kalenderabstand:
 * Urlaub, V-Schichten und Lücken verschieben die Rotation, ein Datumsabstand
 * würde das Muster danach falsch weiterzählen.
 */
function cycleIndexAt(days: DayContext[], anchor: ISODate, cycleIndex: number): Map<ISODate, number> {
  const out = new Map<ISODate, number>();
  const anchorAt = days.findIndex((d) => d.date === anchor);
  if (anchorAt < 0) return out;

  let cycle = cycleIndex;
  out.set(anchor, cycle);
  for (let i = anchorAt + 1; i < days.length; i++) {
    if (days[i].cycleDay === 1) cycle += 1;
    out.set(days[i].date, cycle);
  }
  cycle = cycleIndex;
  for (let i = anchorAt - 1; i >= 0; i--) {
    if (days[i + 1].cycleDay === 1) cycle -= 1;
    out.set(days[i].date, cycle);
  }
  return out;
}

/** Position im Zehn-Tage-Muster: welcher Zyklus im Makrozyklus, welcher Tag darin. */
function macroDayIndex(cycle: number, cycleDay: CycleDayNumber): number {
  const half = ((cycle % 2) + 2) % 2;
  return half * 5 + (cycleDay - 1);
}

/** Welcher der beiden Zyklen dieses Makrozyklus ein Deload ist. */
function deloadCycleOf(macrocycleIndex: number): 0 | 1 | null {
  if (isDeloadCycle(macrocycleIndex * 2)) return 0;
  if (isDeloadCycle(macrocycleIndex * 2 + 1)) return 1;
  return null;
}

/** Welche Hälfte des Makrozyklus ein Zyklus ist: 0 oder 1. */
function halfOf(cycle: number): 0 | 1 {
  return (((cycle % 2) + 2) % 2) as 0 | 1;
}

/* ------------------------------------------------------------------ *
 * Der Plan
 * ------------------------------------------------------------------ */

function itemFrom(kind: SessionKind, minutes: number, hardMinutes: number, start: number | null): PlannedItem {
  const entry = CATALOGUE[kind];
  // Die Belastung folgt der geplanten Dauer, nicht der Katalogdauer. Sonst
  // kostet eine gekürzte Einheit so viel wie die volle.
  const scale = entry.defaultMinutes > 0 ? minutes / entry.defaultMinutes : 0;
  return {
    kind,
    minutes,
    zone: entry.zone,
    load: Math.round(entry.load * Math.min(1.4, Math.max(0.3, scale))),
    startMinutes: start,
    hardMinutes,
  };
}

export function buildCoachPlan(input: CoachInput): CoachPlan {
  const zones = input.zones ?? FIXED_ZONES;
  const horizon = buildHorizon(input.anchor);
  const byDate = new Map(input.days.map((d) => [d.date, d]));

  const cycles = cycleIndexAt(input.days, input.anchor, input.cycleIndex);

  const anchorCycle = cycles.get(input.anchor) ?? input.cycleIndex;
  const anchorMacro = Math.floor(anchorCycle / 2);

  /*
   * Ein erzwungener Deload überschreibt den Vierer-Rhythmus für den laufenden
   * Zyklus. Er verschiebt ihn nicht — der nächste planmäßige Deload kommt
   * trotzdem, weil die Schlafschuld ein anderer Grund ist als die angesammelte
   * Trainingslast und nicht deren Erholung ersetzt.
   */
  const forcedDeload = input.sleep?.forceDeload === true;
  const isDeloadCycleHere = (cycle: number) =>
    isDeloadCycle(cycle) || (forcedDeload && cycle === anchorCycle);
  const isDeload = isDeloadCycleHere(anchorCycle);

  const stage = stageFor(input.intervalHistory ?? []);
  const intervalSession = buildIntervalSession(stage.stage);

  /*
   * Jeder Makrozyklus im Blickfeld bekommt sein eigenes Ziel und seine eigene
   * Verteilung. Das Blickfeld reicht über 27 Tage voraus, also über mehr als
   * einen Makrozyklus — mit einer einzigen Verteilung stünde dort ein Plan, den
   * es so nie geben wird.
   *
   * Die Kette hängt am Ziel des vorigen Makrozyklus, nicht an seinem
   * tatsächlichen Volumen: sonst zöge jeder Deload das Volumen dauerhaft nach
   * unten, statt es einmal einbrechen zu lassen.
   */
  const macroPlans = new Map<number, { target: VolumeTarget; dist: Distribution }>();
  const planForMacro = (m: number): { target: VolumeTarget; dist: Distribution } => {
    const cached = macroPlans.get(m);
    if (cached) return cached;
    const previous =
      m <= anchorMacro ? input.previousRunMinutes : planForMacro(m - 1).target.runMinutes;
    const target = targetFor({
      macrocycleIndex: m,
      previousRunMinutes: previous,
      phaseChanging: m === anchorMacro ? input.phaseChanging : false,
    });
    const dist = distribute({
      runMinutes: target.runMinutes,
      intervalMinutes: intervalSession.totalMinutes,
      longrunCap: Math.floor(target.runMinutes * 0.35),
      deloadCycle:
        forcedDeload && m === anchorMacro ? halfOf(anchorCycle) : deloadCycleOf(m),
      longrunPrevious:
        m <= anchorMacro ? (input.previousLongrunMinutes ?? null) : planForMacro(m - 1).dist.longrunBase,
      longrunGrewLast:
        m <= anchorMacro ? (input.previousLongrunGrew ?? false) : planForMacro(m - 1).dist.longrunGrew,
    });
    const entry = { target, dist };
    macroPlans.set(m, entry);
    return entry;
  };

  const { target, dist } = planForMacro(anchorMacro);

  /* ---- 1. Das Blickfeld als Tagesliste anlegen -------------------- */

  const days: CoachDay[] = horizon.days.map((h) => {
    const ctx = byDate.get(h.date);
    const cycleDay = ctx?.cycleDay ?? null;
    const isVShift = ctx?.isVShift ?? false;
    const w = cycleDay ? (isVShift ? vShiftWindows() : windowsFor(cycleDay, input.dayShiftWakeMinutes)) : null;

    return {
      date: h.date,
      cycleDay,
      isVShift,
      outOfRotation: ctx?.outOfRotation ?? 'unknown',
      window: w?.trainingWindow ?? null,
      nextSleepStart: w?.nextSleepStart ?? 22 * 60 + 15,
      recovery: ctx?.recovery ?? 50,
      shiftLoad: shiftLoadFor(cycleDay, isVShift).load,
      run: null,
      strength: null,
      secondUnit: null,
      done: ctx?.done ?? false,
      downgraded: ctx?.actual?.downgraded ?? false,
      hasRecord: ctx?.actual != null,
      isDeloadDay: isDeloadCycleHere(cycles.get(h.date) ?? input.cycleIndex),
    };
  });

  /* ---- 2. Vergangenheit aus dem eintragen, was passiert ist ------- */

  for (const day of days) {
    const ctx = byDate.get(day.date);
    if (!day.done || !ctx?.actual) continue;
    const a = ctx.actual;
    const hard = a.kind === 'intervall' || a.kind === 'intervall_kurz' ? intervalSession.workMinutes : 0;
    day.run = CATALOGUE[a.kind].discipline === 'lauf' ? itemFrom(a.kind, a.minutes, hard, day.window?.start ?? null) : null;
    if (a.strengthKind) {
      day.strength = itemFrom(a.strengthKind, a.strengthMinutes ?? CATALOGUE[a.strengthKind].defaultMinutes, 0, null);
    }
  }

  /* ---- 3. Zukunft und heute aus der Vorlage planen ---------------- */

  const planNotes = new Map<ISODate, Reason[]>();
  const noteFor = (date: ISODate) => {
    const list = planNotes.get(date) ?? [];
    planNotes.set(date, list);
    return list;
  };

  for (const day of days) {
    if (day.done) continue;
    if (day.cycleDay == null) continue;
    const cycle = cycles.get(day.date);
    if (cycle == null) continue;

    const macroOfDay = planForMacro(Math.floor(cycle / 2));
    const idx = macroDayIndex(cycle, day.cycleDay);
    let kind: SessionKind = macroOfDay.dist.kinds[idx];
    let minutes = macroOfDay.dist.minutes[idx];

    if (day.isDeloadDay && forcedDeload && cycle === anchorCycle) {
      noteFor(day.date).push({
        ruleId: 'deload_rhythmus',
        title: `Deload erzwungen — Schlafschuld ${input.sleep?.debtHours.toFixed(1) ?? '?'} h`,
        detail:
          'Über acht Stunden Schlafmangel in zehn Tagen. Der Deload kommt jetzt, unabhängig vom Vierer-Rhythmus — und ersetzt den nächsten planmäßigen nicht.',
        date: day.date,
        effect: 'stuft ab',
      });
    } else if (day.isDeloadDay) {
      noteFor(day.date).push({
        ruleId: 'deload_rhythmus',
        title: 'Deload-Zyklus',
        detail:
          slotFor(idx).kind === 'intervall'
            ? 'Jeder vierte Zyklus ist ein Deload: keine Intensität, der Bahntag wird ein Grundlagenlauf.'
            : slotFor(idx).kind === 'longrun'
              ? 'Jeder vierte Zyklus ist ein Deload: der Longrun wird halbiert.'
              : 'Jeder vierte Zyklus ist ein Deload: 40 % weniger Laufminuten. Der Einbruch ist geplant, nicht verpasst.',
        date: day.date,
        effect: 'setzt',
      });
    }

    /*
     * Die V-Schicht überschreibt den Tag. Gelaufen wird im Dienst, 30 bis 60
     * Minuten locker — das ist kein Ausfall, sondern eine eigene Einheit.
     */
    if (day.isVShift) {
      kind = 'lockerer_lauf';
      minutes = Math.max(30, Math.min(60, minutes || 45));
      noteFor(day.date).push({
        ruleId: null,
        title: 'V-Schicht',
        detail: 'Laufen im Dienst, 30 bis 60 Minuten locker. Kein Abschreiben des Tages, aber keine Intensität.',
        date: day.date,
        effect: 'setzt',
      });
    }

    if (kind === 'ruhe' || minutes <= 0) {
      day.run = null;
      continue;
    }

    const hardMinutes = kind === 'intervall' ? intervalSession.workMinutes : 0;
    const start = day.window?.start ?? null;
    day.run = itemFrom(kind, minutes, hardMinutes, start);
  }

  /* ---- 4. Kraft dorthin, wo sie passt ----------------------------- */

  /*
   * Ob ein Tag eine zweite Einheit trägt, steht nirgends geschrieben — er rechnet
   * es aus. Erholung minus Schichtlast minus geplantes Training ergibt das
   * Budget; erst wenn davon genug übrig ist, entscheidet die Kraftberechnung, wie
   * schwer sie wird. Vorher stand das *Ob* als `strength: true` in der Vorlage,
   * und dadurch konnten Vorschläge entstehen, die aus Erholung und Belastung nie
   * gefolgt wären — zwei Einheiten am Vormittag vor einer Zwölf-Stunden-Nacht.
   */
  for (const day of days) {
    if (day.done) continue;
    if (day.cycleDay == null && !day.isVShift) continue;

    const next = days.find((d) => d.date === addDays(day.date, 1));
    const prevStrength = lastStrengthBefore(days, day.date);
    const runMinutes = day.run?.minutes ?? 0;
    const windowMinutes = day.window ? day.window.end - day.window.start : 0;
    const daysSinceStrength = prevStrength == null ? null : diffDays(day.date, prevStrength);

    const capacity = secondUnitCapacity({
      recovery: day.recovery,
      shiftLoad: day.shiftLoad,
      plannedLoad: day.run?.load ?? 0,
      windowMinutes,
      runMinutes,
      keySessionToday: !!day.run && CATALOGUE[day.run.kind].isKeySession,
      daysSinceStrength,
    });
    day.secondUnit = capacity;
    if (!capacity.ok) continue;

    const plan = planStrength({
      recovery: day.recovery,
      hasWindow: !!day.window,
      availableMinutes: capacity.freeMinutes,
      hardRunTomorrow: !!next?.run && CATALOGUE[next.run.kind].isKeySession,
      hardRunToday: !!day.run && day.run.load >= HARD_LOAD,
      hardRunYesterday: hardYesterday(days, day.date),
      isDeload,
      daysSinceStrength,
    });

    if (plan.kind) {
      // Kraft liegt hinter dem Lauf im selben Fenster. Ohne Startzeit könnten
      // weder die 13:30-Grenze noch der Abstand zum Schlaf geprüft werden.
      const after = day.run
        ? (day.run.startMinutes ?? day.window!.start) + day.run.minutes + 15
        : day.window!.start;
      day.strength = itemFrom(plan.kind, plan.minutes, 0, after);
    }
  }

  /* ---- 5. Schlafschuld stuft die nächste harte Einheit ab --------- */

  /*
   * Genau eine Einheit, nicht jede. Schlafschuld ist ein Zustand, kein
   * Dauerzustand: sie nimmt die nächste harte Belastung heraus und ist damit
   * abgegolten. Alles Weitere macht der Erholungswert Tag für Tag.
   *
   * Vergangene Tage bleiben unberührt — was gelaufen wurde, wurde gelaufen.
   */
  if (input.sleep?.downgradeNextHard) {
    const nextHard = days.find(
      (d) => !d.done && d.date >= input.anchor && d.run && d.run.load >= HARD_LOAD,
    );
    if (nextHard?.run) {
      const before = nextHard.run.kind;
      const stepped = stepDown(before);
      if (stepped) {
        const entry = CATALOGUE[stepped];
        const minutes = Math.max(
          entry.minMinutes,
          Math.min(entry.maxMinutes, Math.round(nextHard.run.minutes * 0.8)),
        );
        nextHard.run = itemFrom(
          stepped,
          minutes,
          stepped === 'intervall' ? nextHard.run.hardMinutes : 0,
          nextHard.run.startMinutes,
        );
        nextHard.downgraded = true;
        noteFor(nextHard.date).push({
          ruleId: null,
          title: `Schlafschuld ${input.sleep.debtHours.toFixed(1)} h`,
          detail: `${describeStepDown(before, stepped)} Aufgelaufener Schlafmangel über zehn Tage — die nächste harte Einheit geht eine Stufe zurück, danach ist es abgegolten.`,
          date: nextHard.date,
          effect: 'stuft ab',
        });
      }
    }
  }

  /* ---- 6. Erholung stuft ab, sie plant nicht ---------------------- */

  for (const day of days) {
    if (day.done || !day.run) continue;
    const bearable = bearableStep(day.run.kind, day.recovery);
    if (bearable === day.run.kind) continue;
    const before = day.run.kind;
    const entry = CATALOGUE[bearable];
    const minutes = Math.max(
      entry.minMinutes,
      Math.min(entry.maxMinutes, Math.round(day.run.minutes * 0.8)),
    );
    day.run = itemFrom(bearable, minutes, bearable === 'intervall' ? day.run.hardMinutes : 0, day.run.startMinutes);
    day.downgraded = true;
    noteFor(day.date).push({
      ruleId: null,
      title: `Erholung ${day.recovery}`,
      detail: `${describeStepDown(before, bearable)} ${CATALOGUE[before].label} verlangt mindestens ${CATALOGUE[before].minRecovery}.`,
      date: day.date,
      effect: 'stuft ab',
    });
  }

  const timeline: Timeline = { anchor: input.anchor, days };
  const findings = checkAll(timeline);

  /* ---- 7. Die Antwort für heute ----------------------------------- */

  const anchorDay = days.find((d) => d.date === input.anchor)!;
  const anchorIdx =
    anchorDay.cycleDay != null ? macroDayIndex(anchorCycle, anchorDay.cycleDay) : null;
  const plannedKind: SessionKind =
    anchorIdx != null && !anchorDay.isVShift
      ? dist.kinds[anchorIdx]
      : (anchorDay.run?.kind ?? 'ruhe');

  const blockers = findings.filter((f) => f.severity === 'blocker' && f.date === input.anchor);
  const kind = anchorDay.run?.kind ?? 'ruhe';
  const verdict: Verdict =
    kind === 'ruhe' ? 'ruhe' : stepsTaken(plannedKind, kind) > 0 ? 'reduziert' : 'los';

  const reasons = buildReasons({
    anchorDay,
    plannedKind,
    target,
    stage,
    findings,
    notes: planNotes,
    days,
    anchor: input.anchor,
  });

  const steps =
    kind === 'intervall'
      ? [...intervalSession.steps, trackFallback(stage.stage)]
      : kind === 'ruhe'
        ? ['Nichts. Ruhe ist Teil des Plans, nicht sein Ausfall.']
        : kind === 'gehen'
          ? [`${anchorDay.run?.minutes ?? 0} Minuten zügig gehen`, 'Gehen ist die letzte Stufe vor Ruhe, keine andere Sportart.']
          : [
              `${anchorDay.run?.minutes ?? 0} Minuten in ${formatZone(CATALOGUE[kind].zone ?? 2, zones)}`,
              'Die ersten zehn Minuten bewusst zu langsam anlaufen.',
            ];

  const today: TodayDecision = {
    date: input.anchor,
    verdict,
    headline: headlineFor(kind, anchorDay, stage, isDeload),
    kind,
    minutes: anchorDay.run?.minutes ?? 0,
    zone: CATALOGUE[kind].zone,
    zoneLabel: CATALOGUE[kind].zone ? formatZone(CATALOGUE[kind].zone!, zones) : null,
    window: anchorDay.window,
    startMinutes: anchorDay.run?.startMinutes ?? null,
    steps,
    strength: null,
    plannedKind,
    stepsDown: stepsTaken(plannedKind, kind),
    reasons,
    blockers,
  };

  if (anchorDay.strength) {
    const next = days.find((d) => d.date === addDays(input.anchor, 1));
    const prevStrength = lastStrengthBefore(days, input.anchor);
    const windowMinutes = anchorDay.window ? anchorDay.window.end - anchorDay.window.start : 0;
    today.strength = planStrength({
      recovery: anchorDay.recovery,
      hasWindow: !!anchorDay.window,
      availableMinutes: Math.max(0, windowMinutes - (anchorDay.run?.minutes ?? 0) - 30),
      hardRunTomorrow: !!next?.run && CATALOGUE[next.run.kind].isKeySession,
      hardRunToday: !!anchorDay.run && anchorDay.run.load >= HARD_LOAD,
      hardRunYesterday: hardYesterday(days, input.anchor),
      isDeload,
      daysSinceStrength: prevStrength == null ? null : diffDays(input.anchor, prevStrength),
    });
  }

  const notes: HorizonNote[] = days.map((d) => {
    const offset = diffDays(d.date, input.anchor);
    return {
      date: d.date,
      offset,
      cycleDay: d.cycleDay,
      label: d.run ? CATALOGUE[d.run.kind].label : d.cycleDay === 1 ? 'Tagschicht' : 'Ruhe',
      kind: d.run?.kind ?? null,
      minutes: d.run?.minutes ?? 0,
      load: loadOf(d),
      reaching: rulesReaching(input.anchor, d.date),
      done: d.done,
      isAnchor: d.date === input.anchor,
    };
  });

  return {
    anchor: input.anchor,
    horizon,
    timeline,
    target,
    stage,
    isDeload,
    anchorCycleIndex: anchorCycle,
    today,
    notes,
    findings,
    horizonSummary: `${horizon.back} Tage zurück, ${horizon.forward} voraus — so weit reicht die längste Regel. Was älter ist, beeinflusst heute nichts mehr.`,
  };
}

/* ------------------------------------------------------------------ *
 * Begründungen
 * ------------------------------------------------------------------ */

function buildReasons(input: {
  anchorDay: CoachDay;
  plannedKind: SessionKind;
  target: VolumeTarget;
  stage: StageState;
  findings: RuleFinding[];
  notes: Map<ISODate, Reason[]>;
  days: CoachDay[];
  anchor: ISODate;
}): Reason[] {
  const out: Reason[] = [];

  out.push({
    ruleId: null,
    title: `${input.target.phase.id} — ${input.target.phase.label}`,
    detail: input.target.reason,
    date: null,
    effect: input.target.limitedBy === 'wachstum' ? 'begrenzt' : 'setzt',
  });

  if (input.plannedKind === 'intervall' || input.anchorDay.run?.kind === 'intervall') {
    out.push({
      ruleId: null,
      title: `Bahnstufe ${input.stage.stage.id}`,
      detail: input.stage.reason,
      date: null,
      effect: 'setzt',
    });
  }

  // Die Tage, an denen heute hängt — der eigentliche Punkt des Blickfelds.
  const previousHard = [...input.days]
    .filter((d) => d.date < input.anchor && d.run && d.run.load >= HARD_LOAD)
    .pop();
  if (previousHard) {
    const gap = diffDays(input.anchor, previousHard.date);
    out.push({
      ruleId: 'harte_einheiten_abstand',
      title: 'Letzte harte Einheit',
      detail: `${CATALOGUE[previousHard.run!.kind].label} vor ${gap} ${gap === 1 ? 'Tag' : 'Tagen'}. Zwischen zwei harten Läufen liegen 48 Stunden.`,
      date: previousHard.date,
      effect: gap < 2 ? 'sperrt' : 'meldet',
    });
  }

  const nextKey = input.days.find(
    (d) => d.date > input.anchor && d.run && CATALOGUE[d.run.kind].isKeySession,
  );
  if (nextKey) {
    const gap = diffDays(nextKey.date, input.anchor);
    out.push({
      ruleId: 'beinkraft_vor_intensitaet',
      title: 'Nächste Schlüsseleinheit',
      detail: `${CATALOGUE[nextKey.run!.kind].label} in ${gap} ${gap === 1 ? 'Tag' : 'Tagen'}.${gap === 1 ? ' Deshalb heute keine schwere Beinkraft.' : ''}`,
      date: nextKey.date,
      effect: gap === 1 ? 'begrenzt' : 'meldet',
    });
  }

  out.push(...(input.notes.get(input.anchor) ?? []));

  for (const f of input.findings) {
    if (f.date !== input.anchor && f.date !== null) continue;
    const rule = RULES.find((r) => r.id === f.ruleId);
    out.push({
      ruleId: f.ruleId,
      title: rule?.title ?? f.ruleId,
      detail: f.message,
      date: f.date,
      effect: f.severity === 'blocker' ? 'sperrt' : f.severity === 'warnung' ? 'stuft ab' : 'meldet',
    });
  }

  return out;
}

function headlineFor(
  kind: SessionKind,
  day: CoachDay,
  stage: StageState,
  isDeload: boolean,
): string {
  if (kind === 'ruhe') {
    if (day.cycleDay === 1 && !day.isVShift) return 'Tagschicht. Heute wird nicht trainiert.';
    return 'Ruhetag.';
  }
  if (kind === 'intervall' || kind === 'intervall_kurz') {
    return `Bahn: ${stage.stage.label}`;
  }
  const entry = CATALOGUE[kind];
  const when = day.window ? ` ab ${formatClock(day.window.start)}` : '';
  return `${entry.label}, ${day.run?.minutes ?? entry.defaultMinutes} Minuten${when}${isDeload ? ' — Deload' : ''}`;
}

function hardYesterday(days: CoachDay[], date: ISODate): boolean {
  const y = days.find((d) => d.date === addDays(date, -1));
  return !!y?.run && y.run.load >= HARD_LOAD;
}

function lastStrengthBefore(days: CoachDay[], date: ISODate): ISODate | null {
  const before = days.filter((d) => d.date < date && d.strength);
  return before.length ? before[before.length - 1].date : null;
}

/** Die Tage der Vorlage, für die Anzeige des Musters. */
export { MACROCYCLE_TEMPLATE };
