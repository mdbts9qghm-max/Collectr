/**
 * Serves dist/ with exactly the headers vercel.json declares.
 *
 * The point is to catch a Content-Security-Policy that breaks the app before it
 * reaches production, rather than discovering it on the deployed URL.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';

const ROOT = 'dist';
const DEFAULT_PORT = Number(process.env.PORT ?? 4180);

const config = JSON.parse(await readFile('vercel.json', 'utf8'));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/** Translates the subset of Vercel source patterns this config uses. */
function matches(source, pathname) {
  const regex = new RegExp(
    '^' +
      source
        .replace(/\/\(index\.html\)\?$/, '/(index\\.html)?')
        .replace(/\(\.\*\)/g, '.*') +
      '$',
  );
  return regex.test(pathname);
}

function headersFor(pathname) {
  const out = {};
  for (const rule of config.headers ?? []) {
    if (!matches(rule.source, pathname)) continue;
    for (const h of rule.headers) if (!(h.key in out)) out[h.key] = h.value;
  }
  return out;
}

function createStaticServer(port) {
  return createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.includes('..')) {
    res.writeHead(400).end('bad path');
    return;
  }

  let filePath = join(ROOT, pathname === '/' ? 'index.html' : pathname);
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = join(filePath, 'index.html');
  } catch {
    // SPA fallback, same as Vercel's framework preset for Vite.
    filePath = join(ROOT, 'index.html');
    pathname = '/index.html';
  }

  try {
    const body = await readFile(filePath);
    const headers = headersFor(pathname);
    if (!headers['Content-Type']) {
      headers['Content-Type'] = TYPES[extname(filePath)] ?? 'application/octet-stream';
    }
    res.writeHead(200, headers).end(body);
  } catch (err) {
    res.writeHead(404).end(String(err));
  }
  });
}

/** Starts the server and resolves once it is accepting connections. */
export function startServer(port = DEFAULT_PORT) {
  const server = createStaticServer(Number(port));
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(Number(port), () => resolve(server));
  });
}

// Only listen when run directly, so verify-deploy.mjs can import startServer.
if (import.meta.url === `file://${process.argv[1]}`) {
  await startServer();
  console.log(`serving ${ROOT} with vercel.json headers on :${DEFAULT_PORT}`);
}
