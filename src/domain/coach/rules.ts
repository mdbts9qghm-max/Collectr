import type { ISODate } from '../types.ts';
import type { CoachDay, Timeline } from './types.ts';
import {
  baseMinutesIn,
  hasHeavyLegs,
  isHardDay,
  loadOf,
  runMinutesIn,
  windowMeasurable,
} from './types.ts';
import { CATALOGUE, HARD_LOAD, HARTE_REGEL_LAUFEN } from './catalogue.ts';
import { MAX_GROWTH } from './phases.ts';
import { addDays, diffDays } from '../date.ts';
import { formatClock } from './windows.ts';

/**
 * Die harten Regeln.
 *
 * Jede steht hier als eigenes Objekt, mit dem Wortlaut aus dem Regelwerk und
 * einer Prüfung, die auf dem gesamten Blickfeld arbeitet. Der Coach zitiert im
 * Zweifel die Regel, statt eine Begründung zu erfinden — wer die Begründung
 * nachlesen kann, kann ihr auch widersprechen.
 *
 * `severity`:
 * - `blocker` — die Einheit findet so nicht statt.
 * - `warnung` — sie findet statt, aber abgestuft.
 * - `hinweis` — sie findet statt; die Regel meldet nur, was sie sieht.
 */

export type Severity = 'blocker' | 'warnung' | 'hinweis';

export interface RuleFinding {
  ruleId: string;
  date: ISODate | null;
  severity: Severity;
  message: string;
}

export interface CoachRule {
  id: string;
  title: string;
  /** Der Wortlaut, so wie er im Regelwerk steht. */
  text: string;
  /** Die Regel im Einflussfenster, die die Reichweite dieser Prüfung festlegt. */
  horizonRuleId: string | null;
  check: (t: Timeline) => RuleFinding[];
}

const ZONE2_MIN_SHARE = 0.8;
const ZONE2_WINDOW_DAYS = 10;
const LONGRUN_MAX_SHARE = 0.35;
const LONGRUN_MAX_GROWTH_MINUTES = 10;
const LOAD_SLEEP_GAP_MINUTES = 180;
const NIGHT_SHIFT_LATEST_END = 13 * 60 + 30;

const finding = (
  ruleId: string,
  date: ISODate | null,
  severity: Severity,
  message: string,
): RuleFinding => ({ ruleId, date, severity, message });

/** Die geplanten Tage — bei vergangenen zählt, was passiert ist. */
const planned = (t: Timeline) => t.days.filter((d) => d.run || d.strength);

/* ------------------------------------------------------------------ *
 * Schicht und Uhrzeit
 * ------------------------------------------------------------------ */

const laufenOnly: CoachRule = {
  id: 'laufen_only',
  title: 'Es wird gelaufen',
  text: HARTE_REGEL_LAUFEN,
  horizonRuleId: null,
  check: () => [],
};

const keinTrainingTagschicht: CoachRule = {
  id: 'kein_training_tagschicht',
  title: 'Tagschicht ist trainingsfrei',
  text: 'Am Tagschichttag wird nicht trainiert. Die Schicht läuft von 07:00 bis 19:00, es gibt kein Fenster.',
  horizonRuleId: null,
  check: (t) =>
    planned(t)
      .filter((d) => d.cycleDay === 1 && !d.isVShift)
      .map((d) =>
        finding(
          'kein_training_tagschicht',
          d.date,
          'blocker',
          'Tagschicht 07:00–19:00 — kein Trainingsfenster. Der Tag bleibt frei.',
        ),
      ),
};

const keineIntensitaetOhneFenster: CoachRule = {
  id: 'keine_intensitaet_nacht_schlaf_v',
  title: 'Keine Intensität an Nacht-, Schlaf- und V-Tagen',
  text: 'An Nachtschicht-, Schlaf- und V-Schicht-Tagen wird keine Intensität gelaufen.',
  horizonRuleId: null,
  /*
   * Intensität ist eine Frage der Art, nicht der Last. Ein neunzigminütiger
   * Zone-2-Lauf kommt über die Lastschwelle von 60, ist aber keine Intensität —
   * er dauert nur lange. Geprüft wird deshalb die Zone: ab Zone 3 ist es
   * Intensität, darunter ist es Grundlage, wie lang sie auch sei.
   */
  check: (t) =>
    planned(t)
      .filter(
        (d) =>
          d.run != null &&
          (CATALOGUE[d.run.kind].zone ?? 1) >= 3 &&
          (d.isVShift || d.cycleDay === 2 || d.cycleDay === 3),
      )
      .map((d) =>
        finding(
          'keine_intensitaet_nacht_schlaf_v',
          d.date,
          'blocker',
          d.isVShift
            ? 'V-Schicht: der Lauf findet im Dienst statt, 30 bis 60 Minuten locker. Keine Intensität.'
            : d.cycleDay === 2
              ? 'Nachtschichttag: vor zwölf Stunden Dienst keine harte Einheit.'
              : 'Schlaftag: nach sechs Stunden Tagschlaf keine harte Einheit.',
        ),
      ),
};

