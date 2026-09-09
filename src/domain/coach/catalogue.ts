import type { ZoneNumber } from './zones.ts';

/**
 * Der Einheitenkatalog. Es wird gelaufen.
 *
 * > Das gesamte Ausdauervolumen entsteht durch Laufen. Rad, Rudergerät und
 * > Crosstrainer sind keine zulässigen Trainingsformen und auch keine
 * > Ausweichoption bei schlechter Erholung. Die einzige Alternative zum Laufen
 * > ist weniger Laufen oder Ruhe.
 *
 * Deshalb gibt es in diesem Katalog keinen Modus. Es gibt nur Läufe,
 * Krafteinheiten, Gehen und Ruhe. Eine Abstufung geht immer nach unten
 * innerhalb derselben Sache — sie wechselt nie das Gerät.
 *
 * > Gehen ist die letzte Stufe vor Ruhe, nicht eine andere Sportart.
 */

export const HARTE_REGEL_LAUFEN =
  'Das gesamte Ausdauervolumen entsteht durch Laufen. Rad, Rudergerät und Crosstrainer sind keine zulässigen Trainingsformen und auch keine Ausweichoption bei schlechter Erholung. Die einzige Alternative zum Laufen ist weniger Laufen oder Ruhe.';

export const SESSION_KINDS = [
  'ruhe',
  'gehen',
  'lockerer_lauf',
  'grundlagenlauf',
  'longrun_verkuerzt',
  'longrun',
  'intervall_kurz',
  'intervall',
  'kraft_leicht',
  'kraft_oberkoerper',
  'kraft_ganzkoerper',
] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export type Discipline = 'lauf' | 'kraft' | 'ruhe';

export interface CatalogueEntry {
  kind: SessionKind;
  label: string;
  /** Ein Satz, der auf dem Bildschirm allein stehen kann. */
  headline: string;
  discipline: Discipline;
  /** Die Zone, in der die Einheit hauptsächlich läuft. Null bei Kraft und Ruhe. */
  zone: ZoneNumber | null;
  /** Belastungspunkte. Ab 60 gilt die Einheit als hart. */
  load: number;
  /** Erholungswert, unter dem die Einheit eine Stufe zurückgeht. */
  minRecovery: number;
  defaultMinutes: number;
  minMinutes: number;
  maxMinutes: number;
  /** Belastet die Beine schwer — sperrt die 24 Stunden davor für harte Läufe. */
  legHeavy: boolean;
  /** Zählt gegen das Budget an Schlüsseleinheiten des Zyklus. */
  isKeySession: boolean;
}

/** Ab diesem Belastungswert ist eine Einheit hart. */
export const HARD_LOAD = 60;

