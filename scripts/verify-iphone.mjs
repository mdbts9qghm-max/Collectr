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

  /*
   * Schichten anlegen, sonst plant die App korrekt nichts — und der Check würde
   * einen leeren Trainingstab vermessen und dabei nichts finden.
   */
  await page.evaluate(async () => {
    const iso = (o) => {
      const d = new Date();
      d.setDate(d.getDate() + o);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const req = indexedDB.open('hybrid-athlete');
    const db = await new Promise((r) => { req.onsuccess = () => r(req.result); });
    const tx = db.transaction('shifts', 'readwrite');
    const store = tx.objectStore('shifts');
    const rot = ['shift_day', 'shift_night', 'shift_sleep_day', 'shift_off', 'shift_off'];
    for (let i = -20; i <= 20; i++) {
      store.put({ date: iso(i), shiftTypeId: rot[((i % 5) + 5) % 5], source: 'manual' });
    }
    await new Promise((r) => { tx.oncomplete = r; });
  });
  await page.reload({ waitUntil: 'networkidle' });
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

  /*
   * Prüfen: Passt die Tableiste? Sechs Einträge sind auf dem SE 62 px breit —
   * eng genug, dass ein zu langes Label umbricht oder überläuft, und das fällt
   * in einem Desktop-Browser nicht auf.
   */
  const tabs = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.tabbar-item')];
    return items.map((el) => {
      const label = el.querySelector('span:last-child') ?? el;
      return {
        width: Math.round(el.getBoundingClientRect().width),
        overflow: label.scrollWidth > label.clientWidth + 1,
        text: (el.textContent ?? '').trim(),
      };
    });
  });
  const clipped = tabs.filter((i) => i.overflow);
  if (clipped.length > 0) failures++;
  console.log(
    `  Tableiste: ${tabs.length} Einträge à ${tabs[0]?.width ?? '?'}px` +
      (clipped.length ? ` → ABGESCHNITTEN: ${clipped.map((c) => c.text).join(', ')}` : ' → passt'),
  );

  /*
   * Prüfen: Eingabefeld-Schriftgröße. Unter 16 px zoomt iOS beim Fokussieren,
   * und das Formular rutscht aus dem Bild.
   *
   * Gemessen wird das Einheitenformular, weil dort am meisten getippt wird.
   * Diese Prüfung hing früher am Aufgabentab und dessen `.fab`; als der Tab
   * wegfiel, wäre sie stillschweigend übersprungen worden — deshalb scheitert
   * sie jetzt laut, wenn sie kein Feld findet.
   */
  await page.goto(`${BASE}/#/today`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /Einheit selbst eintragen/ }).click();
  await page.waitForSelector('.sheet .input');
  await page.waitForTimeout(400);
  const inputs = await page.locator('.sheet .input').count();
  if (inputs === 0) {
    failures++;
    console.log('  Eingabefeld-Schrift: KEIN FELD GEFUNDEN — die Prüfung misst nichts');
  } else {
    const fs = await page
      .locator('.sheet .input')
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    if (fs < 16) failures++;
    console.log(
      `  Eingabefeld-Schrift: ${fs}px in ${inputs} Feldern → ${fs >= 16 ? 'kein Zoom' : 'ZOOMT'}`,
    );
    await page.screenshot({ path: `${DIR}/91-${d.name}-sheet.png` });
  }

  /*
   * Kleinste Tap-Ziele messen — auf beiden dichten Bildschirmen. Der Coach-Tab
   * hat mit dem Blickfeld 55 Tagesspalten nebeneinander; genau dort entsteht der
   * Druck, sie schmaler zu machen, als ein Daumen treffen kann.
   */
  for (const [route, wait] of [['/#/training', '.cal-cell'], ['/#/sleep', '.advice-row']]) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
  await page.waitForSelector(wait);
  await page.waitForTimeout(500);
  const smallest = await page.evaluate(() => {
    const sel = '.tabbar-item, .check, .stepper > button, .chip, .advice-row, .cal-cell, .cal-nav';
    let min = Infinity; let which = '';
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const size = Math.min(r.width, r.height);
      // Some tap targets carry no class at all, so fall back to a usable label.
      if (size < min) { min = size; which = el.className.split(' ')[0] || `${el.tagName.toLowerCase()} in .${el.parentElement?.className.split(' ')[0] ?? '?'}`; }
    }
    return { min: Math.round(min), which };
  });
  await page.screenshot({ path: `${DIR}/92-${d.name}-${route.slice(3)}.png` });

  // Apple's guideline is 44 pt; 40 is the practical floor used here.
  if (smallest.min < 40) failures++;
  console.log(
    `  Kleinstes Tap-Ziel auf ${route.slice(3)}: ${smallest.min}px (${smallest.which})${smallest.min < 40 ? ' → ZU KLEIN' : ''}`,
  );
  }

  await ctx.close();
}

console.log(errs.length ? 'FEHLER: ' + errs.join(' | ') : 'keine Konsolenfehler');
await browser.close();

if (failures > 0 || errs.length > 0) {
  console.error(`\n✗ ${failures} Layoutprobleme, ${errs.length} Konsolenfehler`);
  process.exit(1);
}
console.log('\n✓ iPhone-Layout verifiziert');
