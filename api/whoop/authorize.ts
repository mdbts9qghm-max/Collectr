import { SCOPES, WHOOP, credentials, json } from './_config.ts';

/**
 * Step one: send the athlete to WHOOP to approve the connection.
 *
 * The `state` parameter is not decoration. It is generated here, stored in a
 * short-lived signed cookie, and checked in the callback — without it, anyone
 * could hand the athlete a prepared callback URL and attach their own WHOOP
 * account to this app's session.
 */
export function GET(): Response {
  const creds = credentials();
  if ('error' in creds) return json({ error: creds.error }, 500);

  const state = crypto.randomUUID();
  const url = new URL(WHOOP.authorizeUrl);
  url.searchParams.set('client_id', creds.clientId);
  url.searchParams.set('redirect_uri', creds.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPES);
  url.searchParams.set('state', state);

  return new Response(null, {
    status: 302,
    headers: {
      location: url.toString(),
      // Ten minutes is longer than any honest login takes and short enough that
      // a stale value cannot be reused later.
      'set-cookie': `whoop_state=${state}; Path=/api/whoop; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      'cache-control': 'no-store',
    },
  });
}
