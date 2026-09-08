/**
 * Every WHOOP URL and scope in one place.
 *
 * They live here rather than inline so that a change on WHOOP's side is a
 * one-line edit instead of a hunt through four handlers. That matters more than
 * usual here: the API went through a version change, and the paths below were
 * confirmed against public references rather than read out of the official docs
 * — that domain is not reachable from this build environment.
 *
 * Confirmed: the token endpoint, the developer base URL, and the v2 paths for
 * sleep and recovery. Not confirmed verbatim: the authorization path, and
 * whether every scope name carried over from v1 unchanged. Both are one edit
 * away if WHOOP disagrees.
 */

export const WHOOP = {
  authorizeUrl: 'https://api.prod.whoop.com/oauth/oauth2/auth',
  tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token',
  apiBase: 'https://api.prod.whoop.com/developer',
  paths: {
    profile: '/v2/user/profile/basic',
    sleep: '/v2/activity/sleep',
    recovery: '/v2/recovery',
    cycles: '/v2/cycle',
    workouts: '/v2/activity/workout',
    bodyMeasurement: '/v2/user/measurement/body',
  },
} as const;

/**
 * `offline` is the one that matters most: without it there is no refresh token,
 * and the connection dies at the first expiry with no way back except a fresh
 * login.
 */
export const SCOPES = [
  'read:recovery',
  'read:sleep',
  'read:cycles',
  'read:workout',
  'read:body_measurement',
  'read:profile',
  'offline',
].join(' ');

/** Which data paths the proxy will fetch. Anything else is refused. */
export const ALLOWED_PATHS = new Set<string>(Object.values(WHOOP.paths));

export interface Credentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Reads the credentials from the environment, or explains what is missing.
 *
 * The secret is only ever read here, on the server. It never reaches the client
 * and never appears in a redirect — that is the whole reason these four
 * functions exist instead of the app talking to WHOOP directly.
 */
export function credentials(): Credentials | { error: string } {
  const clientId = process.env.WHOOP_CLIENT_ID;
  const clientSecret = process.env.WHOOP_CLIENT_SECRET;
  const base = process.env.WHOOP_REDIRECT_BASE ?? process.env.VERCEL_PROJECT_PRODUCTION_URL;

  const missing = [
    !clientId && 'WHOOP_CLIENT_ID',
    !clientSecret && 'WHOOP_CLIENT_SECRET',
    !base && 'WHOOP_REDIRECT_BASE',
  ].filter(Boolean);

  if (missing.length > 0) {
    return { error: `Fehlende Umgebungsvariablen in Vercel: ${missing.join(', ')}` };
  }

  const origin = base!.startsWith('http') ? base! : `https://${base}`;
  return {
    clientId: clientId!,
    clientSecret: clientSecret!,
    redirectUri: `${origin}/api/whoop/callback`,
  };
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
