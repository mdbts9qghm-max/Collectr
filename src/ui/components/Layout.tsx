import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { useApp } from '../../app/AppState'
import { useCloud } from '../../app/cloud'
import { PushSync } from '../../app/PushSync'
import { formatDateDE, weekdayLongDE } from '../../core/time'
import { Disclaimer } from './common'

// 4 Reiter (Wunsch nach dem Livegang): Heute · Coach (Zyklus | Gesamtplan) · Schlaf & Erholung · Calisthenics (Skills, Tests, Tracking).
const TABS = [
  { to: '/', label: 'Heute', paths: ['/'], icon: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-8.5Z' },
  { to: '/zyklus', label: 'Coach', paths: ['/zyklus', '/plan'], icon: 'M7 3v2M17 3v2M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm3 7h3v3H8z' },
  { to: '/erholung', label: 'Schlaf & Erholung', paths: ['/erholung'], icon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z' },
  { to: '/kraft', label: 'Calisthenics', paths: ['/kraft', '/tracking'], icon: 'M4 9v6M8 7v10M16 7v10M20 9v6M8 12h8' },
]

/** Große Seitentitel im iOS-Stil (Nutzerwunsch: Design wie eine Apple-App). */
const TITLES: Record<string, string> = {
  '/': 'Heute',
  '/zyklus': 'Coach',
  '/plan': 'Coach',
  '/erholung': 'Schlaf & Erholung',
  '/kraft': 'Calisthenics',
  '/einstellungen': 'Einstellungen',
}

function SyncBadge() {
  const cloud = useCloud()
  if (!cloud) return null
  const { state, pending } = cloud.status
  const label =
    state === 'syncing' ? 'Synchronisiere …' : state === 'offline' ? `Offline${pending ? ` · ${pending} ausstehend` : ''}` : state === 'error' ? 'Sync-Fehler' : pending ? `${pending} ausstehend` : 'Synchron'
  const color = state === 'error' ? 'text-red' : state === 'offline' || pending ? 'text-yellow' : 'text-green'
  return (
    <button onClick={() => void cloud.syncNow()} className={`ml-auto mr-1 min-h-11 px-2 text-xs ${color}`} aria-label={`Synchronisation: ${label}`} data-testid="sync-badge">
      {state === 'syncing' ? '↻' : '●'} {label}
    </button>
  )
}

export function Layout() {
  const { today, data } = useApp()
  const cloud = useCloud()
  const { pathname } = useLocation()
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <PushSync />
      <header className="sticky top-0 z-10 flex min-h-11 items-center bg-bg/80 px-4 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        {(data.settings.simulatedDate || data.settings.demoMode) && (
          <div className="flex gap-1 text-[11px]">
            {data.settings.simulatedDate && <span className="rounded-full bg-yellow/15 px-2 py-0.5 text-yellow">simuliert</span>}
            {data.settings.demoMode && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-accent">Demo</span>}
          </div>
        )}
        <SyncBadge />
        <NavLink to="/einstellungen" aria-label="Einstellungen" className={`grid h-11 w-11 place-items-center text-accent ${cloud ? '' : 'ml-auto'}`}>
          <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
          </svg>
        </NavLink>
      </header>
      <main className="flex-1 space-y-4 px-4 pb-4">
        <div className="pt-1">
          <div className="text-[13px] font-semibold uppercase tracking-wide text-muted">
            {weekdayLongDE(today)}, {formatDateDE(today)}
          </div>
          <h1 className="text-[34px] font-bold leading-tight tracking-tight">{TITLES[pathname] ?? 'Collectr'}</h1>
        </div>
        <Outlet />
        <footer className="pt-4 pb-2">
          <Disclaimer />
        </footer>
      </main>
      <nav
        className="sticky bottom-0 z-10 grid grid-cols-4 border-t border-line/70 bg-bg/90 backdrop-blur-xl"
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
              className={`flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-center text-[10px] font-medium leading-tight ${active ? 'text-accent' : 'text-muted'}`}
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
