import { describe, expect, it } from 'vitest';
import type { ISODate } from '../types.ts';
import { buildSleepDay } from '../sleep/day.ts';
import { caffeineCountdown, caffeineWindows, COFFEE_NAP } from '../sleep/caffeine.ts';
import { lightPlan } from '../sleep/light.ts';
import { sleepAdvice, UNIVERSAL_RULES } from '../sleep/rules.ts';
import { nutritionAdvice } from '../sleep/nutrition.ts';
import { DISCLAIMER, MELATONIN, REFERRAL, substanceAnswer } from '../sleep/substances.ts';
import { medicalFlags } from '../sleep/medical.ts';
import { caffeineHint, sleepSignals } from '../sleep/debt.ts';
import type { SleepNight } from '../sleep/debt.ts';
import { windowsFor } from '../coach/windows.ts';
import { addDays } from '../date.ts';

const START: ISODate = '2026-09-07';
const h = (hours: number, minutes = 0) => hours * 60 + minutes;
const day = (cycleDay: 1 | 2 | 3 | 4 | 5, isVShift = false) => ({ cycleDay, isVShift });

/* ------------------------------------------------------------------ *
 * Section 9 — the specified test cases
 * ------------------------------------------------------------------ */

describe('Koffein', () => {
  it('setzt am Nachtschichttag zwei Grenzen, nicht eine durchgehende', () => {
    const windows = caffeineWindows(day(2));
    expect(windows).toHaveLength(2);
    expect(windows[0].cutoff).toBe(h(10));
    expect(windows[1].cutoff).toBe(h(25)); // 01:00 der Folgenacht
  });

  it('zählt zur jeweils nächsten Grenze herunter', () => {
    const windows = caffeineWindows(day(2));
    const morning = caffeineCountdown(windows, h(9, 45));
    expect(morning.next?.cutoff).toBe(h(10));
    expect(morning.minutesLeft).toBe(15);
    expect(morning.remindNow).toBe(true);

    // Nach der Vormittagsgrenze zählt die App zur Nachtgrenze, nicht ins Leere.
    const evening = caffeineCountdown(windows, h(20));
    expect(evening.next?.cutoff).toBe(h(25));
    expect(evening.remindNow).toBe(false);
  });

  it('erinnert 30 Minuten vorher', () => {
    const windows = caffeineWindows(day(1));
    expect(caffeineCountdown(windows, h(15, 29)).remindNow).toBe(false);
    expect(caffeineCountdown(windows, h(15, 30)).remindNow).toBe(true);
  });

  it('setzt die Grenzen der übrigen Tage nach der Bettzeit', () => {
    expect(caffeineWindows(day(1))[0].cutoff).toBe(h(16));
    expect(caffeineWindows(day(3))[0].cutoff).toBe(h(8));
    expect(caffeineWindows(day(4))[0].cutoff).toBe(h(16));
    expect(caffeineWindows(day(5, true))[0].cutoff).toBe(h(14));
  });

  it('bietet den Kaffee-Nap nur am Nachtschichttag und nur auf Wunsch an', () => {
    const without = buildSleepDay(day(2), null, h(12));
    expect(without.advice.find((a) => a.id === COFFEE_NAP.id)).toBeUndefined();
    const with_ = buildSleepDay(day(2), null, h(12), { offerCoffeeNap: true });
    expect(with_.advice.find((a) => a.id === COFFEE_NAP.id)?.why).toMatch(/schnell einschläfst/);
    const freeDay = buildSleepDay(day(4), null, h(12), { offerCoffeeNap: true });
    expect(freeDay.advice.find((a) => a.id === COFFEE_NAP.id)).toBeUndefined();
  });
});

describe('Licht', () => {
  it('erinnert am Schlaftag um 06:45 an die Sonnenbrille, vor Dienstende', () => {
    const sunglasses = lightPlan(day(3)).find((a) => a.id === 'light-sleepday-sunglasses');
    expect(sunglasses).toBeTruthy();
    expect(sunglasses!.from).toBe(h(6, 45));
    expect(sunglasses!.priority).toBe('high');
    expect(sunglasses!.why).toMatch(/falsche Richtung/);
  });

  it('empfiehlt im Nachtdienst nach 04:00 kein helles Licht mehr', () => {
    const plan = lightPlan(day(2));
    const bright = plan.find((a) => a.id === 'light-night-bright')!;
    expect(bright.to).toBeLessThanOrEqual(h(28)); // endet spätestens 04:00
    const after = plan.find((a) => a.from >= h(28));
    expect(after?.avoid).toBe(true);
    expect(after?.label).toMatch(/reduzieren/);
    // Keine einzige Empfehlung für helles Licht nach 04:00.
    for (const a of plan) {
      if (a.avoid) continue;
      if (/hell/i.test(a.label)) expect(a.from).toBeLessThan(h(28));
    }
  });
});

