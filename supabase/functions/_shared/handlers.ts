// Logik der WHOOP-Edge-Functions mit injizierten Abhängigkeiten (Datenbank, fetch, Uhr).
// Die Deno-Einstiegspunkte (whoop-*/index.ts) sind nur dünne Hüllen darum.

import {
  authorizeUrl,
  normalizeCycle,
  normalizeRecovery,
  normalizeSleep,
  normalizeWorkout,
  tokenRequest,
  WHOOP,
  whoopCollection,
  whoopGet,
  WhoopHttpError,
  type FetchFn,
  type RawBody,
  type RawCycle,
  type RawRecovery,
  type RawSleep,
  type RawWorkout,
  type SleepFn,
} from './whoopApi.ts'

export interface StoredTokens {
  accessToken: string
  refreshToken: string
  expiresAt: string
  scope?: string
  whoopUserId?: number
}

export interface WhoopStatus {
  connected: boolean
  connectedAt?: string
  whoopUserId?: number
  lastSyncAt?: string
  lastError?: string | null
  counts?: Record<string, number>
}

export type WhoopTable = 'whoop_cycles' | 'whoop_recoveries' | 'whoop_sleeps' | 'whoop_workouts' | 'whoop_body'

export interface DataRow {
  id: string
  data: unknown
  raw: unknown
}

export interface Db {
  getTokens(userId: string): Promise<StoredTokens | null>
  saveTokens(userId: string, t: StoredTokens): Promise<void>
  deleteTokens(userId: string): Promise<void>
  createState(state: string, userId: string, expiresAt: string): Promise<void>
  /** Liefert die user_id und löscht den State (einmalig), null wenn unbekannt oder abgelaufen. */
  consumeState(state: string, now: Date): Promise<string | null>
  upsertRows(table: WhoopTable, userId: string, rows: DataRow[]): Promise<void>
  getStatus(userId: string): Promise<WhoopStatus | null>
  saveStatus(userId: string, s: WhoopStatus): Promise<void>
}

export interface Env {
  clientId: string
  clientSecret: string
  redirectUri: string
  appUrl: string
}

export interface Deps {
  db: Db
  env: Env
  fetch: FetchFn
  now: () => Date
  sleep: SleepFn
  randomState: () => string
}

// ---------------------------------------------------------------------------

export async function startOAuth(deps: Deps, userId: string): Promise<{ url: string }> {
  const state = deps.randomState()
  if (state.length < 8) throw new Error('state zu kurz')
  const expiresAt = new Date(deps.now().getTime() + WHOOP.stateTtlSec * 1000).toISOString()
  await deps.db.createState(state, userId, expiresAt)
  return { url: authorizeUrl(deps.env.clientId, deps.env.redirectUri, state) }
}

/** Callback von WHOOP: liefert die Weiterleitungsadresse zurück zur App. */
export async function handleCallback(deps: Deps, params: URLSearchParams): Promise<string> {
  const back = (result: string, reason?: string) =>
    `${deps.env.appUrl.replace(/\/$/, '')}/einstellungen?whoop=${result}${reason ? `&grund=${encodeURIComponent(reason)}` : ''}`
  const error = params.get('error')
  if (error) return back('fehler', params.get('error_description') ?? error)
  const code = params.get('code')
  const state = params.get('state')
  if (!code || !state) return back('fehler', 'Antwort ohne Code oder State')
  const userId = await deps.db.consumeState(state, deps.now())
  if (!userId) return back('fehler', 'Anmeldung abgelaufen, bitte erneut verbinden')
  try {
    const t = await tokenRequest(
      { grant_type: 'authorization_code', code, redirect_uri: deps.env.redirectUri, client_id: deps.env.clientId, client_secret: deps.env.clientSecret },
      deps.fetch,
    )
    const tokens: StoredTokens = { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: expiry(deps, t.expires_in), ...(t.scope ? { scope: t.scope } : {}) }
    const profile = await whoopGet<{ user_id?: number }>(WHOOP.paths.profile, {}, tokens.accessToken, deps.fetch, deps.sleep).catch(() => ({}) as { user_id?: number })
    if (profile.user_id !== undefined) tokens.whoopUserId = profile.user_id
    await deps.db.saveTokens(userId, tokens)
    await deps.db.saveStatus(userId, {
      connected: true,
      connectedAt: deps.now().toISOString(),
      ...(tokens.whoopUserId !== undefined ? { whoopUserId: tokens.whoopUserId } : {}),
      lastError: null,
    })
    return back('verbunden')
  } catch (e) {
    return back('fehler', e instanceof Error ? e.message : String(e))
  }
}

function expiry(deps: Deps, expiresInSec: number): string {
  return new Date(deps.now().getTime() + expiresInSec * 1000).toISOString()
}

