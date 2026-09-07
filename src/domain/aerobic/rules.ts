import type { ISODate } from '../types.ts';
import type { Mode, SessionKind } from './catalogue.ts';
import { CATALOGUE, HARD_LOAD_THRESHOLD, isHard } from './catalogue.ts';
import { MIN_BASE_SHARE } from './volume.ts';

/**
 * The hard rules as individual objects.
 *
 * Each one carries an id, a plain-language description and its own check, so it
 * can be tested on its own and quoted verbatim in the interface when it fires.
 * A rule the app cannot explain in the athlete's own words is a rule the athlete
 * will work around.
 */

export interface PlacedUnit {
  date: ISODate;
  cycleDay: number | null;
  isVShift: boolean;
  kind: SessionKind;
  mode: Mode | null;
  /** Minutes from midnight. */
  start: number;
  durationMinutes: number;
  load: number;
}

export interface RuleContext {
  unit: PlacedUnit;
  /** Every other unit in the horizon. */
  others: PlacedUnit[];
  /** Units on the same day, excluding this one. */
  sameDay: PlacedUnit[];
  /** When the next sleep of this day begins; the pre-shift nap counts. */
  nextSleepStart: number;
  /** Training window of the day, if it has one. */
  window: { start: number; end: number } | null;
  /** Load per day across the horizon. */
  loadByDate: Map<ISODate, number>;
  /** Dates of the cycle this unit belongs to. */
  cycleDates: ISODate[];
  /** Share of aerobic minutes in zone 1 or 2 across the macrocycle. */
  baseShare: number;
  /** Acute-to-chronic load ratio, or null while it is unknown. */
  acwr: number | null;
}

export interface Violation {
  rule: string;
  message: string;
  date: ISODate;
  kind: SessionKind;
}

export interface Rule {
  id: string;
  /** What the rule says, in the athlete's language. */
  description: string;
  check: (ctx: RuleContext) => string | null;
}

const end = (u: PlacedUnit) => u.start + u.durationMinutes;
const absolute = (u: { date: ISODate; start: number }) =>
  Date.parse(`${u.date}T00:00:00`) / 60000 + u.start;
/**
 * Distance between two sessions, start to start.
 *
 * Not end to start: two sessions at the same time of day on consecutive days are
 * what "24 hours apart" means in training.
 */
const hoursBetween = (a: PlacedUnit, b: PlacedUnit) => Math.abs(absolute(b) - absolute(a)) / 60;

const isIntensity = (kind: SessionKind) => kind === 'vo2_intervals' || kind === 'threshold';
const isHeavyLegStrength = (kind: SessionKind) => {
  const spec = CATALOGUE[kind];
  return spec.discipline === 'strength' && spec.loadsLegs && spec.load >= HARD_LOAD_THRESHOLD;
};

