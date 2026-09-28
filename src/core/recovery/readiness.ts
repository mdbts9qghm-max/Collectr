// Erholung (SPEC 6.1, 6.2): Eingangsgrößen normalisieren, Bereitschaft und Ampel berechnen,
// Trends (HRV, Schlafdefizit) und Warnsignal erkennen. Fehlende WHOOP-Daten führen zur
// manuellen Eingabe statt zu einem Fehler.

import { CONFIG, resolveConfig, type RecoveryWeights } from '../config'
import type { ShiftContext } from '../shift'
import { addDays, daysBetween } from '../time'
import type { LoadEntry, LocalDate, RecoveryDay, TrafficLight } from '../types'

const R = CONFIG.recovery

export interface ReadinessInput {
  date: LocalDate
  /** Dem Trainingstag zugeordnete Erholungsdaten (WHOOP oder manuell). */
  today?: RecoveryDay
  /** Frühere Tage (für Baselines, Trends, Defizit), beliebig sortiert. */
  history?: readonly RecoveryDay[]
  /** Tägliche Trainingslast (für Akut/Chronisch). */
  loads?: readonly LoadEntry[]
  shift?: ShiftContext
  weights?: Partial<RecoveryWeights>
}

export type ComponentKey = keyof RecoveryWeights

export interface ReadinessResult {
  date: LocalDate
  needsManualInput: boolean
  source?: 'whoop' | 'manual'
  traffic?: TrafficLight
  /** Recovery Score 0–100 (WHOOP) bzw. aus der Bereitschaft abgeleitet. */
  score?: number
  /** Gewichtete Bereitschaft 0–1. */
  readiness?: number
  components: Partial<Record<ComponentKey, number>>
  /** Gesamtschlaf seit dem letzten Hauptschlaf inkl. Nap (min). */
  sleepMin?: number
  /** Hauptschlaf (bei Tag 3 der Tagschlaf nach der Nacht). */
  mainSleepMin?: number
  needMin: number
  /** Schlafdefizit der letzten Tage (min). */
  debtMin: number
  hrvTrendFalling: boolean
  debtGrowing: boolean
  warning: boolean
}

/** Lineare Abbildung von [a, b] auf [0, 1] (a → 0, b → 1), begrenzt. */
export function mapRange(value: number, [a, b]: readonly [number, number]): number {
  if (a === b) return value >= b ? 1 : 0
  return Math.max(0, Math.min(1, (value - a) / (b - a)))
}

const mean = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length
const sd = (xs: number[]) => {
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, xs.length - 1))
}

function within(history: readonly RecoveryDay[], date: LocalDate, days: number): RecoveryDay[] {
  return history.filter((h) => {
    const d = daysBetween(h.date, date)
    return d >= 1 && d <= days
  })
}

export function trafficFromScore(score: number): TrafficLight {
  if (score >= R.greenMin) return 'green'
  if (score >= R.yellowMin) return 'yellow'
  return 'red'
}

function sleepTotal(d: RecoveryDay): number | undefined {
  if (d.sleep) return d.sleep.durationMin + (d.sleep.napMin ?? 0)
  if (d.manual) return d.manual.sleepMin
  return undefined
}

function needOf(d: RecoveryDay | undefined): number {
  return d?.sleep?.needMin ?? CONFIG.sleep.defaultNeedMin
}

/** Schlafdefizit (Summe über `days` Tage bis einschließlich `date`). */
export function sleepDebt(all: readonly RecoveryDay[], date: LocalDate, days: number = R.debtDays): number {
  let debt = 0
  for (let i = 0; i < days; i++) {
    const d = all.find((x) => x.date === addDays(date, -i))
    if (!d) continue
    const total = sleepTotal(d)
    if (total === undefined) continue
    // Standardbedarf als Referenz (der WHOOP-Bedarf enthält das Defizit bereits).
    debt += Math.max(0, CONFIG.sleep.defaultNeedMin - total)
  }
  return debt
}

