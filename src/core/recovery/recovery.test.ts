import { describe, expect, it } from 'vitest'
import { CONFIG } from '../config'
import { easyRun, generatePlan, intervalsUphill, longRun, mobility, mountainDay, raceSession, recoveryRun, strengthSession, threshold, treadmillHills, type SessionContext } from '../plan'
import { buildMicrocycles } from '../plan'
import { createShiftCalendar, shiftContext } from '../shift'
import { addDays } from '../time'
import type { DayKind, PlannedSession, RecoveryDay, SessionType } from '../types'
import {
  acuteChronicRatio,
  adjustSession,
  assessReadiness,
  dailyLoads,
  lookaheadStrength,
  microcycleReduction,
  microModifiersFromHistory,
  sessionLoad,
  suggestCatchUp,
  upcomingKeySessions,
  yellowFactor,
  type ReadinessResult,
  type UpcomingKey,
} from './index'

const DATE = '2026-12-12' // Tag 2 im Aufbau (vor der Nacht)
const ctx: SessionContext = { date: DATE, microIndex: 15, phase: 'build', slot: 'lauf' }

/** Eine Einheit je Typ (ohne Rennen). */
function sessionsOfEveryType(): PlannedSession[] {
  const strength = (['calisthenics_main', 'calisthenics_maintenance', 'skill_light', 'legs_heavy', 'strength_short', 'strength_test'] as SessionType[]).map((t) =>
    strengthSession(t, { ...ctx, slot: t }),
  )
  return [
    easyRun(ctx, { km: 10 }),
    recoveryRun(ctx, 30, false),
    longRun('long_run', ctx, { km: 28 }),
    longRun('b2b_1', ctx, { km: 25 }),
    longRun('b2b_2', ctx, { km: 15 }),
    longRun('night_run', ctx, { km: 24 }),
    mountainDay(ctx, { km: 28, elevationM: 1800, day: 1 }),
    intervalsUphill(ctx),
    threshold(ctx),
    treadmillHills(ctx, { km: 8, targetElevationM: 700 }),
    ...strength,
    mobility(ctx, 20, false),
  ]
}

function whoopDay(date: string, score: number, sleepMin = 450, extra: Partial<RecoveryDay> = {}): RecoveryDay {
  return { date, source: 'whoop', recoveryScore: score, hrvMs: 70, restingHr: 50, sleep: { durationMin: sleepMin, needMin: 480 }, ...extra }
}

function readiness(score: number, sleepMin = 450, extra: Partial<RecoveryDay> = {}): ReadinessResult {
  return assessReadiness({ date: DATE, today: whoopDay(DATE, score, sleepMin, extra) })
}

const adjust = (s: PlannedSession, r: ReadinessResult, dayKind: DayKind = 'pre_night', upcoming: UpcomingKey[] = []) =>
  adjustSession(s, { readiness: r, dayKind, phase: 'build', upcoming })

