# CLAUDE.md – Collectr (Trainings-App Ehrwald Trail 2027)

Verbindliche Vorgabe ist `docs/SPEC.md`. Architektur und Entscheidungen stehen in `docs/PLANUNG.md`.
Bei Unklarheiten, Widersprüchen oder mehreren sinnvollen Möglichkeiten: **den Nutzer fragen, nicht raten.**

## Arbeitsregeln

- Arbeit in den Phasen aus SPEC Abschnitt 12. **Jede Phase beginnt im Plan-Modus**, danach auf das OK des Nutzers warten.
- Am Ende jeder Phase: Tests (`npm test`) und Build (`npm run build`) prüfen, Fortschrittsliste unten aktualisieren,
  dann **automatisch committen und auf `claude/gifted-ride-l7rok2` pushen**, sofern Tests und Build grün sind (Entscheidung des Nutzers).
- Sprache der Oberfläche: Deutsch. Einheiten km, m, kg. Datum TT.MM.JJJJ. Zeitzone Europe/Berlin.
- Code-Bezeichner auf Englisch, Kommentare und UI-Texte auf Deutsch.
- Die gesamte Trainingslogik liegt in `src/core/`: reine TypeScript-Module ohne React, ohne DOM, ohne Netzwerk und ohne `Date.now()`
  (die aktuelle Zeit wird immer als Parameter übergeben). Sie muss vollständig mit Vitest testbar sein.
- **Alle** Schwellenwerte und Gewichtungen stehen in `src/core/config.ts`, jeweils mit Kommentar. Keine magischen Zahlen in der Logik.
- Kalendertage werden als `LocalDate` (`"YYYY-MM-DD"`, Europe/Berlin) geführt, nie als UTC-Timestamps. Uhrzeiten sind lokale Zeiten.
- Secrets (WHOOP Client Secret, Tokens, Supabase Service Role Key) **nur serverseitig** (Edge Functions und Umgebungsvariablen), nie im Frontend oder im Repo.
- Hinweis aus SPEC 13 muss im Footer und im Onboarding stehen.

## Festgelegte Entscheidungen (Phase 1, mit dem Nutzer geklärt)

| Thema | Entscheidung |
|---|---|
| Planstart | 02.10.2026 (Ankerdatum = Zyklustag 1). Der 01.10. hat keine Einheit. |
| Phasen/Mesozyklen | Grundlage Meso 1–2, Aufbau Meso 3–5, Rennspezifisch Meso 6–7, Taper 04.06.–18.06.2027 (3 Mikrozyklen) |
| Entlastung | 1 von 7 Mikrozyklen (jeweils der letzte), **außer Meso 7**, weil dort direkt der Taper folgt |
| Schweres Beintraining | vorrangig Tag 2. Tag 4 nur, wenn Tag 5 keinen langen Lauf und keine Qualitätseinheit hat |
| Bergwochenenden | 2 (eins in Meso 6, eins in Meso 7, das letzte ca. 3–4 Wochen vor dem Rennen) |
| Rennwoche ohne Urlaub | Schichtplan bleibt wie berechnet, deutliche Warnung, bis Urlaub eingetragen ist |
| Losfahren | Arbeitsbeginn − 15 min Arbeitsweg, ohne Extra-Puffer (Tag 1: 06:30, Tag 2: 18:30, V: 07:30) |
| App-Name | Collectr, im Hauptverzeichnis dieses Repos |
| Git | am Phasenende automatisch committen und pushen, wenn Tests und Build grün sind |
| Nachtlauf | Tag 4 nachts (Start ca. 21:00), Tag 5 ausschlafen, danach locker/Oberkörper oder B2B Teil 2 am Nachmittag |
| Vorausschau (6.3a) | nur ab Gelb. Bei Grün läuft die Einheit immer wie geplant |
| Umfangsspitzen | Trend-Regel: Grundniveau max. +7 %/Mikrozyklus. Schlüssel-Mikrozyklen (längster Lauf, B2B-Spitze, Berg, erste Läufe > 30 km) bis +12 % darüber |
| Phase 3 | Manuelle Eingabe + Demo-Modus, Datum simulieren in den Einstellungen, einfache Einstellungen, IndexedDB |
| Phase 4 | Login E-Mail + Passwort; offline lesen und eintragen, später synchronisieren; Zurücksetzen löscht auch in der Cloud |
| Phase 5 | Eindeutige Workouts automatisch, Rest bestätigen; Abruf beim Öffnen + manuell (täglicher Abruf/Webhooks in Phase 6) |
| Phase 6 | Push-Erinnerungen erst in Phase 7; gelernte Muster anzeigen, Nutzung per Schalter (Standard aus) |
| Phase 7 | Push 30 min vor Zubettgehen/Nap; .ics mit Einheiten, Schichten, Schlaf/Nap; Dienstplan-Import mit Vorschau und Bestätigung |
| Login | Optional nur Passwort-Feld: `VITE_LOGIN_EMAIL` in Vercel, E-Mail dann fest (Entscheidung nach Phase 7) |
| Konten | Vercel vorhanden. Supabase und WHOOP Developer werden in Phase 4/5 mit Anleitung angelegt |

