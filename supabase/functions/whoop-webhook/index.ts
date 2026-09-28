// WHOOP-Webhook (recovery/sleep/workout.updated|deleted). Ohne Supabase-JWT, abgesichert über die Signatur.
import { handleWebhook } from '../_shared/webhook.ts'
import { makeDeps } from '../_shared/runtime.ts'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Nur POST', { status: 405 })
  const raw = await req.text()
  const r = await handleWebhook(makeDeps(), req.headers, raw)
  if (r.action === 'error') console.error('WHOOP-Webhook:', r.message)
  return new Response(JSON.stringify(r), { status: r.status, headers: { 'Content-Type': 'application/json' } })
})
