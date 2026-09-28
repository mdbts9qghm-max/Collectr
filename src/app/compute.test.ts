import { describe, expect, it } from 'vitest'
import { defaultSettings } from '../data/defaults'
import { berlinToInstant } from '../core/time'
import { buildCalendar, buildDayView, buildPlan, currentDate, effectiveStrengthState, EMPTY_WHOOP, nextTrainingDay, recoveryHistory, workoutActions, type AppData } from './compute'

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
    const { v } = view(data(), '2026-10-03')
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

  it('Bergwochenende wird vorher angekündigt', () => {
    const { v } = view(data(), '2027-05-01')
    expect(v.warnings.some((w) => w.id === 'mountain-48')).toBe(true)
  })

  it('vor dem Planstart: nächster Trainingstag', () => {
    const d = data()
    const { v, plan } = view(d, '2026-09-28')
    expect(v.beforePlan).toBe(true)
    expect(nextTrainingDay(plan, '2026-09-28')!.date).toBe('2026-10-03')
  })

  it('Kraftstand aus dem Onboarding-Test', () => {
    const s = effectiveStrengthState({
      strengthState: null,
      strengthTests: [{ date: '2026-10-01', maxPullups: 3, maxDips: 4, hollowHoldSec: 35, frontLever: { stage: 0, holdSec: 0 }, backLever: { stage: 0, holdSec: 0 } }],
    })
    expect(s.levels.pull).toBe(4)
  })

  it('V-Schicht verändert den Plan sofort', () => {
    const { v } = view(data({ overrides: [{ date: '2026-10-06', kind: 'V' }] }), '2026-10-06')
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
    const run = plan.days.find((d) => d.date === '2026-10-03')!.sessions.find((s) => s.category === 'run')!
    const workouts = [
      { id: 'w-run', start: iso('2026-10-03', 8 * 60 + 35), end: iso('2026-10-03', 9 * 60 + 25), sportName: 'running', distanceM: 7200, strain: 9 },
      { id: 'w-golf', start: iso('2026-10-05', 10 * 60), end: iso('2026-10-05', 11 * 60), sportName: 'golf' },
    ]
    const d = data({ whoop: { ...EMPTY_WHOOP, status: { connected: true }, workouts } })
    const a = workoutActions(d, plan, '2026-10-06')
    expect(a.autoLogs).toHaveLength(1)
    expect(a.autoLogs[0]).toMatchObject({ sessionId: run.id, status: 'done', distanceKm: 7.2, whoopWorkoutId: 'w-run' })
    expect(a.suggestions.map((s) => s.workout.id)).toEqual(['w-golf'])
    expect(a.suggestions[0]!.candidates.length).toBeGreaterThan(0)
    // Eigener Eintrag vorhanden → nicht überschreiben
    const own = data({ whoop: d.whoop, logs: [{ sessionId: run.id, date: '2026-10-03', status: 'done', feeling: 4 }] })
    expect(workoutActions(own, plan, '2026-10-06').autoLogs).toEqual([])
    // Bereits übernommen → nichts mehr zu tun
    const done = data({ whoop: d.whoop, logs: [a.autoLogs[0]!] })
    expect(workoutActions(done, plan, '2026-10-06').autoLogs).toEqual([])
    // Korrektur: ignorieren bzw. andere Einheit
    const ignored = data({ whoop: d.whoop, assignments: [{ workoutId: 'w-golf', sessionId: null, decidedAt: 'x' }] })
    expect(workoutActions(ignored, plan, '2026-10-06').suggestions).toEqual([])
    const long = plan.days.find((x) => x.date === '2026-10-05')!.sessions[0]!
    const assigned = data({ whoop: d.whoop, assignments: [{ workoutId: 'w-golf', sessionId: long.id, decidedAt: 'x' }] })
    expect(workoutActions(assigned, plan, '2026-10-06').autoLogs.map((l) => l.sessionId)).toContain(long.id)
  })
})
