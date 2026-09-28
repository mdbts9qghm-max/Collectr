// Erzeugt die PNG-Icons der PWA aus public/icon.svg (einmalig, Ergebnis liegt im Repo).
// Aufruf: node scripts/icons.mjs
import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8')
const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {})
const page = await browser.newPage()

async function render(file, size, { padding = 0, square = false } = {}) {
  await page.setViewportSize({ width: size, height: size })
  const inner = size - 2 * padding
  const img = square ? svg.replace('rx="96"', 'rx="0"') : svg
  await page.setContent(
    `<html><body style="margin:0;background:#0b0f14;display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px">` +
      `<div style="width:${inner}px;height:${inner}px">${img.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`,
  )
  await page.screenshot({ path: new URL(`../public/${file}`, import.meta.url).pathname, omitBackground: false })
}

await render('pwa-192x192.png', 192, { square: true })
await render('pwa-512x512.png', 512, { square: true })
// Maskable: Motiv in der sicheren Zone (80 %)
await render('maskable-512x512.png', 512, { padding: 51, square: true })
await render('apple-touch-icon.png', 180, { square: true })
await browser.close()
console.log('Icons erzeugt')
