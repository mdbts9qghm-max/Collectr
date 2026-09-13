import { describe, expect, it } from 'vitest';
import type { AppData } from '../../data/store.ts';
import type { ISODate, TrainingSession } from '../types.ts';
import { buildCoach, buildIndexes, coachSessionDiff } from '../../data/derived.ts';
import {
  defaultExercises,
  defaultHabits,
  defaultShiftTypes,
  defaultTrainingPlan,
} from '../../data/defaults.ts';
import { sessionFromDecision } from '../coach/toSession.ts';
import { settings } from './helpers.ts';
import { addDays, today as todayIso } from '../date.ts';

/**
 * Die gespeicherte Einheit muss dem Coach folgen.
 *
 * Der Fehler, den diese Datei festhält: der Kopf des Tagesbildschirms zeigte
 * 24 Minuten, die Liste darunter 40. Der Coach rechnet jeden Tag neu, die
 * einmal eingeplante Einheit nicht — und abgehakt worden wäre die 40, also wäre
 * die falsche Zahl auch noch ins Belastungsmodell gelaufen.
 */

/*
 * Verankert am echten heute: der Coach füllt vergangene Tage aus
 * Aufzeichnungen und plant nur nach vorne. Ein fest verdrahtetes Datum in der
 * Vergangenheit liefert lauter Ruhetage und würde nichts prüfen.
 */
const TODAY: ISODate = todayIso();
const ROTATION = ['shift_day', 'shift_night', 'shift_sleep_day', 'shift_off', 'shift_off'];
const NOW = `${TODAY}T08:00:00.000Z`;

function data(sessions: TrainingSession[] = []): AppData {
  const shifts: AppData['shifts'] = {};
  for (let i = -40; i <= 40; i++) {
    const date = addDays(TODAY, i);
    shifts[date] = { date, shiftTypeId: ROTATION[(((i % 5) + 5) % 5)], source: 'manual' };
  }
  return {
    settings,
    shiftTypes: defaultShiftTypes(),
    shifts,
    sessions,
    exercises: defaultExercises(),
    habits: defaultHabits(),
    habitEntries: [],
    goals: [],
    records: [],
    checkIns: {},
    reviews: {},
    plans: [defaultTrainingPlan()],
  };
}

function planOn(date: ISODate) {
  const d = data();
  return buildCoach(d, buildIndexes(d), date);
}

/** Der erste Tag im Blickfeld, an dem der Coach wirklich einen Lauf vorsieht. */
function runDay(): { date: ISODate; plan: ReturnType<typeof planOn> } {
  for (let i = 0; i < 10; i++) {
    const date = addDays(TODAY, i);
    const plan = planOn(date);
    if (plan.today.kind !== 'ruhe' && plan.today.minutes > 0) return { date, plan };
  }
  throw new Error('kein Lauftag im Blickfeld');
}

/** Die Einheit so, wie der Coach sie heute anlegen würde. */
function freshFromCoach(date: ISODate, plan: ReturnType<typeof planOn>): TrainingSession {
  const s = sessionFromDecision(plan.today, {
    id: 'ses_1',
    createdAt: NOW,
    updatedAt: NOW,
  });
  if (!s) throw new Error('der Coach plant an diesem Tag keinen Lauf');
  return { ...s, date };
}

describe('coachSessionDiff', () => {
  it('zieht eine veraltete Einheit auf die heutige Zahl des Coaches', () => {
    const { date, plan } = runDay();
    const fresh = freshFromCoach(date, plan);
    const stale: TrainingSession = { ...fresh, plannedDurationMin: fresh.plannedDurationMin! + 16 };

    const diff = coachSessionDiff([stale], plan, date, NOW);

    expect(diff.remove).toEqual([]);
    expect(diff.update).toHaveLength(1);
    expect(diff.update[0].plannedDurationMin).toBe(plan.today.minutes);
    expect(diff.update[0].id).toBe(stale.id);
    expect(diff.update[0].createdAt).toBe(stale.createdAt);
  });

  it('fasst nichts an, was schon stimmt — sonst liefe der Abgleich im Kreis', () => {
    const { date, plan } = runDay();
    const fresh = freshFromCoach(date, plan);

    expect(coachSessionDiff([fresh], plan, date, NOW)).toEqual({ update: [], remove: [] });

    // Und nach einer Runde ist wirklich Ruhe: das Ergebnis der Korrektur
    // erzeugt keine zweite Korrektur.
    const stale = { ...fresh, plannedDurationMin: 999 };
    const once = coachSessionDiff([stale], plan, date, NOW).update[0];
    expect(coachSessionDiff([once], plan, date, NOW)).toEqual({ update: [], remove: [] });
  });

  it('lässt eine von Hand bearbeitete Einheit stehen', () => {
    const { date, plan } = runDay();
    const fresh = freshFromCoach(date, plan);
    const mine: TrainingSession = {
      ...fresh,
      plannedDurationMin: 90,
      source: 'manual',
    };

    expect(coachSessionDiff([mine], plan, date, NOW)).toEqual({ update: [], remove: [] });
  });

  it('lässt eine abgehakte Einheit stehen — Aufzeichnung wird nicht umgeschrieben', () => {
    const { date, plan } = runDay();
    const fresh = freshFromCoach(date, plan);
    const done: TrainingSession = {
      ...fresh,
      status: 'completed',
      plannedDurationMin: 90,
      actualDurationMin: 90,
    };

    expect(coachSessionDiff([done], plan, date, NOW)).toEqual({ update: [], remove: [] });
  });

  it('nimmt die eingeplante Einheit weg, wenn der Coach inzwischen Ruhe sagt', () => {
    const { date, plan } = runDay();
    const fresh = freshFromCoach(date, plan);

    // Ein Ruhetag aus demselben Blickfeld: dieselbe Einheit, anderer Tag.
    let restDate: ISODate | null = null;
    let restPlan: ReturnType<typeof planOn> | null = null;
    for (let i = 0; i < 10; i++) {
      const d = addDays(TODAY, i);
      const p = planOn(d);
      if (p.today.kind === 'ruhe' && p.today.strength == null) {
        restDate = d;
        restPlan = p;
        break;
      }
    }
    if (!restDate || !restPlan) throw new Error('kein reiner Ruhetag im Blickfeld');

    const orphan: TrainingSession = { ...fresh, date: restDate };
    const diff = coachSessionDiff([orphan], restPlan, restDate, NOW);

    expect(diff.update).toEqual([]);
    expect(diff.remove).toEqual([orphan.id]);
  });

  it('rührt Einheiten anderer Tage nicht an', () => {
    const { date, plan } = runDay();
    const fresh = freshFromCoach(date, plan);
    const other: TrainingSession = {
      ...fresh,
      date: addDays(date, -3),
      plannedDurationMin: 999,
    };

    expect(coachSessionDiff([other], plan, date, NOW)).toEqual({ update: [], remove: [] });
  });
});
