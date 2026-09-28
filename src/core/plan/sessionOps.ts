// Hilfsfunktionen zum Kürzen, Umwandeln und Verschieben von Einheiten.
// Werden vom Scheduler (Verschieben) und von den Anpassungsregeln (Erholung) genutzt.

import { CONFIG } from '../config'
import { formatNumberDE } from '../time'
import type { LocalDate, Phase, PlannedSession, SessionType } from '../types'
import { easyRun, INTENSITY, longRun, mobility, strengthSession, TYPE_LABEL, type SessionContext } from './templates'
import { roundKm } from './volume'

export const RUN_LONG_TYPES: ReadonlySet<SessionType> = new Set(['long_run', 'b2b_1', 'b2b_2', 'night_run', 'mountain_day'])
export const QUALITY_TYPES: ReadonlySet<SessionType> = new Set(['threshold', 'intervals_uphill'])
export const EASY_ONLY_TYPES: ReadonlySet<SessionType> = new Set(['recovery_run', 'easy_run', 'skill_light', 'mobility'])

export const priorityOf = (s: Pick<PlannedSession, 'type'>): number => CONFIG.sessions.priority[s.type]

export function isLongOrQuality(s: Pick<PlannedSession, 'type'>): boolean {
  return RUN_LONG_TYPES.has(s.type) || QUALITY_TYPES.has(s.type) || s.type === 'race'
}

export function ctxOf(s: PlannedSession, phase: Phase, date: LocalDate = s.date): SessionContext {
  const slot = s.id.split('#')[1]?.split('@')[0] ?? 'lauf'
  return { date, microIndex: s.microIndex, phase, slot }
}

/** Titel mit neuer Distanz/Dauer neu bilden. */
function retitle(s: PlannedSession): string {
  if (s.category === 'run' && s.distanceKm !== undefined && s.type !== 'mountain_day') return `${TYPE_LABEL[s.type]} ${formatNumberDE(s.distanceKm)} km`
  if (s.category === 'mobility') return `${TYPE_LABEL[s.type]} ${s.durationMin} min`
  return s.title
}

/**
 * Kürzt eine Einheit auf `factor` (0–1) ihres Umfangs. Wird nie länger als das Original.
 */
export function scaleSession(s: PlannedSession, factor: number): PlannedSession {
  const f = Math.max(0, Math.min(1, factor))
  const out: PlannedSession = { ...s, durationMin: Math.max(1, Math.round(s.durationMin * f)) }
  if (s.distanceKm !== undefined) out.distanceKm = Math.min(s.distanceKm, roundKm(s.distanceKm * f))
  if (s.elevationM !== undefined) out.elevationM = Math.round(s.elevationM * f)
  if (s.strengthSets !== undefined) out.strengthSets = Math.max(1, Math.round(s.strengthSets * f))
  if (s.exercises) out.exercises = s.exercises.map((e) => ({ ...e, sets: Math.max(1, Math.round(e.sets * f)) }))
  out.title = retitle(out)
  return out
}

/** Einheit mit neuem Datum (für Verschieben). */
export function relocate(s: PlannedSession, date: LocalDate, microIndex: number): PlannedSession {
  return {
    ...s,
    id: `${s.id}@${date}`,
    date,
    microIndex,
    origin: { ...(s.origin ?? {}), movedFrom: s.date },
  }
}

/** Qualitätseinheit/harte Einheit → lockerer Lauf mit gegebener Dauer (nie länger als das Original). */
export function toEasyRun(s: PlannedSession, phase: Phase, minutes: number): PlannedSession {
  const mins = Math.min(minutes, s.durationMin)
  const km = Math.min(s.distanceKm ?? Infinity, mins / CONFIG.pace.easy)
  const e = easyRun(ctxOf(s, phase), { km })
  return {
    ...e,
    id: s.id,
    microIndex: s.microIndex,
    durationMin: Math.min(e.durationMin, s.durationMin),
    ...(s.startMin !== undefined ? { startMin: s.startMin } : {}),
    origin: { ...(s.origin ?? {}), convertedFrom: s.type },
  }
}

/** Sehr lockerer Lauf von höchstens `maxMin` Minuten. */
export function toVeryEasyRun(s: PlannedSession, phase: Phase, maxMin: number): PlannedSession {
  const r = toEasyRun(s, phase, maxMin)
  return { ...r, intensity: INTENSITY.recovery_run, title: `Sehr lockerer Lauf ${r.durationMin} min`, goal: 'Nur lockern, keine Trainingsbelastung.' }
}

/** Langer Lauf mit gegebenen km (z. B. B2B mit einem ausgefallenen Tag, Nachtlauf tagsüber). */
export function toLongRun(s: PlannedSession, phase: Phase, km: number, note: string): PlannedSession {
  const l = longRun('long_run', ctxOf(s, phase), { km, elevationM: s.elevationM ?? 0 })
  return {
    ...l,
    id: s.id,
    microIndex: s.microIndex,
    origin: { ...(s.origin ?? {}), convertedFrom: s.type, note },
  }
}

/** Kraft-Einheit in eine schonendere Variante umwandeln. */
export function toStrengthVariant(s: PlannedSession, phase: Phase, type: SessionType, note?: string): PlannedSession {
  const v = type === 'mobility' ? mobility(ctxOf(s, phase), CONFIG.recovery.redMobilityMin, false) : strengthSession(type, ctxOf(s, phase))
  return {
    ...v,
    id: s.id,
    microIndex: s.microIndex,
    durationMin: Math.min(v.durationMin, s.durationMin),
    ...(s.startMin !== undefined ? { startMin: s.startMin } : {}),
    origin: { ...(s.origin ?? {}), convertedFrom: s.type, ...(note ? { note } : {}) },
  }
}

/** Technik-Variante (schwere Sätze → technische Sätze), leicht gekürzt. */
export function toTechnique(s: PlannedSession, factor: number): PlannedSession {
  const scaled = scaleSession(s, factor)
  return {
    ...scaled,
    technique: true,
    intensity: { level: Math.min(s.intensity.level, 2) as PlannedSession['intensity']['level'], label: 'Technik-Sätze, RPE ≤ 5' },
    title: `${s.title} (Technik)`,
    ...(s.exercises
      ? {
          exercises: scaled.exercises!.map((e) => ({
            ...e,
            note: e.ladder === 'legs' ? 'Technik-Satz: ca. 60 % der Last, RPE ≤ 5' : 'Technik-Satz: sauber, weit weg vom Muskelversagen',
          })),
        }
      : {}),
  }
}
