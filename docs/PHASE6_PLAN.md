# Phase 6: Automatik (Webhooks, täglicher Abruf, Erholungs-Ansicht, Auswertungen)

## Kontext

SPEC 8, 6.4, 9.5 und 12.6: Die Daten sollen ohne Zutun aktuell sein. Dafür kommen WHOOP-Webhooks (direkt nach dem Aufwachen, auch nach dem Tagschlaf) und ein täglicher Abruf im Hintergrund als Rückfallebene. Dazu die Erholungs-Ansicht mit Schichten als Hintergrundfarbe und die Auswertungen nach ca. 6 Wochen.
Entscheidungen: **Push-Erinnerungen kommen in Phase 7** (mit PWA und Service Worker). **Gelernte Muster werden immer angezeigt und fließen per Schalter in die Vorausschau ein** (Standard aus).

## 1. Webhooks (`supabase/functions/whoop-webhook`)

- WHOOP ruft die Function bei `recovery.updated`, `sleep.updated`, `workout.updated` (sowie `*.deleted`) auf. Die Payload enthält `user_id`, `id`, `type` und `trace_id`.
- **Signatur prüfen:** `X-WHOOP-Signature` = Base64(HMAC-SHA256(`X-WHOOP-Signature-Timestamp` + Rohdaten, Client Secret)). Verglichen wird in konstanter Zeit, Zeitstempel älter als 10 min werden abgelehnt (Schutz gegen Wiederholung). Ungültig → 401.
- WHOOP-`user_id` → unser Nutzer über `whoop_tokens.whoop_user_id` (in Phase 5 schon gespeichert).
- **Robust statt Einzelabruf:** Bei jedem Ereignis ein inkrementeller Abruf (`syncWhoop` mit `force`, Überlappung 2 Tage). Das sind wenige Anfragen, und die Logik ist schon getestet. Die Einzel-Endpunkte bleiben dadurch unkritisch, falls ich sie falsch kenne. `*.deleted` markiert die Zeile als gelöscht.
- Antwort sofort 2xx (WHOOP wiederholt sonst). Fehler landen im `whoop_status.lastError`. Doppelte Ereignisse sind unschädlich, weil der Abruf idempotent ist.
- `verify_jwt = false` (WHOOP sendet kein Supabase-JWT), abgesichert über die Signatur.

## 2. Täglicher Abruf (Rückfallebene)

- Function `whoop-sync-all`: nur mit Header `X-Cron-Secret` (Secret `CRON_SECRET`, konstante Zeit). Holt für alle verbundenen Nutzer neue Daten.
- Zeitplan per **pg_cron + pg_net** (SQL in `supabase/sql/cron.sql`, nicht als Migration, weil es Projekt-URL und Secret enthält). **2× täglich: 09:30 und 15:30 Berlin** (nach dem Nachtschlaf bzw. nach dem Tagschlaf nach der Nachtschicht). Das Secret liegt im Supabase Vault, nicht im SQL.
- Dazu ein Abruf beim Öffnen der App wie in Phase 5.

## 3. Live-Aktualisierung in der App

- Supabase **Realtime** auf `whoop_status`: Ändert sich der Status (neuer Abruf per Webhook/Cron), synchronisiert die geöffnete App sofort. Damit passen sich Ampel und Einheiten direkt nach dem Aufwachen an. Ohne Realtime greift der Sync beim Öffnen und Sichtbarwerden.
- Migration 3: `whoop_status` zur Realtime-Publication hinzufügen.

## 4. Erholungs-Ansicht (SPEC 9.5) – neuer Tab „Erholung“

