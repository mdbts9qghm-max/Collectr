import type { ISODate } from '../domain/types.ts';

const KEY = 'ha:checkin-seen';

/**
 * Remembers that the check-in was offered today, so it opens once in the
 * morning and never again — skipping it must not turn into nagging.
 */
export function markCheckInSeen(date: ISODate): void {
  try {
    localStorage.setItem(KEY, date);
  } catch {
    // Private browsing blocks storage; the prompt then reappears next launch,
    // which is a smaller problem than crashing on open.
  }
}

export function wasCheckInSeen(date: ISODate): boolean {
  try {
    return localStorage.getItem(KEY) === date;
  } catch {
    return false;
  }
}
