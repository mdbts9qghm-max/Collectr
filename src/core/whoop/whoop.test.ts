import { describe, expect, it } from 'vitest'
import { generatePlan } from '../plan'
import { createShiftCalendar } from '../shift'
import { berlinToInstant } from '../time'
import { assignRecoveryDay, mainSleepFor, matchWorkouts, sportCategory, workoutToLog, type WhoopData, type WhoopSleep } from './index'

const cal = createShiftCalendar()
const iso = (date: string, min: number) => new Date(berlinToInstant(date, min)).toISOString()
const h = (hh: number, mm = 0) => hh * 60 + mm

function sleep(id: string, sDate: string, sMin: number, eDate: string, eMin: number, nap = false, extra: Partial<WhoopSleep> = {}): WhoopSleep {
  return { id, start: iso(sDate, sMin), end: iso(eDate, eMin), nap, ...extra }
}

// Zyklus 02.10.2026: T (02.) → N (03.) → S (04.) → F (05.) → F (06.)
const data: WhoopData = {
  sleeps: [
    sleep('s1', '2026-10-02', h(22, 30), '2026-10-03', h(7, 30), false, { cycleId: 1, performancePct: 90 }), // nach der Tagschicht
    sleep('nap', '2026-10-03', h(15), '2026-10-03', h(16, 30), true, { cycleId: 1 }), // Vorschlaf vor der Nacht
    sleep('s2', '2026-10-04', h(8), '2026-10-04', h(14), false, { cycleId: 2 }), // Tagschlaf nach der Nacht
    sleep('s3', '2026-10-04', h(22, 30), '2026-10-05', h(7), false, { cycleId: 3 }),
  ],
  recoveries: [
    { cycleId: 1, sleepId: 's1', score: 78, hrvMs: 72, restingHr: 49 },
    { cycleId: 2, sleepId: 's2', score: 41, hrvMs: 55, restingHr: 56 },
    { cycleId: 3, sleepId: 's3', score: 70, hrvMs: 70, restingHr: 50 },
  ],
  cycles: [
    { id: 1, start: iso('2026-10-02', h(22, 30)), end: iso('2026-10-04', h(8)), strain: 14.2 },
    { id: 2, start: iso('2026-10-04', h(8)), end: iso('2026-10-04', h(22, 30)), strain: 6.1 },
  ],
}

describe('WHOOP-Zuordnung über Zyklen statt Kalendertage (SPEC 8, 11)', () => {
  it('Schlaf nach der Nachtschicht (08:00–14:00) gehört zum Schlaftag', () => {
    const d = assignRecoveryDay(cal, '2026-10-04', data)!
    expect(d.recoveryScore).toBe(41)
    expect(d.sleep!.durationMin).toBe(360)
    expect(d.sleep!.daySleep).toBe(true)
    expect(d.strainPrevDay).toBe(14.2) // Nachtschicht-Zyklus
  })

  it('Tag 2: Nachtschlaf gilt für das Vormittagstraining, der Nap ist kein Hauptschlaf', () => {
    const d = assignRecoveryDay(cal, '2026-10-03', data)!
    expect(d.recoveryScore).toBe(78)
    expect(d.sleep!.daySleep).toBe(false)
    expect(d.sleep!.napMin).toBeUndefined() // Nap liegt nach dem Trainingsfenster
    expect(mainSleepFor(cal, '2026-10-03', data.sleeps)!.id).toBe('s1')
  })

  it('Nap vor dem Training zählt zur Schlafsumme', () => {
    const withNap: WhoopData = { ...data, sleeps: [...data.sleeps, sleep('n2', '2026-10-04', h(14, 15), '2026-10-04', h(14, 45), true)] }
    expect(assignRecoveryDay(cal, '2026-10-04', withNap)!.sleep!.napMin).toBe(30)
  })

  it('Tag 4 bekommt den Schlaf der Nacht davor, nicht den Tagschlaf', () => {
    expect(assignRecoveryDay(cal, '2026-10-05', data)!.recoveryScore).toBe(70)
  })

  it('Ausschlafen am freien Tag über den Fensterbeginn hinaus zählt für diesen Tag', () => {
    const late: WhoopData = { sleeps: [sleep('l', '2026-10-04', h(23), '2026-10-05', h(8, 15))], recoveries: [{ cycleId: 5, sleepId: 'l', score: 81 }] }
    expect(assignRecoveryDay(cal, '2026-10-05', late)!.recoveryScore).toBe(81)
  })

  it('fehlender Tagschlaf: keine alte Nacht zuordnen, sondern manuelle Eingabe', () => {
    const noDaySleep: WhoopData = { ...data, sleeps: data.sleeps.filter((s) => s.id !== 's2') }
    expect(assignRecoveryDay(cal, '2026-10-04', noDaySleep)).toBeUndefined()
  })

  it('Zuordnung über den Zyklus, wenn die Recovery keine Sleep-ID hat', () => {
    const d: WhoopData = { ...data, recoveries: [{ cycleId: 2, score: 44 }] }
    expect(assignRecoveryDay(cal, '2026-10-04', d)!.recoveryScore).toBe(44)
  })

  it('Sommerzeitumstellung: Nacht 27./28.03.2027 ist eine Stunde kürzer und gehört zum 28.03.', () => {
    // 27.03.2027 wäre Nachtschicht (Tag 2); mit Urlaub ist der 28.03. ein normaler freier Tag.
    const free = createShiftCalendar([{ date: '2027-03-27', kind: 'URLAUB' }])
    const d: WhoopData = { sleeps: [sleep('y', '2027-03-27', h(23), '2027-03-28', h(7))], recoveries: [{ cycleId: 9, sleepId: 'y', score: 60 }] }
    expect(d.sleeps[0]!.end).toBe('2027-03-28T05:00:00.000Z')
    const r = assignRecoveryDay(free, '2027-03-28', d)!
    expect(r.sleep!.durationMin).toBe(7 * 60)
    expect(r.sleep!.end).toEqual({ date: '2027-03-28', minutes: h(7) })
    expect(r.recoveryScore).toBe(60)
  })
})

