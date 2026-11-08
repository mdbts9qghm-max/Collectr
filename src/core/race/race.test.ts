import { describe, expect, it } from 'vitest'
import { generatePlan } from '../plan'
import { createShiftCalendar, withOverride, withVacation } from '../shift'
import { berlinToInstant } from '../time'
import { raceChecklist, raceConflict, raceCountdown, raceDateLong, raceFacts, raceHeadline, taperShiftNotes, vacationReminderDue } from './index'

const cal = createShiftCalendar()

describe('Rennwoche und Urlaubswarnung (SPEC 7, 11, Soul Trail)', () => {
  it('Konflikt ohne Urlaub: Do Tagschicht, Fr Nachtschicht, Rennen am Schlaftag', () => {
    const c = raceConflict(cal)
    expect(c.hasConflict).toBe(true)
    expect(c.days.map((d) => [d.date, d.code, d.isWork])).toEqual([
      ['2027-04-15', 'T', true],
      ['2027-04-16', 'N', true],
      ['2027-04-17', 'S', false],
    ])
    expect(c.message).toContain('08:30 Uhr')
    expect(c.message).toContain('Urlaub')
    expect(c.message).toContain('15.04.2027–16.04.2027')
    expect(c.message).toContain('10.04.2027')
  })

  it('V-Schicht am Renntag ist ebenfalls ein Konflikt', () => {
    const c = raceConflict(withOverride(withVacation(cal, '2027-04-15', '2027-04-16'), { date: '2027-04-17', kind: 'V' }))
    expect(c.hasConflict).toBe(true)
    expect(c.days.find((d) => d.date === '2027-04-17')!.isWork).toBe(true)
  })

  it('mit Urlaub 15.–16.04. verschwindet die Warnung und der Renntag ist frei, 10.–16.04. ist vollständig', () => {
    const vac = withVacation(cal, '2027-04-15', '2027-04-16')
    const minimal = raceConflict(vac)
    expect(minimal.hasConflict).toBe(false)
    expect(minimal.days.at(-1)!.code).toBe('F')
    expect(minimal.recommendedVacationComplete).toBe(false)
    expect(minimal.message).toContain('10.04.2027')
    const full = raceConflict(withVacation(cal, '2027-04-10', '2027-04-16'))
    expect(full.recommendedVacationComplete).toBe(true)
    expect(vacationReminderDue(vac, '2026-12-01')).toBe(false)
  })

  it('Erinnerung beim ersten Start und an den Erinnerungsterminen, bis Urlaub eingetragen ist', () => {
    expect(vacationReminderDue(cal, '2026-11-09')).toBe(true)
    expect(vacationReminderDue(cal, '2026-11-20', '2026-11-09')).toBe(false)
    expect(vacationReminderDue(cal, '2026-12-01', '2026-11-09')).toBe(true)
    expect(vacationReminderDue(cal, '2026-12-05', '2026-12-01')).toBe(false)
  })

  it('Checkliste: Anreise Deggendorf, Startort prüfen, Pflichtausrüstung, Verpflegung für 11 h, Start 08:30', () => {
    const text = raceChecklist()
      .map((i) => i.text)
      .join(' ')
    for (const k of ['Deggendorf', 'Startort', 'Pflichtausrüstung', 'Verpflegungsplan', '11 h', '06:00', '08:30', '10.04.–16.04.2027', 'Schnee']) expect(text).toContain(k)
    for (const k of ['Arberland', 'Ehrwald', 'Stirnlampe', 'Nap', 'vorläufig']) expect(text).not.toContain(k)
    expect(new Set(raceChecklist().map((i) => i.id)).size).toBe(raceChecklist().length)
  })

  it('Texte für die Oberfläche kommen aus der Konfiguration', () => {
    expect(raceHeadline()).toBe('Soul Trail · 17.04.2027, 08:30 Uhr')
    expect(raceFacts()).toBe('55 km, 2.000 hm, Start 08:30 Uhr, Zeitlimit 11 h')
    expect(raceDateLong()).toBe('Samstag, 17.04.2027, 08:30 Uhr')
  })

  it('Taper: Nachtschichten werden hervorgehoben, Urlaub entfernt sie', () => {
    const notes = taperShiftNotes(cal)
    expect(notes.map((n) => n.date)).toEqual(['2027-04-01', '2027-04-06', '2027-04-11', '2027-04-16'])
    expect(taperShiftNotes(withVacation(cal, '2027-04-10', '2027-04-16')).map((n) => n.date)).toEqual(['2027-04-01', '2027-04-06'])
  })

  it('Taper-Phase im Plan: Tag nach der Nachtschicht ohne Einheit, Rennwoche mit Urlaub neu geplant', () => {
    const plan = generatePlan()
    for (const d of ['2027-04-02', '2027-04-07', '2027-04-12']) expect(plan.days.find((x) => x.date === d)!.sessions).toEqual([])
    const withVac = generatePlan({ calendar: withVacation(cal, '2027-04-10', '2027-04-16') })
    const d12 = withVac.days.find((x) => x.date === '2027-04-12')!
    expect(d12.shift.code).toBe('U')
    expect(d12.window!.end).toBeGreaterThan(plan.days.find((x) => x.date === '2027-04-12')!.window!.end)
  })

  it('Countdown bis Samstag 08:30 Uhr', () => {
    const now = berlinToInstant('2027-04-16', 6 * 60 + 30)
    expect(raceCountdown(now)).toMatchObject({ days: 1, hours: 2, minutes: 0, started: false })
    expect(raceCountdown(berlinToInstant('2027-04-17', 8 * 60 + 31)).started).toBe(true)
  })
})
