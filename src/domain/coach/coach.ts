import type { ISODate } from '../types.ts';
import type { CycleDayNumber } from '../rotation/types.ts';
import type { ZoneBounds } from '../zones.ts';
import type { SessionKind } from './catalogue.ts';
import type { Phase, VolumeTarget } from './phases.ts';
import type { IntervalSession, StageState } from './intervals.ts';
import type { StrengthPlan, StrengthStageState, StrengthTarget } from './strength.ts';
import { addDays, diffDays } from '../date.ts';
import { FIXED_ZONES, formatZone } from '../zones.ts';
import { vShiftWindows, windowsFor } from '../windows.ts';
import {
  CATALOGUE,
  bearableStep,
  chainFor,
  isHardSession,
  stepsTaken,
} from './catalogue.ts';
import {
  LONGRUN_MAX_STEP,
  MIN_ZONE2_SHARE,
  RULE_WINDOW_DAYS,
  VOLUME_WINDOW_DAYS,
  isDeloadWeek,
  phaseForWeek,
  targetFor,
  weeksUntilDeload,
} from './phases.ts';
import { TEMPLATE, keyKindFor, kindForRole } from './template.ts';
import { HORIZON_BACK, HORIZON_FORWARD } from './horizon.ts';
import { buildIntervalSession, stageFor } from './intervals.ts';
import { planStrength, strengthStageFor, strengthTargetFor } from './strength.ts';
import { secondUnitCapacity } from './capacity.ts';
import { shiftLoadFor } from './shift.ts';

/**
 * Der Coach.
 *
 * Er entscheidet einen Tag, aber er entscheidet ihn **aus dem Fenster um ihn
 * herum**. Die Reihenfolge ist bewusst: erst steht der ganze Zeitraum, dann
 * wird der heutige Tag daraus gelesen. Ein Coach, der heute entscheidet und
 * morgen neu schaut, plant zwangsläufig gegen sich selbst.
 *
 * Sieben Schritte:
 *
 * 1. Das Fenster aufspannen und mit dem füllen, was schon passiert ist.
 * 2. Die Woche bestimmen: Phase, Entlastungswoche, Bahnstufe.
 * 3. Das Laufvolumen aus dem messen, was tatsächlich gelaufen wurde.
 * 4. Die Rollen des Fünftagerhythmus auf die kommenden Tage legen.
 * 5. Die rollenden Wochenregeln durchsetzen — das ist der Teil, der Einheiten
 *    wieder wegnimmt.
 * 6. Kraft dort einsetzen, wo der Tag sie noch trägt.
 * 7. Den heutigen Tag an der Erholung abstufen und begründen.
 */

/* ------------------------------------------------------------------ *
 * Ein- und Ausgabe
 * ------------------------------------------------------------------ */

export interface DayContext {
  date: ISODate;
  cycleDay: CycleDayNumber | null;
  isVShift: boolean;
  outOfRotation: 'vacation' | 'sick' | 'unknown' | null;
  recovery: number;
  /** Vergangen — dann zählt, was eingetragen ist, nicht was geplant war. */
  done: boolean;
  actual?: {
    kind: SessionKind;
    minutes: number;
    strengthKind?: SessionKind;
    strengthMinutes?: number;
  };
}

export interface CoachInput {
  anchor: ISODate;
  days: DayContext[];
  /** Woche seit Planbeginn, ab 0 gezählt. */
  week: number;
  dayShiftWakeMinutes: number;
  /** Tatsächlich gelaufene Minuten der zehn Tage vor dem Ankertag. */
  measuredRunMinutes: number | null;
  /** Das eingestellte Startvolumen, solange nichts gemessen ist. */
  startRunMinutes?: number | null;
  measuredStrengthMinutes: number | null;
  /** Die Längen der letzten langen Läufe, älteste zuerst. */
  longrunHistory: number[];
  /** Je Bahneinheit: sauber durchgezogen? Älteste zuerst. */
  intervalHistory: boolean[];
  strengthHistory: boolean[];
  zones?: ZoneBounds;
  phaseChanging?: boolean;
  sleep?: {
    debtHours: number;
    downgradeNextHard: boolean;
    forceDeload: boolean;
  };
}

export interface PlannedItem {
  kind: SessionKind;
  minutes: number;
  zone: number | null;
  load: number;
  startMinutes: number | null;
  isHard: boolean;
}

export interface CoachDay {
  date: ISODate;
  cycleDay: CycleDayNumber | null;
  isVShift: boolean;
  recovery: number;
  done: boolean;
  isDeloadDay: boolean;
  window: { start: number; end: number } | null;
  run: PlannedItem | null;
  strength: PlannedItem | null;
  /** Warum an diesem Tag nichts oder weniger steht. */
  note: string | null;
}

export type Verdict = 'los' | 'reduziert' | 'ruhe';

export interface Reason {
  title: string;
  detail: string;
  effect: 'trägt' | 'begrenzt' | 'stuft ab' | 'sperrt';
}

