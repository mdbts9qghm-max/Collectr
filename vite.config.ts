import { execSync } from 'node:child_process';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * A build stamp shown in Settings. Without it there is no way to tell from the
 * phone whether a deployment actually arrived — which turns "it doesn't update"
 * into guesswork.
 */
function buildRevision(): string {
  // Vercel provides the commit SHA; locally fall back to git, then to 'dev'.
  const fromCi = process.env.VERCEL_GIT_COMMIT_SHA;
  if (fromCi) return fromCi.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BUILD_REV__: JSON.stringify(buildRevision()),
  },
  // Relative base so the built app works from a subpath (GitHub Pages) as well
  // as from a domain root.
  base: './',
  plugins: [
    react(),
    VitePWA({
      // 'prompt' rather than 'autoUpdate': a silent reload would throw away a
      // half-filled check-in or session log. The app checks in the background
      // and offers the reload; the athlete decides when it happens.
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['favicon.svg', 'icon-180.png'],
      manifest: {
        name: 'Hybrid Athlete OS',
        short_name: 'Hybrid',
        description:
          'Persönliches Trainings-, Habit- und Aufgabensystem für Hybrid Athletes im Schichtdienst.',
        theme_color: '#0a0b0d',
        background_color: '#0a0b0d',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        lang: 'de',
        categories: ['health', 'fitness', 'productivity'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The whole app is precached: it must work with no connection at all,
        // which is the normal state on a night shift.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        /*
         * Required for the "Neu laden" button to work.
         *
         * After SKIP_WAITING the new worker activates, but without clientsClaim
         * it does not take over the already-open page — so `controllerchange`
         * never fires. Any update flow that waits for that event then hangs
         * forever, and the button appears to do nothing. Safari is stricter
         * about this than Chromium, which is why it passed local testing.
         */
        clientsClaim: true,
      },
    }),
  ],
  build: {
    target: 'es2022',
  },
});
