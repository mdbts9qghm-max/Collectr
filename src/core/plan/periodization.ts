// Periodisierung (SPEC 5.1, 5.2): Mikrozyklus = 5-Tage-Schichtrhythmus,
// Mesozyklus = 6–7 Mikrozyklen (Zielwechsel Arberland: alle Phasen anteilig verlängert).
// Der Einstiegstag vor dem ersten Mikrozyklus gehört zu Mikrozyklus 1.

import { CONFIG } from '../config'
import { addDays, compareDates, daysBetween } from '../time'
import type { LocalDate, Mesocycle, MicroKind, MicroTemplate, Microcycle, Phase } from '../types'

const P = CONFIG.plan

/** Erster Mikrozyklus (Index 1-basiert) je Mesozyklus. */
function mesoStarts(): number[] {
  const starts: number[] = []
  let i = 1
  for (const m of P.mesos) {
    starts.push(i)
    i += m.micros
  }
  return starts
}

const microStart = (i: number): LocalDate => addDays(P.microStartDate, (i - 1) * P.microLengthDays)
const microEnd = (i: number): LocalDate => {
  const natural = addDays(microStart(i), P.microLengthDays - 1)
  return compareDates(natural, P.endDate) > 0 ? P.endDate : natural
}

export function buildMesocycles(): Mesocycle[] {
  const starts = mesoStarts()
  return P.mesos.map((m, k) => {
    const first = starts[k]!
    const last = first + m.micros - 1
    return { index: k + 1, start: k === 0 ? P.startDate : microStart(first), end: microEnd(last), phase: m.phase }
  })
}

function microKind(index: number, mesoIndex: number, indexInMeso: number, mesoLength: number): MicroKind {
  const t = P.taperMicros
  if (index === t.taper1) return 'taper1'
  if (index === t.taper2) return 'taper2'
  if (index === t.race_week) return 'race_week'
  if (index === t.race_day) return 'race_day'
  if (indexInMeso === mesoLength && (P.deloadMesos as readonly number[]).includes(mesoIndex)) return 'deload'
  return 'normal'
}

function microTemplate(index: number, phase: Phase, kind: MicroKind, indexInMeso: number): MicroTemplate {
  if (kind === 'taper1' || kind === 'taper2' || kind === 'race_week' || kind === 'race_day') return kind
  if (kind === 'deload') return 'deload'
  if (phase === 'base') return 'base'
  if (phase === 'build') return indexInMeso % 2 === 1 ? 'build_a' : 'build_b'
  const t = P.specificTemplates[index]
  if (!t) throw new Error(`Keine Vorlage für Mikrozyklus ${index}`)
  return t as MicroTemplate
}

export function buildMicrocycles(): Microcycle[] {
  const out: Microcycle[] = []
  const starts = mesoStarts()
  for (let i = 1; i <= P.totalMicros; i++) {
    let mesoIndex = 1
    for (let k = 0; k < starts.length; k++) if (starts[k]! <= i) mesoIndex = k + 1
    const indexInMeso = i - starts[mesoIndex - 1]! + 1
    const meso = P.mesos[mesoIndex - 1]!
    const kind = microKind(i, mesoIndex, indexInMeso, meso.micros)
    out.push({
      index: i,
      mesoIndex,
      indexInMeso,
      // Mikrozyklus 1 beginnt mit dem Einstiegstag
      start: i === 1 ? P.startDate : microStart(i),
      end: microEnd(i),
      phase: meso.phase,
      kind,
      template: microTemplate(i, meso.phase, kind, indexInMeso),
      hasStrengthTest: (P.strengthTestMicros as readonly number[]).includes(i),
      isKeyPeak: (P.keyPeakMicros as readonly number[]).includes(i),
    })
  }
  return out
}

/** Mikrozyklus zu einem Datum (oder undefined außerhalb des Plans). */
export function microIndexOf(date: LocalDate): number | undefined {
  if (compareDates(date, P.startDate) < 0 || compareDates(date, P.endDate) > 0) return undefined
  if (compareDates(date, P.microStartDate) < 0) return 1
  return Math.floor(daysBetween(P.microStartDate, date) / P.microLengthDays) + 1
}

/** Erster Tag des regulären Rhythmus eines Mikrozyklus (ohne Einstiegstag). */
export function rhythmStart(index: number): LocalDate {
  return microStart(index)
}

export const PHASE_LABEL: Record<Phase, string> = {
  base: 'Grundlage',
  build: 'Aufbau',
  specific: 'Rennspezifisch',
  taper: 'Tapering',
}