export interface TodayDecision {
  date: ISODate;
  verdict: Verdict;
  kind: SessionKind;
  plannedKind: SessionKind;
  stepsDown: number;
  minutes: number;
  zone: number | null;
  zoneLabel: string;
  startMinutes: number | null;
  /** Der Name der Einheit. Die einzige Quelle für ihre Benennung. */
  label: string;
  /** Name plus Dauer plus Zeit — enthält immer das Label. */
  headline: string;
  steps: string[];
  reasons: Reason[];
  strength: StrengthPlan | null;
  interval: IntervalSession | null;
}

export interface CoachPlan {
  /** Anteil der Laufminuten in Zone 1 und 2. Die Vorgabe verlangt 80 %. */
  zone2Share: number;
  /** Gesetzt, wenn zwei Vorgaben sich bei diesem Volumen widersprechen. */
  conflict: string | null;
  anchor: ISODate;
  week: number;
  phase: Phase;
  isDeloadWeek: boolean;
  weeksUntilDeload: number;
  target: VolumeTarget;
  strengthTarget: StrengthTarget;
  stage: StageState;
  strengthStage: StrengthStageState;
  days: CoachDay[];
  today: TodayDecision;
}

/* ------------------------------------------------------------------ *
 * Hilfen
 * ------------------------------------------------------------------ */

function windowsOf(day: DayContext, wake: number) {
  if (day.cycleDay == null) return null;
  return day.isVShift ? vShiftWindows() : windowsFor(day.cycleDay, wake);
}

function itemFrom(kind: SessionKind, minutes: number, start: number | null): PlannedItem {
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
    isHard: isHardSession(kind, minutes),
  };
}

/**
 * Jedes Fenster von sieben aufeinanderfolgenden Tagen, das es im Plan gibt.
 *
 * Nicht „drei zurück, drei voraus um jeden Tag": das ist nicht dasselbe. Zwei
 * Schlüsseltage im Abstand von fünf Tagen liegen in keinem der beiden ±3-Fenster
 * um sie herum — aber sehr wohl im Fenster, das drei Tage vor dem ersten
 * beginnt. Genau dieses Paar rutschte durch, und der Fünftagerhythmus erzeugt es
 * bei jeder Umdrehung.
 */
function slidingWeeks(days: CoachDay[]): CoachDay[][] {
  const out: CoachDay[][] = [];
  for (let i = 0; i + RULE_WINDOW_DAYS <= days.length; i++) {
    out.push(days.slice(i, i + RULE_WINDOW_DAYS));
  }
  return out.length ? out : [days];
}

/** Die rollende Woche um einen Tag: drei zurück, drei voraus. */
function weekAround(days: CoachDay[], at: number): CoachDay[] {
  const half = Math.floor(RULE_WINDOW_DAYS / 2);
  return days.slice(Math.max(0, at - half), at + half + 1);
}

/* ------------------------------------------------------------------ *
 * Der Plan
 * ------------------------------------------------------------------ */

