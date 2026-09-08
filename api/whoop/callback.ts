import { WHOOP, credentials, json } from './_config.ts';

/**
 * Step two: trade the code for tokens and hand them back to the app.
 *
 * The tokens go into the URL **fragment**, not the query string. A fragment is
 * never sent to a server and never lands in an access log or a referrer header;
 * a query parameter does both. The client secret stays here and is never part of
 * anything the browser sees.
 */
export async function GET(request: Request): Promise<Response> {
  const creds = credentials();
  if ('error' in creds) return json({ error: creds.error }, 500);

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const denied = url.searchParams.get('error');

  const appUrl = new URL('/', url.origin);
  const back = (fragment: string) =>
    new Response(null, {
      status: 302,
      headers: {
        location: `${appUrl}#/profile?${fragment}`,
        'set-cookie': 'whoop_state=; Path=/api/whoop; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
        'cache-control': 'no-store',
      },
    });

  if (denied) return back(`whoop_error=${encodeURIComponent(denied)}`);
  if (!code) return back('whoop_error=kein_code');

  // The state has to match the cookie set when the flow started.
  const cookie = request.headers.get('cookie') ?? '';
  const expected = /(?:^|;\s*)whoop_state=([^;]+)/.exec(cookie)?.[1];
  if (!state || !expected || state !== expected) {
    return back('whoop_error=state_stimmt_nicht');
  }

  const response = await fetch(WHOOP.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      redirect_uri: creds.redirectUri,
    }),
  });

  if (!response.ok) {
    // The body may carry the secret back in an error echo — never forward it.
    return back(`whoop_error=token_abgelehnt_${response.status}`);
  }

  const token = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const fragment = new URLSearchParams({
    whoop_access: token.access_token,
    whoop_refresh: token.refresh_token ?? '',
    whoop_expires: String(Date.now() + token.expires_in * 1000),
  });
  return back(fragment.toString());
}
