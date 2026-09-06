import type { AppData } from './store.ts';
import type { TrainingSession } from '../domain/types.ts';
import { nowTimestamp } from '../domain/date.ts';
import { SPORT_META } from '../domain/format.ts';
import { effectiveDistance, effectiveDuration, sessionLoad } from '../domain/load.ts';

export const BACKUP_FORMAT = 'hybrid-athlete-backup';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  appVersion: string;
  data: AppData;
}

export function buildBackup(data: AppData, appVersion: string): BackupFile {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: nowTimestamp(),
    appVersion,
    data,
  };
}

export interface ImportResult {
  ok: boolean;
  error?: string;
  data?: Partial<AppData>;
  summary?: { label: string; count: number }[];
}

/**
 * Validates an uploaded backup before it can replace live data. A malformed
 * file must never silently wipe a training history.
 */
export function parseBackup(text: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Die Datei ist kein gültiges JSON.' };
  }
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'Unerwartetes Dateiformat.' };
  }
  const file = raw as Partial<BackupFile>;
  if (file.format !== BACKUP_FORMAT) {
    return { ok: false, error: 'Das ist kein Backup dieser App.' };
  }
  if (typeof file.version !== 'number' || file.version > BACKUP_VERSION) {
    return {
      ok: false,
      error: `Backup-Version ${String(file.version)} ist neuer als diese App-Version (${BACKUP_VERSION}).`,
    };
  }
  const data = file.data;
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'Das Backup enthält keine Daten.' };
  }

  const clean: Partial<AppData> = {};
  if (data.settings) clean.settings = data.settings;
  if (Array.isArray(data.shiftTypes)) clean.shiftTypes = data.shiftTypes;
  if (data.shifts && typeof data.shifts === 'object') clean.shifts = data.shifts;
  if (Array.isArray(data.sessions)) clean.sessions = data.sessions;
  if (Array.isArray(data.exercises)) clean.exercises = data.exercises;
  if (Array.isArray(data.habits)) clean.habits = data.habits;
  if (Array.isArray(data.habitEntries)) clean.habitEntries = data.habitEntries;
  if (Array.isArray(data.tasks)) clean.tasks = data.tasks;
  if (Array.isArray(data.goals)) clean.goals = data.goals;
  if (Array.isArray(data.records)) clean.records = data.records;
  if (data.checkIns && typeof data.checkIns === 'object') clean.checkIns = data.checkIns;
  if (data.reviews && typeof data.reviews === 'object') clean.reviews = data.reviews;
  if (Array.isArray(data.plans)) clean.plans = data.plans;

  return {
    ok: true,
    data: clean,
    summary: [
      { label: 'Trainingseinheiten', count: clean.sessions?.length ?? 0 },
      { label: 'Habits', count: clean.habits?.length ?? 0 },
      { label: 'Habit-Einträge', count: clean.habitEntries?.length ?? 0 },
      { label: 'Aufgaben', count: clean.tasks?.length ?? 0 },
      { label: 'Check-ins', count: Object.keys(clean.checkIns ?? {}).length },
      { label: 'Schichttage', count: Object.keys(clean.shifts ?? {}).length },
      { label: 'Ziele', count: clean.goals?.length ?? 0 },
      { label: 'Bestleistungen', count: clean.records?.length ?? 0 },
    ],
  };
}

/* ------------------------------------------------------------------ *
 * CSV export
 * ------------------------------------------------------------------ */

function csvEscape(value: string | number | undefined | null): string {
  if (value == null) return '';
  const s = String(value);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: (string | number | undefined | null)[][]): string {
  return [headers.join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\n');
}

export function sessionsToCsv(sessions: TrainingSession[]): string {
  const rows = sessions
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => [
      s.date,
      s.startTime,
      SPORT_META[s.sport].label,
      s.title,
      s.status,
      effectiveDuration(s),
      effectiveDistance(s),
      s.status === 'completed' ? (s.actualIntensity ?? s.plannedIntensity) : s.plannedIntensity,
      s.rpe,
      s.avgHr,
      s.elevationGainM,
      s.avgPowerW,
      sessionLoad(s),
      s.goal,
      s.notes,
      s.source,
    ]);
  return toCsv(
    [
      'datum', 'uhrzeit', 'sportart', 'titel', 'status', 'dauer_min', 'distanz_km',
      'intensitaet', 'rpe', 'hf_avg', 'hoehenmeter', 'leistung_w', 'load', 'ziel', 'notizen', 'quelle',
    ],
    rows,
  );
}

export function habitEntriesToCsv(data: AppData): string {
  const names = new Map(data.habits.map((h) => [h.id, h.name]));
  const rows = data.habitEntries
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => [e.date, names.get(e.habitId) ?? e.habitId, e.value, e.note, e.source]);
  return toCsv(['datum', 'habit', 'wert', 'notiz', 'quelle'], rows);
}

export function checkInsToCsv(data: AppData): string {
  const rows = Object.values(data.checkIns)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((c) => [
      c.date, c.sleepHours, c.sleepQuality, c.fatigue, c.soreness, c.stress,
      c.motivation, c.restingHr, c.hrvMs, c.whoopRecovery, c.bodyweightKg, c.steps, c.notes,
    ]);
  return toCsv(
    [
      'datum', 'schlaf_h', 'schlafqualitaet', 'muedigkeit', 'muskelkater', 'stress',
      'motivation', 'ruhepuls', 'hrv_ms', 'whoop_recovery', 'gewicht_kg', 'schritte', 'notizen',
    ],
    rows,
  );
}

export function tasksToCsv(data: AppData): string {
  const rows = data.tasks.map((t) => [
    t.title, t.category, t.priority, t.status, t.dueDate, t.dueTime, t.effortMin, t.notes,
  ]);
  return toCsv(['titel', 'kategorie', 'prioritaet', 'status', 'faellig', 'uhrzeit', 'aufwand_min', 'notizen'], rows);
}

/** Triggers a client-side download. Everything stays on the device. */
export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function backupFilename(prefix: string, ext: string): string {
  return `${prefix}-${new Date().toISOString().slice(0, 10)}.${ext}`;
}
