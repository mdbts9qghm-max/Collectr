import { describe, expect, it } from 'vitest'
import { CONFIG } from '../config'
import { createShiftCalendar, trainingWindow, withOverride } from '../shift'
import { applyStrengthTest, initialStrengthState } from '../strength'
import { addDays } from '../time'
import type { Plan, PlanDay, SessionType, ShiftOverride } from '../types'
import {
  buildMesocycles,
  buildMicrocycles,
  calendarWeeks,
  checkPlanRules,
  easyRun,
  generatePlan,
  intervalsUphill,
  longRun,
  microIndexOf,
  mobility,
  placeDay,
  recoveryRun,
  strengthSession,
  threshold,
  treadmillHills,
  weeklyEquivalentKm,
} from './index'

const plan = generatePlan()
const day = (p: Plan, date: string): PlanDay => p.days.find((d) => d.date === date)!
const types = (d: PlanDay) => d.sessions.map((s) => s.type)
const microKm = (p: Plan, i: number) => p.microcycles.find((m) => m.index === i)!.plannedKm

describe('Periodisierung (SPEC 5.1, 5.2, Zielwechsel Soul Trail)', () => {
  it('33 Mikrozyklen vom Neustart 09.11.2026 bis zum Rennen am 17.04.2027', () => {
    const micros = buildMicrocycles()
    expect(micros).toHaveLength(33)
    expect(micros[0]!.start).toBe('2026-11-09')
    expect(micros[0]!.end).toBe('2026-11-10')
    expect(micros[1]!.start).toBe('2026-11-11')
    expect(micros.at(-1)!.start).toBe('2027-04-15')
    expect(micros.at(-1)!.end).toBe('2027-04-17')
  })

  it('Neustart Mo 09.11.2026 an Zyklustag 4: Höhenmeter + Calisthenics, Di langer Lauf, ab 11.11. Rhythmus', () => {
    expect(plan.days[0]!.date).toBe('2026-11-09')
    const d4 = day(plan, '2026-11-09')
    expect(d4.shift.cycleDay).toBe(4)
    expect(d4.microIndex).toBe(1)
    expect(types(d4)).toEqual(['treadmill_hills', 'calisthenics_main'])
    const d5 = day(plan, '2026-11-10')
    expect(types(d5)).toEqual(['long_run'])
    expect(d5.sessions[0]!.distanceKm).toBe(10.5)
    const first = day(plan, '2026-11-11')
    expect(first.shift.cycleDay).toBe(1)
    expect(first.microIndex).toBe(2)
    expect(plan.days.some((d) => d.date < '2026-11-09')).toBe(false)
  })

  it('Phasen anteilig: Grundlage 2, Aufbau 2, Rennspezifisch 2 Mesozyklen + Taper', () => {
    const mesos = buildMesocycles()
    expect(mesos.map((m) => [m.start, m.phase])).toEqual([
      ['2026-11-09', 'base'],
      ['2026-11-26', 'base'],
      ['2026-12-16', 'build'],
      ['2027-01-15', 'build'],
      ['2027-02-14', 'specific'],
      ['2027-03-11', 'specific'],
      ['2027-03-31', 'taper'],
    ])
    expect(mesos.at(-1)!.end).toBe('2027-04-17')
  })

  it('Entlastung = letzter Mikrozyklus jedes Mesozyklus, nicht im letzten vor dem Taper', () => {
    const deloads = buildMicrocycles()
      .filter((m) => m.kind === 'deload')
      .map((m) => [m.index, m.start])
    expect(deloads).toEqual([
      [4, '2026-11-21'],
      [8, '2026-12-11'],
      [14, '2027-01-10'],
      [20, '2027-02-09'],
      [25, '2027-03-06'],
    ])
    expect(buildMicrocycles().find((m) => m.index === 29)!.kind).toBe('normal')
  })

  it('Taper ab 31.03.2027: zwei Taper-Mikrozyklen, Rennwoche, Renntag', () => {
    const taper = buildMicrocycles().filter((m) => m.phase === 'taper')
    expect(taper.map((m) => [m.start, m.kind])).toEqual([
      ['2027-03-31', 'taper1'],
      ['2027-04-05', 'taper2'],
      ['2027-04-10', 'race_week'],
      ['2027-04-15', 'race_day'],
    ])
  })

  it('findet den Mikrozyklus zu einem Datum', () => {
    expect(microIndexOf('2026-11-09')).toBe(1)
    expect(microIndexOf('2026-11-10')).toBe(1)
    expect(microIndexOf('2026-11-11')).toBe(2)
    expect(microIndexOf('2027-04-17')).toBe(33)
    expect(microIndexOf('2026-11-08')).toBeUndefined()
    expect(microIndexOf('2027-04-18')).toBeUndefined()
  })
})

