// WHOOP-Webhooks und täglicher Abruf für alle Nutzer (Phase 6).
// Signatur: Base64(HMAC-SHA256(Zeitstempel + Rohdaten, Client Secret)).

import { syncWhoop, type Deps, type WhoopTable } from './handlers.ts'

/** Webhooks mit älterem Zeitstempel werden abgelehnt (Schutz gegen Wiederholung). */
export const WEBHOOK_MAX_AGE_MS = 10 * 60 * 1000

export interface WebhookDb {
  findUserByWhoopId(whoopUserId: number): Promise<string | null>
  markDeleted(table: WhoopTable, userId: string, id: string): Promise<void>
  listConnectedUsers(): Promise<string[]>
}

function toBase64(buf: ArrayBuffer): string {
  let s = ''
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b)
  return btoa(s)
}

/** Vergleich in konstanter Zeit. */
export function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a)
  const eb = new TextEncoder().encode(b)
  let diff = ea.length ^ eb.length
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0)
  return diff === 0
}

export async function signWebhook(secret: string, timestamp: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return toBase64(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(timestamp + rawBody)))
}

export async function verifyWebhook(secret: string, headers: Headers, rawBody: string, now: Date): Promise<boolean> {
  const signature = headers.get('X-WHOOP-Signature')
  const timestamp = headers.get('X-WHOOP-Signature-Timestamp')
  if (!signature || !timestamp) return false
  // Millisekunden seit 1970; zur Sicherheit auch Sekunden akzeptieren
  const n = Number(timestamp)
  const ts = n < 1e12 ? n * 1000 : n
  if (!Number.isFinite(ts) || Math.abs(now.getTime() - ts) > WEBHOOK_MAX_AGE_MS) return false
  return timingSafeEqual(await signWebhook(secret, timestamp, rawBody), signature)
}

export interface WebhookEvent {
  user_id: number
  id: string | number
  type: string
  trace_id?: string
}

const DELETE_TABLE: Record<string, WhoopTable> = {
  'recovery.deleted': 'whoop_recoveries',
  'sleep.deleted': 'whoop_sleeps',
  'workout.deleted': 'whoop_workouts',
}

export interface WebhookResult {
  status: number
  action: 'ignored' | 'synced' | 'deleted' | 'rejected' | 'error'
  message?: string
}

/**
 * Webhook verarbeiten. Bei Aktualisierungen wird inkrementell abgerufen (robust und idempotent),
 * Löschungen markieren die Zeile. Fehler beim Abruf → trotzdem 200 (Fehler steht im Status).
 */
export async function handleWebhook(deps: Deps & { webhookDb: WebhookDb }, headers: Headers, rawBody: string): Promise<WebhookResult> {
  if (!(await verifyWebhook(deps.env.clientSecret, headers, rawBody, deps.now()))) return { status: 401, action: 'rejected' }
  let ev: WebhookEvent
  try {
    ev = JSON.parse(rawBody) as WebhookEvent
  } catch {
    return { status: 400, action: 'rejected', message: 'kein JSON' }
  }
  const userId = await deps.webhookDb.findUserByWhoopId(Number(ev.user_id))
  if (!userId) return { status: 200, action: 'ignored', message: 'unbekannter WHOOP-Nutzer' }
  const del = DELETE_TABLE[ev.type]
  if (del) {
    // Recovery ist bei uns unter der Zyklus-ID gespeichert; die Löschung eines Schlafs zieht beim nächsten Abruf nach.
    await deps.webhookDb.markDeleted(del, userId, String(ev.id))
    return { status: 200, action: 'deleted' }
  }
  if (!/\.updated$/.test(ev.type)) return { status: 200, action: 'ignored', message: `Typ ${ev.type}` }
  try {
    await syncWhoop(deps, userId, { force: true })
    return { status: 200, action: 'synced' }
  } catch (e) {
    return { status: 200, action: 'error', message: e instanceof Error ? e.message : String(e) }
  }
}

/** Täglicher Abruf für alle verbundenen Nutzer; ein Fehler bricht die anderen nicht ab. */
export async function syncAll(deps: Deps & { webhookDb: WebhookDb }, cronSecret: string, providedSecret: string | null): Promise<{ status: number; results: Record<string, string> }> {
  if (!providedSecret || !timingSafeEqual(cronSecret, providedSecret)) return { status: 401, results: {} }
  const results: Record<string, string> = {}
  for (const userId of await deps.webhookDb.listConnectedUsers()) {
    try {
      const r = await syncWhoop(deps, userId, { force: true })
      results[userId] = `ok (${Object.values(r.counts).reduce((a, b) => a + b, 0)} Datensätze)`
    } catch (e) {
      results[userId] = `Fehler: ${e instanceof Error ? e.message : String(e)}`
    }
  }
  return { status: 200, results }
}
