import type { ISODate } from '../types.ts';
import type { CyclePlan, DayPlan, PlannedUnit, SessionKind } from './types.ts';
import { CATALOGUE, SESSION_ORDER } from './catalogue.ts';
import { checkPlacement } from './rules.ts';
import { findSlotFor } from './slots.ts';

/**
 * Everything the app can honestly say about one day.
 *
 * The cycle view and the week calendar used to be fed by two different engines
 * and therefore proposed two different sessions for the same Tuesday. There is
 * only one plan, so there is only one source: this reads the finished plan and
 * asks the same rules what else that day would have allowed.
 */

export interface DayOption {
  kind: SessionKind;
  start: number;
  durationMinutes: number;
  /** Why the rules refuse it. Empty when the option is available. */
  blockedBy: string | null;
}

export interface DayOptions {
  date: ISODate;
  day: DayPlan | null;
  /** What the planner actually chose. */
  planned: PlannedUnit[];
  /** Sessions the day would also carry, heaviest first. */
  alternatives: DayOption[];
  /** Sessions the day rules out, with the rule that stops them. */
  blocked: DayOption[];
}

export function dayOptions(plan: CyclePlan, date: ISODate): DayOptions {
  const day = plan.days.find((d) => d.shape.date === date) ?? null;
  if (!day) {
    return { date, day: null, planned: [], alternatives: [], blocked: [] };
  }

  const planned = day.units;
  const chosen = new Set(planned.map((u) => u.kind));
  const shapesByDate = new Map(plan.days.map((d) => [d.shape.date, d.shape]));
  const loadByDate = new Map(plan.days.map((d) => [d.shape.date, d.load]));
  const otherUnits = plan.days.flatMap((d) => d.units).filter((u) => u.date !== date);

  const alternatives: DayOption[] = [];
  const blocked: DayOption[] = [];

  for (const kind of SESSION_ORDER) {
    if (chosen.has(kind)) continue;

    // Measured as a replacement for what is planned, not as an addition: the
    // question the athlete is asking is "what else could I do today".
    const slot = findSlotFor(day.shape, kind, []);
    if (!slot) {
      blocked.push({
        kind,
        start: day.shape.trainingWindow?.start ?? 0,
        durationMinutes: CATALOGUE[kind].defaultMinutes,
        blockedBy: day.shape.trainingWindow
          ? 'Passt nicht ins Zeitfenster dieses Tages'
          : 'Dieser Tag hat kein Trainingsfenster',
      });
      continue;
    }

    const violations = checkPlacement(
      { date, kind, start: slot.start, durationMinutes: slot.durationMinutes },
      {
        shape: day.shape,
        recovery: day.recovery,
        sameDay: [],
        allUnits: otherUnits,
        loadByDate: new Map([...loadByDate, [date, 0]]),
        shapesByDate,
        settings: plan.settings,
      },
    );

    const option: DayOption = {
      kind,
      start: slot.start,
      durationMinutes: slot.durationMinutes,
      blockedBy: violations.length > 0 ? violations[0].message : null,
    };
    if (option.blockedBy) blocked.push(option);
    else alternatives.push(option);
  }

  return { date, day, planned, alternatives, blocked };
}
