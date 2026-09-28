// Beispieldaten statt WHOOP (SPEC 12, Phase 2): synthetische, deterministische Werte über
// mehrere Schichtzyklen mit typischem Recovery-Abfall nach Nachtschichten, einer roten Serie
// und fehlenden Tagen. Werden für Tests und in Phase 3 für die Oberfläche genutzt.

import { effectiveShift, type ShiftCalendar } from '../shift'
import { addDays, berlinToInstant, dateRange } from '../time'
import type { LocalDate, RecoveryDay } from '../types'
import { assignRecoveryDay, type WhoopData, type WhoopRecovery, type WhoopSleep } from '../whoop'

export interface SampleOptions {
  start: LocalDate
  days: number
  /** Tage mit schlechter Erholung (rote Serie), relativ zum Start. */
  redDays?: number[]
  /** Tage ohne WHOOP-Daten, relativ zum Start. */
  missingDays?: number[]
}

/** Einfacher deterministischer Zufall (lineare Kongruenz). */
function rng(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

const iso = (date: LocalDate, min: number) => new Date(berlinToInstant(date, min)).toISOString()

export function sampleWhoopData(cal: ShiftCalendar, opts: SampleOptions): WhoopData {
  const rand = rng(7)
  const sleeps: WhoopSleep[] = []
  const recoveries: WhoopRecovery[] = []
  let cycle = 1
  dateRange(opts.start, addDays(opts.start, opts.days - 1)).forEach((date, i) => {
    if (opts.missingDays?.includes(i)) return
    const today = effectiveShift(cal, date)
    const red = opts.redDays?.includes(i) ?? false
    const noise = (rand() - 0.5) * 16
    let score: number
    let start: number
    let end: number
    let sDate = date
    let eDate = date
    if (today.postNight) {
      // Tagschlaf nach der Nachtschicht
      start = 8 * 60 + Math.round(rand() * 20)
      end = 13 * 60 + 30 + Math.round(rand() * 45)
      score = 45 + noise
    } else {
      // Nacht vor diesem Tag
      sDate = addDays(date, -1)
      start = 22 * 60 + 15 + Math.round(rand() * 45)
      const earlyShift = today.code === 'T' || today.code === 'V'
      end = earlyShift ? 5 * 60 + 40 : 7 * 60 + Math.round(rand() * 45)
      score = (earlyShift ? 60 : 72) + noise
      if (effectiveShift(cal, sDate).code === 'N') return // Nacht gearbeitet, kein Nachtschlaf
    }
    if (red) score = 22 + rand() * 8
    const id = `sleep-${date}`
    const s: WhoopSleep = {
      id,
      cycleId: cycle,
      start: iso(sDate, start),
      end: iso(eDate, end),
      nap: false,
      performancePct: Math.round(70 + rand() * 25),
      efficiencyPct: Math.round(82 + rand() * 12),
      needMin: 480,
    }
    const asleep = Math.round(((end + (sDate !== eDate ? 1440 : 0) - start) * (s.efficiencyPct ?? 90)) / 100)
    s.asleepMin = red ? Math.min(asleep, 280) : asleep
    sleeps.push(s)
    recoveries.push({
      cycleId: cycle,
      sleepId: id,
      score: Math.max(1, Math.min(99, Math.round(score))),
      hrvMs: Math.round(red ? 48 : 60 + score / 4 + noise / 2),
      restingHr: Math.round(red ? 58 : 54 - score / 20),
    })
    if (today.dayKind === 'pre_night') {
      sleeps.push({ id: `nap-${date}`, cycleId: cycle, start: iso(date, 15 * 60), end: iso(date, 16 * 60 + 30), nap: true, asleepMin: 80 })
    }
    cycle += 1
  })
  return { sleeps, recoveries, cycles: [] }
}

/** Erholungsdaten je Trainingstag aus den Beispieldaten (über die echte WHOOP-Zuordnung). */
export function sampleRecoveryDays(cal: ShiftCalendar, opts: SampleOptions): RecoveryDay[] {
  const data = sampleWhoopData(cal, opts)
  return dateRange(opts.start, addDays(opts.start, opts.days - 1))
    .map((d) => assignRecoveryDay(cal, d, data))
    .filter((d): d is RecoveryDay => d !== undefined)
}

/** Standard-Beispiel: 60 Tage ab Planstart, rote Serie an Tag 20–21, Lücke an Tag 33. */
export const DEFAULT_SAMPLE: SampleOptions = { start: '2026-10-02', days: 60, redDays: [20, 21], missingDays: [33] }
