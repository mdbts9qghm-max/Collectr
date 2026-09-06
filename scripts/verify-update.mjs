/**
 * Proves the update path end to end.
 *
 * Loads version A, swaps the served files for version B behind the running
 * app (exactly what a Vercel deploy does), triggers a check, and asserts that
 * the banner appears and that tapping it actually brings the new version.
 *
 * Builds both versions itself, so it runs standalone: npm run verify:update
 */
import { cpSync, rmSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChromium } from './launch-browser.mjs';
import { startServer } from './serve-like-vercel.mjs';

const PORT = 4190;
const BASE = `http://localhost:${PORT}`;
const errors = [];

/* ---------- Build the two versions this test needs ---------- */

const work = mkdtempSync(join(tmpdir(), 'ha-update-'));
const V1 = join(work, 'v1');
const V2 = join(work, 'v2');
const SERVE = join(work, 'serve');
const VERSION_FILE = 'src/app/version.ts';
const original = readFileSync(VERSION_FILE, 'utf8');

const build = () => execFileSync('npm', ['run', 'build'], { stdio: 'ignore' });

console.log('… baue Version A');
build();
cpSync('dist', V1, { recursive: true });

console.log('… baue Version B');
writeFileSync(VERSION_FILE, original.replace(/APP_VERSION = '[^']+'/, "APP_VERSION = '9.9.9'"));
try {
  build();
  cpSync('dist', V2, { recursive: true });
} finally {
  writeFileSync(VERSION_FILE, original);
  build();
}

cpSync(V1, SERVE, { recursive: true });

const server = await startServer(PORT, SERVE);
const browser = await launchChromium();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});

// --- Version A ---
// The first load installs the worker but is not yet controlled by it. A reload
// puts the page under the worker's control, which is the state a returning
// user is always in — and the only state in which a new version waits instead
// of activating straight away.
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
if (!controlled) throw new Error('Seite wird nicht vom Service Worker kontrolliert');
console.log('✓ Version A läuft, Seite vom Service Worker kontrolliert');

const bannerBefore = await page.locator('.update-bar').count();
if (bannerBefore !== 0) throw new Error('Update-Leiste ohne Update sichtbar');
console.log('✓ keine Leiste, solange es nichts Neues gibt');

// --- Deployment im laufenden Betrieb ---
rmSync(SERVE, { recursive: true, force: true });
cpSync(V2, SERVE, { recursive: true });
console.log('… Version B ausgerollt, App läuft weiter');

// --- Die App muss das von selbst finden ---
await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  await reg?.update();
});

await page.waitForSelector('.update-bar', { timeout: 20000 });
const text = await page.locator('.update-bar').innerText();
if (!/Neue Version/i.test(text)) throw new Error(`unerwarteter Text: ${text}`);
console.log('✓ Leiste erscheint:', text.replace(/\n/g, ' '));

// --- Später klicken darf nichts kaputt machen ---
await page.getByRole('button', { name: 'Später' }).click();
await page.waitForTimeout(300);
if ((await page.locator('.update-bar').count()) !== 0) throw new Error('"Später" hat die Leiste nicht geschlossen');
console.log('✓ "Später" schließt die Leiste, App läuft normal weiter');

// --- Beim nächsten Start muss erneut gefragt werden ---
// Ohne die Prüfung auf einen wartenden Worker bliebe die Version für immer
// unsichtbar, sobald einmal "Später" getippt wurde.
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const waiting = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  return !!reg?.waiting;
});
if (waiting) {
  await page.waitForSelector('.update-bar', { timeout: 20000 });
  console.log('✓ nach dem Neustart wird erneut auf die Version hingewiesen');
  await page.getByRole('button', { name: 'Neu laden' }).click();
  await page.waitForTimeout(2500);
} else {
  // Some browsers activate the waiting worker once the last client unloads.
  // Then the new version is simply already live, which is also correct.
  console.log('✓ Browser hat die wartende Version beim Neustart selbst aktiviert');
}

await page.goto(`${BASE}/#/profile`, { waitUntil: 'networkidle' });
await page.waitForSelector('.app-main');
const profile = await page.locator('.app-main').innerText();
if (!/9\.9\.9/.test(profile)) {
  throw new Error(`nach dem Reload läuft immer noch die alte Version:\n${profile.slice(0, 300)}`);
}
console.log('✓ nach "Neu laden" läuft Version 9.9.9');

await browser.close();
server.close();
rmSync(work, { recursive: true, force: true });

if (errors.length > 0) {
  console.error('\n✗ Fehler:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('\n✓ Update-Pfad verifiziert');
