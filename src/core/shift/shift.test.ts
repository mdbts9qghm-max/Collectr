import { describe, expect, it } from 'vitest'
import { formatTime } from '../time'
import {
  baseShift,
  createShiftCalendar,
  cycleDay,
  effectiveShift,
  fitsWindow,
  shiftContext,
  trainingWindow,
  withOverride,
  withVacation,
} from './index'

const cal = createShiftCalendar()

describe('Zyklustag ab 02.10.2026 (SPEC 4.1, 11)', () => {
  it('Ankerdatum ist Tag 1 (Tagschicht)', () => {
    expect(cycleDay('2026-10-02')).toBe(1)
    expect(baseShift('2026-10-02')).toBe('T')
    expect(baseShift('2026-10-03')).toBe('N')
    expect(baseShift('2026-10-04')).toBe('S')
    expect(baseShift('2026-10-05')).toBe('F')
    expect(baseShift('2026-10-06')).toBe('F')
    expect(cycleDay('2026-10-07')).toBe(1)
  })

  it('rechnet korrekt über den Jahreswechsel', () => {
    expect(cycleDay('2026-12-31')).toBe(1)
    expect(cycleDay('2027-01-01')).toBe(2)
    expect(cycleDay('2027-01-02')).toBe(3)
  })

  it('ist von den Sommerzeitumstellungen unbeeinflusst', () => {
    // 25.10.2026 (Ende Sommerzeit) und 28.03.2027 (Beginn Sommerzeit)
    expect(cycleDay('2026-10-24')).toBe(3)
    expect(cycleDay('2026-10-25')).toBe(4)
    expect(cycleDay('2026-10-26')).toBe(5)
    expect(cycleDay('2027-03-27')).toBe(2)
    expect(cycleDay('2027-03-28')).toBe(3)
    expect(cycleDay('2027-03-29')).toBe(4)
  })

  it('Rennwoche wie in SPEC 7: 18.06.2027 = Tag 5, 19.06. = Tagschicht', () => {
    expect(cycleDay('2027-06-14')).toBe(1)
    expect(cycleDay('2027-06-15')).toBe(2)
    expect(cycleDay('2027-06-16')).toBe(3)
    expect(cycleDay('2027-06-17')).toBe(4)
    expect(cycleDay('2027-06-18')).toBe(5)
    expect(baseShift('2027-06-19')).toBe('T')
    expect(baseShift('2027-06-20')).toBe('N')
  })

  it('funktioniert auch vor dem Ankerdatum', () => {
    expect(cycleDay('2026-10-01')).toBe(5)
    expect(cycleDay('2026-09-28')).toBe(2)
  })
})

describe('Arbeitszeiten und Losfahren (SPEC 4.1, 4.2)', () => {
  it('Tagschicht: Beginn 06:45, Losfahren 06:30', () => {
    const s = effectiveShift(cal, '2026-10-02')
    expect(s.isWork).toBe(true)
    expect(formatTime(s.work!.actualStart)).toBe('06:45')
    expect(formatTime(s.work!.departure)).toBe('06:30')
    expect(s.dayKind).toBe('work')
  })

  it('Nachtschicht: Beginn 18:45, Losfahren 18:30, Ende am Folgetag 07:00', () => {
    const s = effectiveShift(cal, '2026-10-03')
    expect(formatTime(s.work!.actualStart)).toBe('18:45')
    expect(formatTime(s.work!.departure)).toBe('18:30')
    expect(s.work!.end).toBe(24 * 60 + 7 * 60)
    expect(s.dayKind).toBe('pre_night')
  })

  it('Schlaftag nach der Nacht, freie Tage 4 und 5', () => {
    expect(effectiveShift(cal, '2026-10-04').dayKind).toBe('sleep_day')
    expect(effectiveShift(cal, '2026-10-04').postNight).toBe(true)
    expect(effectiveShift(cal, '2026-10-05').dayKind).toBe('free')
    expect(effectiveShift(cal, '2026-10-06').dayKind).toBe('free')
  })
})

