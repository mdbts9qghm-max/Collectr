import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

// Phase 7: installierbar (Manifest, Service Worker, Icons), offline lesbar, Kalender-Export, Dienstplan-Import.

async function onboard(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Weiter' }).click()
  await page.getByRole('button', { name: 'Weiter' }).click()
  await page.getByRole('button', { name: 'Später machen' }).click()
  await page.getByRole('button', { name: 'Plan starten' }).click()
  await expect(page.getByTestId('countdown')).toBeVisible()
}

/** Aufklappbare Gruppe (z. B. in den Einstellungen) öffnen, falls sie zu ist. */
async function openGroup(page: Page, title: string) {
  const d = page.locator('details', { has: page.locator(`summary:has-text("${title}")`) }).first()
  if (!(await d.evaluate((e) => (e as HTMLDetailsElement).open))) await d.locator('summary').first().click()
}

async function simulateDate(page: Page, date: string) {
  await page.getByRole('link', { name: 'Einstellungen' }).click()
  await openGroup(page, 'Erweitert')
  await page.getByLabel('Simuliertes Datum').fill(date)
  await page.getByRole('button', { name: 'Setzen', exact: true }).click()
}

test('installierbar: Manifest, Icons und Service Worker', async ({ page, request }) => {
  await page.goto('/')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).toBeTruthy()
  const manifest = await (await request.get(href!)).json()
  expect(manifest).toMatchObject({ short_name: 'Collectr', display: 'standalone', start_url: '/', lang: 'de' })
  const sizes = manifest.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes}${i.purpose ? `-${i.purpose}` : ''}`)
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512', '512x512-maskable']))
  for (const icon of manifest.icons as { src: string }[]) expect((await request.get(`/${icon.src}`)).status()).toBe(200)
  expect((await request.get('/apple-touch-icon.png')).status()).toBe(200)
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)
  expect(scope).toBe('http://localhost:4173/')
})

test('Heute ist offline lesbar (neu laden ohne Netz)', async ({ page, context }) => {
  await onboard(page)
  await simulateDate(page, '2026-10-03')
  await page.getByRole('link', { name: 'Heute' }).click()
  await expect(page.getByTestId('today-item').first()).toBeVisible()
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  // Einmal neu laden, damit der Service Worker die Seite kontrolliert
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByTestId('countdown')).toBeVisible()
  await expect(page.getByTestId('today-item').first()).toBeVisible()
  await page.screenshot({ path: 'docs/screenshots/16-offline.png' })
  await page.getByRole('link', { name: 'Plan', exact: true }).click()
  await expect(page.getByTestId('day-2026-10-02')).toBeVisible()
  await page.goto('/plan')
  await expect(page.getByRole('link', { name: 'Gesamtplan' })).toBeVisible()
  await context.setOffline(false)
})

test('Kalender-Export (.ics) enthält Einheiten, Schichten und Schlaf', async ({ page }) => {
  await onboard(page)
  await simulateDate(page, '2026-10-02')
  await openGroup(page, 'Kalender & Backup')
  const card = page.getByTestId('calendar-export')
  await expect(card).toContainText('02.10.2026 bis 29.10.2026')
  const [download] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: 'Kalenderdatei herunterladen' }).click()])
  expect(download.suggestedFilename()).toBe('collectr-2026-10-02-bis-2026-10-29.ics')
  const ics = readFileSync((await download.path())!, 'utf8')
  expect(ics).toContain('BEGIN:VCALENDAR')
  expect(ics).toContain('TZID:Europe/Berlin')
  expect(ics).toContain('UID:schicht-2026-10-02@collectr')
  expect(ics).toContain('UID:nap-2026-10-03@collectr')
  expect(ics).toMatch(/UID:einheit-2026-10-03/)
  await page.screenshot({ path: 'docs/screenshots/14-export.png' })
})

test('Dienstplan-Import: Vorschau, Auswahl, Übernahme als V-Schicht', async ({ page }) => {
  await onboard(page)
  await simulateDate(page, '2026-10-02')
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'DTSTART;TZID=Europe/Berlin:20261002T070000',
    'DTEND;TZID=Europe/Berlin:20261002T190000',
    'SUMMARY:Tagdienst',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'DTSTART;TZID=Europe/Berlin:20261006T080000',
    'DTEND;TZID=Europe/Berlin:20261006T200000',
    'SUMMARY:V-Dienst',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'DTSTART;VALUE=DATE:20261012',
    'SUMMARY:Urlaub',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'DTSTART:20261014T100000',
    'DTEND:20261014T110000',
    'SUMMARY:Zahnarzt',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
  await openGroup(page, 'Schichten & Dienstplan')
  const card = page.getByTestId('roster-import')
  await card.getByTestId('roster-file').setInputFiles({ name: 'dienstplan.ics', mimeType: 'text/calendar', buffer: Buffer.from(ics) })
  const preview = page.getByTestId('roster-preview')
  await expect(preview).toContainText('2 Abweichungen, 1 passend')
  await expect(preview).toContainText('06.10.2026: Frei → V-Schicht')
  await expect(preview).toContainText('12.10.2026: Tagschicht → Urlaub')
  await expect(preview).toContainText('1 Termin(e) nicht erkannt')
  await page.screenshot({ path: 'docs/screenshots/15-dienstplan-import.png' })
  // Urlaub abwählen, nur V übernehmen
  await preview.getByText('12.10.2026: Tagschicht → Urlaub').click()
  await preview.getByRole('button', { name: 'Übernehmen (1)' }).click()
  await expect(card).toContainText('1 Änderung übernommen')
  await page.getByRole('link', { name: 'Plan', exact: true }).click()
  await expect(page.getByTestId('day-2026-10-06')).toContainText('V-Schicht')
})