describe('Umfang (SPEC 5.3, Trend-Regel mit Schlüsselspitzen)', () => {
  it('Grundniveau steigt höchstens 7 % pro Mikrozyklus', () => {
    const ms = plan.microcycles
    for (let i = 1; i < ms.length; i++) {
      expect(ms[i]!.levelKm).toBeLessThanOrEqual(ms[i - 1]!.levelKm * 1.07 + 1e-9)
    }
  })

  it('startet beim eingestellten Wochenumfang (erster voller Rhythmus)', () => {
    expect(weeklyEquivalentKm(plan.microcycles[1]!)).toBeGreaterThan(28)
    expect(weeklyEquivalentKm(plan.microcycles[1]!)).toBeLessThan(33)
    const p20 = generatePlan({ profile: { weeklyKmStart: 20 } })
    expect(weeklyEquivalentKm(p20.microcycles[1]!)).toBeLessThan(23)
  })

  it('normale Mikrozyklen liegen nicht über dem Soll, Schlüsselspitzen höchstens 12 % über dem Grundniveau', () => {
    for (const m of plan.microcycles) {
      if (m.phase === 'taper') continue
      const limit = m.isKeyPeak ? m.levelKm * 1.12 : m.targetKm
      expect(m.plannedKm, `Mikrozyklus ${m.index}`).toBeLessThanOrEqual(limit + 1.0) // Rundung auf 0,5 km je Einheit
    }
  })

  it('Entlastung: 30–40 % weniger als das Grundniveau', () => {
    for (const m of plan.microcycles.filter((x) => x.kind === 'deload')) {
      const ratio = m.plannedKm / m.levelKm
      expect(ratio, `Mikrozyklus ${m.index}`).toBeGreaterThanOrEqual(0.58)
      expect(ratio, `Mikrozyklus ${m.index}`).toBeLessThanOrEqual(0.72)
    }
  })

  it('Spitzenwerte ans Rennen angepasst: ca. 50–58 km/Woche, längster Lauf 32 km, B2B 22 + 14 km', () => {
    // Mikrozyklus 1 (2 Tage) verzerrt das Wochen-Äquivalent und zählt nicht
    const peak = Math.max(...plan.microcycles.slice(1).map(weeklyEquivalentKm))
    expect(peak).toBeGreaterThanOrEqual(50)
    expect(peak).toBeLessThanOrEqual(58)
    const all = plan.days.flatMap((d) => d.sessions)
    const longest = all.filter((s) => s.type === 'long_run').sort((a, b) => b.distanceKm! - a.distanceKm!)[0]!
    expect(longest.distanceKm).toBe(32)
    expect(longest.date).toBe('2027-03-14') // 5 Wochen vor dem Rennen
    expect(all.find((s) => s.type === 'b2b_1' && s.distanceKm === 22)).toBeDefined()
    expect(all.find((s) => s.type === 'b2b_2' && s.distanceKm === 14)).toBeDefined()
  })

  it('lange Läufe über 30 km erst in der rennspezifischen Phase, im Aufbau bis ca. 20 km', () => {
    const long = plan.days.flatMap((d) => d.sessions).filter((s) => s.type === 'long_run' && s.distanceKm! > 30)
    expect(long.map((s) => s.microIndex)).toEqual([26])
    const buildMax = Math.max(
      ...plan.days
        .filter((d) => plan.microcycles[d.microIndex - 1]!.phase === 'build')
        .flatMap((d) => d.sessions)
        .filter((s) => s.type === 'long_run')
        .map((s) => s.distanceKm!),
    )
    expect(buildMax).toBeGreaterThanOrEqual(18)
    expect(buildMax).toBeLessThanOrEqual(22)
  })

  it('Höhenmeter steigen von ca. 280 auf über 1.700 hm/Woche (Rennen: 2.000 hm)', () => {
    const first = plan.microcycles[0]!
    expect(Math.round((first.plannedElevationM * 7) / 5)).toBeLessThan(300)
    for (const i of [27, 28, 29]) {
      const m = plan.microcycles.find((x) => x.index === i)!
      expect((m.plannedElevationM * 7) / 5, `Mikrozyklus ${i}`).toBeGreaterThan(1700)
    }
  })

  it('Laufband-Höhenmeter = Distanz × Steigung', () => {
    const s = treadmillHills({ date: '2026-10-06', microIndex: 1, phase: 'build', slot: 'lauf' }, { km: 8, targetElevationM: 600 })
    expect(s.treadmill!.inclinePct).toBe(12)
    expect(s.elevationM).toBe(Math.round(s.treadmill!.inclineKm * 12 * 10))
    expect(s.elevationM).toBe(600)
  })

  it('Reduktionsfaktor aus der Erholung senkt den Mikrozyklus', () => {
    const reduced = generatePlan({ microModifiers: { 10: 0.8 } })
    expect(microKm(reduced, 10)).toBeLessThan(microKm(plan, 10) * 0.85)
    expect(microKm(reduced, 11)).toBe(microKm(plan, 11))
  })

  it('Kalenderwochen summieren denselben Umfang', () => {
    const weeks = calendarWeeks(plan)
    const sumWeeks = weeks.reduce((a, w) => a + w.plannedKm, 0)
    const sumMicros = plan.microcycles.reduce((a, m) => a + m.plannedKm, 0)
    expect(Math.abs(sumWeeks - sumMicros)).toBeLessThan(1)
    expect(weeks[0]!.start).toBe('2026-11-09')
  })
})

