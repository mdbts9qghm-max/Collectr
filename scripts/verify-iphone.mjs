/**
 * Checks the layout against real iPhone geometry, including the safe-area
 * insets that only exist once the app is installed to the home screen.
 *
 * Three things break silently on a phone and are easy to miss in a desktop
 * browser: content sliding under the Dynamic Island, iOS zooming the page when
 * a field smaller than 16px gets focus, and tap targets too small to hit
 * without looking.
 *
 * Expects a server on :4173 — npm run preview.
 */
import { mkdirSync } from 'node:fs';
import { launchChromium } from './launch-browser.mjs';

const BASE = process.env.VERIFY_URL ?? 'http://localhost:4173';
const DIR = process.env.SHOT_DIR ?? 'shots';
mkdirSync(DIR, { recursive: true });
let failures = 0;

// Echte Geräte: Breite/Höhe in CSS-Pixeln plus die Insets im Standalone-Modus.
const DEVICES = [
  { name: 'iPhone-15-Pro', w: 393, h: 852, top: 59, bottom: 34 },
  { name: 'iPhone-SE', w: 375, h: 667, top: 20, bottom: 0 },
  { name: 'iPhone-15-Pro-Max', w: 430, h: 932, top: 59, bottom: 34 },
];

const browser = await launchChromium();
const errs = [];

for (const d of DEVICES) {
  const ctx = await browser.newContext({
    viewport: { width: d.w, height: d.h },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`${d.name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`${d.name}: ${m.text()}`); });

  // Insets simulieren, die es nur in der installierten App gibt.
  await page.addInitScript(({ top, bottom }) => {
    const style = document.createElement('style');
    style.textContent = `:root{--safe-top:${top}px;--safe-bottom:${bottom}px}`;
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
  }, { top: d.top, bottom: d.bottom });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  // Check-in überspringen, damit wir auf den Tagesbildschirm kommen
  const skip = page.getByRole('button', { name: 'Überspringen' });
  if (await skip.count()) { await skip.click(); await page.waitForTimeout(700); }

  await page.screenshot({ path: `${DIR}/90-${d.name}-today.png` });

  // Prüfen: Liegt der erste sichtbare Text unter der Statusleiste?
  const firstTop = await page.locator('.app-main > div').first().boundingBox();
  const ok = firstTop && firstTop.y >= d.top;
  if (!ok) failures++;
  console.log(`${d.name}: erster Inhalt bei y=${firstTop ? Math.round(firstTop.y) : '?'} (Inset ${d.top}) → ${ok ? 'OK' : 'ÜBERLAPPT'}`);

  // Prüfen: Ist die Tableiste über dem Home-Indikator?
  const bar = await page.locator('.tabbar').boundingBox();
  const barOk = bar && Math.round(bar.y + bar.height) >= d.h;
  if (!barOk) failures++;
  console.log(`  Tableiste unten bündig: ${barOk ? 'OK' : 'FEHLER'}`);

  // Prüfen: Eingabefeld-Schriftgröße (unter 16px zoomt iOS)
  await page.goto(`${BASE}/#/tasks`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const fab = page.locator('.fab');
  if (await fab.count()) {
    await fab.click();
    await page.waitForSelector('.sheet');
    await page.waitForTimeout(400);
    const fs = await page.locator('.sheet .input').first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    if (fs < 16) failures++;
    console.log(`  Eingabefeld-Schrift: ${fs}px → ${fs >= 16 ? 'kein Zoom' : 'ZOOMT'}`);
    await page.screenshot({ path: `${DIR}/91-${d.name}-sheet.png` });
  }

  // Kleinste Tap-Ziele messen — im Zyklus wie im Kalender
  await page.goto(`${BASE}/#/training`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.cycle-day');
  await page.waitForTimeout(500);
  await page.getByRole('tab', { name: 'Woche' }).click();
  await page.waitForSelector('.cal-day');
  await page.waitForTimeout(500);
  const smallest = await page.evaluate(() => {
    const sel = '.tabbar-item, .reco-add, .check, .stepper > button, .cal-day, .chip';
    let min = Infinity; let which = '';
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const size = Math.min(r.width, r.height);
      if (size < min) { min = size; which = el.className.split(' ')[0]; }
    }
    return { min: Math.round(min), which };
  });
  await page.getByRole('tab', { name: 'Zyklus' }).click();
  await page.waitForSelector('.cycle-day');
  await page.waitForTimeout(400);
  const cycleTargets = await page.evaluate(() => {
    let min = Infinity; let which = '';
    // Nur echte Ziele: das Zyklus-Abzeichen sitzt im Button, es wird nicht
    // selbst angetippt, und seine 36 px würden die Messung verfälschen.
    for (const el of document.querySelectorAll('.cycle-day-head, .cycle-unit button')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const size = Math.min(r.width, r.height);
      if (size < min) { min = size; which = el.className.split(' ')[0] || el.tagName.toLowerCase(); }
    }
    return { min: Math.round(min), which };
  });
  console.log(`  Kleinstes Tap-Ziel im Zyklus: ${cycleTargets.min}px (${cycleTargets.which})`);
  if (cycleTargets.min < 40) failures++;

  // Apple's guideline is 44 pt; 40 is the practical floor used here.
  if (smallest.min < 40) failures++;
  console.log(
    `  Kleinstes Tap-Ziel: ${smallest.min}px (${smallest.which})${smallest.min < 40 ? ' → ZU KLEIN' : ''}`,
  );
  await page.screenshot({ path: `${DIR}/92-${d.name}-training.png` });

  await ctx.close();
}

console.log(errs.length ? 'FEHLER: ' + errs.join(' | ') : 'keine Konsolenfehler');
await browser.close();

if (failures > 0 || errs.length > 0) {
  console.error(`\n✗ ${failures} Layoutprobleme, ${errs.length} Konsolenfehler`);
  process.exit(1);
}
console.log('\n✓ iPhone-Layout verifiziert');