export function buildCoachPlan(input: CoachInput): CoachPlan {
  const zones = input.zones ?? FIXED_ZONES;
  const byDate = new Map(input.days.map((d) => [d.date, d]));

  /* 2 — Woche, Phase, Entlastung, Stufen. */
  const forcedDeload = input.sleep?.forceDeload === true;
  const deloadHere = isDeloadWeek(input.week) || forcedDeload;
  const phase = phaseForWeek(input.week);
  const stage = stageFor(input.intervalHistory);
  const strengthStage = strengthStageFor(input.strengthHistory);
  const intervalSession = buildIntervalSession(stage.stage);

  /* 3 — Volumen aus der Messung. */
  const target = targetFor({
    week: input.week,
    measuredMinutes: input.measuredRunMinutes,
    startMinutes: input.startRunMinutes,
    isDeload: deloadHere,
    phaseChanging: input.phaseChanging,
  });
  const strengthTarget = strengthTargetFor({
    week: input.week,
    previousStrengthMinutes: input.measuredStrengthMinutes,
    isDeload: deloadHere,
  });

  /*
   * Wie viele Läufe in zehn Tage passen. Die Phase gibt Läufe je Woche vor;
   * zehn Tage sind zehn Siebtel davon. Mehr Slots als das bietet der Rhythmus
   * zwar an, aber sie bleiben leer — die Zahl der Lauftage ist selbst ein
   * Trainingsparameter und nicht das, was zufällig frei ist.
   */
  const runsPerTen = Math.round((phase.runsPerWeek * VOLUME_WINDOW_DAYS) / 7);

  /* 4 — Rollen auf die Tage legen. */
  const days: CoachDay[] = [];
  let rhythmIndex = 0;

  for (const ctx of input.days) {
    const w = windowsOf(ctx, input.dayShiftWakeMinutes);
    // Jeder Tagschichttag beginnt einen neuen Durchlauf des Rhythmus.
    if (ctx.cycleDay === 1) rhythmIndex += 1;

    const base: CoachDay = {
      date: ctx.date,
      cycleDay: ctx.cycleDay,
      isVShift: ctx.isVShift,
      recovery: ctx.recovery,
      done: ctx.done,
      isDeloadDay: deloadHere,
      window: w?.trainingWindow ?? null,
      run: null,
      strength: null,
      note: null,
    };

    if (ctx.done) {
      // Vergangene Tage tragen, was eingetragen ist. Was geplant war, ist egal.
      if (ctx.actual && ctx.actual.kind !== 'ruhe') {
        base.run = itemFrom(ctx.actual.kind, ctx.actual.minutes, w?.trainingWindow?.start ?? null);
      }
      if (ctx.actual?.strengthKind) {
        base.strength = itemFrom(
          ctx.actual.strengthKind,
          ctx.actual.strengthMinutes ?? 0,
          null,
        );
      }
      days.push(base);
      continue;
    }

    if (ctx.outOfRotation === 'sick' || ctx.outOfRotation === 'vacation') {
      base.note = ctx.outOfRotation === 'sick' ? 'Krank gemeldet.' : 'Urlaub.';
      days.push(base);
      continue;
    }

    if (ctx.cycleDay == null) {
      base.note = 'Keine Schicht eingetragen — ohne sie plant der Coach diesen Tag nicht.';
      days.push(base);
      continue;
    }

    const slot = TEMPLATE[ctx.cycleDay];
    if (slot.role === 'ruhe' || !w?.trainingWindow) {
      base.note = slot.why;
      days.push(base);
      continue;
    }

    const kind = kindForRole(slot.role, keyKindFor(rhythmIndex));
    base.run = itemFrom(kind, CATALOGUE[kind].defaultMinutes, w.trainingWindow.start);
    days.push(base);
  }

  /* 5 — Die rollenden Wochenregeln. Hier werden Einheiten wieder weggenommen. */
  applyRollingRules(days, deloadHere);

  /* Erst jetzt die Minuten verteilen: welche Tage übrig sind, steht fest. */
  distributeMinutes(days, target.runMinutes, runsPerTen, phase, intervalSession, deloadHere, input);

  /* Nachmessen: Anteile und Budget müssen am Ende auch wirklich stimmen. */
  const balance = reconcile(days, target, intervalSession);

  /* 6 — Kraft dort, wo der Tag sie noch trägt. */
  placeStrength(days, strengthTarget, strengthStage, input.dayShiftWakeMinutes, deloadHere);

  /* 7 — Heute. */
  const anchorAt = days.findIndex((d) => d.date === input.anchor);
  const today = decideToday(
    days,
    anchorAt < 0 ? 0 : anchorAt,
    byDate,
    zones,
    intervalSession,
    target,
    phase,
    deloadHere,
    input,
  );

  return {
    zone2Share: balance.zone2Share,
    conflict: balance.conflict,
    anchor: input.anchor,
    week: input.week,
    phase,
    isDeloadWeek: deloadHere,
    weeksUntilDeload: weeksUntilDeload(input.week),
    target,
    strengthTarget,
    stage,
    strengthStage,
    days,
    today,
  };
}

/* ------------------------------------------------------------------ *
 * Schritt 5 — die rollenden Wochenregeln
 * ------------------------------------------------------------------ */

/**
 * Die Regeln, die eine Woche betreffen, auf ein rollendes Fenster angewandt.
 *
 * Rollend heißt: geprüft wird für **jeden** Tag das Fenster um ihn herum, nicht
 * ein festes Montag-bis-Sonntag. Sonst ließe sich jede Regel umgehen, indem man
 * zwei harte Einheiten auf Sonntag und Montag legt — formal zwei Wochen, in
 * Wirklichkeit zwei Tage.
 *
 * Durchgesetzt wird in der Reihenfolge der Schwere: Abstände zuerst, dann die
 * Obergrenzen, dann der Ruhetag.
 */