describe('Bergwochenenden und lange Läufe im Rennzeitplan', () => {
  it('ein Bergwochenende = Streckenbesichtigung 4 Wochen vor dem Rennen, Erinnerung 4 Wochen vorher', () => {
    expect(plan.mountainWeekends.map((w) => [w.days, w.courseRecce])).toEqual([[['2027-03-19', '2027-03-20'], true]])
    expect(plan.mountainWeekends[0]!.reminderDate).toBe('2027-02-19')
    expect(plan.mountainWeekends[0]!.feasible).toBe(true)
    const recce = day(plan, '2027-03-19').sessions.find((s) => s.type === 'mountain_day')!
    expect(recce.title).toContain('Streckenbesichtigung')
    expect(recce.elevationM).toBe(1300)
    expect(recce.structure.main).toContain(CONFIG.race.name)
    expect(types(day(plan, '2027-03-20'))).toContain('mountain_day')
  })

  it('keine Nachtläufe, lange Läufe im Rennzeitplan an Tag 4 mit festem Start 08:30', () => {
    const all = plan.days.flatMap((d) => d.sessions)
    expect(all.some((s) => s.type === 'night_run')).toBe(false)
    const early = plan.days.filter((d) => d.sessions.some((s) => s.fixedStart && s.type === 'long_run'))
    expect(early.map((d) => d.date)).toEqual(['2027-02-22', '2027-03-04'])
    for (const d of early) {
      expect(d.shift.cycleDay).toBe(4)
      const run = d.sessions[0]!
      expect(run.startMin).toBe(CONFIG.race.startMin)
      expect(run.title).toContain('Rennzeitplan')
      expect(run.structure.main).toContain('06:00')
      // weitere Einheiten des Tages folgen danach
      for (const s of d.sessions.slice(1)) expect(s.startMin!).toBeGreaterThanOrEqual(run.startMin! + run.durationMin)
    }
  })

  it('Nachtlauf (nur noch als Typ vorhanden): bei Dienst am Folgetag wird er tagsüber gelaufen', () => {
    const cal = withOverride(createShiftCalendar(), { date: '2026-10-31', kind: 'V' })
    const ctx = { date: '2026-10-30', microIndex: 1, phase: 'specific' as const, slot: 'lauf' }
    const d = placeDay(cal, '2026-10-30', 1, 'specific', [longRun('night_run', ctx, { km: 20 })])
    const run = d.sessions.find((s) => s.category === 'run')!
    expect(run.type).toBe('long_run')
    expect(run.origin?.convertedFrom).toBe('night_run')
    const free = placeDay(createShiftCalendar(), '2026-10-30', 1, 'specific', [longRun('night_run', ctx, { km: 20 })])
    expect(free.sessions[0]!.type).toBe('night_run')
  })
})

