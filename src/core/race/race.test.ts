import { describe, expect, it } from 'vitest'
import { generatePlan } from '../plan'
import { createShiftCalendar, withOverride, withVacation } from '../shift'
import { berlinToInstant } from '../time'
import { raceChecklist, raceConflict, raceCountdown, taperShiftNotes, vacationReminderDue } from './index'

const cal = createShiftCalendar()

describe('Rennwoche und Urlaubswarnung (SPEC 7, 11)', () => {
  it('Konflikt ohne Urlaub: Zielschluss-Tag ist Tagschicht, Folgetag Nachtschicht', () => {
    const c = raceConflict(cal)
    expect(c.hasConflict).toBe(true)
    expect(c.days.map((d) => d.code)).toEqual(['F', 'T', 'N'])
    expect(c.message).toContain('Urlaub')
    expect(c.message).toContain('19.06.2027')
    expect(c.message).toContain('14.06.2027')
  })

  it('V-Schicht am Renntag ist ebenfalls ein Konflikt', () => {
    const c = raceConflict(withOverride(cal, { date: '2027-06-18', kind: 'V' }))
    expect(c.days[0]!.isWork).toBe(true)
  })

  it('mit Urlaub 18.–20.06. verschwindet die Warnung, 14.–20.06. ist vollständig', () => {
    const minimal = raceConflict(withVacation(cal, '2027-06-18', '2027-06-20'))
    expect(minimal.hasConflict).toBe(false)
    expect(minimal.recommendedVacationComplete).toBe(false)
    const full = raceConflict(withVacation(cal, '2027-06-14', '2027-06-20'))
    expect(full.recommendedVacationComplete).toBe(true)
    expect(vacationReminderDue(withVacation(cal, '2027-06-18', '2027-06-20'), '2026-12-01')).toBe(false)
  })

  it('Erinnerung beim ersten Start und an den Erinnerungsterminen, bis Urlaub eingetragen ist', () => {
    expect(vacationReminderDue(cal, '2026-10-02')).toBe(true)
    expect(vacationReminderDue(cal, '2026-10-20', '2026-10-02')).toBe(false)
    expect(vacationReminderDue(cal, '2026-11-01', '2026-10-02')).toBe(true)
    expect(vacationReminderDue(cal, '2026-11-05', '2026-11-01')).toBe(false)
  })

  it('Checkliste enthält Anreise, Pflichtausrüstung, Stirnlampe, Verpflegung und Schlafstrategie', () => {
    const text = raceChecklist()
      .map((i) => i.text)
      .join(' ')
    for (const k of ['Ehrwald', 'Pflichtausrüstung', 'Stirnlampe', 'Ersatzakkus', 'Verpflegungsplan', 'Nap']) expect(text).toContain(k)
  })

  it('Taper: Nachtschichten werden hervorgehoben, Urlaub entfernt sie', () => {
    const notes = taperShiftNotes(cal)
    expect(notes.map((n) => n.date)).toEqual(['2027-06-05', '2027-06-10', '2027-06-15'])
    expect(taperShiftNotes(withVacation(cal, '2027-06-14', '2027-06-20')).map((n) => n.date)).toEqual(['2027-06-05', '2027-06-10'])
  })

  it('Taper-Phase im Plan: Tag nach der Nachtschicht ohne Einheit, Rennwoche mit Urlaub neu geplant', () => {
    const plan = generatePlan()
    for (const d of ['2027-06-06', '2027-06-11', '2027-06-16']) expect(plan.days.find((x) => x.date === d)!.sessions).toEqual([])
    const withVac = generatePlan({ calendar: withVacation(cal, '2027-06-14', '2027-06-20') })
    const d15 = withVac.days.find((x) => x.date === '2027-06-15')!
    expect(d15.shift.code).toBe('U')
    expect(d15.window!.end).toBeGreaterThan(plan.days.find((x) => x.date === '2027-06-15')!.window!.end)
  })

  it('Countdown bis Freitag 23:00 Uhr', () => {
    const now = berlinToInstant('2027-06-17', 21 * 60)
    expect(raceCountdown(now)).toMatchObject({ days: 1, hours: 2, minutes: 0, started: false })
    expect(raceCountdown(berlinToInstant('2027-06-19', 0)).started).toBe(true)
  })
})
