import { describe, expect, it } from 'vitest'
import { generatePlan } from '../core/plan'
import { actualByDate, plannedVolume, sumVolume } from './volumeView'

const plan = generatePlan()

describe('Soll/Ist-Umfang', () => {
  it('Soll pro Rhythmus entspricht dem Mikrozyklus, Ist aus erledigten Einträgen', () => {
    const m = plan.microcycles[0]!
    expect(plannedVolume(plan, m.start, m.end).km).toBeCloseTo(m.plannedKm, 0)
    const d3 = plan.days.find((d) => d.date === '2026-10-04')!.sessions.find((s) => s.category === 'run')!
    const actual = actualByDate(plan, [
      { sessionId: d3.id, date: '2026-10-04', status: 'done', distanceKm: 7.4 },
      { sessionId: 'x', date: '2026-10-05', status: 'skipped' },
    ])
    expect(sumVolume(actual, m.start, m.end)).toEqual({ km: 7.4, hm: 0, sets: 0 })
    expect(sumVolume(actual, '2026-10-05', '2026-10-06').km).toBe(0)
  })
})
