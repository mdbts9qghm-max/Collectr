import type { Advice, DayContext } from './types.ts';

const h = (hours: number, minutes = 0) => hours * 60 + minutes;

/**
 * Caffeine timing.
 *
 * Half-life is roughly five to six hours, individually three to nine. After six
 * hours about half is still active, after ten to twelve still a quarter. So
 * **the hour decides, not the amount** — and that is the whole reason this table
 * exists instead of a cup counter.
 */

export interface CaffeineWindow {
  /** Latest intake, in minutes from midnight. May exceed 1440 past midnight. */
  cutoff: number;
  label: string;
  why: string;
}

/**
 * The cutoffs for a cycle day.
 *
 * The night-shift day has **two** of them, not one continuous limit: a morning
 * cutoff so the 15:00 nap works, and a second window during the shift that ends
 * at 01:00 so the day sleep works. Collapsing them into one number would either
 * wreck the nap or ban caffeine exactly when it is most useful.
 */
export function caffeineWindows(ctx: DayContext): CaffeineWindow[] {
  if (ctx.isVShift) {
    return [
      { cutoff: h(14), label: 'Letzte Gabe 14:00', why: 'Bett um 22:15 — mindestens acht Stunden Abstand.' },
    ];
  }

  switch (ctx.cycleDay) {
    case 1:
      return [
        { cutoff: h(16), label: 'Letzte Gabe 16:00', why: 'Bett um 22:15, mindestens sechs Stunden Abstand.' },
      ];
    case 2:
      return [
        {
          cutoff: h(10),
          label: 'Vormittags bis 10:00, dann Pause',
          why: 'Der Vorschlaf um 15:00 muss gelingen — er ist die halbe Miete für die Nacht.',
        },
        {
          cutoff: h(25),
          label: 'Ab 19:00 wieder, letzte Gabe 01:00',
          why: 'Der Hauptschlaf beginnt um 08:00; nach 01:00 kaufst du Wachheit auf Kosten des Tagschlafs.',
        },
      ];
    case 3:
      return [
        {
          cutoff: h(8),
          label: 'Nach dem Aufwachen um 14:00 keins mehr',
          why: 'Bett um 22:45, und der Schlafdruck ist nach sechs Stunden Tagschlaf ohnehin niedrig.',
        },
      ];
    case 4:
    case 5:
      return [
        { cutoff: h(16), label: 'Letzte Gabe 16:00', why: 'Bett zwischen 22:15 und 22:45.' },
      ];
    default:
      return [];
  }
}

/** Minutes before a cutoff at which the app reminds. */
export const REMINDER_LEAD_MINUTES = 30;

export interface Countdown {
  /** The next cutoff still ahead today, or null when all have passed. */
  next: CaffeineWindow | null;
  minutesLeft: number | null;
  /** True inside the reminder window. */
  remindNow: boolean;
  /** True when every cutoff for the day has passed. */
  closed: boolean;
}

export function caffeineCountdown(windows: CaffeineWindow[], nowMinutes: number): Countdown {
  const ahead = windows.filter((w) => w.cutoff > nowMinutes).sort((a, b) => a.cutoff - b.cutoff);
  const next = ahead[0] ?? null;
  if (!next) return { next: null, minutesLeft: null, remindNow: false, closed: windows.length > 0 };
  const left = next.cutoff - nowMinutes;
  return { next, minutesLeft: left, remindNow: left <= REMINDER_LEAD_MINUTES, closed: false };
}

export function caffeineAdvice(ctx: DayContext): Advice[] {
  const out: Advice[] = caffeineWindows(ctx).map((w, i) => ({
    id: `caffeine-${ctx.cycleDay}-${i}`,
    track: 'caffeine' as const,
    from: Math.max(0, w.cutoff - 120),
    to: w.cutoff,
    label: w.label,
    why: w.why,
    priority: 'normal' as const,
  }));

  out.push({
    id: 'caffeine-no-wake',
    track: 'caffeine',
    from: 0,
    to: 60,
    label: 'Erste 60 Minuten nach dem Aufwachen ohne Koffein',
    why: 'Der natürliche Cortisolgipfel macht das schon; frühes Koffein baut nur Toleranz auf.',
    priority: 'normal',
    avoid: true,
  });

  if (ctx.cycleDay === 2 && !ctx.isVShift) {
    out.push({
      id: 'caffeine-front-load',
      track: 'caffeine',
      from: h(19),
      to: h(25),
      label: 'Schwerpunkt auf die erste Diensthälfte',
      why: 'Koffein zwischen 19:00 und 01:00 wirkt genau dann, wenn die zirkadiane Wachheit fällt.',
      priority: 'normal',
    });
  }

  return out;
}

/**
 * The coffee nap, offered only where it fits.
 *
 * Caffeine at 14:45, asleep from 15:00: the effect arrives as the alarm goes at
 * 17:30. It only works for someone who falls asleep quickly — for anyone else it
 * costs them the nap, which is a far worse trade than a groggy first hour.
 */
export const COFFEE_NAP: Advice = {
  id: 'caffeine-nap',
  track: 'caffeine',
  from: h(14, 45),
  to: h(15),
  label: 'Kaffee-Nap: Koffein 14:45, direkt danach hinlegen',
  why: 'Die Wirkung setzt beim Aufwachen um 17:30 ein. Nur sinnvoll, wenn du schnell einschläfst — sonst kostet es dich den Vorschlaf.',
  priority: 'normal',
};