describe('Harte Regeln (SPEC 4.3, 5.3, 5.5, 11)', () => {
  it('der Standardplan verletzt keine Regel', () => {
    expect(checkPlanRules(plan.days)).toEqual([])
  })

  it('keine Einheit auf Tag 1 (Tagschicht)', () => {
    for (const d of plan.days.filter((x) => x.shift.cycleDay === 1 && !x.isRaceDay)) {
      expect(d.sessions, d.date).toEqual([])
      expect(d.optionalNote).toContain('10 min Mobility')
    }
  })

  it('lange Läufe und Back-to-backs nur auf Tag 4/5', () => {
    for (const d of plan.days) {
      for (const s of d.sessions) {
        if (['long_run', 'b2b_1', 'b2b_2', 'mountain_day', 'night_run'].includes(s.type)) expect([4, 5]).toContain(d.shift.cycleDay)
      }
    }
  })

  it('Tag 3 (Schlaftag) hat nur lockere Einheiten: ein regulärer lockerer Lauf, Rest optional', () => {
    // Der Renntag fällt auf einen Schlaftag (Tag 3) und ist ausgenommen (Konflikt meldet das Rennmodul)
    for (const d of plan.days.filter((x) => x.shift.dayKind === 'sleep_day' && !x.isRaceDay)) {
      for (const s of d.sessions) {
        expect(['recovery_run', 'easy_run', 'skill_light', 'mobility']).toContain(s.type)
        if (!s.optional) expect(s.type).toBe('easy_run')
        expect(s.startMin!).toBeGreaterThanOrEqual(15 * 60)
      }
      expect(d.sessions.filter((s) => !s.optional).length).toBeLessThanOrEqual(1)
    }
    // Grundlage und Aufbau: der Lauf von Tag 2 liegt jetzt an Tag 3
    for (const m of plan.microcycles.filter((x) => x.phase === 'base' || x.phase === 'build')) {
      const d3 = plan.days.find((d) => d.microIndex === m.index && d.shift.cycleDay === 3 && d.shift.dayKind === 'sleep_day')
      if (d3) expect(d3.sessions.some((s) => s.type === 'easy_run' && !s.optional)).toBe(true)
    }
  })

  it('Tag vor der Nachtschicht (Tag 2): höchstens eine Einheit (Entscheidung nach Phase 7)', () => {
    for (const d of plan.days.filter((x) => x.shift.dayKind === 'pre_night')) {
      expect(d.sessions.filter((s) => !s.optional).length).toBeLessThanOrEqual(CONFIG.plan.maxSessionsPreNight)
    }
    // In Grundlage und Aufbau ist das die Krafteinheit, Qualitätseinheiten liegen im Aufbau an Tag 4, danach an Tag 5
    const build = plan.days.filter((d) => d.shift.dayKind === 'pre_night' && plan.microcycles[d.microIndex - 1]?.phase === 'build')
    expect(build.length).toBeGreaterThan(0)
    for (const d of build) expect(d.sessions.every((s) => s.category === 'strength')).toBe(true)
    const quality = (phases: string[]) =>
      new Set(
        plan.days
          .filter((d) => phases.includes(plan.microcycles[d.microIndex - 1]!.phase))
          .flatMap((d) => d.sessions.filter((s) => s.type === 'threshold' || s.type === 'intervals_uphill').map(() => d.shift.cycleDay)),
      )
    expect(quality(['build'])).toEqual(new Set([4]))
    expect(quality(['specific', 'taper'])).toEqual(new Set([5]))
  })

  it('Grundlage und Aufbau: Tag 4 Höhenmeter/Qualität + Calisthenics, Tag 5 langer Lauf (Nutzerwunsch)', () => {
    for (const m of plan.microcycles.filter((x) => x.phase === 'base' || x.phase === 'build')) {
      const d4 = plan.days.find((d) => d.microIndex === m.index && d.shift.cycleDay === 4)!
      const d5 = plan.days.find((d) => d.microIndex === m.index && d.shift.cycleDay === 5)!
      expect(types(d5), `Mikrozyklus ${m.index}`).toEqual(['long_run'])
      if (m.kind === 'deload') expect(types(d4)).toEqual(['mobility'])
      else {
        expect(types(d4), `Mikrozyklus ${m.index}`).toContain('calisthenics_main')
        expect(types(d4).some((t) => ['treadmill_hills', 'intervals_uphill', 'threshold'].includes(t))).toBe(true)
        // Lauf zuerst, danach Calisthenics
        const run = d4.sessions.find((s) => s.category === 'run')!
        const cali = d4.sessions.find((s) => s.type === 'calisthenics_main')!
        expect(cali.startMin!).toBeGreaterThan(run.startMin!)
      }
    }
    // rennspezifisch wie bisher: langer Lauf an Tag 4
    expect(types(day(plan, '2027-02-27'))).toEqual(['long_run'])
  })

  it('V-Schicht an Tag 5 (vorher bekannt): langer Lauf an Tag 4, ist Tag 4 schon eingetragen, fällt er aus', () => {
    const cal = withOverride(createShiftCalendar(), { date: '2026-11-15', kind: 'V' })
    const p = generatePlan({ calendar: cal })
    expect(types(day(p, '2026-11-14'))).toEqual(['long_run'])
    expect(day(p, '2026-11-15').sessions).toEqual([])
    const hillsId = day(plan, '2026-11-14').sessions[0]!.id
    const logged = generatePlan({ calendar: cal, logs: [{ sessionId: hillsId, date: '2026-11-14', status: 'done' }] })
    expect(types(day(logged, '2026-11-14'))).toEqual(['treadmill_hills', 'calisthenics_main'])
    expect(day(logged, '2026-11-15').removed.find((r) => r.session.type === 'long_run')!.note).toContain('gestrichen')
    expect(microKm(logged, 3)).toBe(microKm(plan, 3)) // kein Nachholen
  })

  it('Tag 2: jeder Einheitentyp ist erlaubt, der ins Fenster passt (lange Läufe laut 5.3 nur Tag 4/5)', () => {
    const cal = createShiftCalendar()
    const date = '2026-10-03'
    const ctx = { date, microIndex: 1, phase: 'build' as const, slot: 'x' }
    const candidates = [
      easyRun(ctx, { km: 12 }),
      recoveryRun(ctx, 30, false),
      threshold(ctx),
      intervalsUphill(ctx),
      treadmillHills(ctx, { km: 10, targetElevationM: 900 }),
      ...(['calisthenics_main', 'calisthenics_maintenance', 'skill_light', 'legs_heavy', 'strength_short', 'strength_test'] as SessionType[]).map((t) =>
        strengthSession(t, ctx),
      ),
      mobility(ctx, 20, false),
    ]
    for (const s of candidates) {
      const d = placeDay(cal, date, 1, 'build', [s])
      expect(d.sessions.map((x) => x.type), s.type).toEqual([s.type])
    }
    // zu lang für das Fenster 08:00–13:30
    const tooLong = easyRun(ctx, { km: 60 })
    expect(placeDay(cal, date, 1, 'build', [tooLong]).sessions).toEqual([])
    // lange Lauftypen gehören auf Tag 4/5 (SPEC 5.3)
    expect(placeDay(cal, date, 1, 'build', [longRun('long_run', ctx, { km: 18 })]).sessions).toEqual([])
    expect(trainingWindow(cal, date)!.end).toBe(13 * 60 + 30)
  })

  it('Einheiten an Tag 2 enden vor dem Nap (13:30)', () => {
    for (const d of plan.days.filter((x) => x.shift.dayKind === 'pre_night' && !x.isRaceDay)) {
      for (const s of d.sessions) expect(s.startMin! + s.durationMin, d.date).toBeLessThanOrEqual(13 * 60 + 30)
    }
  })

  it('kein schweres Beintraining am Vortag eines langen Laufs, einer Qualitätseinheit oder des Rennens', () => {
    for (const d of plan.days) {
      if (!d.sessions.some((s) => s.type === 'legs_heavy')) continue
      const next = day(plan, addDays(d.date, 1))
      expect(next.sessions.some((s) => ['long_run', 'b2b_1', 'b2b_2', 'night_run', 'mountain_day', 'threshold', 'intervals_uphill', 'race'].includes(s.type))).toBe(false)
    }
    const lastLegs = plan.days.filter((d) => d.sessions.some((s) => s.type === 'legs_heavy')).at(-1)!
    expect(lastLegs.date < addDays(CONFIG.race.date, -CONFIG.strength.noHeavyLegsDaysBeforeRace)).toBe(true)
  })

  it('bleibt auch mit zufälligen V-Schichten, Urlaub und Krankheit regelkonform', () => {
    let seed = 42
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
    for (let run = 0; run < 5; run++) {
      const overrides: ShiftOverride[] = []
      for (let i = 0; i < 40; i++) {
        const micro = 1 + Math.floor(rnd() * 32)
        const start = addDays(CONFIG.plan.microStartDate, (micro - 1) * 5)
        const r = rnd()
        if (r < 0.5) overrides.push({ date: addDays(start, 4), kind: 'V' })
        else if (r < 0.7) overrides.push({ date: addDays(start, Math.floor(rnd() * 5)), kind: 'KRANK' })
        else if (r < 0.85) overrides.push({ date: addDays(start, Math.floor(rnd() * 5)), kind: 'URLAUB' })
        else overrides.push({ date: addDays(start, 3), kind: 'TAUSCH', swapTo: 'N' })
      }
      const p = generatePlan({ calendar: createShiftCalendar(overrides) })
      expect(checkPlanRules(p.days)).toEqual([])
      // nie mehr als ohne Ausfälle (kein Nachholen); Mikrozyklus 1 mit Einstiegstag
      for (const m of p.microcycles) {
        const limit = (m.isKeyPeak ? m.levelKm * 1.12 : m.targetKm) + (m.index === 1 ? 6 : 0)
        if (m.phase !== 'taper') expect(m.plannedKm).toBeLessThanOrEqual(limit + 1.0)
      }
    }
  })
})

