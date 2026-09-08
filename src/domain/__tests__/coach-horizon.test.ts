import { describe, expect, it } from 'vitest';
import {
  HORIZON_BACK,
  HORIZON_FORWARD,
  INFLUENCE_RULES,
  buildHorizon,
  dropReason,
  influenceRuleById,
  rulesReaching,
  stillMatters,
  windowCovering,
  windowForRule,
} from '../coach/horizon.ts';
import { addDays } from '../date.ts';

const TODAY = '2026-09-08';

describe('Einflussfenster', () => {
  it('spannt sich über die längste Regel auf, nicht weiter', () => {
    expect(HORIZON_BACK).toBe(27);
    expect(HORIZON_FORWARD).toBe(27);
    const h = buildHorizon(TODAY);
    expect(h.from).toBe(addDays(TODAY, -27));
    expect(h.to).toBe(addDays(TODAY, 27));
    expect(h.days).toHaveLength(55);
  });

  it('erfasst heute jede Regel', () => {
    expect(rulesReaching(TODAY, TODAY)).toHaveLength(INFLUENCE_RULES.length);
    const today = buildHorizon(TODAY).days.find((d) => d.offset === 0)!;
    expect(today.weight).toBe(1);
    expect(today.direction).toBe('today');
  });

  it('lässt den 48-Stunden-Abstand nach zwei Tagen fallen', () => {
    const reaching = (offset: number) =>
      rulesReaching(TODAY, addDays(TODAY, offset)).map((r) => r.id);
    expect(reaching(-2)).toContain('harte_einheiten_abstand');
    expect(reaching(-3)).not.toContain('harte_einheiten_abstand');
    expect(reaching(2)).toContain('harte_einheiten_abstand');
    expect(reaching(3)).not.toContain('harte_einheiten_abstand');
  });

  it('lässt die Beinkraftsperre genau einen Tag reichen', () => {
    expect(rulesReaching(TODAY, addDays(TODAY, -1)).map((r) => r.id)).toContain(
      'beinkraft_vor_intensitaet',
    );
    expect(rulesReaching(TODAY, addDays(TODAY, -2)).map((r) => r.id)).not.toContain(
      'beinkraft_vor_intensitaet',
    );
  });

  it('hält den Abstand zur Schlafphase auf dem Tag selbst', () => {
    expect(rulesReaching(TODAY, addDays(TODAY, -1)).map((r) => r.id)).not.toContain(
      'belastung_vor_schlaf',
    );
  });

  it('reicht beim Volumenwachstum weiter zurück als nach vorn', () => {
    const rule = influenceRuleById('volumen_wachstum')!;
    expect(rule.back).toBe(19);
    expect(rule.forward).toBe(9);
    expect(rulesReaching(TODAY, addDays(TODAY, -19)).map((r) => r.id)).toContain('volumen_wachstum');
    expect(rulesReaching(TODAY, addDays(TODAY, 19)).map((r) => r.id)).not.toContain(
      'volumen_wachstum',
    );
  });

  it('vergisst Tage jenseits des Fensters und begründet das Vergessen', () => {
    const far = addDays(TODAY, -28);
    expect(stillMatters(TODAY, far)).toBe(false);
    expect(dropReason(TODAY, far)).toMatch(/28 Tage zurück/);
    expect(dropReason(TODAY, addDays(TODAY, 40))).toMatch(/voraus/);
    expect(dropReason(TODAY, addDays(TODAY, -1))).toBeNull();
  });

  it('verliert das Gewicht monoton mit dem Abstand', () => {
    const days = buildHorizon(TODAY).days;
    const past = days.filter((d) => d.offset <= 0);
    for (let i = 1; i < past.length; i++) {
      expect(past[i].weight).toBeGreaterThanOrEqual(past[i - 1].weight);
    }
    const future = days.filter((d) => d.offset >= 0);
    for (let i = 1; i < future.length; i++) {
      expect(future[i].weight).toBeLessThanOrEqual(future[i - 1].weight);
    }
  });

  it('zählt die verbleibenden Tage bis zum Vergessen herunter', () => {
    const days = buildHorizon(TODAY).days;
    expect(days.find((d) => d.offset === -27)!.daysLeft).toBe(0);
    expect(days.find((d) => d.offset === -26)!.daysLeft).toBe(1);
    expect(days.find((d) => d.offset === 0)!.daysLeft).toBe(27);
  });

  it('gibt pro Regel genau den Bereich zurück, den sie braucht', () => {
    expect(windowForRule(TODAY, 'harte_einheiten_abstand')).toEqual({
      from: addDays(TODAY, -2),
      to: addDays(TODAY, 2),
    });
    expect(windowForRule(TODAY, 'gibt-es-nicht')).toBeNull();
    expect(windowCovering(TODAY, ['harte_einheiten_abstand', 'zone2_anteil'])).toEqual({
      from: addDays(TODAY, -9),
      to: addDays(TODAY, 9),
    });
  });

  it('begründet jede Reichweite und vergibt eindeutige Kennungen', () => {
    const ids = new Set(INFLUENCE_RULES.map((r) => r.id));
    expect(ids.size).toBe(INFLUENCE_RULES.length);
    for (const rule of INFLUENCE_RULES) {
      expect(rule.reachReason.length).toBeGreaterThan(20);
      expect(rule.rule.length).toBeGreaterThan(20);
      expect(rule.back).toBeGreaterThanOrEqual(0);
      expect(rule.forward).toBeGreaterThanOrEqual(0);
    }
  });
});
