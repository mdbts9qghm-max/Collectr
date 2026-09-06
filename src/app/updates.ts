import { registerSW } from 'virtual:pwa-register';

/**
 * Service-worker update handling.
 *
 * Deploys happen continuously, but an app installed on a phone can sit in the
 * background for days without ever noticing. So the registration is polled:
 * once an hour, and whenever the app returns to the foreground or regains a
 * connection — which is the moment that actually matters, because that is when
 * the athlete opens it in the morning.
 *
 * The reload itself is never automatic. Losing a half-entered check-in to a
 * silent refresh would be worse than running yesterday's version for an hour.
 */

const CHECK_INTERVAL_MS = 60 * 60 * 1000;

export interface UpdateController {
  /** Applies the waiting version and reloads the page. */
  apply: () => Promise<void>;
  /** Forces an immediate check, e.g. from a button in Settings. */
  check: () => Promise<void>;
}

export function initUpdates(onUpdateAvailable: () => void): UpdateController {
  let registration: ServiceWorkerRegistration | undefined;

  const updateSW = registerSW({
    onNeedRefresh: onUpdateAvailable,
    onRegisteredSW(_swUrl, reg) {
      registration = reg;
      if (!reg) return;

      /*
       * A version discovered in an earlier session is still sitting in
       * `waiting` after a restart, and the browser does not fire `updatefound`
       * a second time for it. Without this check, dismissing the banner once
       * would hide that update forever.
       */
      const notifyIfWaiting = () => {
        if (reg.waiting && navigator.serviceWorker.controller) onUpdateAvailable();
      };
      notifyIfWaiting();

      const check = () => {
        if (document.visibilityState !== 'visible') return;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
        void reg
          .update()
          .then(notifyIfWaiting)
          .catch(() => {
            // A failed check is not worth surfacing; the next one will retry.
          });
      };

      window.setInterval(check, CHECK_INTERVAL_MS);
      document.addEventListener('visibilitychange', check);
      window.addEventListener('online', check);
      // One check shortly after start, so a version deployed overnight is
      // found before the athlete has finished the morning check-in.
      window.setTimeout(check, 5_000);
    },
  });

  return {
    apply: () => updateSW(true),
    check: async () => {
      await registration?.update();
    },
  };
}
