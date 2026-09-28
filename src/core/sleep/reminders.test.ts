import { describe, expect, it } from 'vitest'
import { generatePlan } from '../plan'
import { createShiftCalendar, withOverride } from '../shift'
import { berlinToInstant, dateRange } from '../time'
import { planReminders } from './reminders'
import { recommendSleep } from './recommend'

const cal = createShiftCalendar()
const plan = generatePlan()
const recs = (c = cal) => dateRange('2026-10-02', '2026-10-08').map((date) => recommendSleep({ cal: c, date, plan }))
const now = berlinToInstant('2026-10-02', 0)

describe('Push-Erinnerungen', () => {
  it('30 min vor Nap und Zubettgehen, Texte mit Uhrzeiten', () => {
    const r = planReminders(recs(), now)
    const nap = r.find((x) => x.id === '2026-10-03-nap')!
    const rec = recommendSleep({ cal, date: '2026-10-03', plan })
    expect(Date.parse(nap.dueAt)).toBe(berlinToInstant('2026-10-03', rec.nap!.start.minutes - 30))
    expect(nap.title).toBe('In 30 min Nap')
    expect(nap.body).toContain('18:30 losfahren')
    const bed = r.find((x) => x.id === '2026-10-02-bed')!
    expect(bed.body).toMatch(/^Ins Bett um \d\d:\d\d, aufstehen \d\d:\d\d Uhr\.$/)
    // sortiert
    expect([...r].sort((a, b) => a.dueAt.localeCompare(b.dueAt))).toEqual(r)
  })

  it('in der Dienstnacht keine Schlafenszeit-Erinnerung', () => {
    const r = planReminders(recs(), now)
    expect(r.some((x) => x.id === '2026-10-03-bed')).toBe(false)
  })

  it('nur zukünftige Erinnerungen', () => {
    const later = berlinToInstant('2026-10-05', 0)
    expect(planReminders(recs(), later).every((x) => Date.parse(x.dueAt) > later)).toBe(true)
  })

  it('Planänderung (Urlaub statt Nachtschicht) entfernt den Nap', () => {
    const c = withOverride(cal, { date: '2026-10-03', kind: 'URLAUB' })
    const r = planReminders(recs(c), now)
    expect(r.some((x) => x.id === '2026-10-03-nap')).toBe(false)
    expect(r.some((x) => x.id === '2026-10-03-bed')).toBe(true)
  })
})
