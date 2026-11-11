# CLAUDE.md – Collectr (Trainings-App Soul Trail 2027)

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

## Festgelegte Entscheidungen (Phase 1, mit dem Nutzer geklärt; Zielwechsel 25.10. und 08.11.2026)

| Thema | Entscheidung |
|---|---|
| Rennen (Zielwechsel 08.11.2026) | **Soul Trail** (SOUL Trailrunning Season Opening), Deggendorf, **Sa 17.04.2027, Start 08:30**, 55 km, 2.000 hm, Zeitlimit 11 h. Alles in `CONFIG.race`. Vorher: Arberland Classic Trail 18.09.2027, davor Ehrwald Trail 18.06.2027 |
| Planstart | Neustart Mo 09.11.2026 (Zyklustag 4): Mikrozyklus 1 = 09./10.11., Rhythmus ab Mi 11.11. Schicht-Ankerdatum bleibt 02.10.2026. Alte Einträge einmalig gelöscht |
| Phasen/Mesozyklen | anteilig: Grundlage Meso 1–2 (je 4), Aufbau Meso 3–4 (je 6), Rennspezifisch Meso 5–6 (5, 4), Taper 31.03.–17.04.2027 (2 Taper, Rennwoche, Renntag) |
| Entlastung | jeweils der letzte Mikrozyklus eines Mesozyklus (4, 8, 14, 20, 25), **außer Meso 6**, weil dort direkt der Taper folgt |
| Schweres Beintraining | vorrangig Tag 2. Tag 4 nur, wenn Tag 5 keinen langen Lauf und keine Qualitätseinheit hat |
| Tag 4/5 in Grundlage und Aufbau | (Nutzerwunsch 26.10.2026) Tag 4: Höhenmeter- bzw. Qualitätseinheit, danach Calisthenics. Tag 5: langer Lauf (`plan.longRunDay`). Ist Tag 5 nicht frei (V, Urlaub, krank) und Tag 4 noch ohne Eintrag, läuft der lange Lauf an Tag 4. Rennspezifisch und Taper unverändert (langer Lauf Tag 4) |
| V-Schicht (Nutzerwunsch 08.11.2026) | An V-Tagen plant der Plan **eine lockere Einheit nach dem Dienst** (Fenster 20:45–21:45, max. 60 min, `windows.vShiftMaxMin`). Die wichtigste Einheit des Tages bleibt als lockere Variante (Lauf → lockerer Lauf, Kraft → Calisthenics-Erhaltung), lange Läufe nie am V-Tag, alles Übrige wird wie bisher verschoben oder gestrichen. Bettzeit mind. 45 min nach dem Training. Tagschicht weiter ohne Training |
| Bergwochenenden | 1: **Streckenbesichtigung** Fr/Sa 19./20.03.2027 (4 Wochen vor dem Rennen) |
| Umfang (Zielwechsel) | ans Rennen angepasst: Spitze ca. 52–57 km/Woche, längster Lauf 32 km (14.03.2027), B2B-Spitze 22 + 14 km |
| Rennwoche ohne Urlaub | Schichtplan bleibt wie berechnet, Warnung im Coach (Checkliste), bis Urlaub eingetragen ist. Renntag = Zyklustag 3. Pflicht 15.–16.04. (T, N), empfohlen ab 10.04. |
| Alte Einträge (Zielwechsel) | einmalig gelöscht (`resetHistory`, gesteuert über `settings.planId`). Krafttests, Kraftstufen, Profil, Overrides, WHOOP bleiben |
| Losfahren | Arbeitsbeginn − 15 min Arbeitsweg, ohne Extra-Puffer (Tag 1: 06:30, Tag 2: 18:30, V: 07:30) |
| App-Name | Collectr, im Hauptverzeichnis dieses Repos |
| Design (Nutzerwunsch 11.11.2026) | **Apple-Dunkelmodus:** tiefschwarzer Hintergrund (#000), graue Flächen (#1C1C1E/#2C2C2E), Orange #FF9F0A als Akzent (Knöpfe, aktiver Reiter, Trainingsring), Ampel grün/gelb/rot in Apple-Tönen, Schlaf blau. Große Seitentitel, gruppierte Listen (Einstellungen), Blätter von unten, iOS-Schalter. Tokens in `src/index.css`, Diagrammfarben in `src/ui/theme.ts` |
| Git | am Phasenende automatisch committen und pushen, wenn Tests und Build grün sind |
| Nachtlauf | ersetzt durch **lange Läufe im Rennzeitplan**: Tag 4, fester Start wie im Rennen (08:30, `fixedStart`), davor 06:00 aufstehen wie am Renntag. Kein Nap am Renntag. Typ `night_run` bleibt im Code |
| Vorausschau (6.3a) | nur ab Gelb. Bei Grün läuft die Einheit immer wie geplant |
| Umfangsspitzen | Trend-Regel: Grundniveau max. +7 %/Mikrozyklus. Schlüssel-Mikrozyklen (26, 27, 28: längster Lauf, Streckenbesichtigung, B2B-Spitze) bis +12 % darüber |
| Phase 3 | Manuelle Eingabe + Demo-Modus, Datum simulieren in den Einstellungen, einfache Einstellungen, IndexedDB |
| Phase 4 | Login E-Mail + Passwort; offline lesen und eintragen, später synchronisieren; Zurücksetzen löscht auch in der Cloud |
| Phase 5 | Eindeutige Workouts automatisch, Rest bestätigen; Abruf beim Öffnen + manuell (täglicher Abruf/Webhooks in Phase 6) |
| Phase 6 | Push-Erinnerungen erst in Phase 7; gelernte Muster anzeigen, Nutzung per Schalter (Standard aus) |
| Phase 7 | Push 30 min vor Zubettgehen/Nap; .ics mit Einheiten, Schichten, Schlaf/Nap; Dienstplan-Import mit Vorschau und Bestätigung |
| Tag 2 (vor der Nacht) | Nur **eine** Einheit (die Krafteinheit). Lauf an Tag 3 nach dem Tagschlaf (locker, ab 15:00), Qualität an Tag 4 (Aufbau) bzw. Tag 5 (Taper), im Taper bleibt Tag 3 frei. Höhenmeter über hügeligere lange Läufe (Obergrenze Aufbau 700, Rennspezifisch 1.200 hm). Freie Tage dürfen 2 Einheiten haben |
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
- [x] **Nach dem Livegang – Oberfläche aufgeräumt** (Nutzerwunsch „wie WHOOP, nichts wegnehmen“): Heute mit drei Ringen (Erholung, Schlaf, Training),
  4 Reiter (Heute · Plan [Zyklus | Gesamtplan] · Erholung · Training [Kraft | Tracking]), Einstellungen als aufklappbare Gruppen,
  Details hinter „Ablauf und Übungen“, „Original ansehen“, „Hinweise“. Bausteine: `Ring`, `Disclosure`, `SegmentedLinks/Buttons`, `Stat`, `Sub`
- [x] **Neue Aufteilung** (Nutzerwunsch): 4 Reiter **Heute · Coach · Schlaf & Erholung · Calisthenics**
  - Heute: Schicht (mit „Schicht ändern“) → Ringe → HRV/Ruhepuls/Atmung (`Vitals`, Abweichung zum 30-Tage-Schnitt) → Countdown → Training → ins Bett/aufstehen + 1–2 Tipps.
    Urlaubs-Warnung nicht auf Heute, sondern im Gesamtplan bei der Checkliste Rennwoche
  - Coach: Zyklus mit Umschalter Rhythmus (Soll/Ist pro 5 Tage) | Kalenderwochen (Soll/Ist pro Woche), Gesamtplan pro Rhythmus; `src/app/volumeView.ts`
  - Schlaf & Erholung: WHOOP heute, Abendroutine (`src/core/sleep/evening.ts`), Schlafplan 10 Tage, Knopf „Statistiken“, Auswertungen, Umsetzung
  - Calisthenics: Skill-Fortschrittsleiste, Stufen, Krafttests, Tracking (`/tracking` → `/kraft`)
  - Atemfrequenz aus WHOOP (`respiratoryRate` im Schlaf), braucht Neu-Deploy der Edge Functions
- [x] **Zielwechsel: Arberland Classic Trail 2027** (Plan in `docs/PLANUNG.md` Abschnitt 8, SPEC bleibt Original mit Hinweis)
  - 66 Mikrozyklen, Mesolängen in `plan.mesos`, Einstiegstag 26.10.2026, `rhythmStart(i)` für den Beginn des Rhythmus
  - Vorlage `specific_early` (langer Lauf 07:00, `fixedStart`), `race_day`-Mikrozyklus, Streckenbesichtigung (`courseRecceMicro`)
  - Schlaf: 04:30 aufstehen vor Rennen und frühen langen Läufen, kein Nap am Renntag; Rennen-Texte aus `CONFIG.race` (`raceHeadline`, `raceFacts`, `raceDateLong`)
  - `resetHistory()` in IndexedDB und Sync, einmalig über `settings.planId`, Hinweis auf Heute
  - Tests: 244 Vitest, 10 Playwright (inkl. Zielwechsel lokal und mit Konto)
  - Fix: mit Konto lud die App nach dem Update endlos (jede Sync-Statusänderung startete das Löschen erneut). Jetzt nur ein Durchlauf (`resetHistoryOnce`) und stabile `onRemoteChange`-Referenz in `cloud.tsx`
- [x] **Tag 4/5 getauscht in Grundlage und Aufbau** (Nutzerwunsch): Tag 4 Höhenmeter/Qualität + Calisthenics, Tag 5 langer Lauf
  - `plan.longRunDay` je Phase, `ComposeOptions.longRunDay`; `generatePlan` legt den langen Lauf auf Tag 4, wenn Tag 5 nicht frei ist und Tag 4 noch keinen Eintrag hat
  - Tests: 246 Vitest, 10 Playwright
- [x] **Zielwechsel: Soul Trail 2027** (Neustart 09.11.2026, Plan in `docs/PLANUNG.md` Abschnitt 9)
  - 33 Mikrozyklen, `startDate` 09.11. (Tag 4) mit Rhythmus ab 06.11., Tage vor dem Start werden nicht eingeplant
  - Rennen an Zyklustag 3 (`race_day` berechnet den Tag aus dem Datum), `raceConflict` prüft auch den Renntag
  - Start 08:30: Rennzeitplan-Läufe und Vorabend mit 06:00 aufstehen; alte Einträge einmalig gelöscht (`race.id`)
  - Tests: 246 Vitest, 10 Playwright
- [x] **V-Schicht mit lockerer Einheit** (Nutzerwunsch): `trainingWindow` gibt für V ein Fenster nach dem Dienst (`afterWork`), `placeDay` behält die wichtigste Einheit als `toLightVariant`, Schlaf: `sleep.afterTrainingBeforeBedMin`
  - Tests: 247 Vitest, 10 Playwright
- [x] **Design wie eine Apple-App** (Nutzerwunsch): Farb-Tokens, SF-Systemschrift, `GroupedList`, große Titel im `Layout`, `.switch`/`.sheet` in `index.css`, Ringe mit getönter Spur, App-Symbol orange (`node scripts/icons.mjs`)

## Phase 2 – Plan (freigegeben)

Reine Module in `src/core/` (config, types, time, shift, plan, strength, recovery, sleep, whoop, race, fixtures), jeweils mit `*.test.ts`.
Die Erholungsregeln: Warnsignal → Rot (Ruhetag oder max. 30 min sehr locker/Mobility) → Schlaf < 5 h (harte Einheiten
gestrichen, freiwillige Alternative; Calisthenics-Hauptsession nur Technik) → Tag 3 (≥ Gelb und ≥ 5 h Tagschlaf) → Gelb
(nur hohe Empfindlichkeit eine Stufe runter, −10 bis −25 %) → Vorausschau (nur ab Gelb, Umwandlung ab Stärke 0,5,
z. B. Schwelle → 45 min locker) → Grün wie geplant. Nie härter als geplant. Begründung in einem Satz.
Lange Lauftypen (langer Lauf, B2B, Berg, Nachtlauf) sind laut SPEC 5.3 nur auf Tag 4/5 erlaubt. „Alle Typen auf Tag 2“ gilt für alle übrigen Typen.
