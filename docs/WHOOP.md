# WHOOP verbinden (Phase 5)

Voraussetzung: Supabase ist nach `docs/SUPABASE.md` eingerichtet und du kannst dich in der App anmelden.

Du brauchst dafür:
- **Projekt-Ref** deines Supabase-Projekts: der Teil vor `.supabase.co` in der Project URL, z. B. `abcdefgh`
- **App-Adresse:** bis Phase 7 `http://localhost:5173` (lokal mit `npm run dev`), danach die Vercel-Adresse

---

## 1. App im WHOOP Developer Dashboard anlegen

1. <https://developer.whoop.com> öffnen und mit deinem **WHOOP-Konto** anmelden → **Dashboard**.
2. Ein **Team** anlegen, falls noch keins existiert (Name z. B. „Collectr“).
3. **Create App**:
   - **Name:** `Collectr`
   - **Logo:** optional
   - **Contacts:** deine E-Mail-Adresse
   - **Privacy Policy:** `https://<deine-app-adresse>/datenschutz`. Die Seite ist in der App eingebaut. Bis Phase 7 kannst du vorläufig die spätere Vercel-Adresse eintragen und sie danach anpassen.
   - **Redirect URL** (genau so, ohne Schrägstrich am Ende):
     ```
     https://<projekt-ref>.supabase.co/functions/v1/whoop-oauth-callback
     ```
   - **Scopes** (alle anhaken):
     - `read:recovery`
     - `read:cycles`
     - `read:sleep`
     - `read:workout`
     - `read:profile`
     - `read:body_measurement`

     `offline` ist kein Häkchen im Dashboard. Die App fragt es beim Verbinden automatisch an, damit es ein **Refresh-Token** gibt und die Verbindung nicht nach einer Stunde abläuft.
   - **Webhook URL:** vorerst leer lassen (kommt in Phase 6)
4. Speichern. Danach siehst du **Client ID** und **Client Secret**.

> Das **Client Secret** gehört nur in die Supabase-Secrets (nächster Schritt), niemals in die App, `.env.local` oder das Repository.

## 2. Datenbank erweitern

Im Supabase **SQL Editor** den Inhalt von `supabase/migrations/20261002000000_whoop.sql` einfügen und **Run** klicken.

Kontrolle im **Table Editor**: neue Tabellen `whoop_tokens`, `whoop_oauth_states`, `whoop_status`, `whoop_cycles`, `whoop_recoveries`, `whoop_sleeps`, `whoop_workouts`, `whoop_body`, `workout_assignments`. Bei `whoop_tokens` und `whoop_oauth_states` ist RLS an, es gibt aber **keine** Policy. Das ist Absicht: Nur die Edge Functions (Service Role) dürfen die Tokens lesen.

## 3. Edge Functions deployen

Im Projektordner im Terminal (einmalig anmelden, dann verknüpfen):

```bash
npx supabase login
npx supabase link --project-ref <projekt-ref>
```

Secrets setzen (Werte aus Schritt 1, App-Adresse wie oben):

```bash
npx supabase secrets set \
  WHOOP_CLIENT_ID=<client-id> \
  WHOOP_CLIENT_SECRET=<client-secret> \
  WHOOP_REDIRECT_URI=https://<projekt-ref>.supabase.co/functions/v1/whoop-oauth-callback \
  APP_URL=http://localhost:5173
```

Functions deployen. Der Callback wird von WHOOP ohne Supabase-Login aufgerufen und braucht deshalb `--no-verify-jwt`. Abgesichert ist er über den einmaligen `state`:

```bash
npx supabase functions deploy whoop-oauth-start
npx supabase functions deploy whoop-sync
npx supabase functions deploy whoop-disconnect
npx supabase functions deploy whoop-oauth-callback --no-verify-jwt
```

Alternativ ohne Terminal: **Edge Functions → Secrets** im Dashboard für die Secrets. Das Deployen geht aber am einfachsten mit dem Terminal.

`SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` stellt Supabase den Functions automatisch bereit, die musst du nicht setzen.

## 4. In der App verbinden

1. App öffnen → **Einstellungen → WHOOP → Mit WHOOP verbinden**
2. Bei WHOOP anmelden und die Freigabe bestätigen
3. Du landest wieder in den Einstellungen mit „WHOOP wurde verbunden“. Der erste Abruf holt die letzten **90 Tage**.
4. Danach holt die App neue Daten bei jedem Öffnen (höchstens alle 5 Minuten) oder per **Jetzt abrufen**.

Wenn du später auf Vercel umziehst (Phase 7): `APP_URL` per `npx supabase secrets set APP_URL=https://…` anpassen und die Privacy-Policy-URL bei WHOOP prüfen.

## Worauf du beim ersten echten Test achten solltest

WHOOP-Seiten und -API sind aus meiner Entwicklungsumgebung gesperrt. Ich habe die API v2 deshalb nach meinem Wissensstand angebunden und gegen nachgebildete Antworten getestet. Bitte prüfe beim ersten echten Verbinden:

| Prüfen | Wo | Wenn es nicht passt |
|---|---|---|
| Verbindung klappt, zurück in den Einstellungen | App | Meldung „Verbindung fehlgeschlagen: …“ an mich schicken |
| Letzter Abruf mit Anzahl Recoveries/Schlafphasen/Workouts > 0 | Einstellungen → WHOOP | Fehlermeldung unter „Letzter Fehler“ an mich schicken |
| Recovery-Wert in „Heute“ stimmt mit der WHOOP-App überein | Heute | Tag und beide Werte an mich schicken |
| Nach einer Nachtschicht: Schlaftag zeigt die Recovery des Tagschlafs | Heute an Tag 3 | Screenshot an mich |
| Workouts erscheinen im Tracking als erledigt bzw. als Vorschlag | Tracking | Sportart, Zeit und erwartete Einheit an mich |

Alle Adressen und Feldnamen der WHOOP-API stehen gesammelt in `supabase/functions/_shared/whoopApi.ts`. Abweichungen kann ich dort an einer Stelle korrigieren.

## Fehlersuche

| Meldung | Ursache |
|---|---|
| „Secret WHOOP_CLIENT_ID fehlt“ | Schritt 3: Secrets nicht gesetzt |
| „Verbindung fehlgeschlagen: invalid_redirect_uri“ o. ä. | Redirect URL bei WHOOP und `WHOOP_REDIRECT_URI` müssen **exakt** gleich sein |
| „Anmeldung abgelaufen, bitte erneut verbinden“ | Zwischen Klick und Freigabe lagen mehr als 10 Minuten. Einfach nochmal verbinden |
| „WHOOP Token: … Antwort ohne Tokens“ | Scope `offline` wurde nicht gewährt. Trennen und neu verbinden |
| „Nicht angemeldet“ (401) | In der App ab- und wieder anmelden |
