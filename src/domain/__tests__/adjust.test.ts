import { describe, expect, it } from 'vitest';
import type { DailyCheckIn, ISODate } from '../types.ts';
import type { PlannedUnit } from '../cycle/types.ts';
import {
  NEUTRAL_WELLBEING,
  suggestAdjustment,
  upgradeOf,
  wellbeingBaseline,
} from '../cycle/adjust.ts';
import { cycleLoadFromSrpe } from '../cycle/catalogue.ts';
import { sessionFromUnit, shapeOf } from '../cycle/toSession.ts';
import { sessionLoad } from '../load.ts';
import { addDays } from '../date.ts';

const DATE: ISODate = '2026-03-05';

function unit(kind: PlannedUnit['kind']): PlannedUnit {
  return { date: DATE, kind, start: 480, durationMinutes: 60, load: 0, reasons: [] };
}

function history(values: (number | undefined)[]): Map<ISODate, DailyCheckIn> {
  const map = new Map<ISODate, DailyCheckIn>();
  values.forEach((value, i) => {
    const date = addDays(DATE, -(i + 1));
    map.set(date, { date, wellbeing: value, source: 'manual', updatedAt: '' });
  });
  return map;
}

describe('Befinden gegen den eigenen Normalwert', () => {
  it('nimmt sieben als Normalwert, solange zu wenig Historie da ist', () => {
    expect(wellbeingBaseline(history([6, 6]), DATE)).toBe(NEUTRAL_WELLBEING);
  });

  it('nimmt den Median der letzten zwei Wochen', () => {
    // Someone who reports a six every day is not permanently under-recovered.
    expect(wellbeingBaseline(history([6, 6, 6, 6, 6]), DATE)).toBe(6);
  });

  it('lässt sich von einer einzelnen schlechten Nacht nicht verschieben', () => {
    expect(wellbeingBaseline(history([8, 8, 1, 8, 8]), DATE)).toBe(8);
  });

  it('ignoriert Tage ohne Angabe', () => {
    expect(wellbeingBaseline(history([9, undefined, 9, undefined, 9]), DATE)).toBe(9);
  });
});

describe('Vorschlag zum Auf- oder Abstufen', () => {
  it('schweigt bei einer Abweichung unter zwei Punkten', () => {
    expect(suggestAdjustment(unit('long_run'), 6, 7)).toBeNull();
    expect(suggestAdjustment(unit('long_run'), 8, 7)).toBeNull();
  });

  it('stuft ab, wenn das Befinden zwei Punkte unter dem Normalwert liegt', () => {
    const a = suggestAdjustment(unit('long_run'), 5, 7);
    expect(a?.direction).toBe('down');
    expect(a?.to).toBe('easy_run');
  });

  it('stuft auf, wenn das Befinden deutlich über dem Normalwert liegt', () => {
    const a = suggestAdjustment(unit('long_run'), 9, 7, 100);
    expect(a?.direction).toBe('up');
    expect(a?.to).toBe('intense_run');
  });

  it('stuft nicht auf, wenn der Tag die Einheit gar nicht trägt', () => {
    // A good morning does not create recovery that is not there.
    expect(suggestAdjustment(unit('long_run'), 9, 7, 60)).toBeNull();
  });

  it('stuft nicht unter Regeneration', () => {
    expect(suggestAdjustment(unit('regeneration'), 3, 7)).toBeNull();
  });

  it('führt von der Regeneration über den lockeren Lauf zurück, nicht über Kraft', () => {
    expect(upgradeOf('regeneration')).toBe('easy_run');
  });

  it('meldet nichts ohne Angabe oder ohne Einheit', () => {
    expect(suggestAdjustment(unit('long_run'), undefined, 7)).toBeNull();
    expect(suggestAdjustment(null, 2, 7)).toBeNull();
  });
});

describe('Einheit in eine echte Session übersetzen', () => {
  it('behält Zeitfenster, Dauer und Begründung', () => {
    const source: PlannedUnit = {
      date: DATE,
      kind: 'intense_run',
      start: 8 * 60 + 30,
      durationMinutes: 55,
      load: 80,
      reasons: ['Schlüsseltag des Zyklus'],
    };
    const session = sessionFromUnit(source, { id: 'x', createdAt: 'a', updatedAt: 'b' });
    expect(session.startTime).toBe('08:30');
    expect(session.plannedDurationMin).toBe(55);
    expect(session.sport).toBe('run');
    expect(session.status).toBe('planned');
    expect(session.notes).toContain('Schlüsseltag');
  });

  it('bildet jede Einheit auf die Skala ab, aus der der Planer rechnet', () => {
    // The generated session's load feeds straight back into the planner's
    // rolling window, so the two scales have to agree within a few points.
    const kinds = ['intense_run', 'heavy_strength', 'moderate_strength', 'easy_run'] as const;
    for (const kind of kinds) {
      const spec = shapeOf(kind);
      const session = sessionFromUnit(
        { date: DATE, kind, start: 480, durationMinutes: 0, load: 0, reasons: [] },
        { id: 'x', createdAt: '', updatedAt: '' },
      );
      expect(session.sport).toBe(spec.sport);
    }

    const intense = sessionFromUnit(
      { date: DATE, kind: 'intense_run', start: 480, durationMinutes: 55, load: 80, reasons: [] },
      { id: 'x', createdAt: '', updatedAt: '' },
    );
    expect(Math.abs(cycleLoadFromSrpe(sessionLoad(intense)) - 80)).toBeLessThanOrEqual(6);

    const heavy = sessionFromUnit(
      { date: DATE, kind: 'heavy_strength', start: 480, durationMinutes: 60, load: 70, reasons: [] },
      { id: 'x', createdAt: '', updatedAt: '' },
    );
    expect(Math.abs(cycleLoadFromSrpe(sessionLoad(heavy)) - 70)).toBeLessThanOrEqual(6);
  });
});
