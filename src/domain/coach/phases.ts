/**
 * Das Phasenmodell — in Laufminuten, nicht in Kilometern.
 *
 * Die Steuergröße ist der aerobe Reiz. Kilometer sind eine Folge davon und
 * hängen an Tempo, Untergrund und Steigung; Minuten in einer Zone hängen an
 * nichts davon ab. Deshalb steht in jeder Zeile eine Minutenzahl je zehn Tage.
 *
 * > Verlangt das Phasenziel mehr, gilt die Grenze. Das Ziel wird nach hinten
 * > verschoben, nicht die Grenze gedehnt. Es gibt keinen Ersatzweg, um Volumen
 * > schneller aufzubauen.
 *
 * Genau so ist es hier gebaut: das Phasenziel ist eine Absicht, die
 * Wachstumsgrenze ist ein Gesetz. Wo beide sich widersprechen, gewinnt die
 * Grenze und das Ziel rutscht nach hinten.
 */

export type PhaseId = 'P0' | 'P1' | 'P2' | 'P3';

export interface Phase {
  id: PhaseId;
  label: string;
  /** Zeitraum im Klartext, so wie er im Regelwerk steht. */
  span: string;
  /** Erste Woche der Phase, ab 0 gezählt. */
  fromWeek: number;
  /** Letzte Woche der Phase, ab 0 gezählt. Null in der offenen Phase. */
  toWeek: number | null;
  /** Laufminuten je 10 Tage am Anfang der Phase. */
  fromMinutes: number;
  /** Laufminuten je 10 Tage am Ende der Phase. */
  toMinutes: number;
  /** Die Phase hat kein Enddatum. Das Volumen hat trotzdem eine Obergrenze. */
  open: boolean;
  focus: string;
}

/*
 * Wochen statt Monate, weil der Zyklus in Tagen läuft und ein Monat keine
 * ganze Zahl von Zyklen ist. Monat 3 beginnt in Woche 9, Monat 7 in Woche 27,
 * Monat 11 in Woche 44 — jeweils aufgerundet auf den Wochenbeginn.
 */
export const PHASES: Phase[] = [
  {
    id: 'P0',
    label: 'Aufbau der Grundlage',
    span: 'Woche 1–8',
    fromWeek: 0,
    toWeek: 7,
    fromMinutes: 300,
    toMinutes: 420,
    open: false,
    focus:
      'Gewebe an regelmäßiges Laufen gewöhnen. Intervalle laufen von Anfang an mit, aber kurz und wenige.',
  },
  {
    id: 'P1',
    label: 'Volumen',
    span: 'Monat 3–6',
    fromWeek: 8,
    toWeek: 25,
    fromMinutes: 420,
    toMinutes: 600,
    open: false,
    focus: 'Die Zone-2-Minuten tragen den Zuwachs. Die Bahnstufen wandern nach oben.',
  },
  {
    id: 'P2',
    label: 'Belastbarkeit',
    span: 'Monat 7–10',
    fromWeek: 26,
    toWeek: 43,
    fromMinutes: 600,
    toMinutes: 750,
    open: false,
    focus: 'Longrun und Schwelle bekommen Gewicht, ohne dass der Grundlagenanteil fällt.',
  },
  {
    id: 'P3',
    label: 'Erhalt und Ausbau',
    span: 'ab Monat 11',
    fromWeek: 44,
    toWeek: null,
    fromMinutes: 700,
    toMinutes: 850,
    open: true,
    focus:
      'Kein Ende und kein Tapering. Das Volumen läuft die Spanne hoch und wird dort gehalten.',
  },
];

/** Ein Makrozyklus sind zehn Tage — zwei Zyklen der Fünf-Tage-Rotation. */
export const MACROCYCLE_DAYS = 10;
/** Ein Zyklus sind fünf Tage. */
export const CYCLE_DAYS = 5;
/** Jeder vierte Zyklus ist ein Deload. */
export const DELOAD_EVERY_CYCLES = 4;

/** Höchstens 8 % mehr Laufminuten je 10 Tage. */
export const MAX_GROWTH = 0.08;
/** In P0 zusätzlich: eine einzelne Einheit wächst um höchstens 10 Minuten. */
export const P0_MAX_SESSION_GROWTH = 10;

export function phaseForWeek(week: number): Phase {
  for (let i = PHASES.length - 1; i >= 0; i--) {
    if (week >= PHASES[i].fromWeek) return PHASES[i];
  }
  return PHASES[0];
}

/** Woche seit Trainingsbeginn aus dem Makrozyklus-Index. */
export function weekOfMacrocycle(macrocycleIndex: number): number {
  return Math.floor((macrocycleIndex * MACROCYCLE_DAYS) / 7);
}

export type LimitedBy = 'start' | 'phase' | 'wachstum' | 'phasenwechsel' | 'deload';

