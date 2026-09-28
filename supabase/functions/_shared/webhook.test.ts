import { describe, expect, it } from 'vitest'
import type { DataRow, Db, Deps, StoredTokens, WhoopStatus, WhoopTable } from './handlers.ts'
import { handleWebhook, signWebhook, syncAll, timingSafeEqual, verifyWebhook, type WebhookDb } from './webhook.ts'

const NOW = new Date('2026-10-04T12:05:00Z')

class FakeDb implements Db, WebhookDb {
  tokens = new Map<string, StoredTokens>()
  rows = new Map<string, DataRow & { deleted?: boolean }>()
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
  async createState() {}
  async consumeState() {
    return null
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
  async findUserByWhoopId(id: number) {
    for (const [u, t] of this.tokens) if (t.whoopUserId === id) return u
    return null
  }
  async markDeleted(t: WhoopTable, u: string, id: string) {
    const r = this.rows.get(`${t}/${u}/${id}`)
    if (r) r.deleted = true
  }
  async listConnectedUsers() {
    return [...this.tokens.keys()]
  }
}

function deps(failFor?: string) {
  const db = new FakeDb()
  let calls = 0
  const d: Deps & { webhookDb: WebhookDb } = {
    db,
    webhookDb: db,
    env: { clientId: 'cid', clientSecret: 'whoop-secret', redirectUri: 'x', appUrl: 'y' },
    fetch: async (u, init) => {
      calls++
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization ?? ''
      if (failFor && auth === `Bearer ${failFor}`) return new Response('{}', { status: 500 })
      if (u.includes('/v2/recovery')) return Response.json({ records: [{ cycle_id: 7, sleep_id: 's', score_state: 'SCORED', score: { recovery_score: 55 } }] })
      if (u.includes('/measurement/body')) return Response.json({})
      return Response.json({ records: [] })
    },
    now: () => NOW,
    sleep: async () => undefined,
    randomState: () => 'xxxxxxxxxx',
  }
  return { d, db, calls: () => calls }
}

async function signed(body: unknown, secret = 'whoop-secret', ts = String(NOW.getTime())) {
  const raw = JSON.stringify(body)
  const h = new Headers({ 'X-WHOOP-Signature-Timestamp': ts, 'X-WHOOP-Signature': await signWebhook(secret, ts, raw) })
  return { raw, h }
}

describe('Webhook-Signatur', () => {
  it('gültig, falsches Secret, manipuliert, zu alt, fehlend', async () => {
    const { raw, h } = await signed({ user_id: 1, id: 'a', type: 'sleep.updated' })
    expect(await verifyWebhook('whoop-secret', h, raw, NOW)).toBe(true)
    expect(await verifyWebhook('anderes', h, raw, NOW)).toBe(false)
    expect(await verifyWebhook('whoop-secret', h, raw.replace('sleep', 'workout'), NOW)).toBe(false)
    const old = await signed({ user_id: 1 }, 'whoop-secret', String(NOW.getTime() - 11 * 60 * 1000))
    expect(await verifyWebhook('whoop-secret', old.h, old.raw, NOW)).toBe(false)
    expect(await verifyWebhook('whoop-secret', new Headers(), raw, NOW)).toBe(false)
    const secs = await signed({ user_id: 1 }, 'whoop-secret', String(Math.floor(NOW.getTime() / 1000)))
    expect(await verifyWebhook('whoop-secret', secs.h, secs.raw, NOW)).toBe(true)
  })

  it('Vergleich in konstanter Zeit', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true)
    expect(timingSafeEqual('abc', 'abd')).toBe(false)
    expect(timingSafeEqual('abc', 'abcd')).toBe(false)
  })
})

describe('Webhook-Verarbeitung', () => {
  it('recovery.updated → Abruf für den zugehörigen Nutzer', async () => {
    const { d, db } = deps()
    await db.saveTokens('u1', { accessToken: 'at', refreshToken: 'rt', expiresAt: '2026-10-04T14:00:00Z', whoopUserId: 10129 })
    const { raw, h } = await signed({ user_id: 10129, id: 's-uuid', type: 'recovery.updated', trace_id: 't' })
    const r = await handleWebhook(d, h, raw)
    expect(r).toMatchObject({ status: 200, action: 'synced' })
    expect(db.rows.get('whoop_recoveries/u1/7')!.data).toMatchObject({ score: 55 })
    expect(db.status.get('u1')!.lastSyncAt).toBe(NOW.toISOString())
  })

  it('ungültige Signatur → 401, unbekannter Nutzer → 200 ohne Aktion', async () => {
    const { d, calls } = deps()
    const bad = await signed({ user_id: 1, id: 'a', type: 'sleep.updated' }, 'falsch')
    expect((await handleWebhook(d, bad.h, bad.raw)).status).toBe(401)
    const unknown = await signed({ user_id: 999, id: 'a', type: 'sleep.updated' })
    expect(await handleWebhook(d, unknown.h, unknown.raw)).toMatchObject({ status: 200, action: 'ignored' })
    expect(calls()).toBe(0)
  })

  it('workout.deleted markiert die Zeile als gelöscht', async () => {
    const { d, db } = deps()
    await db.saveTokens('u1', { accessToken: 'at', refreshToken: 'rt', expiresAt: '2026-10-04T14:00:00Z', whoopUserId: 5 })
    await db.upsertRows('whoop_workouts', 'u1', [{ id: 'w1', data: {}, raw: {} }])
    const { raw, h } = await signed({ user_id: 5, id: 'w1', type: 'workout.deleted' })
    expect((await handleWebhook(d, h, raw)).action).toBe('deleted')
    expect(db.rows.get('whoop_workouts/u1/w1')!.deleted).toBe(true)
  })

  it('Fehler beim Abruf → 200, Fehler im Status', async () => {
    const { d, db } = deps('at')
    await db.saveTokens('u1', { accessToken: 'at', refreshToken: 'rt', expiresAt: '2026-10-04T14:00:00Z', whoopUserId: 5 })
    const { raw, h } = await signed({ user_id: 5, id: 'x', type: 'sleep.updated' })
    const r = await handleWebhook(d, h, raw)
    expect(r).toMatchObject({ status: 200, action: 'error' })
    expect(db.status.get('u1')!.lastError).toContain('500')
  })
})

describe('Täglicher Abruf', () => {
  it('nur mit Secret; alle Nutzer, ein Fehler bricht die anderen nicht ab', async () => {
    const { d, db } = deps('kaputt')
    await db.saveTokens('u1', { accessToken: 'ok', refreshToken: 'rt', expiresAt: '2026-10-04T14:00:00Z' })
    await db.saveTokens('u2', { accessToken: 'kaputt', refreshToken: 'rt', expiresAt: '2026-10-04T14:00:00Z' })
    expect((await syncAll(d, 'cron', null)).status).toBe(401)
    expect((await syncAll(d, 'cron', 'falsch')).status).toBe(401)
    const r = await syncAll(d, 'cron', 'cron')
    expect(r.status).toBe(200)
    expect(r.results.u1).toMatch(/^ok/)
    expect(r.results.u2).toMatch(/^Fehler/)
  })
})