## Befehle (ab Phase 2)

- `npm run dev` – Entwicklungsserver
- `npm test` – Vitest (einmalig), `npm run test:watch`
- `npm run build` – Typecheck und Produktions-Build
- `npm run e2e` – Playwright im Handy-Format (lokal + Cloud mit nachgebildetem Supabase)
- `npm run test:db` – Migration + RLS gegen temporären lokalen Postgres
- `npm run check:functions` – Typprüfung der Edge Functions mit Deno

## Fortschritt

- [x] **Phase 1 – Planung:** offene Fragen geklärt, Architektur, Datenmodell, Ordnerstruktur und Algorithmen in `docs/PLANUNG.md`, CLAUDE.md und Git eingerichtet
- [x] **Phase 2 – Kernlogik:** reine Module in `src/core/` mit 160 Vitest-Tests (Zeilenabdeckung ca. 96 %), Build und Lint grün
  - Plan: `docs/PHASE2_PLAN.md`. Module: config, types, time, shift, plan, strength, recovery, sleep, whoop, race, fixtures
  - Gesamtplan prüfen: `PRINT_PLAN=1 npx vitest run src/core/plan/printPlan.test.ts --silent=false`
  - WHOOP-Zuordnung: Hauptschlaf, der vor dem Trainingsfenster begann und höchstens 12 h vorher endete (sonst manuelle Eingabe)
- [x] **Phase 3 – Oberfläche:** Onboarding, Heute, Zyklus, Gesamtplan (+ Checkliste Rennwoche), Kraft, Tracking, Einstellungen (Plan: `docs/PHASE3_PLAN.md`)
  - Daten lokal in IndexedDB (`src/data`, Repository-Interface für Phase 4), App-Zustand in `src/app` (reine Berechnung in `compute.ts`)
  - Erholung: manuelle Eingabe oder Demo-Modus (Beispieldaten); „Datum simulieren“ in den Einstellungen
  - Tests: 173 Vitest-Tests, Playwright-Durchgang im Handy-Format (`npm run e2e`), Screenshots in `docs/screenshots/`
- [x] **Phase 4 – Supabase:** Login (E-Mail + Passwort), Schema mit RLS, lokal zuerst + Sync, Erst-Umzug (Plan: `docs/PHASE4_PLAN.md`)
  - Migration `supabase/migrations/20261001000000_init.sql`, RLS-Test mit lokalem Postgres: `npm run test:db`
  - Sync: `src/data/sync.ts` (Outbox, erst abrufen, dann hochladen, neuerer Stand gewinnt, Tombstones), `simulatedDate` bleibt lokal
  - Ohne `VITE_SUPABASE_URL` läuft die App nur lokal. Cloud-E2E gegen nachgebildetes Supabase: `e2e/cloud.spec.ts`
  - Anleitung für das Dashboard: `docs/SUPABASE.md` (Nutzer wartet ggf. noch auf die Einrichtung)