function applyRollingRules(days: CoachDay[], isDeload: boolean): void {
  const isPlanned = (d: CoachDay) => !d.done && d.run != null;

  // Im Deload fällt jede harte Einheit weg. Das ist keine Abwägung.
  if (isDeload) {
    for (const d of days) {
      if (!isPlanned(d) || !d.run!.isHard) continue;
      d.run = itemFrom('grundlagenlauf', CATALOGUE['grundlagenlauf'].defaultMinutes, d.run!.startMinutes);
      d.note = 'Entlastungswoche — keine harte Einheit.';
    }
  }

  // Keine Intensität am Übergangstag. Harte Regel, gilt vor allen Obergrenzen.
  for (const d of days) {
    if (!isPlanned(d) || d.cycleDay !== 3) continue;
    if ((CATALOGUE[d.run!.kind].zone ?? 1) >= 3) {
      d.run = itemFrom('lockerer_lauf', CATALOGUE['lockerer_lauf'].defaultMinutes, d.run!.startMinutes);
      d.note = 'Übergangstag nach der Nachtschicht — keine Intensität.';
    }
  }

  // ≥ 48 h zwischen zwei harten Läufen.
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    if (!isPlanned(d) || !d.run!.isHard) continue;
    for (let j = Math.max(0, i - 2); j < i; j++) {
      const other = days[j];
      if (other.run?.isHard) {
        d.run = itemFrom('lockerer_lauf', CATALOGUE['lockerer_lauf'].defaultMinutes, d.run!.startMinutes);
        d.note = `Weniger als 48 Stunden nach der harten Einheit am ${other.date.slice(8)}.`;
        break;
      }
    }
  }

  /*
   * Höchstens eine harte Einheit und ein langer Lauf je rollender Woche —
   * geprüft über jedes Siebenerfenster, nicht über ±3 Tage.
   *
   * Der Schichtrhythmus läuft in fünf Tagen, die Regel in sieben. Diese beiden
   * Zahlen gehen nicht ineinander auf, und deshalb kann der Rhythmus nicht jede
   * Umdrehung eine Schlüsseleinheit tragen: zweimal alle fünf Tage sind zwei in
   * sieben. Ungefähr jede vierte Umdrehung fällt aus. Das ist keine Lücke im
   * Plan, das ist die Regel.
   */
  const enforceLimit = (
    matches: (d: CoachDay) => boolean,
    downgrade: SessionKind,
    note: string,
    limit = 1,
  ) => {
    let changed = true;
    let guard = 0;
    while (changed && guard++ < 20) {
      changed = false;
      for (const window of slidingWeeks(days)) {
        const hits = window.filter((d) => isPlanned(d) && matches(d));
        if (hits.length <= limit) continue;
        // Der spätere weicht: der frühere ist näher an dem, was schon feststeht.
        for (const d of hits.slice(limit)) {
          d.run = itemFrom(downgrade, CATALOGUE[downgrade].defaultMinutes, d.run!.startMinutes);
          d.note = note;
        }
        changed = true;
      }
    }
  };

  enforceLimit(
    (d) => d.run!.isHard,
    'lockerer_lauf',
    'In dieser rollenden Woche steht schon eine harte Einheit.',
  );
  enforceLimit(
    (d) => CATALOGUE[d.run!.kind].isKeySession,
    'grundlagenlauf',
    'In dieser rollenden Woche steht schon eine Schlüsseleinheit.',
  );

  /*
   * Mindestens ein Tag mit Belastung null je rollender Woche. Der Tagschichttag
   * liefert ihn normalerweise von selbst — diese Regel greift, wenn er es
   * einmal nicht tut, etwa weil eine V-Schicht dazwischenkommt.
   */
  for (const window of slidingWeeks(days)) {
    if (window.some((d) => d.run == null && d.strength == null)) continue;
    const victim = [...window]
      .reverse()
      .find((d) => isPlanned(d) && !CATALOGUE[d.run!.kind].isKeySession);
    if (!victim) continue;
    victim.run = null;
    victim.strength = null;
    victim.note = 'Sieben Tage ohne einen einzigen leeren Tag — dieser wird es.';
  }
}

/* ------------------------------------------------------------------ *
 * Die Minuten
 * ------------------------------------------------------------------ */

/**
 * Die Laufminuten auf die verbliebenen Tage verteilen.
 *
 * Verteilt wird erst, nachdem die Regeln aufgeräumt haben. Andersherum stünde
 * das Volumen auf Tagen, die es gar nicht mehr gibt, und das Fehlende
 * verschwände stillschweigend.
 */
