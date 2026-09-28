// Trennt die WHOOP-Verbindung (Zugriff widerrufen, Tokens löschen).
import { disconnectWhoop } from '../_shared/handlers.ts'
import { json, makeDeps, requireUser, serve } from '../_shared/runtime.ts'

serve(async (req) => {
  const userId = await requireUser(req)
  await disconnectWhoop(makeDeps(), userId)
  return json({ ok: true })
})
