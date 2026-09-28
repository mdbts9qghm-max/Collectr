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

export interface WhoopActions {
  /** Zur WHOOP-Anmeldung weiterleiten. */
  connect: () => Promise<void>
  /** Neue Daten holen (force = Mindestabstand ignorieren) und synchronisieren. */
  fetchNow: (force?: boolean) => Promise<void>
  disconnect: () => Promise<void>
  busy: boolean
  error: string | null
}

export interface CloudContextValue {
  email: string
  status: SyncStatus
  syncNow: () => Promise<void>
  signOut: () => Promise<void>
  whoop: WhoopActions
}

/** Fehlermeldung einer Edge Function lesbar machen. */
async function functionError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context
  if (ctx && typeof ctx.json === 'function') {
    const body = await ctx.json().catch(() => null)
    if (body?.error) return String(body.error)
  }
  return error instanceof Error ? error.message : String(error)
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
  const [whoopBusy, setWhoopBusy] = useState(false)
  const [whoopError, setWhoopError] = useState<string | null>(null)

  const fetchWhoop = useMemo(
    () => async (force = false) => {
      if (!sb || !engine) return
      setWhoopBusy(true)
      setWhoopError(null)
      const { error } = await sb.functions.invoke('whoop-sync', { body: { force } })
      if (error) setWhoopError(await functionError(error))
      await engine.sync()
      setWhoopBusy(false)
    },
    [sb, engine],
  )

  useEffect(() => {
    if (!engine || !userId) return
    const off = engine.onStatus(setStatus)
    const run = () => void engine.sync()
    // Beim Öffnen: synchronisieren, dann (falls verbunden) neue WHOOP-Daten holen. Der Server begrenzt auf alle 5 min.
    const openSync = async () => {
      await engine.migrateLocal(userId)
      await engine.sync()
      if ((await local.listWhoop()).status?.connected) await fetchWhoop()
    }
    void openSync()
    const onVisible = () => document.visibilityState === 'visible' && void openSync()
    // Live: neuer WHOOP-Abruf (Webhook/Zeitplan) → sofort synchronisieren
    const channel = sb!
      .channel('whoop-status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whoop_status' }, () => run())
      .subscribe()
    window.addEventListener('online', run)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      off()
      void sb!.removeChannel(channel)
      window.removeEventListener('online', run)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [engine, userId, local, fetchWhoop, sb])

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
    whoop: {
      busy: whoopBusy,
      error: whoopError,
      connect: async () => {
        setWhoopError(null)
        const { data, error } = await sb.functions.invoke('whoop-oauth-start', { body: {} })
        if (error || !data?.url) {
          setWhoopError(error ? await functionError(error) : 'Keine Anmeldeadresse erhalten')
          return
        }
        window.location.href = data.url as string
      },
      fetchNow: fetchWhoop,
      disconnect: async () => {
        setWhoopBusy(true)
        const { error } = await sb.functions.invoke('whoop-disconnect', { body: {} })
        if (error) setWhoopError(await functionError(error))
        await engine!.sync()
        setWhoopBusy(false)
      },
    },
  }
  return <CloudContext.Provider value={value}>{children(repo, (fn) => engine!.onRemoteChange(fn))}</CloudContext.Provider>
}
