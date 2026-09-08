import { describe, expect, it } from 'vitest';
// Als Rohtext über Vite geladen statt über node:fs — die Handler laufen auf dem
// Server und gehören nicht in die App-Typen, ihr Quelltext schon.
import configSource from '../../../api/whoop/_config.ts?raw';
import authorizeSource from '../../../api/whoop/authorize.ts?raw';
import callbackSource from '../../../api/whoop/callback.ts?raw';
import refreshSource from '../../../api/whoop/refresh.ts?raw';
import dataSource from '../../../api/whoop/data.ts?raw';
import clientSource from '../../data/whoopClient.ts?raw';

/**
 * The WHOOP handlers run on the server, not in the app, so they are not covered
 * by the browser tests. What is checked here are the decisions that would be
 * expensive to get wrong and invisible if they broke: the secret must never
 * leave the server, the proxy must not forward a bearer token to an arbitrary
 * host, and the tokens must not travel in a query string.
 */

const SOURCES: Record<string, string> = {
  '_config.ts': configSource,
  'authorize.ts': authorizeSource,
  'callback.ts': callbackSource,
  'refresh.ts': refreshSource,
  'data.ts': dataSource,
};
const read = (file: string) => SOURCES[file];

describe('Das App-Geheimnis bleibt auf dem Server', () => {
  it('liest den Client Secret nur aus der Umgebung', () => {
    const config = read('_config.ts');
    expect(config).toMatch(/process\.env\.WHOOP_CLIENT_SECRET/);
    // Nirgends hartkodiert.
    expect(config).not.toMatch(/clientSecret\s*[:=]\s*['"][A-Za-z0-9]{8,}/);
  });

  it('schickt das Secret nie in eine Weiterleitung', () => {
    for (const file of ['authorize.ts', 'callback.ts']) {
      const source = read(file);
      const redirects = source.match(/location:[^\n]*/g) ?? [];
      for (const line of redirects) {
        expect(line).not.toMatch(/clientSecret|client_secret/);
      }
    }
  });

  it('gibt den Fehlertext von WHOOP nicht weiter', () => {
    // Eine Fehlerantwort kann die gesendeten Parameter zurückspiegeln.
    const callback = read('callback.ts');
    expect(callback).toMatch(/token_abgelehnt_\$\{response\.status\}/);
    expect(callback).not.toMatch(/back\([^)]*await response\.text\(\)/);
  });
});

describe('Die Tokens des Nutzers', () => {
  it('kommen im Fragment zurück, nicht im Query-String', () => {
    const callback = read('callback.ts');
    // Das Fragment wird nie an einen Server geschickt und landet in keinem Log.
    expect(callback).toMatch(/#\/profile\?\$\{fragment\}/);
    expect(callback).toMatch(/nie an einen Server geschickt|never sent to a server/i);
  });

  it('werden im Client gehalten, nicht auf dem Server', () => {
    const client = clientSource;
    expect(client).toMatch(/localStorage/);
    // Keine Serverfunktion legt einen Token irgendwo ab.
    for (const file of ['callback.ts', 'refresh.ts', 'data.ts']) {
      expect(read(file)).not.toMatch(/kv\.|redis|database|prisma/i);
    }
  });
});

describe('Der Datenproxy', () => {
  it('leitet nur Pfade aus einer festen Liste weiter', () => {
    const data = read('data.ts');
    expect(data).toMatch(/ALLOWED_PATHS\.has\(path\)/);
    // Kein offener Proxy: die Ziel-URL wird nicht aus dem Request gebaut.
    expect(data).toMatch(/WHOOP\.apiBase \+ path/);
    expect(data).not.toMatch(/new URL\(\s*(?:url\.searchParams\.get\('url'\)|params\.url)/);
  });

  it('gibt nur Paging-Parameter weiter', () => {
    const data = read('data.ts');
    expect(data).toMatch(/\['limit', 'start', 'end', 'nextToken'\]/);
  });

  it('verlangt ein Bearer-Token', () => {
    expect(read('data.ts')).toMatch(/startsWith\('Bearer '\)/);
  });

  it('meldet ein abgelaufenes Token als solches', () => {
    expect(read('data.ts')).toMatch(/expired: true/);
  });
});

describe('OAuth-Absicherung', () => {
  it('setzt einen state und prüft ihn im Callback', () => {
    expect(read('authorize.ts')).toMatch(/crypto\.randomUUID\(\)/);
    expect(read('authorize.ts')).toMatch(/HttpOnly; Secure; SameSite=Lax/);
    const callback = read('callback.ts');
    expect(callback).toMatch(/state !== expected/);
    expect(callback).toMatch(/state_stimmt_nicht/);
  });

  it('fragt offline an, sonst gibt es kein Refresh-Token', () => {
    expect(read('_config.ts')).toMatch(/'offline'/);
  });

  it('hält alle Endpunkte an einer Stelle', () => {
    const config = read('_config.ts');
    expect(config).toMatch(/api\.prod\.whoop\.com\/oauth\/oauth2\/token/);
    expect(config).toMatch(/api\.prod\.whoop\.com\/developer/);
    // Und sagt, was daran verifiziert ist und was nicht.
    expect(config).toMatch(/Not confirmed verbatim/);
  });
});
