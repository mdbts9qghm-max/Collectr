/**
 * Proves the whole update path end to end.
 *
 * Builds two versions, swaps the served files behind the running app — exactly
 * what a deployment does — and checks each of the three ways a new version can
 * reach the athlete:
 *
 *   1. "Neu laden" in the banner actually reloads into the new version.
 *   2. "Später" dismisses without breaking anything.
 *   3. Closing and reopening the app applies a pending version without a tap.
 *
 * Runs standalone: npm run verify:update
 */
import { cpSync, rmSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChromium } from './launch-browser.mjs';
import { startServer } from './serve-like-vercel.mjs';

const PORT = 4190;
const BASE = `http://localhost:${PORT}`;
const COLD_START_WINDOW_MS = 11_000;
const errors = [];

/* ---------- Build both versions ---------- */

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

const serveVersion = (dir) => {
  rmSync(SERVE, { recursive: true, force: true });
  cpSync(dir, SERVE, { recursive: true });
};
serveVersion(V1);

const server = await startServer(PORT, SERVE);
const browser = await launchChromium();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });

function watch(page) {
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return page;
}

/**
 * Puts the browser back on version A with a controlling worker — the state a
 * returning user is always in, and the only one where a new version waits
 * instead of activating straight away.
 */
async function startOnVersionA(page) {
  serveVersion(V1);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
  if (!controlled) throw new Error('Seite wird nicht vom Service Worker kontrolliert');
}

/** Deploys B and waits for the banner, past the cold-start window. */
async function deployAndWaitForBanner(page) {
  await page.waitForTimeout(COLD_START_WINDOW_MS);
  serveVersion(V2);
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    await reg?.update();
  });
  await page.waitForSelector('.update-bar', { timeout: 20000 });
}

async function runsVersionB(page) {
  await page.goto(`${BASE}/#/profile`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.app-main');
  await page.waitForTimeout(400);
  return /9\.9\.9/.test(await page.locator('.app-main').innerText());
}

/* ---------- 1. "Neu laden" ---------- */

let page = watch(await context.newPage());
await startOnVersionA(page);
console.log('✓ Version A läuft, Seite vom Service Worker kontrolliert');
if ((await page.locator('.update-bar').count()) !== 0) {
  throw new Error('Update-Leiste ohne Update sichtbar');
}
console.log('✓ keine Leiste, solange es nichts Neues gibt');

await deployAndWaitForBanner(page);
console.log('✓ Leiste erscheint während der Nutzung');

let reloaded = false;
page.on('framenavigated', (frame) => {
  if (frame === page.mainFrame()) reloaded = true;
});
await page.getByRole('button', { name: 'Neu laden' }).click();
await page.waitForTimeout(5000);
if (!reloaded) throw new Error('"Neu laden" hat die Seite nicht neu geladen');
if (!(await runsVersionB(page))) throw new Error('nach "Neu laden" läuft immer noch Version A');
console.log('✓ "Neu laden" lädt neu und bringt die neue Version');

/* ---------- 2. "Später" ---------- */

await page.close();
page = watch(await context.newPage());
await startOnVersionA(page);
await deployAndWaitForBanner(page);
await page.getByRole('button', { name: 'Später' }).click();
await page.waitForTimeout(400);
if ((await page.locator('.update-bar').count()) !== 0) {
  throw new Error('"Später" hat die Leiste nicht geschlossen');
}
console.log('✓ "Später" schließt die Leiste, App läuft normal weiter');

/* ---------- 3. Kaltstart ---------- */

await page.close();
page = watch(await context.newPage());
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
if (!(await runsVersionB(page))) {
  throw new Error('nach dem Neustart läuft immer noch die alte Version');
}
console.log('✓ Kaltstart übernimmt die wartende Version ohne Tap');

await browser.close();
server.close();
rmSync(work, { recursive: true, force: true });

if (errors.length > 0) {
  console.error('\n✗ Fehler:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('\n✓ Update-Pfad verifiziert');
