/** Sortable, collision-resistant id. Prefix makes exported JSON readable. */
export function makeId(prefix: string): string {
  const time = Date.now().toString(36);
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${time}${rand}`;
}
