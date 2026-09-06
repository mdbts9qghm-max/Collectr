import type { ISODate } from '../types.ts';
import type {
  DayShape,
  PlannedUnit,
  PlannerSettings,
  RecoveryValue,
  RuleViolation,
  SessionKind,
} from './types.ts';
import { CATALOGUE, HARD_LOAD_THRESHOLD, isHard } from './catalogue.ts';
import { addDays, diffDays } from '../date.ts';
import { formatClock } from './windows.ts';

/**
 * The hard rules from section 6. They are never traded off against the
 * objective: a plan that violates one of them is not a plan.
 *
 * They are written as checks over a proposed placement rather than as filters
 * during construction, so the same code validates a plan the planner built and
 * a session the athlete dragged somewhere by hand.
 */

export interface PlacementContext {
  shape: DayShape;
  recovery: RecoveryValue;
  /** Units already on this day, excluding the one being checked. */
  sameDay: PlannedUnit[];
  /** All units across the horizon, excluding the one being checked. */
  allUnits: PlannedUnit[];
  /** Load per day across the horizon, excluding the one being checked. */
  loadByDate: Map<ISODate, number>;
  shapesByDate: Map<ISODate, DayShape>;
  settings: PlannerSettings;
  /**
   * Whether the seven days before the window are actually known. At the start
   * of tracking they are not, and comparing against an empty week would block
   * every first session as a 110 % overshoot.
   */
  previousWindowKnown?: boolean;
}

export interface Placement {
  date: ISODate;
  kind: SessionKind;
  start: number;
  durationMinutes: number;
}

