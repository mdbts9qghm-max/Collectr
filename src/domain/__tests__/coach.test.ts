import { describe, expect, it } from 'vitest';
import type { AppData } from '../../data/store.ts';
import type { ISODate } from '../types.ts';
import { buildCoach, buildIndexes } from '../../data/derived.ts';
import {
  defaultExercises,
  defaultHabits,
  defaultSettings,
  defaultShiftTypes,
  defaultTrainingPlan,
} from '../../data/defaults.ts';
import { CATALOGUE, isHardSession } from '../coach/catalogue.ts';
import { HORIZON_BACK, HORIZON_FORWARD, INFLUENCE_RULES, rulesReaching } from '../coach/horizon.ts';
import { addDays, today as todayIso } from '../date.ts';

/**
 * Die harten Regeln, als Test statt als Absichtserklärung.
 *
 * Der Plan wird über ein Blickfeld gerechnet, das über zwei Wochen reicht.
 * Geprüft wird deshalb nicht der heutige Tag allein, sondern jeder Tag darin —
 * eine Regel, die nur für heute gilt, ist keine Regel.
 */

const TODAY: ISODate = todayIso();
/** T · N · Ü · DF · DF, siebenmal — der 35-Tage-Zyklus. */
const MUSTER = ['shift_day', 'shift_night', 'shift_sleep_day', 'shift_off', 'shift_off'];