function distributeMinutes(
  days: CoachDay[],
  totalMinutes: number,
  runsPerTen: number,
  phase: Phase,
  interval: IntervalSession,
  isDeload: boolean,
  input: CoachInput,
): void {
  const future = days.filter((d) => !d.done && d.run != null);
  if (!future.length) return;

  /*
   * Das Ziel gilt für zehn Tage, geplant wird über das ganze Fenster. Also
   * wird es hochgerechnet — sonst stünde das Zehn-Tage-Budget auf dreizehn
   * Tagen und die letzten drei wären gratis.
   */
  const spanDays = Math.max(1, diffDays(future[future.length - 1].date, future[0].date) + 1);
  const budget = Math.round((totalMinutes * spanDays) / VOLUME_WINDOW_DAYS);

  /*
   * Die Schlüsseleinheit zuerst, dann Grundlage, dann locker. Was übrig
   * bleibt, fällt weg — und zwar von unten.
   */
  const rank = (d: CoachDay) =>
    CATALOGUE[d.run!.kind].isKeySession ? 0 : d.run!.kind === 'grundlagenlauf' ? 1 : 2;
  const byRank = [...future].sort((a, b) => rank(a) - rank(b) || a.date.localeCompare(b.date));

  const maxRuns = Math.max(1, Math.round((runsPerTen * spanDays) / VOLUME_WINDOW_DAYS));
  for (const d of byRank.slice(maxRuns)) {
    d.run = null;
    d.note = `${phase.id} sieht ${phase.runsPerWeek} Läufe die Woche vor — dieser Tag bleibt frei.`;
  }

  let kept = byRank.slice(0, maxRuns);

  /*
   * Und jetzt der Teil, der vorher gefehlt hat: **die Mindestdauern müssen ins
   * Budget passen.** Ein Longrun hat 70 Minuten Untergrenze. Steht ein Budget
   * von 90 Minuten für zehn Tage, dann ist ein Longrun darin nicht vorgesehen —
   * und die Untergrenze des Katalogs darf das Budget nicht überstimmen, sondern
   * muss die Einheit abstufen.
   *
   * Ohne diesen Schritt plante der Coach 189 Minuten in ein 90-Minuten-Budget,
   * weil jede einzelne Einheit brav ihre eigene Untergrenze einhielt.
   */
  const minutesOf = (d: CoachDay) =>
    d.run!.kind === 'intervall' || d.run!.kind === 'intervall_kurz'
      ? interval.totalMinutes
      : CATALOGUE[d.run!.kind].minMinutes;

  /*
   * Und jetzt in der richtigen Reihenfolge. Wenn das Budget nicht reicht, fliegt
   * **das Volumen** raus, nicht der Reiz: zuerst die lockeren Läufe von hinten,
   * dann die Grundlage, und erst wenn nichts mehr übrig ist, wird die
   * Schlüsseleinheit abgestuft.
   *
   * Andersherum herum gebaut — die teuerste Einheit zuerst kürzen — verschwand
   * die Bahneinheit als Erstes, und übrig blieben fünf gleich lange lockere
   * Läufe. Das ist kein Training, das ist ein Mittelwert. Der Reiz ist das
   * Letzte, was ein Plan aufgibt.
   */
  let guard = 0;
  while (kept.reduce((sum, d) => sum + minutesOf(d), 0) > budget && guard++ < 40) {
    const droppable = kept
      .filter((d) => !CATALOGUE[d.run!.kind].isKeySession)
      .sort((a, b) => rank(b) - rank(a) || b.date.localeCompare(a.date));

    if (droppable.length > 0) {
      const drop = droppable[0];
      drop.run = null;
      drop.note = 'Das Volumen der zehn Tage trägt diesen Lauf nicht.';
      kept = kept.filter((d) => d !== drop);
      continue;
    }

    // Nur noch Schlüsseleinheiten übrig: jetzt wird abgestuft.
    const key = [...kept].sort((a, b) => minutesOf(b) - minutesOf(a))[0];
    if (!key) break;
    const chain = chainFor(key.run!.kind);
    const at = chain.indexOf(key.run!.kind);
    const next = at >= 0 && at + 1 < chain.length ? chain[at + 1] : null;
    if (next && next !== 'ruhe' && next !== 'rad' && next !== 'gehen') {
      key.run = itemFrom(next, CATALOGUE[next].minMinutes, key.run!.startMinutes);
      key.note = `Das Volumen trägt hier keine größere Einheit — ${CATALOGUE[next].label}.`;
      continue;
    }
    key.run = null;
    key.note = 'Das Volumen der zehn Tage trägt auch die Schlüsseleinheit nicht.';
    kept = kept.filter((d) => d !== key);
  }

  if (!kept.length) return;

  // Die Bahneinheit hat eine feste Länge: sie ergibt sich aus der Stufe.
  const intervalDays = kept.filter(
    (d) => d.run!.kind === 'intervall' || d.run!.kind === 'intervall_kurz',
  );
  for (const d of intervalDays) {
    d.run = itemFrom(d.run!.kind, interval.totalMinutes, d.run!.startMinutes);
  }
  const fixed = intervalDays.reduce((sum, d) => sum + d.run!.minutes, 0);

  /*
   * Der lange Lauf: gedeckelt durch den Phasenanteil, durch die
   * Zehn-Minuten-Schrittregel gegenüber dem letzten langen Lauf, und durch das,
   * was nach der Bahneinheit noch übrig ist.
   */
  const longDays = kept.filter((d) => CATALOGUE[d.run!.kind].isKeySession && !intervalDays.includes(d));
  const lastLong = input.longrunHistory.at(-1) ?? null;
  let longMinutes = 0;
  const easyCount = kept.length - intervalDays.length - longDays.length;
  for (const d of longDays) {
    const entry = CATALOGUE[d.run!.kind];
    const shareCap = Math.floor(totalMinutes * phase.longRunShare);
    const stepCap = lastLong != null ? lastLong + LONGRUN_MAX_STEP : shareCap;
    // Was nach der Bahn und den Mindestdauern der lockeren Läufe übrig ist.
    const room = budget - fixed - easyCount * CATALOGUE['lockerer_lauf'].minMinutes;
    const want = Math.min(shareCap, stepCap, entry.maxMinutes, Math.max(entry.minMinutes, room));
    const minutes = isDeload ? Math.round(want / 2) : want;
    const clamped = Math.max(entry.minMinutes, Math.min(entry.maxMinutes, minutes));
    d.run = itemFrom(d.run!.kind, clamped, d.run!.startMinutes);
    longMinutes += clamped;
  }

  const easy = kept.filter((d) => !intervalDays.includes(d) && !longDays.includes(d));
  if (!easy.length) return;
  const left = Math.max(0, budget - fixed - longMinutes);
  const per = Math.floor(left / easy.length);
  for (const d of easy) {
    const entry = CATALOGUE[d.run!.kind];
    const clamped = Math.max(entry.minMinutes, Math.min(entry.maxMinutes, per));
    d.run = itemFrom(d.run!.kind, clamped, d.run!.startMinutes);
  }
}

