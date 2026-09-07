import type { ISODate } from '../types.ts';
import { addDays } from '../date.ts';

/**
 * Acute load against chronic load.
 *
 * Load of the last seven days divided by the daily average of the last 28 —
 * so the ratio is dimensionless and sits around 1.0 when the recent week
 * matches what the body is used to. Outside 0.8 to 1.3 the app warns and
 * downgrades the next hard session; it does not silently carry on.
 *
 * Below 0.8 matters as much as above it: the ratio falling away means fitness
 * is being lost, and the plan should say so rather than quietly celebrate a
 * light week.
 */

export const ACWR_LOWER = 0.8;
export const ACWR_UPPER = 1.3;

/** Days of history needed before the ratio says anything at all. */
const MIN_HISTORY_DAYS = 14;

export interface AcwrState {
  /** Null while there is not enough history for the number to mean anything. */
  ratio: number | null;
  acuteLoad: number;
  chronicDailyAverage: number;
  band: 'low' | 'ok' | 'high' | 'unknown';
  message: string | null;
}

function sumRange(loadByDate: Map<ISODate, number>, anchor: ISODate, days: number): number {
  let total = 0;
  for (let i = 0; i < days; i++) total += loadByDate.get(addDays(anchor, -i)) ?? 0;
  return total;
}

/** How many of the last `days` have any record at all, load or rest. */
function knownDays(known: Set<ISODate>, anchor: ISODate, days: number): number {
  let count = 0;
  for (let i = 0; i < days; i++) if (known.has(addDays(anchor, -i))) count += 1;
  return count;
}

export function computeAcwr(
  anchor: ISODate,
  loadByDate: Map<ISODate, number>,
  /** Days that are known to have happened, including rest days with load 0. */
  knownDates: Set<ISODate>,
): AcwrState {
  const acuteLoad = sumRange(loadByDate, anchor, 7);
  const chronicTotal = sumRange(loadByDate, anchor, 28);
  const chronicDailyAverage = chronicTotal / 28;

  if (knownDays(knownDates, anchor, 28) < MIN_HISTORY_DAYS || chronicDailyAverage <= 0) {
    return {
      ratio: null,
      acuteLoad,
      chronicDailyAverage,
      band: 'unknown',
      message: null,
    };
  }

  const ratio = Math.round((acuteLoad / 7 / chronicDailyAverage) * 100) / 100;
  if (ratio > ACWR_UPPER) {
    return {
      ratio,
      acuteLoad,
      chronicDailyAverage,
      band: 'high',
      message: `Belastungsverhältnis ${ratio.toFixed(2)} über dem Zielband bis ${ACWR_UPPER} — die nächste harte Einheit wird abgestuft.`,
    };
  }
  if (ratio < ACWR_LOWER) {
    return {
      ratio,
      acuteLoad,
      chronicDailyAverage,
      band: 'low',
      message: `Belastungsverhältnis ${ratio.toFixed(2)} unter dem Zielband ab ${ACWR_LOWER} — die letzten Wochen waren zu leicht, um die Form zu halten.`,
    };
  }
  return { ratio, acuteLoad, chronicDailyAverage, band: 'ok', message: null };
}
