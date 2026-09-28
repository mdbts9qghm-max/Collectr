import { applyUpdate, dismissUpdate, usePwaStatus } from '../../pwa'

/** Hinweis auf eine neue Version (Neu laden erst nach Bestätigung). */
export function UpdatePrompt() {
  const { needRefresh } = usePwaStatus()
  if (!needRefresh) return null
  return (
    <div role="status" className="fixed inset-x-3 bottom-20 z-50 mx-auto flex max-w-xl items-center gap-3 rounded-2xl border border-accent bg-panel-2 p-3 text-sm shadow-lg" data-testid="update-prompt">
      <span className="flex-1">Neue Version verfügbar.</span>
      <button className="min-h-11 rounded-xl bg-accent px-3 font-semibold text-bg" onClick={applyUpdate}>
        Neu laden
      </button>
      <button className="min-h-11 px-2 text-muted" onClick={dismissUpdate} aria-label="Später">
        Später
      </button>
    </div>
  )
}
