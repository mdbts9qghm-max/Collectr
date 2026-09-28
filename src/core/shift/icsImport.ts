// Dienstplan-Import aus .ics (SPEC 4.1, optional): Termine lesen, Schicht erkennen und nur die
// Abweichungen vom berechneten Rhythmus als Overrides vorschlagen. Übernahme erst nach Bestätigung.

import { CONFIG } from '../config'
import { addDays, compareDates, formatDateDE, formatTime, instantToBerlin, isValidDate, localMinutesBetween } from '../time'
import type { LocalDate, LocalDateTime, Minutes, ShiftCode, ShiftOverride } from '../types'
import { effectiveShift, shiftLabel, type ShiftCalendar } from './calendar'

const C = CONFIG.icsImport

export interface IcsEvent {
  summary: string
  /** Ganztägig: nur Datum (Ende exklusiv). */
  allDay: boolean
  start: LocalDateTime
  end: LocalDateTime
}

export type ImportKind = 'T' | 'N' | 'V' | 'FREI' | 'URLAUB' | 'KRANK' | 'FORTBILDUNG'

export interface ClassifiedEntry {
  date: LocalDate
  kind: ImportKind
  summary: string
  start?: Minutes
  /** Ende relativ zum Tag (kann > 1440 sein). */
  end?: Minutes
}

export interface ProposedChange {
  date: LocalDate
  override: ShiftOverride
  /** Bisher gültige Schicht. */
  current: ShiftCode
  /** Kurzer Text für die Vorschau, z. B. „Tagschicht → V-Schicht“. */
  text: string
}

export interface ImportPreview {
  changes: ProposedChange[]
  /** Termine ohne erkennbare Schicht. */
  unknown: { date: LocalDate; summary: string }[]
  /** Einträge, die schon zum Plan passen. */
  unchanged: number
  from?: LocalDate
  to?: LocalDate
}

/** Gefaltete Zeilen zusammenführen (RFC 5545: Folgezeile beginnt mit Leerzeichen/Tab). */
function unfold(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n')
}

function unescape(s: string): string {
  return s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim()
}

/** DTSTART/DTEND-Wert in lokale Zeit Europe/Berlin. Andere TZIDs werden als Ortszeit gelesen. */
function parseDateValue(params: string, value: string): { dt: LocalDateTime; allDay: boolean } | null {
  const v = value.trim()
  const d = /^(\d{4})(\d{2})(\d{2})$/.exec(v)
  if (d || /VALUE=DATE(;|$)/i.test(params)) {
    if (!d) return null
    const date = `${d[1]}-${d[2]}-${d[3]}`
    return isValidDate(date) ? { dt: { date, minutes: 0 }, allDay: true } : null
  }
  const t = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z?)$/.exec(v)
  if (!t) return null
  const date = `${t[1]}-${t[2]}-${t[3]}`
  if (!isValidDate(date)) return null
  if (t[7] === 'Z') return { dt: instantToBerlin(`${date}T${t[4]}:${t[5]}:${t[6] ?? '00'}Z`), allDay: false }
  return { dt: { date, minutes: Number(t[4]) * 60 + Number(t[5]) }, allDay: false }
}

/** Liest alle VEVENTs (ohne Wiederholungsregeln). */
export function parseIcsEvents(text: string): IcsEvent[] {
  const events: IcsEvent[] = []
  let cur: { summary?: string; start?: { dt: LocalDateTime; allDay: boolean }; end?: { dt: LocalDateTime; allDay: boolean } } | null = null
  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') cur = {}
    else if (line === 'END:VEVENT') {
      if (cur?.start) {
        const allDay = cur.start.allDay
        const end = cur.end?.dt ?? (allDay ? { date: addDays(cur.start.dt.date, 1), minutes: 0 } : cur.start.dt)
        events.push({ summary: cur.summary ?? '', allDay, start: cur.start.dt, end })
      }
      cur = null
    } else if (cur) {
      const idx = line.indexOf(':')
      if (idx < 0) continue
      const [name = '', ...rest] = line.slice(0, idx).split(';')
      const params = rest.join(';')
      const value = line.slice(idx + 1)
      const key = name.toUpperCase()
      if (key === 'SUMMARY') cur.summary = unescape(value)
      else if (key === 'DTSTART') cur.start = parseDateValue(params, value) ?? undefined
      else if (key === 'DTEND') cur.end = parseDateValue(params, value) ?? undefined
    }
  }
  return events
}

function keywordKind(summary: string): ImportKind | null {
  const words = summary.toLowerCase().split(/[^a-zäöüß]+/).filter(Boolean)
  for (const [kind, keys] of C.keywords) {
    for (const k of keys) {
      const hit = k.endsWith('*') ? words.some((w) => w.startsWith(k.slice(0, -1))) : words.includes(k)
      if (hit) return kind
    }
  }
  return null
}

function timeKind(start: Minutes, cal: ShiftCalendar): ImportKind | null {
  const t = cal.settings.times
  const cands: [ImportKind, number][] = [
    ['T', Math.abs(start - t.T.start)],
    ['N', Math.abs(start - t.N.start)],
    ['V', Math.abs(start - t.V.start)],
  ]
  cands.sort((a, b) => a[1] - b[1])
  const best = cands[0]!
  return best[1] <= C.startToleranceMin ? best[0] : null
}

