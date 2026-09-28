// Täglicher Abruf für alle verbundenen Nutzer (pg_cron → pg_net). Nur mit X-Cron-Secret.
import { syncAll } from '../_shared/webhook.ts'
import { makeDeps } from '../_shared/runtime.ts'

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET')
  if (!secret) return new Response('CRON_SECRET fehlt', { status: 500 })
  const r = await syncAll(makeDeps(), secret, req.headers.get('X-Cron-Secret'))
  return new Response(JSON.stringify(r.results), { status: r.status, headers: { 'Content-Type': 'application/json' } })
})
