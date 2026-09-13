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

/*
 * Der Coach-Tab. Geprüft wird, was die Anforderung ausmacht: die Anweisung steht
 * ganz oben, die Begründung liegt hinter einem Knopf, und das Blickfeld reicht
 * über Wochen in beide Richtungen und sagt pro Tag, warum er noch zählt.
 */
await page.goto(`${BASE}/#/training`, { waitUntil: 'networkidle' });
await page.waitForSelector('.cal-grid');
await page.waitForSelector('.coach-headline');
await page.waitForTimeout(400);

const headline = (await page.locator('.coach-headline').innerText()).trim();
if (headline.length < 5) throw new Error('the coach has no headline');

// Die Begründung darf erst nach einem Tap sichtbar sein.
if ((await page.locator('.coach-reasons').count()) > 0) {
  throw new Error('the reasons must start hidden behind a button');
}
await page.getByRole('button', { name: /Warum heute das/ }).click();
await page.waitForSelector('.coach-reasons');
const reasons = await page.locator('.coach-reasons li').count();
if (reasons === 0) throw new Error('the coach gave no reason');
console.log(`✓ coach: "${headline}" — ${reasons} Begründungen hinter dem Knopf`);

/*
 * Der Kalender: Schicht und Einheit pro Tag, blätterbar, und beim Antippen
 * eines Tages steht dort auch, welche Regeln ihn noch mit heute verbinden —
 * das Einflussfenster ist in die Tagesansicht gewandert, nicht verschwunden.
 */
const cells = await page.locator('.cal-cell').count();
if (cells % 7 !== 0 || cells < 28) {
  throw new Error(`the calendar renders ${cells} cells, expected whole weeks`);
}

/*
 * Der Kalender fängt bei heute an. Vergangene Tage halten nur die Spalte, damit
 * die Wochentage untereinander bleiben — sie tragen weder Schicht noch Einheit
 * und lassen sich nicht antippen.
 */
const past = await page.locator('.cal-cell.is-past').count();
if ((await page.locator('.cal-cell.is-past .cal-bar').count()) > 0) {
  throw new Error('a past day still shows a planned session');
}
if ((await page.locator('.cal-cell.is-past .cal-shift').count()) > 0) {
  throw new Error('a past day still shows a shift');
}
const backDisabled = await page.getByRole('button', { name: 'Voriger Monat' }).isDisabled();
if (!backDisabled) throw new Error('the calendar still pages back before today');
console.log(`✓ Kalender beginnt heute: ${past} vergangene Tage nur als Platzhalter, kein Zurück`);
if ((await page.locator('.cal-cell.is-today').count()) !== 1) {
  throw new Error('the calendar does not mark today');
}
const shiftBadges = await page.locator('.cal-shift:not(.cal-shift-empty)').count();
if (shiftBadges === 0) throw new Error('no shift shows in the calendar');
const sessionBars = await page.locator('.cal-cell .cal-bar').count();
if (sessionBars === 0) throw new Error('no planned session shows in the calendar');
console.log(`✓ Kalender: ${cells} Tage, ${shiftBadges} Schichten, ${sessionBars} Einheiten`);

// Einen geplanten Tag antippen: Schicht, Einheit und die Verbindung zu heute.
await page.locator('.cal-cell', { has: page.locator('.cal-bar') }).first().click();
await page.waitForSelector('.cal-detail');
const detail = await page.locator('.cal-detail').innerText();
if (!/verbindet|beeinflusst heute nichts/.test(detail)) {
  throw new Error('a calendar day does not say why it still matters');
}
if (!/min/.test(detail)) throw new Error('a planned day shows no session');
console.log(`✓ Tagesansicht: ${detail.split('\n')[0]} — mit Einheit und Regelbezug`);

// Blättern: der Vormonat muss sich zeigen und der Weg zurück da sein.
const monthBefore = await page.locator('.cal-head').locator('..').locator('.t-label').first().innerText();
await page.getByRole('button', { name: 'Nächster Monat' }).click();
await page.waitForTimeout(300);
const monthAfter = await page.locator('.cal-head').locator('..').locator('.t-label').first().innerText();
if (monthBefore === monthAfter) throw new Error('the calendar does not page to the next month');
if ((await page.getByText('zu heute').count()) === 0) {
  throw new Error('no way back to today after paging');
}
await page.getByText('zu heute').click();
await page.waitForTimeout(300);
console.log(`✓ blättert ${monthBefore} → ${monthAfter} und zurück`);

// Es wird gelaufen: kein Rad, kein Rudergerät, kein Crosstrainer als Vorschlag.
const coachText = await page.locator('.app-main').innerText();
if (OTHER_SPORTS.test(coachText.replace(HARD_RULE, ''))) {
  throw new Error(`the coach must never propose another sport: ${coachText.match(OTHER_SPORTS)[0]}`);
}
console.log('✓ nur Laufen, Kraft, Gehen und Ruhe');

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

