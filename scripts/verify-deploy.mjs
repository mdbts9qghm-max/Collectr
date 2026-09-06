/**
 * Verifies the production build the way Vercel will serve it:
 * strict CSP applied, service worker registered, and the app still usable
 * with the network switched off.
 */
import { launchChromium } from './launch-browser.mjs';

const BASE = process.env.VERIFY_URL ?? 'http://localhost:4180';
const errors = [];

// With --serve the script starts its own static server, so the whole check is
// one command. Without it, point VERIFY_URL at a running deployment.
let server;
if (process.argv.includes('--serve')) {
  const { startServer } = await import('./serve-like-vercel.mjs');
  server = await startServer(new URL(BASE).port);
}

const browser = await launchChromium();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();

page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
});
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

// 1. Boots under the production CSP.
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('.app-main', { timeout: 15000 });
console.log('✓ app boots under the production CSP');

// 2. Manifest is reachable and correctly typed.
const manifest = await page.evaluate(async () => {
  const res = await fetch('./manifest.webmanifest');
  return { status: res.status, type: res.headers.get('content-type'), body: await res.json() };
});
if (manifest.status !== 200) throw new Error(`manifest returned ${manifest.status}`);
if (!manifest.type?.includes('manifest+json')) throw new Error(`manifest type: ${manifest.type}`);
if (manifest.body.icons.length < 3) throw new Error('manifest icons missing');
console.log(`✓ manifest served as ${manifest.type} with ${manifest.body.icons.length} icons`);

// 3. Icons actually resolve (a broken apple-touch-icon is invisible until install).
for (const path of ['icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'favicon.svg']) {
  const status = await page.evaluate(async (p) => (await fetch(`./${p}`)).status, path);
  if (status !== 200) throw new Error(`${path} returned ${status}`);
}
console.log('✓ all icons resolve');

// 4. Service worker registers and takes control.
const swState = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return 'none';
  await navigator.serviceWorker.ready;
  return reg.active ? 'active' : 'registered';
});
if (swState === 'none') throw new Error('service worker did not register (CSP worker-src?)');
console.log(`✓ service worker ${swState}`);

// 5. Seed some data, then verify the app works with the network cut.
await page.evaluate(() => new Promise((r) => setTimeout(r, 1200)));
await page.goto(`${BASE}/#/habits`, { waitUntil: 'networkidle' });
await page.waitForSelector('.check');
await page.locator('.check:not(.checked)').first().click();
await page.waitForTimeout(600);

await context.setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.app-main', { timeout: 15000 });
const offlineChecked = await page.locator('.check.checked').count();
if (offlineChecked === 0) throw new Error('data missing after offline reload');
const offlineText = await page.locator('.app-main').innerText();
if (offlineText.length < 50) throw new Error('offline page rendered empty');
console.log(`✓ works fully offline (${offlineChecked} habit(s) still logged)`);

// 6. Deep link into a route while offline — the hash router must still resolve.
await page.goto(`${BASE}/#/analytics`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.app-main');
console.log('✓ offline deep link to /#/analytics renders');

await context.setOffline(false);
await browser.close();
server?.close();

if (errors.length > 0) {
  console.error('\n✗ errors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('\n✓ deployment verification passed');
