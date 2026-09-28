import { expect, test, type Page } from '@playwright/test'

// Durchgang durch die App im Handy-Format (390 × 844). Screenshots landen in docs/screenshots.
const shot = (page: Page, name: string) => page.screenshot({ path: `docs/screenshots/${name}.png`, fullPage: true })

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
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
  await page.getByRole('link', { name: 'Heute' }).click()
}

test('Onboarding, Heute, Zyklus, Plan, Kraft, Tracking, Einstellungen', async ({ page }) => {
  await page.goto('/')

  // --- Onboarding ---
  await expect(page.getByRole('heading', { name: 'Willkommen bei Collectr' })).toBeVisible()
  await shot(page, '01-onboarding-profil')
  await page.getByRole('button', { name: 'Weiter' }).click()
  await expect(page.getByTestId('shift-preview')).toContainText('Tagschicht')
  await page.getByRole('button', { name: 'Weiter' }).click()
  await page.getByLabel('Max. Klimmzüge').fill('3')
  await page.getByLabel('Max. Dips').fill('4')
  await page.getByLabel('Hollow Body Hold in Sekunden').fill('35')
  await page.getByRole('button', { name: 'Test speichern und weiter' }).click()
  await expect(page.getByTestId('onboarding-conflict')).toContainText('Urlaub')
  await expect(page.getByTestId('disclaimer')).toBeVisible()
  await shot(page, '02-onboarding-rennen')
  await page.getByRole('button', { name: 'Plan starten' }).click()

  // --- Heute (echtes Datum vor Planstart oder im Plan) ---
  await expect(page.getByTestId('countdown')).toBeVisible()
  await expect(page.getByTestId('warning-vacation')).toBeVisible()
  await expect(page.getByTestId('disclaimer')).toBeVisible()

  // --- Tag 2 im Aufbau simulieren, manuelle Erholung eintragen ---
  await simulateDate(page, '2026-12-12')
  await expect(page.getByTestId('shift-info')).toContainText('Zyklustag 2 · Nachtschicht')
  await page.getByLabel('Schlafdauer in Stunden').fill('5,5')
  await page.getByRole('group', { name: /Schlafqualität/ }).getByRole('button', { name: '2' }).click()
  await page.getByRole('group', { name: /Gefühl heute/ }).getByRole('button', { name: '2' }).click()
  await page.getByRole('button', { name: 'Speichern', exact: true }).click()
  await expect(page.getByTestId('traffic')).toBeVisible()
  await expect(page.getByTestId('training-ring')).toContainText('Training')
  const adj = page.getByTestId('adjustment').first()
  await expect(adj).toBeVisible()
  await expect(adj.getByTestId('reason')).toContainText(/Bereitschaft \d+ %/)
  await expect(page.getByTestId('sleep')).toContainText('Nap: 15:00')
  await noHorizontalScroll(page)
  await shot(page, '03-heute-angepasst')
  await adj.getByRole('button', { name: 'Original ausführen' }).click()
  await expect(page.getByText('Anpassung abgelehnt')).toBeVisible()
  await page.getByTestId('today-item').first().getByRole('button', { name: 'Erledigt' }).click()
  await expect(page.getByTestId('today-item').first()).toContainText('Erledigt')

  // --- Zyklus: V-Schicht auf Tag 5 eintragen ---
  await page.getByRole('link', { name: 'Plan', exact: true }).click()
  await expect(page).toHaveURL(/\/zyklus$/)
  const d5 = page.getByTestId('day-2026-12-15')
  await expect(d5).toContainText('Frei')
  await expect(d5).toContainText('Bergauf-Intervalle')
  // Tag 2 (vor der Nacht): nur eine Einheit
  await expect(page.getByTestId('day-2026-12-12')).toContainText('Schweres Beintraining')
  await expect(page.getByTestId('day-2026-12-12')).not.toContainText('Lauf')
  await d5.click()
  await page.getByRole('dialog').getByRole('button', { name: 'V-Schicht' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Speichern', exact: true }).click()
  await expect(d5).toContainText('V-Schicht')
  await expect(d5).not.toContainText('Ruhetag · optional')
  await expect(d5).toContainText(/gestrichen|Verschoben/)
  await noHorizontalScroll(page)
  await shot(page, '04-zyklus-v-schicht')

  // --- Gesamtplan ---
  await page.getByRole('link', { name: 'Gesamtplan' }).click()
  await expect(page.getByTestId('chart')).toHaveCount(3)
  await expect(page.getByTestId('mesocycles')).toContainText('Rennspezifisch')
  await openGroup(page, 'Checkliste Rennwoche')
  const firstItem = page.getByTestId('checklist').getByRole('checkbox').first()
  await firstItem.check()
  await noHorizontalScroll(page)
  await shot(page, '05-gesamtplan')
  await page.getByRole('button', { name: 'Kalenderwochen' }).click()
  await expect(page.getByTestId('chart')).toHaveCount(3)

  // --- Kraft ---
  await page.getByRole('link', { name: 'Training', exact: true }).click()
  await expect(page).toHaveURL(/\/kraft$/)
  await expect(page.getByTestId('ladders')).toContainText('Strikte Klimmzüge (Aufbau)')
  await expect(page.getByTestId('test-chart')).toBeVisible()
  await noHorizontalScroll(page)
  await shot(page, '06-kraft')

  // --- Tracking: Kraft-Ergebnisse eintragen ---
  await page.getByRole('link', { name: 'Tracking' }).click()
  await page.getByTestId('track-session').filter({ hasText: 'Schweres Beintraining' }).first().click()
  const results = page.getByTestId('strength-results')
  await expect(results).toBeVisible()
  const inputs = results.getByRole('spinbutton')
  await inputs.nth(0).fill('10')
  await inputs.nth(1).fill('10')
  await inputs.nth(2).fill('10')
  await page.getByRole('button', { name: 'Speichern', exact: true }).click()
  await expect(page.getByTestId('tracking-message')).toContainText('gespeichert')
  await noHorizontalScroll(page)
  await shot(page, '07-tracking')

  // --- Einstellungen, Demo-Modus, Mai im rennspezifischen Block ---
  await page.getByRole('link', { name: 'Einstellungen' }).click()
  await openGroup(page, 'WHOOP & Erinnerungen')
  await page.getByLabel('Demo-Modus').check()
  await noHorizontalScroll(page)
  await shot(page, '08-einstellungen')
  await simulateDate(page, '2027-05-14')
  await expect(page.getByTestId('traffic')).toContainText('%')
  await expect(page.getByTestId('disclaimer')).toBeVisible()
  await noHorizontalScroll(page)
  await shot(page, '09-heute-demo-mai')

  // --- Erholung (Phase 6): Diagramme mit Schicht-Hintergrund, Auswertungen, Tabelle ---
  await page.getByRole('link', { name: 'Erholung' }).click()
  await expect(page.getByTestId('recovery-chart')).toHaveCount(4)
  await expect(page.getByTestId('shift-legend')).toContainText('Nachtschicht')
  await expect(page.getByTestId('patterns')).toContainText('Nach Nachtschichten')
  await noHorizontalScroll(page)
  await shot(page, '13-erholung')
  await page.getByRole('button', { name: 'Tabelle' }).click()
  await expect(page.getByTestId('recovery-table')).toContainText('Nachtschicht')
  await page.getByRole('button', { name: '60 Tage' }).click()
  await expect(page.getByTestId('recovery-table').locator('tbody tr')).toHaveCount(60)

  // Schalter „Gelernte Muster nutzen“
  await page.getByRole('link', { name: 'Einstellungen' }).click()
  await openGroup(page, 'Erweitert')
  await page.getByLabel('Gelernte Muster nutzen').check()
  await page.getByRole('link', { name: 'Erholung' }).click()
  await expect(page.getByTestId('patterns')).toContainText('In der Vorausschau: genutzt')
})

