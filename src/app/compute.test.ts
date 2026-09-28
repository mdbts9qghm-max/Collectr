import { describe, expect, it } from 'vitest'
import { defaultSettings } from '../data/defaults'
import { berlinToInstant } from '../core/time'
import { buildCalendar, buildDayView, buildPlan, currentDate, effectiveStrengthState, nextTrainingDay, recoveryHistory, type AppData } from './compute'

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
})
