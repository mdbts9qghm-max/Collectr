import { describe, expect, it } from 'vitest'
import { generatePlan } from '../plan'
import { createShiftCalendar, withOverride } from '../shift'
import { buildIcs, escapeText, foldLine } from './ics'

const cal = createShiftCalendar()
const plan = generatePlan()
const base = { now: '2026-09-28T10:00:00.000Z', sessions: true, shifts: true, sleep: true }

function events(ics: string) {
  return ics.split('BEGIN:VEVENT').slice(1).map((e) => e.split('END:VEVENT')[0]!.replace(/\r\n /g, ''))
}

describe('Kalender-Export (.ics)', () => {
  const ics = buildIcs(plan, cal, { ...base, from: '2026-10-02', to: '2026-10-06' })

  it('Aufbau nach RFC 5545 mit Zeitzone Europe/Berlin und CRLF', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics).toContain('BEGIN:VTIMEZONE\r\nTZID:Europe/Berlin')
    expect(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true)
    expect(ics.match(/BEGIN:VEVENT/g)!.length).toBe(ics.match(/END:VEVENT/g)!.length)
  })

  it('Schichten mit Dienstzeiten, Nachtschicht endet am Folgetag', () => {
    const ev = events(ics)
    const t = ev.find((e) => e.includes('UID:schicht-2026-10-02@collectr'))!
    expect(t).toContain('DTSTART;TZID=Europe/Berlin:20261002T070000')
    expect(t).toContain('DTEND;TZID=Europe/Berlin:20261002T190000')
    expect(t).toContain('SUMMARY:Tagschicht (Beginn 06:45)')
    const n = ev.find((e) => e.includes('UID:schicht-2026-10-03@collectr'))!
    expect(n).toContain('DTEND;TZID=Europe/Berlin:20261004T070000')
    expect(ev.some((e) => e.includes('UID:schicht-2026-10-04@'))).toBe(false) // Schlaftag
  })

  it('Einheiten mit Startzeit, Dauer und Beschreibung', () => {
    const day = plan.days.find((d) => d.date === '2026-10-03')!
    const s = day.sessions[0]!
    const ev = events(ics).find((e) => e.includes(`UID:einheit-${s.id}@collectr`))!
    expect(ev).toContain(`SUMMARY:${escapeText(s.title)}`)
    expect(ev).toContain('DESCRIPTION:')
    expect(ev).toContain('CATEGORIES:Training')
    const start = s.startMin!
    expect(ev).toContain(`DTSTART;TZID=Europe/Berlin:20261003T${String(Math.floor(start / 60)).padStart(2, '0')}${String(start % 60).padStart(2, '0')}00`)
  })

  it('Schlaf: Nap vor der Nachtschicht, Tagschlaf danach, keine Nacht in der Dienstnacht', () => {
    const ev = events(ics)
    expect(ev.some((e) => e.includes('UID:nap-2026-10-03@'))).toBe(true)
    expect(ev.some((e) => e.includes('UID:tagschlaf-2026-10-04@'))).toBe(true)
    expect(ev.some((e) => e.includes('UID:nacht-2026-10-03@'))).toBe(false)
    expect(ev.some((e) => e.includes('UID:nacht-2026-10-02@'))).toBe(true)
  })

  it('Auswahl: nur Schichten', () => {
    const only = buildIcs(plan, cal, { ...base, sessions: false, sleep: false, from: '2026-10-02', to: '2026-10-06' })
    const ev = events(only)
    expect(ev.every((e) => e.includes('UID:schicht-'))).toBe(true)
    expect(ev.length).toBe(2) // 02.10. Tagschicht, 03.10. Nachtschicht
  })

  it('Urlaub ganztägig, Sommerzeit bleibt Ortszeit', () => {
    const c = withOverride(cal, { date: '2027-03-29', kind: 'URLAUB' })
    const ics2 = buildIcs(plan, c, { ...base, sessions: false, sleep: false, from: '2027-03-26', to: '2027-03-29' })
    expect(ics2).toContain('DTSTART;VALUE=DATE:20270329')
    expect(ics2).toContain('DTEND;VALUE=DATE:20270330')
    // Nachtschicht 27./28.03.2027 über die Zeitumstellung: Ortszeiten bleiben 19:00/07:00
    expect(ics2).toContain('DTSTART;TZID=Europe/Berlin:20270327T190000')
    expect(ics2).toContain('DTEND;TZID=Europe/Berlin:20270328T070000')
  })

  it('Escaping und Falten', () => {
    expect(escapeText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne')
    const long = `DESCRIPTION:${'ü'.repeat(80)}`
    const folded = foldLine(long)
    expect(folded.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true)
    expect(folded.replace(/\r\n /g, '')).toBe(long)
  })
})
