// Web-Push im Browser (Phase 7): Abo anlegen/entfernen und geplante Erinnerungen hochladen.
// Der Versand passiert serverseitig (Edge Function push-send), der private VAPID-Key liegt nur dort.

import type { SupabaseClient } from '@supabase/supabase-js'
import { planReminders, recommendSleep, type PushReminder } from '../core/sleep'
import { addDays } from '../core/time'
import type { LocalDate, Plan, SleepRecommendation } from '../core/types'
import { CONFIG } from '../core/config'
import type { ShiftCalendar } from '../core/shift'

export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** iPhone/iPad: Push nur in der installierten App (Home-Bildschirm). */
export function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Service Worker nicht aktiv. Bitte die App neu laden.')), 10_000))
  return Promise.race([navigator.serviceWorker.ready, timeout])
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

/** Erlaubnis holen, abonnieren und das Abo in Supabase speichern. Liefert eine Fehlermeldung oder null. */
export async function enablePush(sb: SupabaseClient): Promise<string | null> {
  if (!pushSupported()) return 'Dieser Browser unterstützt keine Push-Benachrichtigungen.'
  if (!VAPID_PUBLIC_KEY) return 'VITE_VAPID_PUBLIC_KEY fehlt (siehe docs/LIVEGANG.md).'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return 'Benachrichtigungen wurden nicht erlaubt. Du kannst sie in den Systemeinstellungen freigeben.'
  const reg = await registration()
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }))
  const json = sub.toJSON()
  const { error } = await sb.from('push_subscriptions').upsert(
    { endpoint: sub.endpoint, p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '', user_agent: navigator.userAgent.slice(0, 200) },
    { onConflict: 'user_id,endpoint' },
  )
  return error ? `Abo konnte nicht gespeichert werden: ${error.message}` : null
}

export async function disablePush(sb: SupabaseClient): Promise<string | null> {
  const sub = await currentSubscription()
  if (!sub) return null
  const { error } = await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
  return error ? `Abo konnte nicht gelöscht werden: ${error.message}` : null
}

/** Schlafempfehlungen der nächsten Tage (heute mit WHOOP-Bedarf aus der Tagesansicht). */
export function upcomingReminders(cal: ShiftCalendar, plan: Plan, today: LocalDate, todaySleep: SleepRecommendation, now: number): PushReminder[] {
  const recs = [todaySleep]
  for (let i = 1; i < CONFIG.sleep.reminderDays; i++) recs.push(recommendSleep({ cal, date: addDays(today, i), plan }))
  return planReminders(recs, now)
}

export async function uploadReminders(sb: SupabaseClient, reminders: PushReminder[]): Promise<void> {
  const items = reminders.map((r) => ({ id: r.id, due_at: r.dueAt, title: r.title, body: r.body }))
  const { error } = await sb.rpc('replace_push_reminders', { items })
  if (error) throw new Error(error.message)
}
