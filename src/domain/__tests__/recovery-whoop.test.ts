import { describe, expect, it } from 'vitest';
import type { ISODate } from '../types.ts';
import { computeRecovery } from '../coach/recovery.ts';
import { assignSleep, baselineFor } from '../coach/whoop.ts';
import { vShiftWindows, windowsFor } from '../coach/windows.ts';
import { addDays } from '../date.ts';

/**
 * Erholungswert, Schlafzuordnung und Baselines.
 *
 * Der Erholungswert plant nicht — er stuft ab. Diese Tests halten fest, dass er
 * unter Schichtarbeit gegen die eigene Baseline dieses Zyklustags gelesen wird
 * und nicht gegen einen absoluten Wert, und dass er ohne genug Historie den Mund
 * hält, statt aus vier Messwerten eine Abstufung zu bauen.
 */

const START: ISODate = '2026-09-08';

describe('Schlafzuordnung', () => {
  it('erkennt den Vorschlaf 15:00–17:30 als Nap', () => {
    const nap = assignSleep({ start: '2026-09-08T15:00:00', end: '2026-09-08T17:30:00', kind: 'main' });
    expect(nap.kind).toBe('nap');
    expect(nap.assignedTo).toBe('2026-09-08');
  });

  it('ordnet den Tagschlaf 08:00–14:00 dem Zyklustag 3 zu', () => {
    const sleep = assignSleep({ start: '2026-09-09T08:00:00', end: '2026-09-09T14:00:00', kind: 'main' });
    expect(sleep.kind).toBe('main');
    expect(sleep.assignedTo).toBe('2026-09-09');
  });

  it('ordnet den gewöhnlichen Nachtschlaf dem Aufwachtag zu', () => {
    const sleep = assignSleep({ start: '2026-09-08T22:45:00', end: '2026-09-09T06:45:00', kind: 'main' });
    expect(sleep.assignedTo).toBe('2026-09-09');
  });
});

describe('Baselines je Zyklustag', () => {
  it('stuft bei Recovery 45 % nicht ab, wenn die Baseline dieses Zyklustags 48 % ist', () => {
    const history = Array.from({ length: 10 }, (_, i) => ({
      date: addDays(START, -i * 5) as ISODate,
      cycleDay: 3,
      value: 48,
    }));
    const baseline = baselineFor(history, 3);
    expect(baseline.ready).toBe(true);
    expect(baseline.value).toBe(48);

    const w = windowsFor(3, 5 * 60 + 30);
    const recovery = computeRecovery({
      date: START,
      cycleDay: 3,
      isVShift: false,
      outOfRotation: null,
      sleepTargetMinutes: w.sleepTargetMinutes,
      napExpected: false,
      recoveryPct: 45,
      recoveryBaseline: baseline,
    });
    // 45 gegen eine Baseline von 48 ist ein normaler Schlaftag, keine Warnung.
    expect(recovery.adjustments).toEqual([]);
    expect(recovery.value).toBe(60);
  });

  it('arbeitet ohne genug Historie im manuellen Modus ohne automatische Abstufung', () => {
    const w = windowsFor(4, 5 * 60 + 30);
    const recovery = computeRecovery({
      date: START,
      cycleDay: 4,
      isVShift: false,
      outOfRotation: null,
      sleepTargetMinutes: w.sleepTargetMinutes,
      napExpected: false,
      recoveryPct: 30,
      recoveryBaseline: { value: null, samples: 2, ready: false },
    });
    expect(recovery.manualMode).toBe(true);
    expect(recovery.adjustments).toEqual([]);
  });
});

describe('Schmerz beim Gehen', () => {
  it('lässt die Einheit entfallen und begründet es', () => {
    const w = windowsFor(4, 5 * 60 + 30);
    const recovery = computeRecovery({
      date: START,
      cycleDay: 4,
      isVShift: false,
      outOfRotation: null,
      sleepTargetMinutes: w.sleepTargetMinutes,
      napExpected: false,
      painWhileWalking: true,
    });
    expect(recovery.blocked).toBe(true);
    expect(recovery.blockedReason).toMatch(/Schmerz/);
  });
});

describe('Fenster der Rotation', () => {
  it('gibt dem Tagschichttag kein Trainingsfenster', () => {
    expect(windowsFor(1, 5 * 60 + 30).trainingWindow).toBeNull();
  });

  it('endet am Nachtschichttag um 13:30, 90 Minuten vor dem Vorschlaf', () => {
    const w = windowsFor(2, 5 * 60 + 30);
    expect(w.trainingWindow).toEqual({ start: 9 * 60, end: 13 * 60 + 30 });
    expect(w.nap).toEqual({ start: 15 * 60, end: 17 * 60 + 30 });
    expect(w.nextSleepStart).toBe(15 * 60);
  });

  it('legt den Schlaftag auf 16:00–20:00 nach sechs Stunden Tagschlaf', () => {
    const w = windowsFor(3, 5 * 60 + 30);
    expect(w.trainingWindow).toEqual({ start: 16 * 60, end: 20 * 60 });
    expect(w.sleepTargetMinutes).toBe(6 * 60);
  });

  it('verlängert den Schlaf vor der Nachtschicht statt ihn zu kürzen', () => {
    expect(windowsFor(2, 5 * 60 + 30).sleepTargetMinutes).toBeGreaterThan(
      windowsFor(1, 5 * 60 + 30).sleepTargetMinutes,
    );
  });

  it('lässt die V-Schicht im Dienst laufen', () => {
    expect(vShiftWindows().trainingWindow).toEqual({ start: 12 * 60, end: 13 * 60 });
  });
});
