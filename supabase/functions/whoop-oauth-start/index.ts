// Startet die WHOOP-Verbindung: liefert die Autorisierungs-URL (angemeldeter Nutzer).
import { startOAuth } from '../_shared/handlers.ts'
import { json, makeDeps, requireUser, serve } from '../_shared/runtime.ts'

serve(async (req) => {
  const userId = await requireUser(req)
  return json(await startOAuth(makeDeps(), userId))
})