export interface VolumeTarget {
  phase: Phase;
  week: number;
  /** Was die Phase an dieser Stelle vorsieht. */
  phaseTarget: number;
  /** Was die Wachstumsgrenze zulässt. Null ohne Vorgeschichte. */
  growthCeiling: number | null;
  /** Die Laufminuten, die tatsächlich geplant werden. */
  runMinutes: number;
  limitedBy: LimitedBy;
  /** Ein Satz, der im Coach als Begründung stehen kann. */
  reason: string;
}

/**
 * Das Laufminutenziel für einen Makrozyklus.
 *
 * `previousRunMinutes` sind die tatsächlich gelaufenen Minuten der zehn Tage
 * davor. Ohne sie gibt es keine Wachstumsgrenze, weil es nichts gibt, wovon
 * etwas wachsen könnte — dann gilt der Phaseneinstieg.
 *
 * Der Deload steht hier bewusst nicht drin. Er gilt für einen Zyklus, nicht für
 * einen Makrozyklus; ihn auf das Zehn-Tage-Ziel anzuwenden würde doppelt so viel
 * wegnehmen wie gemeint. Er greift erst in der Verteilung auf die Tage.
 */
export function targetFor(input: {
  macrocycleIndex: number;
  previousRunMinutes: number | null;
  /** Wahr im Makrozyklus, in dem die Phase wechselt. */
  phaseChanging?: boolean;
}): VolumeTarget {
  const week = weekOfMacrocycle(input.macrocycleIndex);
  const phase = phaseForWeek(week);

  const spanWeeks = phase.toWeek == null ? 20 : phase.toWeek - phase.fromWeek;
  const progress = spanWeeks <= 0 ? 1 : Math.min(1, (week - phase.fromWeek) / spanWeeks);
  const phaseTarget = Math.round(
    phase.fromMinutes + (phase.toMinutes - phase.fromMinutes) * progress,
  );

  const previous = input.previousRunMinutes;
  // Eine Obergrenze, die man durch Runden überschreiten kann, ist keine.
  const growthCeiling = previous != null ? Math.floor(previous * (1 + MAX_GROWTH)) : null;

  if (previous == null || growthCeiling == null) {
    return {
      phase,
      week,
      phaseTarget,
      growthCeiling: null,
      runMinutes: phase.fromMinutes,
      limitedBy: 'start',
      reason: `Noch keine zehn Tage Vorgeschichte. Einstieg in ${phase.id} mit ${phase.fromMinutes} Laufminuten.`,
    };
  }

  /*
   * Im Wechselmakrozyklus bleibt das Volumen stehen. Ein Phasenwechsel ändert
   * die Art des Trainings; beides gleichzeitig zu ändern macht hinterher
   * unmöglich zu sagen, woran eine Überlastung lag.
   */
  if (input.phaseChanging) {
    return {
      phase,
      week,
      phaseTarget,
      growthCeiling,
      runMinutes: previous,
      limitedBy: 'phasenwechsel',
      reason: `Phasenwechsel auf ${phase.id}: die Laufminuten bleiben bei ${previous}. Erst die neue Struktur setzen, dann wieder steigern.`,
    };
  }

  /*
   * `open` heißt: die Phase hat **kein Ende**, nicht das Volumen hat keine
   * Grenze. Vorher stand hier das Gegenteil — in P3 wuchs das Ziel entlang der
   * 8-%-Grenze immer weiter, weil kein Phasenziel mehr bremste. Über genug
   * Makrozyklen ergab das 2846 Laufminuten je zehn Tage, also 47 Stunden. Eine
   * Grenze, die man durch Warten überschreiten kann, ist keine.
   *
   * P3 läuft die Spanne 700–850 hoch und bleibt dort. Weiter wachsen kann das
   * Volumen nur, wenn jemand die Tabelle ändert — bewusst und sichtbar.
   */
  const wanted = phaseTarget;

  if (wanted > growthCeiling) {
    return {
      phase,
      week,
      phaseTarget,
      growthCeiling,
      runMinutes: growthCeiling,
      limitedBy: 'wachstum',
      reason: `${phase.id} sähe hier ${wanted} Laufminuten vor, gewachsen wird aber höchstens 8 % — also ${growthCeiling}. Das Ziel verschiebt sich nach hinten, die Grenze wird nicht gedehnt.`,
    };
  }

  return {
    phase,
    week,
    phaseTarget,
    growthCeiling,
    runMinutes: wanted,
    limitedBy: 'phase',
    reason: `${phase.id} — ${phase.label}: ${wanted} Laufminuten in zehn Tagen. Die Wachstumsgrenze läge bei ${growthCeiling} und bremst hier nicht.`,
  };
}

/** Ob der Zyklus mit diesem Index ein Deload ist. Gezählt ab 0. */
export function isDeloadCycle(cycleIndex: number): boolean {
  return cycleIndex > 0 && (cycleIndex + 1) % DELOAD_EVERY_CYCLES === 0;
}

/** Wie viele Zyklen noch bis zum nächsten Deload. */
export function cyclesUntilDeload(cycleIndex: number): number {
  for (let i = 1; i <= DELOAD_EVERY_CYCLES; i++) {
    if (isDeloadCycle(cycleIndex + i)) return i;
  }
  return DELOAD_EVERY_CYCLES;
}
