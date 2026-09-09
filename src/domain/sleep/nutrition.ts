import type { Advice, DayContext } from './types.ts';

const h = (hours: number, minutes = 0) => hours * 60 + minutes;

/**
 * Eating around night duty.
 *
 * Glucose tolerance is markedly reduced at night. The same carbohydrate-heavy
 * meal between midnight and 04:00 loads the metabolism harder than it would by
 * day, and makes the second half of the shift sleepier on top of that.
 */
export function nutritionAdvice(ctx: DayContext): Advice[] {
  if (ctx.cycleDay !== 2 || ctx.isVShift) {
    return [
      {
        id: 'food-protein-spread',
        track: 'food',
        from: h(8),
        to: h(20),
        label: 'Eiweiß über die Wachphase verteilen',
        why: 'Gleichmäßig verteilt wird mehr davon für die Reparatur genutzt als in einer großen Mahlzeit.',
        priority: 'normal',
      },
    ];
  }

  return [
    {
      id: 'food-main',
      track: 'food',
      from: h(17, 45),
      to: h(18, 30),
      label: 'Hauptmahlzeit nach dem Vorschlaf',
      why: 'Die größte Mahlzeit gehört vor den Dienst, solange die Glukosetoleranz noch hoch ist.',
      priority: 'normal',
    },
    {
      id: 'food-snack',
      track: 'food',
      from: h(22),
      to: h(23),
      label: 'Kleine, eiweißbetonte Zwischenmahlzeit',
      why: 'Hält die Wachheit, ohne die nächtliche Stoffwechsellage zu belasten.',
      priority: 'normal',
    },
    {
      id: 'food-night-window',
      track: 'food',
      from: h(24),
      to: h(28),
      label: 'Keine große Mahlzeit — nur Kleinigkeiten und Wasser',
      why: 'Zwischen 00:00 und 04:00 ist die Glukosetoleranz am niedrigsten; eine große Mahlzeit hier macht zusätzlich müde.',
      priority: 'normal',
      avoid: true,
    },
    {
      id: 'food-early',
      track: 'food',
      from: h(29),
      to: h(30),
      label: 'Leichte Kleinigkeit, wenn nötig',
      why: 'Genug gegen den Hunger, wenig genug, um den Tagschlaf nicht zu stören.',
      priority: 'normal',
    },
    {
      id: 'food-after-shift',
      track: 'food',
      from: h(31),
      to: h(31, 45),
      label: 'Nach Dienstende klein halten — kein volles Frühstück',
      why: 'Ein volles Frühstück vor dem Tagschlaf verschiebt den Stoffwechsel in den Wachmodus, genau wenn du einschlafen willst.',
      priority: 'normal',
    },
    {
      id: 'food-fluids',
      track: 'food',
      from: h(19),
      to: h(29, 30),
      label: 'Letzte größere Trinkmenge 90 min vor Schlafbeginn',
      why: 'Im Dienst aktiv trinken, aber nicht so, dass der Tagschlaf durch Aufstehen zerlegt wird.',
      priority: 'normal',
    },
  ];
}
