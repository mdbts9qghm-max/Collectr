# Phase 7: Livegang (PWA, Push, Vercel, .ics, README)

## Kontext

Letzte Phase (SPEC 10, 12.7, 6.3b, 4.1, 9.9). Die App wird installierbar, die Heute-Ansicht ist offline lesbar, und Push-Erinnerungen für Schlafenszeit und Nap kommen dazu. Außerdem die Veröffentlichung auf Vercel, der Kalender-Export und der optionale Dienstplan-Import.
Entscheidungen: **Push 30 min vorher.** **.ics mit Trainingseinheiten, Schichten und Schlaf/Nap.** **Dienstplan-Import mit Vorschau und Bestätigung.**
Hinweis: Vercel, Supabase und WHOOP sind von hier nicht erreichbar. Das Deployment machst du nach Anleitung selbst. Push teste ich im Browser lokal (Service Worker, Abo, Anzeige), den echten Versand erst nach deinem Deployment.

## 1. PWA (vite-plugin-pwa, Workbox)

- Manifest: Name „Collectr“, Kurzname, Farben `#0b0f14`, `display: standalone`, Start `/`, Sprache de, Icons 192/512 + maskable + Apple-Touch-Icon. Die Icons erzeuge ich als SVG → PNG.
- Service Worker: Precache der App-Hülle (JS/CSS/HTML), Navigations-Fallback auf `index.html`. Supabase- und WHOOP-Aufrufe werden nicht gecacht. Die Daten kommen offline aus IndexedDB (seit Phase 4), deshalb ist die Heute-Ansicht vollständig offline lesbar.
- Hinweis „Neue Version verfügbar – neu laden“ (prompt statt stiller Aktualisierung).
- iPhone: Kurze Anleitung „Zum Home-Bildschirm“ in den Einstellungen (Push geht auf iOS nur in der installierten App).

## 2. Push-Erinnerungen (SPEC 6.3b)

- **Planung in der App:** Aus `recommendSleep` für die nächsten 7 Tage werden Erinnerungen erzeugt, jeweils **30 min vor** Zubettgehen und vor dem Nap (Vorlauf in `config.ts`). Der Text ist kurz, z. B. „In 30 min Nap (15:00–16:45), 18:30 losfahren“. Sie werden als Sync-Sammlung `push_reminders` hochgeladen und bei jeder Planänderung neu berechnet (V-Schicht, Urlaub, neue WHOOP-Daten).
- **Abo:** Einstellungen → „Erinnerungen“ einschalten → Browser-Erlaubnis → `pushManager.subscribe` mit öffentlichem VAPID-Key (`VITE_VAPID_PUBLIC_KEY`) → Sammlung `push_subscriptions`. Ausschalten löscht das Abo.
- **Versand:** Edge Function `push-send` (per pg_cron alle 5 min, `X-Cron-Secret`) verschickt fällige, noch nicht gesendete Erinnerungen (höchstens 15 min verspätet, ältere verfallen) an alle Abos des Nutzers. Gesendete werden in `push_sent` vermerkt, damit die App sie nicht überschreibt. Abgelaufene Abos (404/410) werden gelöscht. Versand mit `npm:web-push` (VAPID). Der private Key liegt nur als Function-Secret.
- Service Worker: `push` → Benachrichtigung, Klick → App öffnen.
- Migration 4: `push_subscriptions`, `push_reminders` (Nutzer schreibt eigene, RLS), `push_sent` (nur Service Role).

## 3. Kalender-Export (.ics) – `src/core/export/ics.ts` (rein, getestet)

- RFC 5545: `VCALENDAR` mit `VTIMEZONE` Europe/Berlin (MEZ/MESZ), stabile `UID`s (Einheit/Schicht/Schlaf + Datum), `DTSTAMP`, Zeilen falten (75 Oktette), Sonderzeichen escapen.
- Inhalt je nach Auswahl (alle standardmäßig an): **Trainingseinheiten** (Startzeit, Dauer, Beschreibung mit Ziel, Ablauf, Übungen), **Schichten** (Dienstzeiten, Urlaub ganztägig), **Schlaf/Nap** (empfohlene Zeiten).
- Zeitraum wählbar: nächste 4 Wochen oder gesamter Plan. Download in Einstellungen → Export.
- Die Anpassungen der Erholung sind tagesaktuell, deshalb enthält der Export den geplanten Stand. Das steht auch im Hinweis.

