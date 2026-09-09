import type { ISODate, IntensityKey, MuscleGroup, SportKey } from './types.ts';
import { fromISODate, isoWeekNumber } from './date.ts';

export const SPORT_META: Record<SportKey, { label: string; icon: string; color: string; short: string }> = {
  run: { label: 'Laufen', icon: '🏃', color: 'var(--sport-run)', short: 'Lauf' },
  bike: { label: 'Radfahren', icon: '🚴', color: 'var(--sport-bike)', short: 'Rad' },
  swim: { label: 'Schwimmen', icon: '🏊', color: 'var(--sport-swim)', short: 'Swim' },
  strength: { label: 'Krafttraining', icon: '🏋️', color: 'var(--sport-strength)', short: 'Kraft' },
  mobility: { label: 'Mobility', icon: '🧘', color: 'var(--sport-mobility)', short: 'Mob' },
  recovery: { label: 'Recovery', icon: '💤', color: 'var(--sport-recovery)', short: 'Reg' },
  hike: { label: 'Wandern', icon: '🥾', color: 'var(--sport-hike)', short: 'Hike' },
  other_endurance: { label: 'Ausdauer (sonstige)', icon: '⚡', color: 'var(--sport-other)', short: 'Aus' },
};

export const INTENSITY_META: Record<
  IntensityKey,
  { label: string; zone: string; rpe: number; color: string }
> = {
  recovery: { label: 'Regeneration', zone: 'Z1', rpe: 2, color: 'var(--zone-1)' },
  easy: { label: 'Locker', zone: 'Z2', rpe: 3.5, color: 'var(--zone-2)' },
  moderate: { label: 'Moderat', zone: 'Z3', rpe: 5.5, color: 'var(--zone-3)' },
  threshold: { label: 'Schwelle', zone: 'Z4', rpe: 7.5, color: 'var(--zone-4)' },
  vo2: { label: 'VO2max', zone: 'Z5', rpe: 9, color: 'var(--zone-5)' },
  max: { label: 'Maximal', zone: 'Z5+', rpe: 10, color: 'var(--zone-5)' },
};

const WEEKDAYS_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const WEEKDAYS_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

export function weekdayLong(iso: ISODate): string {
  return WEEKDAYS_LONG[fromISODate(iso).getDay()];
}

export function weekdayShort(iso: ISODate): string {
  return WEEKDAYS_SHORT[fromISODate(iso).getDay()];
}

export function weekdayShortByIndex(i: number): string {
  return WEEKDAYS_SHORT[((i % 7) + 7) % 7];
}

export function formatDateLong(iso: ISODate): string {
  const d = fromISODate(iso);
  return `${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDateShort(iso: ISODate): string {
  const d = fromISODate(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
}

export function formatWeekLabel(iso: ISODate): string {
  return `KW ${isoWeekNumber(iso)}`;
}

/** 92 → '1:32 h', 45 → '45 min'. */
export function formatDuration(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} h` : `${h}:${String(rest).padStart(2, '0')} h`;
}

/** 7.7 → '7:42 h'. */
export function formatHours(hours: number): string {
  return formatDuration(hours * 60);
}

/** Seconds per km → '6:20 /km'. */
export function formatPace(secPerKm: number, unit = '/km'): string {
  if (!isFinite(secPerKm) || secPerKm <= 0) return '–';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')} ${unit}`;
}

/** Seconds → '25:12' or '1:04:30'. */
export function formatClockDuration(totalSeconds: number): string {
  if (!isFinite(totalSeconds) || totalSeconds <= 0) return '–';
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function formatDistance(km: number): string {
  if (km >= 10) return `${km.toFixed(0)} km`;
  if (km >= 1) return `${km.toFixed(1)} km`;
  return `${Math.round(km * 1000)} m`;
}

export function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString('de-DE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatSigned(value: number, digits = 0): string {
  const s = formatNumber(Math.abs(value), digits);
  return value > 0 ? `+${s}` : value < 0 ? `−${s}` : s;
}

/** Formats a tracked metric value in its natural unit. */
export function formatMetric(metric: string, value: number): string {
  if (metric.endsWith('_seconds')) return formatClockDuration(value);
  if (metric.endsWith('sec_per_km')) return formatPace(value);
  if (metric.endsWith('_km')) return formatDistance(value);
  if (metric.endsWith('_w')) return `${Math.round(value)} W`;
  if (metric.endsWith('_kg')) return `${value.toFixed(1)} kg`;
  if (metric.endsWith('_hours')) return formatHours(value);
  if (metric.endsWith('_max')) return `${Math.round(value)}`;
  return formatNumber(value, Number.isInteger(value) ? 0 : 1);
}

export function relativeDayLabel(iso: ISODate, todayIso: ISODate): string {
  if (iso === todayIso) return 'Heute';
  const d = fromISODate(iso).getTime() - fromISODate(todayIso).getTime();
  const days = Math.round(d / 86_400_000);
  if (days === 1) return 'Morgen';
  if (days === -1) return 'Gestern';
  if (days === 2) return 'Übermorgen';
  if (days > 1 && days < 7) return weekdayLong(iso);
  if (days < 0 && days > -7) return `vor ${-days} Tagen`;
  return formatDateShort(iso);
}

/** Deutsche Bezeichnungen der Muskelgruppen. */
export function muscleLabel(g: MuscleGroup): string {
  const labels: Record<MuscleGroup, string> = {
    legs_quads: 'Quadrizeps',
    legs_hamstrings: 'Beinbeuger',
    glutes: 'Gesäß',
    calves: 'Waden',
    chest: 'Brust',
    back: 'Rücken',
    shoulders: 'Schultern',
    arms: 'Arme',
    core: 'Rumpf',
    full_body: 'Ganzkörper',
  };
  return labels[g];
}
