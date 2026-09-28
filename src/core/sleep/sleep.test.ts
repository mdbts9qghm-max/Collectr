import { describe, expect, it } from 'vitest'
import { generatePlan } from '../plan'
import { createShiftCalendar, trainingWindow, withOverride } from '../shift'
import { formatTime } from '../time'
import { recommendSleep, sleepAdherence } from './index'

const cal = createShiftCalendar()
const plan = generatePlan()

describe('Schlafempfehlungen (SPEC 6.3b, 11)', () => {
  it('Tag 2: Training endet vor dem Nap, Nap ab 15:00, spätestens 18:00 auf, 18:30 losfahren', () => {
    const date = '2026-12-12'
    const r = recommendSleep({ cal, date, plan })
    expect(formatTime(r.nap!.start.minutes)).toBe('15:00')
    expect(r.nap!.end.minutes).toBeLessThanOrEqual(18 * 60)
    expect(formatTime(r.departure!)).toBe('18:30')
    expect(r.night).toBeUndefined() // Nachtdienst
    const w = trainingWindow(cal, date)!
    expect(w.end).toBeLessThanOrEqual(r.nap!.start.minutes)
    for (const s of plan.days.find((d) => d.date === date)!.sessions) expect(s.startMin! + s.durationMin).toBeLessThanOrEqual(r.nap!.start.minutes)
  })

  it('Nap wird bei Schlafdefizit länger, bleibt aber vor dem Losfahren', () => {
    const r = recommendSleep({ cal, date: '2026-12-12', debtMin: 120 })
    expect(r.nap!.durationMin).toBeGreaterThan(recommendSleep({ cal, date: '2026-12-12' }).nap!.durationMin)
    expect(r.nap!.end.minutes).toBeLessThanOrEqual(18 * 60)
  })

  it('vor der Tagschicht: Aufstehen 05:45 passt zu Arbeitsweg und Arbeitsbeginn 06:45', () => {
    const r = recommendSleep({ cal, date: '2026-10-06' }) // Tag 5, morgen Tagschicht
    expect(r.night!.end).toEqual({ date: '2026-10-07', minutes: 5 * 60 + 45 })
    expect(formatTime(r.night!.start.minutes)).toBe('21:30')
    // 05:45 + 45 min Fertigmachen = 06:30 losfahren + 15 min Weg = 06:45 Arbeitsbeginn
    expect(r.night!.end.minutes + 45 + 15).toBe(6 * 60 + 45)
  })

  it('nach der Nachtschicht: Tagschlaf 08:00–14:00, am Abend normaler Rhythmus', () => {
    const r = recommendSleep({ cal, date: '2026-10-04', plan })
    expect(formatTime(r.daySleep!.start.minutes)).toBe('08:00')
    expect(formatTime(r.daySleep!.end.minutes)).toBe('14:00')
    const bed = r.night!.start.minutes
    expect(bed).toBeGreaterThanOrEqual(21 * 60 + 30)
    expect(bed).toBeLessThanOrEqual(23 * 60 + 30)
    expect(r.night!.end.date).toBe('2026-10-05')
    // Training am Schlaftag endet 3 h vor der empfohlenen Schlafenszeit
    expect(trainingWindow(cal, '2026-10-04', { bedtime: bed })!.end).toBe(bed - 180)
  })

  it('Nacht nach der Tagschicht: Ausschlafen erlaubt, spätestens vor dem Training', () => {
    const r = recommendSleep({ cal, date: '2026-10-02', plan })
    expect(r.night!.end.date).toBe('2026-10-03')
    expect(r.night!.end.minutes).toBeGreaterThanOrEqual(7 * 60)
    expect(r.night!.end.minutes).toBeLessThanOrEqual(8 * 60 + 30)
    expect(formatTime(r.departure!)).toBe('06:30')
  })

  it('vor Schlüsseleinheiten früher ins Bett', () => {
    const beforeLong = recommendSleep({ cal, date: '2026-10-04', plan }) // morgen langer Lauf
    const withoutPlan = recommendSleep({ cal, date: '2026-10-04' })
    expect(beforeLong.night!.start.minutes).toBeLessThan(withoutPlan.night!.start.minutes)
  })

  it('Nachtlauf verschiebt die Nacht und plant einen Nap davor', () => {
    const r = recommendSleep({ cal, date: '2027-04-03', plan }) // Tag 4 mit Nachtlauf
    expect(r.nap).toBeDefined()
    expect(r.night!.start.date).toBe('2027-04-04')
    expect(r.night!.end.minutes).toBeGreaterThan(8 * 60)
  })

  it('Rennvorbereitung: früh ins Bett in den Nächten davor, Nap am Renntag', () => {
    const before = recommendSleep({ cal: withOverride(cal, { date: '2027-06-18', kind: 'URLAUB' }), date: '2027-06-17', plan })
    expect(before.night!.start.minutes).toBeLessThanOrEqual(22 * 60)
    const race = recommendSleep({ cal, date: '2027-06-18', plan })
    expect(formatTime(race.nap!.start.minutes)).toBe('15:00')
    expect(race.night).toBeUndefined()
    expect(race.notes.join(' ')).toContain('23:00')
  })

  it('Tipps wechseln von Tag zu Tag', () => {
    const tips = ['2026-10-04', '2026-10-09', '2026-10-14'].map((d) => recommendSleep({ cal, date: d }).tip)
    expect(new Set(tips).size).toBeGreaterThan(1)
  })

  it('Umsetzungsquote: Empfehlung vs. tatsächlicher Schlaf', () => {
    const recs = [recommendSleep({ cal, date: '2026-10-06' }), recommendSleep({ cal, date: '2026-10-04' })]
    const actual = [
      { start: { date: '2026-10-06', minutes: 21 * 60 + 45 }, end: { date: '2026-10-07', minutes: 5 * 60 + 45 } }, // passt
      { start: { date: '2026-10-04', minutes: 8 * 60 }, end: { date: '2026-10-04', minutes: 13 * 60 } }, // Tagschlaf, nicht die Nacht
      { start: { date: '2026-10-05', minutes: 0 }, end: { date: '2026-10-05', minutes: 7 * 60 } }, // zu spät
    ]
    const a = sleepAdherence(recs, actual)
    expect(a.days).toHaveLength(2)
    expect(a.days[0]!.ok).toBe(true)
    expect(a.days[1]!.ok).toBe(false)
    expect(a.rate).toBe(0.5)
  })
})
