// Gemeinsame Laufzeit-Helfer der Edge Functions (Deno): CORS, Antworten, Anmeldung, Abhängigkeiten.
import type { Deps } from './handlers.ts'
import { SupabaseDb, serviceClient } from './supabaseDb.ts'

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

function env(name: string): string {
  const v = Deno.env.get(name)
  if (!v) throw new Error(`Secret ${name} fehlt`)
  return v
}

export function makeDeps(): Deps & { webhookDb: SupabaseDb } {
  const db = new SupabaseDb(serviceClient())
  return {
    db,
    webhookDb: db,
    env: { clientId: env('WHOOP_CLIENT_ID'), clientSecret: env('WHOOP_CLIENT_SECRET'), redirectUri: env('WHOOP_REDIRECT_URI'), appUrl: env('APP_URL') },
    fetch: (u, init) => fetch(u, init),
    now: () => new Date(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    randomState: () => {
      const b = new Uint8Array(24)
      crypto.getRandomValues(b)
      return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
    },
  }
}

/** Angemeldeten Nutzer aus dem Authorization-Header (Supabase-JWT) bestimmen. */
export async function requireUser(req: Request): Promise<string> {
  const auth = req.headers.get('Authorization') ?? ''
  const jwt = auth.replace(/^Bearer\s+/i, '')
  if (!jwt) throw new Response('Nicht angemeldet', { status: 401, headers: cors })
  const { data, error } = await serviceClient().auth.getUser(jwt)
  if (error || !data.user) throw new Response('Nicht angemeldet', { status: 401, headers: cors })
  return data.user.id
}

/** Wrapper: CORS-Preflight, Fehler als JSON. */
export function serve(handler: (req: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
    try {
      return await handler(req)
    } catch (e) {
      if (e instanceof Response) return e
      console.error(e)
      return json({ error: e instanceof Error ? e.message : String(e) }, 500)
    }
  })
}
