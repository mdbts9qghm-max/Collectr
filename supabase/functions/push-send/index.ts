// Verschickt fällige Erinnerungen (pg_cron alle 5 min → pg_net). Nur mit X-Cron-Secret.
import webpush from 'npm:web-push@3'
import { handlePushSend } from '../_shared/push.ts'
import { SupabasePushDb } from '../_shared/pushDb.ts'
import { serviceClient } from '../_shared/supabaseDb.ts'

function env(name: string): string {
  const v = Deno.env.get(name)
  if (!v) throw new Error(`Secret ${name} fehlt`)
  return v
}

Deno.serve(async (req) => {
  try {
    webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'))
    const r = await handlePushSend(
      {
        db: new SupabasePushDb(serviceClient()),
        now: () => new Date(),
        send: async (sub, payload) => {
          try {
            const res = await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 15 * 60, urgency: 'high' })
            return res.statusCode
          } catch (e) {
            const status = (e as { statusCode?: number }).statusCode
            if (typeof status === 'number') return status
            throw e
          }
        },
      },
      env('CRON_SECRET'),
      req.headers.get('X-Cron-Secret'),
    )
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    console.error(e)
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
