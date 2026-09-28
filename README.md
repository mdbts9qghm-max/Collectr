# Collectr – Trainings-App Ehrwald Trail 2027

Mobile-first PWA für die Vorbereitung auf den Ehrwald Trail (86 km, 4295 hm, Start 18.06.2027 23:00 Uhr) im 5-Tage-Schichtrhythmus (Tag, Nacht, Schlaftag, Frei, Frei/V). Laufen und Calisthenics werden nach Schichten und WHOOP-Erholung geplant und täglich angepasst.

> Der Plan ist eine automatische Empfehlung und ersetzt keine Beratung durch Trainer oder Arzt. Bei Schmerzen, Krankheit oder anhaltend schlechten Erholungswerten hat Pause Vorrang.

Verbindliche Vorgabe: [`docs/SPEC.md`](docs/SPEC.md). Architektur und Entscheidungen: [`docs/PLANUNG.md`](docs/PLANUNG.md), [`CLAUDE.md`](CLAUDE.md).

## Was die App kann

- **Plan** vom 02.10.2026 bis zum Rennen: Mesozyklen, Mikrozyklen (5 Tage = ein Schichtzyklus), Entlastung, Taper, Bergwochenenden, Checkliste Rennwoche
- **Schichten**: Rhythmus mit Ankerdatum, V-Schicht, Urlaub, Krank, Tausch, Überstunden, Fortbildung, **Dienstplan-Import (.ics)** mit Vorschau
- **Heute**: angepasste Einheiten mit Begründung, Ampel, Schlafempfehlung, Losfahrzeit
- **Erholung**: WHOOP (OAuth, Webhooks, 2× täglicher Abruf) oder manuelle Eingabe; Recovery, HRV, Ruhepuls, Schlaf mit Schichten als Hintergrund; gelernte Muster
- **Kraft**: Calisthenics-Leitern mit Progression und Tests
- **Tracking** mit automatischer Zuordnung von WHOOP-Workouts
- **Push-Erinnerungen** 30 min vor Zubettgehen und Nap
- **Kalender-Export (.ics)**: Einheiten, Schichten, Schlaf
- **PWA**: installierbar, offline lesbar, lokal zuerst mit Synchronisation (Supabase)

## Architektur

| Teil | Ort | Inhalt |
|---|---|---|
| Kernlogik | `src/core/` | Reines TypeScript ohne React, DOM, Netzwerk und `Date.now()`. Alle Schwellen in `config.ts` |
| Daten | `src/data/` | IndexedDB, Outbox-Sync mit Supabase (neuerer Stand gewinnt, Tombstones) |
| App-Zustand | `src/app/` | Berechnung der Ansichten, Cloud-Anbindung, Push |
| Oberfläche | `src/ui/` | React 19, Tailwind 4, Recharts |
| Service Worker | `src/sw/sw.ts` | Workbox-Precache, Push-Anzeige |
| Server | `supabase/` | Migrationen mit RLS, Edge Functions (Deno): WHOOP-OAuth/-Sync/-Webhook, `push-send` |

## Lokale Entwicklung

```bash
npm install
npm run dev          # http://localhost:5173 (ohne .env.local nur lokal, ohne Konto)
```

Für die Cloud `.env.local` nach `.env.example` anlegen (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, optional `VITE_VAPID_PUBLIC_KEY`).

## Befehle

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver |
| `npm test` | Vitest (Kernlogik, Daten, Edge-Function-Logik) |
| `npm run build` | Typprüfung und Produktions-Build inkl. Service Worker |
| `npm run lint` | oxlint |
| `npm run e2e` | Playwright im Handy-Format (lokal und gegen nachgebildetes Supabase) |
| `npm run test:db` | Migrationen und RLS gegen temporären lokalen Postgres |
| `npm run check:functions` | Typprüfung der Edge Functions mit Deno |
| `npm run plan:print` | Gesamtplan als Tabelle ausgeben |

## Einrichtung (in dieser Reihenfolge)

1. [Supabase](docs/SUPABASE.md): Projekt, Migration, Login
2. [WHOOP](docs/WHOOP.md): Developer-App, Secrets, OAuth-Functions
3. [Automatik](docs/AUTOMATIK.md): Webhook, Zeitplan, Realtime
4. [Livegang](docs/LIVEGANG.md): Push (VAPID), Vercel, Adressen, iPhone

## Sicherheit

- Secrets (WHOOP Client Secret, Tokens, Service Role Key, VAPID Private Key, Cron-Secret) liegen **nur** in den Supabase-Function-Secrets, nie im Frontend oder im Repository. `.env*` ist in `.gitignore`.
- Jede Tabelle hat Row Level Security. Nutzer sehen nur eigene Zeilen, WHOOP-Tokens und das Push-Versandprotokoll sind nur für die Service Role zugänglich.
- Webhooks werden per HMAC-Signatur geprüft, Zeitpläne per `X-Cron-Secret`.

## Screenshots

Siehe [`docs/screenshots/`](docs/screenshots/) (werden von `npm run e2e` erzeugt).