describe('Workouts → Einheiten', () => {
  const plan = generatePlan()

  it('Sportarten werden erkannt', () => {
    expect(sportCategory('Running')).toBe('run')
    expect(sportCategory('Hiking/Rucking')).toBe('run')
    expect(sportCategory('Weightlifting')).toBe('strength')
    expect(sportCategory('Yoga')).toBe('mobility')
    expect(sportCategory('Golf')).toBeUndefined()
  })

  it('Lauf und Kraft am Tag 2 werden der passenden Einheit zugeordnet, Korrektur geht vor', () => {
    const date = '2026-10-03'
    const day = plan.days.find((d) => d.date === date)!
    const run = day.sessions.find((s) => s.category === 'run')!
    const legs = day.sessions.find((s) => s.category === 'strength')!
    const workouts = [
      { id: 'w1', start: iso(date, h(8, 35)), end: iso(date, h(9, 25)), sportName: 'Running', distanceM: 7250, strain: 9.1 },
      { id: 'w2', start: iso(date, h(9, 45)), end: iso(date, h(10, 35)), sportName: 'Weightlifting' },
    ]
    const m = matchWorkouts(workouts, plan.days)
    expect(m).toEqual([
      { workoutId: 'w1', sessionId: run.id, confidence: 'auto' },
      { workoutId: 'w2', sessionId: legs.id, confidence: 'auto' },
    ])
    const corrected = matchWorkouts(workouts, plan.days, { w1: null })
    expect(corrected[0]).toEqual({ workoutId: 'w1', sessionId: null, confidence: 'manual' })
    const log = workoutToLog(workouts[0]!, run.id, date)
    expect(log).toMatchObject({ durationMin: 50, distanceKm: 7.3, strain: 9.1, status: 'done' })
  })

  it('Nachtlauf nach Mitternacht gehört zum Vortag', () => {
    const date = '2027-04-03'
    const night = plan.days.find((d) => d.date === date)!.sessions.find((s) => s.type === 'night_run')!
    const m = matchWorkouts([{ id: 'n', start: iso('2027-04-04', h(0, 10)), end: iso('2027-04-04', h(1)), sportName: 'Running' }], plan.days)
    expect(m[0]!.sessionId).toBe(night.id)
  })

  it('ohne passende Einheit bleibt das Workout unzugeordnet', () => {
    const m = matchWorkouts([{ id: 'x', start: iso('2026-10-02', h(18)), end: iso('2026-10-02', h(19)), sportName: 'Running' }], plan.days)
    expect(m[0]!.confidence).toBe('none')
  })
})
