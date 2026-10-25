import { describe, expect, it } from 'vitest'
import { generatePlan } from '../plan'
import { createShiftCalendar, withOverride, withVacation } from '../shift'
import { berlinToInstant } from '../time'
import { raceChecklist, raceConflict, raceCountdown, raceDateLong, raceFacts, raceHeadline, taperShiftNotes, vacationReminderDue } from './index'

const cal = createShiftCalendar()

describe('Rennwoche und Urlaubswarnung (SPEC 7, 11, Arberland Classic Trail)', () => {
  it('Konflikt ohne Urlaub: Vortag Tagschicht (Anreise), Renntag Nachtschicht', () => {
    const c = raceConflict(cal)
    expect(c.hasConflict).toBe(true)
    expect(c.days.map((d) => [d.date, d.code])).toEqual([
      ['2027-09-17', 'T'],
      ['2027-09-18', 'N'],
    ])
    expect(c.message).toContain('07:00 Uhr')
    expect(c.message).toContain('Urlaub')
    expect(c.message).toContain('17.09.2027–18.09.2027')
    expect(c.message).toContain('12.09.2027')
  })

  it('V-Schicht am Renntag ist ebenfalls ein Konflikt', () => {
    const c = raceConflict(withOverride(withVacation(cal, '2027-09-17', '2027-09-17'), { date: '2027-09-18', kind: 'V' }))
    expect(c.hasConflict).toBe(true)
    expect(c.days[1]!.isWork).toBe(true)
  })

  it('mit Urlaub 17.–18.09. verschwindet die Warnung, 12.–19.09. ist vollständig', () => {
    const minimal = raceConflict(withVacation(cal, '2027-09-17', '2027-09-18'))
    expect(minimal.hasConflict).toBe(false)
    expect(minimal.recommendedVacationComplete).toBe(false)
    expect(minimal.message).toContain('12.09.2027')
    const full = raceConflict(withVacation(cal, '2027-09-12', '2027-09-19'))
    expect(full.recommendedVacationComplete).toBe(true)
    expect(vacationReminderDue(withVacation(cal, '2027-09-17', '2027-09-18'), '2026-12-01')).toBe(false)
  })

  it('Erinnerung beim ersten Start und an den Erinnerungsterminen, bis Urlaub eingetragen ist', () => {
    expect(vacationReminderDue(cal, '2026-10-26')).toBe(true)
    expect(vacationReminderDue(cal, '2026-11-20', '2026-10-26')).toBe(false)
    expect(vacationReminderDue(cal, '2026-12-01', '2026-10-26')).toBe(true)
    expect(vacationReminderDue(cal, '2026-12-05', '2026-12-01')).toBe(false)
  })

  it('Checkliste: Anreise, Pflichtausrüstung, Verpflegung für 13 h, früher Start, vorläufiger Termin', () => {
    const text = raceChecklist()
      .map((i) => i.text)
      .join(' ')
    for (const k of ['Bayerisch Eisenstein', 'Pflichtausrüstung', 'Verpflegungsplan', '13 h', '04:30', '07:00', '12.09.–19.09.2027', 'vorläufig']) expect(text).toContain(k)
    for (const k of ['Ehrwald', 'Stirnlampe', 'Nap']) expect(text).not.toContain(k)
    expect(new Set(raceChecklist().map((i) => i.id)).size).toBe(raceChecklist().length)
  })

  it('Texte für die Oberfläche kommen aus der Konfiguration', () => {
    expect(raceHeadline()).toBe('Arberland Classic Trail · 18.09.2027, 07:00 Uhr')
    expect(raceFacts()).toBe('66 km, 2.514 hm, Start 07:00 Uhr, Zeitlimit 13 h')
    expect(raceDateLong()).toBe('Samstag, 18.09.2027, 07:00 Uhr (vorläufig)')
  })

  it('Taper: Nachtschichten werden hervorgehoben, Urlaub entfernt sie', () => {
    const notes = taperShiftNotes(cal)
    expect(notes.map((n) => n.date)).toEqual(['2027-09-03', '2027-09-08', '2027-09-13'])
    expect(taperShiftNotes(withVacation(cal, '2027-09-12', '2027-09-19')).map((n) => n.date)).toEqual(['2027-09-03', '2027-09-08'])
  })

  it('Taper-Phase im Plan: Tag nach der Nachtschicht ohne Einheit, Rennwoche mit Urlaub neu geplant', () => {
    const plan = generatePlan()
    for (const d of ['2027-09-04', '2027-09-09', '2027-09-14']) expect(plan.days.find((x) => x.date === d)!.sessions).toEqual([])
    const withVac = generatePlan({ calendar: withVacation(cal, '2027-09-12', '2027-09-19') })
    const d14 = withVac.days.find((x) => x.date === '2027-09-14')!
    expect(d14.shift.code).toBe('U')
    expect(d14.window!.end).toBeGreaterThan(plan.days.find((x) => x.date === '2027-09-14')!.window!.end)
  })

  it('Countdown bis Samstag 07:00 Uhr', () => {
    const now = berlinToInstant('2027-09-17', 5 * 60)
    expect(raceCountdown(now)).toMatchObject({ days: 1, hours: 2, minutes: 0, started: false })
    expect(raceCountdown(berlinToInstant('2027-09-18', 7 * 60 + 1)).started).toBe(true)
  })
})
