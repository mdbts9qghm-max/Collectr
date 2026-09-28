import { describe, expect, it } from 'vitest'
import { defaultSettings } from '../data/defaults'
import { buildCalendar, buildPlan, EMPTY_WHOOP, type AppData } from './compute'
import { adherence, recoveryRows } from './recoveryView'
import { berlinToInstant } from '../core/time'

const base = (over: Partial<AppData> = {}, demo = true): AppData => ({
  settings: { ...defaultSettings(), onboarded: true, demoMode: demo },
  overrides: [],
  logs: [],
  manual: [],
  strengthTests: [],
  strengthState: null,
  checklist: {},
  decisions: [],
  whoop: EMPTY_WHOOP,
  assignments: [],
  ...over,
})

describe('Erholungs-Ansicht', () => {
  it('Zeilen mit Schicht-Band, Recovery, HRV-Mittel, Ruhepuls, Schlaf', () => {
    const d = base()
    const cal = buildCalendar(d.settings, [])
    const rows = recoveryRows(d, cal, '2026-11-10', 30)
    expect(rows).toHaveLength(30)
    expect(rows.at(-1)!.date).toBe('2026-11-10')
    expect(new Set(rows.map((r) => r.band))).toEqual(new Set(['day', 'night', 'after_night', 'none']))
    expect(rows.filter((r) => r.score !== undefined).length).toBeGreaterThan(20)
    expect(rows.some((r) => r.hrv7 !== undefined)).toBe(true)
  })

  it('manuelle Tage bekommen eine abgeleitete Bereitschaft', () => {
    const d = base({ manual: [{ date: '2026-10-05', sleepMin: 420, quality: 4, feeling: 4 }] }, false)
    const rows = recoveryRows(d, buildCalendar(d.settings, []), '2026-10-05', 3)
    expect(rows.at(-1)!.score).toBeGreaterThan(50)
    expect(rows.at(-1)!.sleepH).toBe(7)
  })

  it('Schlaf-Umsetzung nur mit WHOOP-Daten', () => {
    const d = base({}, false)
    const cal = buildCalendar(d.settings, [])
    const plan = buildPlan(d, cal, [])
    expect(adherence(d, cal, plan, '2026-10-10', 7)).toBeNull()
    const iso = (date: string, m: number) => new Date(berlinToInstant(date, m)).toISOString()
    const w = base({ whoop: { ...EMPTY_WHOOP, status: { connected: true }, sleeps: [{ id: 'a', start: iso('2026-10-06', 21 * 60 + 40), end: iso('2026-10-07', 5 * 60 + 45), nap: false }] } }, false)
    const a = adherence(w, cal, plan, '2026-10-08', 3)!
    expect(a.days.length).toBeGreaterThan(0)
  })
})