/**
 * Der Abgleich am Ende: was verteilt wurde, muss die Regeln auch einhalten.
 *
 * Die Verteilung rechnet mit Anteilen und Mindestdauern und liegt danach ein
 * paar Minuten daneben. Ein paar Minuten sind der Unterschied zwischen 79,6 %
 * Zone 2 und der Regel, die 80 % verlangt — und eine Regel, die „fast" gilt,
 * gilt nicht. Deshalb wird am Ende nachgemessen und nachgezogen.
 */
function reconcile(
  days: CoachDay[],
  target: VolumeTarget,
  interval: IntervalSession,
): { zone2Share: number; conflict: string | null } {
  const future = () => days.filter((d) => !d.done && d.run != null);

  /*
   * 1 — Das Zehn-Tage-Budget. Zuerst, denn Kürzen verändert den Anteil, und
   * andersherum machte das Budget die Anteilskorrektur sofort wieder kaputt.
   * Gekürzt wird an den lockeren Läufen, nicht an der Schlüsseleinheit.
   */
  const firstTen = days.filter((d) => !d.done).slice(0, VOLUME_WINDOW_DAYS);
  let guard = 0;
  while (guard++ < 60) {
    const minutes = firstTen.reduce((sum, d) => sum + (d.run?.minutes ?? 0), 0);
    if (minutes <= target.runMinutes) break;
    const over = minutes - target.runMinutes;
    const shavable = firstTen
      .filter((d) => d.run && d.run.minutes > CATALOGUE[d.run.kind].minMinutes)
      .sort((a, b) => {
        const keyA = CATALOGUE[a.run!.kind].isKeySession ? 1 : 0;
        const keyB = CATALOGUE[b.run!.kind].isKeySession ? 1 : 0;
        return keyA - keyB || b.run!.minutes - a.run!.minutes;
      })[0];
    if (!shavable) break;
    const entry = CATALOGUE[shavable.run!.kind];
    const next = Math.max(entry.minMinutes, shavable.run!.minutes - Math.max(1, Math.min(over, 10)));
    if (next === shavable.run!.minutes) break;
    shavable.run = itemFrom(shavable.run!.kind, next, shavable.run!.startMinutes);
  }

  /*
   * 2 — Der Zone-2-Anteil. Der Hebel ist die Bahneinheit: weniger
   * Wiederholungen auf derselben Stufe, nicht eine andere Stufe.
   */
  const shareNow = () => {
    const runs = future().filter((d) => CATALOGUE[d.run!.kind].discipline === 'lauf');
    const total = runs.reduce((sum, d) => sum + d.run!.minutes, 0);
    if (total === 0) return 1;
    const base = runs
      .filter((d) => (CATALOGUE[d.run!.kind].zone ?? 1) <= 2)
      .reduce((sum, d) => sum + d.run!.minutes, 0);
    return base / total;
  };

  guard = 0;
  while (shareNow() < MIN_ZONE2_SHARE && guard++ < 20) {
    const worst = future()
      .filter((d) => (CATALOGUE[d.run!.kind].zone ?? 1) >= 3)
      .sort((a, b) => b.run!.minutes - a.run!.minutes)[0];
    if (!worst) break;
    const shorter = buildIntervalSession(interval.stage, Math.max(2, interval.reps - 1));
    if (shorter.totalMinutes >= worst.run!.minutes) break;
    worst.run = itemFrom(worst.run!.kind, shorter.totalMinutes, worst.run!.startMinutes);
    worst.note = `Auf ${shorter.reps} Wiederholungen gekürzt, damit mindestens ${Math.round(
      MIN_ZONE2_SHARE * 100,
    )} % der Laufminuten in Zone 2 bleiben.`;
    interval = shorter;
  }

  /*
   * Bleibt der Anteil trotzdem zu niedrig, kollidieren zwei Vorgaben, und das
   * wird gesagt statt still entschieden: „Intervalle sind von Anfang an mit
   * dabei" und „Zone 2 ≥ 80 % der Laufminuten" gehen bei kleinem Volumen nicht
   * beide. Eine Bahneinheit von 40 Minuten verlangt rund 160 Minuten lockeres
   * Laufen daneben — wer weniger läuft, kann nur eines von beidem haben.
   *
   * Der Coach behält die Bahneinheit, weil sie ausdrücklich von Anfang an
   * dabeisein soll, und schreibt den Konflikt hin. Aufgelöst wird er durch mehr
   * Grundlagenvolumen, nicht durch eine stillere Regel.
   */
  const share = shareNow();
  const conflict =
    share < MIN_ZONE2_SHARE
      ? `Zone 2 liegt bei ${Math.round(share * 100)} % statt ${Math.round(
          MIN_ZONE2_SHARE * 100,
        )} %. Bei diesem Volumen passen eine Bahneinheit und der Zone-2-Anteil nicht beide hinein — die Bahneinheit bleibt, weil sie von Anfang an dabei sein soll. Mit mehr Grundlagenminuten löst sich das von selbst.`
      : null;
  return { zone2Share: share, conflict };
}

