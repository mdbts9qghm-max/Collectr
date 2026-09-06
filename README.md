# Hybrid Athlete OS

Ein persönliches Trainings-, Habit- und Aufgabensystem für einen Hybrid Athleten im
Schichtdienst. Die App dokumentiert nicht nur, sie beantwortet jeden Tag eine Frage:

> Was ist heute die sinnvollste Entscheidung, um langfristig ein leistungsfähiger Hybrid
> Athlete zu werden — ohne Regeneration und Alltagstauglichkeit zu zerstören?

## Schnellstart

```bash
npm install
npm run dev            # Entwicklungsserver
npm run build          # Produktions-Build
npm run preview        # Build lokal testen
npm test               # Unit-Tests der Trainingslogik
npm run verify:deploy  # Produktions-Build gegen die echten Vercel-Header prüfen
npm run verify:update  # Update-Pfad im Browser durchspielen
```

## Deployment auf Vercel

Das Repo ist fertig konfiguriert (`vercel.json`) — Framework-Preset, Build-Befehl,
Ausgabeverzeichnis, Cache- und Security-Header sind gesetzt. Es sind keine
Umgebungsvariablen nötig, weil die App keinen Server und keine API-Schlüssel hat.

**Einmalige Einrichtung:**

1. Auf [vercel.com/new](https://vercel.com/new) das GitHub-Repo importieren.
2. Alle Vorgaben bestätigen — Vercel erkennt Vite und liest `vercel.json`.
3. **Deploy**.

Danach ist nichts mehr manuell zu tun: Vercel beobachtet `main` und deployt bei
**jedem Push automatisch** auf dieselbe Produktions-URL. Pushes auf andere Branches
erzeugen Preview-Deployments mit wechselnden URLs — für die zum Home-Bildschirm
hinzugefügte App zählt nur `main`.

Alternativ per CLI:

```bash
npx vercel            # Vorschau-Deployment
npx vercel --prod     # Produktion
```

### Updates auf dem Gerät

Eine zum Home-Bildschirm hinzugefügte App merkt von einem neuen Deployment nichts, solange
sie im Hintergrund liegt. Deshalb prüft die App selbst: stündlich, beim Zurückkehren in den
Vordergrund und bei wiederhergestellter Verbindung. Findet sie eine neue Version, erscheint
unten eine Leiste — *Neue Version verfügbar · Später · Neu laden*.

Der Neustart passiert nie von allein. Ein stiller Reload mitten im Check-in würde die
Eingaben verwerfen, deshalb entscheidet der Tap. *Später* gilt für die laufende Sitzung;
beim nächsten Öffnen wird erneut gefragt. In den Einstellungen gibt es zusätzlich
**Jetzt nach Update suchen**.

### Vor dem Deploy lokal prüfen

```bash
npm run verify:deploy   # Build gegen die echten Vercel-Header, inkl. Offline-Test
npm run verify:update   # baut zwei Versionen und prüft den kompletten Update-Pfad
```

`verify:deploy` prüft Start unter der strengen Content-Security-Policy, erreichbares
Manifest mit korrektem Content-Type, alle Icons, aktiven Service Worker, Funktion im
Flugmodus und Deep-Links im Offline-Zustand.

`verify:update` baut zwei Versionen, tauscht die ausgelieferte Version hinter der laufenden
App aus — genau das, was ein Deployment tut — und prüft, dass die Leiste erscheint, dass
*Später* sie schließt, dass beim nächsten Start erneut gefragt wird und dass *Neu laden*
tatsächlich die neue Version bringt.

Beide brauchen einmalig einen Browser: `npx playwright install chromium`.

### Wer kann darauf zugreifen?

Ein Vercel-Deployment ist standardmäßig öffentlich erreichbar. Das ist hier weniger
heikel als es klingt: Die App hat keinen Server und keine Datenbank — wer die URL
aufruft, sieht eine leere App mit einer eigenen, lokalen Datenbank im eigenen Browser.
Deine Trainingsdaten liegen ausschließlich auf deinem Gerät und werden nie übertragen.

Wenn die URL trotzdem nicht auffindbar sein soll, aktiviere in den Vercel-Projekt­einstellungen
unter *Deployment Protection* den Passwortschutz oder Vercel Authentication.

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
