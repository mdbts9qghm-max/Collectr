import type { ISODate } from '../types.ts';
import { diffDays } from '../date.ts';

/**
 * Herzfrequenzzonen in Schlägen — fest, nicht gerechnet.
 *
 * Die Zonen sind gemessen und stehen als Zahlen fest. Der Coach rechnet sie
 * nicht aus einer Maximalherzfrequenz hoch, weil eine geschätzte Maximalfrequenz
 * ein Schätzwert ist, der jede darauf gebaute Zone zum Schätzwert macht.
 *
 * Sie ändern sich nur über den Nachkalibrierungstest, und auch dann nur, wenn
 * der Athlet den Vorschlag annimmt. Die App verschiebt keine Zonen im
 * Hintergrund: eine Zone, die sich unbemerkt verschiebt, macht jeden Vergleich
 * mit den Wochen davor wertlos.
 */

export type ZoneNumber = 1 | 2 | 3 | 4 | 5;

export interface ZoneRange {
  zone: ZoneNumber;
  lower: number;
  upper: number;
  label: string;
  purpose: string;
  /** Wie es sich anfühlen muss — der Gegencheck zum Brustgurt. */
  feel: string;
}

export interface ZoneBounds {
  /** Untergrenzen und Obergrenzen je Zone, in Schlägen. */
  ranges: [number, number][];
  source: 'fest' | 'test';
  /** Wann diese Grenzen angenommen wurden. */
  acceptedOn: ISODate | null;
}

const META: { label: string; purpose: string; feel: string }[] = [
  {
    label: 'Zone 1',
    purpose: 'Aufwärmen, Auslaufen, aktive Erholung',
    feel: 'Unterhaltung in ganzen Sätzen, du könntest jederzeit schneller.',
  },
  {
    label: 'Zone 2',
    purpose: 'Aerobe Grundlage — hier entsteht der Großteil der Anpassung',
    feel: 'Du kannst sprechen, willst aber nicht singen. Nach der Einheit könntest du dasselbe nochmal laufen.',
  },
  {
    label: 'Zone 3',
    purpose: 'Der Bereich dazwischen — selten geplant, oft aus Versehen gelaufen',
    feel: 'Sätze werden kurz. Zu hart für Grundlage, zu weich für einen Reiz.',
  },
  {
    label: 'Zone 4',
    purpose: 'Schwelle — Tempodauerlauf, längere Intervalle',
    feel: 'Nur noch einzelne Worte. Kontrolliert unangenehm, nicht am Limit.',
  },
  {
    label: 'Zone 5',
    purpose: 'VO2max — kurze harte Intervalle',
    feel: 'Kein Sprechen mehr. Das Ende des Intervalls ist in Sicht, sonst geht es nicht.',
  },
];

/** Die gemessenen Zonen. Beats, keine Prozente. */
export const FIXED_ZONES: ZoneBounds = {
  ranges: [
    [114, 138],
    [139, 160],
    [161, 175],
    [176, 190],
    [191, 205],
  ],
  source: 'fest',
  acceptedOn: null,
};

/**
 * Die Schwellenherzfrequenz, die zu diesen Zonen gehört: die Obergrenze von
 * Zone 3, also der Punkt, an dem Zone 4 beginnt. Sie ist der Bezugswert für den
 * Nachkalibrierungstest.
 */
export function impliedThreshold(bounds: ZoneBounds): number {
  return bounds.ranges[2][1];
}

export function zoneRanges(bounds: ZoneBounds = FIXED_ZONES): ZoneRange[] {
  return bounds.ranges.map(([lower, upper], i) => ({
    zone: (i + 1) as ZoneNumber,
    lower,
    upper,
    ...META[i],
  }));
}

export function zoneFor(hr: number, bounds: ZoneBounds = FIXED_ZONES): ZoneNumber | null {
  for (let i = 0; i < bounds.ranges.length; i++) {
    const [lower, upper] = bounds.ranges[i];
    if (hr >= lower && hr <= upper) return (i + 1) as ZoneNumber;
  }
  return null;
}

export function formatZone(zone: ZoneNumber, bounds: ZoneBounds = FIXED_ZONES): string {
  const [lower, upper] = bounds.ranges[zone - 1];
  return `Z${zone} ${lower}–${upper}`;
}

/**
 * Die Zonen, die als Grundlage zählen.
 *
 * **Abweichung vom Wortlaut, bewusst.** Die Regel sagt „Zone 2 mindestens 80 %
 * der Laufminuten“. Wörtlich genommen fielen damit Aufwärmen und Auslaufen
 * einer korrekt gelaufenen Intervalleinheit gegen die Regel — beides liegt in
 * Zone 1. Eine Regel, die richtiges Aufwärmen bestraft, misst nicht, was sie
 * messen soll. Gezählt wird deshalb Zone 1 und 2 zusammen gegen Zone 3 bis 5.
 * Der Sinn der Regel — der harte Anteil bleibt klein — bleibt dabei erhalten.
 */
export const BASE_ZONES: ZoneNumber[] = [1, 2];

export function isBaseZone(zone: ZoneNumber): boolean {
  return BASE_ZONES.includes(zone);
}

/* ------------------------------------------------------------------ *
 * Nachkalibrierung
 * ------------------------------------------------------------------ */

/** Alle 10 bis 12 Wochen. Früher misst man Tagesform, nicht Anpassung. */
export const RETEST_DUE_DAYS = 70;
export const RETEST_OVERDUE_DAYS = 84;

