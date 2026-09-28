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

describe('Periodisierung (SPEC 5.1, 5.2)', () => {
  it('52 Mikrozyklen vom 02.10.2026 bis 18.06.2027', () => {
    const micros = buildMicrocycles()
    expect(micros).toHaveLength(52)
    expect(micros[0]!.start).toBe('2026-10-02')
    expect(micros.at(-1)!.end).toBe('2027-06-18')
  })

  it('Phasengrenzen liegen auf Mesozyklus-Grenzen (2/3/2 + Taper)', () => {
    const mesos = buildMesocycles()
    expect(mesos.map((m) => [m.start, m.phase])).toEqual([
      ['2026-10-02', 'base'],
      ['2026-11-06', 'base'],
      ['2026-12-11', 'build'],
      ['2027-01-15', 'build'],
      ['2027-02-19', 'build'],
      ['2027-03-26', 'specific'],
      ['2027-04-30', 'specific'],
      ['2027-06-04', 'taper'],
    ])
    expect(mesos.at(-1)!.end).toBe('2027-06-18')
  })

  it('Entlastung = letzter Mikrozyklus in Meso 1–6, nicht in Meso 7', () => {
    const deloads = buildMicrocycles()
      .filter((m) => m.kind === 'deload')
      .map((m) => m.index)
    expect(deloads).toEqual([7, 14, 21, 28, 35, 42])
    expect(buildMicrocycles().find((m) => m.index === 49)!.kind).toBe('normal')
  })

  it('Taper ab 04.06.2027 über 3 Mikrozyklen', () => {
    const taper = buildMicrocycles().filter((m) => m.phase === 'taper')
    expect(taper.map((m) => m.start)).toEqual(['2027-06-04', '2027-06-09', '2027-06-14'])
  })

  it('findet den Mikrozyklus zu einem Datum', () => {
    expect(microIndexOf('2026-10-02')).toBe(1)
    expect(microIndexOf('2027-06-18')).toBe(52)
    expect(microIndexOf('2026-10-01')).toBeUndefined()
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
    expect(weeklyEquivalentKm(p20.microcycles[0]!)).toBeLessThan(22)
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

  it('Spitzenwerte: ca. 70–80 km/Woche, längster Lauf 50 km, B2B 30 + 20 km', () => {
    const peak = Math.max(...plan.microcycles.map(weeklyEquivalentKm))
    expect(peak).toBeGreaterThanOrEqual(70)
    expect(peak).toBeLessThanOrEqual(82)
    const all = plan.days.flatMap((d) => d.sessions)
    expect(Math.max(...all.filter((s) => s.type === 'long_run').map((s) => s.distanceKm!))).toBe(50)
    expect(all.find((s) => s.type === 'b2b_1' && s.distanceKm === 30)).toBeDefined()
    expect(all.find((s) => s.type === 'b2b_2' && s.distanceKm === 20)).toBeDefined()
  })

  it('Aufbau enthält lange Läufe über 30 km', () => {
    const buildLong = plan.days
      .filter((d) => plan.microcycles[d.microIndex - 1]!.phase === 'build')
      .flatMap((d) => d.sessions)
      .filter((s) => s.type === 'long_run' && s.distanceKm! > 30)
    expect(buildLong.length).toBeGreaterThanOrEqual(1)
  })

  it('Höhenmeter steigen von ca. 250 auf über 2.000 hm/Woche', () => {
    const first = plan.microcycles[0]!
    expect(Math.round((first.plannedElevationM * 7) / 5)).toBeLessThan(300)
    const b2bPeak = plan.microcycles.find((m) => m.index === 46)!
    expect((b2bPeak.plannedElevationM * 7) / 5).toBeGreaterThan(2000)
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
    expect(weeks[0]!.start).toBe('2026-09-28')
  })
})

describe('Bergwochenenden und Nachtläufe', () => {
  it('zwei Bergwochenenden (Meso 6 und 7), das letzte ca. 3 Wochen vor dem Rennen, Erinnerung 4 Wochen vorher', () => {
    expect(plan.mountainWeekends.map((w) => w.days)).toEqual([
      ['2027-04-18', '2027-04-19'],
      ['2027-05-28', '2027-05-29'],
    ])
    expect(plan.mountainWeekends[1]!.reminderDate).toBe('2027-04-30')
    expect(plan.mountainWeekends.every((w) => w.feasible)).toBe(true)
    expect(types(day(plan, '2027-05-28'))).toContain('mountain_day')
  })

  it('Nachtläufe liegen auf Tag 4 und starten um 21:00', () => {
    const nights = plan.days.filter((d) => d.sessions.some((s) => s.type === 'night_run'))
    expect(nights.length).toBeGreaterThanOrEqual(4)
    for (const d of nights) {
      expect(d.shift.cycleDay).toBe(4)
      expect(d.sessions.find((s) => s.type === 'night_run')!.startMin).toBe(21 * 60)
    }
  })

  it('Tag 5 nach dem Nachtlauf beginnt am Nachmittag', () => {
    const d = day(plan, '2027-04-04')
    expect(d.sessions.every((s) => (s.startMin ?? 0) >= 15 * 60)).toBe(true)
  })

  it('V-Schicht nach dem Nachtlauf-Tag: Nachtlauf wird tagsüber gelaufen', () => {
    const p = generatePlan({ calendar: withOverride(createShiftCalendar(), { date: '2027-04-04', kind: 'V' }) })
    const d = day(p, '2027-04-03')
    const run = d.sessions.find((s) => s.category === 'run')!
    expect(run.type).toBe('long_run')
    expect(run.origin?.convertedFrom).toBe('night_run')
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
    for (const d of plan.days.filter((x) => x.shift.dayKind === 'pre_night')) {
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
        const micro = 1 + Math.floor(rnd() * 51)
        const start = addDays('2026-10-02', (micro - 1) * 5)
        const r = rnd()
        if (r < 0.5) overrides.push({ date: addDays(start, 4), kind: 'V' })
        else if (r < 0.7) overrides.push({ date: addDays(start, Math.floor(rnd() * 5)), kind: 'KRANK' })
        else if (r < 0.85) overrides.push({ date: addDays(start, Math.floor(rnd() * 5)), kind: 'URLAUB' })
        else overrides.push({ date: addDays(start, 3), kind: 'TAUSCH', swapTo: 'N' })
      }
      const p = generatePlan({ calendar: createShiftCalendar(overrides) })
      expect(checkPlanRules(p.days)).toEqual([])
      // nie mehr als ohne Ausfälle (kein Nachholen)
      for (const m of p.microcycles) {
        const limit = m.isKeyPeak ? m.levelKm * 1.12 : m.targetKm
        if (m.phase !== 'taper') expect(m.plannedKm).toBeLessThanOrEqual(limit + 1.0)
      }
    }
  })
})

describe('V-Schicht, Ausfälle und Verschieben (SPEC 4.1, 6.3, 11)', () => {
  it('kurzfristige V-Schicht: keine Einheit am V-Tag, Schlüsseleinheit einmal verschoben oder gestrichen', () => {
    const cal = withOverride(createShiftCalendar(), { date: '2026-10-06', kind: 'V' })
    const p = generatePlan({ calendar: cal })
    const v = day(p, '2026-10-06')
    expect(v.sessions).toEqual([])
    const hills = v.removed.find((r) => r.session.type === 'treadmill_hills')!
    expect(hills.note).toContain('gestrichen')
    const cali = v.removed.find((r) => r.session.type === 'calisthenics_main')!
    expect(cali.reason).toBe('moved')
    const target = day(p, '2026-10-10')
    const moved = target.sessions.find((s) => s.type === 'calisthenics_main')!
    expect(moved.origin?.movedFrom).toBe('2026-10-06')
    expect(target.shift.cycleDay).toBe(4)
  })

  it('nie auf Tag 1 verschoben', () => {
    const cal = withOverride(createShiftCalendar(), { date: '2026-10-06', kind: 'V' })
    const p = generatePlan({ calendar: cal })
    for (const d of p.days.filter((x) => x.shift.cycleDay === 1)) expect(d.sessions).toEqual([])
  })

  it('Krankheit an Tag 4: langer Lauf rückt auf Tag 5 und ersetzt die schwächere Einheit, kein Nachholen', () => {
    const cal = withOverride(createShiftCalendar(), { date: '2026-10-05', kind: 'KRANK' })
    const p = generatePlan({ calendar: cal })
    const d5 = day(p, '2026-10-06')
    expect(types(d5)).toContain('long_run')
    expect(types(d5)).not.toContain('treadmill_hills')
    expect(microKm(p, 1)).toBeLessThanOrEqual(microKm(plan, 1))
    expect(microKm(p, 2)).toBe(microKm(plan, 2))
  })

  it('V-Schicht im B2B-Mikrozyklus: Tag 4 wird zum einzelnen langen Lauf', () => {
    const cal = withOverride(createShiftCalendar(), { date: '2027-03-30', kind: 'V' })
    const p = generatePlan({ calendar: cal })
    const d4 = day(p, '2027-03-29')
    const run = d4.sessions.find((s) => s.category === 'run')!
    expect(run.type).toBe('long_run')
    expect(run.distanceKm).toBe(22)
    expect(microKm(p, 36)).toBeLessThan(microKm(plan, 36))
    // der verlorene Tag 2 wird nicht in den nächsten Mikrozyklus gequetscht
    expect(microKm(p, 37)).toBe(microKm(plan, 37))
  })

  it('ausgelassene Schlüsseleinheit wird höchstens einmal verschoben', () => {
    const longId = day(plan, '2026-10-05').sessions.find((s) => s.type === 'long_run')!.id
    const p1 = generatePlan({ logs: [{ sessionId: longId, date: '2026-10-05', status: 'skipped' }] })
    const moved = day(p1, '2026-10-06').sessions.find((s) => s.type === 'long_run')!
    expect(moved.origin?.movedFrom).toBe('2026-10-05')
    // die verschobene Einheit wird ebenfalls ausgelassen → kein zweites Verschieben
    const p2 = generatePlan({
      logs: [
        { sessionId: longId, date: '2026-10-05', status: 'skipped' },
        { sessionId: moved.id, date: '2026-10-06', status: 'skipped' },
      ],
    })
    const later = p2.days.filter((d) => d.date > '2026-10-06').flatMap((d) => d.sessions)
    expect(later.filter((s) => s.origin?.movedFrom === '2026-10-06')).toEqual([])
  })

  it('Urlaub macht Tag 1 frei, ohne zusätzlichen Umfang', () => {
    const cal = withOverride(createShiftCalendar(), { date: '2026-10-07', kind: 'URLAUB' })
    const p = generatePlan({ calendar: cal })
    expect(day(p, '2026-10-07').sessions).toEqual([])
    expect(microKm(p, 2)).toBe(microKm(plan, 2))
  })
})

describe('Taper und Rennen', () => {
  it('Renntag 18.06.2027 mit Start 23:00', () => {
    const race = day(plan, '2027-06-18').sessions[0]!
    expect(race.type).toBe('race')
    expect(race.startMin).toBe(23 * 60)
    expect(race.distanceKm).toBe(86)
  })

  it('Rennen bleibt auch bei V-Schicht im Plan (Konflikt meldet das Rennmodul)', () => {
    const p = generatePlan({ calendar: withOverride(createShiftCalendar(), { date: '2027-06-18', kind: 'V' }) })
    expect(types(day(p, '2027-06-18'))).toEqual(['race'])
  })

  it('Taper: Umfang deutlich runter, keine Schlaftag-Einheiten, kein schweres Bein', () => {
    const t = plan.microcycles.filter((m) => m.phase === 'taper')
    const peak = Math.max(...plan.microcycles.map((m) => m.plannedKm))
    expect(t[0]!.plannedKm).toBeLessThan(peak * 0.65)
    expect(t[1]!.plannedKm).toBeLessThan(t[0]!.plannedKm)
    const taperDays = plan.days.filter((d) => d.date >= '2027-06-04')
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
    expect(longs.filter((s) => s.date < '2026-12-11').every((s) => !s.fueling)).toBe(true)
    expect(longs.filter((s) => s.date >= '2026-12-11' && s.date < '2027-06-04').every((s) => s.fueling && s.gearTest)).toBe(true)
  })

  it('mit Kraftstand werden Übungen mit Sätzen, Wiederholungen/Haltezeiten und Pausen eingesetzt', () => {
    const state = applyStrengthTest(
      initialStrengthState(),
      { date: '2026-10-01', maxPullups: 3, maxDips: 2, hollowHoldSec: 30, frontLever: { stage: 0, holdSec: 0 }, backLever: { stage: 0, holdSec: 10 } },
      { onboarding: true },
    )
    const p = generatePlan({ strengthState: state })
    const cali = day(p, '2026-10-06').sessions.find((s) => s.type === 'calisthenics_main')!
    expect(cali.exercises!.length).toBeGreaterThan(3)
    expect(cali.exercises!.every((e) => e.sets > 0 && e.restSec > 0 && (e.reps !== undefined || e.holdSec !== undefined))).toBe(true)
  })

  it('ist deterministisch', () => {
    expect(JSON.stringify(generatePlan())).toBe(JSON.stringify(plan))
  })
})
