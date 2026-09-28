import { describe, expect, it } from 'vitest'
import type { StrengthState, StrengthTest } from '../types'
import {
  applyStrengthTest,
  buildStrengthSession,
  canEnterLevel,
  evaluateSession,
  initialStrengthState,
  isNewLevel,
  LADDER_IDS,
  LADDERS,
  testLevels,
} from './index'

const beginnerTest: StrengthTest = {
  date: '2026-10-02',
  maxPullups: 3,
  maxDips: 4,
  hollowHoldSec: 35,
  frontLever: { stage: 0, holdSec: 0 },
  backLever: { stage: 0, holdSec: 20 },
}

describe('Leitern (SPEC 5.5)', () => {
  it('jede Leiter hat Stufen mit Übungen und Kriterium', () => {
    for (const id of LADDER_IDS) {
      const l = LADDERS[id]
      expect(l.levels.length).toBeGreaterThan(2)
      for (const lvl of l.levels) {
        expect(lvl.exercises.length).toBeGreaterThan(0)
        for (const ex of lvl.exercises) {
          expect(ex.restSec).toBeGreaterThan(0)
          expect(ex.reps !== undefined || ex.holdSec !== undefined).toBe(true)
        }
      }
      expect(l.levels.at(-1)!.final).toBe(true)
    }
  })

  it('Zug-Leiter führt zum Muscle-Up', () => {
    expect(LADDERS.pull.levels.at(-1)!.name).toBe('Muscle-Up')
    expect(LADDERS.front_lever.levels.map((l) => l.name)).toContain('Straddle Front Lever')
    expect(LADDERS.back_lever.levels[0]!.name).toBe('German Hang')
  })
})

describe('Einstufung per Krafttest', () => {
  it('Anfänger mit 3 Klimmzügen und 4 Dips', () => {
    expect(testLevels(beginnerTest)).toEqual({ pull: 4, push: 3, front_lever: 1, back_lever: 0, core: 1 })
  })

  it('0 Klimmzüge: Einstufung über Hängen und Rows', () => {
    expect(testLevels({ ...beginnerTest, maxPullups: 0, deadHangSec: 40, maxAustralianRows: 12 }).pull).toBe(2)
    expect(testLevels({ ...beginnerTest, maxPullups: 0 }).pull).toBe(0)
  })

  it('Muscle-Up-Training erst ab 10 Klimmzügen UND 10 Dips', () => {
    expect(testLevels({ ...beginnerTest, maxPullups: 12, maxDips: 8 }).pull).toBe(5)
    expect(testLevels({ ...beginnerTest, maxPullups: 12, maxDips: 10 }).pull).toBe(6)
  })

  it('Lever-Stufe steigt, wenn die Haltezeit das Kriterium erfüllt', () => {
    expect(testLevels({ ...beginnerTest, frontLever: { stage: 1, holdSec: 12 } }).front_lever).toBe(2)
    expect(testLevels({ ...beginnerTest, frontLever: { stage: 1, holdSec: 6 } }).front_lever).toBe(1)
  })

  it('Onboarding-Test: Stufen gelten nicht als „neu“', () => {
    const s = applyStrengthTest(initialStrengthState(), beginnerTest, { onboarding: true })
    expect(s.levels.pull).toBe(4)
    expect(isNewLevel(s, 'pull')).toBe(false)
  })

  it('Test kann eine Stufe absenken (Abstieg)', () => {
    const s: StrengthState = { ...initialStrengthState(), levels: { ...initialStrengthState().levels, pull: 5 } }
    const after = applyStrengthTest(s, { ...beginnerTest, maxPullups: 2 })
    expect(after.levels.pull).toBe(3)
  })

  it('per Session erreichte Stufen über der Test-Obergrenze bleiben erhalten', () => {
    const s: StrengthState = { ...initialStrengthState(), levels: { ...initialStrengthState().levels, pull: 7, push: 5 } }
    const after = applyStrengthTest(s, { ...beginnerTest, maxPullups: 12, maxDips: 12 })
    expect(after.levels.pull).toBe(7)
  })

  it('Voraussetzungen werden nach dem Test geprüft', () => {
    const after = applyStrengthTest(initialStrengthState(), { ...beginnerTest, maxPullups: 0, backLever: { stage: 2, holdSec: 15 } })
    expect(after.levels.back_lever).toBe(0) // Zug < 2
  })
})

