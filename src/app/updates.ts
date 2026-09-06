import { registerSW } from 'virtual:pwa-register';

/**
 * Service-worker update handling.
 *
 * Two situations, two behaviours:
 *
 * 1. **Cold start.** The app was just opened — from the home screen, after
 *    being closed, in the morning. Nothing is entered, nothing can be lost, and
 *    the athlete's expectation is simply that a freshly opened app is current.
 *    A pending version is applied immediately, without asking.
 *
 * 2. **Mid-session.** A version appears while the app is already in use,
 *    possibly with a half-filled check-in on screen. Reloading would throw that
 *    away, so this case shows a banner and lets the tap decide.
 *
 * The registration is polled once an hour, when the app returns to the
 * foreground, when a connection comes back, and shortly after start — an app
 * on a phone can sit in the background for days without noticing anything.
 */

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
/**
 * How long after start an update still counts as part of the cold start.
 * The post-start check runs after 1.5 s, so ten seconds covers it comfortably
 * while keeping anything later — where the athlete is already using the app —
 * in the "ask first" case.
 */
const COLD_START_WINDOW_MS = 10_000;

export interface UpdateController {
  /** Applies the waiting version and reloads the page. */
  apply: () => Promise<void>;
  /** Forces an immediate check, e.g. from a button in Settings. */
  check: () => Promise<void>;
}

const AUTO_APPLY_KEY = 'ha:auto-applied-at';

/**
 * Guards against a reload loop. If applying an update did not actually take —
 * the worker failed to activate, the server kept serving the old files — then
 * without this the app would reload on every single launch.
 */
function recentlyAutoApplied(): boolean {
  try {
    const last = Number(sessionStorage.getItem(AUTO_APPLY_KEY) ?? '0');
    return Date.now() - last < 60_000;
  } catch {
    return false;
  }
}

function markAutoApplied(): void {
  try {
    sessionStorage.setItem(AUTO_APPLY_KEY, String(Date.now()));
  } catch {
    // Storage blocked; the worst case is one extra reload.
  }
}

/**
 * Last resort when an install is stuck on an old version: drop every cache and
 * service worker, then reload from the network.
 *
 * IndexedDB is deliberately untouched — training data, habits and check-ins all
 * live there and must survive this.
 */
export async function forceRefresh(): Promise<void> {
  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    const registrations = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    await Promise.all(registrations.map((r) => r.unregister()));
  } catch {
    // Even a partial cleanup is worth reloading after.
  }
  window.location.reload();
}

export function initUpdates(onUpdateAvailable: () => void): UpdateController {
  let registration: ServiceWorkerRegistration | undefined;
  const startedAt = Date.now();
  let applied = false;

  const isColdStart = () => Date.now() - startedAt < COLD_START_WINDOW_MS;

  const updateSW = registerSW({
    onNeedRefresh() {
      if (isColdStart() && !applied && !recentlyAutoApplied()) {
        applied = true;
        markAutoApplied();
        void updateSW(true);
        return;
      }
      onUpdateAvailable();
    },
    onRegisteredSW(_swUrl, reg) {
      registration = reg;
      if (!reg) return;

      /*
       * A version discovered in an earlier session sits in `waiting` after a
       * restart, and the browser does not fire `updatefound` again for it. So
       * it has to be picked up explicitly — otherwise closing and reopening the
       * app would never bring it in, which is exactly what a user expects it to
       * do.
       */
      const handleWaiting = () => {
        if (!reg.waiting || !navigator.serviceWorker.controller) return;
        if (isColdStart() && !applied && !recentlyAutoApplied()) {
          applied = true;
          markAutoApplied();
          void updateSW(true);
          return;
        }
        onUpdateAvailable();
      };
      handleWaiting();

      const check = () => {
        if (document.visibilityState !== 'visible') return;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
        void reg
          .update()
          .then(handleWaiting)
          .catch(() => {
            // A failed check is not worth surfacing; the next one will retry.
          });
      };

      window.setInterval(check, CHECK_INTERVAL_MS);
      document.addEventListener('visibilitychange', check);
      window.addEventListener('online', check);
      // Check shortly after start, so a version deployed overnight is found
      // while the cold-start window is still open and applies without a tap.
      window.setTimeout(check, 1_500);
    },
  });

  return {
    apply: () => updateSW(true),
    check: async () => {
      await registration?.update();
    },
  };
}
