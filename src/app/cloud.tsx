// Supabase-Anbindung: Client aus der Umgebung, Anmeldung (E-Mail + Passwort) und Synchronisation.
// Ohne VITE_SUPABASE_URL läuft die App nur lokal (Entwicklung, Tests).

import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { IndexedDbRepository } from '../data/indexedDb'
import { SupabaseRemote } from '../data/remote'
import { SyncEngine, type SyncStatus } from '../data/sync'
import { SyncingRepository } from '../data/syncingRepository'
import type { Repository } from '../data/types'
import { Login } from '../ui/pages/Login'

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

let client: SupabaseClient | null = null
export function supabase(): SupabaseClient | null {
  if (!URL || !KEY) return null
  client ??= createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true } })
  return client
}

export interface CloudContextValue {
  email: string
  status: SyncStatus
  syncNow: () => Promise<void>
  signOut: () => Promise<void>
}

const CloudContext = createContext<CloudContextValue | null>(null)

/** Konto- und Sync-Informationen (null, wenn die App nur lokal läuft). */
export function useCloud(): CloudContextValue | null {
  return useContext(CloudContext)
}

/**
 * Liefert das passende Repository an die App: nur lokal (ohne Konfiguration) oder
 * lokal + Synchronisation nach der Anmeldung.
 */
export function CloudGate({ children }: { children: (repo: Repository, onRemoteChange?: (fn: () => void) => () => void) => ReactNode }) {
  const sb = supabase()
  const local = useMemo(() => new IndexedDbRepository(), [])
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(!sb)

  useEffect(() => {
    if (!sb) return
    void sb.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [sb])

  const userId = session?.user.id
  const engine = useMemo(() => (sb && userId ? new SyncEngine(local, new SupabaseRemote(sb)) : null), [sb, userId, local])
  const repo = useMemo(() => (engine ? new SyncingRepository(local, engine) : local), [engine, local])
  const [status, setStatus] = useState<SyncStatus>({ state: 'idle', pending: 0 })

  useEffect(() => {
    if (!engine || !userId) return
    const off = engine.onStatus(setStatus)
    const run = () => void engine.sync()
    void engine.migrateLocal(userId).then(run)
    const onVisible = () => document.visibilityState === 'visible' && run()
    window.addEventListener('online', run)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      off()
      window.removeEventListener('online', run)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [engine, userId])

  if (!ready) return <div className="p-6 text-muted">Lade …</div>
  if (!sb) return <>{children(local)}</>
  if (!session) return <Login onLogin={async (email, password) => (await sb.auth.signInWithPassword({ email, password })).error?.message ?? null} />

  const value: CloudContextValue = {
    email: session.user.email ?? '',
    status,
    syncNow: () => engine!.sync(),
    signOut: async () => {
      await engine?.sync()
      await sb.auth.signOut()
    },
  }
  return <CloudContext.Provider value={value}>{children(repo, (fn) => engine!.onRemoteChange(fn))}</CloudContext.Provider>
}
