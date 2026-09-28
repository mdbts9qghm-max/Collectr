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
| Konten | Vercel vorhanden. Supabase und WHOOP Developer werden in Phase 4/5 mit Anleitung angelegt |

## Befehle (ab Phase 2)

- `npm run dev` – Entwicklungsserver
- `npm test` – Vitest (einmalig), `npm run test:watch`
- `npm run build` – Typecheck und Produktions-Build
- `npm run e2e` – Playwright im Handy-Format (ab Phase 3)

## Fortschritt

- [x] **Phase 1 – Planung:** offene Fragen geklärt, Architektur, Datenmodell, Ordnerstruktur und Algorithmen in `docs/PLANUNG.md`, CLAUDE.md und Git eingerichtet
- [x] **Phase 2 – Kernlogik:** reine Module in `src/core/` mit 160 Vitest-Tests (Zeilenabdeckung ca. 96 %), Build und Lint grün
  - Plan: `docs/PHASE2_PLAN.md`. Module: config, types, time, shift, plan, strength, recovery, sleep, whoop, race, fixtures
  - Gesamtplan prüfen: `PRINT_PLAN=1 npx vitest run src/core/plan/printPlan.test.ts --silent=false`
  - WHOOP-Zuordnung: Hauptschlaf, der vor dem Trainingsfenster begann und höchstens 12 h vorher endete (sonst manuelle Eingabe)
- [ ] **Phase 3 – Oberfläche:** Onboarding, Heute, Zyklus, Gesamtplan, Kraft, Tracking, Playwright im Handy-Format
- [ ] **Phase 4 – Supabase:** Auth, Schema, RLS, Umzug der Daten, Anleitung für das Dashboard
- [ ] **Phase 5 – WHOOP:** OAuth, Abruf, Token-Refresh, Zuordnung zu Einheiten, Redirect-URI und Scopes
- [ ] **Phase 6 – Automatik:** Webhooks, tägliche Anpassung, Erholungs-Ansicht, Auswertungen
- [ ] **Phase 7 – Livegang:** PWA, Vercel, .ics-Export, README

## Phase 2 – Plan (freigegeben)

Reine Module in `src/core/` (config, types, time, shift, plan, strength, recovery, sleep, whoop, race, fixtures), jeweils mit `*.test.ts`.
Die Erholungsregeln: Warnsignal → Rot (Ruhetag oder max. 30 min sehr locker/Mobility) → Schlaf < 5 h (harte Einheiten
gestrichen, freiwillige Alternative; Calisthenics-Hauptsession nur Technik) → Tag 3 (≥ Gelb und ≥ 5 h Tagschlaf) → Gelb
(nur hohe Empfindlichkeit eine Stufe runter, −10 bis −25 %) → Vorausschau (nur ab Gelb, Umwandlung ab Stärke 0,5,
z. B. Schwelle → 45 min locker) → Grün wie geplant. Nie härter als geplant. Begründung in einem Satz.
Lange Lauftypen (langer Lauf, B2B, Berg, Nachtlauf) sind laut SPEC 5.3 nur auf Tag 4/5 erlaubt. „Alle Typen auf Tag 2“ gilt für alle übrigen Typen.
