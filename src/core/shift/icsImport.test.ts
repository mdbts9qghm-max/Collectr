import { describe, expect, it } from 'vitest'
import { createShiftCalendar, withOverride } from './calendar'
import { buildImportPreview, classifyEvents, parseIcsEvents } from './icsImport'

const cal = createShiftCalendar()

function ics(...events: string[]) {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events.flatMap((e) => ['BEGIN:VEVENT', ...e.split('\n'), 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n')
}

describe('Dienstplan-Import (.ics)', () => {
  it('liest TZID, UTC, ganztägig und gefaltete Zeilen', () => {
    const ev = parseIcsEvents(
      ics(
        'DTSTART;TZID=Europe/Berlin:20261002T070000\nDTEND;TZID=Europe/Berlin:20261002T190000\nSUMMARY:Dienst',
        'DTSTART:20261003T170000Z\nDTEND:20261004T050000Z\nSUMMARY:Nacht\n dienst',
        'DTSTART;VALUE=DATE:20261010\nDTEND;VALUE=DATE:20261013\nSUMMARY:Urlaub\\, Berge',
      ),
    )
    expect(ev).toHaveLength(3)
    expect(ev[0]).toMatchObject({ allDay: false, start: { date: '2026-10-02', minutes: 420 }, end: { date: '2026-10-02', minutes: 1140 } })
    expect(ev[1]).toMatchObject({ summary: 'Nachtdienst', start: { date: '2026-10-03', minutes: 1140 }, end: { date: '2026-10-04', minutes: 420 } })
    expect(ev[2]).toMatchObject({ allDay: true, summary: 'Urlaub, Berge', start: { date: '2026-10-10' }, end: { date: '2026-10-13' } })
  })

  it('Stichwort vor Uhrzeit, sonst Beginnzeit mit Toleranz; Unbekanntes wird gelistet', () => {
    const { entries, unknown } = classifyEvents(
      parseIcsEvents(
        ics(
          'DTSTART:20261002T080000\nDTEND:20261002T200000\nSUMMARY:Dienst',
          'DTSTART:20261003T070000\nDTEND:20261003T150000\nSUMMARY:Fortbildung Reanimation',
          'DTSTART:20261004T122000\nDTEND:20261004T130000\nSUMMARY:Zahnarzt',
          'DTSTART;VALUE=DATE:20261010\nDTEND;VALUE=DATE:20261013\nSUMMARY:Urlaub',
          'DTSTART;VALUE=DATE:20261015\nSUMMARY:Geburtstag',
          'DTSTART:20261016T185000\nDTEND:20261017T070000\nSUMMARY:Dienst am Freitag',
        ),
      ),
      cal,
    )
    expect(entries.map((e) => `${e.date}:${e.kind}`)).toEqual([
      '2026-10-02:V',
      '2026-10-03:FORTBILDUNG',
      '2026-10-10:URLAUB',
      '2026-10-11:URLAUB',
      '2026-10-12:URLAUB',
      '2026-10-16:N', // „Freitag“ ist kein „frei“
    ])
    expect(unknown.map((u) => u.date)).toEqual(['2026-10-04', '2026-10-15'])
  })

  it('Vorschau enthält nur Abweichungen vom Rhythmus', () => {
    const p = buildImportPreview(
      ics(
        // 02.10. Tagschicht wie geplant → keine Änderung
        'DTSTART:20261002T070000\nDTEND:20261002T190000\nSUMMARY:Tagdienst',
        // 03.10. Nachtschicht wie geplant
        'DTSTART:20261003T190000\nDTEND:20261004T070000\nSUMMARY:Nachtdienst',
        // 06.10. (Tag 5, frei) → V-Schicht
        'DTSTART:20261006T080000\nDTEND:20261006T200000\nSUMMARY:V-Dienst',
        // 07.10. Tagschicht → getauscht auf frei
        'DTSTART;VALUE=DATE:20261007\nSUMMARY:Frei',
        // 12.10. Tagschicht mit Überstunden bis 21:00
        'DTSTART:20261012T070000\nDTEND:20261012T210000\nSUMMARY:Tagdienst',
        // 13.10. Nachtschicht → krank
        'DTSTART;VALUE=DATE:20261013\nSUMMARY:krank',
        // 15.10. frei laut Rhythmus → Tagschicht (Tausch)
        'DTSTART:20261015T070000\nDTEND:20261015T190000\nSUMMARY:Tagdienst',
      ),
      cal,
    )
    expect(p.unchanged).toBe(2)
    expect(p.from).toBe('2026-10-02')
    expect(p.to).toBe('2026-10-15')
    expect(p.changes.map((c) => ({ date: c.date, kind: c.override.kind, swapTo: c.override.swapTo, end: c.override.end }))).toEqual([
      { date: '2026-10-06', kind: 'V', swapTo: undefined, end: undefined },
      { date: '2026-10-07', kind: 'TAUSCH', swapTo: 'F', end: undefined },
      { date: '2026-10-12', kind: 'UEBERSTUNDEN', swapTo: undefined, end: 21 * 60 },
      { date: '2026-10-13', kind: 'KRANK', swapTo: undefined, end: undefined },
      { date: '2026-10-15', kind: 'TAUSCH', swapTo: 'T', end: undefined },
    ])
    expect(p.changes.every((c) => c.override.source === 'ics')).toBe(true)
    expect(p.changes[0]!.text).toBe('06.10.2026: Frei → V-Schicht')
  })

  it('bereits eingetragene Overrides erzeugen keine doppelte Änderung', () => {
    const c = withOverride(cal, { date: '2026-10-06', kind: 'V' })
    const p = buildImportPreview(ics('DTSTART:20261006T080000\nDTEND:20261006T200000\nSUMMARY:Dienst'), c)
    expect(p.changes).toEqual([])
    expect(p.unchanged).toBe(1)
  })

  it('leere oder fremde Dateien ergeben eine leere Vorschau', () => {
    expect(buildImportPreview('kein Kalender', cal)).toEqual({ changes: [], unknown: [], unchanged: 0 })
  })
})
