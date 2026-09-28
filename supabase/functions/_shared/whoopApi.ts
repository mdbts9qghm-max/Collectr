// WHOOP Developer API v2: Adressen, Scopes, Abruf mit Paginierung/Retry und Normalisierung.
// Reines TypeScript mit Web-APIs (fetch), läuft in Deno (Edge Functions) und in Vitest.
// Alle URLs und Feldnamen stehen hier gesammelt, damit Abweichungen an einer Stelle korrigierbar sind.

export const WHOOP = {
  authUrl: 'https://api.prod.whoop.com/oauth/oauth2/auth',
  tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token',
  apiBase: 'https://api.prod.whoop.com/developer',
  scopes: ['offline', 'read:profile', 'read:recovery', 'read:sleep', 'read:cycles', 'read:workout', 'read:body_measurement'],
  paths: {
    cycles: '/v2/cycle',
    recoveries: '/v2/recovery',
    sleeps: '/v2/activity/sleep',
    workouts: '/v2/activity/workout',
    profile: '/v2/user/profile/basic',
    body: '/v2/user/measurement/body',
    revoke: '/v2/user/access',
  },
  /** Seitengröße (WHOOP erlaubt höchstens 25). */
  pageLimit: 25,
  /** Wiederholungen bei 429/5xx. */
  maxRetries: 3,
  /** Token erneuern, wenn es in weniger als so vielen Sekunden abläuft. */
  refreshMarginSec: 300,
  /** Erster Abruf nach dem Verbinden: so viele Tage zurück. */
  backfillDays: 90,
  /** Folgeabrufe: Überlappung in Tagen (nachträglich bewertete Daten). */
  overlapDays: 2,
  /** Mindestabstand zwischen zwei Abrufen aus der App (Cache, API-Limits). */
  minSyncIntervalSec: 300,
  /** Gültigkeit eines OAuth-States. */
  stateTtlSec: 600,
} as const

// ---------------------------------------------------------------------------
// Rohdaten API v2
// ---------------------------------------------------------------------------

type ScoreState = 'SCORED' | 'PENDING_SCORE' | 'UNSCORABLE'

export interface RawCycle {
  id: number
  start: string
  end: string | null
  timezone_offset?: string
  score_state?: ScoreState
  score?: { strain?: number; kilojoule?: number; average_heart_rate?: number; max_heart_rate?: number }
}

export interface RawRecovery {
  cycle_id: number
  sleep_id?: string
  score_state?: ScoreState
  score?: { user_calibrating?: boolean; recovery_score?: number; resting_heart_rate?: number; hrv_rmssd_milli?: number; spo2_percentage?: number; skin_temp_celsius?: number }
}

export interface RawSleep {
  id: string
  cycle_id?: number
  start: string
  end: string
  nap: boolean
  timezone_offset?: string
  score_state?: ScoreState
  score?: {
    stage_summary?: {
      total_in_bed_time_milli?: number
      total_awake_time_milli?: number
      total_light_sleep_time_milli?: number
      total_slow_wave_sleep_time_milli?: number
      total_rem_sleep_time_milli?: number
    }
    sleep_needed?: {
      baseline_milli?: number
      need_from_sleep_debt_milli?: number
      need_from_recent_strain_milli?: number
      need_from_recent_nap_milli?: number
    }
    sleep_performance_percentage?: number
    sleep_efficiency_percentage?: number
  }
}

export interface RawWorkout {
  id: string
  start: string
  end: string
  sport_name?: string
  score_state?: ScoreState
  score?: {
    strain?: number
    average_heart_rate?: number
    distance_meter?: number
    altitude_gain_meter?: number
    zone_durations?: Record<string, number>
  }
}

export interface RawBody {
  height_meter?: number
  weight_kilogram?: number
  max_heart_rate?: number
}

// ---------------------------------------------------------------------------
// Normalisierte Daten (Format von src/core/whoop/assign.ts)
// ---------------------------------------------------------------------------

export interface NormSleep {
  id: string
  cycleId?: number
  start: string
  end: string
  nap: boolean
  asleepMin?: number
  performancePct?: number
  efficiencyPct?: number
  needMin?: number
  debtMin?: number
}
export interface NormRecovery {
  cycleId: number
  sleepId?: string
  score?: number
  hrvMs?: number
  restingHr?: number
  spo2?: number
}
export interface NormCycle {
  id: number
  start: string
  end?: string
  strain?: number
}
export interface NormWorkout {
  id: string
  start: string
  end: string
  sportName: string
  strain?: number
  distanceM?: number
  altitudeGainM?: number
  avgHr?: number
  zoneDurationsMin?: number[]
}

const min = (ms?: number) => (ms === undefined ? undefined : Math.round(ms / 60000))
const def = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
const scored = (s?: ScoreState) => s === undefined || s === 'SCORED'

