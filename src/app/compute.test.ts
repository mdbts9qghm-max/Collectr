import { describe, expect, it } from 'vitest'
import { defaultSettings } from '../data/defaults'
import { berlinToInstant } from '../core/time'
import { CONFIG } from '../core/config'
import {
  buildCalendar,
  buildDayView,
  buildPlan,
  currentDate,
  effectiveStrengthState,
  EMPTY_WHOOP,
  HISTORY_RESET_NOTICE,
  needsHistoryReset,
  nextTrainingDay,
  recoveryHistory,
  workoutActions,
  type AppData,
} from './compute'

function data(over: Partial<AppData> = {}, settings: Partial<AppData['settings']> = {}): AppData {
  return {
    settings: { ...defaultSettings(), onboarded: true, ...settings },
    overrides: [],
    logs: [],
    manual: [],
    strengthTests: [],
    strengthState: null,
    checklist: {},
    decisions: [],
    whoop: EMPTY_WHOOP,
    assignments: [],
    ...over,
  }
}

function view(d: AppData, date: string) {
  const cal = buildCalendar(d.settings, d.overrides)
  const history = recoveryHistory(d, cal, date)
  const plan = buildPlan(d, cal, history)
  return { v: buildDayView(d, cal, plan, history, date), plan }
}

describe('Tagesansicht', () => {
  it('echtes oder simuliertes Datum', () => {
    const now = berlinToInstant('2026-09-28', 10 * 60)
    expect(currentDate(defaultSettings(), now)).toBe('2026-09-28')
    expect(currentDate({ ...defaultSettings(), simulatedDate: '2027-05-01' }, now)).toBe('2027-05-01')
  })

  it('ohne Erholungsdaten: manuelle Eingabe wird angefordert, kein Fehler', () => {
    const { v } = view(data(), '2026-10-28')
    expect(v.readiness.needsManualInput).toBe(true)
    expect(v.items.length).toBeGreaterThan(0)
    expect(v.items.every((i) => i.adjustment.action === 'needs_input')).toBe(true)
    expect(v.sleep.nap).toBeDefined()
  })

  it('manuelle Eingabe ergibt Ampel und Anpassung', () => {
    const { v } = view(data({ manual: [{ date: '2026-12-12', sleepMin: 330, quality: 2, feeling: 2 }] }), '2026-12-12')
    expect(v.readiness.source).toBe('manual')
    expect(v.readiness.traffic).toBeDefined()
    const hard = v.items.find((i) => i.session.sensitivity === 'high')!
    expect(hard.adjustment.action).not.toBe('keep')
  })

  it('Demo-Modus liefert Beispieldaten für jedes Datum', () => {
    const { v } = view(data({}, { demoMode: true }), '2027-05-05')
    expect(v.readiness.needsManualInput).toBe(false)
    expect(v.readiness.source).toBe('whoop')
  })

  it('Urlaubskonflikt wird angezeigt und kann bestätigt werden', () => {
    const { v } = view(data(), '2026-10-02')
    const w = v.warnings.find((x) => x.id === 'vacation')!
    expect(w.level).toBe('danger')
    expect(w.ackable).toBe(true)
    const { v: v2 } = view(data({}, { vacationReminderAck: '2026-10-02' }), '2026-10-10')
    expect(v2.warnings.find((x) => x.id === 'vacation')!.level).toBe('warn')
  })

  it('Bergwochenende und Streckenbesichtigung werden vorher angekündigt', () => {
    const { v } = view(data(), '2027-07-01')
    expect(v.warnings.find((w) => w.id === 'mountain-53')!.text).toContain('Bergwochenende am 17.07.2027')
    const { v: v2 } = view(data(), '2027-08-01')
    expect(v2.warnings.find((w) => w.id === 'mountain-60')!.text).toContain(`Streckenbesichtigung ${CONFIG.race.name}`)
  })

  it('vor dem Planstart: nächster Trainingstag ist der Einstiegstag', () => {
    const d = data()
    const { v, plan } = view(d, '2026-10-25')
    expect(v.beforePlan).toBe(true)
    expect(nextTrainingDay(plan, '2026-10-25')!.date).toBe('2026-10-26')
    expect(view(d, '2026-10-26').v.beforePlan).toBe(false)
  })

  it('Zielwechsel: Einträge eines eingerichteten Nutzers werden einmalig zurückgesetzt', () => {
    expect(needsHistoryReset({ ...defaultSettings(), onboarded: true })).toBe(true)
    expect(needsHistoryReset({ ...defaultSettings(), onboarded: true, planId: 'ehrwald-2027' })).toBe(true)
    expect(needsHistoryReset({ ...defaultSettings(), onboarded: true, planId: CONFIG.race.id })).toBe(false)
    expect(needsHistoryReset(defaultSettings())).toBe(false) // noch im Onboarding
    expect(HISTORY_RESET_NOTICE).toContain('Arberland Classic Trail')
  })

  it('Kraftstand aus dem Onboarding-Test', () => {
    const s = effectiveStrengthState({
      strengthState: null,
      strengthTests: [{ date: '2026-10-01', maxPullups: 3, maxDips: 4, hollowHoldSec: 35, frontLever: { stage: 0, holdSec: 0 }, backLever: { stage: 0, holdSec: 0 } }],
    })
    expect(s.levels.pull).toBe(4)
  })

  it('V-Schicht verändert den Plan sofort', () => {
    const { v } = view(data({ overrides: [{ date: '2026-10-31', kind: 'V' }] }), '2026-10-31')
    expect(v.items).toEqual([])
    expect(v.day!.removed.length).toBeGreaterThan(0)
  })

  it('WHOOP-Daten ersetzen Demo und liefern die Recovery des Schlaftags', () => {
    const iso = (d: string, m: number) => new Date(berlinToInstant(d, m)).toISOString()
    const whoop = {
      ...EMPTY_WHOOP,
      status: { connected: true },
      sleeps: [{ id: 's2', start: iso('2026-10-04', 8 * 60), end: iso('2026-10-04', 14 * 60), nap: false, asleepMin: 330 }],
      recoveries: [{ cycleId: 2, sleepId: 's2', score: 41, hrvMs: 50, restingHr: 57 }],
    }
    const { v } = view(data({ whoop }, { demoMode: true }), '2026-10-04')
    expect(v.readiness.source).toBe('whoop')
    expect(v.readiness.score).toBe(41)
    expect(v.readiness.mainSleepMin).toBe(330)
    // Tag ohne WHOOP-Schlaf → manuelle Eingabe (nicht Demo)
    const { v: v2 } = view(data({ whoop }, { demoMode: true }), '2026-10-05')
    expect(v2.readiness.needsManualInput).toBe(true)
  })

  it('Workouts: eindeutige automatisch, mehrdeutige als Vorschlag, eigene Einträge bleiben', () => {
    const iso = (d: string, m: number) => new Date(berlinToInstant(d, m)).toISOString()
    const base = data({}, {})
    const cal = buildCalendar(base.settings, [])
    const plan = buildPlan(base, cal, [])
    // Der Lauf liegt an Tag 3 (29.10.) nach dem Tagschlaf
    const run = plan.days.find((d) => d.date === '2026-10-29')!.sessions.find((s) => s.category === 'run')!
    const workouts = [
      { id: 'w-run', start: iso('2026-10-29', run.startMin! + 5), end: iso('2026-10-29', run.startMin! + 55), sportName: 'running', distanceM: 7200, strain: 9 },
      { id: 'w-golf', start: iso('2026-10-30', 10 * 60), end: iso('2026-10-30', 11 * 60), sportName: 'golf' },
    ]
    const d = data({ whoop: { ...EMPTY_WHOOP, status: { connected: true }, workouts } })
    const a = workoutActions(d, plan, '2026-10-31')
    expect(a.autoLogs).toHaveLength(1)
    expect(a.autoLogs[0]).toMatchObject({ sessionId: run.id, status: 'done', distanceKm: 7.2, whoopWorkoutId: 'w-run' })
    expect(a.suggestions.map((s) => s.workout.id)).toEqual(['w-golf'])
    expect(a.suggestions[0]!.candidates.length).toBeGreaterThan(0)
    // Eigener Eintrag vorhanden → nicht überschreiben
    const own = data({ whoop: d.whoop, logs: [{ sessionId: run.id, date: '2026-10-29', status: 'done', feeling: 4 }] })
    expect(workoutActions(own, plan, '2026-10-31').autoLogs).toEqual([])
    // Bereits übernommen → nichts mehr zu tun
    const done = data({ whoop: d.whoop, logs: [a.autoLogs[0]!] })
    expect(workoutActions(done, plan, '2026-10-31').autoLogs).toEqual([])
    // Korrektur: ignorieren bzw. andere Einheit
    const ignored = data({ whoop: d.whoop, assignments: [{ workoutId: 'w-golf', sessionId: null, decidedAt: 'x' }] })
    expect(workoutActions(ignored, plan, '2026-10-31').suggestions).toEqual([])
    const long = plan.days.find((x) => x.date === '2026-10-30')!.sessions[0]!
    const assigned = data({ whoop: d.whoop, assignments: [{ workoutId: 'w-golf', sessionId: long.id, decidedAt: 'x' }] })
    expect(workoutActions(assigned, plan, '2026-10-31').autoLogs.map((l) => l.sessionId)).toContain(long.id)
  })
})
