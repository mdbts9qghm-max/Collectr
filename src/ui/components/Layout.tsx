import { NavLink, Outlet } from 'react-router'
import { useApp } from '../../app/AppState'
import { useCloud } from '../../app/cloud'
import { formatDateDE, weekdayShortDE } from '../../core/time'
import { Disclaimer } from './common'

const TABS = [
  { to: '/', label: 'Heute', icon: '●' },
  { to: '/zyklus', label: 'Zyklus', icon: '◐' },
  { to: '/plan', label: 'Plan', icon: '▤' },
  { to: '/kraft', label: 'Kraft', icon: '▲' },
  { to: '/tracking', label: 'Tracking', icon: '✓' },
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
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-bg/95 px-4 py-3 backdrop-blur" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <div>
          <div className="text-base font-semibold">Collectr</div>
          <div className="text-xs text-muted">
            {weekdayShortDE(today)}, {formatDateDE(today)}
            {data.settings.simulatedDate && <span className="ml-2 text-yellow">(simuliert)</span>}
            {data.settings.demoMode && <span className="ml-2 text-accent">Demo</span>}
          </div>
        </div>
        <SyncBadge />
        <NavLink to="/einstellungen" aria-label="Einstellungen" className="grid h-11 w-11 place-items-center rounded-xl border border-line text-lg">
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
        className="sticky bottom-0 z-10 grid grid-cols-5 border-t border-line bg-bg/95 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Hauptnavigation"
      >
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === '/'}
            className={({ isActive }) => `flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${isActive ? 'text-accent' : 'text-muted'}`}
          >
            <span aria-hidden>{t.icon}</span>
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