const ENTRIES: CatalogueEntry[] = [
  {
    kind: 'ruhe',
    label: 'Ruhe',
    headline: 'Heute nicht laufen.',
    discipline: 'ruhe',
    zone: null,
    load: 0,
    minRecovery: 0,
    defaultMinutes: 0,
    minMinutes: 0,
    maxMinutes: 0,
    legHeavy: false,
    isKeySession: false,
  },
  {
    kind: 'gehen',
    label: 'Gehen',
    headline: 'Zügig gehen, nicht laufen.',
    discipline: 'lauf',
    zone: 1,
    load: 12,
    minRecovery: 0,
    defaultMinutes: 40,
    minMinutes: 20,
    maxMinutes: 75,
    legHeavy: false,
    isKeySession: false,
  },
  {
    kind: 'lockerer_lauf',
    label: 'Lockerer Lauf',
    headline: 'Kurz und ruhig laufen.',
    discipline: 'lauf',
    zone: 2,
    load: 30,
    minRecovery: 35,
    defaultMinutes: 35,
    minMinutes: 20,
    maxMinutes: 50,
    legHeavy: false,
    isKeySession: false,
  },
  {
    kind: 'grundlagenlauf',
    label: 'Grundlagenlauf',
    headline: 'Ruhig laufen, Zone 2 halten.',
    discipline: 'lauf',
    zone: 2,
    load: 45,
    minRecovery: 55,
    defaultMinutes: 55,
    minMinutes: 30,
    // Bei vier Läufen je zehn Tage trägt ein Grundlagenlauf mehr Minuten als bei
    // acht. Hundert Minuten locker sind in P3 eine gewöhnliche Einheit.
    maxMinutes: 100,
    legHeavy: false,
    isKeySession: false,
  },
  {
    kind: 'longrun_verkuerzt',
    label: 'Longrun, verkürzt',
    headline: 'Langer Lauf, heute kürzer.',
    discipline: 'lauf',
    zone: 2,
    load: 55,
    minRecovery: 60,
    defaultMinutes: 70,
    minMinutes: 50,
    maxMinutes: 90,
    legHeavy: false,
    isKeySession: true,
  },
  {
    kind: 'longrun',
    label: 'Longrun',
    headline: 'Der lange Lauf. Ruhig anfangen.',
    discipline: 'lauf',
    zone: 2,
    load: 75,
    minRecovery: 70,
    defaultMinutes: 95,
    minMinutes: 70,
    maxMinutes: 180,
    legHeavy: false,
    isKeySession: true,
  },
  {
    kind: 'intervall_kurz',
    label: 'Intervalle, verkürzt',
    headline: 'Intervalle — weniger Wiederholungen.',
    discipline: 'lauf',
    zone: 4,
    load: 65,
    minRecovery: 70,
    defaultMinutes: 45,
    minMinutes: 35,
    maxMinutes: 60,
    legHeavy: false,
    isKeySession: true,
  },
  {
    kind: 'intervall',
    label: 'Intervalle',
    headline: 'Die harte Einheit der Woche.',
    discipline: 'lauf',
    zone: 5,
    load: 85,
    minRecovery: 80,
    defaultMinutes: 55,
    minMinutes: 40,
    maxMinutes: 75,
    legHeavy: false,
    isKeySession: true,
  },
  {
    kind: 'kraft_leicht',
    label: 'Mobilität und Rumpf',
    headline: 'Kurz mobilisieren, Rumpf stabilisieren.',
    discipline: 'kraft',
    zone: null,
    load: 12,
    minRecovery: 0,
    defaultMinutes: 20,
    minMinutes: 12,
    maxMinutes: 30,
    legHeavy: false,
    isKeySession: false,
  },
  {
    kind: 'kraft_oberkoerper',
    label: 'Kraft, Oberkörper',
    headline: 'Kraft ohne Beine.',
    discipline: 'kraft',
    zone: null,
    load: 28,
    minRecovery: 40,
    defaultMinutes: 40,
    minMinutes: 25,
    maxMinutes: 55,
    legHeavy: false,
    isKeySession: false,
  },
  {
    kind: 'kraft_ganzkoerper',
    label: 'Kraft, ganzer Körper',
    headline: 'Kraft mit schweren Beinen.',
    discipline: 'kraft',
    zone: null,
    load: 45,
    minRecovery: 60,
    defaultMinutes: 50,
    minMinutes: 35,
    maxMinutes: 70,
    legHeavy: true,
    isKeySession: false,
  },
];

export const CATALOGUE: Record<SessionKind, CatalogueEntry> = Object.fromEntries(
  ENTRIES.map((e) => [e.kind, e]),
) as Record<SessionKind, CatalogueEntry>;

/** Ab dieser Dauer ist auch ein Grundlagenlauf eine harte Einheit. */
export const LONG_EASY_IS_HARD_MINUTES = 120;

/**
 * Ist diese Einheit hart?
 *
 * Nicht die Last entscheidet, sondern Art und Dauer. Ein neunzigminütiger
 * Zone-2-Lauf kommt über die Lastschwelle von 60 — hart ist er deshalb nicht, er
 * dauert nur lange. Umgekehrt kostet ein Longrun Tage an Frische, auch wenn er
 * ruhig gelaufen wird.
 *
 * Drei Wege in die Härte: Intensität ab Zone 3, jede Schlüsseleinheit, und jede
 * Ausdauereinheit ab zwei Stunden — drei Stunden locker kosten ebenfalls Tage.
 */