export const RULES: Rule[] = [
  {
    id: 'tagschicht_frei',
    description: 'Am Tagschichttag findet kein Training statt — auch nicht früh und nicht spät.',
    check: ({ unit }) =>
      unit.cycleDay === 1 && !unit.isVShift
        ? 'Der Tagschichttag bleibt frei. 12 h Dienst plus Training ist kein Trainingstag, sondern ein Schlafdefizit.'
        : null,
  },
  {
    id: 'fenster',
    description: 'Keine Einheit außerhalb des Trainingsfensters ihres Zyklustags.',
    check: ({ unit, window }) => {
      if (unit.cycleDay === 1 && !unit.isVShift) return null; // covered above
      if (!window) return 'Dieser Tag hat kein Trainingsfenster.';
      if (unit.start >= window.start && end(unit) <= window.end) return null;
      const clock = (m: number) =>
        `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      return `${clock(unit.start)}–${clock(end(unit))} liegt außerhalb von ${clock(window.start)}–${clock(window.end)}.`;
    },
  },
  {
    id: 'vorschlaf_puffer',
    description: 'Am Nachtschichttag ist um 13:30 Schluss — 90 min Puffer vor dem Vorschlaf um 15:00.',
    check: ({ unit }) =>
      unit.cycleDay === 2 && !unit.isVShift && end(unit) > 13 * 60 + 30
        ? 'Am Nachtschichttag muss um 13:30 Schluss sein, sonst trägt der Vorschlaf um 15:00 nicht.'
        : null,
  },
  {
    id: 'schlaftag_fenster',
    description: 'Am Schlaftag frühestens ab 16:00, spätestens bis 20:00.',
    check: ({ unit }) => {
      if (unit.cycleDay !== 3 || unit.isVShift) return null;
      if (unit.start < 16 * 60) return 'Vor 16:00 wirkt am Schlaftag noch die Schlafträgheit.';
      if (end(unit) > 20 * 60) return 'Nach 20:00 baut die Einheit den Schlafdruck ab, statt ihn aufzubauen.';
      return null;
    },
  },
  {
    id: 'schlafpuffer',
    description: 'Einheiten ab Belastung 60 enden mindestens 3 h vor dem nächsten Schlafbeginn. Der Vorschlaf zählt mit.',
    check: ({ unit, nextSleepStart }) => {
      if (CATALOGUE[unit.kind].load < HARD_LOAD_THRESHOLD) return null;
      const buffer = (nextSleepStart - end(unit)) / 60;
      if (buffer >= 3) return null;
      return `Nur ${buffer.toFixed(1)} h bis zum nächsten Schlaf; 3 h sind nötig, damit die Einheit den Schlaf nicht kostet.`;
    },
  },
  {
    id: 'intensitaet_schicht',
    description: 'Keine Intensitätseinheit an Nachtschicht-, Schlaf- oder V-Schichttagen.',
    check: ({ unit }) => {
      if (!isIntensity(unit.kind)) return null;
      if (unit.isVShift) return 'An einer V-Schicht ist keine Intensitätseinheit zulässig.';
      if (unit.cycleDay === 2) return 'Der Vormittag ist das zirkadiane Leistungstief — hier keine Intensität.';
      if (unit.cycleDay === 3) return 'Nach 6 h Tagschlaf ist die neuromuskuläre Kontrolle zu niedrig für Intensität.';
      return null;
    },
  },
  {
    id: 'abstand_harte_einheiten',
    description: 'Zwischen zwei harten Einheiten liegen mindestens 48 h.',
    check: ({ unit, others }) => {
      if (!isHard(unit.kind)) return null;
      for (const other of others) {
        if (!isHard(other.kind)) continue;
        const gap = hoursBetween(unit, other);
        if (gap < 48) {
          return `Nur ${Math.round(gap)} h zu ${CATALOGUE[other.kind].label} am ${other.date}; 48 h sind nötig.`;
        }
      }
      return null;
    },
  },
  {
    id: 'beinkraft_vor_lauf',
    description: 'Schwere Beinkraft nie in den 24 h vor einer Intensitätseinheit oder der langen Einheit.',
    check: ({ unit, others }) => {
      const isKey = (k: SessionKind) => isIntensity(k) || k === 'long_z2';
      for (const other of others) {
        const liftFirst = isHeavyLegStrength(unit.kind) && isKey(other.kind);
        const keyFirst = isKey(unit.kind) && isHeavyLegStrength(other.kind);
        if (!liftFirst && !keyFirst) continue;
        const lift = liftFirst ? unit : other;
        const key = liftFirst ? other : unit;
        const hours = (absolute(key) - absolute(lift)) / 60;
        if (hours > 0 && hours < 24) {
          return `Schwere Beinkraft nur ${Math.round(hours)} h vor ${CATALOGUE[key.kind].label} — das kostet die Qualität der Schlüsseleinheit.`;
        }
      }
      return null;
    },
  },
  {
    id: 'doppel_abstand',
    description: 'Zwei Einheiten an einem Tag brauchen mindestens 6 h Abstand und liegen nur an freien Tagen.',
    check: ({ unit, sameDay }) => {
      if (sameDay.length === 0) return null;
      if (unit.cycleDay !== 4 && unit.cycleDay !== 5) {
        return 'Zwei Einheiten an einem Tag sind nur an freien Tagen zulässig.';
      }
      for (const other of sameDay) {
        const gap = Math.abs(unit.start - other.start) / 60;
        if (gap < 6) return `Nur ${gap.toFixed(1)} h zwischen den beiden Einheiten; 6 h sind nötig.`;
      }
      return null;
    },
  },
  {
    id: 'ruhetag',
    description: 'Mindestens ein Tag mit Belastung 0 pro Zyklus.',
    check: ({ cycleDates, loadByDate }) =>
      cycleDates.some((d) => (loadByDate.get(d) ?? 0) === 0)
        ? null
        : 'Dieser Zyklus hat keinen Tag mit Belastung 0.',
  },
  {
    id: 'zone2_anteil',
    description:
      'Mindestens 80 % des aeroben Volumens liegen in Zone 1 oder 2. Diese Regel steht über allen Volumenzielen.',
    check: ({ baseShare }) =>
      baseShare >= MIN_BASE_SHARE
        ? null
        : `Zone-1/2-Anteil liegt bei ${Math.round(baseShare * 100)} %, nötig sind ${Math.round(MIN_BASE_SHARE * 100)} %.`,
  },
  {
    id: 'belastungsverhaeltnis',
    description: 'Das Verhältnis der letzten 7 Tage zum Schnitt der letzten 28 bleibt zwischen 0,8 und 1,3.',
    check: ({ acwr }) => {
      if (acwr == null) return null;
      if (acwr > 1.3) return `Belastungsverhältnis ${acwr.toFixed(2)} über dem Band bis 1,3.`;
      if (acwr < 0.8) return `Belastungsverhältnis ${acwr.toFixed(2)} unter dem Band ab 0,8.`;
      return null;
    },
  },
];

/** Rules that judge the whole macrocycle rather than a single placement. */
const MACRO_RULES = new Set(['ruhetag', 'zone2_anteil', 'belastungsverhaeltnis']);

export function checkUnit(ctx: RuleContext): Violation[] {
  const out: Violation[] = [];
  for (const rule of RULES) {
    if (MACRO_RULES.has(rule.id)) continue;
    const message = rule.check(ctx);
    if (message) out.push({ rule: rule.id, message, date: ctx.unit.date, kind: ctx.unit.kind });
  }
  return out;
}

export function checkMacrocycle(ctx: RuleContext): Violation[] {
  const out: Violation[] = [];
  for (const rule of RULES) {
    if (!MACRO_RULES.has(rule.id)) continue;
    const message = rule.check(ctx);
    if (message) out.push({ rule: rule.id, message, date: ctx.unit.date, kind: ctx.unit.kind });
  }
  return out;
}

export function ruleById(id: string): Rule | undefined {
  return RULES.find((r) => r.id === id);
}
