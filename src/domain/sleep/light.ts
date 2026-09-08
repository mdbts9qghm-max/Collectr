import type { Advice, DayContext } from './types.ts';

const h = (hours: number, minutes = 0) => hours * 60 + minutes;

/**
 * The light plan.
 *
 * The rule underneath every row: **bright light at the end of the waking phase
 * shifts the internal clock later, bright light at the beginning shifts it
 * earlier.** On night duty both directions are wanted, at different hours, which
 * is why this table cannot be reduced to "get more daylight".
 */
export function lightPlan(ctx: DayContext): Advice[] {
  const { cycleDay, isVShift } = ctx;

  if (isVShift || cycleDay === 4 || cycleDay === 5) {
    return [
      {
        id: 'light-free-morning',
        track: 'light',
        from: h(6, 30),
        to: h(7, 30),
        label: 'Tageslicht innerhalb einer Stunde nach dem Aufstehen',
        why: 'Morgenlicht hält die Ankerzeit fest — das ist die eine Gewohnheit, die die Rotation überhaupt erträglich macht.',
        priority: 'normal',
      },
    ];
  }

  switch (cycleDay) {
    case 1:
      return [
        {
          id: 'light-day-wake',
          track: 'light',
          from: h(5, 30),
          to: h(7),
          label: 'Helles Licht, möglichst Tageslicht',
          why: 'Licht am Beginn der Wachphase zieht die innere Uhr nach vorne und verankert das frühe Aufstehen.',
          priority: 'normal',
        },
        {
          id: 'light-day-evening',
          track: 'light',
          from: h(20, 30),
          to: h(22, 15),
          label: 'Gedimmt und warm, Bildschirme reduziert',
          why: 'Helles Licht am Abend verschiebt die innere Uhr nach hinten und kostet dich das Einschlafen um 22:15.',
          priority: 'normal',
        },
      ];

    case 2:
      return [
        {
          id: 'light-night-morning',
          track: 'light',
          from: h(7),
          to: h(10),
          label: 'Tageslicht, möglichst draußen',
          why: 'Der Vormittag ist die letzte Gelegenheit, den Rhythmus zu stabilisieren, bevor der Dienst ihn verschiebt.',
          priority: 'normal',
        },
        {
          id: 'light-night-predip',
          track: 'light',
          from: h(14),
          to: h(15),
          label: 'Licht dimmen vor dem Vorschlaf',
          why: 'Um 15:00 einzuschlafen gelingt nur, wenn das Licht davor schon unten ist.',
          priority: 'normal',
        },
        {
          id: 'light-night-bright',
          track: 'light',
          from: h(19),
          to: h(26),
          label: 'So hell wie möglich am Arbeitsplatz',
          why: 'Helles Licht in der ersten Diensthälfte hält die Wachheit, wenn die zirkadiane Kurve fällt.',
          priority: 'normal',
        },
        {
          id: 'light-night-dim',
          track: 'light',
          from: h(28),
          to: h(31),
          label: 'Licht bewusst reduzieren',
          why: 'Licht nach 04:00 schiebt die innere Uhr nach hinten und erschwert die Rückkehr zum Nachtschlaf an den freien Tagen.',
          priority: 'normal',
          avoid: true,
        },
      ];

    case 3:
      return [
        {
          id: 'light-sleepday-sunglasses',
          track: 'light',
          from: h(6, 45),
          to: h(8),
          label: 'Sonnenbrille auf dem Heimweg — auch bei Bewölkung',
          why: 'Die wirksamste Einzelmaßnahme für den Tagschlaf: Morgenlicht nach der Nachtschicht schiebt die Uhr in die falsche Richtung und unterdrückt Melatonin genau vor dem geplanten Schlaf.',
          priority: 'high',
        },
        {
          id: 'light-sleepday-dark',
          track: 'light',
          from: h(8),
          to: h(14),
          label: 'Vollständige Verdunklung',
          why: 'Tagschlaf ist ohnehin kürzer und REM-ärmer — jedes Restlicht kostet zusätzlich Qualität.',
          priority: 'normal',
        },
        {
          id: 'light-sleepday-return',
          track: 'light',
          from: h(14),
          to: h(17),
          label: 'Helles Licht, Bewegung draußen',
          why: 'Licht am Nachmittag holt dich zurück in den Nachtrhythmus, statt die Verschiebung festzuschreiben.',
          priority: 'normal',
        },
      ];

    default:
      return [];
  }
}
