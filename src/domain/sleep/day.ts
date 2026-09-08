import type { Advice, DayContext, Track } from './types.ts';
import { lightPlan } from './light.ts';
import { caffeineAdvice, caffeineWindows, caffeineCountdown, COFFEE_NAP } from './caffeine.ts';
import type { Countdown } from './caffeine.ts';
import { sleepAdvice } from './rules.ts';
import { nutritionAdvice } from './nutrition.ts';

/**
 * Everything the day timeline needs, in one call.
 *
 * The four tracks are assembled together rather than fetched separately, so the
 * screen cannot accidentally show light advice for one cycle day next to
 * caffeine advice for another.
 */

export interface SleepWindow {
  start: number;
  end: number;
  targetMinutes: number;
  nap: { start: number; end: number } | null;
}

export interface SleepDay {
  ctx: DayContext;
  advice: Advice[];
  byTrack: Record<Track, Advice[]>;
  countdown: Countdown;
  /** The two reminders with the largest effect, if the day has them. */
  highPriority: Advice[];
}

export function buildSleepDay(
  ctx: DayContext,
  sleep: SleepWindow | null,
  nowMinutes: number,
  options: { offerCoffeeNap?: boolean } = {},
): SleepDay {
  const advice: Advice[] = [
    ...sleepFromWindow(sleep, ctx),
    ...sleepAdvice(ctx),
    ...lightPlan(ctx),
    ...caffeineAdvice(ctx),
    ...nutritionAdvice(ctx),
  ];
  if (options.offerCoffeeNap && ctx.cycleDay === 2 && !ctx.isVShift) advice.push(COFFEE_NAP);

  const byTrack = {
    sleep: advice.filter((a) => a.track === 'sleep'),
    light: advice.filter((a) => a.track === 'light'),
    caffeine: advice.filter((a) => a.track === 'caffeine'),
    food: advice.filter((a) => a.track === 'food'),
  };

  return {
    ctx,
    advice: advice.sort((a, b) => a.from - b.from),
    byTrack,
    countdown: caffeineCountdown(caffeineWindows(ctx), nowMinutes),
    highPriority: advice.filter((a) => a.priority === 'high'),
  };
}

/** The planned sleep itself, so it appears on the timeline like everything else. */
function sleepFromWindow(sleep: SleepWindow | null, ctx: DayContext): Advice[] {
  if (!sleep) return [];
  const out: Advice[] = [
    {
      id: 'sleep-window',
      track: 'sleep',
      // A window that runs past midnight is drawn as one bar, not two.
      from: sleep.start,
      to: sleep.end > sleep.start ? sleep.end : sleep.end + 1440,
      label: `Schlaf ${clock(sleep.start)}–${clock(sleep.end)}`,
      why: `${(sleep.targetMinutes / 60).toFixed(1)} h Soll für diesen Zyklustag. Feste Ankerzeiten wirken stärker als hohe Gesamtdauer.`,
      priority: 'normal',
    },
  ];
  if (sleep.nap) {
    out.push({
      id: 'sleep-nap-window',
      track: 'sleep',
      from: sleep.nap.start,
      to: sleep.nap.end,
      label: `Vorschlaf ${clock(sleep.nap.start)}–${clock(sleep.nap.end)}`,
      why: 'Schlafverlängerung vor dem Dienst und der prophylaktische Vorschlaf sind die zwei wirksamsten Maßnahmen gegen Nachtdienstmüdigkeit.',
      /*
       * The window itself is never the high-priority item — the alarm that
       * belongs to it is. Marking both would put the same instruction twice into
       * the card that is supposed to hold exactly the two things that matter
       * most today.
       */
      priority: 'normal',
    });
  }
  return out;
}

function clock(minutes: number): string {
  const w = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(w / 60)).padStart(2, '0')}:${String(w % 60).padStart(2, '0')}`;
}
