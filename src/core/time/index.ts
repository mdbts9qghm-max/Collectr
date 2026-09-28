// Kalender- und Uhrzeit-Arithmetik für Europe/Berlin.
// Kalendertage werden als Strings (YYYY-MM-DD) geführt und über UTC-Mitternacht gerechnet.
// Dadurch haben Sommerzeitumstellungen keinen Einfluss auf Tagesdifferenzen.

import { TZDate } from '@date-fns/tz'
import type { LocalDate, LocalDateTime, Minutes } from '../types'

export const TIME_ZONE = 'Europe/Berlin'
const DAY_MS = 86_400_000
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function toUtcMs(date: LocalDate): number {
  const m = DATE_RE.exec(date)
  if (!m) throw new Error(`Ungültiges Datum: ${date}`)
  const [, y, mo, d] = m
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d))
  if (fromUtcMs(ms) !== date) throw new Error(`Ungültiges Datum: ${date}`)
  return ms
}

function fromUtcMs(ms: number): LocalDate {
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${mo}-${day}`
}

export function isValidDate(date: string): boolean {
  try {
    toUtcMs(date)
    return true
  } catch {
    return false
  }
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromUtcMs(toUtcMs(date) + days * DAY_MS)
}

/** Anzahl Kalendertage von a nach b (b − a). */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / DAY_MS)
}

export function compareDates(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Alle Tage von start bis end (inklusive). */
export function dateRange(start: LocalDate, end: LocalDate): LocalDate[] {
  const n = daysBetween(start, end)
  const out: LocalDate[] = []
  for (let i = 0; i <= n; i++) out.push(addDays(start, i))
  return out
}

/** Wochentag 0 = Montag … 6 = Sonntag. */
export function weekday(date: LocalDate): number {
  return (new Date(toUtcMs(date)).getUTCDay() + 6) % 7
}

const WEEKDAYS_DE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const WEEKDAYS_DE_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

export function weekdayShortDE(date: LocalDate): string {
  return WEEKDAYS_DE[weekday(date)]!
}

export function weekdayLongDE(date: LocalDate): string {
  return WEEKDAYS_DE_LONG[weekday(date)]!
}

/** ISO-8601-Kalenderwoche. */
export function isoWeek(date: LocalDate): { year: number; week: number } {
  const ms = toUtcMs(date)
  const wd = weekday(date) // 0 = Mo
  const thursday = new Date(ms + (3 - wd) * DAY_MS)
  const year = thursday.getUTCFullYear()
  const jan4 = Date.UTC(year, 0, 4)
  const jan4wd = (new Date(jan4).getUTCDay() + 6) % 7
  const week1Monday = jan4 - jan4wd * DAY_MS
  const week = Math.floor((thursday.getTime() - week1Monday) / (7 * DAY_MS)) + 1
  return { year, week }
}

/** Montag der ISO-Woche. */
export function isoWeekStart(date: LocalDate): LocalDate {
  return addDays(date, -weekday(date))
}

/** TT.MM.JJJJ */
export function formatDateDE(date: LocalDate): string {
  const [y, m, d] = date.split('-')
  return `${d}.${m}.${y}`
}

/** TT.MM. */
export function formatDayMonthDE(date: LocalDate): string {
  const [, m, d] = date.split('-')
  return `${d}.${m}.`
}

/** Minuten → HH:MM (Tagesüberlauf wird abgeschnitten). */
export function formatTime(minutes: Minutes): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Normalisiert (Datum, Minuten beliebig) auf Minuten 0–1439. */
export function normalizeDateTime(date: LocalDate, minutes: Minutes): LocalDateTime {
  const dayShift = Math.floor(minutes / 1440)
  return { date: addDays(date, dayShift), minutes: minutes - dayShift * 1440 }
}

/** Minuten zwischen zwei lokalen Zeitpunkten (b − a), als Wanduhrzeit gerechnet. */
export function localMinutesBetween(a: LocalDateTime, b: LocalDateTime): number {
  return daysBetween(a.date, b.date) * 1440 + (b.minutes - a.minutes)
}

/** Lokale Zeit (Europe/Berlin) → Zeitpunkt (ms seit Epoche). */
export function berlinToInstant(date: LocalDate, minutes: Minutes): number {
  const n = normalizeDateTime(date, minutes)
  const [y, mo, d] = n.date.split('-').map(Number) as [number, number, number]
  return new TZDate(y, mo - 1, d, Math.floor(n.minutes / 60), n.minutes % 60, TIME_ZONE).getTime()
}

/** Zeitpunkt (ISO-String oder ms) → lokale Zeit Europe/Berlin. */
export function instantToBerlin(instant: string | number | Date): LocalDateTime {
  const ms = typeof instant === 'number' ? instant : typeof instant === 'string' ? Date.parse(instant) : instant.getTime()
  if (!Number.isFinite(ms)) throw new Error(`Ungültiger Zeitpunkt: ${String(instant)}`)
  const t = new TZDate(ms, TIME_ZONE)
  const date = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
  return { date, minutes: t.getHours() * 60 + t.getMinutes() }
}

/** Heutiges Datum in Europe/Berlin zu einem gegebenen Zeitpunkt (die Zeit wird immer übergeben). */
export function berlinToday(now: number | Date): LocalDate {
  return instantToBerlin(now).date
}

/** Deutsche Zahl mit Komma, z. B. 5,5 */
export function formatNumberDE(value: number, digits = 1): string {
  const rounded = Number(value.toFixed(digits))
  return (Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(digits)).replace('.', ',')
}

/** Stunden als „5,5 h“. */
export function formatHoursDE(minutes: number): string {
  return `${formatNumberDE(minutes / 60)} h`
}
