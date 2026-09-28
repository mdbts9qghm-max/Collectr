// Datenbank-Anbindung für push-send (Service Role, nur serverseitig).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { DueReminder, PushDb, PushSubscriptionRow } from './push.ts'

function check(error: { message: string } | null, what: string) {
  if (error) throw new Error(`${what}: ${error.message}`)
}

export class SupabasePushDb implements PushDb {
  private sb: SupabaseClient
  constructor(sb: SupabaseClient) {
    this.sb = sb
  }

  async listDue(fromIso: string, toIso: string): Promise<DueReminder[]> {
    const { data, error } = await this.sb.from('push_reminders').select('user_id, id, due_at, title, body').gt('due_at', fromIso).lte('due_at', toIso)
    check(error, 'Erinnerungen lesen')
    const rows = (data ?? []).map((r) => ({ userId: r.user_id as string, id: r.id as string, dueAt: new Date(r.due_at as string).toISOString(), title: r.title as string, body: r.body as string }))
    if (rows.length === 0) return []
    const { data: sent, error: e2 } = await this.sb.from('push_sent').select('user_id, reminder_id, due_at').gt('due_at', fromIso).lte('due_at', toIso)
    check(e2, 'Versandprotokoll lesen')
    const done = new Set((sent ?? []).map((s) => `${s.user_id}/${s.reminder_id}/${new Date(s.due_at as string).toISOString()}`))
    return rows.filter((r) => !done.has(`${r.userId}/${r.id}/${r.dueAt}`))
  }

  async listSubscriptions(userIds: string[]): Promise<PushSubscriptionRow[]> {
    const { data, error } = await this.sb.from('push_subscriptions').select('user_id, endpoint, p256dh, auth').in('user_id', userIds)
    check(error, 'Abos lesen')
    return (data ?? []).map((s) => ({ userId: s.user_id as string, endpoint: s.endpoint as string, p256dh: s.p256dh as string, auth: s.auth as string }))
  }

  async markSent(r: DueReminder): Promise<void> {
    const { error } = await this.sb.from('push_sent').upsert({ user_id: r.userId, reminder_id: r.id, due_at: r.dueAt })
    check(error, 'Versand vermerken')
  }

  async deleteSubscription(userId: string, endpoint: string): Promise<void> {
    const { error } = await this.sb.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', endpoint)
    check(error, 'Abo löschen')
  }
}
