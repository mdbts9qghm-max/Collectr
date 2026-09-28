// Periodisierung (SPEC 5.1, 5.2): Mikrozyklus = 5-Tage-Schichtrhythmus,
// Mesozyklus = 35 Tage. Phasen 2/3/2 + Taper (Entscheidung Phase 1).

import { CONFIG } from '../config'
import { addDays, compareDates, daysBetween } from '../time'
import type { LocalDate, Mesocycle, MicroKind, MicroTemplate, Microcycle, Phase } from '../types'

const P = CONFIG.plan

export function buildMesocycles(): Mesocycle[] {
  const out: Mesocycle[] = []
  const len = P.microLengthDays * P.microsPerMeso
  for (let i = 1; i <= P.phaseByMeso.length; i++) {
    const start = addDays(P.startDate, (i - 1) * len)
    const naturalEnd = addDays(start, len - 1)
    const end = compareDates(naturalEnd, P.endDate) > 0 ? P.endDate : naturalEnd
    out.push({ index: i, start, end, phase: P.phaseByMeso[i - 1]! })
  }
  return out
}

function microKind(index: number, mesoIndex: number, indexInMeso: number): MicroKind {
  if (index === P.taperMicros.taper1) return 'taper1'
  if (index === P.taperMicros.taper2) return 'taper2'
  if (index === P.taperMicros.race_week) return 'race_week'
  if (indexInMeso === P.microsPerMeso && (P.deloadMesos as readonly number[]).includes(mesoIndex)) return 'deload'
  return 'normal'
}

function microTemplate(index: number, phase: Phase, kind: MicroKind, indexInMeso: number): MicroTemplate {
  if (kind === 'taper1' || kind === 'taper2' || kind === 'race_week') return kind
  if (kind === 'deload') return 'deload'
  if (phase === 'base') return 'base'
  if (phase === 'build') return indexInMeso % 2 === 1 ? 'build_a' : 'build_b'
  const t = P.specificTemplates[index]
  if (!t) throw new Error(`Keine Vorlage für Mikrozyklus ${index}`)
  return t as MicroTemplate
}

export function buildMicrocycles(): Microcycle[] {
  const out: Microcycle[] = []
  for (let i = 1; i <= P.totalMicros; i++) {
    const start = addDays(P.startDate, (i - 1) * P.microLengthDays)
    const mesoIndex = Math.ceil(i / P.microsPerMeso)
    const indexInMeso = ((i - 1) % P.microsPerMeso) + 1
    const phase = P.phaseByMeso[mesoIndex - 1]!
    const kind = microKind(i, mesoIndex, indexInMeso)
    out.push({
      index: i,
      mesoIndex,
      indexInMeso,
      start,
      end: addDays(start, P.microLengthDays - 1),
      phase,
      kind,
      template: microTemplate(i, phase, kind, indexInMeso),
      hasStrengthTest: (P.strengthTestMicros as readonly number[]).includes(i),
      isKeyPeak: (P.keyPeakMicros as readonly number[]).includes(i),
    })
  }
  return out
}

/** Mikrozyklus zu einem Datum (oder undefined außerhalb des Plans). */
export function microIndexOf(date: LocalDate): number | undefined {
  if (compareDates(date, P.startDate) < 0 || compareDates(date, P.endDate) > 0) return undefined
  const days = daysBetween(P.startDate, date)
  return Math.floor(days / P.microLengthDays) + 1
}

export const PHASE_LABEL: Record<Phase, string> = {
  base: 'Grundlage',
  build: 'Aufbau',
  specific: 'Rennspezifisch',
  taper: 'Tapering',
}