export function hrvTrendFalling(all: readonly RecoveryDay[], date: LocalDate): boolean {
  const L = R.lookahead
  const series: number[] = []
  for (let i = L.hrvTrendDays - 1; i >= 0; i--) {
    const d = all.find((x) => x.date === addDays(date, -i))
    if (d?.hrvMs === undefined) return false
    series.push(d.hrvMs)
  }
  const last7 = all.filter((x) => x.hrvMs !== undefined && daysBetween(x.date, date) >= 0 && daysBetween(x.date, date) < 7).map((x) => x.hrvMs!)
  if (last7.length < 3) return false
  const n = series.length
  const xs = series.map((_, i) => i)
  const mx = mean(xs)
  const my = mean(series)
  const slope = xs.reduce((a, x, i) => a + (x - mx) * (series[i]! - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0)
  return slope < 0 && series[n - 1]! <= mean(last7) * (1 - L.hrvTrendDropPct)
}

/**
 * Warnsignal (SPEC 6.3): Ruhepuls an mehreren Tagen deutlich erhöht UND HRV deutlich unter dem Mittel.
 * Baseline = 30 Tage vor dem Warnzeitraum.
 */
export function warningSignal(all: readonly RecoveryDay[], date: LocalDate): boolean {
  const W = R.warning
  const windowStart = addDays(date, -(W.days - 1))
  const baseline = all.filter((x) => {
    const d = daysBetween(x.date, windowStart)
    return d >= 1 && d <= 30
  })
  const rhrBase = baseline.filter((x) => x.restingHr !== undefined).map((x) => x.restingHr!)
  const hrvBase = baseline.filter((x) => x.hrvMs !== undefined).map((x) => x.hrvMs!)
  if (rhrBase.length < R.minBaselineDays || hrvBase.length < R.minBaselineDays) return false
  const rhrMean = mean(rhrBase)
  const hrvMean = mean(hrvBase)
  for (let i = 0; i < W.days; i++) {
    const d = all.find((x) => x.date === addDays(date, -i))
    if (!d || d.restingHr === undefined || d.hrvMs === undefined) return false
    if (d.restingHr < rhrMean + W.rhrDeltaBpm) return false
    if (d.hrvMs > hrvMean * (1 - W.hrvDropPct)) return false
  }
  return true
}

/** Akut/chronisch-Verhältnis der Trainingslast (7 zu 28 Tage). */
export function acuteChronicRatio(loads: readonly LoadEntry[], date: LocalDate): number | undefined {
  const sumIn = (days: number) =>
    loads.filter((l) => {
      const d = daysBetween(l.date, date)
      return d >= 1 && d <= days
    }).reduce((a, l) => a + l.load, 0)
  const chronic = sumIn(28) / 28
  if (chronic <= 0) return undefined
  return sumIn(7) / 7 / chronic
}

export function assessReadiness(input: ReadinessInput): ReadinessResult {
  const { date, today } = input
  const history = input.history ?? []
  const all = today ? [...history.filter((h) => h.date !== date), today] : [...history]
  const weights = resolveConfig({ recoveryWeights: input.weights ?? {} }).recoveryWeights
  const components: Partial<Record<ComponentKey, number>> = {}

  const hasWhoop = today?.recoveryScore !== undefined
  const hasManual = today?.manual !== undefined
  const needMin = needOf(today)
  const debtMin = sleepDebt(all, date)
  const base: Omit<ReadinessResult, 'needsManualInput' | 'components'> = {
    date,
    needMin,
    debtMin,
    hrvTrendFalling: hrvTrendFalling(all, date),
    debtGrowing: debtMin - sleepDebt(all, addDays(date, -2)) >= R.lookahead.debtGrowthMin,
    warning: warningSignal(all, date),
  }
  if (!today || (!hasWhoop && !hasManual)) {
    return { ...base, needsManualInput: true, components }
  }

  // Recovery bzw. manuelles Gefühl
  if (hasWhoop) components.recovery = today.recoveryScore! / 100
  else if (today.manual) components.recovery = (mapRange(today.manual.quality, R.manualRange) + mapRange(today.manual.feeling, R.manualRange)) / 2

  // HRV gegen 30-Tage-Mittel (z-Score von ln HRV)
  const hist30 = within(all, date, 30)
  const hrvHist = hist30.filter((h) => h.hrvMs !== undefined).map((h) => Math.log(h.hrvMs!))
  if (today.hrvMs !== undefined && hrvHist.length >= R.minBaselineDays) {
    const s = sd(hrvHist) || 1e-6
    const z = (Math.log(today.hrvMs) - mean(hrvHist)) / s
    components.hrv = mapRange(z, R.hrvZRange)
  }

  // Ruhepuls gegen 30-Tage-Mittel
  const rhrHist = hist30.filter((h) => h.restingHr !== undefined).map((h) => h.restingHr!)
  if (today.restingHr !== undefined && rhrHist.length >= R.minBaselineDays) {
    components.restingHr = mapRange(today.restingHr - mean(rhrHist), R.rhrDeltaRange)
  }

  // Schlaf
  const total = sleepTotal(today)
  if (total !== undefined) {
    const parts: [number, number][] = [[mapRange(total / needMin, R.sleepRatioRange), R.sleepSubWeights.ratio]]
    if (today.sleep?.performancePct !== undefined) parts.push([today.sleep.performancePct / 100, R.sleepSubWeights.performance])
    if (today.sleep?.efficiencyPct !== undefined) parts.push([mapRange(today.sleep.efficiencyPct, R.efficiencyRange), R.sleepSubWeights.efficiency])
    if (today.manual && !today.sleep) parts.push([mapRange(today.manual.quality, R.manualRange), R.sleepSubWeights.performance])
    const w = parts.reduce((a, [, x]) => a + x, 0)
    components.sleep = parts.reduce((a, [v, x]) => a + v * x, 0) / w
  }
  components.sleepDebt = 1 - mapRange(debtMin, R.debtRange)

  // Trainingslast
  const loadParts: number[] = []
  const acwr = input.loads ? acuteChronicRatio(input.loads, date) : undefined
  if (acwr !== undefined) loadParts.push(1 - mapRange(acwr, R.acwrRange))
  if (today.strainPrevDay !== undefined) loadParts.push(1 - mapRange(today.strainPrevDay, R.strainRange))
  if (loadParts.length > 0) components.load = mean(loadParts)

  // Schichtkontext
  if (input.shift) {
    const P = R.shiftPenalty
    let v = 1
    if (input.shift.lastNightWorked) v -= P.lastNightWorked
    if (input.shift.hoursSinceShiftEnd !== null && input.shift.hoursSinceShiftEnd < P.shiftEndedWithinHours.hours) v -= P.shiftEndedWithinHours.penalty
    if (input.shift.hoursUntilNextShift !== null && input.shift.hoursUntilNextShift < P.nextShiftWithinHours.hours) v -= P.nextShiftWithinHours.penalty
    components.shift = Math.max(0, v)
  }

  let wSum = 0
  let acc = 0
  for (const [k, v] of Object.entries(components) as [ComponentKey, number][]) {
    wSum += weights[k]
    acc += weights[k] * v
  }
  const readiness = wSum > 0 ? acc / wSum : 0
  const score = hasWhoop ? today.recoveryScore! : Math.round(readiness * 100)
  return {
    ...base,
    needsManualInput: false,
    source: hasWhoop ? 'whoop' : 'manual',
    traffic: trafficFromScore(score),
    score,
    readiness,
    components,
    ...(total !== undefined ? { sleepMin: total } : {}),
    ...(today.sleep ? { mainSleepMin: today.sleep.durationMin } : today.manual ? { mainSleepMin: today.manual.sleepMin } : {}),
  }
}
