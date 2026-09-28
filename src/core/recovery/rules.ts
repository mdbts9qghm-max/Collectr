// Anpassungsregeln (SPEC 6.3, 6.3a, 6.4): Jede Einheit wird vor der Durchführung anhand
// der Erholung bewertet. Reihenfolge: Warnsignal → Rot → Schlaf < 5 h → Schlaftag →
// Gelb (nur harte Einheiten) → Vorausschau (nur ab Gelb) → Grün wie geplant.
// Es wird nie härter als geplant. Jede Anpassung hat eine Begründung in einem Satz.

import { CONFIG } from '../config'
import { mobility, QUALITY_TYPES, scaleSession, toEasyRun, toStrengthVariant, toTechnique, toVeryEasyRun, TYPE_LABEL } from '../plan'
import { buildStrengthSession } from '../strength'
import { formatNumberDE } from '../time'
import type { DayKind, Phase, PlannedSession, SessionAdjustment, SessionType, StrengthState } from '../types'
import { lookaheadStrength, type UpcomingKey } from './lookahead'
import type { ReadinessResult } from './readiness'

const R = CONFIG.recovery

export interface AdjustContext {
  readiness: ReadinessResult
  dayKind: DayKind
  phase: Phase
  /** Kommende Schlüsseleinheiten (Vorausschau 6.3a). */
  upcoming?: readonly UpcomingKey[]
  /** Erwarteter Recovery-Abfall aus gelernten Mustern (Prozentpunkte, Phase 6). */
  expectedDropPct?: number
  /** Andere Einheiten desselben Tages (z. B. für die Umwandlung schwerer Beine). */
  sameDayTypes?: readonly SessionType[]
  /** Kraftstand, um eine neue Skill-Stufe durch die bisherige zu ersetzen. */
  strengthState?: StrengthState
}

const WEEKDAY_AHEAD = ['morgen', 'übermorgen']

function recoveryPart(r: ReadinessResult): string {
  if (r.source === 'manual') return `Bereitschaft ${r.score} % (manuelle Eingabe)`
  return `Recovery ${r.score} %`
}

function sleepPart(r: ReadinessResult, dayKind: DayKind): string | null {
  if (r.sleepMin === undefined || r.sleepMin >= r.needMin * R.sleepMentionBelowNeedShare) return null
  const after = dayKind === 'sleep_day' ? ' nach der Nachtschicht' : ''
  return `nur ${formatNumberDE(r.sleepMin / 60)} h Schlaf${after}`
}

function upcomingLabel(u: UpcomingKey): string {
  const s = u.session
  const km = s.distanceKm !== undefined && s.category === 'run' ? ` (${formatNumberDE(s.distanceKm)} km)` : ''
  return `${WEEKDAY_AHEAD[u.daysAhead - 1] ?? 'bald'} steht ${TYPE_LABEL[s.type]}${km} an`
}

function sentence(parts: (string | null)[], change: string): string {
  const ctx = parts.filter(Boolean).join(', ')
  return `${ctx}: ${change}.`
}

function result(
  original: PlannedSession,
  adjusted: PlannedSession | null,
  action: SessionAdjustment['action'],
  reason: string,
  ruleIds: string[],
  r: ReadinessResult,
  extra: Partial<SessionAdjustment> = {},
): SessionAdjustment {
  const safe = adjusted ? neverHarder(original, adjusted) : null
  return {
    sessionId: original.id,
    date: original.date,
    original,
    adjusted: safe,
    action,
    unitFactor: safe ? Math.min(1, safe.durationMin / original.durationMin) : 0,
    ...(r.traffic ? { traffic: r.traffic } : {}),
    ...(r.readiness !== undefined ? { readiness: r.readiness } : {}),
    reason,
    ruleIds,
    ...extra,
  }
}

/** Sicherheitsnetz: Dauer, Distanz, Höhenmeter und Intensität nie über dem Original. */
export function neverHarder(original: PlannedSession, adjusted: PlannedSession): PlannedSession {
  const out: PlannedSession = { ...adjusted }
  out.durationMin = Math.min(adjusted.durationMin, original.durationMin)
  if (original.distanceKm !== undefined && adjusted.distanceKm !== undefined) out.distanceKm = Math.min(adjusted.distanceKm, original.distanceKm)
  if (original.elevationM !== undefined && adjusted.elevationM !== undefined) out.elevationM = Math.min(adjusted.elevationM, original.elevationM)
  if (adjusted.intensity.level > original.intensity.level) out.intensity = original.intensity
  return out
}