/* ------------------------------------------------------------------ *
 * Die Kraft
 * ------------------------------------------------------------------ */

function placeStrength(
  days: CoachDay[],
  target: StrengthTarget,
  stage: StrengthStageState,
  wake: number,
  isDeload: boolean,
): void {
  const open = days.filter((d) => {
    if (d.done || d.cycleDay == null) return false;
    const slot = TEMPLATE[d.cycleDay];
    if (!slot.strengthAllowed) return false;
    return d.window != null;
  });
  if (!open.length) return;

  /*
   * Zwei bis drei Krafteinheiten die Woche — das ist die Vorgabe, und sie ist
   * eine Obergrenze, keine Untergrenze. Der Rhythmus bietet drei Slots je fünf
   * Tage an, also sechs je zehn; ohne Deckel stünde an jedem davon Kraft, und
   * das wäre die doppelte Vorgabe.
   */
  const perTen = 3;
  const sessions = Math.max(1, Math.round((perTen * VOLUME_WINDOW_DAYS) / VOLUME_WINDOW_DAYS));
  const perSession = Math.max(20, Math.round(target.minutes / Math.max(1, sessions * 2)));
  let lastStrengthAt: number | null = null;
  let placedInWindow = 0;

  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    if (!open.includes(d)) continue;

    const next = days[i + 1];
    const prev = days[i - 1];
    const windowMinutes = d.window ? d.window.end - d.window.start : 0;
    const runMinutes = d.run?.minutes ?? 0;

    const capacity = secondUnitCapacity({
      recovery: d.recovery,
      shiftLoad: shiftLoadFor(d.cycleDay, d.isVShift).load,
      plannedLoad: d.run?.load ?? 0,
      windowMinutes,
      runMinutes,
      keySessionToday: d.run ? CATALOGUE[d.run.kind].isKeySession : false,
      daysSinceStrength: lastStrengthAt == null ? null : i - lastStrengthAt,
    });
    if (!capacity.ok) {
      // Nur wenn der Tag sonst leer ist. Steht ein Lauf, erklärt die Notiz den
      // Lauf — nicht, warum daneben keine Kraft mehr passt.
      if (!d.note && !d.run) d.note = capacity.reason;
      continue;
    }

    // Höchstens drei je rollender Woche.
    const week = weekAround(days, i);
    const already = week.filter((x) => x !== d && x.strength != null).length;
    if (already >= 3) {
      if (!d.note && !d.run) d.note = 'Drei Krafteinheiten in dieser rollenden Woche reichen.';
      continue;
    }

    const plan = planStrength({
      recovery: d.recovery,
      hasWindow: true,
      availableMinutes: Math.min(perSession, capacity.freeMinutes),
      // Die Regel „schwere Beinkraft nie in den 24 Stunden vor einem langen
      // Lauf" steht hier, weil sie vom Inhalt des nächsten Tages abhängt.
      hardRunTomorrow: !!next?.run?.isHard,
      hardRunToday: !!d.run?.isHard,
      hardRunYesterday: !!prev?.run?.isHard,
      isDeload,
      daysSinceStrength: lastStrengthAt == null ? null : i - lastStrengthAt,
      stage: stage.stage,
      targetMinutes: Math.min(perSession, capacity.freeMinutes),
      heavyLegsAllowedToday: TEMPLATE[d.cycleDay!].heavyLegsAllowed,
    });
    if (!plan.kind) continue;

    const start =
      d.window && d.run?.startMinutes != null
        ? Math.min(d.window.end - plan.minutes, d.run.startMinutes + runMinutes + 15)
        : (d.window?.start ?? null);
    d.strength = itemFrom(plan.kind, plan.minutes, start);
    lastStrengthAt = i;
    placedInWindow += 1;
  }
  void wake;
  void placedInWindow;
}

/* ------------------------------------------------------------------ *
 * Schritt 7 — heute
 * ------------------------------------------------------------------ */

