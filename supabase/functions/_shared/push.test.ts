import { describe, expect, it } from 'vitest'
import { handlePushSend, sendDueReminders, type DueReminder, type PushDb, type PushSubscriptionRow } from './push.ts'

const NOW = new Date('2026-10-03T12:30:00Z')

class FakePushDb implements PushDb {
  reminders: DueReminder[] = []
  subs: PushSubscriptionRow[] = []
  sent: string[] = []
  async listDue(from: string, to: string) {
    return this.reminders.filter((r) => r.dueAt > from && r.dueAt <= to && !this.sent.includes(`${r.userId}/${r.id}/${r.dueAt}`))
  }
  async listSubscriptions(ids: string[]) {
    return this.subs.filter((s) => ids.includes(s.userId))
  }
  async markSent(r: DueReminder) {
    this.sent.push(`${r.userId}/${r.id}/${r.dueAt}`)
  }
  async deleteSubscription(u: string, e: string) {
    this.subs = this.subs.filter((s) => !(s.userId === u && s.endpoint === e))
  }
}

const rem = (id: string, dueAt: string, userId = 'u1'): DueReminder => ({ userId, id, dueAt, title: 'In 30 min Nap', body: 'Nap 15:00–16:45 Uhr.' })
const sub = (endpoint: string, userId = 'u1'): PushSubscriptionRow => ({ userId, endpoint, p256dh: 'p', auth: 'a' })

function setup(status: Record<string, number> = {}) {
  const db = new FakePushDb()
  const calls: { endpoint: string; payload: string }[] = []
  const deps = {
    db,
    now: () => NOW,
    send: async (s: PushSubscriptionRow, payload: string) => {
      calls.push({ endpoint: s.endpoint, payload })
      return status[s.endpoint] ?? 201
    },
  }
  return { db, calls, deps }
}

describe('push-send', () => {
  it('sendet fällige Erinnerungen an alle Geräte und vermerkt sie', async () => {
    const { db, calls, deps } = setup()
    db.reminders = [rem('2026-10-03-nap', '2026-10-03T12:30:00.000Z'), rem('2026-10-03-bed', '2026-10-03T20:00:00.000Z')]
    db.subs = [sub('https://push/a'), sub('https://push/b'), sub('https://push/x', 'u2')]
    const r = await sendDueReminders(deps)
    expect(r).toEqual({ sent: 1, failed: 0, removedSubscriptions: 0, withoutSubscription: 0 })
    expect(calls.map((c) => c.endpoint)).toEqual(['https://push/a', 'https://push/b'])
    expect(JSON.parse(calls[0]!.payload)).toEqual({ title: 'In 30 min Nap', body: 'Nap 15:00–16:45 Uhr.', tag: '2026-10-03-nap', url: '/' })
    // zweiter Lauf: nichts doppelt
    calls.length = 0
    expect((await sendDueReminders(deps)).sent).toBe(0)
    expect(calls).toEqual([])
  })

  it('bis 15 min verspätet senden, ältere verfallen', async () => {
    const { db, calls, deps } = setup()
    db.reminders = [rem('spät', '2026-10-03T12:16:00.000Z'), rem('verfallen', '2026-10-03T12:14:00.000Z')]
    db.subs = [sub('https://push/a')]
    await sendDueReminders(deps)
    expect(calls.map((c) => JSON.parse(c.payload).tag)).toEqual(['spät'])
  })

  it('abgelaufene Abos (404/410) werden gelöscht, Fehler nicht als gesendet vermerkt', async () => {
    const { db, deps } = setup({ 'https://push/alt': 410, 'https://push/kaputt': 500 })
    db.reminders = [rem('a', '2026-10-03T12:25:00.000Z')]
    db.subs = [sub('https://push/alt'), sub('https://push/kaputt')]
    const r = await sendDueReminders(deps)
    expect(r).toEqual({ sent: 0, failed: 1, removedSubscriptions: 1, withoutSubscription: 0 })
    expect(db.subs.map((s) => s.endpoint)).toEqual(['https://push/kaputt'])
    expect(db.sent).toEqual([])
  })

  it('verschobene Erinnerung (neue Fälligkeit) wird wieder gesendet', async () => {
    const { db, deps } = setup()
    db.subs = [sub('https://push/a')]
    db.sent = ['u1/x/2026-10-03T12:20:00.000Z']
    db.reminders = [rem('x', '2026-10-03T12:29:00.000Z')]
    expect((await sendDueReminders(deps)).sent).toBe(1)
  })

  it('ohne Abo wird nichts gesendet', async () => {
    const { db, deps } = setup()
    db.reminders = [rem('a', '2026-10-03T12:25:00.000Z')]
    expect(await sendDueReminders(deps)).toMatchObject({ sent: 0, withoutSubscription: 1 })
  })

  it('nur mit richtigem Cron-Secret', async () => {
    const { deps } = setup()
    expect((await handlePushSend(deps, 'geheim', null)).status).toBe(401)
    expect((await handlePushSend(deps, 'geheim', 'falsch')).status).toBe(401)
    expect((await handlePushSend(deps, 'geheim', 'geheim')).status).toBe(200)
  })
})