/** Ordnet Termine Tagen und Schichtarten zu. Ganztägige Termine gelten für jeden Tag ihres Zeitraums. */
export function classifyEvents(events: readonly IcsEvent[], cal: ShiftCalendar): { entries: ClassifiedEntry[]; unknown: { date: LocalDate; summary: string }[] } {
  const entries: ClassifiedEntry[] = []
  const unknown: { date: LocalDate; summary: string }[] = []
  for (const e of events) {
    const byWord = keywordKind(e.summary)
    if (e.allDay) {
      // Ganztägig: nur mit Stichwort erkennbar, gilt für jeden Tag des Zeitraums (Ende exklusiv)
      if (!byWord) {
        unknown.push({ date: e.start.date, summary: e.summary })
        continue
      }
      const last = compareDates(e.end.date, e.start.date) > 0 ? addDays(e.end.date, -1) : e.start.date
      for (let d = e.start.date; compareDates(d, last) <= 0; d = addDays(d, 1)) entries.push({ date: d, kind: byWord, summary: e.summary })
      continue
    }
    const kind = byWord ?? timeKind(e.start.minutes, cal)
    if (!kind) {
      unknown.push({ date: e.start.date, summary: e.summary || `${formatTime(e.start.minutes)} Uhr` })
      continue
    }
    entries.push({ date: e.start.date, kind, summary: e.summary, start: e.start.minutes, end: e.start.minutes + localMinutesBetween(e.start, e.end) })
  }
  return { entries, unknown }
}

const PRIORITY: ImportKind[] = ['KRANK', 'URLAUB', 'FORTBILDUNG', 'N', 'T', 'V', 'FREI']

const KIND_LABEL: Record<ImportKind, string> = {
  T: 'Tagschicht',
  N: 'Nachtschicht',
  V: 'V-Schicht',
  FREI: 'frei',
  URLAUB: 'Urlaub',
  KRANK: 'krank',
  FORTBILDUNG: 'Fortbildung',
}

/** Vorschau: nur Abweichungen vom aktuellen Kalender als vorgeschlagene Overrides. */
export function buildImportPreview(text: string, cal: ShiftCalendar): ImportPreview {
  const { entries, unknown } = classifyEvents(parseIcsEvents(text), cal)
  const byDate = new Map<LocalDate, ClassifiedEntry>()
  for (const e of entries) {
    const prev = byDate.get(e.date)
    if (!prev || PRIORITY.indexOf(e.kind) < PRIORITY.indexOf(prev.kind)) byDate.set(e.date, e)
  }
  const dates = [...byDate.keys()].sort(compareDates)
  const changes: ProposedChange[] = []
  let unchanged = 0
  for (const date of dates) {
    const e = byDate.get(date)!
    const eff = effectiveShift(cal, date)
    const override = proposeOverride(e, eff.code, eff.work?.end, cal)
    if (!override) {
      unchanged++
      continue
    }
    const detail = override.kind === 'UEBERSTUNDEN' || override.kind === 'FORTBILDUNG' ? ` (${formatTime(override.start ?? 0)}–${formatTime(override.end ?? 0)})` : ''
    const to = override.kind === 'UEBERSTUNDEN' ? `Überstunden bis ${formatTime(override.end ?? 0)}` : `${KIND_LABEL[e.kind]}${detail}`
    changes.push({ date, override, current: eff.code, text: `${formatDateDE(date)}: ${shiftLabel(eff.code)} → ${to}` })
  }
  return { changes, unknown, unchanged, ...(dates.length ? { from: dates[0]!, to: dates[dates.length - 1]! } : {}) }
}

function proposeOverride(e: ClassifiedEntry, current: ShiftCode, currentEnd: Minutes | undefined, cal: ShiftCalendar): ShiftOverride | null {
  const base = { date: e.date, source: 'ics' as const, note: e.summary || undefined }
  const clean = (o: ShiftOverride): ShiftOverride => (o.note === undefined ? (({ note: _n, ...r }) => r)(o) : o)
  switch (e.kind) {
    case 'URLAUB':
      return current === 'U' ? null : clean({ ...base, kind: 'URLAUB' })
    case 'KRANK':
      return current === 'K' ? null : clean({ ...base, kind: 'KRANK' })
    case 'FORTBILDUNG': {
      const t = cal.settings.times.FB
      const start = e.start ?? t.start
      const end = e.end ?? t.end
      return current === 'FB' ? null : clean({ ...base, kind: 'FORTBILDUNG', start, end })
    }
    case 'FREI':
      return current === 'T' || current === 'N' || current === 'V' || current === 'FB' ? clean({ ...base, kind: 'TAUSCH', swapTo: 'F' }) : null
    case 'V':
      return current === 'V' ? overtime(e, currentEnd, base) : clean({ ...base, kind: 'V' })
    case 'T':
    case 'N':
      return current === e.kind ? overtime(e, currentEnd, base) : clean({ ...base, kind: 'TAUSCH', swapTo: e.kind })
  }
}

function overtime(e: ClassifiedEntry, currentEnd: Minutes | undefined, base: { date: LocalDate; source: 'ics'; note: string | undefined }): ShiftOverride | null {
  if (e.end === undefined || currentEnd === undefined) return null
  if (e.end - currentEnd < C.overtimeMinMin) return null
  const o: ShiftOverride = { date: base.date, source: 'ics', kind: 'UEBERSTUNDEN', end: e.end }
  return base.note ? { ...o, note: base.note } : o
}