describe('V-Schicht, Ausfälle und Verschieben (SPEC 4.1, 6.3, 11)', () => {
  it('kurzfristige V-Schicht: keine Einheit am V-Tag, Schlüsseleinheit einmal verschoben oder gestrichen', () => {
    const cal = withOverride(createShiftCalendar(), { date: '2026-11-15', kind: 'V' })
    const p = generatePlan({ calendar: cal })
    const v = day(p, '2026-11-15')
    expect(v.sessions).toEqual([])
    const hills = v.removed.find((r) => r.session.type === 'treadmill_hills')!
    expect(hills.note).toContain('gestrichen')
    const cali = v.removed.find((r) => r.session.type === 'calisthenics_main')!
    expect(cali.reason).toBe('moved')
    const target = day(p, '2026-11-20')
    const moved = target.sessions.find((s) => s.type === 'calisthenics_main')!
    expect(moved.origin?.movedFrom).toBe('2026-11-15')
    expect(target.shift.cycleDay).toBe(5)
  })

  it('nie auf Tag 1 verschoben', () => {
    const cal = withOverride(createShiftCalendar(), { date: '2026-11-15', kind: 'V' })
    const p = generatePlan({ calendar: cal })
    for (const d of p.days.filter((x) => x.shift.cycleDay === 1)) expect(d.sessions).toEqual([])
  })

  it('Krankheit an Tag 4: Calisthenics rückt auf Tag 5 zum langen Lauf, Höhenmeter entfallen, kein Nachholen', () => {
    const cal = withOverride(createShiftCalendar(), { date: '2026-11-14', kind: 'KRANK' })
    const p = generatePlan({ calendar: cal })
    const d5 = day(p, '2026-11-15')
    expect(types(d5)).toEqual(['long_run', 'calisthenics_main'])
    expect(types(d5)).not.toContain('treadmill_hills')
    expect(microKm(p, 2)).toBeLessThanOrEqual(microKm(plan, 2))
    expect(microKm(p, 3)).toBe(microKm(plan, 3))
  })

  it('V-Schicht im B2B-Mikrozyklus: Tag 4 wird zum einzelnen langen Lauf', () => {
    const cal = withOverride(createShiftCalendar(), { date: '2027-03-25', kind: 'V' })
    const p = generatePlan({ calendar: cal })
    const d4 = day(p, '2027-03-24')
    const run = d4.sessions.find((s) => s.category === 'run')!
    expect(run.type).toBe('long_run')
    expect(run.distanceKm).toBe(22)
    expect(microKm(p, 28)).toBeLessThan(microKm(plan, 28))
    // der verlorene Tag 2 wird nicht in den nächsten Mikrozyklus gequetscht
    expect(microKm(p, 29)).toBe(microKm(plan, 29))
  })

  it('ausgelassene Schlüsseleinheit wird höchstens einmal verschoben', () => {
    const caliId = day(plan, '2026-11-14').sessions.find((s) => s.type === 'calisthenics_main')!.id
    const p1 = generatePlan({ logs: [{ sessionId: caliId, date: '2026-11-14', status: 'skipped' }] })
    const moved = day(p1, '2026-11-15').sessions.find((s) => s.type === 'calisthenics_main')!
    expect(moved.origin?.movedFrom).toBe('2026-11-14')
    // die verschobene Einheit wird ebenfalls ausgelassen → kein zweites Verschieben
    const p2 = generatePlan({
      logs: [
        { sessionId: caliId, date: '2026-11-14', status: 'skipped' },
        { sessionId: moved.id, date: '2026-11-15', status: 'skipped' },
      ],
    })
    const later = p2.days.filter((d) => d.date > '2026-11-15').flatMap((d) => d.sessions)
    expect(later.filter((s) => s.origin?.movedFrom === '2026-11-15')).toEqual([])
  })

  it('Urlaub macht Tag 1 frei, ohne zusätzlichen Umfang', () => {
    const cal = withOverride(createShiftCalendar(), { date: '2026-11-16', kind: 'URLAUB' })
    const p = generatePlan({ calendar: cal })
    expect(day(p, '2026-11-16').sessions).toEqual([])
    expect(microKm(p, 3)).toBe(microKm(plan, 3))
  })
})

