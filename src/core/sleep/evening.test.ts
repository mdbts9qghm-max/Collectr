import { describe, expect, it } from 'vitest'
import { generatePlan } from '../plan'
import { createShiftCalendar, effectiveShift } from '../shift'
import { addDays, formatTime } from '../time'
import { eveningRoutine } from './evening'
import { recommendSleep } from './recommend'

const cal = createShiftCalendar()
const plan = generatePlan()
const routine = (date: string) => {
  const next = addDays(date, 1)
  return eveningRoutine(recommendSleep({ cal, date, plan }), effectiveShift(cal, date), effectiveShift(cal, next), plan.days.find((d) => d.date === next)?.sessions ?? [])
}

describe('Abendroutine', () => {
  it('vor der Tagschicht: Zeitplan rückwärts vom Zubettgehen, Kleidung vorbereiten, Losfahren 06:30', () => {
    const date = '2026-10-06' // Tag 5, morgen Tagschicht
    const rec = recommendSleep({ cal, date, plan })
    const r = routine(date)
    const bed = rec.night!.start.minutes
    expect(r.steps.map((s) => s.atMin)).toEqual([bed - 480, bed - 180, bed - 90, bed - 60, bed])
    expect(r.steps.at(-1)!.text).toContain(`Wecker auf ${formatTime(rec.night!.end.minutes)}`)
    expect(r.prepare.join(' ')).toContain('Losfahren 06:30')
  })

  it('vor dem langen Lauf: Kohlenhydrate, Route; vor der Nachtschicht: ausschlafen', () => {
    const r = routine('2026-10-04') // Tag 3, morgen langer Lauf
    expect(r.prepare.join(' ')).toMatch(/Langer Lauf .*kohlenhydratreich/)
    expect(r.prepare.join(' ')).toContain('Route für')
    const beforeNight = routine('2026-10-06'.replace('06', '07')) // Tag 1 (07.10.), morgen Nachtschicht
    expect(beforeNight.prepare.join(' ')).toContain('Morgen Nachtschicht')
  })

  it('in der Dienstnacht kein Abend-Zeitplan, dafür Tipps für den Heimweg', () => {
    const r = routine('2026-10-03')
    expect(r.steps).toEqual([])
    expect(r.prepare.join(' ')).toContain('Sonnenbrille')
  })
})
