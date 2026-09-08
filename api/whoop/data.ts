import { ALLOWED_PATHS, WHOOP, json } from './_config.ts';

/**
 * Step four: fetch data on the athlete's behalf.
 *
 * A proxy rather than a direct call, for one reason that has nothing to do with
 * secrets: the app's content security policy allows `connect-src 'self'` only.
 * That is deliberate — it means a compromised dependency cannot ship this
 * athlete's health data to an arbitrary host. The price is this handler.
 *
 * The path is checked against a fixed list. An open proxy that forwards a
 * bearer token to any URL a caller names is a credential leak waiting for
 * someone to notice it.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.searchParams.get('path');
  const token = request.headers.get('authorization');

  if (!token?.startsWith('Bearer ')) return json({ error: 'Kein Zugangstoken' }, 401);
  if (!path || !ALLOWED_PATHS.has(path)) {
    return json({ error: `Pfad nicht erlaubt: ${path ?? '(keiner)'}` }, 400);
  }

  const target = new URL(WHOOP.apiBase + path);
  // Only the paging and range parameters travel on; nothing else.
  for (const key of ['limit', 'start', 'end', 'nextToken']) {
    const value = url.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  }

  const response = await fetch(target, {
    headers: { authorization: token, accept: 'application/json' },
  });

  if (response.status === 401) {
    return json({ error: 'Token abgelaufen', expired: true }, 401);
  }
  if (!response.ok) {
    return json({ error: `WHOOP antwortete mit ${response.status}` }, response.status);
  }

  return new Response(await response.text(), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