describe('Overrides (SPEC 4.1)', () => {
  it('V-Schicht auf Tag 5: Arbeitstag 07:45, kein Training', () => {
    const c = withOverride(cal, { date: '2026-10-06', kind: 'V' })
    const s = effectiveShift(c, '2026-10-06')
    expect(s.code).toBe('V')
    expect(formatTime(s.work!.actualStart)).toBe('07:45')
    expect(formatTime(s.work!.departure)).toBe('07:30')
    expect(trainingWindow(c, '2026-10-06')).toBeNull()
  })

  it('Urlaub zählt als frei', () => {
    const c = withOverride(cal, { date: '2026-10-02', kind: 'URLAUB' })
    const s = effectiveShift(c, '2026-10-02')
    expect(s.code).toBe('U')
    expect(s.dayKind).toBe('free')
    expect(trainingWindow(c, '2026-10-02')).not.toBeNull()
  })

  it('Krank: kein Training', () => {
    const c = withOverride(cal, { date: '2026-10-05', kind: 'KRANK' })
    expect(effectiveShift(c, '2026-10-05').dayKind).toBe('sick')
    expect(trainingWindow(c, '2026-10-05')).toBeNull()
  })

  it('Tausch einer Nachtschicht macht den Folgetag zu einem normalen freien Tag', () => {
    const c = withOverride(cal, { date: '2026-10-03', kind: 'TAUSCH', swapTo: 'F' })
    expect(effectiveShift(c, '2026-10-03').dayKind).toBe('free')
    const s = effectiveShift(c, '2026-10-04')
    expect(s.code).toBe('F')
    expect(s.dayKind).toBe('free')
  })

  it('Tausch auf Nachtschicht an Tag 4 macht Tag 5 zum Schlaftag', () => {
    const c = withOverride(cal, { date: '2026-10-05', kind: 'TAUSCH', swapTo: 'N' })
    expect(effectiveShift(c, '2026-10-05').dayKind).toBe('pre_night')
    expect(effectiveShift(c, '2026-10-06').dayKind).toBe('sleep_day')
  })

  it('Überstunden verlängern den Dienst', () => {
    const c = withOverride(cal, { date: '2026-10-02', kind: 'UEBERSTUNDEN', end: 21 * 60 })
    expect(effectiveShift(c, '2026-10-02').work!.end).toBe(21 * 60)
  })

  it('Fortbildung ist ein Arbeitstag mit eigenen Zeiten', () => {
    const c = withOverride(cal, { date: '2026-10-05', kind: 'FORTBILDUNG', start: 9 * 60, end: 17 * 60 })
    const s = effectiveShift(c, '2026-10-05')
    expect(s.code).toBe('FB')
    expect(s.work!.start).toBe(540)
    expect(trainingWindow(c, '2026-10-05')).toBeNull()
  })

  it('Urlaub für einen Zeitraum', () => {
    const c = withVacation(cal, '2027-06-14', '2027-06-20')
    expect(effectiveShift(c, '2027-06-19').code).toBe('U')
    expect(effectiveShift(c, '2027-06-16').dayKind).toBe('free') // Vortag keine Nacht mehr
  })
})

describe('Trainingsfenster (SPEC 4.3)', () => {
  it('Tag 1: kein Fenster', () => {
    expect(trainingWindow(cal, '2026-10-02')).toBeNull()
  })

  it('Tag 2: 08:00–13:30, endet 90 min vor dem Nap um 15:00', () => {
    const w = trainingWindow(cal, '2026-10-03')!
    expect(formatTime(w.start)).toBe('08:00')
    expect(formatTime(w.end)).toBe('13:30')
    expect(w.easyOnly).toBe(false)
  })

  it('Tag 3: ab 15:00, nur locker, endet 3 h vor der Schlafenszeit', () => {
    const w = trainingWindow(cal, '2026-10-04')!
    expect(formatTime(w.start)).toBe('15:00')
    expect(formatTime(w.end)).toBe('19:30') // Schlafenszeit 22:30
    expect(w.easyOnly).toBe(true)
  })

  it('Tag 4: ganztägig, Nachtlauf erlaubt (Tag 5 frei)', () => {
    const w = trainingWindow(cal, '2026-10-05')!
    expect(w.nightRunAllowed).toBe(true)
  })

  it('Tag 5: kein Nachtlauf, weil am Folgetag Tagschicht ist', () => {
    expect(trainingWindow(cal, '2026-10-06')!.nightRunAllowed).toBe(false)
  })

  it('Tag 4 vor einer V-Schicht: kein Nachtlauf', () => {
    const c = withOverride(cal, { date: '2026-10-06', kind: 'V' })
    expect(trainingWindow(c, '2026-10-05')!.nightRunAllowed).toBe(false)
  })

  it('Fensterprüfung mit Wechselzeit', () => {
    const w = trainingWindow(cal, '2026-10-03')!
    expect(fitsWindow(w, [{ type: 'threshold', durationMin: 70 }, { type: 'legs_heavy', durationMin: 50 }])).toBe(true)
    expect(fitsWindow(w, [{ type: 'long_run', durationMin: 340 }])).toBe(false)
    expect(fitsWindow(null, [{ type: 'easy_run', durationMin: 30 }])).toBe(false)
    expect(fitsWindow(trainingWindow(cal, '2026-10-05'), [{ type: 'night_run', durationMin: 200 }])).toBe(true)
    expect(fitsWindow(trainingWindow(cal, '2026-10-06'), [{ type: 'night_run', durationMin: 200 }])).toBe(false)
  })
})

describe('Schichtkontext (SPEC 6.1)', () => {
  it('Schlaftag 15:00: letzte Nacht gearbeitet, Schichtende vor 8 h', () => {
    const ctx = shiftContext(cal, '2026-10-04', 15 * 60)
    expect(ctx.lastNightWorked).toBe(true)
    expect(ctx.hoursSinceShiftEnd).toBe(8)
  })

  it('Tag 2 um 09:00: nächste Schicht in 9,75 h', () => {
    const ctx = shiftContext(cal, '2026-10-03', 9 * 60)
    expect(ctx.hoursUntilNextShift).toBe(9.75)
    expect(ctx.lastNightWorked).toBe(false)
  })
})