describe('Taper und Rennen', () => {
  it('Renntag Sa 17.04.2027 (Zyklustag 3) mit Start 08:30 in Deggendorf', () => {
    const d = day(plan, '2027-04-17')
    expect(d.isRaceDay).toBe(true)
    expect(d.shift.cycleDay).toBe(3)
    const race = d.sessions[0]!
    expect(race.type).toBe('race')
    expect(race.startMin).toBe(8 * 60 + 30)
    expect(race.distanceKm).toBe(55)
    expect(race.elevationM).toBe(2000)
    expect(race.structure.main).toContain('Deggendorf')
    expect(race.structure.main).toContain('Zielschluss 19:30')
    expect(race.structure.warmup).toContain('06:00')
  })

  it('Rennen bleibt auch bei V-Schicht im Plan (Konflikt meldet das Rennmodul)', () => {
    const p = generatePlan({ calendar: withOverride(createShiftCalendar(), { date: '2027-04-17', kind: 'V' }) })
    expect(types(day(p, '2027-04-17'))).toEqual(['race'])
  })

  it('mit Urlaub am Vortag: optionales kurzes Auflockern am 16.04., der Renntag ist dann frei', () => {
    const p = generatePlan({ calendar: withOverride(createShiftCalendar(), { date: '2027-04-16', kind: 'URLAUB' }) })
    const eve = day(p, '2027-04-16').sessions
    expect(eve.map((s) => [s.type, s.optional])).toEqual([['recovery_run', true]])
    expect(eve[0]!.durationMin).toBe(CONFIG.volume.taperShares.raceDayEveMin)
    expect(day(p, '2027-04-17').shift.dayKind).toBe('free')
  })

  it('Taper: Umfang deutlich runter, keine Schlaftag-Einheiten, kein schweres Bein', () => {
    const t = plan.microcycles.filter((m) => m.phase === 'taper')
    const peak = Math.max(...plan.microcycles.map((m) => m.plannedKm))
    expect(t[0]!.plannedKm).toBeLessThan(peak * 0.65)
    expect(t[1]!.plannedKm).toBeLessThan(t[0]!.plannedKm)
    const taperDays = plan.days.filter((d) => d.date >= '2027-03-31')
    expect(taperDays.filter((d) => d.shift.dayKind === 'sleep_day' && !d.isRaceDay).flatMap((d) => d.sessions)).toEqual([])
    expect(taperDays.flatMap((d) => d.sessions).some((s) => s.type === 'legs_heavy')).toBe(false)
    expect(taperDays.flatMap((d) => d.sessions).some((s) => s.type === 'threshold')).toBe(true) // Intensität in kleiner Dosis
  })
})

