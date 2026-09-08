import { WHOOP, credentials, json } from './_config.ts';

/**
 * Step three: a new access token from the refresh token.
 *
 * The refresh token arrives from the client and leaves again in the response —
 * it is the athlete's own credential, stored with the rest of their data. What
 * never travels is the client secret, which is added here and only here.
 */
export async function POST(request: Request): Promise<Response> {
  const creds = credentials();
  if ('error' in creds) return json({ error: creds.error }, 500);

  let refreshToken: string | undefined;
  try {
    ({ refreshToken } = (await request.json()) as { refreshToken?: string });
  } catch {
    return json({ error: 'Ungültiger Request-Body' }, 400);
  }
  if (!refreshToken) return json({ error: 'Kein Refresh-Token übergeben' }, 400);

  const response = await fetch(WHOOP.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      // WHOOP hands back a new refresh token only when `offline` is asked for
      // again on the refresh call.
      scope: 'offline',
    }),
  });

  if (!response.ok) {
    return json({ error: `WHOOP hat den Refresh abgelehnt (${response.status})` }, response.status);
  }

  const token = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  return json({
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? refreshToken,
    expiresAt: Date.now() + token.expires_in * 1000,
  });
}
