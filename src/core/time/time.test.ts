import { describe, expect, it } from 'vitest'
import {
  addDays,
  berlinToInstant,
  dateRange,
  daysBetween,
  formatDateDE,
  formatNumberDE,
  formatTime,
  instantToBerlin,
  isoWeek,
  isValidDate,
  localMinutesBetween,
  normalizeDateTime,
  weekday,
  weekdayShortDE,
} from './index'

describe('Kalender-Arithmetik', () => {
  it('addiert Tage über Monats- und Jahresgrenzen', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28')
    expect(addDays('2026-10-02', 259)).toBe('2027-06-18')
  })

  it('zählt Tage unabhängig von der Sommerzeit', () => {
    expect(daysBetween('2027-03-27', '2027-03-29')).toBe(2) // Umstellung 28.03.2027
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2) // Umstellung 25.10.2026
    expect(daysBetween('2026-10-02', '2027-06-18')).toBe(259)
    expect(daysBetween('2026-10-02', '2026-10-01')).toBe(-1)
  })

  it('erzeugt Datumsbereiche inklusive Ende', () => {
    expect(dateRange('2026-10-02', '2026-10-06')).toHaveLength(5)
  })

  it('erkennt Wochentage', () => {
    expect(weekday('2026-10-02')).toBe(4) // Freitag
    expect(weekdayShortDE('2027-06-18')).toBe('Fr')
    expect(weekdayShortDE('2027-06-14')).toBe('Mo')
  })

  it('berechnet ISO-Kalenderwochen', () => {
    expect(isoWeek('2026-10-02')).toEqual({ year: 2026, week: 40 })
    expect(isoWeek('2027-01-01')).toEqual({ year: 2026, week: 53 })
    expect(isoWeek('2027-01-04')).toEqual({ year: 2027, week: 1 })
    expect(isoWeek('2027-06-18')).toEqual({ year: 2027, week: 24 })
  })

  it('lehnt ungültige Daten ab', () => {
    expect(isValidDate('2027-02-30')).toBe(false)
    expect(isValidDate('2027-02-28')).toBe(true)
    expect(() => addDays('18.06.2027', 1)).toThrow()
  })
})

describe('Formatierung (Deutsch)', () => {
  it('formatiert TT.MM.JJJJ und HH:MM', () => {
    expect(formatDateDE('2027-06-18')).toBe('18.06.2027')
    expect(formatTime(18 * 60 + 45)).toBe('18:45')
    expect(formatTime(24 * 60 + 7 * 60)).toBe('07:00')
    expect(formatNumberDE(5.5)).toBe('5,5')
    expect(formatNumberDE(6)).toBe('6')
  })

  it('normalisiert Zeiten über Mitternacht', () => {
    expect(normalizeDateTime('2026-10-03', 1860)).toEqual({ date: '2026-10-04', minutes: 420 })
    expect(normalizeDateTime('2026-10-03', -30)).toEqual({ date: '2026-10-02', minutes: 1410 })
    expect(localMinutesBetween({ date: '2026-10-03', minutes: 1320 }, { date: '2026-10-04', minutes: 360 })).toBe(480)
  })
})

describe('Zeitzone Europe/Berlin', () => {
  it('rechnet Winter- und Sommerzeit korrekt um', () => {
    expect(instantToBerlin('2027-01-10T06:00:00Z')).toEqual({ date: '2027-01-10', minutes: 7 * 60 })
    expect(instantToBerlin('2027-06-18T21:00:00Z')).toEqual({ date: '2027-06-18', minutes: 23 * 60 })
    expect(new Date(berlinToInstant('2027-06-18', 23 * 60)).toISOString()).toBe('2027-06-18T21:00:00.000Z')
    expect(new Date(berlinToInstant('2027-01-10', 7 * 60)).toISOString()).toBe('2027-01-10T06:00:00.000Z')
  })

  it('bleibt über die Umstellung am 28.03.2027 konsistent', () => {
    // 01:30 MEZ = 00:30Z, 03:30 MESZ = 01:30Z
    expect(instantToBerlin('2027-03-28T00:30:00Z')).toEqual({ date: '2027-03-28', minutes: 90 })
    expect(instantToBerlin('2027-03-28T01:30:00Z')).toEqual({ date: '2027-03-28', minutes: 210 })
    const start = berlinToInstant('2027-03-27', 23 * 60)
    const end = berlinToInstant('2027-03-28', 7 * 60)
    expect((end - start) / 60000).toBe(7 * 60) // eine Stunde kürzer
  })

  it('ist unabhängig von der Prozess-Zeitzone', () => {
    expect(process.env.TZ).toBe('America/New_York')
    expect(instantToBerlin('2026-10-02T04:45:00Z')).toEqual({ date: '2026-10-02', minutes: 6 * 60 + 45 })
  })
})