describe('Schlaf', () => {
  it('schlägt am Schlaftag 22:45 vor, nicht 22:15 wie an anderen freien Tagen', () => {
    const sleepDay = sleepAdvice(day(3)).find((a) => a.id === 'sleep-day-late-bed');
    expect(sleepDay?.label).toMatch(/22:45/);
    expect(sleepDay?.why).toMatch(/Schlafdruck/);
    // Zum Vergleich das Fenster aus dem Trainingsmodul.
    expect(windowsFor(3, h(5, 30)).sleepStart).toBe(h(8));
    expect(windowsFor(5, h(5, 30)).sleepStart).toBe(h(22, 15));
  });

  it('nennt den Vorschlaf-Wecker als hohe Priorität und fest auf 17:30', () => {
    const alarm = sleepAdvice(day(2)).find((a) => a.id === 'sleep-nap-alarm')!;
    expect(alarm.priority).toBe('high');
    expect(alarm.label).toMatch(/17:30/);
  });

  it('weist auf die günstigeren Vorschlaf-Längen hin', () => {
    const hint = sleepAdvice(day(2)).find((a) => a.id === 'sleep-nap-length')!;
    expect(hint.label).toMatch(/15:00–16:30|15:00–18:00/);
    expect(hint.why).toMatch(/Tiefschlafphase/);
  });

  it('hat für jeden Tag die allgemeinen Regeln mit Begründung', () => {
    for (const rule of UNIVERSAL_RULES) {
      expect(rule.why.length).toBeGreaterThan(30);
    }
  });
});

describe('Ernährung', () => {
  it('sperrt die große Mahlzeit zwischen 00:00 und 04:00', () => {
    const window = nutritionAdvice(day(2)).find((a) => a.id === 'food-night-window')!;
    expect(window.from).toBe(h(24));
    expect(window.to).toBe(h(28));
    expect(window.avoid).toBe(true);
    expect(window.why).toMatch(/Glukosetoleranz/);
  });

  it('legt die Hauptmahlzeit nach den Vorschlaf', () => {
    const main = nutritionAdvice(day(2)).find((a) => a.id === 'food-main')!;
    expect(main.from).toBe(h(17, 45));
  });
});

describe('Substanzen', () => {
  it('erklärt Melatonin, nennt keine Dosis und verweist weiter', () => {
    const answer = substanceAnswer(MELATONIN);
    expect(answer.mechanism).toMatch(/verschiebt die innere Uhr/);
    expect(answer.mechanism).toMatch(/kein Schlafmittel/);
    expect(answer.referral).toBe(REFERRAL);
    expect(answer.referral).toMatch(/Apotheke|Hausarzt/);
    // Keine Zahl, die als Dosis gelesen werden könnte.
    expect(answer.mechanism + answer.boundary).not.toMatch(/\d+\s?(mg|µg|mcg)/i);
  });

  it('trägt den Hinweis, dass es keine Diagnose ist', () => {
    expect(DISCLAIMER).toMatch(/Keine Diagnose/);
    expect(DISCLAIMER).toMatch(/ärztliche/i);
  });
});

describe('Ärztliche Abklärung', () => {
  const base = {
    sleepHours: Array(28).fill(7.5),
    sleepQuality: Array(28).fill(4),
    daytimeSleepinessDespiteSleep: false,
    involuntarySleepOnset: false,
    observedApnea: false,
  };

  it('rät zur Abklärung, wenn der Schlaf vier Wochen unter sechs Stunden liegt', () => {
    const flags = medicalFlags({ ...base, sleepHours: Array(28).fill(5.5) });
    expect(flags.map((f) => f.id)).toContain('short-sleep');
  });

  it('rät bei Atemaussetzern und beim Einschlafen gegen den Willen', () => {
    expect(medicalFlags({ ...base, observedApnea: true }).map((f) => f.id)).toContain('apnea');
    expect(medicalFlags({ ...base, involuntarySleepOnset: true }).map((f) => f.id)).toContain(
      'involuntary',
    );
  });

  it('erkennt einen Abwärtstrend der Qualität über vier Wochen', () => {
    const declining = [...Array(14).fill(2), ...Array(14).fill(4)];
    expect(medicalFlags({ ...base, sleepQuality: declining }).map((f) => f.id)).toContain(
      'declining-quality',
    );
  });

  it('meldet bei unauffälligen Werten nichts', () => {
    expect(medicalFlags(base)).toEqual([]);
  });
});