- [x] **Phase 5 – WHOOP:** OAuth, Abruf, Token-Refresh, Zuordnung zu Einheiten (Plan: `docs/PHASE5_PLAN.md`, Anleitung: `docs/WHOOP.md`)
  - Migration `20261002000000_whoop.sql`: Tokens/States nur Service Role, WHOOP-Daten für den Nutzer nur lesbar
  - Edge Functions `whoop-oauth-start`, `whoop-oauth-callback` (ohne JWT, State-geschützt), `whoop-sync`, `whoop-disconnect`
  - Logik testbar in `supabase/functions/_shared/` (Vitest), Typprüfung `npm run check:functions` (Deno über npm)
  - API v2 ungeprüft gegen echte WHOOP-Antworten (Netzwerk gesperrt), alle URLs/Felder in `_shared/whoopApi.ts`
  - App: WHOOP-Daten nur lesend synchronisiert, Erholung aus WHOOP (manuelle Eingabe hat Vorrang), eindeutige Workouts automatisch erledigt, Rest als Vorschlag im Tracking
  - Datenschutzseite `/datenschutz` (öffentlich, für das WHOOP-Dashboard)
- [x] **Phase 6 – Automatik:** Webhooks, täglicher Abruf, Realtime, Erholungs-Ansicht, Auswertungen (Plan: `docs/PHASE6_PLAN.md`, Anleitung: `docs/AUTOMATIK.md`)
  - `whoop-webhook` (HMAC-Signatur, inkrementeller Abruf, `*.deleted` markiert Zeilen), `whoop-sync-all` (X-Cron-Secret), Cron-SQL `supabase/sql/cron.sql` (2× täglich, UTC)
  - Migration 3: `whoop_status` in Realtime → geöffnete App synchronisiert sofort
  - Tab „Erholung“ (Schichten als Hintergrund, Tabelle), Schlaf-Umsetzung, `src/core/recovery/patterns.ts` (Nachtschicht, langer Lauf, schwere Beine), Schalter „Gelernte Muster“ (Standard aus)
- [x] **Phase 7 – Livegang:** PWA, Push, Vercel, .ics-Export/-Import, README (Plan: `docs/PHASE7_PLAN.md`, Anleitung: `docs/LIVEGANG.md`)
  - PWA mit `vite-plugin-pwa` (injectManifest, `src/sw/sw.ts`, eigene `tsconfig.sw.json`), Hinweis „Neue Version“, Icons aus `public/icon.svg` (`node scripts/icons.mjs`)
  - Kern: `src/core/export/ics.ts`, `src/core/shift/icsImport.ts`, `src/core/sleep/reminders.ts`
  - Push: Migration 4 (`push_subscriptions`, `push_reminders` + RPC `replace_push_reminders`, `push_sent` nur Service Role), Function `push-send` (Cron alle 5 min, `supabase/sql/push-cron.sql`)
  - `vercel.json` (SPA-Rewrites, Cache- und Sicherheits-Header); Vercel-Deployment und echter Push-Versand macht der Nutzer nach Anleitung
  - Tests: 233 Vitest, 8 Playwright (inkl. Offline, Export, Import, Push-Abo), RLS mit 20 Tabellen

## Phase 2 – Plan (freigegeben)

Reine Module in `src/core/` (config, types, time, shift, plan, strength, recovery, sleep, whoop, race, fixtures), jeweils mit `*.test.ts`.
Die Erholungsregeln: Warnsignal → Rot (Ruhetag oder max. 30 min sehr locker/Mobility) → Schlaf < 5 h (harte Einheiten
gestrichen, freiwillige Alternative; Calisthenics-Hauptsession nur Technik) → Tag 3 (≥ Gelb und ≥ 5 h Tagschlaf) → Gelb
(nur hohe Empfindlichkeit eine Stufe runter, −10 bis −25 %) → Vorausschau (nur ab Gelb, Umwandlung ab Stärke 0,5,
z. B. Schwelle → 45 min locker) → Grün wie geplant. Nie härter als geplant. Begründung in einem Satz.
Lange Lauftypen (langer Lauf, B2B, Berg, Nachtlauf) sind laut SPEC 5.3 nur auf Tag 4/5 erlaubt. „Alle Typen auf Tag 2“ gilt für alle übrigen Typen.
