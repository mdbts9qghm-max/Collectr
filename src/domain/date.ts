import type { ISODate } from './types.ts';

const MS_PER_DAY = 86_400_000;

/** Local-time ISO date key. Never use toISOString() — it shifts by timezone. */
export function toISODate(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromISODate(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function today(): ISODate {
  return toISODate(new Date());
}

export function addDays(iso: ISODate, days: number): ISODate {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((fromISODate(a).getTime() - fromISODate(b).getTime()) / MS_PER_DAY);
}

export function isBefore(a: ISODate, b: ISODate): boolean {
  return a < b;
}

export function clampDate(iso: ISODate, min: ISODate, max: ISODate): ISODate {
  return iso < min ? min : iso > max ? max : iso;
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(iso: ISODate): number {
  return fromISODate(iso).getDay();
}

export function startOfWeek(iso: ISODate, weekStartsOn: 0 | 1 = 1): ISODate {
  const dow = weekday(iso);
  const delta = (dow - weekStartsOn + 7) % 7;
  return addDays(iso, -delta);
}

export function endOfWeek(iso: ISODate, weekStartsOn: 0 | 1 = 1): ISODate {
  return addDays(startOfWeek(iso, weekStartsOn), 6);
}

export function startOfMonth(iso: ISODate): ISODate {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonth(iso: ISODate): ISODate {
  const d = fromISODate(iso);
  return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/** Inclusive range of date keys. */
export function dateRange(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard < 4000) {
    out.push(cur);
    cur = addDays(cur, 1);
    guard++;
  }
  return out;
}

/** The N days ending on (and including) `end`. */
export function lastNDays(end: ISODate, n: number): ISODate[] {
  return dateRange(addDays(end, -(n - 1)), end);
}

/** ISO 8601 week number. */
export function isoWeekNumber(iso: ISODate): number {
  const d = fromISODate(iso);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayNr = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const firstDayNr = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNr + 3);
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * MS_PER_DAY));
}

export function isoWeekYear(iso: ISODate): number {
  const d = fromISODate(iso);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayNr = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  return target.getFullYear();
}

/** Stable sortable week key, e.g. '2026-W10'. */
export function weekKey(iso: ISODate): string {
  return `${isoWeekYear(iso)}-W${String(isoWeekNumber(iso)).padStart(2, '0')}`;
}

/** Minutes since midnight for an 'HH:mm' string. */
export function clockToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function minutesToClock(min: number): string {
  const wrapped = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

/** Handles windows that cross midnight (e.g. a night shift 19:00–07:00). */
export function windowDurationMinutes(start: string, end: string): number {
  const s = clockToMinutes(start);
  const e = clockToMinutes(end);
  return e >= s ? e - s : 1440 - s + e;
}

export function nowTimestamp(): string {
  return new Date().toISOString();
}