export function isHardSession(kind: SessionKind, minutes: number): boolean {
  const entry = CATALOGUE[kind];
  if ((entry.zone ?? 1) >= 3) return true;
  if (entry.isKeySession) return true;
  return entry.discipline === 'lauf' && minutes >= LONG_EASY_IS_HARD_MINUTES;
}

export function isHard(kind: SessionKind): boolean {
  return CATALOGUE[kind].load >= HARD_LOAD;
}

/**
 * Die Abstufungsketten.
 *
 * Jede Kette endet auf `ruhe` und geht dabei über `gehen`. Sie verlässt nie die
 * Sportart, weil es keine zweite gibt.
 */
const CHAINS: Record<SessionKind, SessionKind[]> = {
  intervall: ['intervall', 'intervall_kurz', 'lockerer_lauf', 'gehen', 'ruhe'],
  intervall_kurz: ['intervall_kurz', 'lockerer_lauf', 'gehen', 'ruhe'],
  longrun: ['longrun', 'longrun_verkuerzt', 'lockerer_lauf', 'gehen', 'ruhe'],
  longrun_verkuerzt: ['longrun_verkuerzt', 'lockerer_lauf', 'gehen', 'ruhe'],
  grundlagenlauf: ['grundlagenlauf', 'lockerer_lauf', 'gehen', 'ruhe'],
  lockerer_lauf: ['lockerer_lauf', 'gehen', 'ruhe'],
  gehen: ['gehen', 'ruhe'],
  ruhe: ['ruhe'],
  kraft_ganzkoerper: ['kraft_ganzkoerper', 'kraft_oberkoerper', 'kraft_leicht', 'ruhe'],
  kraft_oberkoerper: ['kraft_oberkoerper', 'kraft_leicht', 'ruhe'],
  kraft_leicht: ['kraft_leicht', 'ruhe'],
};

export function chainFor(kind: SessionKind): SessionKind[] {
  return CHAINS[kind];
}

/** Eine Stufe zurück. Null, wenn schon Ruhe erreicht ist. */
export function stepDown(kind: SessionKind): SessionKind | null {
  const chain = CHAINS[kind];
  const at = chain.indexOf(kind);
  return at >= 0 && at + 1 < chain.length ? chain[at + 1] : null;
}

/** Wie oft die Einheit schon abgestuft wurde, gemessen an ihrer eigenen Kette. */
export function stepsTaken(planned: SessionKind, actual: SessionKind): number {
  const chain = CHAINS[planned];
  const i = chain.indexOf(actual);
  return i < 0 ? 0 : i;
}

/**
 * Die tiefste Stufe der Kette, die der Erholungswert noch trägt.
 *
 * Der Erholungswert plant nicht — er stuft nur ab. Was trainiert wird, kommt aus
 * dem Phasenziel und dem Zyklus; dieser Wert entscheidet nur, wie viel davon
 * heute übrig bleibt.
 */
export function bearableStep(kind: SessionKind, recovery: number): SessionKind {
  for (const step of CHAINS[kind]) {
    if (recovery >= CATALOGUE[step].minRecovery) return step;
  }
  return 'ruhe';
}

export function describeStepDown(from: SessionKind, to: SessionKind): string {
  if (from === to) return '';
  if (to === 'ruhe') return `${CATALOGUE[from].label} entfällt — heute Ruhe.`;
  if (to === 'gehen')
    return `${CATALOGUE[from].label} wird zu Gehen. Das ist die letzte Stufe vor Ruhe, keine andere Sportart.`;
  return `${CATALOGUE[from].label} wird zu ${CATALOGUE[to].label}.`;
}
