import { describe, expect, it } from 'vitest';
import { askCoach } from '../coach.ts';
import { buildIndexes } from '../../data/derived.ts';
import type { AppData } from '../../data/store.ts';
import {
  defaultExercises,
  defaultHabits,
  defaultShiftTypes,
  defaultTrainingPlan,
} from '../../data/defaults.ts';
import { parseBackup, buildBackup, sessionsToCsv } from '../../data/backup.ts';
import { session, settings } from './helpers.ts';

const TODAY = '2026-03-11';

function data(overrides: Partial<AppData> = {}): AppData {
  return {
    settings,
    shiftTypes: defaultShiftTypes(),
    shifts: { [TODAY]: { date: TODAY, shiftTypeId: 'shift_off', source: 'manual' } },
    sessions: [],
    exercises: defaultExercises(),
    habits: defaultHabits(),
    habitEntries: [],
    tasks: [],
    goals: [],
    records: [],
    checkIns: {},
    reviews: {},
    plans: [defaultTrainingPlan()],
    ...overrides,
  };
}

function ask(question: string, d: AppData = data()) {
  return askCoach(question, d, buildIndexes(d), TODAY);
}

describe('coach', () => {
  it('answers what to train today with a concrete session', () => {
    const answer = ask('Was soll ich heute trainieren?');
    expect(answer.text.length).toBeGreaterThan(20);
    expect(answer.facts?.some((f) => f.label === 'Schicht')).toBe(true);
  });

  it('explains the hybrid score with its pillars', () => {
    const answer = ask('Warum habe ich diesen Hybrid Score?');
    expect(answer.text).toContain('Hybrid Score');
    expect(answer.facts?.length).toBe(6);
  });

  it('says it has no data instead of inventing numbers', () => {
    const answer = ask('Wie war meine letzte Woche?');
    expect(answer.noData).toBe(true);
    expect(answer.text).toContain('keine Einheiten');
  });

  it('uses real numbers once data exists', () => {
    const withData = data({
      sessions: [
        session('2026-03-02', 'run', 60, 'easy', { actualDistanceKm: 10 }),
        session('2026-03-04', 'bike', 90, 'easy', { actualDistanceKm: 30 }),
      ],
    });
    const answer = ask('Wie war meine letzte Woche?', withData);
    expect(answer.noData).toBeUndefined();
    expect(answer.text).toContain('2 Einheiten');
  });

  it('reports the monthly running volume from logged sessions', () => {
    const withData = data({
      sessions: [session('2026-03-05', 'run', 60, 'easy', { actualDistanceKm: 11 })],
    });
    const answer = ask('Wie viel Laufumfang hatte ich diesen Monat?', withData);
    expect(answer.text).toContain('11 km');
  });

  it('falls back to suggestions for an unrecognised question', () => {
    const answer = ask('Wie wird das Wetter morgen?');
    expect(answer.followUps?.length).toBeGreaterThan(0);
  });

  it('never claims progress toward the ultra without running data', () => {
    const answer = ask('Wie entwickle ich mich Richtung 100-km-Ultra?');
    expect(answer.noData).toBe(true);
  });
});

describe('backup', () => {
  it('round-trips a full export', () => {
    const original = data({ sessions: [session('2026-03-05', 'run', 45)] });
    const file = JSON.stringify(buildBackup(original, '1.0.0'));
    const result = parseBackup(file);
    expect(result.ok).toBe(true);
    expect(result.data?.sessions?.length).toBe(1);
    expect(result.summary?.find((s) => s.label === 'Trainingseinheiten')?.count).toBe(1);
  });

  it('rejects a file that is not a backup of this app', () => {
    expect(parseBackup('{"format":"something-else"}').ok).toBe(false);
    expect(parseBackup('not json').ok).toBe(false);
    expect(parseBackup('null').ok).toBe(false);
  });

  it('rejects a backup from a newer version rather than importing it partially', () => {
    const result = parseBackup(JSON.stringify({ format: 'hybrid-athlete-backup', version: 99, data: {} }));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('neuer');
  });

  it('escapes CSV fields that contain separators', () => {
    const csv = sessionsToCsv([
      session('2026-03-05', 'run', 45, 'easy', { title: 'Lauf, locker', notes: 'sagte "gut"' }),
    ]);
    expect(csv).toContain('"Lauf, locker"');
    expect(csv).toContain('"sagte ""gut"""');
  });
});
