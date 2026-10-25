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

describe('Periodisierung (SPEC 5.1, 5.2, Zielwechsel Arberland)', () => {
  it('66 Mikrozyklen vom Einstiegstag 26.10.2026 bis zum Rennen am 18.09.2027', () => {
    const micros = buildMicrocycles()
    expect(micros).toHaveLength(66)
    expect(micros[0]!.start).toBe('2026-10-26')
    expect(micros[0]!.end).toBe('2026-10-31')
    expect(micros[1]!.start).toBe('2026-11-01')
    expect(micros.at(-1)!.start).toBe('2027-09-17')
    expect(micros.at(-1)!.end).toBe('2027-09-18')
  })

  it('Einstiegstag 26.10.2026 (Zyklustag 5) mit lockerem Lauf, Mikrozyklus 1 beginnt am 27.10. an Tag 1', () => {
    const intro = day(plan, '2026-10-26')
    expect(intro.shift.cycleDay).toBe(5)
    expect(intro.microIndex).toBe(1)
    expect(types(intro)).toEqual(['easy_run'])
    expect(intro.sessions[0]!.durationMin).toBeLessThanOrEqual(40)
    const first = day(plan, '2026-10-27')
    expect(first.shift.cycleDay).toBe(1)
    expect(first.microIndex).toBe(1)
    expect(day(plan, '2026-11-01').shift.cycleDay).toBe(1)
    expect(plan.days[0]!.date).toBe('2026-10-26')
  })

  it('Phasen anteilig verlängert: Grundlage 3, Aufbau 4, Rennspezifisch 3 Mesozyklen + Taper', () => {
    const mesos = buildMesocycles()
    expect(mesos.map((m) => [m.start, m.phase])).toEqual([
      ['2026-10-26', 'base'],
      ['2026-11-26', 'base'],
      ['2026-12-26', 'base'],
      ['2027-01-25', 'build'],
      ['2027-03-01', 'build'],
      ['2027-04-05', 'build'],
      ['2027-05-05', 'build'],
      ['2027-06-04', 'specific'],
      ['2027-07-04', 'specific'],
      ['2027-08-03', 'specific'],
      ['2027-09-02', 'taper'],
    ])
    expect(mesos.at(-1)!.end).toBe('2027-09-18')
  })

  it('Entlastung = letzter Mikrozyklus jedes Mesozyklus, nicht im letzten vor dem Taper', () => {
    const deloads = buildMicrocycles()
      .filter((m) => m.kind === 'deload')
      .map((m) => m.index)
    expect(deloads).toEqual([6, 12, 18, 25, 32, 38, 44, 50, 56])
    expect(buildMicrocycles().find((m) => m.index === 62)!.kind).toBe('normal')
  })

  it('Taper ab 02.09.2027: zwei Taper-Mikrozyklen, Rennwoche, Renntag', () => {
    const taper = buildMicrocycles().filter((m) => m.phase === 'taper')
    expect(taper.map((m) => [m.start, m.kind])).toEqual([
      ['2027-09-02', 'taper1'],
      ['2027-09-07', 'taper2'],
      ['2027-09-12', 'race_week'],
      ['2027-09-17', 'race_day'],
    ])
  })

  it('findet den Mikrozyklus zu einem Datum', () => {
    expect(microIndexOf('2026-10-26')).toBe(1)
    expect(microIndexOf('2026-10-31')).toBe(1)
    expect(microIndexOf('2026-11-01')).toBe(2)
    expect(microIndexOf('2027-09-18')).toBe(66)
    expect(microIndexOf('2026-10-25')).toBeUndefined()
    expect(microIndexOf('2027-09-19')).toBeUndefined()
  })
})

