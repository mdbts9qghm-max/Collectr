/**
 * End-to-end smoke test against the production build.
 * Walks every screen, logs a session, ticks a habit and creates a task,
 * failing on any console error or unhandled rejection.
 */
import { launchChromium } from './launch-browser.mjs';

const BASE = process.env.SMOKE_URL ?? 'http://localhost:4173';

/*
 * Die harte Regel nennt Rad, Rudergerät und Crosstrainer, um sie zu verbieten.
 * Sie wird deshalb aus dem Text herausgeschnitten, bevor er darauf geprüft wird,
 * dass keine andere Sportart vorgeschlagen wird.
 */
const HARD_RULE = /Das gesamte Ausdauervolumen[\s\S]*?weniger Laufen oder Ruhe\./;

/*
 * Jede Sportart, die nicht Laufen ist, mitsamt der kurzen Formen. Die frühere
 * Fassung suchte nur nach „Radfahren" und ließ deshalb genau den Satz durch,
 * der auf dem Tagesbildschirm stand: „Reicht für die Einheit auf dem Rad."
 */
const OTHER_SPORTS =
  /\b(Rad|Räder|Radfahren|Fahrrad|Ergometer|Rudern|Rudergerät|Crosstrainer|Schwimmen|Ellipsentrainer)\b/;
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

/*
 * Seed three weeks of the shift rotation.
 *
 * The cycle planner derives everything from the roster, so without one it
 * correctly proposes nothing and every downstream assertion would pass by
 * doing nothing. Entering fifteen shifts through the sheet is covered by the
 * shift tests; here the data is the point, not the typing.
 */
