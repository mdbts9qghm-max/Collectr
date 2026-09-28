// Einheiten-Vorlagen (SPEC 9): Typ, Ziel in einem Satz, Dauer/km, Höhenmeter, Intensität,
// Ablauf (Aufwärmen, Hauptteil, Abwärmen). Kraftübungen kommen aus src/core/strength.

import { CONFIG } from '../config'
import { buildStrengthSession } from '../strength'
import { formatNumberDE } from '../time'
import type {
  Intensity,
  IntensityLevel,
  LocalDate,
  Phase,
  PlannedSession,
  SessionCategory,
  SessionStructure,
  SessionType,
  StrengthState,
} from '../types'
import { roundKm } from './volume'

const PACE = CONFIG.pace

export interface SessionContext {
  date: LocalDate
  microIndex: number
  phase: Phase
  /** eindeutiger Slot innerhalb des Tages, z. B. "run" oder "strength" */
  slot: string
  /** Fortschritt innerhalb der Phase 0–1 (für Intervall-Progression). */
  progress?: number
}

const CATEGORY: Record<SessionType, SessionCategory> = {
  easy_run: 'run',
  recovery_run: 'run',
  long_run: 'run',
  b2b_1: 'run',
  b2b_2: 'run',
  night_run: 'run',
  mountain_day: 'run',
  intervals_uphill: 'run',
  threshold: 'run',
  treadmill_hills: 'run',
  calisthenics_main: 'strength',
  calisthenics_maintenance: 'strength',
  skill_light: 'strength',
  legs_heavy: 'strength',
  strength_short: 'strength',
  strength_test: 'strength',
  mobility: 'mobility',
  race: 'race',
}

export const INTENSITY: Record<SessionType, Intensity> = {
  mobility: { level: 1, label: 'sehr locker' },
  recovery_run: { level: 1, label: 'Zone 1, sehr locker (RPE 2–3)' },
  skill_light: { level: 1, label: 'leicht, Technik (RPE 3–4)' },
  easy_run: { level: 2, label: 'Zone 2, locker (RPE 3–4)' },
  long_run: { level: 2, label: 'Zone 1–2, locker, Gehpausen erlaubt (RPE 3–5)' },
  b2b_1: { level: 2, label: 'Zone 1–2, locker (RPE 3–5)' },
  b2b_2: { level: 2, label: 'Zone 1–2, locker auf müden Beinen (RPE 4–5)' },
  night_run: { level: 2, label: 'Zone 1–2, locker (RPE 3–5)' },
  mountain_day: { level: 2, label: 'Zone 1–2, bergauf gehen, bergab kontrolliert (RPE 4–6)' },
  calisthenics_maintenance: { level: 2, label: 'moderat (RPE 6)' },
  strength_short: { level: 2, label: 'moderat (RPE 6)' },
  treadmill_hills: { level: 3, label: 'Zone 2–3, zügig bergauf gehen (RPE 5–6)' },
  calisthenics_main: { level: 3, label: 'fordernd, 1–2 Wiederholungen in Reserve (RPE 7–8)' },
  threshold: { level: 4, label: 'Zone 3–4, Schwelle (RPE 7)' },
  legs_heavy: { level: 4, label: 'schwer, 2–3 Wiederholungen in Reserve (RPE 7)' },
  intervals_uphill: { level: 5, label: 'Zone 4, hart bergauf (RPE 8)' },
  strength_test: { level: 5, label: 'maximal (Test)' },
  race: { level: 5, label: 'Renntempo: gleichmäßig, bergauf gehen' },
}

export const TYPE_LABEL: Record<SessionType, string> = {
  easy_run: 'Lockerer Lauf',
  recovery_run: 'Regenerationslauf',
  long_run: 'Langer Lauf',
  b2b_1: 'Back-to-back Tag 1',
  b2b_2: 'Back-to-back Tag 2',
  night_run: 'Nachtlauf',
  mountain_day: 'Bergtag',
  intervals_uphill: 'Bergauf-Intervalle',
  threshold: 'Schwellenlauf',
  treadmill_hills: 'Höhenmeter-Einheit',
  calisthenics_main: 'Calisthenics-Hauptsession',
  calisthenics_maintenance: 'Calisthenics-Erhaltung',
  skill_light: 'Leichtes Skill-Training',
  legs_heavy: 'Schweres Beintraining',
  strength_short: 'Kurzes Krafttraining',
  strength_test: 'Krafttest',
  mobility: 'Mobility',
  race: 'Ehrwald Trail',
}

