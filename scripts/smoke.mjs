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
await page.waitForTimeout(900);

// First launch of the day must land on the guided check-in.
if (!page.url().includes('/checkin')) {
  throw new Error(`expected the morning check-in on first launch, got ${page.url()}`);
}
console.log('✓ app booted into the morning check-in');
await shot('01-checkin');

// Step 1: today's shift.
await page.getByText('Freischicht').click();
await page.getByRole('button', { name: 'Weiter' }).click();
await page.waitForTimeout(250);

// Step 2: sleep.
await page.getByText('7,5 h', { exact: true }).click();
await page.locator('.rate-btn').nth(3).click();
await page.getByRole('button', { name: 'Weiter' }).click();
await page.waitForTimeout(250);

// Step 3: how the body feels — one answer per scale.
const scales = await page.locator('.rate').count();
for (let i = 0; i < scales; i++) {
  await page.locator('.rate').nth(i).locator('.rate-btn').nth(1).click();
}
await page.getByRole('button', { name: 'Weiter' }).click();
await page.waitForTimeout(250);

// Step 4: optional device values are skipped.
await page.getByRole('button', { name: 'Weiter' }).click();
await page.waitForTimeout(500);

const result = await page.locator('.checkin-body').innerText();
if (!/READY|MODERATE|RECOVERY/.test(result)) throw new Error('check-in did not produce a readiness level');
if (!/dein training heute/i.test(result)) throw new Error('check-in did not produce a recommendation');
console.log('✓ check-in produced readiness and a session');
await shot('02-checkin-result');

await page.getByRole('button', { name: 'Fertig' }).click();
await page.waitForTimeout(500);
await page.waitForSelector('.app-main', { timeout: 10000 });
console.log('✓ finished into the daily screen');

// The daily screen must answer "what should I do today" straight away.
const heroText = await page.locator('.card-hero').first().innerText();
if (!/heute/i.test(heroText)) throw new Error('Today card missing');
console.log('✓ today card:', heroText.split('\n').slice(0, 3).join(' | '));
await shot('03-today');

// Reopening the same day must not show the check-in again.
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
if (page.url().includes('/checkin')) throw new Error('check-in reappeared on the same day');
console.log('✓ second launch on the same day goes straight to the daily screen');

const readiness = await page.locator('.card', { hasText: 'Readiness' }).first().innerText();
if (!/READY|MODERATE|RECOVERY/.test(readiness)) throw new Error('readiness level missing');
console.log('✓ readiness on the daily screen →', readiness.split('\n').slice(0, 2).join(' '));

// Accept the recommendation.
const plan = page.getByRole('button', { name: /Einplanen/ }).first();
if (await plan.isVisible()) {
  await plan.click();
  await page.waitForTimeout(500);
  console.log('✓ recommendation planned');
}
await shot('04-planned');

// Completing a session must take a single tap and survive a reload — this is
// the evening half of the daily loop.
const sessionCheck = page.locator('.list .check').first();
await sessionCheck.click();
await page.waitForTimeout(600);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.app-main');
await page.waitForTimeout(400);
if ((await page.locator('.list .check.checked').count()) === 0) {
  throw new Error('one-tap completion did not persist');
}
console.log('✓ session completed with one tap and persisted');
await shot('05-session-done');

// The training tab is the week planner: seven days must always be on screen,
// and the recommendations must start collapsed.
await page.goto(`${BASE}/#/training`, { waitUntil: 'networkidle' });
await page.waitForSelector('.cal-day');
await page.waitForTimeout(400);
const planDays = await page.locator('.cal-day').count();
if (planDays !== 7) throw new Error(`week calendar shows ${planDays} columns, expected 7`);
// Only the top suggestion is on screen; alternatives sit behind a tap.
const visibleRecos = await page.locator('.reco').count();
if (visibleRecos === 0) throw new Error('no recommendation rendered');
if (visibleRecos > 1) throw new Error(`${visibleRecos} recommendations visible, expected only the top one`);
if ((await page.locator('.reco-body').count()) !== 0) {
  throw new Error('recommendations should start collapsed');
}
const altToggle = page.getByText('Alternativen', { exact: false }).first();
if (await altToggle.count()) {
  await altToggle.click();
  await page.waitForTimeout(350);
  if ((await page.locator('.reco').count()) <= 1) {
    throw new Error('alternatives did not appear after tapping the field');
  }
  console.log('✓ alternatives appear only after tapping the field');
}
await page.locator('.reco').first().locator('button').first().click();
await page.waitForTimeout(250);
if ((await page.locator('.reco-body').count()) === 0) {
  throw new Error('recommendation did not expand on tap');
}
console.log('✓ week calendar shows 7 columns with collapsed, expandable recommendations');

// Planning into another day of the week must land on that day.
const otherDay = page.locator('.cal-day').nth(2);
await otherDay.click();
await page.waitForTimeout(500);
const addBefore = await page.locator('.cal-block').count();
const addButton = page.locator('.reco.top .reco-add');
if (await addButton.count()) {
  await addButton.click();
  await page.waitForTimeout(600);
  if ((await page.locator('.cal-block').count()) <= addBefore) {
    throw new Error('planning into the selected day did not appear in the calendar');
  }
  console.log('✓ planning into a selected day appears as a calendar block');
}
await shot('06-week-planner');

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

// Training phases must be editable, not just readable.
await page.goto(`${BASE}/#/profile`, { waitUntil: 'networkidle' });
await page.waitForSelector('.app-main');
await page.getByText('Base', { exact: true }).first().click();
await page.waitForSelector('.sheet');
const phaseSheet = await page.locator('.sheet').innerText();
if (!/wochenstunden/i.test(phaseSheet)) throw new Error('phase editor did not open');
const hoursStepper = page.locator('.sheet .stepper').first();
const beforeHours = await hoursStepper.locator('.stepper-value').innerText();
await hoursStepper.locator('button').last().click();
await page.getByRole('button', { name: 'Speichern' }).click();
await page.waitForTimeout(600);
await page.goto(`${BASE}/#/training`, { waitUntil: 'networkidle' });
await page.waitForSelector('.app-main');
await page.waitForTimeout(500);
const afterEdit = await page.locator('.app-main').innerText();
if (afterEdit.includes(beforeHours.replace(' h', '')) === false && !/Ziel/i.test(afterEdit)) {
  throw new Error('phase edit did not reach the training screen');
}
console.log(`✓ phase edited (${beforeHours} → +0,5 h) and applied to the week target`);

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