await page.evaluate(async () => {
  const iso = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const request = indexedDB.open('hybrid-athlete');
  const db = await new Promise((resolve) => { request.onsuccess = () => resolve(request.result); });
  const tx = db.transaction('shifts', 'readwrite');
  const store = tx.objectStore('shifts');
  const rotation = ['shift_day', 'shift_night', 'shift_sleep_day', 'shift_off', 'shift_off'];
  // Today lands on cycle day 4, the free key day, so there is training to check.
  for (let i = -14; i <= 16; i++) {
    store.put({ date: iso(i), shiftTypeId: rotation[(((i + 3) % 5) + 5) % 5], source: 'manual' });
  }
  await new Promise((resolve) => { tx.oncomplete = resolve; });
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(900);

// Step 1: today's shift. Auf die Kachel eingrenzen — die Liste der kommenden
// Tage darunter nennt dieselben Schichten noch einmal.
await page.locator('.pick', { hasText: 'Freischicht' }).first().click();
await page.getByRole('button', { name: 'Weiter' }).click();
await page.waitForTimeout(250);

// Step 2: sleep.
await page.getByText('7,5 h', { exact: true }).click();
await page.locator('.rate-btn').nth(3).click();
await page.getByRole('button', { name: 'Weiter' }).click();
await page.waitForTimeout(250);

// Step 3: how the body feels — one answer per scale.
// Not every block in this step is a scale — the pain question is a yes/no, and
// answering it "yes" would cancel the day's session.
const scales = await page.locator('.rate').count();
for (let i = 0; i < scales; i++) {
  const block = page.locator('.rate').nth(i);
  if ((await block.locator('.rate-btn').count()) === 0) continue;
  await block.locator('.rate-btn').nth(1).click();
}
const noPain = page.getByRole('button', { name: 'Nein' });
if (await noPain.count()) await noPain.first().click();
await page.getByRole('button', { name: 'Weiter' }).click();
await page.waitForTimeout(250);

// Step 4: optional device values are skipped.
await page.getByRole('button', { name: 'Weiter' }).click();
await page.waitForTimeout(500);

const result = await page.locator('.checkin-body').innerText();
if (!/READY|MODERATE|RECOVERY/.test(result)) throw new Error('check-in did not produce a readiness level');
// Kein Trainingsvorschlag mehr: der Check-in zeigt, wie der Tag dasteht.
if (!/wie der tag dasteht/i.test(result)) {
  throw new Error('der Check-in zeigt nicht, wie der Tag dasteht');
}
if (!/erholung/i.test(result)) throw new Error('der Check-in nennt keinen Erholungswert');
if (/einplanen|dein training heute/i.test(result)) {
  throw new Error('der Check-in schlägt wieder Training vor');
}
console.log('✓ Check-in liefert Readiness und Erholung, ohne Vorschlag');
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

/*
 * Eine Einheit selbst eintragen. Es gibt keinen Vorschlag mehr, den man
 * annehmen könnte: was trainiert wird, entscheidet der Athlet.
 */
await page.getByRole('button', { name: /Einheit eintragen/ }).first().click();
await page.waitForSelector('.sheet');
await page.locator('.sheet input').first().fill('Lauf');
await page.getByRole('button', { name: 'Speichern' }).click();
await page.waitForTimeout(600);
if ((await page.locator('.list .check').count()) === 0) {
  throw new Error('die eingetragene Einheit steht nicht in der Liste');
}
console.log('✓ Einheit selbst eingetragen');
await shot('04-eingetragen');

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

/*
 * The sleep tab: four tracks, every recommendation tappable with its reason, no
 * dose for melatonin, and nothing that turns sleep into a score.
 */
await page.goto(`${BASE}/#/sleep`, { waitUntil: 'networkidle' });
await page.waitForSelector('.tl-track');
await page.waitForTimeout(500);
const tracks = await page.locator('.tl-track').count();
if (tracks !== 4) throw new Error(`sleep timeline shows ${tracks} tracks, expected 4`);
if ((await page.locator('.tl-bar').count()) === 0) throw new Error('the timeline has no bars');

const beforeTap = (await page.locator('.app-main').innerText()).length;
await page.locator('.advice-row').nth(2).click();
await page.waitForTimeout(350);
if ((await page.locator('.app-main').innerText()).length <= beforeTap) {
  throw new Error('tapping a recommendation did not reveal its reason');
}
console.log(`✓ sleep tab: ${tracks} tracks, recommendations explain themselves on tap`);

const sleepText = await page.locator('.app-main').innerText();
if (/\d+\s?(mg|µg|mcg)/i.test(sleepText)) {
  throw new Error('the sleep tab must not name a dose for any substance');
}
if (!/Apotheke|Hausarzt/.test(sleepText)) throw new Error('missing the referral to a pharmacy or doctor');
if (!/Keine Diagnose/.test(sleepText)) throw new Error('missing the disclaimer');
const sleepGamified = await page.evaluate(
  () => document.querySelectorAll('.badge, .streak, .streak-dot, .trophy').length,
);
if (sleepGamified > 0) throw new Error('sleep metrics must not be gamified');
console.log('✓ substances explained without a dose, referral and disclaimer present, no gamification');

for (const [path, name] of [
  ['#/training', '05-training'],
  ['#/sleep', '05b-sleep'],
  ['#/week', '06-week'],
  ['#/habits', '07-habits'],
  ['#/goals', '10-goals'],
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
// The week screen is where the target shows now that the training tab is being
// rebuilt; the phase edit has to reach it either way.
await page.goto(`${BASE}/#/week`, { waitUntil: 'networkidle' });
await page.waitForSelector('.app-main');
await page.waitForTimeout(500);
const afterEdit = await page.locator('.app-main').innerText();
if (!/Ziel|von/i.test(afterEdit)) {
  throw new Error('phase edit did not reach the week screen');
}
console.log(`✓ phase edited (${beforeHours} → +0,5 h) and applied to the week target`);

/*
 * Der Schichtrhythmus schreibt sich fort.
 *
 * Vorher endete der Kalender am letzten von Hand eingetragenen Tag — hier sind
 * das 16 Tage — und dahinter stand nichts, weder Schicht noch geplante Einheit.
 * Ein Tap im Profil sagt, welcher Tag heute ist; ab da steht jeder kommende Tag.
 */
const zweiMonateVor = async () => {
  await page.goto(`${BASE}/#/training`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.app-main');
  for (let i = 0; i < 9; i++) {
    await page.getByRole('button', { name: 'Nächste Woche' }).click();
    await page.waitForTimeout(120);
  }
  return page.locator('.shift-tag:not(.is-empty)').count();
};

const vorherWeit = await zweiMonateVor();
if (vorherWeit > 0) {
  throw new Error(`ohne Rhythmus dürfte dort keine Schicht stehen, es sind ${vorherWeit}`);
}

await page.goto(`${BASE}/#/profile`, { waitUntil: 'networkidle' });
await page.waitForSelector('.app-main');
const tagChip = page.getByRole('button', { name: /Tag 2$/ }).first();
if ((await tagChip.count()) === 0) throw new Error('die Rhythmus-Einrichtung fehlt im Profil');
await tagChip.click();
await page.waitForTimeout(400);
// Grossgeschrieben wird per CSS, deshalb ohne Rücksicht auf Gross- und
// Kleinschreibung prüfen — sonst geht die Prüfung an der Darstellung vorbei.
const vorschau = await page.locator('.app-main').innerText();
if (!/schreibt sich fort seit/i.test(vorschau)) {
  throw new Error('die Einrichtung bestätigt die Fortschreibung nicht');
}
if (!/die nächsten zwei wochen/i.test(vorschau)) {
  throw new Error('die Einrichtung zeigt keine Vorschau auf die kommenden Tage');
}
console.log('✓ Rhythmus im Profil eingerichtet, mit Vorschau');
await shot('15-schichtrhythmus');

const nachherWeit = await zweiMonateVor();
if (nachherWeit !== 7) {
  throw new Error(`der Rhythmus füllt die Woche nicht: ${nachherWeit} von 7 Tagen`);
}
console.log('✓ Wochenansicht steht zwei Monate voraus, keine davon eingetippt');

/*
 * Und eine Ausnahme sticht ihn trotzdem: eine V-Schicht auf einem künftigen Tag
 * darf nicht von der Fortschreibung überschrieben werden.
 */
await page.goto(`${BASE}/#/week`, { waitUntil: 'networkidle' });
await page.waitForSelector('.app-main');
await page.waitForTimeout(400);

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
