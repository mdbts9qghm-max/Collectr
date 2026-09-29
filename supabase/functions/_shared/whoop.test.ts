import { describe, expect, it } from 'vitest'
import { disconnectWhoop, handleCallback, startOAuth, syncWhoop, validAccessToken, type DataRow, type Db, type Deps, type StoredTokens, type WhoopStatus, type WhoopTable } from './handlers.ts'
import { normalizeRecovery, normalizeSleep, normalizeWorkout, WHOOP, type RawSleep } from './whoopApi.ts'

// --- Nachbildungen -----------------------------------------------------------

class FakeDb implements Db {
  tokens = new Map<string, StoredTokens>()
  states = new Map<string, { userId: string; expiresAt: string }>()
  rows = new Map<string, DataRow>()
  status = new Map<string, WhoopStatus>()
  async getTokens(u: string) {
    return this.tokens.get(u) ?? null
  }
  async saveTokens(u: string, t: StoredTokens) {
    this.tokens.set(u, t)
  }
  async deleteTokens(u: string) {
    this.tokens.delete(u)
  }
  async createState(s: string, u: string, e: string) {
    this.states.set(s, { userId: u, expiresAt: e })
  }
  async consumeState(s: string, now: Date) {
    const st = this.states.get(s)
    this.states.delete(s)
    return st && Date.parse(st.expiresAt) > now.getTime() ? st.userId : null
  }
  async upsertRows(t: WhoopTable, u: string, rows: DataRow[]) {
    for (const r of rows) this.rows.set(`${t}/${u}/${r.id}`, r)
  }
  async getStatus(u: string) {
    return this.status.get(u) ?? null
  }
  async saveStatus(u: string, s: WhoopStatus) {
    this.status.set(u, s)
  }
}

type Handler = (url: URL, init?: RequestInit) => Response | Promise<Response>

