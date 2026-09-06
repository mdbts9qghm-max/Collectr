/**
 * Renders the app mark to PNG icons.
 *
 * iOS needs a real PNG for `apple-touch-icon`, and the web manifest wants
 * 192/512 raster icons. Rather than adding a headless-browser dependency, the
 * mark is rasterised directly: rounded-rect background plus a scanline fill of
 * the lightning polygon, encoded with Node's built-in zlib.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const BG = [0x0a, 0x0b, 0x0d];
const FG = [0xd4, 0xff, 0x3f];

// Bolt polygon in a 64×64 coordinate space, matching favicon.svg.
const BOLT = [
  [36, 8], [18, 36], [29, 36], [26, 56], [46, 26], [35, 26], [38, 8],
];

function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function insideRoundedRect(x, y, size, radius) {
  const r = radius;
  const cx = Math.min(Math.max(x, r), size - r);
  const cy = Math.min(Math.max(y, r), size - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function crc32(buf) {
  let c;
  const table = crc32.table ?? (crc32.table = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function renderPng(size, { rounded = true } = {}) {
  const scale = size / 64;
  const radius = 14 * scale;
  // 4× supersampling keeps the bolt edges clean at small sizes.
  const ss = 4;
  const rows = [];

  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0; // no filter
    for (let x = 0; x < size; x++) {
      let bgHits = 0;
      let fgHits = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const px = x + (sx + 0.5) / ss;
          const py = y + (sy + 0.5) / ss;
          const inBg = rounded ? insideRoundedRect(px, py, size, radius) : true;
          if (!inBg) continue;
          bgHits++;
          if (pointInPolygon(px / scale, py / scale, BOLT)) fgHits++;
        }
      }
      const total = ss * ss;
      const alpha = Math.round((bgHits / total) * 255);
      const mix = bgHits > 0 ? fgHits / bgHits : 0;
      const o = 1 + x * 4;
      row[o] = Math.round(BG[0] * (1 - mix) + FG[0] * mix);
      row[o + 1] = Math.round(BG[1] * (1 - mix) + FG[1] * mix);
      row[o + 2] = Math.round(BG[2] * (1 - mix) + FG[2] * mix);
      row[o + 3] = alpha;
    }
    rows.push(row);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public', { recursive: true });
const targets = [
  ['public/icon-180.png', 180, { rounded: true }],
  ['public/icon-192.png', 192, { rounded: true }],
  ['public/icon-512.png', 512, { rounded: true }],
  // Maskable icons are cropped by the launcher, so they fill the full square.
  ['public/icon-maskable-512.png', 512, { rounded: false }],
];
for (const [path, size, opts] of targets) {
  writeFileSync(path, renderPng(size, opts));
  console.log(`wrote ${path} (${size}×${size})`);
}