describe('Bereitschaft und Ampel (SPEC 6.1, 6.2)', () => {
  it('WHOOP-Grenzen: grün ≥ 67, gelb 34–66, rot ≤ 33', () => {
    expect(readiness(67).traffic).toBe('green')
    expect(readiness(66).traffic).toBe('yellow')
    expect(readiness(34).traffic).toBe('yellow')
    expect(readiness(33).traffic).toBe('red')
  })

  it('fehlende WHOOP-Daten führen zur manuellen Eingabe statt zu einem Fehler', () => {
    const r = assessReadiness({ date: DATE })
    expect(r.needsManualInput).toBe(true)
    const a = adjust(threshold(ctx), r)
    expect(a.action).toBe('needs_input')
    expect(a.adjusted).toEqual(a.original)
    expect(a.reason).toContain('eintragen')
  })

  it('manuelle Eingabe (Schlaf, Qualität, Gefühl) ergibt eine Ampel', () => {
    const good = assessReadiness({ date: DATE, today: { date: DATE, source: 'manual', manual: { date: DATE, sleepMin: 480, quality: 5, feeling: 5 } } })
    expect(good.source).toBe('manual')
    expect(good.traffic).toBe('green')
    const bad = assessReadiness({ date: DATE, today: { date: DATE, source: 'manual', manual: { date: DATE, sleepMin: 240, quality: 1, feeling: 1 } } })
    expect(bad.traffic).toBe('red')
    expect(bad.sleepMin).toBe(240)
  })

  it('HRV und Ruhepuls fließen gegen das persönliche Mittel ein', () => {
    const history = Array.from({ length: 30 }, (_, i) => whoopDay(addDays(DATE, -30 + i), 70, 470, { hrvMs: 70 + (i % 5), restingHr: 50 + (i % 3) }))
    const low = assessReadiness({ date: DATE, today: whoopDay(DATE, 50, 450, { hrvMs: 50, restingHr: 58 }), history })
    const high = assessReadiness({ date: DATE, today: whoopDay(DATE, 50, 450, { hrvMs: 80, restingHr: 48 }), history })
    expect(low.components.hrv!).toBeLessThan(high.components.hrv!)
    expect(low.components.restingHr!).toBeLessThan(high.components.restingHr!)
    expect(low.readiness!).toBeLessThan(high.readiness!)
  })

  it('Schichtkontext senkt die Bereitschaft nach einer Arbeitsnacht', () => {
    const cal = createShiftCalendar()
    const day3 = assessReadiness({ date: '2026-10-04', today: whoopDay('2026-10-04', 60), shift: shiftContext(cal, '2026-10-04', 15 * 60) })
    const day4 = assessReadiness({ date: '2026-10-05', today: whoopDay('2026-10-05', 60), shift: shiftContext(cal, '2026-10-05', 9 * 60) })
    expect(day3.components.shift!).toBeLessThan(day4.components.shift!)
  })

  it('Gewichte sind einstellbar', () => {
    const t = whoopDay(DATE, 80, 240)
    const sleepHeavy = assessReadiness({ date: DATE, today: t, weights: { sleep: 10 } })
    const normal = assessReadiness({ date: DATE, today: t })
    expect(sleepHeavy.readiness!).toBeLessThan(normal.readiness!)
  })

  it('Warnsignal: Ruhepuls mehrere Tage erhöht und HRV deutlich unter dem Mittel', () => {
    const history: RecoveryDay[] = Array.from({ length: 30 }, (_, i) => whoopDay(addDays(DATE, -33 + i), 70, 470, { hrvMs: 70, restingHr: 50 }))
    for (let i = 2; i >= 1; i--) history.push(whoopDay(addDays(DATE, -i), 45, 470, { hrvMs: 55, restingHr: 57 }))
    const r = assessReadiness({ date: DATE, today: whoopDay(DATE, 45, 470, { hrvMs: 55, restingHr: 57 }), history })
    expect(r.warning).toBe(true)
    const a = adjust(easyRun(ctx, { km: 8 }), r)
    expect(a.action).toBe('cancel')
    expect(a.healthWarning).toBe(true)
    expect(a.reason).toContain('ärztlich')
  })

  it('Trainingslast: Akut/Chronisch und Last aus Protokollen', () => {
    const loads = Array.from({ length: 28 }, (_, i) => ({ date: addDays(DATE, -28 + i), load: i >= 21 ? 400 : 200 }))
    expect(acuteChronicRatio(loads, DATE)).toBeCloseTo(400 / 250, 5)
    expect(sessionLoad(60, 4)).toBe(240)
    const s = threshold(ctx)
    const l = dailyLoads([{ sessionId: s.id, date: DATE, status: 'done' }, { sessionId: 'x', date: DATE, status: 'skipped' }], new Map([[s.id, s]]))
    expect(l).toEqual([{ date: DATE, load: sessionLoad(s.durationMin, 4) }])
  })
})