export const TEST_PROTOCOL = {
  title: '30-Minuten-Test',
  steps: [
    'Ausgeruht antreten: kein harter Lauf in den 48 Stunden davor, normale Schicht, normal geschlafen.',
    '15 Minuten locker einlaufen, Zone 1 bis unteres Zone 2.',
    '30 Minuten so schnell wie du gleichmäßig durchhältst. Allein, flache Strecke, nicht im Wettkampf.',
    'Die Durchschnittsherzfrequenz der letzten 20 Minuten ist dein Schwellenwert.',
    '10 Minuten auslaufen.',
  ],
  caveat:
    'Der Test misst nur dann etwas, wenn er gleichmäßig gelaufen wurde. Ein zu schneller Start und ein Einbruch am Ende ergeben einen zu niedrigen Wert.',
} as const;

export interface RetestState {
  /** Tage seit dem letzten angenommenen Test, null wenn nie getestet. */
  daysSince: number | null;
  status: 'nie' | 'aktuell' | 'faellig' | 'ueberfaellig';
  message: string;
}

export function retestState(bounds: ZoneBounds, today: ISODate): RetestState {
  if (!bounds.acceptedOn) {
    return {
      daysSince: null,
      status: 'nie',
      message:
        'Noch kein Test gelaufen. Die Zonen stehen auf den gemessenen Werten — das reicht, bis sich die Form spürbar ändert.',
    };
  }
  const daysSince = diffDays(today, bounds.acceptedOn);
  if (daysSince >= RETEST_OVERDUE_DAYS) {
    return {
      daysSince,
      status: 'ueberfaellig',
      message: `Letzter Test vor ${daysSince} Tagen. Über zwölf Wochen alt — die Zonen bilden deine Form vermutlich nicht mehr ab.`,
    };
  }
  if (daysSince >= RETEST_DUE_DAYS) {
    return {
      daysSince,
      status: 'faellig',
      message: `Letzter Test vor ${daysSince} Tagen. Ein neuer Test wäre jetzt sinnvoll.`,
    };
  }
  return {
    daysSince,
    status: 'aktuell',
    message: `Letzter Test vor ${daysSince} Tagen. Der nächste in ${RETEST_DUE_DAYS - daysSince} Tagen.`,
  };
}

export interface ZoneProposal {
  measuredThreshold: number;
  previousThreshold: number;
  delta: number;
  proposed: ZoneBounds;
  current: ZoneBounds;
  /** Zeile je Zone: was sich ändern würde. */
  changes: { zone: ZoneNumber; from: string; to: string; shift: number }[];
  verdict: string;
  /** Wahr, wenn die Verschiebung so klein ist, dass sie im Messrauschen liegt. */
  withinNoise: boolean;
}

/** Unter drei Schlägen ist eine Verschiebung Tagesform, keine Anpassung. */
export const NOISE_BEATS = 3;

/**
 * Ein Vorschlag, kein Beschluss.
 *
 * Die Grenzen werden proportional zum gemessenen Schwellenwert skaliert. Damit
 * bleiben die Zonenbreiten im Verhältnis genau so, wie sie gemessen wurden — es
 * wird nur der ganze Satz verschoben, nicht seine Form verändert.
 */
export function proposeZones(
  measuredThreshold: number,
  current: ZoneBounds,
  today: ISODate,
): ZoneProposal {
  const previousThreshold = impliedThreshold(current);
  const factor = measuredThreshold / previousThreshold;
  const scaled = current.ranges.map(
    ([lower, upper]) => [Math.round(lower * factor), Math.round(upper * factor)] as [number, number],
  );

  // Keine Lücken und keine Überlappungen: jede Zone beginnt einen Schlag über
  // der vorigen, damit zoneFor() für jede ganze Zahl eine Antwort hat.
  for (let i = 1; i < scaled.length; i++) {
    scaled[i][0] = scaled[i - 1][1] + 1;
    if (scaled[i][1] <= scaled[i][0]) scaled[i][1] = scaled[i][0] + 1;
  }
  // Der Vorschlag muss den gemessenen Wert selbst treffen.
  scaled[2][1] = measuredThreshold;
  scaled[3][0] = measuredThreshold + 1;
  if (scaled[2][0] > scaled[2][1]) scaled[2][0] = scaled[2][1] - 1;
  if (scaled[3][1] <= scaled[3][0]) scaled[3][1] = scaled[3][0] + 1;

  const proposed: ZoneBounds = { ranges: scaled, source: 'test', acceptedOn: today };
  const delta = measuredThreshold - previousThreshold;

  const changes = scaled.map(([lower, upper], i) => ({
    zone: (i + 1) as ZoneNumber,
    from: `${current.ranges[i][0]}–${current.ranges[i][1]}`,
    to: `${lower}–${upper}`,
    shift: lower - current.ranges[i][0],
  }));

  const withinNoise = Math.abs(delta) < NOISE_BEATS;
  const verdict = withinNoise
    ? `Schwelle ${measuredThreshold} statt ${previousThreshold} — ${Math.abs(delta)} Schläge Unterschied liegen im Rauschen. Lass die Zonen, wie sie sind.`
    : delta > 0
      ? `Schwelle ${measuredThreshold} statt ${previousThreshold}: ${delta} Schläge höher. Bei gleichem Puls läufst du jetzt schneller — die Zonen dürfen mitwandern.`
      : `Schwelle ${measuredThreshold} statt ${previousThreshold}: ${Math.abs(delta)} Schläge tiefer. Das kann Form, aber auch Ermüdung, Hitze oder ein schlecht eingeteilter Test sein. Im Zweifel erst wiederholen, dann übernehmen.`;

  return {
    measuredThreshold,
    previousThreshold,
    delta,
    proposed,
    current,
    changes,
    verdict,
    withinNoise,
  };
}