const GOAL: Record<SessionType, string> = {
  easy_run: 'Aeroben Umfang aufbauen und die Laufökonomie verbessern, ohne zu ermüden.',
  recovery_run: 'Durchblutung fördern und die Beine lockern, ohne neue Belastung.',
  long_run: 'Ausdauer und Zeit auf den Beinen steigern.',
  b2b_1: 'Erster Tag des Back-to-backs: Umfang sammeln und Ermüdung für morgen aufbauen.',
  b2b_2: 'Auf müden Beinen laufen lernen, wie in der zweiten Hälfte des Rennens.',
  night_run: 'Laufen in der Nacht mit Stirnlampe üben, wie beim Rennstart um 23:00 Uhr.',
  mountain_day: 'Echte Höhenmeter bergauf und vor allem bergab im alpinen Gelände sammeln.',
  intervals_uphill: 'Bergauf-Kraftausdauer und maximale Sauerstoffaufnahme verbessern.',
  threshold: 'Die Schwelle anheben, damit das lange gleichmäßige Tempo leichter fällt.',
  treadmill_hills: 'Höhenmeter im Flachland ersetzen: steiles Gehen und Laufen bergauf.',
  calisthenics_main: 'Grundkraft und Skills Richtung Muscle-Up, Front und Back Lever aufbauen.',
  calisthenics_maintenance: 'Kraft und Skills mit wenig Aufwand erhalten.',
  skill_light: 'Skill-Technik locker üben und Schultern, Hüfte und Wirbelsäule mobilisieren.',
  legs_heavy: 'Bein- und Sehnenkraft für das lange Bergablaufen (exzentrisch) aufbauen.',
  strength_short: 'Kraft im Taper mit minimalem Aufwand erhalten.',
  strength_test: 'Fortschritt messen und die nächsten Kraftstufen festlegen.',
  mobility: 'Beweglichkeit erhalten und die Regeneration unterstützen.',
  race: 'Gesund und im Zeitlimit von 22 Stunden ins Ziel kommen.',
}

function base(type: SessionType, ctx: SessionContext): Omit<PlannedSession, 'title' | 'durationMin' | 'structure'> {
  return {
    id: `${ctx.date}#${ctx.slot}`,
    date: ctx.date,
    microIndex: ctx.microIndex,
    type,
    category: CATEGORY[type],
    goal: GOAL[type],
    sensitivity: CONFIG.sessions.sensitivity[type],
    isKey: (CONFIG.sessions.key as readonly SessionType[]).includes(type),
    optional: false,
    intensity: INTENSITY[type],
  }
}

const km = (v: number): string => `${formatNumberDE(v)} km`

// ---------------------------------------------------------------------------
// Laufen
// ---------------------------------------------------------------------------

export interface RunOptions {
  km: number
  elevationM?: number
  /** Lauf-ABC + Steigerungen anhängen */
  abc?: boolean
  /** Steigerungen (Taper, Rennwoche) */
  strides?: boolean
  optional?: boolean
}

export function easyRun(ctx: SessionContext, o: RunOptions): PlannedSession {
  const d = roundKm(o.km)
  const extra = o.abc ? PACE.abcMin : o.strides ? 5 : 0
  return {
    ...base('easy_run', ctx),
    optional: o.optional ?? false,
    title: `${TYPE_LABEL.easy_run} ${km(d)}`,
    durationMin: Math.round(d * PACE.easy + extra),
    distanceKm: d,
    elevationM: 0,
    structure: {
      warmup: '5 min zügig gehen oder sehr ruhig einlaufen.',
      main: `${km(d)} locker in Zone 2, Unterhaltungstempo.`,
      cooldown: o.abc
        ? `${PACE.abcMin} min Lauf-ABC (Skippings, Anfersen, Hopserlauf) und 4 × 20 s Steigerungen, dann Waden und Hüfte dehnen.`
        : o.strides
          ? '4 × 20 s lockere Steigerungen, dann 5 min auslaufen.'
          : '5 min auslaufen, Waden und Hüfte dehnen.',
    },
  }
}