describe('Kopplung an das Trainingsmodul', () => {
  const night = (offset: number, actual: number | null, cycleDay: number): SleepNight => ({
    date: addDays(START, -offset),
    targetHours: cycleDay === 3 ? 6 : 8,
    actualHours: actual,
    cycleDay,
    napExpected: cycleDay === 2,
  });

  it('löst bei 9 h Schlafschuld einen Deload aus', () => {
    const nights = [night(0, 5, 4), night(1, 5, 4), night(2, 5, 4)];
    const signals = sleepSignals(nights, START);
    expect(signals.debtHours).toBe(9);
    expect(signals.forceDeload).toBe(true);
    expect(signals.warnings.join(' ')).toMatch(/Deload/);
  });

  it('warnt ab 5 h und stuft die nächste harte Einheit ab', () => {
    const nights = [night(0, 6, 4), night(1, 5, 4)];
    const signals = sleepSignals(nights, START);
    expect(signals.debtHours).toBe(5);
    expect(signals.downgradeNextHard).toBe(true);
    expect(signals.forceDeload).toBe(false);
  });

  it('zieht für den ausgefallenen Vorschlaf 15 Punkte ab', () => {
    const nights: SleepNight[] = [
      { ...night(0, 8, 2), napExpected: true, napTaken: false },
    ];
    const signals = sleepSignals(nights, START);
    expect(signals.penaltyReasons).toContainEqual({ label: 'Vorschlaf ausgefallen', delta: -15 });
  });

  it('sperrt nach einem Tagschlaf unter 5 h die harte Einheit am Folgetag', () => {
    const nights = [night(0, 4.5, 3)];
    const signals = sleepSignals(nights, START);
    expect(signals.blockHardAfter).toContain(START);
    expect(signals.recoveryPenalty).toBe(-15);
  });

  it('gibt bei überschrittener Koffeingrenze nur einen Hinweis, keine Abstufung', () => {
    expect(caffeineHint(2)).toBeNull();
    const hint = caffeineHint(4)!;
    expect(hint).toMatch(/am Training ändert die App deswegen nichts/);
  });

  it('stuft niemals selbst ab — es liefert nur Signale', () => {
    /*
     * The module returns flags and a penalty; nothing in it plans or cancels a
     * session. One place decides about downgrades, and it is the aerobic
     * planner.
     */
    const signals = sleepSignals([night(0, 3, 4)], START);
    expect(Object.keys(signals).sort()).toEqual(
      [
        'blockHardAfter',
        'contributing',
        'debtHours',
        'downgradeNextHard',
        'forceDeload',
        'penaltyReasons',
        'recoveryPenalty',
        'warnings',
      ].sort(),
    );
  });
});

describe('Keine Gamification auf Schlafdaten', () => {
  it('erzeugt aus keiner Empfehlung Punkte, Serien oder Abzeichen', () => {
    const built = buildSleepDay(day(2), null, h(12));
    for (const advice of built.advice) {
      expect(advice).not.toHaveProperty('points');
      expect(advice).not.toHaveProperty('streak');
      expect(advice).not.toHaveProperty('badge');
    }
    const signals = sleepSignals([], START);
    expect(signals).not.toHaveProperty('score');
    expect(signals).not.toHaveProperty('streak');
  });

  it('gibt jeder Empfehlung eine Begründung in einem Satz', () => {
    for (const cycleDay of [1, 2, 3, 4, 5] as const) {
      const built = buildSleepDay(day(cycleDay), null, h(12));
      for (const advice of built.advice) {
        expect(advice.why.length).toBeGreaterThan(25);
      }
    }
  });

  it('markiert genau die zwei wirksamsten Erinnerungen als hoch', () => {
    const sleepDay = buildSleepDay(day(3), null, h(6));
    expect(sleepDay.highPriority.map((a) => a.id)).toEqual(['light-sleepday-sunglasses']);

    // Der Vorschlaf steht als Wecker drin, nicht doppelt auch als Zeitfenster.
    const nightDay = buildSleepDay(
      day(2),
      { start: h(22, 15), end: h(7), targetMinutes: h(8, 45), nap: { start: h(15), end: h(17, 30) } },
      h(12),
    );
    expect(nightDay.highPriority.map((a) => a.id)).toEqual(['sleep-nap-alarm']);
  });
});