describe('Umfang (SPEC 5.3, Trend-Regel mit Schlüsselspitzen)', () => {
  it('Grundniveau steigt höchstens 7 % pro Mikrozyklus', () => {
    const ms = plan.microcycles
    for (let i = 1; i < ms.length; i++) {
      expect(ms[i]!.levelKm).toBeLessThanOrEqual(ms[i - 1]!.levelKm * 1.07 + 1e-9)
    }
  })

  it('startet beim eingestellten Wochenumfang', () => {
    expect(weeklyEquivalentKm(plan.microcycles[0]!)).toBeGreaterThan(28)
    expect(weeklyEquivalentKm(plan.microcycles[0]!)).toBeLessThan(32)
    const p20 = generatePlan({ profile: { weeklyKmStart: 20 } })
    expect(weeklyEquivalentKm(p20.microcycles[0]!)).toBeLessThan(24) // inkl. 35 min Einstiegslauf
  })

  it('normale Mikrozyklen liegen nicht über dem Soll, Schlüsselspitzen höchstens 12 % über dem Grundniveau', () => {
    const intro = day(plan, CONFIG.plan.startDate).sessions.reduce((a, s) => a + (s.distanceKm ?? 0), 0)
    for (const m of plan.microcycles) {
      if (m.phase === 'taper') continue
      const limit = (m.isKeyPeak ? m.levelKm * 1.12 : m.targetKm) + (m.index === 1 ? intro : 0) // Einstiegstag kommt dazu
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

  it('Spitzenwerte ans Rennen angepasst: ca. 60–66 km/Woche, längster Lauf 40 km, B2B 26 + 16 km', () => {
    const peak = Math.max(...plan.microcycles.map(weeklyEquivalentKm))
    expect(peak).toBeGreaterThanOrEqual(60)
    expect(peak).toBeLessThanOrEqual(67)
    const all = plan.days.flatMap((d) => d.sessions)
    const longest = all.filter((s) => s.type === 'long_run').sort((a, b) => b.distanceKm! - a.distanceKm!)[0]!
    expect(longest.distanceKm).toBe(40)
    expect(longest.date).toBe('2027-08-06') // 6 Wochen vor dem Rennen
    expect(all.find((s) => s.type === 'b2b_1' && s.distanceKm === 26)).toBeDefined()
    expect(all.find((s) => s.type === 'b2b_2' && s.distanceKm === 16)).toBeDefined()
  })

  it('lange Läufe über 30 km erst in der rennspezifischen Phase, im Aufbau bis ca. 25 km', () => {
    const long = plan.days.flatMap((d) => d.sessions).filter((s) => s.type === 'long_run' && s.distanceKm! > 30)
    expect(long.map((s) => s.microIndex)).toEqual([51, 57])
    const buildMax = Math.max(
      ...plan.days
        .filter((d) => plan.microcycles[d.microIndex - 1]!.phase === 'build')
        .flatMap((d) => d.sessions)
        .filter((s) => s.type === 'long_run')
        .map((s) => s.distanceKm!),
    )
    expect(buildMax).toBeGreaterThanOrEqual(24)
    expect(buildMax).toBeLessThanOrEqual(28)
  })

  it('Höhenmeter steigen von ca. 250 auf über 2.000 hm/Woche (Rennen: 2.514 hm)', () => {
    const first = plan.microcycles[0]!
    expect(Math.round((first.plannedElevationM * 7) / 5)).toBeLessThan(300)
    for (const i of [53, 59, 60]) {
      const m = plan.microcycles.find((x) => x.index === i)!
      expect((m.plannedElevationM * 7) / 5, `Mikrozyklus ${i}`).toBeGreaterThan(2000)
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
    expect(weeks[0]!.start).toBe('2026-10-26')
  })
})

describe('Bergwochenenden und lange Läufe im Rennzeitplan', () => {
  it('zwei Bergwochenenden, das zweite ist die Streckenbesichtigung 4 Wochen vor dem Rennen, Erinnerung 4 Wochen vorher', () => {
    expect(plan.mountainWeekends.map((w) => [w.days, w.courseRecce])).toEqual([
      [['2027-07-17', '2027-07-18'], false],
      [['2027-08-21', '2027-08-22'], true],
    ])
    expect(plan.mountainWeekends[1]!.reminderDate).toBe('2027-07-24')
    expect(plan.mountainWeekends.every((w) => w.feasible)).toBe(true)
    expect(types(day(plan, '2027-07-17'))).toContain('mountain_day')
    const recce = day(plan, '2027-08-21').sessions.find((s) => s.type === 'mountain_day')!
    expect(recce.title).toContain('Streckenbesichtigung')
    expect(recce.structure.main).toContain(CONFIG.race.name)
  })

  it('keine Nachtläufe mehr, stattdessen lange Läufe im Rennzeitplan an Tag 4 mit festem Start 07:00', () => {
    const all = plan.days.flatMap((d) => d.sessions)
    expect(all.some((s) => s.type === 'night_run')).toBe(false)
    const early = plan.days.filter((d) => d.sessions.some((s) => s.fixedStart && s.type === 'long_run'))
    expect(early.map((d) => d.date)).toEqual(['2027-06-12', '2027-06-27', '2027-07-22', '2027-08-11', '2027-08-26'])
    for (const d of early) {
      expect(d.shift.cycleDay).toBe(4)
      const run = d.sessions[0]!
      expect(run.startMin).toBe(CONFIG.race.startMin)
      expect(run.title).toContain('Rennzeitplan')
      expect(run.structure.main).toContain('04:30')
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
    for (const d of plan.days.filter((x) => x.shift.dayKind === 'sleep_day')) {
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
    // In Grundlage und Aufbau ist das die Krafteinheit, Qualitätseinheiten liegen an Tag 5
    const build = plan.days.filter((d) => d.shift.dayKind === 'pre_night' && plan.microcycles[d.microIndex - 1]?.phase === 'build')
    expect(build.length).toBeGreaterThan(0)
    for (const d of build) expect(d.sessions.every((s) => s.category === 'strength')).toBe(true)
    const quality = plan.days.flatMap((d) => d.sessions.filter((s) => s.type === 'threshold' || s.type === 'intervals_uphill').map(() => d.shift.cycleDay))
    expect(new Set(quality)).toEqual(new Set([5]))
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
        const micro = 1 + Math.floor(rnd() * 65)
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
    const cal = withOverride(createShiftCalendar(), { date: '2026-10-31', kind: 'V' })
    const p = generatePlan({ calendar: cal })
    const v = day(p, '2026-10-31')
    expect(v.sessions).toEqual([])
    const hills = v.removed.find((r) => r.session.type === 'treadmill_hills')!
    expect(hills.note).toContain('gestrichen')
    const cali = v.removed.find((r) => r.session.type === 'calisthenics_main')!
    expect(cali.reason).toBe('moved')
    const target = day(p, '2026-11-04')
    const moved = target.sessions.find((s) => s.type === 'calisthenics_main')!
    expect(moved.origin?.movedFrom).toBe('2026-10-31')
    expect(target.shift.cycleDay).toBe(4)
  })

  it('nie auf Tag 1 verschoben', () => {
    const cal = withOverride(createShiftCalendar(), { date: '2026-10-31', kind: 'V' })
    const p = generatePlan({ calendar: cal })
    for (const d of p.days.filter((x) => x.shift.cycleDay === 1)) expect(d.sessions).toEqual([])
  })

  it('Krankheit an Tag 4: langer Lauf rückt auf Tag 5 und ersetzt die schwächere Einheit, kein Nachholen', () => {
    const cal = withOverride(createShiftCalendar(), { date: '2026-10-30', kind: 'KRANK' })
    const p = generatePlan({ calendar: cal })
    const d5 = day(p, '2026-10-31')
    expect(types(d5)).toContain('long_run')
    expect(types(d5)).not.toContain('treadmill_hills')
    expect(microKm(p, 1)).toBeLessThanOrEqual(microKm(plan, 1))
    expect(microKm(p, 2)).toBe(microKm(plan, 2))
  })

  it('V-Schicht im B2B-Mikrozyklus: Tag 4 wird zum einzelnen langen Lauf', () => {
    const cal = withOverride(createShiftCalendar(), { date: '2027-06-23', kind: 'V' })
    const p = generatePlan({ calendar: cal })
    const d4 = day(p, '2027-06-22')
    const run = d4.sessions.find((s) => s.category === 'run')!
    expect(run.type).toBe('long_run')
    expect(run.distanceKm).toBe(22)
    expect(microKm(p, 48)).toBeLessThan(microKm(plan, 48))
    // der verlorene Tag 2 wird nicht in den nächsten Mikrozyklus gequetscht
    expect(microKm(p, 49)).toBe(microKm(plan, 49))
  })

  it('ausgelassene Schlüsseleinheit wird höchstens einmal verschoben', () => {
    const longId = day(plan, '2026-10-30').sessions.find((s) => s.type === 'long_run')!.id
    const p1 = generatePlan({ logs: [{ sessionId: longId, date: '2026-10-30', status: 'skipped' }] })
    const moved = day(p1, '2026-10-31').sessions.find((s) => s.type === 'long_run')!
    expect(moved.origin?.movedFrom).toBe('2026-10-30')
    // die verschobene Einheit wird ebenfalls ausgelassen → kein zweites Verschieben
    const p2 = generatePlan({
      logs: [
        { sessionId: longId, date: '2026-10-30', status: 'skipped' },
        { sessionId: moved.id, date: '2026-10-31', status: 'skipped' },
      ],
    })
    const later = p2.days.filter((d) => d.date > '2026-10-31').flatMap((d) => d.sessions)
    expect(later.filter((s) => s.origin?.movedFrom === '2026-10-31')).toEqual([])
  })

  it('Urlaub macht Tag 1 frei, ohne zusätzlichen Umfang', () => {
    const cal = withOverride(createShiftCalendar(), { date: '2026-11-01', kind: 'URLAUB' })
    const p = generatePlan({ calendar: cal })
    expect(day(p, '2026-11-01').sessions).toEqual([])
    expect(microKm(p, 2)).toBe(microKm(plan, 2))
  })
})

describe('Taper und Rennen', () => {
  it('Renntag Sa 18.09.2027 mit Start 07:00 in Bayerisch Eisenstein', () => {
    const d = day(plan, '2027-09-18')
    expect(d.isRaceDay).toBe(true)
    const race = d.sessions[0]!
    expect(race.type).toBe('race')
    expect(race.startMin).toBe(7 * 60)
    expect(race.distanceKm).toBe(66)
    expect(race.elevationM).toBe(2514)
    expect(race.structure.main).toContain('Bayerisch Eisenstein')
    expect(race.structure.main).toContain('Zielschluss 20:00')
    expect(race.structure.warmup).toContain('04:30')
  })

  it('Rennen bleibt auch bei V-Schicht im Plan (Konflikt meldet das Rennmodul)', () => {
    const p = generatePlan({ calendar: withOverride(createShiftCalendar(), { date: '2027-09-18', kind: 'V' }) })
    expect(types(day(p, '2027-09-18'))).toEqual(['race'])
  })

  it('mit Urlaub am Vortag: optionales kurzes Auflockern am 17.09.', () => {
    const p = generatePlan({ calendar: withOverride(createShiftCalendar(), { date: '2027-09-17', kind: 'URLAUB' }) })
    const eve = day(p, '2027-09-17').sessions
    expect(eve.map((s) => [s.type, s.optional])).toEqual([['recovery_run', true]])
    expect(eve[0]!.durationMin).toBe(CONFIG.volume.taperShares.raceDayEveMin)
  })

  it('Taper: Umfang deutlich runter, keine Schlaftag-Einheiten, kein schweres Bein', () => {
    const t = plan.microcycles.filter((m) => m.phase === 'taper')
    const peak = Math.max(...plan.microcycles.map((m) => m.plannedKm))
    expect(t[0]!.plannedKm).toBeLessThan(peak * 0.65)
    expect(t[1]!.plannedKm).toBeLessThan(t[0]!.plannedKm)
    const taperDays = plan.days.filter((d) => d.date >= '2027-09-02')
    expect(taperDays.filter((d) => d.shift.dayKind === 'sleep_day').flatMap((d) => d.sessions)).toEqual([])
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
    expect(longs.filter((s) => s.date < '2027-01-25').every((s) => !s.fueling)).toBe(true)
    expect(longs.filter((s) => s.date >= '2027-01-25' && s.date < '2027-09-02').every((s) => s.fueling && s.gearTest)).toBe(true)
  })

  it('mit Kraftstand werden Übungen mit Sätzen, Wiederholungen/Haltezeiten und Pausen eingesetzt', () => {
    const state = applyStrengthTest(
      initialStrengthState(),
      { date: '2026-10-01', maxPullups: 3, maxDips: 2, hollowHoldSec: 30, frontLever: { stage: 0, holdSec: 0 }, backLever: { stage: 0, holdSec: 10 } },
      { onboarding: true },
    )
    const p = generatePlan({ strengthState: state })
    const cali = day(p, '2026-10-31').sessions.find((s) => s.type === 'calisthenics_main')!
    expect(cali.exercises!.length).toBeGreaterThan(3)
    expect(cali.exercises!.every((e) => e.sets > 0 && e.restSec > 0 && (e.reps !== undefined || e.holdSec !== undefined))).toBe(true)
  })

  it('ist deterministisch', () => {
    expect(JSON.stringify(generatePlan())).toBe(JSON.stringify(plan))
  })
})
