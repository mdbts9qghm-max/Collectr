import type { DayShape, PlannedUnit, SessionKind } from './types.ts';
import type { Placement } from './rules.ts';
import { CATALOGUE } from './catalogue.ts';

/**
 * Places a session inside the day's window. A second session on the same day
 * goes at least six hours after the first, and strength always precedes the run.
 */
export function findSlotFor(
  shape: DayShape,
  kind: SessionKind,
  existing: PlannedUnit[],
): Placement | null {
  const spec = CATALOGUE[kind];
  const windows = [shape.trainingWindow, shape.alternativeWindow].filter(
    (w): w is NonNullable<typeof w> => !!w,
  );

  for (const window of windows) {
    const available = window.end - window.start;
    const duration = Math.min(spec.defaultMinutes, available);
    if (duration < spec.minMinutes) continue;

    if (existing.length === 0) {
      // Sessions with load ≥ 60 are pulled forward so the three-hour buffer
      // before the next sleep can hold.
      const latestStart = spec.load >= 60
        ? Math.min(window.end - duration, shape.nextSleepStart - 180 - duration)
        : window.end - duration;
      const start = Math.max(window.start, Math.min(window.start, latestStart));
      if (start + duration <= window.end) {
        return { date: shape.date, kind, start, durationMinutes: duration };
      }
      continue;
    }

    /*
     * Order on a double day: the session that matters more for the goal comes
     * first, and only when that is a toss-up does strength go before the run.
     *
     * So strength may follow a key run — that is exactly the V-Schicht case,
     * where day 4 carries the intensive run and the displaced strength session
     * six hours later. What is never allowed is a run before a strength session
     * that was placed first, because then the legs are already spent.
     */
    const first = existing[0];
    const firstIsKeyRun = CATALOGUE[first.kind].discipline === 'run' && CATALOGUE[first.kind].load >= 60;
    const firstIsStrength = CATALOGUE[first.kind].discipline === 'strength';
    if (spec.discipline === 'strength' && !firstIsStrength && !firstIsKeyRun) continue;

    const earliest = first.start + first.durationMinutes;
    const start = Math.max(window.start, first.start + 6 * 60);
    if (start >= earliest && start + duration <= window.end) {
      return { date: shape.date, kind, start, durationMinutes: duration };
    }
  }
  return null;
}