describe('Einheiten-Inhalt (SPEC 9)', () => {
  it('jede Einheit hat Typ, Ziel, Dauer, Intensität und Ablauf', () => {
    for (const s of plan.days.flatMap((d) => d.sessions)) {
      expect(s.goal.length).toBeGreaterThan(10)
      expect(s.durationMin).toBeGreaterThan(0)
      expect(s.intensity.label.length).toBeGreaterThan(0)
      expect(s.structure.warmup && s.structure.main && s.structure.cooldown).toBeTruthy()
      if (s.category === 'run') expect(s.elevationM).toBeDefined()
    }
  })

  it('ab dem Aufbau: Verpflegung und Ausrüstung bei langen Läufen', () => {
    const longs = plan.days.flatMap((d) => d.sessions).filter((s) => s.type === 'long_run')
    expect(longs.filter((s) => s.date < '2026-12-16').every((s) => !s.fueling)).toBe(true)
    expect(longs.filter((s) => s.date >= '2026-12-16' && s.date < '2027-03-31').every((s) => s.fueling && s.gearTest)).toBe(true)
  })

  it('mit Kraftstand werden Übungen mit Sätzen, Wiederholungen/Haltezeiten und Pausen eingesetzt', () => {
    const state = applyStrengthTest(
      initialStrengthState(),
      { date: '2026-10-01', maxPullups: 3, maxDips: 2, hollowHoldSec: 30, frontLever: { stage: 0, holdSec: 0 }, backLever: { stage: 0, holdSec: 10 } },
      { onboarding: true },
    )
    const p = generatePlan({ strengthState: state })
    const cali = day(p, '2026-11-14').sessions.find((s) => s.type === 'calisthenics_main')!
    expect(cali.exercises!.length).toBeGreaterThan(3)
    expect(cali.exercises!.every((e) => e.sets > 0 && e.restSec > 0 && (e.reps !== undefined || e.holdSec !== undefined))).toBe(true)
  })

  it('ist deterministisch', () => {
    expect(JSON.stringify(generatePlan())).toBe(JSON.stringify(plan))
  })
})