const nachtschichtEnde: CoachRule = {
  id: 'nachtschicht_ende_1330',
  title: 'Nachtschichttag endet 13:30',
  text: 'Am Nachtschichttag endet das Training um 13:30 — 90 Minuten vor dem Vorschlaf.',
  horizonRuleId: null,
  check: (t) =>
    planned(t)
      .filter((d) => d.cycleDay === 2 && !d.isVShift)
      .flatMap((d) => {
        const items = [d.run, d.strength].filter((i) => i != null);
        const latest = items.reduce(
          (max, i) => Math.max(max, (i!.startMinutes ?? 0) + i!.minutes),
          0,
        );
        if (latest <= NIGHT_SHIFT_LATEST_END) return [];
        return [
          finding(
            'nachtschicht_ende_1330',
            d.date,
            'blocker',
            `Endet ${formatClock(latest)} statt spätestens 13:30. Der Vorschlaf ab 15:00 ist die wirksamste Maßnahme gegen Nachtschichtmüdigkeit — er geht vor.`,
          ),
        ];
      }),
};

const belastungVorSchlaf: CoachRule = {
  id: 'belastung_vor_schlaf',
  title: 'Abstand zur nächsten Schlafphase',
  text: 'Belastung ab 60 endet mindestens 3 Stunden vor der nächsten Schlafphase. Der Vorschlaf zählt als Schlafphase.',
  horizonRuleId: 'belastung_vor_schlaf',
  check: (t) =>
    planned(t).flatMap((d) => {
      const hard = [d.run, d.strength].filter((i) => i != null && i.load >= HARD_LOAD);
      return hard.flatMap((i) => {
        const end = (i!.startMinutes ?? 0) + i!.minutes;
        const gap = d.nextSleepStart - end;
        if (i!.startMinutes == null || gap >= LOAD_SLEEP_GAP_MINUTES) return [];
        return [
          finding(
            'belastung_vor_schlaf',
            d.date,
            'blocker',
            `${CATALOGUE[i!.kind].label} endet ${formatClock(end)}, die nächste Schlafphase beginnt ${formatClock(d.nextSleepStart)} — ${Math.round(gap / 60 * 10) / 10} statt 3 Stunden Abstand.`,
          ),
        ];
      });
    }),
};

/* ------------------------------------------------------------------ *
 * Abstände zwischen Einheiten
 * ------------------------------------------------------------------ */

const harteEinheitenAbstand: CoachRule = {
  id: 'harte_einheiten_abstand',
  title: '48 Stunden zwischen harten Läufen',
  text: 'Zwischen zwei harten Laufeinheiten liegen mindestens 48 Stunden.',
  horizonRuleId: 'harte_einheiten_abstand',
  check: (t) => {
    const hardDays = t.days.filter(isHardDay).map((d) => d.date);
    const out: RuleFinding[] = [];
    for (let i = 1; i < hardDays.length; i++) {
      const gap = diffDays(hardDays[i], hardDays[i - 1]);
      if (gap < 2) {
        out.push(
          finding(
            'harte_einheiten_abstand',
            hardDays[i],
            'blocker',
            `Nur ${gap === 0 ? 'derselbe Tag' : `${gap} Tag`} nach der harten Einheit vom ${hardDays[i - 1]}. Zwischen zwei harten Läufen liegen 48 Stunden.`,
          ),
        );
      }
    }
    return out;
  },
};

