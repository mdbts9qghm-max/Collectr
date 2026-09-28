# Phase 5: WHOOP (OAuth, Abruf, Token-Erneuerung, Zuordnung)

## Kontext

SPEC 8 / 12.5: Die App holt Recovery, HRV, Ruhepuls, SpO2, Schlaf, Strain und Workouts aus der WHOOP Developer API v2. Schlaf und Recovery werden über WHOOP-Zyklen dem richtigen Trainingstag zugeordnet (`src/core/whoop/assign.ts` existiert bereits und ist getestet). Workouts werden den Einheiten zugeordnet.
Entscheidungen: **Eindeutige Workouts automatisch als erledigt eintragen, mehrdeutige als Vorschlag im Tracking.** **Abruf beim Öffnen der App und per Button.** Der tägliche Hintergrund-Abruf und die Webhooks kommen in Phase 6.
Hinweis: `developer.whoop.com` und die WHOOP-API sind aus dieser Umgebung gesperrt. Endpunkte und Felder stammen aus meiner Kenntnis der API v2, bestätigt für `/developer/v2/recovery` per Websuche. Alle URLs und Feldnamen stehen gesammelt in einer Datei (`_shared/whoopApi.ts`), damit Abweichungen an einer Stelle korrigiert werden können. Getestet wird gegen nachgebildete Antworten. Den echten Test machst du nach dem Einrichten, ich sage dir genau, worauf du achten musst.

## 1. Ablauf

```
App ──(1) POST whoop-oauth-start (mit Login-JWT)──► Edge Function: state speichern, Autorisierungs-URL zurück
App ──(2) Weiterleitung──► WHOOP-Login + Freigabe der Scopes
WHOOP ─(3) redirect ?code&state──► Edge Function whoop-oauth-callback: state prüfen, Code gegen Tokens tauschen,
                                   Tokens speichern (nur serverseitig), zurück zur App (/einstellungen?whoop=verbunden)
App ──(4) POST whoop-sync (beim Öffnen, per Button)──► Edge Function: Token ggf. erneuern, Daten seit letztem Abruf
                                   (erstmals 90 Tage) seitenweise holen, normalisieren, in whoop_*-Tabellen speichern
App ◄─(5) Sync (Phase 4) liest whoop_*-Tabellen nur lesend in IndexedDB ─ offline verfügbar
App: assignRecoveryDay() → Readiness; matchWorkouts() → eindeutige Workouts automatisch als erledigt, Rest als Vorschlag
```

- **OAuth 2.0 Authorization Code Flow**: Autorisierung `https://api.prod.whoop.com/oauth/oauth2/auth`, Token `https://api.prod.whoop.com/oauth/oauth2/token`.
- **Scopes:** `offline read:profile read:recovery read:sleep read:cycles read:workout read:body_measurement`
- `state`: zufällig, mindestens 8 Zeichen, 10 min gültig, einmalig verwendbar.
- **Token-Refresh:** Das Access-Token wird erneuert, wenn es in weniger als 5 min abläuft (`grant_type=refresh_token`, `scope=offline`). Das neue Refresh-Token wird sofort gespeichert (WHOOP rotiert es). Bei `401` wird einmal erneuert und dann wiederholt.
- **API-Limits:** Seitenweise mit `limit=25` und `nextToken`. Bei `429` wird `Retry-After` beachtet, höchstens 3 Versuche. Ein Mindestabstand zwischen App-Abrufen (5 min) wirkt als Cache.
- **Endpunkte v2:** `/developer/v2/cycle`, `/developer/v2/recovery`, `/developer/v2/activity/sleep`, `/developer/v2/activity/workout`, `/developer/v2/user/profile/basic`, `/developer/v2/user/measurement/body`

## 2. Datenbank (`supabase/migrations/20261002000000_whoop.sql`)

| Tabelle | Zugriff | Inhalt |
|---|---|---|
| `whoop_tokens` | **nur Service Role** (RLS an, keine Policy) | Access/Refresh-Token, Ablauf, Scopes, WHOOP-User-ID |
| `whoop_oauth_states` | nur Service Role | state, user_id, Ablauf |
| `whoop_status` | Nutzer liest eigene Zeile | verbunden seit, letzter Abruf, letzter Fehler, WHOOP-User-ID (ohne Tokens) |
| `whoop_cycles`, `whoop_recoveries`, `whoop_sleeps`, `whoop_workouts`, `whoop_body` | Nutzer liest eigene Zeilen, schreibt nichts | `id`, normalisierte Daten (`data` jsonb im Format von `src/core/whoop`), Rohdaten (`raw`), `updated_at`, `deleted` |
| `workout_assignments` (Sync-Sammlung) | Nutzer liest/schreibt eigene | manuelle Korrektur Workout → Einheit |