export function recoveryRun(ctx: SessionContext, minutes: number, optional = true): PlannedSession {
  const d = roundKm(minutes / PACE.recovery)
  return {
    ...base('recovery_run', ctx),
    optional,
    title: `${TYPE_LABEL.recovery_run} ${minutes} min`,
    durationMin: minutes,
    distanceKm: d,
    elevationM: 0,
    structure: {
      warmup: 'Langsam angehen, die ersten Minuten gerne gehen.',
      main: `${minutes} min sehr locker (Zone 1), jederzeit sprechen können.`,
      cooldown: '5 min lockeres Dehnen.',
    },
  }
}

export interface LongRunOptions {
  km: number
  elevationM?: number
  part?: 1 | 2
  afternoon?: boolean
}

/** Langer Lauf, Back-to-back und Nachtlauf. Ab Aufbau mit Verpflegungstraining und Ausrüstungstest. */
export function longRun(type: 'long_run' | 'b2b_1' | 'b2b_2' | 'night_run', ctx: SessionContext, o: LongRunOptions): PlannedSession {
  const d = roundKm(o.km)
  const hm = Math.round(o.elevationM ?? 0)
  const pace = type === 'night_run' ? PACE.night : ctx.phase === 'specific' ? PACE.longSpecific : PACE.long
  const hmMin = hm > 0 ? (hm / CONFIG.pace.mountainHmPerHour) * 60 : 0
  const fueling = ctx.phase !== 'base'
  const gear = ctx.phase === 'build' || ctx.phase === 'specific'
  const hmText = hm > 0 ? ` Darin ${hm} hm als Block: Treppen, Parkhaus, Brücken/Deiche oder Laufband (10–15 %) am Ende.` : ''
  const fuelText = fueling ? ' Verpflegung wie im Rennen: 60–90 g Kohlenhydrate pro Stunde, Menge protokollieren.' : ''
  const gearText = gear
    ? type === 'night_run'
      ? ' Ausrüstung testen: Stirnlampe, Ersatzakku, Rucksack, warme Schicht.'
      : ' Ausrüstung testen: Rucksack, Stöcke, Schuhe, Pflichtausrüstung.'
    : ''
  const main =
    type === 'night_run'
      ? `${km(d)} locker in der Dunkelheit mit Stirnlampe (Start ca. 21:00 Uhr), bekannte, sichere Strecke.`
      : type === 'b2b_2'
        ? `${km(d)} locker auf müden Beinen${o.afternoon ? ', am Nachmittag' : ''}, Gehpausen bewusst einbauen.`
        : `${km(d)} locker, Gehpausen erlaubt, gleichmäßig bleiben.`
  const structure: SessionStructure = {
    warmup: 'Die ersten 10–15 min bewusst langsam, dann ins Grundtempo finden.',
    main: main + hmText + fuelText + gearText,
    cooldown: '5–10 min gehen, danach innerhalb von 30 min essen (Kohlenhydrate + Eiweiß).',
  }
  return {
    ...base(type, ctx),
    goal: GOAL[type] + (fueling ? ' Verpflegung und Ausrüstung testen.' : ''),
    title: `${TYPE_LABEL[type]} ${km(d)}`,
    durationMin: Math.round(d * pace + hmMin),
    distanceKm: d,
    elevationM: hm,
    structure,
    fueling,
    gearTest: gear,
  }
}

export function mountainDay(ctx: SessionContext, o: { km: number; elevationM: number; day: 1 | 2 }): PlannedSession {
  const d = roundKm(o.km)
  const hours = d / PACE.mountainKmh + o.elevationM / PACE.mountainHmPerHour
  return {
    ...base('mountain_day', ctx),
    title: `${TYPE_LABEL.mountain_day} ${o.day}/2: ${km(d)}, ${o.elevationM} hm`,
    durationMin: Math.round(hours * 60),
    distanceKm: d,
    elevationM: o.elevationM,
    fueling: true,
    gearTest: true,
    structure: {
      warmup: 'Ruhig loslaufen, bergauf von Anfang an gehen.',
      main: `${km(d)} mit ${o.elevationM} hm im alpinen Gelände. Bergauf zügig gehen (mit Stöcken), bergab kontrolliert und locker laufen. 60–90 g KH pro Stunde, Pflichtausrüstung im Rucksack.${o.day === 2 ? ' Tag 2 auf müden Beinen, Fokus auf sauberes Bergablaufen.' : ''}`,
      cooldown: 'Auslaufen/gehen, Beine hochlegen, viel trinken und essen.',
    },
  }
}

