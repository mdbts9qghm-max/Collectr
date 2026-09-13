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
import { DEFAULT_ENTRY_LEVEL, ENTRY_LEVELS, entryLevel } from '../coach/entry.ts';
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
      entryLevel: 'fortgeschritten',
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

describe('die Einstufung', () => {
  it('hat für jede Stufe eine Frage, die man beantworten kann', () => {
    for (const l of ENTRY_LEVELS) {
      expect(l.description.length).toBeGreaterThan(40);
      expect(l.minutesPerTenDays).toBe(Math.round((l.runsPerWeek * l.minutesPerRun * 10) / 7 / 5) * 5);
    }
    expect(ENTRY_LEVELS.map((l) => l.id)).toContain(DEFAULT_ENTRY_LEVEL);
  });
});

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
    const hard = runs.reduce((sum, d) => sum + d.run!.hardMinutes, 0);
    expect((total - hard) / total).toBeGreaterThanOrEqual(0.8);
  });

  it('verbucht von einer Bahneinheit nur die Belastungsminuten als hart', () => {
    /*
     * Der Fehler, den dieser Test festhält: eine Stufe-I-Einheit dauert
     * 39 Minuten — 15 einlaufen, gut 3 auf der Bahn, 11 traben, 10 auslaufen.
     * Sie als 39 Zone-5-Minuten zu verbuchen, rechnet um den Faktor zwölf
     * falsch und verbietet Intervalle, die längst hineinpassen.
     */
    const day = future().find((d) => d.run && d.run.hardMinutes > 0);
    if (!day) return;
    expect(day.run!.hardMinutes).toBeLessThan(day.run!.minutes / 3);
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

  it('rechnet die Minuten aus der Einstufung, solange nichts gemessen ist', () => {
    // Gefragt wird, was man über sich weiß — die Minuten rechnet der Plan.
    expect(plan({ entryLevel: 'fortgeschritten' }).target.runMinutes).toBe(
      entryLevel('fortgeschritten').minutesPerTenDays,
    );
    expect(plan({ entryLevel: 'wieder' }).target.runMinutes).toBe(
      entryLevel('wieder').minutesPerTenDays,
    );
  });

  it('staffelt die Einstufungen aufsteigend und bleibt beim Einstieg vorsichtig', () => {
    const minutes = ENTRY_LEVELS.map((l) => l.minutesPerTenDays);
    expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
    // Der Wiedereinstieg liegt unter zweimal dreißig Minuten die Woche.
    expect(minutes[0]).toBeLessThan(90);
  });

  it('trägt bei kleinem Startvolumen trotzdem die Bahneinheit', () => {
    // Der Reiz ist das Letzte, was ein Plan aufgibt — das Volumen geht zuerst.
    const days = plan({ entryLevel: 'anfang' }).days.filter((d) => !d.done);
    expect(days.some((d) => d.run && CATALOGUE[d.run.kind].zone === 5)).toBe(true);
  });
});

describe('der Zone-2-Anteil bei kleinem Volumen', () => {
  /*
   * Hier stand einmal ein Test, der einen Konflikt zwischen zwei Vorgaben
   * festhielt: „Intervalle von Anfang an" und „Zone 2 ≥ 80 %" sollten bei
   * kleinem Volumen nicht beide gehen.
   *
   * Den Konflikt gab es nie. Er war eine Folge davon, dass eine ganze
   * Bahneinheit als Zone 5 verbucht wurde — 39 Minuten, von denen gut drei
   * wirklich hart sind. Mit richtiger Verbuchung liegt der Anteil auch bei
   * Anfängervolumen über 95 %, und die Bahneinheit passt mühelos hinein.
   *
   * Der Test steht jetzt andersherum: er hält fest, dass es **keinen** Konflikt
   * gibt, und würde sofort rot, wenn jemand die Verbuchung zurückdreht.
   */
  it('trägt eine Bahneinheit auch bei Anfängervolumen ohne Regelverstoß', () => {
    const p = plan({ entryLevel: 'wieder' });
    expect(p.zone2Share).toBeGreaterThanOrEqual(0.8);
    expect(p.conflict).toBeNull();
    expect(p.days.some((d) => !d.done && d.run && d.run.hardMinutes > 0)).toBe(true);
  });

  it('meldet erst dann einen Konflikt, wenn wirklich zu viel hart wäre', () => {
    // Die Mechanik bleibt: auf hohen Bahnstufen sind die Belastungsminuten ein
    // Vielfaches, und dann kann der Anteil sehr wohl kippen.
    const p = plan({ entryLevel: 'fortgeschritten' });
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
