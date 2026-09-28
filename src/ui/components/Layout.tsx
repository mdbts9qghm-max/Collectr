import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { useApp } from '../../app/AppState'
import { useCloud } from '../../app/cloud'
import { PushSync } from '../../app/PushSync'
import { formatDateDE, weekdayShortDE } from '../../core/time'
import { Disclaimer } from './common'

// 4 Reiter: Plan fasst Zyklus + Gesamtplan zusammen, Training fasst Kraft + Tracking zusammen.
const TABS = [
  { to: '/', label: 'Heute', paths: ['/'], icon: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-8.5Z' },
  { to: '/zyklus', label: 'Plan', paths: ['/zyklus', '/plan'], icon: 'M7 3v2M17 3v2M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm3 7h3v3H8z' },
  { to: '/erholung', label: 'Erholung', paths: ['/erholung'], icon: 'M3 12h4l2-5 4 10 2-5h6' },
  { to: '/kraft', label: 'Training', paths: ['/kraft', '/tracking'], icon: 'M4 9v6M8 7v10M16 7v10M20 9v6M8 12h8' },
]

function SyncBadge() {
  const cloud = useCloud()
  if (!cloud) return null
  const { state, pending } = cloud.status
  const label =
    state === 'syncing' ? 'Synchronisiere …' : state === 'offline' ? `Offline${pending ? ` · ${pending} ausstehend` : ''}` : state === 'error' ? 'Sync-Fehler' : pending ? `${pending} ausstehend` : 'Synchron'
  const color = state === 'error' ? 'text-red' : state === 'offline' || pending ? 'text-yellow' : 'text-accent'
  return (
    <button onClick={() => void cloud.syncNow()} className={`ml-auto mr-2 text-xs ${color}`} aria-label={`Synchronisation: ${label}`} data-testid="sync-badge">
      {state === 'syncing' ? '↻' : '●'} {label}
    </button>
  )
}

export function Layout() {
  const { today, data } = useApp()
  const { pathname } = useLocation()
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <PushSync />
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-bg/95 px-4 py-3 backdrop-blur" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Collectr</div>
          <div className="text-base font-semibold">
            {weekdayShortDE(today)}, {formatDateDE(today)}
          </div>
          {(data.settings.simulatedDate || data.settings.demoMode) && (
            <div className="flex gap-1 text-[11px]">
              {data.settings.simulatedDate && <span className="rounded-full bg-yellow/15 px-2 text-yellow">simuliert</span>}
              {data.settings.demoMode && <span className="rounded-full bg-accent/15 px-2 text-accent">Demo</span>}
            </div>
          )}
        </div>
        <SyncBadge />
        <NavLink to="/einstellungen" aria-label="Einstellungen" className="grid h-11 w-11 place-items-center rounded-xl bg-panel text-lg">
          ⚙
        </NavLink>
      </header>
      <main className="flex-1 space-y-4 px-4 py-4">
        <Outlet />
        <footer className="pt-4 pb-2">
          <Disclaimer />
        </footer>
      </main>
      <nav
        className="sticky bottom-0 z-10 grid grid-cols-4 border-t border-line bg-bg/95 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Hauptnavigation"
      >
        {TABS.map((t) => {
          const active = t.paths.includes(pathname)
          return (
            <Link
              key={t.to}
              to={t.to}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] ${active ? 'text-accent' : 'text-muted'}`}
            >
              <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d={t.icon} />
              </svg>
              {t.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
