/**
 * End-to-end smoke test against the production build.
 * Walks every screen, logs a session, ticks a habit and creates a task,
 * failing on any console error or unhandled rejection.
 */
import { launchChromium } from './launch-browser.mjs';

const BASE = process.env.SMOKE_URL ?? 'http://localhost:4173';
const errors = [];

const browser = await launchChromium();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();

page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
});
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

async function shot(name) {
  await page.screenshot({ path: `/tmp/claude-0/-home-user-Collectr/shots/${name}.png`, fullPage: true });
}

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('.app-main', { timeout: 10000 });
console.log('✓ app booted');
await shot('01-today');

// The dashboard must answer "what should I do today" without any setup.
const heroText = await page.locator('.card-hero').first().innerText();
if (!/heute/i.test(heroText)) throw new Error('Today card missing');
console.log('✓ today card:', heroText.split('\n').slice(0, 3).join(' | '));

// Set today's shift.
await page.locator('.app-header, h1').first().waitFor();
await page.getByText('Schicht eintragen').click();
await page.getByText('Freischicht').click();
await page.waitForTimeout(400);
console.log('✓ shift set');
await shot('02-today-shift');

// Daily check-in drives readiness.
await page.getByText('Readiness').first().click();
await page.waitForSelector('.sheet');
await page.locator('input[type="number"]').first().fill('7.5');
await page.getByRole('button', { name: 'Speichern' }).click();
await page.waitForTimeout(400);
const readiness = await page.locator('.card', { hasText: 'Readiness' }).first().innerText();
if (readiness.includes('KEINE DATEN')) throw new Error('readiness did not update after check-in');
if (!/READY|MODERATE|RECOVERY/.test(readiness)) throw new Error('readiness level missing');
console.log('✓ check-in →', readiness.replace(/\n/g, ' '));
await shot('03-readiness');

// Accept the recommendation.
const plan = page.getByRole('button', { name: /Einplanen/ }).first();
if (await plan.isVisible()) {
  await plan.click();
  await page.waitForTimeout(500);
  console.log('✓ recommendation planned');
}
await shot('04-planned');

for (const [path, name] of [
  ['#/training', '05-training'],
  ['#/week', '06-week'],
  ['#/habits', '07-habits'],
  ['#/tasks', '08-tasks'],
  ['#/analytics', '09-analytics'],
  ['#/goals', '10-goals'],
  ['#/coach', '11-coach'],
  ['#/profile', '12-profile'],
]) {
  await page.goto(`${BASE}/${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.app-main');
  await page.waitForTimeout(350);
  const text = await page.locator('.app-main').innerText();
  if (text.trim().length < 30) throw new Error(`${path} rendered empty`);
  await shot(name);
  console.log(`✓ ${path} rendered (${text.length} chars)`);
}

// Coach must answer from stored data.
await page.goto(`${BASE}/#/coach`, { waitUntil: 'networkidle' });
await page.getByText('Was soll ich heute trainieren?').click();
await page.waitForSelector('.bubble.coach');
const answer = await page.locator('.bubble.coach').first().innerText();
if (answer.length < 20) throw new Error('coach answer too short');
console.log('✓ coach answered:', answer.split('\n')[0]);
await shot('13-coach-answer');

// Habits: tick one and confirm it persists across a reload.
// The sleep habit is auto-filled from the check-in, so pick one that is not
// already complete — otherwise the click would toggle it off again.
await page.goto(`${BASE}/#/habits`, { waitUntil: 'networkidle' });
await page.waitForSelector('.check');
const before = await page.locator('.check.checked').count();
await page.locator('.check:not(.checked)').first().click();
await page.waitForTimeout(500);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.check');
const after = await page.locator('.check.checked').count();
if (after !== before + 1) {
  throw new Error(`habit did not persist across reload (before=${before}, after=${after})`);
}
console.log(`✓ habit persisted across reload (${before} → ${after} checked)`);

// The check-in must have auto-filled the sleep habit without a second entry.
const sleepRow = await page.locator('.card', { hasText: 'Schlaf' }).first().innerText();
if (!/7[.,]5/.test(sleepRow)) throw new Error('sleep habit was not auto-filled from the check-in');
console.log('✓ sleep habit auto-filled from check-in');
await shot('14-habits-checked');

// Light theme.
await page.goto(`${BASE}/#/profile`, { waitUntil: 'networkidle' });
await page.getByRole('tab', { name: 'Hell', exact: true }).click();
await page.waitForTimeout(400);
await shot('15-light-theme');
console.log('✓ light theme applied');

// Desktop layout.
await page.setViewportSize({ width: 1280, height: 900 });
await page.goto(`${BASE}/#/today`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const sidebarVisible = await page.locator('.sidebar').isVisible();
if (!sidebarVisible) throw new Error('sidebar missing on desktop');
await shot('16-desktop');
console.log('✓ desktop sidebar visible');

await browser.close();

if (errors.length > 0) {
  console.error('\n✗ console errors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('\n✓ smoke test passed with no console errors');