describe('Grün, Gelb und Rot für jeden Einheitentyp (SPEC 6.3, 11)', () => {
  const all = sessionsOfEveryType()

  it('Grün: jede Einheit wie geplant', () => {
    for (const s of all) {
      const a = adjust(s, readiness(80))
      expect(a.action, s.type).toBe('keep')
      expect(a.adjusted, s.type).toEqual(s)
    }
  })

  it('Gelb: nur harte Einheiten werden runtergestuft, alles andere bleibt unverändert', () => {
    const r = readiness(50)
    for (const s of all) {
      const a = adjust(s, r)
      if (CONFIG.sessions.sensitivity[s.type] === 'high') {
        expect(a.action, s.type).not.toBe('keep')
        expect(a.adjusted, s.type).not.toBeNull()
        expect(a.adjusted!.durationMin, s.type).toBeLessThanOrEqual(s.durationMin)
      } else {
        expect(a.action, s.type).toBe('keep')
        expect(a.adjusted, s.type).toEqual(s)
      }
    }
  })

  it('Gelb: lange Läufe, Höhenmeter-Einheit, Calisthenics-Hauptsession und lockere Einheiten bleiben', () => {
    const r = readiness(40)
    for (const t of ['long_run', 'treadmill_hills', 'calisthenics_main', 'easy_run', 'mobility', 'skill_light'] as SessionType[]) {
      const s = all.find((x) => x.type === t)!
      expect(adjust(s, r).adjusted).toEqual(s)
    }
  })

  it('Gelb: Intervall wird lockerer Lauf, 10–25 % kürzer', () => {
    const s = intervalsUphill(ctx)
    for (const score of [34, 50, 66]) {
      const a = adjust(s, readiness(score))
      expect(a.adjusted!.type).toBe('easy_run')
      expect(a.adjusted!.intensity.level).toBeLessThan(s.intensity.level)
      const ratio = a.adjusted!.durationMin / s.durationMin
      expect(ratio).toBeGreaterThanOrEqual(0.74)
      expect(ratio).toBeLessThanOrEqual(0.91)
    }
    expect(yellowFactor(34)).toBeCloseTo(0.75)
    expect(yellowFactor(66)).toBeCloseTo(0.9)
  })

  it('Gelb: schwere Sätze werden Technik-Sätze, neue Skill-Stufe wird Training auf der aktuellen Stufe', () => {
    const legs = adjust(strengthSession('legs_heavy', ctx), readiness(50)).adjusted!
    expect(legs.technique).toBe(true)
    const newLevel: PlannedSession = { ...strengthSession('calisthenics_main', ctx), containsNewLevel: true, sensitivity: 'high' }
    const a = adjust(newLevel, readiness(50))
    expect(a.adjusted!.containsNewLevel).toBe(false)
    expect(a.reason).toContain('bisherigen Stufe')
  })

  it('Rot: Ruhetag oder höchstens 30 Minuten sehr locker bzw. Mobility', () => {
    const r = readiness(25)
    for (const s of all) {
      const a = adjust(s, r)
      if (a.adjusted) {
        expect(a.adjusted.durationMin, s.type).toBeLessThanOrEqual(CONFIG.recovery.redMaxMin)
        expect(['recovery_run', 'easy_run', 'mobility'], s.type).toContain(a.adjusted.type)
      } else {
        expect(a.action).toBe('cancel')
        expect(a.alternative?.type).toBe('mobility')
      }
    }
    expect(adjust(longRun('long_run', ctx, { km: 30 }), r).adjusted).toBeNull()
  })

  it('nie härter als geplant (alle Typen, viele Zustände)', () => {
    for (const score of [10, 30, 40, 55, 66, 70, 95]) {
      for (const sleep of [200, 290, 330, 480]) {
        for (const dayKind of ['pre_night', 'sleep_day', 'free'] as DayKind[]) {
          const r = readiness(score, sleep)
          for (const s of all) {
            const a = adjust(s, r, dayKind)
            if (!a.adjusted) continue
            expect(a.adjusted.durationMin).toBeLessThanOrEqual(s.durationMin)
            expect(a.adjusted.intensity.level).toBeLessThanOrEqual(s.intensity.level)
            if (s.distanceKm !== undefined && a.adjusted.distanceKm !== undefined) expect(a.adjusted.distanceKm).toBeLessThanOrEqual(s.distanceKm)
            expect(a.unitFactor).toBeLessThanOrEqual(1)
          }
        }
      }
    }
  })

  it('Rennen wird nie angepasst', () => {
    const race = raceSession({ date: '2027-06-18', microIndex: 52, phase: 'taper', slot: 'rennen' })
    expect(adjust(race, readiness(20)).action).toBe('keep')
  })
})