describe('Aufstieg nur bei erfüllten Kriterien (SPEC 11)', () => {
  const base = applyStrengthTest(initialStrengthState(), beginnerTest, { onboarding: true })

  it('eine erfüllte Session reicht nicht, zwei in Folge schon', () => {
    const good = { ladder: 'pull' as const, level: 4, sets: [{ reps: 5 }, { reps: 5 }, { reps: 5 }] }
    const r1 = evaluateSession(base, [good])
    expect(r1.state.levels.pull).toBe(4)
    expect(r1.advanced).toEqual([])
    const r2 = evaluateSession(r1.state, [good])
    expect(r2.state.levels.pull).toBe(5)
    expect(r2.advanced).toEqual(['pull'])
    expect(isNewLevel(r2.state, 'pull')).toBe(true)
  })

  it('nicht erfülltes Kriterium setzt die Serie zurück', () => {
    const good = { ladder: 'pull' as const, level: 4, sets: [{ reps: 5 }, { reps: 5 }, { reps: 5 }] }
    const bad = { ladder: 'pull' as const, level: 4, sets: [{ reps: 5 }, { reps: 4 }, { reps: 3 }] }
    const r = evaluateSession(evaluateSession(evaluateSession(base, [good]).state, [bad]).state, [good])
    expect(r.state.levels.pull).toBe(4)
  })

  it('Ergebnisse einer anderen Stufe zählen nicht', () => {
    const r = evaluateSession(base, [{ ladder: 'pull', level: 3, sets: [{ reps: 10 }, { reps: 10 }, { reps: 10 }] }])
    expect(r.state.streak.pull).toBe(0)
  })

  it('Muscle-Up-Voraussetzung blockiert den Aufstieg ohne 10 Dips', () => {
    const s: StrengthState = { ...base, levels: { ...base.levels, pull: 5, push: 4 } }
    const ten = { ladder: 'pull' as const, level: 5, sets: [{ reps: 10 }] }
    const r = evaluateSession(evaluateSession(s, [ten]).state, [ten])
    expect(r.state.levels.pull).toBe(5)
    expect(r.blocked).toEqual(['pull'])
    expect(canEnterLevel('pull', 6, { ...s.levels, push: 5 })).toBe(true)
  })

  it('Beine: Aufstieg nur mit RPE ≤ 7', () => {
    const hard = { ladder: 'legs' as const, level: 0, sets: [{ reps: 10 }, { reps: 10 }, { reps: 10 }], rpe: 9 }
    const ok = { ...hard, rpe: 7 }
    expect(evaluateSession(evaluateSession(base, [hard]).state, [hard]).state.levels.legs).toBe(0)
    expect(evaluateSession(evaluateSession(base, [ok]).state, [ok]).state.levels.legs).toBe(1)
  })

  it('auf der letzten Stufe gibt es keinen Aufstieg', () => {
    const s: StrengthState = { ...base, levels: { ...base.levels, core: 4 } }
    const r = evaluateSession(evaluateSession(s, [{ ladder: 'core', level: 4, sets: [{ holdSec: 20 }, { holdSec: 20 }, { holdSec: 20 }] }]).state, [
      { ladder: 'core', level: 4, sets: [{ holdSec: 20 }, { holdSec: 20 }, { holdSec: 20 }] },
    ])
    expect(r.state.levels.core).toBe(4)
  })
})

describe('Kraft-Einheiten', () => {
  const s = applyStrengthTest(initialStrengthState(), beginnerTest, { onboarding: true })

  it('Calisthenics-Hauptsession enthält alle Oberkörper-Leitern mit Sätzen und Pausen', () => {
    const c = buildStrengthSession('calisthenics_main', s, 'build')
    const ladders = new Set(c.exercises.map((e) => e.ladder))
    expect(ladders).toEqual(new Set(['pull', 'push', 'front_lever', 'back_lever', 'core']))
    expect(c.exercises.every((e) => e.sets >= 1 && e.restSec > 0)).toBe(true)
    expect(c.strengthSets).toBeGreaterThan(10)
  })

  it('Erhaltung in der rennspezifischen Phase hat weniger Volumen', () => {
    const main = buildStrengthSession('calisthenics_main', s, 'build').strengthSets
    const maint = buildStrengthSession('calisthenics_maintenance', s, 'specific').strengthSets
    expect(maint).toBeLessThan(main)
  })

  it('neue Stufe wird markiert und kann vermieden werden', () => {
    const advanced: StrengthState = { ...s, sessionsAtLevel: { ...s.sessionsAtLevel, front_lever: 0 } }
    expect(buildStrengthSession('calisthenics_main', advanced, 'build').containsNewLevel).toBe(true)
    const avoided = buildStrengthSession('calisthenics_main', advanced, 'build', { avoidNewLevels: true })
    expect(avoided.containsNewLevel).toBe(false)
    expect(avoided.exercises.find((e) => e.ladder === 'front_lever')!.level).toBe(0)
  })

  it('Technik-Sätze sind leichter', () => {
    const heavy = buildStrengthSession('legs_heavy', s, 'base')
    const tech = buildStrengthSession('legs_heavy', s, 'base', { technique: true })
    expect(tech.strengthSets).toBeLessThan(heavy.strengthSets)
    expect(tech.exercises[0]!.note).toContain('Technik')
  })

  it('Krafttest-Protokoll enthält alle Testwerte aus SPEC 5.5', () => {
    const t = buildStrengthSession('strength_test', s, 'base')
    const names = t.exercises.map((e) => e.name).join(' ')
    expect(names).toContain('Klimmzüge')
    expect(names).toContain('Dips')
    expect(names).toContain('Hollow')
    expect(names).toContain('Front Lever')
    expect(names).toContain('Back Lever')
  })
})
