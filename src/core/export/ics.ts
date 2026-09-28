// Kalender-Export (.ics, RFC 5545, SPEC 9.9): Trainingseinheiten, Schichten und Schlaf/Nap.
// Zeiten in Europe/Berlin mit VTIMEZONE, stabile UIDs, Zeilen gefaltet.

import { effectiveShift, shiftLabel, type ShiftCalendar } from '../shift'
import { recommendSleep } from '../sleep'
import { addDays, compareDates, normalizeDateTime } from '../time'
import type { LocalDate, LocalDateTime, Minutes, Plan, PlannedSession } from '../types'

export interface IcsOptions {
  from: LocalDate
  to: LocalDate
  sessions: boolean
  shifts: boolean
  sleep: boolean
  /** DTSTAMP (Zeitpunkt des Exports, ISO). */
  now: string
}

const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Berlin',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:MESZ',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:MEZ',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
]

/** Text escapen (RFC 5545: Backslash, Semikolon, Komma, Zeilenumbruch). */
export function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Zeilen nach 75 Oktetten falten (UTF-8-sicher, Folgezeilen beginnen mit Leerzeichen). */
export function foldLine(line: string): string {
  const enc = new TextEncoder()
  if (enc.encode(line).length <= 75) return line
  const parts: string[] = []
  let cur = ''
  let curBytes = 0
  for (const ch of line) {
    const b = enc.encode(ch).length
    const limit = parts.length === 0 ? 75 : 74
    if (curBytes + b > limit) {
      parts.push(cur)
      cur = ''
      curBytes = 0
    }
    cur += ch
    curBytes += b
  }
  parts.push(cur)
  return parts.join('\r\n ')
}

const pad = (n: number) => String(n).padStart(2, '0')

function localStamp(dt: LocalDateTime): string {
  return `${dt.date.replace(/-/g, '')}T${pad(Math.floor(dt.minutes / 60))}${pad(dt.minutes % 60)}00`
}

function utcStamp(iso: string): string {
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

interface Ev {
  uid: string
  summary: string
  description?: string
  start: LocalDateTime | LocalDate
  end: LocalDateTime | LocalDate
  categories?: string
}

function eventLines(e: Ev, now: string): string[] {
  const allDay = typeof e.start === 'string'
  const lines = ['BEGIN:VEVENT', `UID:${e.uid}@collectr`, `DTSTAMP:${utcStamp(now)}`]
  if (allDay) {
    lines.push(`DTSTART;VALUE=DATE:${(e.start as string).replace(/-/g, '')}`, `DTEND;VALUE=DATE:${(e.end as string).replace(/-/g, '')}`)
  } else {
    lines.push(`DTSTART;TZID=Europe/Berlin:${localStamp(e.start as LocalDateTime)}`, `DTEND;TZID=Europe/Berlin:${localStamp(e.end as LocalDateTime)}`)
  }
  lines.push(`SUMMARY:${escapeText(e.summary)}`)
  if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`)
  if (e.categories) lines.push(`CATEGORIES:${escapeText(e.categories)}`)
  lines.push('END:VEVENT')
  return lines
}

const at = (date: LocalDate, m: Minutes) => normalizeDateTime(date, m)

function sessionDescription(s: PlannedSession): string {
  const parts = [s.goal, `Intensität: ${s.intensity.label}`, `Aufwärmen: ${s.structure.warmup}`, `Hauptteil: ${s.structure.main}`, `Abwärmen: ${s.structure.cooldown}`]
  if (s.exercises?.length) {
    parts.push(
      'Übungen:',
      ...s.exercises.map((e) => `- ${e.name}: ${e.sets} × ${e.reps !== undefined ? `${e.reps} Wdh.` : e.holdSec !== undefined ? `${e.holdSec} s` : 'max.'}${e.perSide ? ' je Seite' : ''}, Pause ${e.restSec} s`),
    )
  }
  parts.push('Geplanter Stand – die tagesaktuelle Anpassung an deine Erholung siehst du in der App.')
  return parts.join('\n')
}

export function buildIcs(plan: Plan, cal: ShiftCalendar, opts: IcsOptions): string {
  const events: Ev[] = []
  for (const day of plan.days) {
    if (compareDates(day.date, opts.from) < 0 || compareDates(day.date, opts.to) > 0) continue
    if (opts.sessions) {
      for (const s of day.sessions) {
        const start = s.startMin ?? day.window?.start ?? 9 * 60
        events.push({
          uid: `einheit-${s.id}`,
          summary: `${s.optional ? '(optional) ' : ''}${s.title}`,
          description: sessionDescription(s),
          start: at(day.date, start),
          end: at(day.date, start + s.durationMin),
          categories: 'Training',
        })
      }
    }
    if (opts.shifts) {
      const sh = effectiveShift(cal, day.date)
      if (sh.work) {
        events.push({
          uid: `schicht-${day.date}`,
          summary: `${shiftLabel(sh.code)} (Beginn ${pad(Math.floor(sh.work.actualStart / 60))}:${pad(sh.work.actualStart % 60)})`,
          start: at(day.date, sh.work.start),
          end: at(day.date, sh.work.end),
          categories: 'Dienst',
        })
      } else if (sh.code === 'U' || sh.code === 'K') {
        events.push({ uid: `schicht-${day.date}`, summary: shiftLabel(sh.code), start: day.date, end: addDays(day.date, 1), categories: 'Dienst' })
      }
    }
    if (opts.sleep) {
      const r = recommendSleep({ cal, date: day.date, plan })
      if (r.nap) events.push({ uid: `nap-${day.date}`, summary: 'Nap', start: r.nap.start, end: r.nap.end, categories: 'Schlaf' })
      if (r.daySleep) events.push({ uid: `tagschlaf-${day.date}`, summary: 'Schlaf nach der Nachtschicht', start: r.daySleep.start, end: r.daySleep.end, categories: 'Schlaf' })
      if (r.night) events.push({ uid: `nacht-${day.date}`, summary: 'Schlafen', ...(r.tip ? { description: r.tip } : {}), start: r.night.start, end: r.night.end, categories: 'Schlaf' })
    }
  }
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Collectr//Ehrwald Trail 2027//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Collectr Training', 'X-WR-TIMEZONE:Europe/Berlin', ...VTIMEZONE]
  for (const e of events) lines.push(...eventLines(e, opts.now))
  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join('\r\n') + '\r\n'
}
