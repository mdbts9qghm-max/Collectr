// Umfangsprogression (SPEC 5.3) nach der Trend-Regel mit Schlüsselspitzen:
// - Grundniveau (Trend) steigt höchstens 7 % pro Mikrozyklus (≙ 10 %/Woche).
// - Entlastung: −35 %, danach geht es auf dem Niveau vor der Entlastung weiter.
// - Schlüssel-Mikrozyklen dürfen bis 12 % über dem Grundniveau liegen.
// Rechengröße ist km pro 5-Tage-Mikrozyklus. Anzeige in km/Woche = × 7/5.

import { CONFIG } from '../config'
import type { Microcycle, Profile } from '../types'

const V = CONFIG.volume
const WEEK_FACTOR = 7 / CONFIG.plan.microLengthDays

export const microToWeekly = (km: number): number => km * WEEK_FACTOR
export const weeklyToMicro = (km: number): number => km / WEEK_FACTOR

export interface MicroVolume {
  index: number
  /** Grundniveau (Trend) km pro Mikrozyklus */
  levelKm: number
  /** Soll-km (Grundniveau × Faktor der Mikrozyklus-Art) */
  targetKm: number
  /** Obergrenze für die Summe der Einheiten */
  capKm: number
  targetElevationM: number
  /** Langer Lauf (km) für Grundlage/Aufbau/Entlastung */
  longRunKm: number
}

interface Anchor {
  micro: number
  value: number
}

/**
 * Geometrische Interpolation zwischen Ankern über die „Schritte“ (Nicht-Entlastungs-Mikrozyklen).
 * Entlastungs- und Taper-Mikrozyklen übernehmen den Wert des Vorgängers.
 */
function interpolateSteps(micros: Microcycle[], anchors: Anchor[]): Map<number, number> {
  const stepMicros = micros.filter((m) => m.kind === 'normal').map((m) => m.index)
  const stepOf = new Map(stepMicros.map((idx, i) => [idx, i]))
  const out = new Map<number, number>()
  const sorted = [...anchors].sort((a, b) => a.micro - b.micro)
  for (const idx of stepMicros) {
    const s = stepOf.get(idx)!
    let value = sorted[sorted.length - 1]!.value
    if (idx <= sorted[0]!.micro) value = sorted[0]!.value
    else {
      for (let k = 0; k < sorted.length - 1; k++) {
        const a = sorted[k]!
        const b = sorted[k + 1]!
        if (idx >= a.micro && idx <= b.micro) {
          const sa = stepOf.get(a.micro) ?? nearestStep(stepMicros, a.micro)
          const sb = stepOf.get(b.micro) ?? nearestStep(stepMicros, b.micro)
          const t = sb === sa ? 1 : (s - sa) / (sb - sa)
          value = a.value * Math.pow(b.value / a.value, t)
          break
        }
      }
    }
    out.set(idx, value)
  }
  // Nicht-Schritt-Mikrozyklen übernehmen den letzten Wert.
  let last = sorted[0]!.value
  for (const m of micros) {
    if (out.has(m.index)) last = out.get(m.index)!
    else out.set(m.index, last)
  }
  return out
}

function nearestStep(stepMicros: number[], micro: number): number {
  let best = 0
  stepMicros.forEach((idx, i) => {
    if (idx <= micro) best = i
  })
  return best
}

/** Grundniveau in km pro Mikrozyklus für alle Mikrozyklen. */
export function levelCurve(micros: Microcycle[], profile: Pick<Profile, 'weeklyKmStart'>): Map<number, number> {
  const startMicro = weeklyToMicro(profile.weeklyKmStart)
  const anchors: Anchor[] = [
    { micro: 1, value: startMicro },
    ...V.levelAnchorsWeekly.map((a) => ({ micro: a.micro, value: Math.max(weeklyToMicro(a.km), startMicro) })),
  ]
  const raw = interpolateSteps(micros, anchors)
  // Trend-Regel: monoton, höchstens +7 % pro Mikrozyklus.
  const out = new Map<number, number>()
  let prev = startMicro
  for (const m of micros) {
    let v = raw.get(m.index)!
    if (m.kind !== 'normal') v = prev
    else if (m.index === 1) v = startMicro
    else v = Math.max(prev, Math.min(v, prev * (1 + V.maxGrowthPerMicro)))
    out.set(m.index, v)
    prev = v
  }
  return out
}

export function buildVolumes(micros: Microcycle[], profile: Pick<Profile, 'weeklyKmStart'>): MicroVolume[] {
  const level = levelCurve(micros, profile)
  const peakLevel = Math.max(...[...level.values()])
  const elevation = interpolateSteps(
    micros,
    V.elevationAnchorsWeekly.map((a) => ({ micro: a.micro, value: weeklyToMicro(a.m) })),
  )
  const peakElevation = Math.max(...[...elevation.values()])
  const longRun = interpolateSteps(micros, [
    { micro: 1, value: Math.max(V.longRunAnchors[0]!.km, profile.weeklyKmStart / 3) },
    ...V.longRunAnchors.slice(1).map((a) => ({ micro: a.micro, value: a.km })),
  ])

  let lastLong = longRun.get(1)!
  return micros.map((m) => {
    const lv = level.get(m.index)!
    let target = lv
    let cap = lv
    let elev = elevation.get(m.index)!
    let long = longRun.get(m.index)!
    switch (m.kind) {
      case 'deload':
        target = lv * V.deloadFactor
        cap = target
        elev *= V.deloadFactor
        long = lastLong * V.deloadLongRunFactor
        break
      case 'taper1':
      case 'taper2':
      case 'race_week':
        target = peakLevel * V.taperFactors[m.kind]
        cap = target
        elev = peakElevation * V.taperElevationFactors[m.kind]
        break
      default:
        if (m.template === 'specific_final') target = lv * V.finalMicroFactor
        cap = m.isKeyPeak ? lv * V.keyPeakMaxFactor : target
        lastLong = long
    }
    return {
      index: m.index,
      levelKm: lv,
      targetKm: target,
      capKm: cap,
      targetElevationM: elev,
      longRunKm: long,
    }
  })
}

/** Auf 0,5 km runden. */
export function roundKm(km: number): number {
  return Math.round(km * 2) / 2
}
