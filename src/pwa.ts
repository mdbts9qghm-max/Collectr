// Registrierung des Service Workers und Hinweis „Neue Version verfügbar“ (Phase 7).

import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'

let needRefresh = false
let offlineReady = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
let update: ((reload?: boolean) => Promise<void>) | null = null

export function initPwa(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return
  update = registerSW({
    immediate: true,
    onNeedRefresh() {
      needRefresh = true
      emit()
    },
    onOfflineReady() {
      offlineReady = true
      emit()
    },
    onRegisteredSW(_url, reg) {
      // Stündlich nach einer neuen Version sehen (die App bleibt auf dem Handy oft lange offen)
      if (reg) setInterval(() => void reg.update(), 60 * 60 * 1000)
    },
  })
}

export function applyUpdate(): void {
  void update?.(true)
}

export function dismissUpdate(): void {
  needRefresh = false
  offlineReady = false
  emit()
}

let snapshot = { needRefresh, offlineReady }
export function usePwaStatus() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => {
      if (snapshot.needRefresh !== needRefresh || snapshot.offlineReady !== offlineReady) snapshot = { needRefresh, offlineReady }
      return snapshot
    },
  )
}
