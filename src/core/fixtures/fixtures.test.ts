import { describe, expect, it } from 'vitest'
import { generatePlan } from '../plan'
import { adjustSession, assessReadiness, microcycleReduction } from '../recovery'
import { createShiftCalendar, effectiveShift } from '../shift'
import { addDays } from '../time'
import { DEFAULT_SAMPLE, sampleRecoveryDays } from './sampleData'

const cal = createShiftCalendar()
const days = sampleRecoveryDays(cal, DEFAULT_SAMPLE)

describe('Beispieldaten statt WHOOP', () => {
  it('liefern Erholungsdaten für die meisten Tage, Schlaftage mit Tagschlaf', () => {
    expect(days.length).toBeGreaterThan(40)
    const sleepDay = days.find((d) => effectiveShift(cal, d.date).dayKind === 'sleep_day')!
    expect(sleepDay.sleep!.daySleep).toBe(true)
  })

  it('Nachtschicht-Dip: Schlaftage haben im Schnitt schlechtere Recovery', () => {
    const avg = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length
    const sleepDays = days.filter((d) => effectiveShift(cal, d.date).dayKind === 'sleep_day').map((d) => d.recoveryScore!)
    const free = days.filter((d) => effectiveShift(cal, d.date).dayKind === 'free').map((d) => d.recoveryScore!)
    expect(avg(sleepDays)).toBeLessThan(avg(free))
  })

  it('rote Serie senkt den nächsten Mikrozyklus, Lücke führt zur manuellen Eingabe', () => {
    const red = [addDays(DEFAULT_SAMPLE.start, 20), addDays(DEFAULT_SAMPLE.start, 21)]
    const statuses = days.map((d) => ({ date: d.date, traffic: assessReadiness({ date: d.date, today: d }).traffic! }))
    expect(statuses.filter((s) => red.includes(s.date)).every((s) => s.traffic === 'red')).toBe(true)
    expect(microcycleReduction(statuses.filter((s) => s.date >= '2026-10-22' && s.date <= '2026-10-26')).factor).toBeLessThan(1)
    const gap = addDays(DEFAULT_SAMPLE.start, 33)
    expect(days.find((d) => d.date === gap)).toBeUndefined()
    const plan = generatePlan()
    const s = plan.days.find((d) => d.date === gap)!.sessions[0]
    if (s) expect(adjustSession(s, { readiness: assessReadiness({ date: gap, history: days }), dayKind: 'free', phase: 'base' }).action).toBe('needs_input')
  })
})