/** Anteil (0–1) der Phase für die Progression von Qualitätseinheiten. */
function progressText(p: number | undefined): number {
  return Math.max(0, Math.min(1, p ?? 0))
}

export function intervalsUphill(ctx: SessionContext, variant: 'normal' | 'short' = 'normal'): PlannedSession {
  const p = progressText(ctx.progress)
  let reps: number
  let work: number
  let rest: number
  if (variant === 'short') {
    reps = 4
    work = 2
    rest = 2
  } else if (ctx.phase === 'specific') {
    reps = Math.round(4 + 2 * p)
    work = 5
    rest = 2.5
  } else {
    reps = Math.round(5 + 3 * p)
    work = 3
    rest = 2
  }
  const wu = PACE.qualityWarmupMin
  const cd = PACE.qualityCooldownMin
  const workKm = (reps * work * PACE.intervalSpeedKmh) / 60
  const restKm = (reps * rest) / PACE.recovery
  const d = roundKm(wu / PACE.easy + cd / PACE.easy + workKm + restKm)
  const hm = Math.round(workKm * PACE.intervalInclinePct * 10)
  return {
    ...base('intervals_uphill', ctx),
    title: `${TYPE_LABEL.intervals_uphill} ${reps} × ${formatNumberDE(work)} min`,
    durationMin: Math.round(wu + cd + reps * (work + rest)),
    distanceKm: d,
    elevationM: hm,
    treadmill: { inclinePct: PACE.intervalInclinePct, inclineKm: Number(workKm.toFixed(2)) },
    structure: {
      warmup: `${wu} min locker einlaufen, dazu 3 kurze Steigerungen.`,
      main: `${reps} × ${formatNumberDE(work)} min hart bergauf (Laufband ${PACE.intervalInclinePct} % oder Hügel/Brücke, RPE 8), dazwischen ${formatNumberDE(rest)} min locker traben oder gehen.`,
      cooldown: `${cd} min locker auslaufen.`,
    },
  }
}

export function threshold(ctx: SessionContext, variant: 'normal' | 'short' = 'normal'): PlannedSession {
  const p = progressText(ctx.progress)
  let reps: number
  let work: number
  if (variant === 'short') {
    reps = 3
    work = 5
  } else if (ctx.phase === 'specific') {
    reps = 2
    work = Math.round(15 + 5 * p)
  } else {
    reps = 3
    work = Math.round(8 + 4 * p)
  }
  const rest = 2
  const wu = PACE.qualityWarmupMin
  const cd = PACE.qualityCooldownMin
  const d = roundKm(wu / PACE.easy + cd / PACE.easy + (reps * work) / PACE.threshold + (reps * rest) / PACE.recovery)
  return {
    ...base('threshold', ctx),
    title: `${TYPE_LABEL.threshold} ${reps} × ${work} min`,
    durationMin: Math.round(wu + cd + reps * (work + rest)),
    distanceKm: d,
    elevationM: 0,
    structure: {
      warmup: `${wu} min locker einlaufen, dazu 3 Steigerungen.`,
      main: `${reps} × ${work} min an der Schwelle (Zone 3–4, RPE 7, „angenehm hart“), dazwischen ${rest} min traben.`,
      cooldown: `${cd} min locker auslaufen.`,
    },
  }
}

export interface HillsOptions {
  km: number
  targetElevationM: number
  optional?: boolean
}

/** Höhenmeter-Einheit auf dem Laufband (SPEC 5.4): hm = Distanz × Steigung. */
export function treadmillHills(ctx: SessionContext, o: HillsOptions): PlannedSession {
  const d = roundKm(o.km)
  const pct = PACE.inclinePctByPhase[ctx.phase]
  const maxIncline = d * PACE.maxInclineShare
  const inclineKm = Math.min(maxIncline, Math.max(0, o.targetElevationM) / (pct * 10))
  const hm = Math.round(inclineKm * pct * 10)
  const flatKm = Math.max(0, d - inclineKm)
  const withGear = ctx.phase !== 'base'
  return {
    ...base('treadmill_hills', ctx),
    optional: o.optional ?? false,
    title: `${TYPE_LABEL.treadmill_hills} ${hm} hm`,
    durationMin: Math.round(flatKm * PACE.easy + inclineKm * PACE.incline + 5),
    distanceKm: d,
    elevationM: hm,
    treadmill: { inclinePct: pct, inclineKm: Number(inclineKm.toFixed(2)) },
    structure: {
      warmup: `${km(roundKm(flatKm / 2))} flach locker einlaufen.`,
      main: `${formatNumberDE(inclineKm)} km bei ${pct} % Steigung (${hm} hm): im Wechsel 4 min zügig gehen, 1 min locker laufen${withGear ? ', mit Stöcken und Rucksack (3–5 kg)' : ''}. Alternativ Stairmaster, Treppen oder Parkhaus.`,
      cooldown: `${km(roundKm(flatKm / 2))} flach auslaufen, Waden dehnen.`,
    },
  }
}

