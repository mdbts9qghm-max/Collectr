// Stellt die Einheiten eines Mikrozyklus aus der Vorlage zusammen und verteilt
// Kilometer und Höhenmeter (noch ohne Schichtprüfung, das macht schedule.ts).

import { CONFIG } from '../config'
import { addDays } from '../time'
import type { CycleDay, Microcycle, PlannedSession, SessionType, StrengthState } from '../types'
import {
  easyRun,
  intervalsUphill,
  longRun,
  mobility,
  mountainDay,
  raceSession,
  recoveryRun,
  strengthSession,
  threshold,
  treadmillHills,
  type SessionContext,
} from './templates'
import type { MicroVolume } from './volume'

const V = CONFIG.volume
const PACE = CONFIG.pace

export interface IntendedSession {
  cycleDay: CycleDay
  session: PlannedSession
}

export interface ComposeOptions {
  /** Fortschritt innerhalb der Phase (0–1). */
  progress: number
  /** Reduktionsfaktor aus der Erholung (1 = keine Reduktion). */
  modifier: number
  strengthState?: StrengthState
}

type FlexKind = 'easy' | 'easy_abc' | 'easy_strides' | 'hills' | 'easy_afternoon'

interface Flex {
  day: CycleDay
  kind: FlexKind
  share: number
}

interface Fixed {
  day: CycleDay
  make: (ctx: SessionContext, km: number, hm: number) => PlannedSession
  km: number
  /** Kann zur Einhaltung der Obergrenze gekürzt werden (lange Läufe). */
  scalable: boolean
  /** Kann Höhenmeter-Block aufnehmen. */
  hmCapable: boolean
  fixedHm?: number
}

interface Extra {
  day: CycleDay
  make: (ctx: SessionContext) => PlannedSession
}

const flexType = (k: FlexKind): SessionType => (k === 'hills' ? 'treadmill_hills' : 'easy_run')

function flexMin(k: FlexKind): number {
  return V.minKm[flexType(k)] ?? 4
}

function flexMax(k: FlexKind): number {
  if (k === 'easy_afternoon') return V.maxKmAfterNightRun
  return V.maxKm[flexType(k)] ?? 16
}

/** Verteilt `rest` km auf flexible Einheiten nach Anteil, mit Mindest- und Höchstwerten. */
export function allocateFlex(rest: number, flex: Flex[]): Map<Flex, number> {
  let active = [...flex]
  for (;;) {
    const out = new Map<Flex, number>()
    const shareSum = active.reduce((a, f) => a + f.share, 0)
    for (const f of active) out.set(f, Math.min(flexMax(f.kind), Math.max(0, (rest * f.share) / (shareSum || 1))))
    const tooSmall = active.filter((f) => out.get(f)! < flexMin(f.kind))
    if (tooSmall.length === 0) return out
    if (active.length > 1) {
      // die Einheit mit dem kleinsten Anteil fällt weg, ihr Anteil geht an die anderen
      const drop = [...active].sort((a, b) => a.share - b.share)[0]!
      active = active.filter((f) => f !== drop)
      continue
    }
    out.set(active[0]!, flexMin(active[0]!.kind))
    return out
  }
}

