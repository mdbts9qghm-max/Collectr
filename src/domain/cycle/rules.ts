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

import { formatClock } from './windows.ts';

/**
 * The hard rules from section 6.
 *
 * They run as the last check, after the template has been laid down and the
 * recovery filter has done its downgrading. They are written as checks over a
 * proposed placement rather than as filters during construction, so the same
 * code validates the plan the app built and a session the athlete dragged
 * somewhere by hand. Manual moves are never blocked — they are explained.
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
}

export interface Placement {
  date: ISODate;
  kind: SessionKind;
  start: number;
  durationMinutes: number;
}

/**
 * Distance between two sessions, measured start to start.
 *
 * Not end to start: two sessions at the same time of day on consecutive days
 * are what "24 hours apart" means in training, and measuring from the end of
 * the first would report 23 and change.
 */
function hoursBetween(a: { date: ISODate; start: number }, b: { date: ISODate; start: number }): number {
  const absolute = (u: { date: ISODate; start: number }) =>
    Date.parse(`${u.date}T00:00:00`) / 60000 + u.start;
  return Math.abs(absolute(b) - absolute(a)) / 60;
}

/** All violated rules for a placement. Empty means allowed. */
export function checkPlacement(p: Placement, ctx: PlacementContext): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const spec = CATALOGUE[p.kind];
  const end = p.start + p.durationMinutes;
  const fail = (rule: string, message: string) =>
    violations.push({ rule, message, date: p.date, kind: p.kind });

  /* ---------------- Windows and sleep ---------------- */

  /* 1 · No session outside its window. */
  if (ctx.shape.cycleDay === 1 && !ctx.shape.isVShift) {
    fail('tagschicht', 'Am Tagschichttag wird nicht trainiert, auch nicht früh oder spät.');
  } else if (!ctx.shape.trainingWindow) {
    fail('kein_fenster', 'Dieser Tag hat kein Trainingsfenster.');
  } else {
    const windows = [ctx.shape.trainingWindow, ctx.shape.alternativeWindow].filter(
      (w): w is NonNullable<typeof w> => !!w,
    );
    const fits = windows.some((w) => p.start >= w.start && end <= w.end);
    if (!fits) {
      const w = ctx.shape.trainingWindow;
      fail(
        'fenster',
        `${formatClock(p.start)}–${formatClock(end)} liegt außerhalb des Fensters ${formatClock(w.start)}–${formatClock(w.end)}.`,
      );
    }
  }

  /* 2 · Night-shift day ends by 13:30 — 90 min of buffer before the 15:00 nap. */
  if (ctx.shape.cycleDay === 2 && !ctx.shape.isVShift && end > 13 * 60 + 30) {
    fail(
      'vorschlaf_puffer',
      `Am Nachtschichttag muss um 13:30 Schluss sein; 90 min Puffer vor dem Vorschlaf um 15:00.`,
    );
  }

  /* 3 · Sleep day: not before 16:00 (sleep inertia), not past 20:00. */
  if (ctx.shape.cycleDay === 3 && !ctx.shape.isVShift) {
    if (p.start < 16 * 60) {
      fail('schlaftraegheit', 'Am Schlaftag frühestens ab 16:00 — davor wirkt die Schlafträgheit.');
    }
    if (end > 20 * 60) {
      fail('schlaftag_ende', 'Am Schlaftag spätestens um 20:00 Schluss.');
    }
  }

  /* 4 · Load ≥ 60 finishes at least 3 h before the next sleep. The nap counts. */
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

  /* ---------------- Load management ---------------- */

  /* 5 · No intensive run on night-shift, sleep or V-Schicht days. */
  if (p.kind === 'intense_run') {
    if (ctx.shape.isVShift) {
      fail('intensitaet_schicht', 'An einer V-Schicht ist kein intensiver Lauf zulässig.');
    } else if (ctx.shape.cycleDay === 2 || ctx.shape.cycleDay === 3) {
      const where = ctx.shape.cycleDay === 2 ? 'Nachtschichttag' : 'Schlaftag';
      fail('intensitaet_schicht', `Am ${where} ist kein intensiver Lauf zulässig.`);
    }
  }

  /* 6 · 48 h between two hard sessions of the same discipline, 24 h across. */
  if (isHard(p.kind)) {
    for (const other of ctx.allUnits) {
      if (!isHard(other.kind)) continue;
      const gap = hoursBetween(p, other);
      const sameDiscipline = CATALOGUE[other.kind].discipline === spec.discipline;
      const needed = sameDiscipline ? 48 : 24;
      if (gap < needed) {
        fail(
          sameDiscipline ? 'abstand_gleiche_disziplin' : 'abstand_harte_einheiten',
          `Nur ${Math.round(gap)} h zu ${CATALOGUE[other.kind].label} am ${other.date}; ${needed} h sind nötig.`,
        );
      }
    }
  }

  /*
   * 7 · Heavy leg strength never in the 24 h before a long or intensive run.
   *
   * Afterwards it is fine — that is the whole reason the template puts the key
   * run on day 4 and heavy strength on day 5, never the other way round.
   */
  {
    const isHeavyLegs = (kind: SessionKind) => {
      const s = CATALOGUE[kind];
      return s.discipline === 'strength' && s.loadsLegs && s.load >= HARD_LOAD_THRESHOLD;
    };
    const isKeyRun = (kind: SessionKind) => kind === 'long_run' || kind === 'intense_run';
    const minutes = (u: { date: ISODate; start: number }) =>
      Date.parse(`${u.date}T00:00:00`) / 60000 + u.start;

    // Checked from both sides: the lift may be the placement under test, or it
    // may be the session already in the plan that the run is landing after.
    for (const other of ctx.allUnits) {
      const liftFirst = isHeavyLegs(p.kind) && isKeyRun(other.kind);
      const runFirst = isKeyRun(p.kind) && isHeavyLegs(other.kind);
      if (!liftFirst && !runFirst) continue;

      const lift = liftFirst ? p : other;
      const run = liftFirst ? other : p;
      const hoursBefore = (minutes(run) - minutes(lift)) / 60;
      if (hoursBefore > 0 && hoursBefore < 24) {
        fail(
          'beinkraft_vor_lauf',
          `Schwere Beinkraft nur ${Math.round(hoursBefore)} h vor ${CATALOGUE[run.kind].label} — beschädigt die Laufqualität.`,
        );
      }
    }
  }

  /* 8 · Two sessions on one day: free days only, six hours apart. */
  if (ctx.sameDay.length > 0) {
    const isFreeDay = ctx.shape.cycleDay === 4 || ctx.shape.cycleDay === 5;
    if (!isFreeDay) {
      fail('doppel_nur_frei', 'Zwei Einheiten an einem Tag sind nur an freien Tagen zulässig.');
    }
    for (const other of ctx.sameDay) {
      const otherSpec = CATALOGUE[other.kind];
      const gap = Math.abs(p.start - other.start) / 60;
      if (gap < 6) {
        fail('doppel_abstand', `Nur ${gap.toFixed(1)} h zwischen den beiden Einheiten; 6 h sind nötig.`);
      }
      /*
       * Order: the session that matters more for the goal comes first, and when
       * that is a toss-up, strength before the run. A run placed before the
       * strength session is the case this catches.
       */
      if (spec.discipline === 'run' && otherSpec.discipline === 'strength' && p.start < other.start) {
        fail('doppel_reihenfolge', 'Bei zwei Einheiten am selben Tag kommt Kraft vor Lauf.');
      }
    }
  }

  /* 9 · Two runs on consecutive days: at most one of them hard. */
  if (spec.discipline === 'run') {
    for (const other of ctx.allUnits) {
      if (CATALOGUE[other.kind].discipline !== 'run') continue;
      const gap = hoursBetween(p, other);
      if (gap > 36) continue; // not consecutive days
      if (isHard(p.kind) && isHard(other.kind)) {
        fail(
          'zwei_harte_laeufe',
          `${CATALOGUE[other.kind].label} liegt am Nachbartag — von zwei Läufen in Folge darf nur einer hart sein.`,
        );
      }
      // The second run of a pair is short and easy, and always after the hard
      // one — a hard run on tired legs is the injury, not the adaptation.
      const otherStart = Date.parse(`${other.date}T00:00:00`) / 60000 + other.start;
      const thisStart = Date.parse(`${p.date}T00:00:00`) / 60000 + p.start;
      if (!isHard(p.kind) && isHard(other.kind) && thisStart < otherStart) {
        fail(
          'lauf_reihenfolge',
          `Der lockere Lauf gehört nach ${CATALOGUE[other.kind].label}, nicht davor.`,
        );
      }
      if (!isHard(p.kind) && isHard(other.kind) && thisStart > otherStart && p.durationMinutes > 35) {
        fail(
          'zweiter_lauf_umfang',
          `Der zweite Lauf eines Paares darf höchstens 35 min dauern, nicht ${p.durationMinutes}.`,
        );
      }
    }
  }

  return violations;
}

/**
 * At least one day with zero load per cycle.
 *
 * On this rotation the day-shift day satisfies it by itself, so the check only
 * ever fires when something was moved onto it by hand.
 */
export function restDayViolation(
  cycleDates: ISODate[],
  loadByDate: Map<ISODate, number>,
): RuleViolation | null {
  const hasRest = cycleDates.some((date) => (loadByDate.get(date) ?? 0) === 0);
  if (hasRest) return null;
  return {
    rule: 'kein_ruhetag',
    message: 'Dieser Zyklus hat keinen Tag mit Belastung 0 — mindestens einer ist nötig.',
    date: cycleDates[0] ?? '',
  };
}
