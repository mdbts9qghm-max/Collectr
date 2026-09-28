// Push-Erinnerungen (SPEC 6.3b, Entscheidung Phase 7): jeweils 30 min vor dem empfohlenen
// Zubettgehen und vor dem Nap. Der Versand läuft serverseitig (Edge Function push-send).

import { CONFIG } from '../config'
import { berlinToInstant, formatTime } from '../time'
import type { LocalDate, SleepRecommendation } from '../types'

export type ReminderKind = 'nap' | 'bed'

export interface PushReminder {
  /** Stabil je Tag und Art, z. B. „2026-10-03-nap“. */
  id: string
  date: LocalDate
  kind: ReminderKind
  /** Fälligkeit als ISO-Zeitpunkt (UTC). */
  dueAt: string
  title: string
  body: string
}

/** Erinnerungen aus den Schlafempfehlungen; nur zukünftige (nach `now`). */
export function planReminders(recs: readonly SleepRecommendation[], now: number, leadMin: number = CONFIG.sleep.reminderLeadMin): PushReminder[] {
  const out: PushReminder[] = []
  for (const r of recs) {
    if (r.nap) {
      const due = berlinToInstant(r.nap.start.date, r.nap.start.minutes - leadMin)
      const dep = r.departure !== undefined ? `, ${formatTime(r.departure)} losfahren` : ''
      out.push({
        id: `${r.date}-nap`,
        date: r.date,
        kind: 'nap',
        dueAt: new Date(due).toISOString(),
        title: `In ${leadMin} min Nap`,
        body: `Nap ${formatTime(r.nap.start.minutes)}–${formatTime(r.nap.end.minutes)} Uhr${dep}.`,
      })
    }
    if (r.night) {
      const due = berlinToInstant(r.night.start.date, r.night.start.minutes - leadMin)
      out.push({
        id: `${r.date}-bed`,
        date: r.date,
        kind: 'bed',
        dueAt: new Date(due).toISOString(),
        title: `In ${leadMin} min schlafen gehen`,
        body: `Ins Bett um ${formatTime(r.night.start.minutes)}, aufstehen ${formatTime(r.night.end.minutes)} Uhr.`,
      })
    }
  }
  return out.filter((r) => Date.parse(r.dueAt) > now).sort((a, b) => a.dueAt.localeCompare(b.dueAt))
}