const beinkraftVorIntensitaet: CoachRule = {
  id: 'beinkraft_vor_intensitaet',
  title: 'Schwere Beine nicht vor der harten Einheit',
  text: 'Schwere Beinkraft liegt nie in den 24 Stunden vor einer Intensitäts- oder Longrun-Einheit.',
  horizonRuleId: 'beinkraft_vor_intensitaet',
  check: (t) =>
    t.days
      .filter(hasHeavyLegs)
      .flatMap((d) => {
        const next = t.days.find((x) => x.date === addDays(d.date, 1));
        if (!next || !next.run || !CATALOGUE[next.run.kind].isKeySession) return [];
        return [
          finding(
            'beinkraft_vor_intensitaet',
            d.date,
            'blocker',
            `Schwere Beinkraft am Tag vor ${CATALOGUE[next.run.kind].label}. Der Oberkörper geht, die Beine bleiben frei.`,
          ),
        ];
      }),
};

/* ------------------------------------------------------------------ *
 * Budgets des Zyklus
 * ------------------------------------------------------------------ */

/** Die Fünf-Tage-Zyklen, die im Blickfeld ganz enthalten sind. */
function cyclesIn(t: Timeline): CoachDay[][] {
  const out: CoachDay[][] = [];
  let current: CoachDay[] = [];
  for (const day of t.days) {
    if (day.cycleDay === 1 && current.length) {
      out.push(current);
      current = [];
    }
    current.push(day);
  }
  if (current.length) out.push(current);
  return out.filter((c) => c.length === 5);
}

const ruhetagProZyklus: CoachRule = {
  id: 'ruhetag_pro_zyklus',
  title: 'Ein Tag ohne jede Belastung je Zyklus',
  text: 'Mindestens ein Tag ohne jede Belastung pro Zyklus.',
  horizonRuleId: 'ruhetag_pro_zyklus',
  check: (t) =>
    cyclesIn(t)
      .filter((cycle) => !cycle.some((d) => loadOf(d) === 0))
      .map((cycle) =>
        finding(
          'ruhetag_pro_zyklus',
          cycle[0].date,
          'warnung',
          `Zyklus ab ${cycle[0].date} ohne einen einzigen lastfreien Tag. Ein Ruhetag ist Teil des Plans, kein Ausfall.`,
        ),
      ),
};

const schluesselProZyklus: CoachRule = {
  id: 'schluessel_pro_zyklus',
  title: 'Eine Intensität, ein Longrun je Zyklus',
  text: 'Höchstens eine Intensitätseinheit und höchstens ein Longrun pro Zyklus.',
  horizonRuleId: 'schluessel_pro_zyklus',
  check: (t) =>
    cyclesIn(t).flatMap((cycle) => {
      const kinds = cycle.map((d) => d.run?.kind).filter((k) => k != null);
      const intensity = kinds.filter((k) => k === 'intervall' || k === 'intervall_kurz').length;
      const longruns = kinds.filter((k) => k === 'longrun' || k === 'longrun_verkuerzt').length;
      const out: RuleFinding[] = [];
      if (intensity > 1)
        out.push(
          finding(
            'schluessel_pro_zyklus',
            cycle[0].date,
            'blocker',
            `${intensity} Intensitätseinheiten im Zyklus ab ${cycle[0].date}. Erlaubt ist eine.`,
          ),
        );
      if (longruns > 1)
        out.push(
          finding(
            'schluessel_pro_zyklus',
            cycle[0].date,
            'blocker',
            `${longruns} Longruns im Zyklus ab ${cycle[0].date}. Erlaubt ist einer.`,
          ),
        );
      return out;
    }),
};

/* ------------------------------------------------------------------ *
 * Volumen und Verteilung
 * ------------------------------------------------------------------ */

const zone2Anteil: CoachRule = {
  id: 'zone2_anteil',
  title: 'Grundlage über allem',
  text: 'Zone 2 macht mindestens 80 % der Laufminuten je 10 Tage aus. Diese Regel steht über jedem Volumenziel.',
  horizonRuleId: 'zone2_anteil',
  check: (t) => {
    const window = t.days.filter(
      (d) => d.date > addDays(t.anchor, -ZONE2_WINDOW_DAYS) && d.date <= t.anchor,
    );
    const total = runMinutesIn(window);
    if (total === 0 || !windowMeasurable(window)) return [];
    const base = baseMinutesIn(window);
    const share = base / total;
    if (share >= ZONE2_MIN_SHARE) return [];
    return [
      finding(
        'zone2_anteil',
        t.anchor,
        'blocker',
        `Grundlagenanteil ${Math.round(share * 100)} % statt 80 % über zehn Tage (${base} von ${total} Laufminuten). Diese Regel steht über jedem Volumenziel — der harte Anteil geht zurück, nicht die Grenze hoch.`,
      ),
    ];
  },
};

