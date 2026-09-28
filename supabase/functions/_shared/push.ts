// Versand der Push-Erinnerungen (Phase 7). Reine Logik mit eingesetzten Abhängigkeiten, testbar ohne Deno.
import { timingSafeEqual } from './webhook.ts'

export interface DueReminder {
  userId: string
  id: string
  dueAt: string
  title: string
  body: string
}

export interface PushSubscriptionRow {
  userId: string
  endpoint: string
  p256dh: string
  auth: string
}

export interface PushDb {
  /** Fällige, noch nicht gesendete Erinnerungen mit due_at in (from, to]. */
  listDue(fromIso: string, toIso: string): Promise<DueReminder[]>
  listSubscriptions(userIds: string[]): Promise<PushSubscriptionRow[]>
  markSent(r: DueReminder): Promise<void>
  deleteSubscription(userId: string, endpoint: string): Promise<void>
}

export interface PushDeps {
  db: PushDb
  /** Sendet eine Nachricht, liefert den HTTP-Status des Push-Dienstes. */
  send(sub: PushSubscriptionRow, payload: string): Promise<number>
  now(): Date
}

/** Höchstens so viele Minuten verspätet senden, ältere Erinnerungen verfallen. */
export const MAX_LATE_MIN = 15

export interface PushResult {
  sent: number
  failed: number
  removedSubscriptions: number
  withoutSubscription: number
}

export async function sendDueReminders(deps: PushDeps): Promise<PushResult> {
  const now = deps.now()
  const from = new Date(now.getTime() - MAX_LATE_MIN * 60_000).toISOString()
  const due = await deps.db.listDue(from, now.toISOString())
  const result: PushResult = { sent: 0, failed: 0, removedSubscriptions: 0, withoutSubscription: 0 }
  if (due.length === 0) return result
  const subs = await deps.db.listSubscriptions([...new Set(due.map((d) => d.userId))])
  const removed = new Set<string>()
  for (const r of due) {
    const mine = subs.filter((s) => s.userId === r.userId && !removed.has(s.endpoint))
    if (mine.length === 0) {
      result.withoutSubscription++
      continue
    }
    const payload = JSON.stringify({ title: r.title, body: r.body, tag: r.id, url: '/' })
    let ok = false
    for (const s of mine) {
      try {
        const status = await deps.send(s, payload)
        if (status === 404 || status === 410) {
          // Abo abgelaufen oder vom Nutzer entfernt
          await deps.db.deleteSubscription(s.userId, s.endpoint)
          removed.add(s.endpoint)
          result.removedSubscriptions++
        } else if (status >= 200 && status < 300) ok = true
      } catch (e) {
        console.error('Push fehlgeschlagen', e)
      }
    }
    if (ok) {
      await deps.db.markSent(r)
      result.sent++
    } else result.failed++
  }
  return result
}

export async function handlePushSend(deps: PushDeps, cronSecret: string, provided: string | null): Promise<{ status: number; body: unknown }> {
  if (!provided || !timingSafeEqual(cronSecret, provided)) return { status: 401, body: { error: 'Nicht erlaubt' } }
  return { status: 200, body: await sendDueReminders(deps) }
}
