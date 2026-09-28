import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Die Kernlogik rechnet mit Europe/Berlin. Die Tests laufen bewusst in einer anderen
    // Prozess-Zeitzone, damit versehentliche Abhängigkeiten von der Systemzeitzone auffallen.
    env: { TZ: 'America/New_York' },
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts', 'src/app/**/*.ts', 'src/data/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/core/fixtures/**'],
    },
  },
})