## 4. Dienstplan-Import (.ics) – `src/core/shift/icsImport.ts` (rein, getestet)

- `VEVENT`s lesen (DTSTART/DTEND mit TZID, UTC oder ganztägig, SUMMARY).
- Einordnung: Stichwörter in der Zusammenfassung (Urlaub, frei, krank, Nacht, Tag, V, Fortbildung) haben Vorrang, sonst entscheidet die Uhrzeit: Beginn um ca. 07:00 = T, 19:00 = N, 08:00 = V (Toleranz in `config.ts`). Unbekanntes wird als „nicht erkannt“ gelistet.
- Vergleich mit dem berechneten Rhythmus → Vorschau: nur **Abweichungen** als vorgeschlagene Overrides (V auf Tag 5, Tausch, Urlaub, Krank, Überstunden bei längerem Dienst, Fortbildung). Übernahme erst nach Bestätigung, einzeln abwählbar.

## 5. Vercel

- `vercel.json`: SPA-Rewrites auf `index.html`, Cache-Header (Service Worker ohne Cache, Assets unveränderlich), Sicherheits-Header (`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`).
- Umgebungsvariablen in Vercel: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`, alle öffentlich (Frontend).
- Deploy über GitHub-Import in Vercel. Die Anleitung erklärt Branch und Produktions-Branch.
- Danach anpassen: Supabase Site URL, `APP_URL`-Secret, Privacy-Policy-URL bei WHOOP.

## 6. README.md

Was die App kann, Architektur in Kürze, lokale Entwicklung, alle Befehle, Tests, Ordnerstruktur, Einrichtung in dieser Reihenfolge (Supabase → WHOOP → Automatik → Vercel → Push) mit Verweisen auf die Anleitungen, Sicherheit (Secrets, RLS), Hinweis aus SPEC 13.

## 7. Tests

- Vitest: .ics-Export (Aufbau, Zeitzone, Sommerzeit, Falten, Escaping, Auswahl), Dienstplan-Import (TZID/UTC/ganztägig, Stichwörter, Uhrzeiten, nur Abweichungen), Push-Planung (30 min vorher, Nachtschicht ohne Nachtschlaf-Erinnerung, Änderungen), `push-send`-Logik (fällig, verspätet, verfallen, gesendet vermerkt, 410 → Abo gelöscht)
- `npm run test:db`: Migration 4
- `deno check` für `push-send`
- Playwright: Manifest und Service Worker registriert, **Heute offline lesbar** (offline neu laden), .ics-Download enthält Einheiten, Dienstplan-Import mit Vorschau → Übernahme → V-Schicht im Zyklus, Push-Schalter (Erlaubnis im Test gewährt)
- Lighthouse-ähnliche Prüfung: installierbar (Manifest + SW + Icons)

## 8. Deine Schritte (`docs/LIVEGANG.md`)

1. VAPID-Schlüssel erzeugen (`npx web-push generate-vapid-keys`), öffentlichen Key für Vercel, privaten als Supabase-Secret
2. Migration 4 ausführen, `push-send` deployen, Cron-Job alle 5 min (SQL-Datei)
3. Vercel: Repository importieren, Umgebungsvariablen setzen, deployen
4. Adressen nachziehen: Supabase Site URL, `APP_URL`, WHOOP Privacy Policy
5. Auf dem iPhone: in Safari öffnen → Teilen → „Zum Home-Bildschirm“ → App öffnen → Einstellungen → Erinnerungen an

## 9. Abschluss

Alle Tests, Build und Lint grün → CLAUDE.md (alle Phasen abgehakt) → Commit + Push → Zusammenfassung. Dazu biete ich an, einen Pull Request nach `main` zu erstellen, damit Vercel vom Hauptzweig veröffentlicht.
