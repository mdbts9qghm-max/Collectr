// Rennwoche (SPEC 7): Konflikt mit dem Schichtplan, Urlaubserinnerung, Checkliste,
// Taper-Schichten und Countdown.

import { CONFIG } from '../config'
import { effectiveShift, shiftLabel, type ShiftCalendar } from '../shift'
import { addDays, berlinToInstant, compareDates, dateRange, formatDateDE, weekdayShortDE } from '../time'
import type { LocalDate, ShiftCode } from '../types'

const R = CONFIG.race

export interface RaceConflict {
  hasConflict: boolean
  days: { date: LocalDate; code: ShiftCode; label: string; isWork: boolean }[]
  /** Urlaub für den empfohlenen Zeitraum (14.–20.06.) vollständig eingetragen. */
  recommendedVacationComplete: boolean
  message: string
}

/** Prüft Renntag, Zielschluss-Tag und Folgenacht gegen den Schichtplan. */
export function raceConflict(cal: ShiftCalendar): RaceConflict {
  const days = R.vacationRequired.map((date) => {
    const s = effectiveShift(cal, date)
    return { date, code: s.code, label: shiftLabel(s.code), isWork: s.isWork }
  })
  const hasConflict = days.some((d) => d.isWork)
  const recommendedVacationComplete = dateRange(R.vacationRecommendedFrom, R.vacationRecommendedTo).every((d) => effectiveShift(cal, d).code === 'U')
  const conflicts = days.filter((d) => d.isWork).map((d) => `${weekdayShortDE(d.date)}, ${formatDateDE(d.date)}: ${d.label}`)
  const message = hasConflict
    ? `Rennen am ${formatDateDE(R.date)} um 23:00 Uhr kollidiert mit deinem Dienstplan (${conflicts.join('; ')}). Beantrage Urlaub mindestens für ${formatDateDE(R.vacationRequired[0]!)}–${formatDateDE(R.vacationRequired.at(-1)!)}, besser ab ${formatDateDE(R.vacationRecommendedFrom)} für einen ausgeruhten Taper und die Anreise.`
    : recommendedVacationComplete
      ? 'Urlaub für die Rennwoche ist eingetragen.'
      : `Die Renntage sind frei. Empfehlung: Urlaub ab ${formatDateDE(R.vacationRecommendedFrom)} für einen ausgeruhten Taper und die Anreise.`
  return { hasConflict, days, recommendedVacationComplete, message }
}

/**
 * Soll heute an den Urlaubsantrag erinnert werden? Solange ein Konflikt besteht, an jedem
 * Erinnerungstermin (und beim ersten Start), sofern seit dem letzten Erinnerungstermin noch nicht bestätigt.
 */
export function vacationReminderDue(cal: ShiftCalendar, today: LocalDate, lastAcknowledged?: LocalDate): boolean {
  if (!raceConflict(cal).hasConflict) return false
  const due = R.vacationReminderDates.filter((d) => compareDates(d, today) <= 0).at(-1)
  if (!lastAcknowledged) return true
  if (!due) return false
  return compareDates(lastAcknowledged, due) < 0
}

export interface ChecklistItem {
  id: string
  group: 'Anreise' | 'Ausrüstung' | 'Verpflegung' | 'Schlaf' | 'Organisation'
  text: string
}

/** Checkliste für die Rennwoche (SPEC 7). */
export function raceChecklist(): ChecklistItem[] {
  return [
    { id: 'urlaub', group: 'Organisation', text: 'Urlaub 14.–20.06.2027 beantragt und im Plan eingetragen' },
    { id: 'anreise', group: 'Anreise', text: 'Anreise nach Ehrwald (Tirol) planen, Unterkunft buchen, Startnummernausgabe prüfen' },
    { id: 'pflicht', group: 'Ausrüstung', text: 'Pflichtausrüstung laut Veranstalter vollständig (Jacke, Hose, Rettungsdecke, Handy, Becher …)' },
    { id: 'lampe', group: 'Ausrüstung', text: 'Stirnlampe geladen und getestet, Ersatzakkus bzw. zweite Lampe eingepackt' },
    { id: 'schuhe', group: 'Ausrüstung', text: 'Eingelaufene Schuhe, Stöcke, Rucksack aus den langen Läufen' },
    { id: 'wetter', group: 'Ausrüstung', text: 'Warme Schicht für die Nacht und die Höhe, Wetterbericht Zugspitze prüfen' },
    { id: 'verpflegung', group: 'Verpflegung', text: 'Verpflegungsplan: 60–90 g Kohlenhydrate pro Stunde, im Training getestet' },
    { id: 'drop', group: 'Verpflegung', text: 'Verpflegungsstellen und Streckenprofil kennen, Zeitplan für das Zeitlimit von 22 h' },
    { id: 'nap', group: 'Schlaf', text: 'Schlafstrategie: gute Nächte vorher, Nap am Nachmittag des Renntags (Start 23:00 Uhr)' },
    { id: 'koffein', group: 'Schlaf', text: 'Koffein-Plan für die Nacht (erst ab dem Start, nicht vor dem Nap)' },
  ]
}

export interface TaperShiftNote {
  date: LocalDate
  message: string
}

/** Nachtschichten in Taper-Phase und Rennwoche kosten Erholung (SPEC 7). */
export function taperShiftNotes(cal: ShiftCalendar): TaperShiftNote[] {
  const taperStart = addDays(CONFIG.plan.startDate, (CONFIG.plan.taperMicros.taper1 - 1) * CONFIG.plan.microLengthDays)
  return dateRange(taperStart, addDays(R.date, -1))
    .filter((d) => effectiveShift(cal, d).code === 'N')
    .map((date) => ({
      date,
      message: `Nachtschicht am ${formatDateDE(date)} im Taper: Tag danach Ruhe, Schlaf hat Vorrang. Wenn möglich tauschen oder Urlaub nehmen.`,
    }))
}

/** Countdown bis zum Start (Zeitpunkt wird übergeben). */
export function raceCountdown(now: number): { totalMs: number; days: number; hours: number; minutes: number; started: boolean } {
  const start = berlinToInstant(R.date, R.startMin)
  const totalMs = start - now
  const t = Math.max(0, totalMs)
  return {
    totalMs,
    days: Math.floor(t / 86_400_000),
    hours: Math.floor((t % 86_400_000) / 3_600_000),
    minutes: Math.floor((t % 3_600_000) / 60_000),
    started: totalMs <= 0,
  }
}