export function normalizeCycle(r: RawCycle): NormCycle {
  return def({ id: r.id, start: r.start, end: r.end ?? undefined, strain: scored(r.score_state) ? r.score?.strain : undefined })
}

export function normalizeRecovery(r: RawRecovery): NormRecovery {
  const s = scored(r.score_state) ? r.score : undefined
  return def({
    cycleId: r.cycle_id,
    sleepId: r.sleep_id,
    score: s?.recovery_score,
    hrvMs: s?.hrv_rmssd_milli,
    restingHr: s?.resting_heart_rate,
    spo2: s?.spo2_percentage,
  })
}

export function normalizeSleep(r: RawSleep): NormSleep {
  const s = scored(r.score_state) ? r.score : undefined
  const st = s?.stage_summary
  const asleep = st ? (st.total_light_sleep_time_milli ?? 0) + (st.total_slow_wave_sleep_time_milli ?? 0) + (st.total_rem_sleep_time_milli ?? 0) : undefined
  const need = s?.sleep_needed
  // Der Nap-Anteil ist bei WHOOP negativ (verringert den Bedarf).
  const needMs = need
    ? (need.baseline_milli ?? 0) + (need.need_from_sleep_debt_milli ?? 0) + (need.need_from_recent_strain_milli ?? 0) + (need.need_from_recent_nap_milli ?? 0)
    : undefined
  return def({
    id: r.id,
    cycleId: r.cycle_id,
    start: r.start,
    end: r.end,
    nap: r.nap,
    asleepMin: min(asleep),
    performancePct: s?.sleep_performance_percentage,
    efficiencyPct: s?.sleep_efficiency_percentage,
    needMin: min(needMs),
    debtMin: min(need?.need_from_sleep_debt_milli),
  })
}

const ZONES = ['zone_zero_milli', 'zone_one_milli', 'zone_two_milli', 'zone_three_milli', 'zone_four_milli', 'zone_five_milli']

export function normalizeWorkout(r: RawWorkout): NormWorkout {
  const s = scored(r.score_state) ? r.score : undefined
  return def({
    id: r.id,
    start: r.start,
    end: r.end,
    sportName: r.sport_name ?? 'unknown',
    strain: s?.strain,
    distanceM: s?.distance_meter,
    altitudeGainM: s?.altitude_gain_meter,
    avgHr: s?.average_heart_rate,
    zoneDurationsMin: s?.zone_durations ? ZONES.map((z) => min(s.zone_durations![z] ?? 0)!) : undefined,
  })
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>
export type SleepFn = (ms: number) => Promise<void>

export class WhoopHttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** GET mit Retry bei 429 (Retry-After) und 5xx. */
export async function whoopGet<T>(path: string, params: Record<string, string>, token: string, fetchFn: FetchFn, sleep: SleepFn): Promise<T> {
  const url = new URL(WHOOP.apiBase + path)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  for (let attempt = 0; ; attempt++) {
    const res = await fetchFn(url.toString(), { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) return (await res.json()) as T
    if ((res.status === 429 || res.status >= 500) && attempt < WHOOP.maxRetries) {
      const retryAfter = Number(res.headers.get('Retry-After'))
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt)
      continue
    }
    throw new WhoopHttpError(res.status, `WHOOP ${path}: HTTP ${res.status}`)
  }
}

/** Alle Seiten einer Sammlung im Zeitraum. */
export async function whoopCollection<T>(path: string, range: { start: string; end?: string }, token: string, fetchFn: FetchFn, sleep: SleepFn): Promise<T[]> {
  const out: T[] = []
  let next: string | undefined
  do {
    const params: Record<string, string> = { limit: String(WHOOP.pageLimit), start: range.start }
    if (range.end) params.end = range.end
    if (next) params.nextToken = next
    const page = await whoopGet<{ records?: T[]; next_token?: string | null }>(path, params, token, fetchFn, sleep)
    out.push(...(page.records ?? []))
    next = page.next_token ?? undefined
  } while (next)
  return out
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  scope?: string
}

/** Token-Endpunkt (Code tauschen oder erneuern). */
export async function tokenRequest(body: Record<string, string>, fetchFn: FetchFn): Promise<TokenResponse> {
  const res = await fetchFn(WHOOP.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  })
  if (!res.ok) throw new WhoopHttpError(res.status, `WHOOP Token: HTTP ${res.status} ${await res.text().catch(() => '')}`.trim())
  const json = (await res.json()) as TokenResponse
  if (!json.access_token || !json.refresh_token) throw new Error('WHOOP Token: Antwort ohne Tokens (Scope „offline“ fehlt?)')
  return json
}

export function authorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const u = new URL(WHOOP.authUrl)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('client_id', clientId)
  u.searchParams.set('redirect_uri', redirectUri)
  u.searchParams.set('scope', WHOOP.scopes.join(' '))
  u.searchParams.set('state', state)
  return u.toString()
}
