// Schlafempfehlungen (SPEC 4.2, 6.3b): Zubettgehen, Aufstehen, Nap vor der Nachtschicht,
// Tagschlaf nach der Nacht, Kopplung an Training und Rennen, Umsetzungsquote.

import { CONFIG } from '../config'
import { effectiveShift, type ShiftCalendar } from '../shift'
import { addDays, daysBetween, formatTime, localMinutesBetween, normalizeDateTime } from '../time'
import type { LocalDate, LocalDateTime, Minutes, Plan, SleepBlock, SleepRecommendation } from '../types'
import { latestWakeForWork } from './baseline'
import { SLEEP_TIPS, type TipTag } from './tips'

const S = CONFIG.sleep

export interface SleepInput {
  cal: ShiftCalendar
  date: LocalDate
  plan?: Plan
  /** Schlafbedarf laut WHOOP (enthält Defizit, Strain und Nap-Anteil). */
  needMin?: number
  /** Aufgelaufenes Schlafdefizit (min). */
  debtMin?: number
}

function block(date: LocalDate, start: Minutes, end: Minutes): SleepBlock {
  return { start: normalizeDateTime(date, start), end: normalizeDateTime(date, end), durationMin: end - start }
}

function sessionsOn(plan: Plan | undefined, date: LocalDate) {
  return plan?.days.find((d) => d.date === date)?.sessions.filter((s) => !s.optional) ?? []
}

/** Schlafempfehlung für einen Tag (Tagschlaf/Nap an diesem Tag und die Nacht ab dem Abend). */
export function recommendSleep(input: SleepInput): SleepRecommendation {
  const { cal, date, plan } = input
  const today = effectiveShift(cal, date)
  const next = effectiveShift(cal, addDays(date, 1))
  const debt = input.debtMin ?? 0
  // WHOOP-Bedarf enthält das Defizit bereits; ohne WHOOP wird ein Teil des Defizits pro Nacht abgebaut.
  const baseNeed = input.needMin ?? S.defaultNeedMin + Math.min(S.maxDebtPayoffPerNightMin, debt / 2)
  const notes: string[] = []
  const rec: SleepRecommendation = { date, notes }
  const todaySessions = sessionsOn(plan, date)
  const tomorrowSessions = sessionsOn(plan, addDays(date, 1))
  const isRaceDay = date === CONFIG.race.date
  const daysToRace = daysBetween(date, CONFIG.race.date)
  const racePrep = daysToRace >= 0 && daysToRace <= S.racePrepDays
  const nightRun = todaySessions.find((s) => s.type === 'night_run')
  let tag: TipTag = 'free'

  if (today.work) rec.departure = today.work.departure

  // Tagschlaf nach der Nachtschicht
  if (today.postNight) {
    rec.daySleep = block(date, S.postNightStart, S.postNightEnd)
    notes.push(`Nach der Nachtschicht schlafen ${formatTime(S.postNightStart)}–${formatTime(S.postNightEnd)} Uhr.`)
    tag = 'post_night'
  }

  // Nap vor der Nachtschicht, vor einem Nachtlauf, vor dem Rennen
  if (today.dayKind === 'pre_night' && today.work) {
    const latestWake = today.work.departure - S.napPrepMin
    const want = debt >= S.napLongDebtMin ? S.napMaxMin : S.napDefaultMin
    const dur = Math.max(S.napMinMin, Math.min(want, latestWake - S.napStart - S.latencyMin))
    rec.nap = block(date, S.napStart, S.napStart + S.latencyMin + dur)
    notes.push(
      `Vorschlaf ${formatTime(S.napStart)}–${formatTime(rec.nap.end.minutes)} Uhr, spätestens ${formatTime(latestWake)} aufstehen, ${formatTime(today.work.departure)} losfahren.`,
    )
    tag = 'pre_night'
  } else if (isRaceDay) {
    rec.nap = block(date, S.raceNapStart, S.raceNapStart + S.latencyMin + S.raceNapMin)
    notes.push(`Renntag: Nap ${formatTime(rec.nap.start.minutes)}–${formatTime(rec.nap.end.minutes)} Uhr, Start um ${formatTime(CONFIG.race.startMin)} Uhr.`)
    tag = 'race'
  } else if (nightRun) {
    rec.nap = block(date, S.nightRunNapStart, S.nightRunNapStart + S.latencyMin + S.nightRunNapMin)
    notes.push('Vor dem Nachtlauf nachmittags vorschlafen.')
    tag = 'night_run'
  }

  // Nacht ab dem Abend
  if (today.code !== 'N' && !isRaceDay) {
    let extra = 0
    if (tomorrowSessions.some((s) => s.isKey)) {
      extra += S.extraBeforeKeyMin
      notes.push('Morgen steht eine Schlüsseleinheit an: etwas früher ins Bett.')
    }
    if (todaySessions.some((s) => s.intensity.level >= 4 || (s.isKey && s.category === 'run' && (s.distanceKm ?? 0) >= 20))) {
      extra += S.extraAfterHardDayMin
      notes.push('Nach dem harten Tag mehr Schlaf einplanen.')
    }
    const need = baseNeed + extra
    const earlyWake = latestWakeForWork(cal, addDays(date, 1))
    let bed: Minutes
    let wake: Minutes // relativ zu `date`
    if (nightRun) {
      bed = (nightRun.startMin ?? CONFIG.windows.nightRunStart) + nightRun.durationMin + S.afterNightRunMin
      wake = bed + need + S.latencyMin
      notes.push('Nach dem Nachtlauf ausschlafen, Einheit am Folgetag erst am Nachmittag.')
    } else if (earlyWake !== null) {
      wake = earlyWake + 1440
      bed = Math.max(S.earliestBedtime, wake - need - S.latencyMin)
      if (tag === 'free') tag = 'pre_early'
      notes.push(`Aufstehen ${formatTime(wake)} Uhr für den Arbeitsbeginn um ${formatTime(next.work!.actualStart)}.`)
    } else if (next.dayKind === 'pre_night') {
      bed = S.normalBedtime
      wake = Math.min(S.preNightLatestWake + 1440, bed + need + S.latencyMin)
      const firstSession = tomorrowSessions.map((s) => s.startMin ?? Infinity).reduce((a, b) => Math.min(a, b), Infinity)
      if (Number.isFinite(firstSession)) wake = Math.min(wake, firstSession + 1440 - 30)
      notes.push('Vor der Nachtschicht darfst du ausschlafen, damit du Reserven für die Nacht hast.')
    } else {
      wake = S.freeWake + 1440
      bed = Math.max(S.earliestBedtime, Math.min(S.normalBedtime, wake - need - S.latencyMin))
      if (debt > 0) notes.push('Schlafdefizit gezielt abbauen: gleiche Aufstehzeit, früher ins Bett.')
    }
    if (racePrep && !nightRun) {
      bed = Math.min(bed, S.raceNightBedtime)
      if (earlyWake === null) wake = Math.max(wake, bed + need + S.latencyMin)
      notes.push('Rennvorbereitung: gute, regelmäßige Nächte vor dem Start um 23:00 Uhr.')
      tag = 'race'
    }
    rec.night = block(date, bed, wake)
  } else if (today.code === 'N') {
    notes.push('Heute Nacht Dienst: der Hauptschlaf folgt morgen nach der Schicht.')
  }

  const pool = SLEEP_TIPS[tag]
  rec.tip = pool[((daysBetween(CONFIG.shift.anchorDate, date) % pool.length) + pool.length) % pool.length]
  return rec
}