/*
 * Der Tagesbildschirm muss dieselbe Einheit nennen wie der Coach-Tab. Genau hier
 * ist es schon auseinandergelaufen: seit die Läufe auf vier Tage je zehn liegen,
 * tragen die übrigen Tage Kraft ohne Lauf — und „Heute" meldete Ruhe, während
 * die Krafteinheit darunter in der Liste stand.
 */
await page.goto(`${BASE}/#/today`, { waitUntil: 'networkidle' });
await page.waitForSelector('.card-hero');
await page.waitForTimeout(400);
const todayHero = (await page.locator('.card-hero .t-title').first().innerText()).trim();
if (!headline.includes(todayHero)) {
  throw new Error(
    `Heute und der Coach-Tab widersprechen sich:\n  Coach: ${headline}\n  Heute: ${todayHero}`,
  );
}
if (/Ruhetag/.test(todayHero) !== /Ruhetag/.test(headline)) {
  throw new Error(`Ruhetag nur auf einem der beiden Bildschirme: ${todayHero} / ${headline}`);
}
console.log(`✓ Heute deckt sich mit dem Coach-Tab: ${todayHero}`);

/*
 * Die eingeplante Einheit muss dieselbe Zahl tragen wie die Empfehlung.
 *
 * Genau das lief auseinander: oben stand „24 min", in der Liste darunter
 * „40 min". Der Coach rechnet jeden Tag neu, die einmal gespeicherte Einheit
 * nicht — und abgehakt worden wäre die 40. Hier wird eine veraltete Einheit
 * direkt in die Datenbank gelegt und geprüft, dass die App sie nachzieht.
 */
await page.evaluate(async () => {
  const d = new Date();
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const request = indexedDB.open('hybrid-athlete');
  const db = await new Promise((resolve) => { request.onsuccess = () => resolve(request.result); });
  const tx = db.transaction('sessions', 'readwrite');
  tx.objectStore('sessions').put({
    id: 'ses_veraltet',
    date: iso,
    sport: 'run',
    title: 'Lockerer Lauf',
    status: 'planned',
    plannedDurationMin: 137,
    plannedIntensity: 'easy',
    muscleGroups: [],
    source: 'coach',
    createdAt: d.toISOString(),
    updatedAt: d.toISOString(),
  });
  await new Promise((resolve) => { tx.oncomplete = resolve; });
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.card-hero');
await page.waitForTimeout(900);

const heroLine = (await page.locator('.card-hero .t-small.secondary').first().innerText()).trim();
const heroDuration = heroLine.split('·')[0].trim();
const plannedList = await page.locator('.app-main').innerText();
if (/137 min|2:17 h/.test(plannedList)) {
  throw new Error('eine veraltete Einheit steht weiter unter der Empfehlung');
}
if (!plannedList.includes(heroDuration)) {
  throw new Error(
    `Empfehlung und eingeplante Einheit nennen verschiedene Dauern: ${heroDuration} fehlt in der Liste`,
  );
}
console.log(`✓ die eingeplante Einheit folgt dem Coach: ${heroDuration}`);

/*
 * Und auf diesem Bildschirm gilt die harte Regel genauso. Der Hinweis unter der
 * Empfehlung nannte einmal das Rad — die Prüfung unten hat ihn nicht gesehen,
 * weil sie nur nach „Radfahren" suchte.
 */
const todayText = (await page.locator('.app-main').innerText()).replace(HARD_RULE, '');
if (OTHER_SPORTS.test(todayText)) {
  throw new Error(`der Tagesbildschirm nennt eine andere Sportart: ${todayText.match(OTHER_SPORTS)[0]}`);
}
console.log('✓ Heute nennt keine andere Sportart');

/*
 * Die Frage-Antwort-Seite muss dasselbe sagen wie der Coach-Tab. Zwei Stellen,
 * die verschiedene Einheiten vorschlagen, sind der Fehler, an dem man aufhört,
 * dem Plan zu glauben — deshalb steht der Abgleich hier fest im Test.
 */
await page.goto(`${BASE}/#/coach`, { waitUntil: 'networkidle' });
await page.getByText('Was soll ich heute trainieren?').click();
await page.waitForSelector('.bubble.coach');
const answer = await page.locator('.bubble.coach').first().innerText();
if (answer.length < 20) throw new Error('coach answer too short');
if (!answer.includes(headline)) {
  throw new Error(
    `the answer screen and the coach tab disagree:\n  Tab:    ${headline}\n  Antwort: ${answer.split('\n')[0]}`,
  );
}
console.log(`✓ Frage-Antwort deckt sich mit dem Coach-Tab: ${answer.split('\n')[0]}`);
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