export function composeMicro(micro: Microcycle, vol: MicroVolume, opts: ComposeOptions): IntendedSession[] {
  const m = Math.max(0, Math.min(1, opts.modifier))
  const target = vol.targetKm * m
  const cap = vol.capKm * m
  const elevationTarget = vol.targetElevationM * m
  const specific = V.specificRuns[micro.index] ?? {}
  const phase = micro.phase
  const ctxFor = (day: CycleDay, slot: string): SessionContext => ({
    date: addDays(micro.start, day - 1),
    microIndex: micro.index,
    phase,
    slot,
    progress: opts.progress,
  })
  const strength = (type: SessionType, optional = false) => (ctx: SessionContext) =>
    strengthSession(type, ctx, { optional, ...(opts.strengthState ? { strengthState: opts.strengthState } : {}) })

  const fixed: Fixed[] = []
  const flex: Flex[] = []
  const extras: Extra[] = []
  const optionals: Extra[] = []

  // Nachtläufe bekommen keinen Höhenmeter-Block (sicheres, bekanntes Gelände in der Dunkelheit).
  const addLong = (day: CycleDay, type: 'long_run' | 'b2b_1' | 'b2b_2' | 'night_run', km: number, afternoon = false) =>
    fixed.push({ day, km, scalable: true, hmCapable: type !== 'night_run', make: (ctx, k, hm) => longRun(type, ctx, { km: k, elevationM: hm, afternoon }) })
  const addQuality = (day: CycleDay, type: 'threshold' | 'intervals_uphill', variant: 'normal' | 'short' = 'normal') => {
    const probe = type === 'threshold' ? threshold(ctxFor(day, 'lauf'), variant) : intervalsUphill(ctxFor(day, 'lauf'), variant)
    fixed.push({
      day,
      km: probe.distanceKm ?? 0,
      scalable: false,
      hmCapable: false,
      fixedHm: probe.elevationM ?? 0,
      make: (ctx) => (type === 'threshold' ? threshold(ctx, variant) : intervalsUphill(ctx, variant)),
    })
  }
  const addEasyFixed = (day: CycleDay, km: number, strides = false) =>
    fixed.push({ day, km, scalable: false, hmCapable: false, make: (ctx, k) => easyRun(ctx, { km: k, strides }) })
  const optionalD3 = (withRun: boolean, skill: boolean) => {
    if (withRun) optionals.push({ day: 3, make: (ctx) => recoveryRun(ctx, V.optionalRecoveryRunMin, true) })
    optionals.push({ day: 3, make: skill ? strength('skill_light', true) : (ctx) => mobility(ctx, 20, true) })
  }

  switch (micro.template) {
    case 'base':
      addLong(4, 'long_run', vol.longRunKm)
      flex.push({ day: 2, kind: 'easy_abc', share: 0.62 }, { day: 5, kind: 'hills', share: 0.38 })
      extras.push({ day: 2, make: strength('legs_heavy') }, { day: 5, make: strength('calisthenics_main') })
      optionalD3(true, true)
      break
    case 'build_a':
    case 'build_b':
      addQuality(2, micro.template === 'build_a' ? 'intervals_uphill' : 'threshold')
      addLong(4, 'long_run', vol.longRunKm)
      flex.push({ day: 5, kind: 'hills', share: 1 })
      extras.push({ day: 2, make: strength('legs_heavy') }, { day: 5, make: strength('calisthenics_main') })
      optionalD3(true, true)
      break
    case 'deload':
      addLong(4, 'long_run', vol.longRunKm)
      flex.push({ day: 2, kind: 'hills', share: 0.6 }, { day: 5, kind: 'easy', share: 0.4 })
      extras.push({ day: 2, make: strength(micro.hasStrengthTest ? 'strength_test' : 'calisthenics_maintenance') })
      extras.push({ day: 5, make: (ctx) => mobility(ctx, 20, false) })
      optionalD3(false, false)
      break
    case 'specific_b2b': {
      const [a, b] = specific.b2b ?? [20, 12]
      addLong(4, 'b2b_1', a)
      addLong(5, 'b2b_2', b)
      flex.push({ day: 2, kind: 'hills', share: 1 })
      extras.push({ day: 2, make: strength('calisthenics_maintenance') })
      optionalD3(true, false)
      break
    }
    case 'specific_night':
      addQuality(2, 'intervals_uphill')
      addLong(4, 'night_run', specific.night ?? 24)
      flex.push({ day: 5, kind: 'easy_afternoon', share: 1 })
      extras.push({ day: 2, make: strength('legs_heavy') }, { day: 5, make: strength('calisthenics_maintenance') })
      optionalD3(true, false)
      break
    case 'specific_long':
      addLong(4, 'long_run', specific.long ?? 35)
      flex.push({ day: 2, kind: 'hills', share: 1 })
      extras.push({ day: 2, make: strength('calisthenics_maintenance') }, { day: 5, make: (ctx) => mobility(ctx, 25, false) })
      optionalD3(true, false)
      break
    case 'specific_mountain': {
      const [a, b] = specific.mountain ?? [25, 15]
      const [ha, hb] = V.mountainElevation[micro.index] ?? [1500, 800]
      fixed.push({ day: 4, km: a, scalable: false, hmCapable: false, fixedHm: ha, make: (ctx, k) => mountainDay(ctx, { km: k, elevationM: ha, day: 1 }) })
      fixed.push({ day: 5, km: b, scalable: false, hmCapable: false, fixedHm: hb, make: (ctx, k) => mountainDay(ctx, { km: k, elevationM: hb, day: 2 }) })
      flex.push({ day: 2, kind: 'easy', share: 1 })
      extras.push({ day: 2, make: strength('calisthenics_maintenance') })
      optionalD3(false, false)
      break
    }
    case 'specific_final':
      addLong(4, 'long_run', specific.long ?? 22)
      flex.push({ day: 2, kind: 'easy', share: 0.6 }, { day: 5, kind: 'hills', share: 0.4 })
      extras.push({ day: 2, make: strength('strength_test') }, { day: 5, make: strength('calisthenics_maintenance') })
      optionalD3(true, false)
      break
    case 'taper1': {
      const s = V.taperShares.taper1
      addQuality(2, 'threshold', 'short')
      addLong(4, 'long_run', target * s.day4)
      addEasyFixed(5, target * s.day5, true)
      extras.push({ day: 2, make: strength('strength_short') })
      break
    }
    case 'taper2': {
      const s = V.taperShares.taper2
      addQuality(2, 'intervals_uphill', 'short')
      addEasyFixed(4, target * s.day4)
      addEasyFixed(5, target * s.day5, true)
      extras.push({ day: 2, make: strength('strength_short') })
      break
    }
    case 'race_week': {
      const s = V.taperShares.race_week
      addEasyFixed(2, target * s.day2, true)
      addEasyFixed(4, target * s.day4)
      extras.push({ day: 5, make: (ctx) => raceSession({ ...ctx, slot: 'rennen' }) })
      break
    }
  }

  // --- Kilometer: flexible Einheiten füllen, Obergrenze einhalten --------------------------
  const fixedKm = () => fixed.reduce((a, f) => a + f.km, 0)
  let flexKm = allocateFlex(target - fixedKm(), flex)
  const total = () => fixedKm() + [...flexKm.values()].reduce((a, v) => a + v, 0)
  if (total() > cap) {
    const scalable = fixed.filter((f) => f.scalable)
    const scalableKm = scalable.reduce((a, f) => a + f.km, 0)
    if (scalableKm > 0) {
      const over = total() - cap
      const factor = Math.max(V.minLongRunShareOfPlan, (scalableKm - over) / scalableKm)
      for (const f of scalable) f.km *= factor
    }
    flexKm = allocateFlex(Math.max(0, target - fixedKm()), flex)
    // Flexible Einheiten dürfen die Obergrenze nicht sprengen.
    let excess = total() - cap
    for (const f of [...flexKm.keys()].sort((a, b) => a.share - b.share)) {
      if (excess <= 0) break
      const v = flexKm.get(f)!
      const reduced = Math.max(flexMin(f.kind), v - excess)
      excess -= v - reduced
      flexKm.set(f, reduced)
    }
  }

  // --- Höhenmeter verteilen ------------------------------------------------------------------
  let hmLeft = elevationTarget - fixed.reduce((a, f) => a + (f.fixedHm ?? 0), 0)
  const out: IntendedSession[] = []
  for (const [f, k] of flexKm) {
    const ctx = ctxFor(f.day, 'lauf')
    let s: PlannedSession
    if (f.kind === 'hills') {
      s = treadmillHills(ctx, { km: k, targetElevationM: Math.max(0, hmLeft) })
      hmLeft -= s.elevationM ?? 0
    } else {
      s = easyRun(ctx, { km: k, abc: f.kind === 'easy_abc', strides: f.kind === 'easy_strides' })
      if (f.kind === 'easy_afternoon') s.startMin = CONFIG.windows.afternoonStart
    }
    out.push({ cycleDay: f.day, session: s })
  }
  const hmCapable = fixed.filter((f) => f.hmCapable)
  const hmCap = PACE.longRunHmCap[phase]
  for (const f of fixed) {
    let hm = f.fixedHm ?? 0
    if (f.hmCapable && hmLeft > 0 && hmCap > 0) {
      hm = Math.min(hmCap, Math.round(hmLeft / hmCapable.length / 10) * 10)
    }
    const s = f.make(ctxFor(f.day, f.day === 5 && micro.template === 'race_week' ? 'rennen' : 'lauf'), f.km, hm)
    out.push({ cycleDay: f.day, session: s })
  }
  for (const e of extras) out.push({ cycleDay: e.day, session: e.make(ctxFor(e.day, sessionSlot(e.day, out))) })
  if (m >= 1) for (const e of optionals) out.push({ cycleDay: e.day, session: e.make(ctxFor(e.day, sessionSlot(e.day, out))) })

  // Nachmittags-Start für B2B Teil 2 nach einem Nachtlauf wird im Scheduler gesetzt.
  return out
}

/** Eindeutiger Slot-Name für eine weitere Einheit an diesem Tag. */
function sessionSlot(day: CycleDay, existing: IntendedSession[]): string {
  const n = existing.filter((e) => e.cycleDay === day).length
  return n === 0 ? 'lauf' : n === 1 ? 'kraft' : `extra${n}`
}