const volumenWachstum: CoachRule = {
  id: 'volumen_wachstum',
  title: 'Höchstens 8 % mehr je 10 Tage',
  text: 'Die Laufminuten wachsen höchstens 8 % je 10 Tage. Verlangt das Phasenziel mehr, gilt die Grenze. Das Ziel wird nach hinten verschoben, nicht die Grenze gedehnt. Es gibt keinen Ersatzweg, um Volumen schneller aufzubauen.',
  horizonRuleId: 'volumen_wachstum',
  check: (t) => {
    const current = t.days.filter(
      (d) => d.date > addDays(t.anchor, -10) && d.date <= t.anchor,
    );
    const previous = t.days.filter(
      (d) => d.date > addDays(t.anchor, -20) && d.date <= addDays(t.anchor, -10),
    );
    if (previous.length < 10) return [];
    if (!windowMeasurable(current) || !windowMeasurable(previous)) return [];
    /*
     * Ein Deload ist ein geplanter Einbruch. Der Wiederanstieg danach an der
     * 8-%-Grenze zu messen hieße, den Deload selbst zu bestrafen — und würde das
     * Volumen bei jedem vierten Zyklus dauerhaft nach unten ziehen.
     */
    if (current.some((d) => d.isDeloadDay) || previous.some((d) => d.isDeloadDay)) return [];
    const before = runMinutesIn(previous);
    const now = runMinutesIn(current);
    if (before === 0) return [];
    const ceiling = Math.floor(before * (1 + MAX_GROWTH));
    if (now <= ceiling) return [];
    return [
      finding(
        'volumen_wachstum',
        t.anchor,
        'blocker',
        `${now} Laufminuten gegen ${before} in den zehn Tagen davor — erlaubt sind ${ceiling}. Das Ziel verschiebt sich nach hinten, die Grenze wird nicht gedehnt.`,
      ),
    ];
  },
};

const longrunGrenzen: CoachRule = {
  id: 'longrun_steigerung',
  title: 'Der Longrun wächst langsam',
  text: 'Der Longrun wächst höchstens 10 Minuten pro Schritt, nie zweimal hintereinander, und liegt nie über 35 % der Laufminuten von 10 Tagen.',
  horizonRuleId: 'longrun_steigerung',
  check: (t) => {
    const all = t.days
      .filter((d) => d.run && (d.run.kind === 'longrun' || d.run.kind === 'longrun_verkuerzt'))
      .map((d) => ({ date: d.date, minutes: d.run!.minutes, isDeload: d.isDeloadDay }));
    const out: RuleFinding[] = [];

    /*
     * Der halbierte Longrun eines Deloads steht nicht in der Schrittfolge. Sonst
     * gälte der Rücksprung danach als Steigerung um vierzig Minuten — und die
     * Regel würde genau das bestrafen, was der Deload bezweckt.
     */
    const longruns = all.filter((lr) => !lr.isDeload);

    for (let i = 1; i < longruns.length; i++) {
      const growth = longruns[i].minutes - longruns[i - 1].minutes;
      if (growth > LONGRUN_MAX_GROWTH_MINUTES) {
        out.push(
          finding(
            'longrun_steigerung',
            longruns[i].date,
            'blocker',
            `Longrun wächst um ${growth} Minuten. Erlaubt sind 10 pro Schritt.`,
          ),
        );
      }
      if (i >= 2 && growth > 0 && longruns[i - 1].minutes - longruns[i - 2].minutes > 0) {
        out.push(
          finding(
            'longrun_steigerung',
            longruns[i].date,
            'warnung',
            'Zweiter gesteigerter Longrun in Folge. Nach einer Steigerung steht ein Schritt auf gleicher Länge.',
          ),
        );
      }
    }

    for (const lr of all) {
      const window = t.days.filter((d) => d.date > addDays(lr.date, -10) && d.date <= lr.date);
      const total = runMinutesIn(window);
      if (total > 0 && windowMeasurable(window) && lr.minutes / total > LONGRUN_MAX_SHARE) {
        out.push(
          finding(
            'longrun_steigerung',
            lr.date,
            'blocker',
            `Longrun ${lr.minutes} Minuten von ${total} Laufminuten in zehn Tagen — ${Math.round((lr.minutes / total) * 100)} % statt höchstens 35 %.`,
          ),
        );
      }
    }
    return out;
  },
};

