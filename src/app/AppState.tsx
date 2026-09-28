// App-Zustand: lädt die Daten aus dem Repository und berechnet Kalender, Plan und Tagesansichten.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { applyStrengthTest, evaluateSession, type ProgressResult } from '../core/strength'
import type { LocalDate, ManualReadiness, SessionLog, ShiftOverride, StrengthResult, StrengthTest } from '../core/types'
import { parseBackup } from '../data/backup'
import { IndexedDbRepository } from '../data/indexedDb'
import type { AppSettings, Repository } from '../data/types'
import { buildCalendar, buildDayView, buildPlan, currentDate, effectiveStrengthState, recoveryHistory, type AppData, type DayView } from './compute'

interface AppContextValue {
  data: AppData
  today: LocalDate
  /** Aktueller Zeitpunkt (minütlich aktualisiert). */
  now: number
  cal: ReturnType<typeof buildCalendar>
  plan: ReturnType<typeof buildPlan>
  dayView: (date: LocalDate) => DayView
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
  setOverride: (o: ShiftOverride) => Promise<void>
  removeOverride: (date: LocalDate) => Promise<void>
  saveLog: (l: SessionLog) => Promise<void>
  removeLog: (sessionId: string) => Promise<void>
  saveManual: (m: ManualReadiness) => Promise<void>
  setDecision: (sessionId: string, date: LocalDate, rejected: boolean) => Promise<void>
  saveStrengthTest: (t: StrengthTest, onboarding?: boolean) => Promise<void>
  saveStrengthResults: (results: StrengthResult[]) => Promise<ProgressResult>
  setChecklist: (c: Record<string, boolean>) => Promise<void>
  exportBackup: () => Promise<string>
  importBackup: (json: string) => Promise<string | null>
  resetAll: () => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)

async function loadAll(repo: Repository): Promise<AppData> {
  const [settings, overrides, logs, manual, strengthTests, strengthState, checklist, decisions] = await Promise.all([
    repo.getSettings(),
    repo.listOverrides(),
    repo.listLogs(),
    repo.listManual(),
    repo.listStrengthTests(),
    repo.getStrengthState(),
    repo.getChecklist(),
    repo.listDecisions(),
  ])
  return { settings, overrides, logs, manual, strengthTests, strengthState, checklist, decisions }
}

export function AppProvider({ children, repo: injected }: { children: ReactNode; repo?: Repository }) {
  const repo = useMemo(() => injected ?? new IndexedDbRepository(), [injected])
  const [data, setData] = useState<AppData | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const reload = useCallback(async () => setData(await loadAll(repo)), [repo])
  useEffect(() => {
    void reload()
    // Datum aktuell halten (Mitternacht, Countdown)
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [reload])

  const value = useMemo<AppContextValue | null>(() => {
    if (!data) return null
    const today = currentDate(data.settings, now)
    const cal = buildCalendar(data.settings, data.overrides)
    const history = recoveryHistory(data, cal, today)
    const plan = buildPlan(data, cal, history)
    const cache = new Map<LocalDate, DayView>()
    const dayView = (date: LocalDate) => {
      if (!cache.has(date)) cache.set(date, buildDayView(data, cal, plan, date === today ? history : recoveryHistory(data, cal, date), date))
      return cache.get(date)!
    }
    const run = async (fn: () => Promise<void>) => {
      await fn()
      await reload()
    }
    return {
      data,
      today,
      now,
      cal,
      plan,
      dayView,
      // Optimistisch: Schalter und Eingaben reagieren sofort, gespeichert wird im Hintergrund.
      updateSettings: (patch) => {
        const settings = { ...data.settings, ...patch }
        setData({ ...data, settings })
        return run(() => repo.saveSettings(settings))
      },
      setOverride: (o) => run(() => repo.putOverride(o)),
      removeOverride: (d) => run(() => repo.deleteOverride(d)),
      saveLog: (l) => run(() => repo.putLog(l)),
      removeLog: (id) => run(() => repo.deleteLog(id)),
      saveManual: (m) => run(() => repo.putManual(m)),
      setDecision: (sessionId, date, rejected) => run(() => repo.putDecision({ sessionId, date, rejected, decidedAt: new Date().toISOString() })),
      saveStrengthTest: (t, onboarding = false) =>
        run(async () => {
          await repo.putStrengthTest(t)
          await repo.saveStrengthState(applyStrengthTest(effectiveStrengthState(data), t, { onboarding }))
        }),
      saveStrengthResults: async (results) => {
        const r = evaluateSession(effectiveStrengthState(data), results)
        await repo.saveStrengthState(r.state)
        await reload()
        return r
      },
      setChecklist: (c) => {
        setData({ ...data, checklist: c })
        return run(() => repo.saveChecklist(c))
      },
      exportBackup: async () => JSON.stringify(await repo.exportAll(new Date()), null, 2),
      importBackup: async (json) => {
        const p = parseBackup(json)
        if (!p.ok) return p.error
        await repo.importAll(p.data)
        await reload()
        return null
      },
      resetAll: () => run(() => repo.clearAll()),
    }
  }, [data, now, repo, reload])

  if (!value) return <div className="p-6 text-muted">Lade …</div>
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const v = useContext(AppContext)
  if (!v) throw new Error('useApp außerhalb von AppProvider')
  return v
}
