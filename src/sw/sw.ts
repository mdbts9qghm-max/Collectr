// Service Worker (Phase 7): App-Hülle offline, Push-Erinnerungen anzeigen.
// Daten kommen offline aus IndexedDB, deshalb werden hier keine API-Aufrufe gecacht.

import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] }

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
// Alle Seiten der App (z. B. /zyklus) offline aus index.html
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))

// Neue Version erst nach Bestätigung in der App aktivieren
self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') void self.skipWaiting()
})
clientsClaim()

interface PushPayload {
  title?: string
  body?: string
  tag?: string
  url?: string
}

self.addEventListener('push', (event) => {
  let data: PushPayload = {}
  try {
    data = (event.data?.json() ?? {}) as PushPayload
  } catch {
    data = { body: event.data?.text() ?? '' }
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Collectr', {
      body: data.body ?? '',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      ...(data.tag ? { tag: data.tag } : {}),
      data: { url: data.url ?? '/' },
      lang: 'de',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | null)?.url ?? '/'
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = all[0]
      if (open) {
        await open.focus()
        if ('navigate' in open) await (open as WindowClient).navigate(url)
        return
      }
      await self.clients.openWindow(url)
    })(),
  )
})
