export const APP_VERSION = '1.0.0';
export const APP_NAME = 'Hybrid Athlete OS';

/** Injected at build time — see vite.config.ts. */
declare const __BUILD_TIME__: string;
declare const __BUILD_REV__: string;

export const BUILD_TIME: string = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '';
export const BUILD_REV: string = typeof __BUILD_REV__ === 'string' ? __BUILD_REV__ : 'dev';

/** "06.09.2026, 18:24" — the stamp shown in Settings. */
export function formatBuildTime(): string {
  if (!BUILD_TIME) return 'unbekannt';
  const d = new Date(BUILD_TIME);
  if (Number.isNaN(d.getTime())) return 'unbekannt';
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