/** All violated rules for a placement. Empty means allowed. */
export function checkPlacement(p: Placement, ctx: PlacementContext): RuleViolation[] {
  const spec = CATALOGUE[p.kind];
  const out: RuleViolation[] = [];
  const fail = (rule: string, message: string) =>
    out.push({ rule, message, date: p.date, kind: p.kind });
  const end = p.start + p.durationMinutes;

  /* 1 · Inside the day's window. */
  const windows = [ctx.shape.trainingWindow, ctx.shape.alternativeWindow].filter(
    (w): w is NonNullable<typeof w> => !!w,
  );
  if (windows.length === 0) {
    fail('fenster', 'Dieser Tag hat kein Trainingsfenster.');
  } else if (!windows.some((w) => p.start >= w.start && end <= w.end)) {
    const shown = windows.map((w) => `${formatClock(w.start)}–${formatClock(w.end)}`).join(' oder ');
    fail(
      'fenster',
      `${formatClock(p.start)}–${formatClock(end)} liegt außerhalb des Fensters ${shown}.`,
    );
  }

  /* 2 · Recovery value reaches the session's minimum. */
  if (ctx.recovery.value < spec.minRecovery) {
    fail(
      'erholung',
      `Erholungswert ${ctx.recovery.value} liegt unter der Mindestanforderung ${spec.minRecovery} für ${spec.label}.`,
    );
  }

  /* 3 · No intense run on night-shift or V-Schicht days. */
  if (p.kind === 'intense_run' && (ctx.shape.cycleDay === 2 || ctx.shape.isVShift)) {
    fail(
      'intensitaet',
      ctx.shape.isVShift
        ? 'An V-Schichttagen ist kein intensiver Lauf zulässig.'
        : 'An Nachtschichttagen ist kein intensiver Lauf zulässig.',
    );
  }

  /* 4 · Night-shift day: finished by 13:30. */
  if (ctx.shape.cycleDay === 2 && end > 13 * 60 + 30) {
    fail('nachtschicht_ende', `Einheit endet ${formatClock(end)}, an Nachtschichttagen ist 13:30 die Grenze.`);
  }

  /* 5 · Sleep day: finished by 20:00. */
  if (ctx.shape.cycleDay === 3 && end > 20 * 60) {
    fail('schlaftag_ende', `Einheit endet ${formatClock(end)}, am Schlaftag ist 20:00 die Grenze.`);
  }

  /* 6 + 7 · Spacing between hard sessions. */
  if (isHard(p.kind)) {
    for (const other of ctx.allUnits) {
      if (!isHard(other.kind)) continue;
      const hours = hoursBetween(
        { date: p.date, start: p.start, duration: p.durationMinutes },
        { date: other.date, start: other.start, duration: other.durationMinutes },
      );
      const sameDiscipline = CATALOGUE[other.kind].discipline === spec.discipline;
      const required = sameDiscipline ? 48 : 24;
      if (hours < required) {
        fail(
          sameDiscipline ? 'abstand_gleiche_disziplin' : 'abstand_andere_disziplin',
          `Nur ${Math.round(hours)} h Abstand zu ${CATALOGUE[other.kind].label} am ${other.date}; ${required} h sind nötig.`,
        );
      }
    }
  }

  /* 8 · Heavy leg strength not within 24 h before a long or intense run. */
  if (spec.discipline === 'strength' && spec.loadsLegs && spec.load >= HARD_LOAD_THRESHOLD) {
    for (const other of ctx.allUnits) {
      if (other.kind !== 'long_run' && other.kind !== 'intense_run') continue;
      const otherStart = absoluteMinutes(other.date, other.start);
      const thisEnd = absoluteMinutes(p.date, end);
      const gap = (otherStart - thisEnd) / 60;
      if (gap >= 0 && gap < 24) {
        fail(
          'kraft_vor_lauf',
          `Schwere Beinkraft nur ${Math.round(gap)} h vor ${CATALOGUE[other.kind].label} am ${other.date}; 24 h sind nötig.`,
        );
      }
    }
  }

  /* 9 · Two sessions on one day. */
  if (ctx.sameDay.length > 0) {
    const isFreeDay = ctx.shape.cycleDay === 4 || ctx.shape.cycleDay === 5;
    if (!isFreeDay || ctx.shape.isVShift) {
      fail('doppel_nur_frei', 'Zwei Einheiten an einem Tag sind nur an freien Tagen zulässig.');
    }
    for (const other of ctx.sameDay) {
      const gap = Math.abs(p.start - other.start) / 60;
      if (gap < 6) {
        fail('doppel_abstand', `Nur ${gap.toFixed(1)} h zwischen den beiden Einheiten; 6 h sind nötig.`);
      }
      // Interference minimisation: strength goes before the run.
      if (spec.discipline === 'run' && CATALOGUE[other.kind].discipline === 'strength' && p.start < other.start) {
        fail('doppel_reihenfolge', 'Bei zwei Einheiten am selben Tag kommt Kraft vor Lauf.');
      }
    }
    const dayLoad = ctx.sameDay.reduce((sum, u) => sum + u.load, 0) + spec.load;
    if (dayLoad > 105) {
      fail('tagesbelastung', `Tagesbelastung ${dayLoad} überschreitet die Grenze von 105.`);
    }
  }

  /* 10 · Load ≥ 60 must finish at least 3 h before the next sleep. */
  if (spec.load >= HARD_LOAD_THRESHOLD) {
    const buffer = (ctx.shape.nextSleepStart - end) / 60;
    if (buffer < 3) {
      const what = ctx.shape.nap ? 'Vorschlaf' : 'Schlafbeginn';
      fail(
        'schlafpuffer',
        `Nur ${buffer.toFixed(1)} h zwischen Trainingsende und ${what} um ${formatClock(ctx.shape.nextSleepStart)}; 3 h sind nötig.`,
      );
    }
  }

  /* 11 + 12 · Rolling seven-day window. */
  const windowState = rollingWindow(p.date, ctx.loadByDate, spec.load);
  if (windowState.load > ctx.settings.weeklyLoadCap) {
    fail(
      'fenster_obergrenze',
      `Belastung im 7-Tage-Fenster wäre ${windowState.load}, Obergrenze ist ${ctx.settings.weeklyLoadCap}.`,
    );
  }
  if (
    ctx.previousWindowKnown !== false &&
    windowState.previousLoad > 0 &&
    windowState.load > windowState.previousLoad * ctx.settings.maxWindowGrowth
  ) {
    fail(
      'fenster_steigerung',
      `Belastung im 7-Tage-Fenster wäre ${windowState.load}, mehr als ${Math.round(
        ctx.settings.maxWindowGrowth * 100,
      )} % des Vorfensters (${windowState.previousLoad}).`,
    );
  }
  if (windowState.restDays === 0) {
    fail('ruhetag', 'Im 7-Tage-Fenster bliebe kein Tag mit Belastung 0.');
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function absoluteMinutes(date: ISODate, minutes: number): number {
  return diffDays(date, '2000-01-01') * 24 * 60 + minutes;
}

/**
 * Distance between two hard sessions, measured start to start.
 *
 * Not end to start: two sessions at the same time of day on consecutive days
 * are what "24 hours apart" means in training, and measuring from the end would
 * make that 23 h and reject the standard cycle — an intense run on day 4
 * followed by heavy strength on day 5 is explicitly meant to be allowed.
 */
function hoursBetween(
  a: { date: ISODate; start: number; duration: number },
  b: { date: ISODate; start: number; duration: number },
): number {
  const aStart = absoluteMinutes(a.date, a.start);
  const bStart = absoluteMinutes(b.date, b.start);
  return Math.abs(bStart - aStart) / 60;
}

/**
 * The seven days ending on `date`, plus the seven before it. Both are needed:
 * the cap applies to the current window, the growth limit compares the two.
 */
export function rollingWindow(
  date: ISODate,
  loadByDate: Map<ISODate, number>,
  extraLoad = 0,
): { load: number; previousLoad: number; restDays: number } {
  let load = 0;
  let restDays = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(date, -i);
    // The anchor day's own load counts too — a second session that day is not
    // free just because the placement being checked is the one being added.
    const dayLoad = (loadByDate.get(d) ?? 0) + (d === date ? extraLoad : 0);
    load += dayLoad;
    if (dayLoad === 0) restDays += 1;
  }
  let previousLoad = 0;
  for (let i = 7; i < 14; i++) {
    previousLoad += loadByDate.get(addDays(date, -i)) ?? 0;
  }
  return { load, previousLoad, restDays };
}