describe('Schlaf unter 5 h und Schlaftag (SPEC 6.3)', () => {
  it('unter 5 h Schlaf: keine Intensität, kein schweres Krafttraining, unabhängig von der Recovery', () => {
    const r = readiness(85, 270)
    const t = adjust(threshold(ctx), r)
    expect(t.action).toBe('cancel')
    expect(t.alternative!.type).toBe('easy_run')
    expect(t.alternative!.optional).toBe(true)
    expect(adjust(strengthSession('legs_heavy', ctx), r).action).toBe('cancel')
    const cali = adjust(strengthSession('calisthenics_main', ctx), r).adjusted!
    expect(cali.technique).toBe(true)
    expect(adjust(longRun('long_run', ctx, { km: 25 }), r).action).toBe('keep')
    expect(t.reason).toContain('4,5 h Schlaf')
  })

  it('Schlaftag: Training nur bei mindestens Gelb und ca. 5 h Tagschlaf', () => {
    const run = recoveryRun({ ...ctx, date: '2026-12-13' }, 30)
    expect(adjust(run, readiness(50, 280), 'sleep_day').action).toBe('cancel')
    expect(adjust(run, readiness(50, 330), 'sleep_day').action).toBe('keep')
    expect(adjust(run, readiness(25, 400), 'sleep_day').adjusted?.durationMin ?? 0).toBeLessThanOrEqual(30)
    const cancelled = adjust(run, readiness(50, 280), 'sleep_day')
    expect(cancelled.reason).toContain('Tagschlaf nach der Nachtschicht')
  })

  it('Begründung in einem Satz mit Original und Anpassung', () => {
    const s = intervalsUphill(ctx)
    const a = adjust(s, readiness(41, 330), 'pre_night')
    expect(a.reason).toMatch(/^Recovery 41 %, nur 5,5 h Schlaf: Bergauf-Intervalle wird lockerer Lauf, \d+ statt \d+ min\.$/)
    expect(a.original).toEqual(s)
  })
})

describe('Vorausschau 6.3a', () => {
  const b2b1 = longRun('b2b_1', { ...ctx, date: '2026-12-14', slot: 'lauf' }, { km: 28 })
  const up: UpcomingKey[] = [{ date: '2026-12-14', daysAhead: 2, session: b2b1, nightShiftBetween: true }]

  it('Gelb vor einem Back-to-back: Schwellenlauf wird 45 min locker (reduziert statt gestrichen)', () => {
    const a = adjust(threshold(ctx), readiness(55), 'pre_night', up)
    expect(a.action).toBe('convert')
    expect(a.adjusted!.type).toBe('easy_run')
    expect(a.adjusted!.durationMin).toBe(45)
    expect(a.reason).toContain('übermorgen steht Back-to-back Tag 1 (28 km) an')
    expect(a.reason).toContain('45 min locker')
  })

  it('lockere Einheit bleibt unverändert', () => {
    const e = easyRun(ctx, { km: 8 })
    expect(adjust(e, readiness(55), 'pre_night', up).adjusted).toEqual(e)
  })

  it('schweres Beintraining wird Oberkörper-Calisthenics', () => {
    const a = adjust(strengthSession('legs_heavy', ctx), readiness(55), 'pre_night', up)
    expect(a.adjusted!.type).toBe('calisthenics_maintenance')
  })

  it('bei Grün keine Vorausschau (Entscheidung Phase 2)', () => {
    const t = threshold(ctx)
    expect(adjust(t, readiness(75), 'pre_night', up).adjusted).toEqual(t)
    expect(lookaheadStrength(readiness(75), up).strength).toBe(0)
  })

  it('nur bei Rot oder unter 5 h Schlaf wird gestrichen', () => {
    expect(adjust(threshold(ctx), readiness(25), 'pre_night', up).adjusted).toBeNull()
    expect(adjust(threshold(ctx), readiness(55, 280), 'pre_night', up).adjusted).toBeNull()
    expect(adjust(threshold(ctx), readiness(55, 420), 'pre_night', up).adjusted).not.toBeNull()
  })

  it('Stärke hängt von Wichtigkeit und Nähe ab', () => {
    const r = readiness(55)
    const far = lookaheadStrength(r, [{ ...up[0]!, nightShiftBetween: false }]).strength
    const near = lookaheadStrength(r, [{ ...up[0]!, daysAhead: 1, nightShiftBetween: false }]).strength
    expect(near).toBeGreaterThan(far)
    const test = strengthSession('strength_test', ctx)
    expect(lookaheadStrength(r, [{ ...up[0]!, session: test, nightShiftBetween: false }]).strength).toBeLessThan(far)
    // gelernte Muster (erwarteter Abfall) verstärken
    expect(lookaheadStrength(r, [{ ...up[0]!, nightShiftBetween: false }], 20).strength).toBeGreaterThan(far)
  })

  it('findet die kommenden Schlüsseleinheiten im Plan inkl. Nachtschicht dazwischen', () => {
    const plan = generatePlan()
    const u = upcomingKeySessions(plan, DATE, createShiftCalendar())
    const long = u.find((x) => x.session.type === 'long_run')!
    expect(long.date).toBe('2026-12-14')
    expect(long.daysAhead).toBe(2)
    expect(long.nightShiftBetween).toBe(true)
  })
})