function decideToday(
  days: CoachDay[],
  at: number,
  byDate: Map<ISODate, DayContext>,
  zones: ZoneBounds,
  interval: IntervalSession,
  target: VolumeTarget,
  phase: Phase,
  isDeload: boolean,
  input: CoachInput,
): TodayDecision {
  const day = days[at];
  const ctx = byDate.get(input.anchor);
  const plannedKind = day?.run?.kind ?? 'ruhe';
  const reasons: Reason[] = [];

  /* Die Erholung stuft ab. Sie plant nicht. */
  const recovery = day?.recovery ?? 0;
  let kind = plannedKind === 'ruhe' ? 'ruhe' : bearableStep(plannedKind, recovery);

  /*
   * Ein Schlafsignal stuft eine harte Einheit zusätzlich ab. Das Schlafmodul
   * entscheidet nie selbst — es liefert das Signal, und hier wird daraus eine
   * Stufe.
   */
  if (input.sleep?.downgradeNextHard && isHardSession(kind, day?.run?.minutes ?? 0)) {
    const chain = chainFor(plannedKind);
    const next = chain[Math.min(chain.length - 1, chain.indexOf(kind) + 1)];
    reasons.push({
      title: 'Schlafschuld',
      detail: `${input.sleep.debtHours.toFixed(1)} h Schlafschuld — die harte Einheit geht eine Stufe zurück.`,
      effect: 'stuft ab',
    });
    kind = next;
  }

  const entry = CATALOGUE[kind];
  const steps = stepsTaken(plannedKind, kind);
  const plannedMinutes = day?.run?.minutes ?? 0;
  const minutes =
    kind === 'ruhe'
      ? 0
      : kind === plannedKind
        ? plannedMinutes
        : Math.max(entry.minMinutes, Math.min(entry.maxMinutes, plannedMinutes));

  /* Begründungen — in der Reihenfolge, in der sie gewirkt haben. */
  if (day?.cycleDay != null) {
    reasons.push({
      title: 'Schicht',
      detail: TEMPLATE[day.cycleDay].why,
      effect: day.cycleDay === 1 ? 'sperrt' : 'trägt',
    });
  } else {
    reasons.push({
      title: 'Keine Schicht eingetragen',
      detail: 'Ohne Schicht kennt der Coach weder Fenster noch Belastung des Tages.',
      effect: 'sperrt',
    });
  }
  reasons.push({
    title: 'Erholung',
    detail: `${recovery} von 100. ${entry.label} verlangt mindestens ${entry.minRecovery}.`,
    effect: steps > 0 ? 'stuft ab' : 'trägt',
  });
  reasons.push({
    title: `Volumen (${phase.id})`,
    detail: target.reason,
    effect: 'begrenzt',
  });
  if (isDeload) {
    reasons.push({
      title: 'Entlastungswoche',
      detail: 'Laufminuten −40 %, keine harte Einheit, langer Lauf halbiert.',
      effect: 'begrenzt',
    });
  }
  if (day?.note) {
    reasons.push({ title: 'Regel', detail: day.note, effect: 'begrenzt' });
  }
  if (ctx?.outOfRotation === 'sick') {
    reasons.push({ title: 'Krank', detail: 'Krank gemeldet — es wird nicht trainiert.', effect: 'sperrt' });
  }

  const verdict: Verdict =
    kind === 'ruhe' && day?.strength == null ? 'ruhe' : steps > 0 ? 'reduziert' : 'los';

  // Genau eine Quelle für den Namen. Zwei Stellen, die eine Einheit benennen,
  // sind der Weg, auf dem „Bahn: 8 × 100 m" und „Intervalle, verkürzt" auf
  // demselben Bildschirm landen.
  const label =
    kind === 'intervall' || kind === 'intervall_kurz'
      ? `${entry.label}: ${interval.stage.label}`
      : entry.label;
  const zone = entry.zone;
  const zl = zone ? formatZone(zone, zones) : '';
  const headline =
    kind === 'ruhe'
      ? day?.strength
        ? `${CATALOGUE[day.strength.kind].label}, ${day.strength.minutes} Minuten`
        : 'Heute Ruhe.'
      : `${label}, ${minutes} Minuten${
          day?.run?.startMinutes != null
            ? ` ab ${String(Math.floor(day.run.startMinutes / 60)).padStart(2, '0')}:${String(day.run.startMinutes % 60).padStart(2, '0')}`
            : ''
        }`;

  return {
    date: input.anchor,
    verdict,
    kind,
    plannedKind,
    stepsDown: steps,
    minutes,
    zone,
    zoneLabel: zl,
    startMinutes: day?.run?.startMinutes ?? null,
    label,
    headline,
    steps: kind === 'intervall' || kind === 'intervall_kurz' ? interval.steps : [entry.headline],
    reasons,
    strength: null,
    interval: kind === 'intervall' || kind === 'intervall_kurz' ? interval : null,
  };
}

export { HORIZON_BACK, HORIZON_FORWARD, MIN_ZONE2_SHARE, diffDays, addDays };
