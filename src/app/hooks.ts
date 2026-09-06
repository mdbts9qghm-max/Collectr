import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../data/store.ts';
import type { AppData } from '../data/store.ts';
import {
  buildDayView,
  buildIndexes,
  buildMetrics,
  buildScore,
  buildWeek,
  buildCyclePlan,
  makeDayContextFn,
} from '../data/derived.ts';
import { today as todayIso } from '../domain/date.ts';
import type { ISODate } from '../domain/types.ts';

/** The raw persisted data, as one object the pure domain functions can take. */
export function useData(): AppData {
  // useShallow is required: the selector builds a new object each call, and a
  // reference-equality check would re-render on every store update.
  return useStore(
    useShallow((s) => ({
      settings: s.settings,
      shiftTypes: s.shiftTypes,
      shifts: s.shifts,
      sessions: s.sessions,
      exercises: s.exercises,
      habits: s.habits,
      habitEntries: s.habitEntries,
      tasks: s.tasks,
      goals: s.goals,
      records: s.records,
      checkIns: s.checkIns,
      reviews: s.reviews,
      plans: s.plans,
    })),
  );
}

export function useIndexes() {
  const data = useData();
  return useMemo(() => buildIndexes(data), [data]);
}

export function useDayView(date: ISODate) {
  const data = useData();
  const idx = useIndexes();
  return useMemo(() => buildDayView(data, idx, date), [data, idx, date]);
}

export function useWeek(anchor: ISODate) {
  const data = useData();
  const idx = useIndexes();
  return useMemo(() => buildWeek(data, idx, anchor), [data, idx, anchor]);
}

/** The cycle plan around a date: the current rotation plus the next two. */
export function useCyclePlan(anchor: ISODate, cycles = 3) {
  const data = useData();
  const idx = useIndexes();
  return useMemo(() => buildCyclePlan(data, idx, anchor, cycles), [data, idx, anchor, cycles]);
}

export function useMetrics(date: ISODate) {
  const data = useData();
  return useMemo(() => buildMetrics(data, date), [data, date]);
}

export function useHybridScore(date: ISODate) {
  const data = useData();
  const idx = useIndexes();
  const metrics = useMetrics(date);
  return useMemo(() => buildScore(data, idx, date, metrics), [data, idx, date, metrics]);
}

export function useDayContext(date: ISODate) {
  const idx = useIndexes();
  return useMemo(() => makeDayContextFn(idx, date), [idx, date]);
}

/**
 * The current date, refreshed when the app regains focus. A PWA left open
 * overnight must not keep showing yesterday.
 */
export function useToday(): ISODate {
  const [date, setDate] = useState(todayIso());
  useEffect(() => {
    const check = () => {
      const now = todayIso();
      setDate((prev) => (prev === now ? prev : now));
    };
    const timer = window.setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, []);
  return date;
}

/** Applies the theme setting, following the system when set to 'system'. */
export function useTheme(): void {
  const theme = useStore((s) => s.settings.theme);
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      if (theme === 'system') {
        const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.setAttribute('data-theme', dark ? 'dark' : 'light');
      } else {
        root.setAttribute('data-theme', theme);
      }
      const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg || '#0a0b0d');
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (theme === 'system') {
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [theme]);
}

/** Persists a small piece of view state (selected tab, range) per screen. */
export function useLocalState<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      return (localStorage.getItem(`ha:${key}`) as T | null) ?? initial;
    } catch {
      return initial;
    }
  });
  const set = (v: T) => {
    setValue(v);
    try {
      localStorage.setItem(`ha:${key}`, v);
    } catch {
      // Private browsing can block storage; the choice simply won't persist.
    }
  };
  return [value, set];
}