/** Gültiges Access-Token (erneuert es bei Bedarf oder erzwungen). */
export async function validAccessToken(deps: Deps, userId: string, force = false): Promise<string> {
  const t = await deps.db.getTokens(userId)
  if (!t) throw new Error('WHOOP ist nicht verbunden')
  const left = (Date.parse(t.expiresAt) - deps.now().getTime()) / 1000
  if (!force && left > WHOOP.refreshMarginSec) return t.accessToken
  const r = await tokenRequest(
    { grant_type: 'refresh_token', refresh_token: t.refreshToken, client_id: deps.env.clientId, client_secret: deps.env.clientSecret, scope: 'offline' },
    deps.fetch,
  )
  // WHOOP rotiert das Refresh-Token: sofort speichern
  await deps.db.saveTokens(userId, { ...t, accessToken: r.access_token, refreshToken: r.refresh_token, expiresAt: expiry(deps, r.expires_in) })
  return r.access_token
}

export interface SyncResult {
  skipped: boolean
  counts: Record<string, number>
  since?: string
}

/** Daten seit dem letzten Abruf (erstmals backfillDays) holen und speichern. */
export async function syncWhoop(deps: Deps, userId: string, opts: { force?: boolean } = {}): Promise<SyncResult> {
  const status = (await deps.db.getStatus(userId)) ?? { connected: false }
  const now = deps.now()
  if (!opts.force && status.lastSyncAt && (now.getTime() - Date.parse(status.lastSyncAt)) / 1000 < WHOOP.minSyncIntervalSec) {
    return { skipped: true, counts: status.counts ?? {} }
  }
  const sinceMs = status.lastSyncAt ? Date.parse(status.lastSyncAt) - WHOOP.overlapDays * 86_400_000 : now.getTime() - WHOOP.backfillDays * 86_400_000
  const since = new Date(sinceMs).toISOString()
  const range = { start: since, end: now.toISOString() }
  try {
    let token = await validAccessToken(deps, userId)
    const withRetry = async <T>(fn: (tok: string) => Promise<T>): Promise<T> => {
      try {
        return await fn(token)
      } catch (e) {
        if (e instanceof WhoopHttpError && e.status === 401) {
          token = await validAccessToken(deps, userId, true)
          return fn(token)
        }
        throw e
      }
    }
    const cycles = await withRetry((t) => whoopCollection<RawCycle>(WHOOP.paths.cycles, range, t, deps.fetch, deps.sleep))
    const recoveries = await withRetry((t) => whoopCollection<RawRecovery>(WHOOP.paths.recoveries, range, t, deps.fetch, deps.sleep))
    const sleeps = await withRetry((t) => whoopCollection<RawSleep>(WHOOP.paths.sleeps, range, t, deps.fetch, deps.sleep))
    const workouts = await withRetry((t) => whoopCollection<RawWorkout>(WHOOP.paths.workouts, range, t, deps.fetch, deps.sleep))
    const body = await withRetry((t) => whoopGet<RawBody>(WHOOP.paths.body, {}, t, deps.fetch, deps.sleep)).catch(() => null)

    await deps.db.upsertRows('whoop_cycles', userId, cycles.map((r) => ({ id: String(r.id), data: normalizeCycle(r), raw: r })))
    await deps.db.upsertRows('whoop_recoveries', userId, recoveries.map((r) => ({ id: String(r.cycle_id), data: normalizeRecovery(r), raw: r })))
    await deps.db.upsertRows('whoop_sleeps', userId, sleeps.map((r) => ({ id: r.id, data: normalizeSleep(r), raw: r })))
    await deps.db.upsertRows('whoop_workouts', userId, workouts.map((r) => ({ id: r.id, data: normalizeWorkout(r), raw: r })))
    if (body) await deps.db.upsertRows('whoop_body', userId, [{ id: 'body', data: body, raw: body }])

    const counts = { cycles: cycles.length, recoveries: recoveries.length, sleeps: sleeps.length, workouts: workouts.length }
    await deps.db.saveStatus(userId, { ...status, connected: true, lastSyncAt: now.toISOString(), lastError: null, counts })
    return { skipped: false, counts, since }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await deps.db.saveStatus(userId, { ...status, lastError: msg })
    throw e
  }
}

/** Verbindung trennen: Zugriff bei WHOOP widerrufen (best effort), Tokens löschen. */
export async function disconnectWhoop(deps: Deps, userId: string): Promise<void> {
  const t = await deps.db.getTokens(userId)
  if (t) {
    await deps
      .fetch(WHOOP.apiBase + WHOOP.paths.revoke, { method: 'DELETE', headers: { Authorization: `Bearer ${t.accessToken}` } })
      .catch(() => undefined)
    await deps.db.deleteTokens(userId)
  }
  await deps.db.saveStatus(userId, { connected: false, lastError: null })
}