/** Faktor für Gelb: −25 % unten im gelben Bereich bis −10 % oben. */
export function yellowFactor(score: number): number {
  const p = Math.max(0, Math.min(1, (score - R.yellowMin) / (R.greenMin - 1 - R.yellowMin)))
  return 1 - (R.yellowReduction.max - (R.yellowReduction.max - R.yellowReduction.min) * p)
}

const minutes = (a: PlannedSession, b: PlannedSession) => `${b.durationMin} statt ${a.durationMin} min`

/** Harte Einheit eine Stufe runter (Gelb). */
function downgrade(s: PlannedSession, ctx: AdjustContext, factor: number): { adjusted: PlannedSession; change: string } {
  if (QUALITY_TYPES.has(s.type)) {
    const a = toEasyRun(s, ctx.phase, s.durationMin * factor)
    return { adjusted: a, change: `${TYPE_LABEL[s.type]} wird lockerer Lauf, ${minutes(s, a)}` }
  }
  if (s.type === 'legs_heavy') {
    const a = toTechnique(s, factor)
    return { adjusted: a, change: `schwere Sätze werden Technik-Sätze, ${minutes(s, a)}` }
  }
  if (s.type === 'strength_test') {
    const a = toStrengthVariant(s, ctx.phase, 'calisthenics_maintenance', 'Krafttest an einem grünen Tag nachholen.')
    return { adjusted: a, change: 'Krafttest wird Training auf der aktuellen Stufe' }
  }
  if (s.containsNewLevel) {
    const a = avoidNewLevel(scaleSession(s, factor), ctx)
    return { adjusted: a, change: `neue Skill-Stufe wird Training auf der bisherigen Stufe, ${minutes(s, a)}` }
  }
  const a = scaleSession(s, factor)
  return { adjusted: a, change: `${TYPE_LABEL[s.type]} wird gekürzt, ${minutes(s, a)}` }
}

function avoidNewLevel(s: PlannedSession, ctx: AdjustContext): PlannedSession {
  const out: PlannedSession = { ...s, containsNewLevel: false, sensitivity: CONFIG.sessions.sensitivity[s.type] }
  if (ctx.strengthState) {
    const c = buildStrengthSession(s.type, ctx.strengthState, ctx.phase, { avoidNewLevels: true })
    out.exercises = c.exercises
    out.strengthSets = c.strengthSets
  }
  return out
}

/** Vorausschau-Umwandlung: reduzieren statt streichen. */
function convertForLookahead(s: PlannedSession, ctx: AdjustContext): { adjusted: PlannedSession; change: string } {
  if (QUALITY_TYPES.has(s.type)) {
    const a = toEasyRun(s, ctx.phase, R.lookahead.convertedEasyRunMin)
    return { adjusted: a, change: `${TYPE_LABEL[s.type]} wird ${a.durationMin} min locker` }
  }
  if (s.type === 'legs_heavy') {
    const hasUpper = ctx.sameDayTypes?.some((t) => t === 'calisthenics_main' || t === 'calisthenics_maintenance')
    const target = hasUpper ? 'mobility' : 'calisthenics_maintenance'
    const a = toStrengthVariant(s, ctx.phase, target, 'Beine schonen für die kommende Schlüsseleinheit.')
    return { adjusted: a, change: `schweres Beintraining wird ${hasUpper ? 'Mobility' : 'Oberkörper-Calisthenics'}` }
  }
  return downgrade(s, ctx, yellowFactor(ctx.readiness.score ?? R.yellowMin))
}

/**
 * Bewertet eine geplante Einheit und passt sie bei Bedarf an.
 */