// ---------------------------------------------------------------------------
// Kraft, Mobility, Rennen
// ---------------------------------------------------------------------------

export interface StrengthOptions {
  optional?: boolean
  strengthState?: StrengthState
}

export function strengthSession(type: SessionType, ctx: SessionContext, o: StrengthOptions = {}): PlannedSession {
  const duration = CONFIG.strength.durationMin[type] ?? 30
  const estimate = CONFIG.strength.setsEstimate[type] ?? 0
  const content = o.strengthState ? buildStrengthSession(type, o.strengthState, ctx.phase) : undefined
  const isLegs = type === 'legs_heavy'
  const structure: SessionStructure =
    type === 'mobility'
      ? { warmup: '2 min lockeres Gehen.', main: 'Hüftbeuger, Waden, Brustwirbelsäule, Schultern und tiefe Hocke mobilisieren.', cooldown: 'Ruhig atmen.' }
      : {
          warmup: isLegs
            ? '10 min: 5 min Rad/Rudern, dann Hüft- und Sprunggelenk mobilisieren, 2 leichte Aufwärmsätze.'
            : '10 min: Handgelenke und Schultern mobilisieren, Scapula-Pulls, leichte Aufwärmsätze.',
          main:
            type === 'strength_test'
              ? 'Testprotokoll mit voller Pause: max. Klimmzüge, max. Dips, Hollow Body Hold, beste Front- und Back-Lever-Stufe mit Haltezeit.'
              : 'Übungen laut Liste, saubere Technik vor Wiederholungszahl.',
          cooldown: '5 min dehnen (Brust, Lat, Hüfte, Waden).',
        }
  const s: PlannedSession = {
    ...base(type, ctx),
    optional: o.optional ?? false,
    title: TYPE_LABEL[type],
    durationMin: duration,
    structure,
    strengthSets: content?.strengthSets ?? estimate,
  }
  if (content) {
    s.exercises = content.exercises
    if (content.containsNewLevel) {
      s.containsNewLevel = true
      s.sensitivity = 'high'
    }
  }
  return s
}

export function mobility(ctx: SessionContext, minutes: number = CONFIG.strength.durationMin.mobility ?? 20, optional = true): PlannedSession {
  return {
    ...strengthSession('mobility', ctx, { optional }),
    title: `${TYPE_LABEL.mobility} ${minutes} min`,
    durationMin: minutes,
  }
}

export function raceSession(ctx: SessionContext): PlannedSession {
  const R = CONFIG.race
  return {
    ...base('race', ctx),
    title: `${TYPE_LABEL.race}: ${R.distanceKm} km, ${R.elevationGainM} hm`,
    goal: GOAL.race,
    isKey: true,
    durationMin: R.cutoffHours * 60,
    distanceKm: R.distanceKm,
    elevationM: R.elevationGainM,
    startMin: R.startMin,
    fueling: true,
    gearTest: false,
    structure: {
      warmup: 'Nap am Nachmittag, leichte Mahlzeit ca. 3 h vor dem Start, Pflichtausrüstung prüfen.',
      main: `Start 23:00 Uhr in Ehrwald. Bergauf konsequent gehen, bergab locker, 60–90 g KH pro Stunde. Zeitlimit ${R.cutoffHours} h (Zielschluss Samstag 21:00 Uhr).`,
      cooldown: 'Ankommen, essen, trinken, schlafen.',
    },
  }
}

/** Intensitätsstufe als Zahl (für „nie härter als geplant“). */
export function intensityLevel(s: PlannedSession): IntensityLevel {
  return s.intensity.level
}
