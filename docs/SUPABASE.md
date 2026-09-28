# Supabase einrichten (Phase 4)

Diese Schritte machst du einmalig selbst im Supabase-Dashboard. Danach meldet sich die App mit deiner E-Mail und deinem Passwort an und synchronisiert alle Daten. Offline bleibt alles nutzbar, die Änderungen werden später hochgeladen.

Die Menünamen in Supabase ändern sich gelegentlich. Wenn ein Punkt anders heißt, such nach dem fett gedruckten Begriff.

---

## 1. Konto und Projekt anlegen

1. Auf <https://supabase.com> ein Konto anlegen (Anmeldung mit GitHub oder E-Mail).
2. **New project** wählen:
   - **Name:** z. B. `collectr`
   - **Database Password:** ein langes, zufälliges Passwort. Speichere es in deinem Passwort-Manager. Die App braucht es nicht, du brauchst es aber für spätere Wartung.
   - **Region:** **Central EU (Frankfurt)**. Warum: Deine Gesundheitsdaten (Schlaf, Erholung) bleiben in der EU, und die Wege zum Handy sind kurz.
   - Tarif: **Free** reicht für einen Nutzer.
3. Warten, bis das Projekt bereit ist (1–2 Minuten).

## 2. Datenbank-Schema anlegen

1. Links **SQL Editor** öffnen und **New query** wählen.
2. Den kompletten Inhalt von `supabase/migrations/20261001000000_init.sql` aus dem Repository einfügen.
3. **Run** klicken. Es sollte „Success. No rows returned“ erscheinen.
4. Kontrolle unter **Table Editor**: Es gibt 8 Tabellen (`settings`, `shift_overrides`, `session_logs`, `manual_readiness`, `strength_tests`, `strength_state`, `checklist`, `adjustment_decisions`). Jede zeigt das Schloss-Symbol bzw. **RLS enabled**.

Was das Schema tut: Jede Zeile gehört genau einem Nutzer. Die **Row Level Security** sorgt dafür, dass man nur eigene Zeilen lesen und ändern kann. Ohne Anmeldung (Rolle `anon`) ist gar nichts sichtbar. Das habe ich lokal mit Postgres getestet (`npm run test:db`).

## 3. Anmeldung per E-Mail und Passwort einstellen

1. **Authentication → Sign In / Providers** (manchmal **Providers**) öffnen.
2. **Email** muss aktiv sein.
3. **Confirm email** ausschalten. Warum: Du legst deinen Nutzer im nächsten Schritt selbst an und bestätigst ihn direkt. Eine Bestätigungs-Mail ist dann unnötig.

## 4. Deinen Nutzer anlegen

1. **Authentication → Users → Add user → Create new user**.
2. Deine E-Mail-Adresse und ein sicheres Passwort eingeben.
3. **Auto Confirm User** anhaken.
4. **Create user**.

## 5. Neue Registrierungen abschalten (wichtig)

1. **Authentication → Sign In / Providers** (bzw. **Settings**), dort **Allow new users to sign up** ausschalten.
2. Warum: Die App ist nur für dich. Ohne diese Einstellung könnte sich jede Person mit der öffentlichen Projekt-Adresse ein eigenes Konto anlegen. Sie sähe zwar dank RLS nichts von deinen Daten, könnte aber dein Projekt mit eigenen Daten füllen.

## 6. Schlüssel für die App kopieren

1. **Project Settings → API** (bzw. **API Keys** / **Data API**) öffnen.
2. Kopieren:
   - **Project URL**, z. B. `https://abcdefgh.supabase.co`
   - **anon public** Key bzw. **Publishable key** (beginnt mit `eyJ…` oder `sb_publishable_…`)
3. **Nicht** kopieren und **nie** in die App oder das Repo: den **service_role** bzw. **Secret key**. Der hat Vollzugriff und wird erst in Phase 5 in den Edge Functions (serverseitig) gebraucht.
4. Zum lokalen Ausprobieren im Projektordner die Datei `.env.local` anlegen (sie ist in `.gitignore` und landet nie im Repo):

   ```
   VITE_SUPABASE_URL=https://abcdefgh.supabase.co
   VITE_SUPABASE_ANON_KEY=dein-anon-oder-publishable-key
   ```

   Dann `npm run dev` starten. Die App zeigt jetzt die Anmeldung.
5. Für die Vercel-Version trägst du dieselben zwei Werte in Phase 7 unter **Vercel → Project → Settings → Environment Variables** ein. Ich führe dich dann durch.

Der anon/publishable Key ist dafür gedacht, im Frontend zu stehen. Den Schutz übernimmt die Row Level Security, nicht die Geheimhaltung dieses Schlüssels.

## 7. (Später) Adresse der App eintragen

Sobald die App in Phase 7 auf Vercel läuft: **Authentication → URL Configuration → Site URL** auf die Vercel-Adresse setzen, z. B. `https://collectr.vercel.app`.

---

## Was beim ersten Login passiert

- Alle Daten, die du bisher lokal eingetragen hast, werden einmalig hochgeladen (Umzug).
- Liegen in der Cloud schon Daten (z. B. von einem zweiten Gerät), gewinnt pro Eintrag der neuere Stand.
- Das simulierte Datum bleibt auf dem jeweiligen Gerät und wird nicht synchronisiert.
- Oben rechts zeigt die App den Status: „Synchron“, „n ausstehend“, „Offline“ oder „Sync-Fehler“. Ein Tipp darauf synchronisiert sofort.
- **Alle Daten zurücksetzen** in den Einstellungen löscht, wenn du angemeldet bist, auch die Daten in der Cloud.

## Fehlersuche

| Meldung | Ursache |
|---|---|
| „E-Mail oder Passwort falsch.“ | Tippfehler, oder der Nutzer ist nicht bestätigt (Schritt 4: Auto Confirm) |
| „Sync-Fehler … permission denied“ | Das Schema wurde nicht vollständig eingespielt (Schritt 2 wiederholen) |
| „Sync-Fehler … relation does not exist“ | Das Schema fehlt (Schritt 2) |
| App zeigt keine Anmeldung | `.env.local` fehlt oder die Werte sind leer. Den Entwicklungsserver nach dem Anlegen neu starten |