- Zeitraum umschaltbar: 14 / 30 / 60 Tage.
- Kleine Diagramme untereinander, **je eine Größe und eine Achse** (kein Doppelachsen-Diagramm): Recovery (%, mit grün/gelb/rot-Grenzen), HRV (ms, mit 7-Tage-Mittel), Ruhepuls (bpm), Schlaf (h, Soll-Bedarf als Linie).
- **Schichten als Hintergrundfarbe** über alle Diagramme: Tagschicht, Nachtschicht, Schlaftag, frei/Urlaub, V (Farben geprüft, dazu eine Legende). Tabellenansicht als Alternative.
- Zusätzlich **Schlaf-Umsetzung** (SPEC 6.3b): Quote „Empfehlung umgesetzt“ der letzten 14 Tage (`sleepAdherence`) und Liste der Abweichungen.
- Die Navigation bekommt 6 Tabs (Heute, Zyklus, Plan, Erholung, Kraft, Tracking). Das prüfe ich im Handy-Format auf Platz.

## 5. Auswertungen (SPEC 6.4) – `src/core/recovery/patterns.ts` (rein, getestet)

- Ab mindestens **42 Tagen** mit Daten (Schwelle in `config.ts`):
  - **Nachtschicht:** mittlere Recovery/HRV am Schlaftag vs. an freien Tagen ohne Nachtschicht davor
  - **Langer Lauf** (≥ Schwelle km bzw. Schlüssel-Lauf) und **Krafttraining (schwere Beine)**: Recovery/HRV am Folgetag vs. persönlicher Median
  - Ausgabe: Differenz in Prozentpunkten bzw. %, Anzahl Beobachtungen, Aussagekraft (wenig/ausreichend)
- Anzeige in der Erholungs-Ansicht als kurze Sätze, z. B. „Nach Nachtschichten liegt deine Recovery im Schnitt 18 Punkte niedriger (12 Beobachtungen).“
- **Schalter in den Einstellungen** „Gelernte Muster in der Vorausschau nutzen“ (Standard aus). Wenn an: `expectedDropPct` für die kommende Nachtschicht bzw. den kommenden langen Lauf wird an `adjustSession` übergeben (Schnittstelle existiert seit Phase 2).

## 6. Tägliche Anpassung

Bleibt clientseitig und deterministisch: Mit neuen Daten (Webhook → Realtime → Sync) berechnet die App Readiness, Anpassungen und Mikrozyklus-Reduktion neu (`compute.ts`). Es gibt keine serverseitige Planlogik (SPEC 10: Logik in `src/core`).

## 7. Tests

- Vitest: Signaturprüfung (gültig, falsch, zu alt, manipuliert), Webhook-Handler (Nutzer-Zuordnung, unbekannter Nutzer → 200 ohne Aktion, deleted → Zeile gelöscht, Fehler → Status), `whoop-sync-all` (Secret, mehrere Nutzer, Fehler eines Nutzers bricht nicht ab), Muster (Nachtschicht-Dip aus den Beispieldaten erkannt, zu wenige Daten → keine Aussage), Erholungs-Datenaufbereitung
- `npm run test:db`: Migration 3
- `deno check` für die neuen Functions
- Playwright: Erholungs-Tab mit Demo-Daten (Diagramme, Schicht-Hintergrund, Tabelle), Schalter „Muster nutzen“, keine horizontale Scrollleiste

## 8. Deine Schritte (`docs/AUTOMATIK.md`)

1. Migration 3 im SQL Editor ausführen
2. Secrets setzen (`CRON_SECRET` zufällig) und `whoop-webhook` (`--no-verify-jwt`) sowie `whoop-sync-all` (`--no-verify-jwt`) deployen
3. Im WHOOP Developer Dashboard: **Webhook URL** `https://<projekt-ref>.supabase.co/functions/v1/whoop-webhook`, Version v2
4. **Database → Extensions:** `pg_cron` und `pg_net` aktivieren, CRON_SECRET im Vault ablegen, `supabase/sql/cron.sql` im SQL Editor ausführen (Projekt-Ref einsetzen)
5. Kontrolle: Einstellungen → WHOOP → „Letzter Abruf“ aktualisiert sich nach dem Aufwachen von selbst

## 9. Abschluss

`npm test`, `npm run test:db`, `npm run check:functions`, `npm run e2e`, `npm run build`, Lint grün → CLAUDE.md → Commit + Push → Anleitung → Planung Phase 7 im Plan-Modus.
