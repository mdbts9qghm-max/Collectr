# Phase 4: Supabase (Login, Schema, RLS, Umzug der Daten)

## Kontext

Bisher liegen alle Daten nur lokal in IndexedDB. Phase 4 (SPEC 10, 12.4) bringt Supabase als Backend: Login für dich als einzigen Nutzer, Postgres-Schema mit Row Level Security und den Umzug der lokalen Daten.
Entscheidungen: **Login mit E-Mail + Passwort**. **Offline lesen und eintragen**, danach automatisch synchronisieren.
Hinweis: Diese Umgebung erreicht Supabase nicht (Netzwerk gesperrt). Schema und RLS teste ich deshalb lokal mit Postgres 16. Das echte Projekt legst du nach meiner Anleitung selbst an.

## 1. Architektur: lokal zuerst, dann synchronisieren

```
UI ─► SyncingRepository (Repository-Interface bleibt gleich)
        ├─ IndexedDbRepository (Quelle für die UI, offline)  + Outbox-Store (ausstehende Änderungen)
        └─ SyncEngine ─► SupabaseRemote (@supabase/supabase-js)
```

- Jede Änderung wird sofort lokal gespeichert und landet zusätzlich in der **Outbox** (Sammlung, Schlüssel, Daten oder Löschung, `updatedAt`).
- **Sync** beim Start, beim Wieder-Online-Gehen, nach jeder Änderung (entprellt) und manuell:
  1. Outbox hochladen (Upsert, Löschungen als Tombstone `deleted = true`)
  2. Änderungen seit dem letzten Abruf holen (`updated_at > cursor`) und lokal übernehmen
- Konflikte werden pro Datensatz gelöst, **der neuere Stand gewinnt** (`updated_at`). Das reicht für einen Nutzer mit Handy und ggf. Browser.
- **Ohne Supabase-Konfiguration** (`VITE_SUPABASE_URL` fehlt) läuft die App wie bisher nur lokal, ohne Login. Das gilt für Entwicklung, Tests und Playwright.
- **Umzug:** Beim ersten Login werden alle vorhandenen lokalen Daten in die Outbox gelegt und hochgeladen. Liegen in der Cloud schon Daten, werden sie nach „neuerer Stand gewinnt“ zusammengeführt.
- Die Schlüssel im Frontend sind nur die öffentliche URL und der Anon/Publishable Key (dafür vorgesehen). Die Service Role bleibt ausschließlich serverseitig und kommt erst in Phase 5 (Edge Functions) zum Einsatz.

## 2. Datenbankschema (`supabase/migrations/20261001000000_init.sql`)

Eine Tabelle pro Sammlung (1:1 zu den lokalen Stores). Alle Tabellen haben das gleiche Grundgerüst:
`user_id uuid default auth.uid() references auth.users on delete cascade`, Schlüsselspalte, `data jsonb`, `updated_at timestamptz`, `deleted boolean`, PK `(user_id, key)`, Index auf `(user_id, updated_at)`.

| Tabelle | Schlüssel | Inhalt |
|---|---|---|
| `settings` | `key` ('settings') | Profil, Ankerdatum, Gewichte, Demo, Urlaubs-Bestätigung (`simulatedDate` bleibt lokal) |
| `shift_overrides` | `date` | V, Urlaub, Krank, Tausch … |
| `session_logs` | `session_id` (+ `date`) | Tracking |
| `manual_readiness` | `date` | manuelle Erholung |
| `strength_tests` | `date` | Krafttests |
| `strength_state` | `key` | Kraftstand |
| `checklist` | `key` | Rennwochen-Checkliste |
| `adjustment_decisions` | `session_id` | Anpassung abgelehnt |

- Trigger setzt `updated_at = now()` serverseitig (Grundlage für den Abruf-Cursor), Client-Zeit steht zusätzlich in `data` für den Konfliktvergleich.
- **RLS** auf allen Tabellen: `select/insert/update/delete` nur, wenn `user_id = auth.uid()`. Der Rolle `anon` wird alles entzogen.
- Die WHOOP-Tabellen (Tokens, Zyklen …) folgen in Phase 5.

## 3. Code

- `src/data/remote.ts`: `RemoteStore`-Interface (push, pull seit Cursor) + `SupabaseRemote`
- `src/data/sync.ts`: `SyncEngine` (Outbox, Push/Pull, neuerer Stand gewinnt, Status: synchron / offline mit n ausstehend / Fehler)
- `src/data/syncingRepository.ts`: implementiert `Repository`, schreibt lokal + Outbox, stößt den Sync an
- `src/data/indexedDb.ts`: DB-Version 2 mit `outbox`- und `meta`-Store (Cursor, `updatedAt` je Datensatz)
- `src/app/auth.tsx`: Supabase-Client aus `import.meta.env`, Sitzung, Login/Logout
- UI: Login-Seite (E-Mail + Passwort), Sync-Anzeige im Kopf (●/↻/offline), Einstellungen „Konto“: angemeldet als …, „Jetzt synchronisieren“, Abmelden
- `.env.example`: `VITE_SUPABASE_URL=`, `VITE_SUPABASE_ANON_KEY=`

## 4. Tests

- Vitest: SyncEngine mit einem In-Memory-Remote. Abgedeckt sind Offline-Eintrag → später hochgeladen, Pull übernimmt neuere Remote-Daten, der neuere Stand gewinnt in beide Richtungen, Löschung als Tombstone, Erst-Umzug lokaler Daten, fehlende Konfiguration → nur lokal.
- **SQL-Test mit lokalem Postgres 16** (`npm run test:db`, Skript `supabase/tests/rls.sh`): startet einen temporären Cluster, legt einen Stub für `auth.users`, `auth.uid()` und die Rollen an und spielt die Migration ein. Geprüft wird: Nutzer A sieht und ändert nur eigene Zeilen, Nutzer B sieht nichts von A, `anon` sieht nichts, `updated_at` wird gesetzt.
- Playwright: der bestehende Durchgang läuft unverändert (nur lokal).

## 5. Deine Schritte im Supabase-Dashboard (`docs/SUPABASE.md`, Schritt für Schritt)

1. Konto anlegen und ein **neues Projekt** anlegen (Region **Frankfurt / eu-central-1**, sicheres DB-Passwort notieren)
2. **SQL Editor** → Inhalt der Migrationsdatei einfügen → Run
3. **Authentication → Sign In / Providers → Email**: aktiv, „Confirm email“ aus (du legst den Nutzer selbst an)
4. **Authentication → Users → Add user**: deine E-Mail + Passwort, „Auto Confirm User“
5. Danach **Neuanmeldungen abschalten** („Allow new users to sign up“ aus), damit niemand sonst ein Konto anlegen kann
6. **Project Settings → API**: Project URL und anon/publishable Key kopieren → in `.env.local` (lokal) eintragen. In Vercel folgt das in Phase 7.
7. Optional: **Authentication → URL Configuration**: Site URL auf die spätere Vercel-Adresse setzen

Ich erkläre jeden Schritt mit dem Grund dafür und dem, worauf du achten musst.

## 6. Abschluss

`npm test`, `npm run test:db`, `npm run e2e`, `npm run build`, `npm run lint` grün → CLAUDE.md aktualisieren → Commit + Push → Anleitung an dich → Planung Phase 5 im Plan-Modus.
