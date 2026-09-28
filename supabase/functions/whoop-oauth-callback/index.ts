// OAuth-Callback von WHOOP (öffentlich erreichbar, ohne Supabase-JWT; abgesichert über den einmaligen State).
import { handleCallback } from '../_shared/handlers.ts'
import { makeDeps } from '../_shared/runtime.ts'

Deno.serve(async (req) => {
  const location = await handleCallback(makeDeps(), new URL(req.url).searchParams)
  return new Response(null, { status: 302, headers: { Location: location } })
})
