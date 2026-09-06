# Hybrid Athlete OS

Ein persönliches Trainings-, Habit- und Aufgabensystem für einen Hybrid Athleten im
Schichtdienst. Die App dokumentiert nicht nur, sie beantwortet jeden Tag eine Frage:

> Was ist heute die sinnvollste Entscheidung, um langfristig ein leistungsfähiger Hybrid
> Athlete zu werden — ohne Regeneration und Alltagstauglichkeit zu zerstören?

## Schnellstart

```bash
npm install
npm run dev        # Entwicklungsserver
npm run build      # Produktions-Build
npm run preview    # Build lokal testen
npm test           # Unit-Tests der Trainingslogik
```

## Auf dem iPhone installieren

Die App ist eine installierbare PWA und läuft danach vollständig offline.

1. Build deployen (jeder statische Host genügt — Netlify, Vercel, GitHub Pages).
2. Die URL in Safari öffnen.
3. Teilen → **Zum Home-Bildschirm**.

Danach startet sie im Vollbild ohne Browserleiste, funktioniert ohne Verbindung und
speichert alles lokal auf dem Gerät.

## Wo liegen meine Daten?

Ausschließlich auf dem Gerät, in IndexedDB. Es gibt keinen Server, keinen Account und
keine Übertragung an Dritte. Deshalb ist Export ein erstklassiges Feature:

* **Profil → Daten → Vollständiges Backup (JSON)** sichert alles und lässt sich auf
  einem anderen Gerät wieder einspielen.
* CSV-Export für Trainings, Habits, Check-ins und Aufgaben zur Auswertung in
  Tabellenkalkulationen.

Ein Backup vor jedem Gerätewechsel oder Browser-Reset ist Pflicht — Safari räumt
Website-Daten unter Speicherdruck auf.

## Dokumentation

* [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Tech-Stack-Entscheidungen, Modulaufbau,
  Datenmodell, Navigation.
* [`docs/TRAINING-LOGIC.md`](docs/TRAINING-LOGIC.md) — Belastungsmodell, Readiness,
  Empfehlungs-Engine, Hybrid Score, Habit- und Schichtlogik samt Quellen der Faustregeln.

## Wichtiger Hinweis

Die App gibt Trainingshinweise auf Basis der eingetragenen Daten. Sie stellt keine
medizinischen Diagnosen und ersetzt keine ärztliche Beratung.
