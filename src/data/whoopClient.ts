import type { ISODate } from '../domain/types.ts';
import { assignSleep } from '../domain/aerobic/whoop.ts';
import type { SleepPeriod } from '../domain/aerobic/whoop.ts';

/**
 * The client half of the WHOOP connection.
 *
 * The split is deliberate: the **client secret** lives on the server, because it
 * identifies the app and must never be extractable from a browser. The
 * **athlete's own tokens** live in their IndexedDB, next to their sleep and
 * training data, because that is what they are — their credential for their
 * data, on their device. No account, no database, nothing about them stored
 * anywhere but their own phone.
 *
 * Every request goes through `/api/whoop/*`. The app's content security policy
 * allows `connect-src 'self'` only, so a compromised dependency cannot ship this
 * data anywhere.
 */

export interface WhoopTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

const STORAGE_KEY = 'whoop-tokens';
/** Refresh this long before the token actually expires. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export function loadTokens(): WhoopTokens | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WhoopTokens) : null;
  } catch {
    return null;
  }
}

export function saveTokens(tokens: WhoopTokens): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  } catch {
    // A private window or blocked storage: the connection simply will not
    // persist, and the manual path keeps working.
  }
}

export function clearTokens(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do */
  }
}

export const connectUrl = '/api/whoop/authorize';

/**
 * Picks the tokens out of the URL fragment the callback redirected to.
 *
 * Reads them once and then rewrites the address bar, so the tokens do not sit
 * in the history entry for the rest of the session.
 */
export function captureTokensFromUrl(): { tokens?: WhoopTokens; error?: string } | null {
  const hash = window.location.hash;
  const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  if (!query) return null;
  const params = new URLSearchParams(query);

  const error = params.get('whoop_error');
  const access = params.get('whoop_access');
  if (!error && !access) return null;

  const clean = hash.slice(0, hash.indexOf('?'));
  window.history.replaceState(null, '', window.location.pathname + (clean || '#/profile'));

  if (error) return { error };
  return {
    tokens: {
      accessToken: access!,
      refreshToken: params.get('whoop_refresh') ?? '',
      expiresAt: Number(params.get('whoop_expires') ?? 0),
    },
  };
}

async function withFreshToken(): Promise<WhoopTokens | null> {
  const tokens = loadTokens();
  if (!tokens) return null;
  if (tokens.expiresAt - Date.now() > REFRESH_MARGIN_MS) return tokens;
  if (!tokens.refreshToken) return null;

  const response = await fetch('/api/whoop/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  });
  if (!response.ok) {
    clearTokens();
    return null;
  }
  const fresh = (await response.json()) as WhoopTokens;
  saveTokens(fresh);
  return fresh;
}

async function get<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  const tokens = await withFreshToken();
  if (!tokens) return null;

  const url = new URL('/api/whoop/data', window.location.origin);
  url.searchParams.set('path', path);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const response = await fetch(url, { headers: { authorization: `Bearer ${tokens.accessToken}` } });
  if (!response.ok) return null;
  return (await response.json()) as T;
}

/* ------------------------------------------------------------------ *
 * What the app actually asks for
 * ------------------------------------------------------------------ */

export interface WhoopImport {
  /** Recovery, resting heart rate and HRV, keyed by the day they belong to. */
  byDate: Map<ISODate, { recoveryPct?: number; restingHr?: number; hrvMs?: number }>;
  /** Sleep periods with their cycle day already assigned. */
  sleep: SleepPeriod[];
  /** Sleep hours per day, main sleep and nap counted separately. */
  sleepHoursByDate: Map<ISODate, { main: number; nap: number }>;
}

interface WhoopSleepRecord {
  start: string;
  end: string;
  nap: boolean;
  score?: { sleep_performance_percentage?: number };
}
interface WhoopRecoveryRecord {
  created_at: string;
  score?: { recovery_score?: number; resting_heart_rate?: number; hrv_rmssd_milli?: number };
}

export async function fetchRecent(days = 28): Promise<WhoopImport | null> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const sleep = await get<{ records: WhoopSleepRecord[] }>('/v2/activity/sleep', {
    start: since,
    limit: '25',
  });
  const recovery = await get<{ records: WhoopRecoveryRecord[] }>('/v2/recovery', {
    start: since,
    limit: '25',
  });
  if (!sleep && !recovery) return null;

  const byDate = new Map<ISODate, { recoveryPct?: number; restingHr?: number; hrvMs?: number }>();
  for (const record of recovery?.records ?? []) {
    const date = record.created_at.slice(0, 10);
    byDate.set(date, {
      recoveryPct: record.score?.recovery_score,
      restingHr: record.score?.resting_heart_rate,
      hrvMs: record.score?.hrv_rmssd_milli,
    });
  }

  /*
   * Each sleep period is assigned to a shift day explicitly, because WHOOP's own
   * day boundary sits around 04:00 and comes apart from the rotation the moment
   * the main sleep runs 08:00 to 14:00 — which it does on every sleep day.
   */
  const periods = (sleep?.records ?? []).map((r) =>
    assignSleep({ start: r.start, end: r.end, kind: r.nap ? 'nap' : 'main' }),
  );

  const sleepHoursByDate = new Map<ISODate, { main: number; nap: number }>();
  for (const period of periods) {
    if (!period.assignedTo) continue;
    const hours = (Date.parse(period.end) - Date.parse(period.start)) / 3_600_000;
    const entry = sleepHoursByDate.get(period.assignedTo) ?? { main: 0, nap: 0 };
    if (period.kind === 'nap') entry.nap += hours;
    else entry.main += hours;
    sleepHoursByDate.set(period.assignedTo, entry);
  }

  return { byDate, sleep: periods, sleepHoursByDate };
}
