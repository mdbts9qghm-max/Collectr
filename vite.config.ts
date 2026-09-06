import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
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
      },
    }),
  ],
  build: {
    target: 'es2022',
  },
});