export function adjustSession(session: PlannedSession, ctx: AdjustContext): SessionAdjustment {
  const r = ctx.readiness
  if (session.type === 'race') return result(session, session, 'keep', 'Renntag: wie geplant.', ['race'], r)

  // Fehlende Daten → manuelle Eingabe (kein Fehler)
  if (r.needsManualInput || r.traffic === undefined || r.score === undefined) {
    return result(
      session,
      session,
      'needs_input',
      'Keine Erholungsdaten: bitte Schlafdauer, Schlafqualität und Gefühl kurz eintragen.',
      ['needs_input'],
      r,
    )
  }

  const rp = recoveryPart(r)
  const sp = sleepPart(r, ctx.dayKind)
  const optionalMobility = (min: number = R.redMobilityMin) => ({ ...mobility({ date: session.date, microIndex: session.microIndex, phase: ctx.phase, slot: 'alternative' }, min, true) })

  // 1. Warnsignal
  if (r.warning) {
    return result(
      session,
      null,
      'cancel',
      sentence(['Ruhepuls seit mehreren Tagen erhöht und HRV deutlich unter dem Mittel'], 'Pause einlegen, bei Krankheitsgefühl ärztlich abklären lassen'),
      ['warning'],
      r,
      { alternative: optionalMobility(), healthWarning: true },
    )
  }

  // 2. Rot: Ruhetag oder höchstens 30 min sehr locker bzw. Mobility
  if (r.traffic === 'red') {
    if (session.type === 'mobility') {
      const a = scaleSession(session, Math.min(1, R.redMaxMin / session.durationMin))
      return result(session, a, a.durationMin < session.durationMin ? 'shorten' : 'keep', sentence([rp, sp], `Mobility ${a.durationMin} min`), ['red'], r)
    }
    if (session.sensitivity === 'low' && session.category === 'run') {
      const a = toVeryEasyRun(session, ctx.phase, R.redMaxMin)
      return result(session, a, 'shorten', sentence([rp, sp], `höchstens ${a.durationMin} min sehr locker statt ${session.durationMin} min`), ['red'], r)
    }
    if (session.sensitivity === 'low') {
      const a = toStrengthVariant(session, ctx.phase, 'mobility')
      return result(session, a, 'convert', sentence([rp, sp], `${TYPE_LABEL[session.type]} wird ${a.durationMin} min Mobility`), ['red'], r)
    }
    return result(session, null, 'cancel', sentence([rp, sp], `Ruhetag statt ${TYPE_LABEL[session.type]}, höchstens ${R.redMaxMin} min sehr locker oder Mobility`), ['red'], r, {
      alternative: optionalMobility(),
    })
  }

  // 3. Schlaf unter 5 h: keine Intensität, kein schweres Krafttraining
  if (r.sleepMin !== undefined && r.sleepMin < R.minSleepForIntensityMin) {
    const sleepText = `nur ${formatNumberDE(r.sleepMin / 60)} h Schlaf${ctx.dayKind === 'sleep_day' ? ' nach der Nachtschicht' : ''}`
    if (session.sensitivity === 'high') {
      const alternative =
        session.category === 'run'
          ? { ...toEasyRun(session, ctx.phase, R.lowSleepEasyRunMaxMin), optional: true }
          : { ...toStrengthVariant(session, ctx.phase, 'mobility'), optional: true }
      return result(
        session,
        null,
        'cancel',
        sentence([rp, sleepText], `${TYPE_LABEL[session.type]} entfällt, freiwillig höchstens ${alternative.durationMin} min ${session.category === 'run' ? 'locker' : 'Mobility'}`),
        ['low_sleep'],
        r,
        { alternative },
      )
    }
    if (session.type === 'calisthenics_main') {
      const a = toTechnique(session, R.lowSleepTechniqueFactor)
      return result(session, a, 'downgrade', sentence([rp, sleepText], `Calisthenics nur als Technik-Sätze, ${minutes(session, a)}`), ['low_sleep'], r)
    }
  }

  // 4. Schlaftag: Training nur bei ≥ Gelb und ≥ 5 h Tagschlaf
  if (ctx.dayKind === 'sleep_day') {
    const daySleep = r.mainSleepMin ?? r.sleepMin
    if (daySleep === undefined || daySleep < R.sleepDayMinSleepMin) {
      return result(
        session,
        null,
        'cancel',
        sentence([rp, daySleep !== undefined ? `nur ${formatNumberDE(daySleep / 60)} h Tagschlaf nach der Nachtschicht` : null], 'Ruhetag'),
        ['sleep_day'],
        r,
      )
    }
  }

  // 5./6. Gelb (und Vorausschau): nur harte Einheiten
  if (r.traffic === 'yellow') {
    const la = lookaheadStrength(r, ctx.upcoming ?? [], ctx.expectedDropPct)
    if (session.sensitivity !== 'high') {
      return result(session, session, 'keep', sentence([rp], `${TYPE_LABEL[session.type]} wie geplant (bei Gelb werden nur harte Einheiten angepasst)`), ['yellow_keep'], r)
    }
    if (la.target && la.strength >= R.lookahead.convertThreshold) {
      const { adjusted, change } = convertForLookahead(session, ctx)
      return result(session, adjusted, 'convert', sentence([rp, sp, upcomingLabel(la.target)], change), ['yellow', 'lookahead'], r)
    }
    const { adjusted, change } = downgrade(session, ctx, yellowFactor(r.score))
    const parts = la.target ? [rp, sp, upcomingLabel(la.target)] : [rp, sp]
    return result(session, adjusted, 'downgrade', sentence(parts, change), la.target ? ['yellow', 'lookahead'] : ['yellow'], r)
  }

  // 7. Grün: wie geplant
  return result(session, session, 'keep', sentence([rp], `${TYPE_LABEL[session.type]} wie geplant`), ['green'], r)
}