describe('Mikrozyklus-Reduktion (SPEC 6.3, 11)', () => {
  it('mehrere rote Tage in Folge senken den nächsten Mikrozyklus', () => {
    const r = microcycleReduction([
      { date: '2026-10-03', traffic: 'red' },
      { date: '2026-10-04', traffic: 'red' },
      { date: '2026-10-05', traffic: 'green' },
    ])
    expect(r.factor).toBe(1 - CONFIG.recovery.microReduction.redStreakReduction)
    const micros = buildMicrocycles()
    const mods = microModifiersFromHistory(micros, [
      { date: '2026-10-03', traffic: 'red' },
      { date: '2026-10-04', traffic: 'red' },
    ])
    expect(mods).toEqual({ 2: 0.75 })
    const base = generatePlan()
    const reduced = generatePlan({ microModifiers: mods })
    expect(reduced.microcycles[1]!.plannedKm).toBeLessThan(base.microcycles[1]!.plannedKm)
  })

  it('gelb/rote Serie und Schlafdefizit', () => {
    expect(microcycleReduction(['yellow', 'red', 'yellow'].map((t, i) => ({ date: addDays(DATE, i), traffic: t as 'yellow' }))).factor).toBe(0.85)
    expect(microcycleReduction([{ date: DATE, traffic: 'green', debtMin: 300 }]).factor).toBe(0.85)
    expect(microcycleReduction([{ date: DATE, traffic: 'green' }, { date: addDays(DATE, 1), traffic: 'yellow' }]).factor).toBe(1)
  })
})

describe('Nachhol-Vorschlag (SPEC 6.3)', () => {
  it('nur bei sehr guter Recovery und nur als Vorschlag, wenn die Regeln erfüllt sind', () => {
    const plan = generatePlan()
    // Künstlich: Schwellenlauf an Tag 2 (16.12.) ist ausgefallen und wurde nicht verschoben.
    const d2 = plan.days.find((d) => d.date === '2026-12-17')!
    const thr = d2.sessions.find((s) => s.type === 'threshold')!
    d2.sessions = d2.sessions.filter((s) => s !== thr)
    d2.removed.push({ session: thr, reason: 'no_window', note: 'Krank.' })
    const date = '2026-12-20' // Tag 5 mit Höhenmeter-Einheit
    const great = assessReadiness({ date, today: whoopDay(date, 90) })
    const s = suggestCatchUp(plan, date, great)
    expect(s?.session.type).toBe('threshold')
    expect(s?.replaces.map((x) => x.type)).toEqual(['treadmill_hills'])
    expect(s?.text).toContain('Freiwillig')
    expect(suggestCatchUp(plan, date, assessReadiness({ date, today: whoopDay(date, 70) }))).toBeNull()
    expect(suggestCatchUp(plan, '2026-12-19', great)).toBeNull() // Tag 4: langer Lauf ist wichtiger
  })
})