RLS-Tests erweitern: Tokens und States sind für `authenticated` und `anon` unsichtbar, die Daten sind nur für den Eigentümer lesbar und für ihn nicht beschreibbar.

## 3. Edge Functions (`supabase/functions/`, Deno)

- `_shared/whoopApi.ts`: URLs, Scopes, `normalizeCycle/Recovery/Sleep/Workout` (API v2 → Typen aus `src/core/whoop`), Paginierung, Retry. Reines TypeScript nur mit Web-APIs, deshalb mit Vitest testbar.
- `_shared/handlers.ts`: Logik der vier Funktionen mit injizierten Abhängigkeiten (DB, fetch, Uhr) → Vitest-Tests
- `whoop-oauth-start`, `whoop-oauth-callback`, `whoop-sync`, `whoop-disconnect` (Tokens löschen, Zugriff bei WHOOP widerrufen): dünne `Deno.serve`-Hüllen
- Secrets nur als Function-Secrets: `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, `WHOOP_REDIRECT_URI`, `APP_URL`. Die Service Role stellt Supabase automatisch bereit.
- Typprüfung der Functions mit `deno check` (Deno über npm) als `npm run check:functions`

## 4. App

- Einstellungen → **WHOOP**: „Mit WHOOP verbinden“, Status (verbunden seit, letzter Abruf, Fehler), „Jetzt abrufen“, „Trennen“. Der Demo-Modus schaltet sich bei Verbindung aus.
- Beim Öffnen und bei Sichtbarkeit: `whoop-sync` aufrufen (höchstens alle 5 min), danach normaler Sync.
- `compute.ts`: Erholungsverlauf aus WHOOP-Daten via `assignRecoveryDay`. Die manuelle Eingabe bleibt der Fallback und hat für den jeweiligen Tag Vorrang, wenn du sie einträgst.
- **Workouts** (`matchWorkouts`, `workoutToLog`): eindeutige Treffer (`auto`) → Log „erledigt“ mit Ist-Werten (Dauer, Distanz, hm, Strain, HF-Zonen), sofern du die Einheit nicht schon selbst eingetragen hast. `suggested` → Vorschlag im Tracking mit „Übernehmen / andere Einheit / ignorieren“. Korrekturen werden gespeichert und synchronisiert.
- Heute: Quelle „WHOOP“ statt „Beispieldaten“, Hinweis bei fehlenden Daten nach der Nachtschicht („Tagschlaf noch nicht in WHOOP, bitte kurz eintragen“).
- Seite `/datenschutz` (kurze Datenschutzerklärung), weil das WHOOP-Dashboard eine Privacy-Policy-URL verlangt.

## 5. Tests

- Vitest: Normalisierung (Beispielantworten API v2 inkl. Nap, Tagschlaf, fehlender Score), Paginierung, 429-Retry, Token-Refresh (bald ablaufend, 401 → erneuern, Rotation gespeichert), OAuth-Callback (falscher/abgelaufener state, Fehler von WHOOP), Workout-Übernahme (auto vs. Vorschlag, eigene Einträge nicht überschrieben, Korrektur hat Vorrang), Erholungsverlauf aus WHOOP-Daten
- `npm run test:db`: neue Tabellen und RLS
- Playwright (Cloud-Durchgang): nachgebildete Edge Functions → verbinden, abrufen, Heute zeigt WHOOP-Recovery, Workout erscheint als erledigt
- `deno check` für die Functions

## 6. Deine Schritte (`docs/WHOOP.md`)

1. Auf **developer.whoop.com** mit deinem WHOOP-Konto anmelden → **Create App**
2. Name, Kontakt-E-Mail, **Privacy Policy URL** (`https://<deine-vercel-adresse>/datenschutz`, bis Phase 7 auch vorläufig)
3. **Redirect URI:** `https://<projekt-ref>.supabase.co/functions/v1/whoop-oauth-callback`
4. **Scopes:** `read:recovery`, `read:cycles`, `read:sleep`, `read:workout`, `read:profile`, `read:body_measurement` (`offline` wird beim Login angefragt und liefert das Refresh-Token)
5. **Client ID** und **Client Secret** kopieren → in Supabase unter **Edge Functions → Secrets** eintragen (nie in die App, nie ins Repo)
6. Migration 2 im SQL Editor ausführen, Functions deployen (Anleitung mit Supabase CLI über `npx supabase`, Schritt für Schritt)
7. In der App: Einstellungen → Mit WHOOP verbinden

## 7. Abschluss

`npm test`, `npm run test:db`, `npm run check:functions`, `npm run e2e`, `npm run build`, Lint grün → CLAUDE.md → Commit + Push → Anleitung → Planung Phase 6 im Plan-Modus.
