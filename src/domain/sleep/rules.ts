import type { Advice, DayContext } from './types.ts';

const h = (hours: number, minutes = 0) => hours * 60 + minutes;

/** Rules that hold on every day of the rotation. */
export const UNIVERSAL_RULES: { label: string; why: string }[] = [
  {
    label: 'Schlafzimmer 16 bis 19 Grad, dunkel, leise',
    why: 'Der Körper senkt zum Einschlafen die Kerntemperatur — ein kühler Raum hilft dabei, ein warmer arbeitet dagegen.',
  },
  {
    label: 'Kein Alkohol vor Schlafphasen',
    why: 'Alkohol verkürzt die Einschlafzeit, unterdrückt aber den REM-Schlaf und zerlegt die zweite Nachthälfte.',
  },
  {
    label: 'Bildschirme 60 min vorher reduzieren oder Warmfilter',
    why: 'Bildschirmlicht am Abend verschiebt die innere Uhr nach hinten — genau die Richtung, die die Rotation ohnehin erzwingt.',
  },
  {
    label: 'Länger als 20 min wach im Bett: aufstehen',
    why: 'Gedimmtes Licht, ruhige Tätigkeit, zurück bei Müdigkeit. Wachliegen koppelt das Bett an Wachsein.',
  },
];

/** Sleep advice for the day, on top of the universal rules. */
export function sleepAdvice(ctx: DayContext): Advice[] {
  if (ctx.isVShift) return [];

  switch (ctx.cycleDay) {
    case 2:
      return [
        {
          id: 'sleep-nap-alarm',
          track: 'sleep',
          from: h(14, 45),
          to: h(15),
          label: 'Vorschlaf 15:00–17:30 — Wecker fest auf 17:30',
          why: 'Verdunklung und Ohrstöpsel wie beim Nachtschlaf. Nicht verlängern: der Vorschlaf soll die Nacht tragen, nicht den Nachtschlaf ersetzen.',
          priority: 'high',
        },
        {
          id: 'sleep-nap-inertia',
          track: 'sleep',
          from: h(17, 30),
          to: h(17, 45),
          label: '10 bis 15 min gegen die Schlafträgheit einplanen',
          why: 'Helles Licht und ein paar Minuten Bewegung — direkt aus dem Vorschlaf in den Dienst zu gehen kostet die erste Stunde.',
          priority: 'normal',
        },
        {
          id: 'sleep-nap-length',
          track: 'sleep',
          from: h(15),
          to: h(17, 30),
          label: 'Wenn zeitlich möglich: 15:00–16:30 oder 15:00–18:00',
          why: '150 Minuten enden nahe an einer Tiefschlafphase. Beide Alternativen liegen näher an einem Zyklusende und machen das Aufwachen leichter.',
          priority: 'normal',
        },
      ];

    case 3:
      return [
        {
          id: 'sleep-day-immediate',
          track: 'sleep',
          from: h(7),
          to: h(8),
          label: 'Direkt nach Dienstende schlafen, keine Zwischenaktivitäten',
          why: 'Jede wache Stunde nach dem Dienst kostet Tagschlaf, den du nicht nachholen kannst.',
          priority: 'normal',
        },
        {
          id: 'sleep-day-dark',
          track: 'sleep',
          from: h(8),
          to: h(14),
          label: 'Verdunklung, Ohrstöpsel, Handy stumm',
          why: 'Tagschlaf ist störanfälliger als Nachtschlaf — die Umgebung muss das ausgleichen.',
          priority: 'normal',
        },
        {
          id: 'sleep-day-late-bed',
          track: 'sleep',
          from: h(22, 45),
          to: h(23),
          label: 'Abends bewusst später ins Bett — 22:45',
          why: 'Nach sechs Stunden Tagschlaf ist der Schlafdruck niedrig. Zu früh hinlegen erzeugt Einschlafprobleme und zementiert die Verschiebung.',
          priority: 'normal',
        },
      ];

    default:
      return [];
  }
}