function data(patch: Partial<AppData['settings']> = {}): AppData {
  return {
    settings: {
      ...defaultSettings(),
      shiftRotation: MUSTER,
      shiftAnchor: { date: addDays(TODAY, -70), index: 0 },
      trainingStart: addDays(TODAY, -70),
      startRunMinutes: 300,
      ...patch,
    },
    shiftTypes: defaultShiftTypes(),
    shifts: {},
    sessions: [],
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

function plan(patch: Partial<AppData['settings']> = {}) {
  const d = data(patch);
  return buildCoach(d, buildIndexes(d), TODAY);
}

/** Die künftigen Tage — über die entscheidet der Coach noch. */
function future() {
  return plan().days.filter((d) => !d.done);
}

describe('das Schichtmodell', () => {
  it('kennt den Fünftagerhythmus T · N · Ü · DF · DF', () => {
    const days = future().slice(0, 5);
    expect(days.map((d) => d.cycleDay)).toEqual([1, 2, 3, 4, 5]);
  });

  it('plant am Tagschichttag nichts — weder Lauf noch Kraft', () => {
    for (const d of future().filter((x) => x.cycleDay === 1)) {
      expect(d.run).toBeNull();
      expect(d.strength).toBeNull();
    }
  });

  it('legt jede Einheit in das Fenster ihres Schichttages', () => {
    for (const d of future()) {
      if (!d.run?.startMinutes || !d.window) continue;
      expect(d.run.startMinutes).toBeGreaterThanOrEqual(d.window.start);
      expect(d.run.startMinutes + d.run.minutes).toBeLessThanOrEqual(d.window.end + 1);
    }
  });
});

describe('die harten Regeln', () => {
  it('setzt keine Intensität auf den Übergangstag nach der Nachtschicht', () => {
    for (const d of future().filter((x) => x.cycleDay === 3)) {
      if (!d.run) continue;
      expect(CATALOGUE[d.run.kind].zone ?? 1).toBeLessThan(3);
    }
  });

  it('lässt zwischen zwei harten Läufen mindestens 48 Stunden', () => {
    const hard = future().filter((d) => d.run?.isHard);
    for (let i = 1; i < hard.length; i++) {
      const gap =
        (Date.parse(hard[i].date) - Date.parse(hard[i - 1].date)) / (1000 * 60 * 60 * 24);
      expect(gap).toBeGreaterThanOrEqual(2);
    }
  });

  it('plant höchstens eine harte Einheit je rollender Woche', () => {
    const days = future();
    for (let i = 0; i < days.length; i++) {
      const window = days.slice(i, i + 7);
      if (window.length < 7) break;
      expect(window.filter((d) => d.run?.isHard).length).toBeLessThanOrEqual(1);
    }
  });

  it('plant höchstens einen langen Lauf je rollender Woche', () => {
    const days = future();
    for (let i = 0; i < days.length; i++) {
      const window = days.slice(i, i + 7);
      if (window.length < 7) break;
      const keys = window.filter((d) => d.run && CATALOGUE[d.run.kind].isKeySession);
      expect(keys.length).toBeLessThanOrEqual(1);
    }
  });

  it('lässt in jeder rollenden Woche mindestens einen Tag ohne Belastung', () => {
    const days = future();
    for (let i = 0; i < days.length; i++) {
      const window = days.slice(i, i + 7);
      if (window.length < 7) break;
      expect(window.filter((d) => !d.run && !d.strength).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('hält mindestens 80 % der Laufminuten in Zone 2 oder darunter', () => {
    const runs = future().filter((d) => d.run && CATALOGUE[d.run.kind].discipline === 'lauf');
    const total = runs.reduce((sum, d) => sum + d.run!.minutes, 0);
    const base = runs
      .filter((d) => (CATALOGUE[d.run!.kind].zone ?? 1) <= 2)
      .reduce((sum, d) => sum + d.run!.minutes, 0);
    expect(base / total).toBeGreaterThanOrEqual(0.8);
  });

  it('legt keine schwere Beinkraft in die 24 Stunden vor einen langen Lauf', () => {
    const days = future();
    for (let i = 0; i < days.length - 1; i++) {
      const next = days[i + 1];
      if (!next.run || !CATALOGUE[next.run.kind].isKeySession) continue;
      const s = days[i].strength;
      if (!s) continue;
      expect(CATALOGUE[s.kind].legHeavy).toBe(false);
    }
  });

  it('plant nie das Rad — es ist nur Abstufungsstufe', () => {
    for (const d of future()) {
      expect(d.run?.kind).not.toBe('rad');
    }
  });

  it('plant höchstens drei Krafteinheiten je rollender Woche', () => {
    const days = future();
    for (let i = 0; i < days.length; i++) {
      const window = days.slice(i, i + 7);
      if (window.length < 7) break;
      expect(window.filter((d) => d.strength).length).toBeLessThanOrEqual(3);
    }
  });
});

describe('das Volumen', () => {
  it('überschreitet das Zehn-Tage-Ziel nicht', () => {
    const p = plan();
    const days = p.days.filter((d) => !d.done).slice(0, 10);
    const minutes = days.reduce((sum, d) => sum + (d.run?.minutes ?? 0), 0);
    // Die Verteilung rundet je Einheit, deshalb eine kleine Toleranz.
    expect(minutes).toBeLessThanOrEqual(p.target.runMinutes * 1.1);
  });

  it('nimmt das eingestellte Startvolumen, solange nichts gemessen ist', () => {
    expect(plan({ startRunMinutes: 400 }).target.runMinutes).toBe(400);
    expect(plan({ startRunMinutes: 200 }).target.runMinutes).toBe(200);
  });

  it('trägt bei kleinem Startvolumen trotzdem die Bahneinheit', () => {
    // Der Reiz ist das Letzte, was ein Plan aufgibt — das Volumen geht zuerst.
    const days = plan({ startRunMinutes: 150 }).days.filter((d) => !d.done);
    expect(days.some((d) => d.run && CATALOGUE[d.run.kind].zone === 5)).toBe(true);
  });
});

describe('wo zwei Vorgaben sich widersprechen', () => {
  /*
   * „Intervalle sind von Anfang an mit dabei" und „Zone 2 ≥ 80 % der
   * Laufminuten" gehen bei kleinem Volumen nicht beide: eine Bahneinheit von
   * 40 Minuten verlangt rund 160 Minuten lockeres Laufen daneben.
   */
  it('sagt es, statt eine der beiden Regeln still fallen zu lassen', () => {
    const p = plan({ startRunMinutes: 120 });
    expect(p.zone2Share).toBeLessThan(0.8);
    expect(p.conflict).toMatch(/Zone 2/);
    expect(p.conflict).toMatch(/Bahneinheit bleibt/);
    // Die Bahneinheit ist trotzdem geplant.
    expect(p.days.some((d) => !d.done && d.run && (CATALOGUE[d.run.kind].zone ?? 1) >= 3)).toBe(true);
  });

  it('meldet keinen Konflikt, sobald das Volumen beide Regeln trägt', () => {
    const p = plan({ startRunMinutes: 400 });
    expect(p.zone2Share).toBeGreaterThanOrEqual(0.8);
    expect(p.conflict).toBeNull();
  });
});

describe('das Blickfeld', () => {
  it('reicht so weit, wie die weitestreichende Regel reicht — und keinen Tag weiter', () => {
    expect(HORIZON_BACK).toBe(Math.max(...INFLUENCE_RULES.map((r) => r.back)));
    expect(HORIZON_FORWARD).toBe(Math.max(...INFLUENCE_RULES.map((r) => r.forward)));
  });

  it('lässt einen Tag fallen, sobald keine Regel mehr bis zu ihm reicht', () => {
    expect(rulesReaching(TODAY, addDays(TODAY, -HORIZON_BACK)).length).toBeGreaterThan(0);
    expect(rulesReaching(TODAY, addDays(TODAY, -HORIZON_BACK - 1))).toEqual([]);
    expect(rulesReaching(TODAY, addDays(TODAY, HORIZON_FORWARD + 1))).toEqual([]);
  });

  it('rollt: der Einfluss hängt am Abstand, nicht an der Kalenderwoche', () => {
    // Derselbe Abstand, andere Wochentage — dieselben Regeln.
    for (const shift of [0, 1, 2, 3]) {
      const anchor = addDays(TODAY, shift);
      expect(rulesReaching(anchor, addDays(anchor, 2)).map((r) => r.id)).toEqual(
        rulesReaching(TODAY, addDays(TODAY, 2)).map((r) => r.id),
      );
    }
  });

  it('hat für jede Regel eine Begründung ihrer Reichweite', () => {
    for (const rule of INFLUENCE_RULES) {
      expect(rule.reachReason.length).toBeGreaterThan(20);
    }
  });
});

describe('heute', () => {
  it('nennt die Einheit an genau einer Stelle', () => {
    const p = plan();
    expect(p.today.headline).toContain(p.today.label.split(':')[0]);
  });

  it('sagt am Tagschichttag Ruhe', () => {
    const p = plan();
    const day = p.days.find((d) => d.date === TODAY);
    if (day?.cycleDay !== 1) return;
    expect(p.today.verdict).toBe('ruhe');
  });

  it('begründet jede Entscheidung mit Schicht, Erholung und Volumen', () => {
    const titles = plan().today.reasons.map((r) => r.title);
    expect(titles.some((t) => /Schicht/.test(t))).toBe(true);
    expect(titles).toContain('Erholung');
    expect(titles.some((t) => /Volumen/.test(t))).toBe(true);
  });
});

describe('harte Einheiten', () => {
  it('erkennt Härte an Art und Dauer, nicht an der Last', () => {
    expect(isHardSession('intervall', 40)).toBe(true);
    expect(isHardSession('longrun', 80)).toBe(true);
    expect(isHardSession('grundlagenlauf', 60)).toBe(false);
    // Drei Stunden locker kosten trotzdem Tage.
    expect(isHardSession('grundlagenlauf', 130)).toBe(true);
  });
});
