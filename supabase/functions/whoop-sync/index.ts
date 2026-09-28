// Holt neue WHOOP-Daten (beim Öffnen der App und per Button).
import { syncWhoop } from '../_shared/handlers.ts'
import { json, makeDeps, requireUser, serve } from '../_shared/runtime.ts'

serve(async (req) => {
  const userId = await requireUser(req)
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
  return json(await syncWhoop(makeDeps(), userId, { force: body?.force === true }))
})
