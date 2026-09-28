import { describe, expect, it } from 'vitest'
import { sampleRecoveryDays } from '../fixtures/sampleData'
import { generatePlan } from '../plan'
import { createShiftCalendar } from '../shift'
import { expectedDrop, learnPatterns } from './index'

const cal = createShiftCalendar()
const plan = generatePlan()
const sessionsById = new Map(plan.days.flatMap((d) => d.sessions).map((s) => [s.id, s]))

describe('Gelernte Muster (SPEC 6.4)', () => {
  it('zu wenige Daten → keine Aussage, kein erwarteter Abfall', () => {
    const days = sampleRecoveryDays(cal, { start: '2026-10-02', days: 20 })
    const p = learnPatterns({ cal, days, logs: [], sessionsById })
    expect(p.enoughData).toBe(false)
    expect(expectedDrop(p, { nightShiftBetween: true, longRunBetween: false })).toBe(0)
  })

  it('erkennt den Nachtschicht-Dip aus 60 Tagen Beispieldaten', () => {
    const days = sampleRecoveryDays(cal, { start: '2026-10-02', days: 60 })
    const p = learnPatterns({ cal, days, logs: [], sessionsById })
    expect(p.enoughData).toBe(true)
    const night = p.effects.find((e) => e.key === 'night_shift')!
    expect(night.recoveryDelta!).toBeLessThan(-15)
    expect(night.reliable).toBe(true)
    expect(night.sentence).toMatch(/^Nach Nachtschichten: Recovery im Schnitt \d+ Punkte niedriger/)
    expect(expectedDrop(p, { nightShiftBetween: true, longRunBetween: false })).toBe(-night.recoveryDelta!)
    expect(expectedDrop(p, { nightShiftBetween: false, longRunBetween: false })).toBe(0)
  })

  it('lange Läufe: Folgetag gegen Tage gleicher Art', () => {
    const days = sampleRecoveryDays(cal, { start: '2026-10-02', days: 60 }).map((d) =>
      // Tag 5 nach einem langen Lauf an Tag 4 künstlich schlechter
      (Date.parse(d.date) / 86_400_000 - Date.parse('2026-10-02') / 86_400_000) % 5 === 4 ? { ...d, recoveryScore: (d.recoveryScore ?? 60) - 12 } : d,
    )
    const logs = plan.days
      .filter((d) => d.date < '2026-12-01' && d.shift.cycleDay === 4)
      .flatMap((d) => d.sessions.filter((s) => s.type === 'long_run').map((s) => ({ sessionId: s.id, date: d.date, status: 'done' as const })))
    const p = learnPatterns({ cal, days, logs, sessionsById })
    const long = p.effects.find((e) => e.key === 'long_run')!
    expect(long.observations).toBeGreaterThanOrEqual(4)
    expect(long.recoveryDelta!).toBeLessThan(-5)
  })
})