function deps(handler: Handler, now = new Date('2026-10-10T08:00:00Z')) {
  const db = new FakeDb()
  const calls: { url: string; init?: RequestInit }[] = []
  const d: Deps = {
    db,
    env: { clientId: 'cid', clientSecret: 'secret', redirectUri: 'https://ref.supabase.co/functions/v1/whoop-oauth-callback', appUrl: 'https://collectr.app/' },
    fetch: async (u, init) => {
      calls.push({ url: u, ...(init ? { init } : {}) })
      return handler(new URL(u), init)
    },
    now: () => now,
    sleep: async () => undefined,
    randomState: () => 'state-1234567890',
  }
  return { d, db, calls }
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

const SLEEP: RawSleep = {
  id: 'a1b2c3',
  cycle_id: 93845,
  start: '2026-10-04T06:00:00.000Z',
  end: '2026-10-04T12:00:00.000Z',
  nap: false,
  score_state: 'SCORED',
  score: {
    stage_summary: { total_in_bed_time_milli: 21_600_000, total_awake_time_milli: 1_800_000, total_light_sleep_time_milli: 10_800_000, total_slow_wave_sleep_time_milli: 4_200_000, total_rem_sleep_time_milli: 4_800_000 },
    sleep_needed: { baseline_milli: 27_000_000, need_from_sleep_debt_milli: 2_400_000, need_from_recent_strain_milli: 600_000, need_from_recent_nap_milli: -1_200_000 },
    sleep_performance_percentage: 78,
    sleep_efficiency_percentage: 91,
    respiratory_rate: 15.26,
  },
}

// --- Tests ------------------------------------------------------------------

describe('Normalisierung API v2', () => {
  it('Schlaf: tatsächlicher Schlaf, Bedarf inkl. Defizit/Strain/Nap, Performance, Effizienz', () => {
    expect(normalizeSleep(SLEEP)).toEqual({
      id: 'a1b2c3',
      cycleId: 93845,
      start: SLEEP.start,
      end: SLEEP.end,
      nap: false,
      asleepMin: 330,
      performancePct: 78,
      efficiencyPct: 91,
      needMin: 480,
      debtMin: 40,
      respiratoryRate: 15.3,
    })
  })

  it('ohne Score (noch nicht bewertet) bleiben nur Zeiten', () => {
    const n = normalizeSleep({ ...SLEEP, score_state: 'PENDING_SCORE' })
    expect(n.asleepMin).toBeUndefined()
    expect(n.start).toBe(SLEEP.start)
    expect(normalizeRecovery({ cycle_id: 1, sleep_id: 'x', score_state: 'UNSCORABLE' })).toEqual({ cycleId: 1, sleepId: 'x' })
  })

  it('Recovery und Workout', () => {
    expect(normalizeRecovery({ cycle_id: 5, sleep_id: 's', score_state: 'SCORED', score: { recovery_score: 44, hrv_rmssd_milli: 55.2, resting_heart_rate: 56, spo2_percentage: 96.5 } })).toEqual({
      cycleId: 5,
      sleepId: 's',
      score: 44,
      hrvMs: 55.2,
      restingHr: 56,
      spo2: 96.5,
    })
    const w = normalizeWorkout({
      id: 'w',
      start: 'a',
      end: 'b',
      sport_name: 'running',
      score_state: 'SCORED',
      score: { strain: 11.2, distance_meter: 12_000, altitude_gain_meter: 80, average_heart_rate: 140, zone_durations: { zone_two_milli: 3_000_000, zone_three_milli: 600_000 } },
    })
    expect(w).toMatchObject({ sportName: 'running', strain: 11.2, distanceM: 12_000, altitudeGainM: 80, zoneDurationsMin: [0, 0, 50, 10, 0, 0] })
  })
})

describe('OAuth', () => {
  it('Start: State wird gespeichert, URL enthält alle Scopes inkl. offline', async () => {
    const { d, db } = deps(() => json({}))
    const { url } = await startOAuth(d, 'u1')
    const u = new URL(url)
    expect(u.origin + u.pathname).toBe(WHOOP.authUrl)
    expect(u.searchParams.get('scope')).toBe('offline read:profile read:recovery read:sleep read:cycles read:workout read:body_measurement')
    expect(u.searchParams.get('redirect_uri')).toBe(d.env.redirectUri)
    expect(u.searchParams.get('state')).toBe('state-1234567890')
    expect(db.states.get('state-1234567890')!.userId).toBe('u1')
  })

  it('Callback: Code gegen Tokens tauschen, Status speichern, zurück zur App', async () => {
    const { d, db, calls } = deps((url) => {
      if (url.pathname.endsWith('/oauth2/token')) return json({ access_token: 'at', refresh_token: 'rt', expires_in: 3600, scope: 'offline read:recovery' })
      if (url.pathname.endsWith('/profile/basic')) return json({ user_id: 10129, email: 'x' })
      return json({}, 404)
    })
    await startOAuth(d, 'u1')
    const loc = await handleCallback(d, new URLSearchParams({ code: 'c0de', state: 'state-1234567890' }))
    expect(loc).toBe('https://collectr.app/einstellungen?whoop=verbunden')
    expect(db.tokens.get('u1')).toMatchObject({ accessToken: 'at', refreshToken: 'rt', whoopUserId: 10129, expiresAt: '2026-10-10T09:00:00.000Z' })
    expect(db.status.get('u1')!.connected).toBe(true)
    const tokenCall = calls.find((c) => c.url.endsWith('/oauth2/token'))!
    const body = new URLSearchParams(tokenCall.init!.body as string)
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('client_secret')).toBe('secret')
    // State ist verbraucht
    expect(await handleCallback(d, new URLSearchParams({ code: 'c0de', state: 'state-1234567890' }))).toContain('whoop=fehler')
  })

  it('Callback: unbekannter/abgelaufener State, Fehler von WHOOP', async () => {
    const { d, db } = deps(() => json({}))
    expect(await handleCallback(d, new URLSearchParams({ code: 'c', state: 'falsch' }))).toContain('whoop=fehler')
    await db.createState('alt-12345678', 'u1', '2026-10-10T07:00:00Z')
    expect(await handleCallback(d, new URLSearchParams({ code: 'c', state: 'alt-12345678' }))).toContain('abgelaufen')
    expect(await handleCallback(d, new URLSearchParams({ error: 'access_denied' }))).toContain('grund=access_denied')
  })
})

describe('Token-Erneuerung', () => {
  it('erneuert bald ablaufende Tokens und speichert das rotierte Refresh-Token', async () => {
    const { d, db } = deps(() => json({ access_token: 'at2', refresh_token: 'rt2', expires_in: 3600 }))
    await db.saveTokens('u1', { accessToken: 'at1', refreshToken: 'rt1', expiresAt: '2026-10-10T08:02:00Z' })
    expect(await validAccessToken(d, 'u1')).toBe('at2')
    expect(db.tokens.get('u1')).toMatchObject({ accessToken: 'at2', refreshToken: 'rt2' })
  })

  it('gültige Tokens werden nicht erneuert', async () => {
    const { d, db, calls } = deps(() => json({}))
    await db.saveTokens('u1', { accessToken: 'at1', refreshToken: 'rt1', expiresAt: '2026-10-10T10:00:00Z' })
    expect(await validAccessToken(d, 'u1')).toBe('at1')
    expect(calls).toHaveLength(0)
  })
})

