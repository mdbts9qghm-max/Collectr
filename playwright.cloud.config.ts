import { defineConfig, devices } from '@playwright/test'

// Login + Synchronisation gegen einen nachgebildeten Supabase-Server (Anfragen werden im Test abgefangen).
export default defineConfig({
  testDir: './e2e',
  testMatch: /cloud\.spec\.ts/,
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4174',
    ...devices['iPhone 13'],
    browserName: 'chromium',
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: 'npx vite build --outDir dist-cloud && npx vite preview --outDir dist-cloud --port 4174 --strictPort',
    port: 4174,
    reuseExistingServer: false,
    timeout: 120_000,
    // Öffentlicher VAPID-Testschlüssel (der private Schlüssel wurde verworfen, Versand wird nicht getestet)
    env: {
      VITE_SUPABASE_URL: 'https://fake.supabase.test',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
      VITE_VAPID_PUBLIC_KEY: 'BBkjodmFCyZunIAbgJaJvXcZHwQqKaudGKkrIeRzXpP6C0Q_o6lTCgl2JNUmXJBAnMtFWd6FRST7MSyNkMz60oo',
    },
  },
})
