# Livegang (Phase 7)

Voraussetzung: Supabase (`docs/SUPABASE.md`), WHOOP (`docs/WHOOP.md`) und Automatik (`docs/AUTOMATIK.md`) sind eingerichtet.

Ergebnis: Die App läuft unter einer festen Vercel-Adresse, ist auf dem iPhone installiert und schickt Erinnerungen 30 min vor dem Zubettgehen und vor dem Nap.

---

## 1. VAPID-Schlüssel für Push erzeugen

Einmalig im Projektordner:

```bash
npx web-push generate-vapid-keys
```

Du bekommst einen **Public Key** und einen **Private Key**.

- Der **Public Key** ist öffentlich und kommt in Vercel (Schritt 3) als `VITE_VAPID_PUBLIC_KEY`.
- Der **Private Key** gehört nur in die Supabase-Secrets, niemals in Vercel, `.env.local` oder das Repository.

## 2. Supabase: Datenbank, Function, Zeitplan

1. Im **SQL Editor** den Inhalt von `supabase/migrations/20261004000000_push.sql` ausführen.
   Neue Tabellen: `push_subscriptions`, `push_reminders` (beide mit RLS, nur eigene Zeilen) und `push_sent` (nur serverseitig).
2. Secrets setzen und die Function deployen:

   ```bash
   npx supabase secrets set \
     VAPID_PUBLIC_KEY=<public-key> \
     VAPID_PRIVATE_KEY=<private-key> \
     VAPID_SUBJECT=mailto:<deine-email>
   npx supabase functions deploy push-send --no-verify-jwt
   ```

   `push-send` nutzt dasselbe `CRON_SECRET` wie `whoop-sync-all` (aus `docs/AUTOMATIK.md`).
3. Im **SQL Editor** `supabase/sql/push-cron.sql` einfügen, `<PROJEKT-REF>` ersetzen, **Run**.
   Der Zeitplan ruft `push-send` alle 5 Minuten auf. Erinnerungen werden höchstens 15 min verspätet geschickt, ältere verfallen.

## 3. Vercel

1. <https://vercel.com> → **Add New… → Project** → GitHub-Repository **Collectr** importieren.
2. Framework: **Vite** (wird erkannt). Build: `npm run build`, Output: `dist` (steht auch in `vercel.json`).
3. **Environment Variables** (alle sind öffentlich und landen im Frontend):

   | Name | Wert |
   |---|---|
   | `VITE_SUPABASE_URL` | Project URL aus Supabase |
   | `VITE_SUPABASE_ANON_KEY` | anon/public Key aus Supabase |
   | `VITE_VAPID_PUBLIC_KEY` | Public Key aus Schritt 1 |
   | `VITE_LOGIN_EMAIL` | optional: deine Login-E-Mail. Dann zeigt die Anmeldung nur ein Passwort-Feld |

   **Nicht** in Vercel: Service Role Key, WHOOP Client Secret, VAPID Private Key, CRON_SECRET.
4. **Deploy**. Vercel veröffentlicht den **Production Branch** (Standard `main`). Solange die Arbeit auf `claude/gifted-ride-l7rok2` liegt, bekommst du dafür eine Vorschau-Adresse. Für die feste Adresse den Branch nach `main` mergen (Pull Request) oder unter **Settings → Git → Production Branch** umstellen.
5. Die Adresse notieren, z. B. `https://collectr.vercel.app`.

## 4. Adressen nachziehen

| Wo | Was |
|---|---|
| Supabase → Authentication → URL Configuration → **Site URL** | Vercel-Adresse |
| Supabase Secret `APP_URL` | `npx supabase secrets set APP_URL=https://collectr.vercel.app` |
| WHOOP Developer Dashboard → App → **Privacy Policy** | `https://collectr.vercel.app/datenschutz` |

Die Redirect-URL bei WHOOP bleibt unverändert (sie zeigt auf Supabase).

## 5. iPhone

1. Die Vercel-Adresse in **Safari** öffnen und anmelden.
2. **Teilen** (Quadrat mit Pfeil) → **Zum Home-Bildschirm** → **Hinzufügen**.
3. Collectr über das neue Symbol öffnen. Push geht auf dem iPhone nur in der installierten App (ab iOS 16.4).
4. **Einstellungen → Erinnerungen** einschalten und die Mitteilungen erlauben. Darunter stehen die nächsten Erinnerungen.

## Prüfen

- Nach 5–10 Minuten in Supabase: `select * from cron.job_run_details order by start_time desc limit 5;` zeigt erfolgreiche Läufe von `collectr-push`.
- `select id, due_at, title from push_reminders order by due_at limit 5;` zeigt deine geplanten Erinnerungen.
- Die erste Erinnerung kommt 30 min vor der nächsten empfohlenen Schlafenszeit bzw. dem nächsten Nap.
- Fehler beim Versand: **Edge Functions → push-send → Logs**.

## Gut zu wissen

- **Offline:** Die App-Hülle liegt im Service Worker, die Daten in IndexedDB. „Heute“, Zyklus und Plan sind ohne Netz lesbar, Einträge werden später synchronisiert.
- **Updates:** Nach einem neuen Deployment erscheint „Neue Version verfügbar – Neu laden“.
- **Erinnerungen** werden neu berechnet, sobald sich Schichten, Plan oder Schlafbedarf ändern, und beim Öffnen der App hochgeladen. Geplant sind jeweils die nächsten 7 Tage ab dem letzten Öffnen der App.
- **Kalender-Export und Dienstplan-Import:** Einstellungen → „Kalender-Export (.ics)“ bzw. „Dienstplan importieren (.ics)“.
- **Abmelden** entfernt das Push-Abo dieses Geräts.