describe('Abruf', () => {
  function api(opts: { failFirst401?: boolean; rateLimitOnce?: boolean } = {}) {
    let got401 = false
    let limited = false
    return (url: URL, init?: RequestInit): Response => {
      if (url.pathname.endsWith('/oauth2/token')) return json({ access_token: 'fresh', refresh_token: 'rt-new', expires_in: 3600 })
      const auth = (init?.headers as Record<string, string>)?.Authorization
      if (opts.failFirst401 && !got401 && auth === 'Bearer at1') {
        got401 = true
        return json({}, 401)
      }
      if (url.pathname.endsWith('/v2/cycle')) {
        if (opts.rateLimitOnce && !limited) {
          limited = true
          return json({}, 429, { 'Retry-After': '1' })
        }
        // zwei Seiten
        return url.searchParams.get('nextToken')
          ? json({ records: [{ id: 2, start: 's2', end: null, score_state: 'PENDING_SCORE' }] })
          : json({ records: [{ id: 1, start: 's1', end: 'e1', score_state: 'SCORED', score: { strain: 12.3 } }], next_token: 'p2' })
      }
      if (url.pathname.endsWith('/v2/recovery')) return json({ records: [{ cycle_id: 1, sleep_id: 'a1b2c3', score_state: 'SCORED', score: { recovery_score: 61, hrv_rmssd_milli: 60, resting_heart_rate: 52 } }] })
      if (url.pathname.endsWith('/v2/activity/sleep')) return json({ records: [SLEEP] })
      if (url.pathname.endsWith('/v2/activity/workout')) return json({ records: [] })
      if (url.pathname.endsWith('/measurement/body')) return json({ max_heart_rate: 190 })
      return json({}, 404)
    }
  }

  it('erster Abruf: 90 Tage, alle Seiten, normalisiert gespeichert', async () => {
    const { d, db, calls } = deps(api())
    await db.saveTokens('u1', { accessToken: 'at1', refreshToken: 'rt1', expiresAt: '2026-10-10T10:00:00Z' })
    const r = await syncWhoop(d, 'u1')
    expect(r.counts).toEqual({ cycles: 2, recoveries: 1, sleeps: 1, workouts: 0 })
    expect(r.since).toBe('2026-07-12T08:00:00.000Z')
    expect(calls.find((c) => c.url.includes('/v2/cycle'))!.url).toContain('limit=25')
    expect(db.rows.get('whoop_recoveries/u1/1')!.data).toMatchObject({ score: 61, sleepId: 'a1b2c3' })
    expect(db.rows.get('whoop_sleeps/u1/a1b2c3')!.data).toMatchObject({ asleepMin: 330 })
    expect(db.status.get('u1')).toMatchObject({ lastSyncAt: '2026-10-10T08:00:00.000Z', lastError: null })
  })

  it('Folgeabruf: seit letztem Abruf minus 2 Tage; innerhalb von 5 min übersprungen', async () => {
    const { d, db } = deps(api())
    await db.saveTokens('u1', { accessToken: 'at1', refreshToken: 'rt1', expiresAt: '2026-10-10T10:00:00Z' })
    await db.saveStatus('u1', { connected: true, lastSyncAt: '2026-10-10T07:58:00Z' })
    expect((await syncWhoop(d, 'u1')).skipped).toBe(true)
    await db.saveStatus('u1', { connected: true, lastSyncAt: '2026-10-09T08:00:00Z' })
    expect((await syncWhoop(d, 'u1')).since).toBe('2026-10-07T08:00:00.000Z')
  })

  it('401 → Token erneuern und wiederholen; 429 → Retry-After', async () => {
    const { d, db } = deps(api({ failFirst401: true, rateLimitOnce: true }))
    await db.saveTokens('u1', { accessToken: 'at1', refreshToken: 'rt1', expiresAt: '2026-10-10T10:00:00Z' })
    const r = await syncWhoop(d, 'u1', { force: true })
    expect(r.counts.cycles).toBe(2)
    expect(db.tokens.get('u1')!.refreshToken).toBe('rt-new')
  })

  it('Fehler werden im Status gespeichert', async () => {
    const { d, db } = deps(() => json({}, 403))
    await db.saveTokens('u1', { accessToken: 'at1', refreshToken: 'rt1', expiresAt: '2026-10-10T10:00:00Z' })
    await expect(syncWhoop(d, 'u1', { force: true })).rejects.toThrow('403')
    expect(db.status.get('u1')!.lastError).toContain('403')
  })

  it('nicht verbunden', async () => {
    const { d } = deps(() => json({}))
    await expect(syncWhoop(d, 'u1', { force: true })).rejects.toThrow('nicht verbunden')
  })

  it('Trennen löscht Tokens und widerruft den Zugriff', async () => {
    const { d, db, calls } = deps(() => new Response(null, { status: 204 }))
    await db.saveTokens('u1', { accessToken: 'at1', refreshToken: 'rt1', expiresAt: '2026-10-10T10:00:00Z' })
    await disconnectWhoop(d, 'u1')
    expect(db.tokens.has('u1')).toBe(false)
    expect(db.status.get('u1')!.connected).toBe(false)
    expect(calls[0]!.init!.method).toBe('DELETE')
  })
})