export interface ActualSleep {
  start: LocalDateTime
  end: LocalDateTime
  nap?: boolean
}

export interface AdherenceDay {
  date: LocalDate
  bedDiffMin: number
  wakeDiffMin: number
  ok: boolean
}

/** Vergleich Empfehlung ↔ tatsächlicher Schlaf laut WHOOP (±30 min gilt als umgesetzt). */
export function sleepAdherence(recs: readonly SleepRecommendation[], actual: readonly ActualSleep[]): { rate: number | null; days: AdherenceDay[] } {
  const days: AdherenceDay[] = []
  for (const r of recs) {
    const target = r.night ?? r.daySleep
    if (!target) continue
    const match = actual
      .filter((a) => !a.nap)
      .map((a) => ({ a, diff: Math.abs(localMinutesBetween(target.start, a.start)) }))
      .filter((x) => x.diff <= 180)
      .sort((x, y) => x.diff - y.diff)[0]
    if (!match) continue
    const bedDiffMin = localMinutesBetween(target.start, match.a.start)
    const wakeDiffMin = localMinutesBetween(target.end, match.a.end)
    const tol = S.adherenceToleranceMin
    days.push({ date: r.date, bedDiffMin, wakeDiffMin, ok: Math.abs(bedDiffMin) <= tol && Math.abs(wakeDiffMin) <= tol })
  }
  return { rate: days.length ? days.filter((d) => d.ok).length / days.length : null, days }
}