/* ------------------------------------------------------------------ *
 * Rhythmus über Wochen
 * ------------------------------------------------------------------ */

const belastungsverhaeltnis: CoachRule = {
  id: 'belastungsverhaeltnis',
  title: 'Belastungsverhältnis im Band',
  text: 'Das Verhältnis aus 7-Tage-Belastung und dem Tagesmittel von 28 Tagen bleibt zwischen 0,8 und 1,3.',
  horizonRuleId: 'belastungsverhaeltnis',
  check: (t) => {
    const known = t.days.filter((d) => d.done && d.date <= t.anchor);
    if (known.length < 14) return [];
    const acute = known
      .filter((d) => d.date > addDays(t.anchor, -7))
      .reduce((s, d) => s + loadOf(d), 0);
    const chronicDays = known.filter((d) => d.date > addDays(t.anchor, -28));
    const chronicMean = chronicDays.reduce((s, d) => s + loadOf(d), 0) / 28;
    if (chronicMean <= 0) return [];
    const ratio = Math.round((acute / 7 / chronicMean) * 100) / 100;
    if (ratio > 1.3)
      return [
        finding(
          'belastungsverhaeltnis',
          t.anchor,
          'warnung',
          `Belastungsverhältnis ${ratio.toFixed(2)} über 1,3 — die nächste harte Einheit geht eine Stufe zurück.`,
        ),
      ];
    if (ratio < 0.8)
      return [
        finding(
          'belastungsverhaeltnis',
          t.anchor,
          'hinweis',
          `Belastungsverhältnis ${ratio.toFixed(2)} unter 0,8 — die letzten Wochen waren zu leicht, um die Form zu halten.`,
        ),
      ];
    return [];
  },
};

const abstiegsserie: CoachRule = {
  id: 'abstiegsserie',
  title: 'Zwei Blöcke mit Abstufungen erzwingen einen Deload',
  text: 'Zwei aufeinanderfolgende 10-Tage-Blöcke mit Abstufungen erzwingen einen Deload.',
  horizonRuleId: 'abstiegsserie',
  check: (t) => {
    const blockHas = (from: number, to: number) =>
      t.days.some(
        (d) =>
          d.done &&
          d.downgraded &&
          d.date > addDays(t.anchor, from) &&
          d.date <= addDays(t.anchor, to),
      );
    if (blockHas(-10, 0) && blockHas(-20, -10)) {
      return [
        finding(
          'abstiegsserie',
          t.anchor,
          'warnung',
          'Zwei Zehn-Tage-Blöcke hintereinander mit Abstufungen. Das ist kein schlechter Tag mehr, sondern ein Muster — der nächste Zyklus wird ein Deload.',
        ),
      ];
    }
    return [];
  },
};

const deloadRhythmus: CoachRule = {
  id: 'deload_rhythmus',
  title: 'Jeder vierte Zyklus ist ein Deload',
  text: 'Jeder vierte Zyklus ist ein Deload: 40 % weniger Laufminuten, keine Intensität, Longrun halbiert.',
  horizonRuleId: 'deload_rhythmus',
  check: () => [],
};

const phasenwechsel: CoachRule = {
  id: 'phasenwechsel_volumen_konstant',
  title: 'Im Phasenwechsel bleibt das Volumen stehen',
  text: 'In Zyklen mit Stufenwechsel bleiben die Laufminuten konstant.',
  horizonRuleId: null,
  check: () => [],
};

export const RULES: CoachRule[] = [
  laufenOnly,
  keinTrainingTagschicht,
  keineIntensitaetOhneFenster,
  nachtschichtEnde,
  belastungVorSchlaf,
  harteEinheitenAbstand,
  beinkraftVorIntensitaet,
  ruhetagProZyklus,
  schluesselProZyklus,
  zone2Anteil,
  volumenWachstum,
  longrunGrenzen,
  belastungsverhaeltnis,
  abstiegsserie,
  deloadRhythmus,
  phasenwechsel,
];

const BY_ID = new Map(RULES.map((r) => [r.id, r]));

export function ruleById(id: string): CoachRule | null {
  return BY_ID.get(id) ?? null;
}

export function checkAll(t: Timeline): RuleFinding[] {
  return RULES.flatMap((r) => r.check(t));
}

export function blockersFor(t: Timeline, date: ISODate): RuleFinding[] {
  return checkAll(t).filter((f) => f.severity === 'blocker' && f.date === date);
}
