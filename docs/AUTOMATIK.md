# Automatik einrichten (Phase 6)

Voraussetzung: WHOOP ist nach `docs/WHOOP.md` verbunden.

Ergebnis: Neue WHOOP-Daten kommen ohne Zutun an, direkt nach dem Aufwachen per Webhook (auch nach dem Tagschlaf nach der Nachtschicht). Zweimal täglich läuft zusätzlich ein Abruf als Rückfallebene. Eine geöffnete App aktualisiert sich sofort (Realtime).

---

## 1. Datenbank: Live-Aktualisierung

Im Supabase **SQL Editor** den Inhalt von `supabase/migrations/20261003000000_realtime.sql` ausführen.
Das nimmt die Tabelle `whoop_status` in Supabase Realtime auf. RLS gilt dabei weiter, du bekommst nur Änderungen an deiner eigenen Zeile.

## 2. Secret und Functions

Ein zufälliges Secret für den Zeitplan erzeugen, z. B. im Terminal:

```bash
openssl rand -hex 32
```

Dann setzen und die zwei neuen Functions deployen. Beide werden nicht von der App aufgerufen, sondern von WHOOP bzw. vom Zeitplan, deshalb `--no-verify-jwt`. Abgesichert sind sie über die WHOOP-Signatur bzw. das Secret:

```bash
npx supabase secrets set CRON_SECRET=<dein-zufälliges-secret>
npx supabase functions deploy whoop-webhook --no-verify-jwt
npx supabase functions deploy whoop-sync-all --no-verify-jwt
```

## 3. Webhook bei WHOOP eintragen

1. <https://developer.whoop.com> → Dashboard → deine App **Collectr** → bearbeiten
2. **Webhook URL:**
   ```
   https://<projekt-ref>.supabase.co/functions/v1/whoop-webhook
   ```
3. **Webhook Model Version:** **v2**
4. Speichern

Die Function prüft jede Nachricht mit der Signatur von WHOOP (HMAC-SHA256 mit deinem Client Secret) und lehnt gefälschte oder alte Nachrichten ab.

## 4. Zeitplan (2× täglich)

1. **Database → Extensions:** `pg_cron` und `pg_net` aktivieren
2. Im **SQL Editor** den Inhalt von `supabase/sql/cron.sql` einfügen und darin ersetzen:
   - `<PROJEKT-REF>` (zweimal)
   - `<CRON-SECRET>` (einmal, derselbe Wert wie in Schritt 2)
3. **Run**

Zeiten: 09:30 und 15:30 Uhr im Sommer, 08:30 und 14:30 Uhr im Winter. pg_cron rechnet in UTC, deshalb verschieben sich die Zeiten mit der Zeitumstellung. Beide liegen aber nach dem Nachtschlaf bzw. nach dem Tagschlaf (08:00–14:00).

Kontrolle im SQL Editor:

```sql
select jobname, schedule from cron.job;
select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
```

## 5. Prüfen

- Morgen nach dem Aufwachen: **Einstellungen → WHOOP → Letzter Abruf** zeigt eine Zeit kurz nach deinem Aufwachen, ohne dass du die App geöffnet hast.
- Nach der nächsten Nachtschicht: Am Schlaftag gegen 14–15 Uhr ist die Recovery des Tagschlafs in „Heute“ zu sehen.
- Fehler stehen unter „Letzter Fehler“. Webhook-Aufrufe siehst du in Supabase unter **Edge Functions → whoop-webhook → Logs**.

## Neu in der App

- **Tab „Erholung“:** Recovery, HRV (mit 7-Tage-Mittel), Ruhepuls und Schlaf (mit Bedarf) über 14/30/60 Tage. Schichten als Hintergrundfarbe (Orange = Tagdienst, Blau = Nachtschicht, helles Blau = Schlaftag), alternativ als Tabelle.
- **Auswertungen:** ab ca. 6 Wochen Daten, z. B. „Nach Nachtschichten: Recovery im Schnitt 18 Punkte niedriger (12 Beobachtungen)“.
- **Einstellungen → Gelernte Muster:** Wenn eingeschaltet, rechnet die Vorausschau den typischen Recovery-Abfall (z. B. nach der Nachtschicht vor einem langen Lauf) mit ein. Standard: aus.
- **Schlaf-Empfehlungen umgesetzt:** Anteil der letzten 14 Tage, an denen Zubettgehen und Aufstehen höchstens 30 min von der Empfehlung abwichen.
