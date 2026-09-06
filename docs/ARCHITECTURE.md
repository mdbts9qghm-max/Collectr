# Architektur

## 1. Produktidee in einem Absatz

Eine private App, die Schichtplan, Erholung, Trainingshistorie, Ziele, Habits und
Aufgaben zu einer einzigen täglichen Entscheidung verdichtet. Der Kern ist keine Liste,
sondern eine Empfehlungs-Engine: Sie kennt die Grenzen des Schichtdienstes, den aktuellen
Belastungszustand und die langfristigen Ziele und schlägt daraus die Einheit vor, die
heute den größten Beitrag leistet — inklusive vollständiger Begründung und der Option,
sie abzulehnen.

## 2. Getroffene Annahmen

Die Anforderung ließ einige Punkte offen. Statt nachzufragen wurden begründete Annahmen
getroffen; alle sind in den Einstellungen änderbar.

| Offener Punkt | Annahme | Begründung |
| --- | --- | --- |
| Zieldatum des 100-km-Ultra | 12 Monate ab Installation | Von 25 min auf 5 km ist ein 100er ein Mehrjahresprojekt; 12 Monate sind der erste Makrozyklus, das Datum ist frei setzbar. |
| Reihenfolge der Schichtrotation | T,T,N,S,F,F | Aus den beschriebenen Schichtarten abgeleitet; dient nur dem Schnell-Ausfüllen des Kalenders, jeder Tag ist einzeln überschreibbar. |
| Körpergewicht | 75 kg (Mitte von 70–80) | Wird vom letzten Check-in überschrieben, sobald einer existiert. |
| Maximalpuls | 196 (220 − Alter) | Nur zur Zonenanzeige; das Belastungsmodell braucht ihn nicht. |
| Schwellenpace | 5:00 /km | Aus der 5-km-Bestzeit von ~25 min abgeleitet. |
| Sprache | Deutsch | Die Anforderung war durchgehend deutsch. |
| Wochenumfang | 10 h Ziel, 5 Trainingstage | Untergrenze der genannten 10–12 h — realistischer Startwert, der eher übertroffen als verfehlt wird. |

## 3. Tech-Stack und die Gründe dafür

| Entscheidung | Alternative | Warum so |
| --- | --- | --- |
| **PWA (Vite + React + TypeScript)** | React Native / Expo | Läuft ohne Apple-Developer-Account, App-Store-Review und Build-Pipeline auf iPhone, iPad und Desktop aus einer Codebasis. Zum Home-Bildschirm hinzugefügt ist sie vom Nutzungsgefühl kaum von einer nativen App zu unterscheiden. Eine App, die man täglich über Jahre nutzt, darf nicht an einem abgelaufenen Zertifikat sterben. |
| **IndexedDB, alles im Speicher** | SQLite / Server-Backend | Ein persönliches Trainingstagebuch umfasst auch nach Jahren wenige tausend Zeilen. Der komplette Datensatz passt in den Arbeitsspeicher, wodurch jede abgeleitete Berechnung — Load, Readiness, Score, Empfehlung — **synchron** läuft. Kein Ladezustand, keine Race Conditions, echte Offline-Fähigkeit. |
| **Zustand** | Redux, Context | Minimaler Boilerplate, keine Provider-Pyramide, selektives Re-Rendering ohne Memo-Akrobatik. |
| **Eigene SVG-Charts** | Recharts, Chart.js | Die Diagramme sind Teil des Designsystems, nicht Fremdkörper darin. Eigene Komponenten sind ~9 kB statt ~120 kB, folgen exakt den Farbtokens und funktionieren in beiden Themes ohne Sonderfälle. |
| **CSS mit Custom Properties** | Tailwind, CSS-in-JS | Ein Theme-Wechsel ist ein Variablen-Swap. Kein Runtime-Overhead, keine Abhängigkeit von einer Utility-Version. |
| **HashRouter** | BrowserRouter | Funktioniert auf jedem statischen Host ohne Server-Rewrites und im `file://`-Kontext. |
| **Reine Domänenfunktionen** | Logik in Komponenten | Die gesamte Trainingslogik ist frei von React und dadurch direkt testbar — 63 Unit-Tests laufen ohne DOM. |

## 4. Schichtenmodell

```
src/
├── domain/          reine Logik, kein React, vollständig testbar
│   ├── types.ts             alle Entitäten
│   ├── date.ts              lokale ISO-Datumsschlüssel, Wochenrechnung
│   ├── format.ts            Anzeigeformate, Sport- und Zonen-Metadaten
│   ├── load.ts              sRPE-Belastungsmodell, CTL/ATL/TSB/ACWR, Aggregate
│   ├── shifts.ts            Schichtkontext, Trainingsfenster, Rotation
│   ├── readiness.ts         Erholungsbewertung aus vorhandenen Inputs
│   ├── phases.ts            Periodisierung, 3:1-Welle, Wochenziele
│   ├── outlook.ts           7-Tage-Horizont: Kapazität, Schlaf, geplante Last
│   ├── engine.ts            Kandidatengenerierung, harte Gates, Scoring
│   ├── personalization.ts   gelernte Präferenzen aus dem Verhalten
│   ├── score.ts             Hybrid Score, sechs Säulen, transparent
│   ├── habits.ts            Zeitpläne, Streaks mit Schutztagen, Quoten
│   ├── tasks.ts             Prioritäten, Wiederholungen, Fälligkeit
│   ├── goals.ts             Fortschritt, Meilensteine, Plan-Abgleich
│   ├── metrics.ts           Kennzahlen aus Rohdaten, PR-Erkennung
│   ├── review.ts            Wochenrückblick mit generierter Bewertung
│   ├── insights.ts          Inhalte für Benachrichtigungen und Briefing
│   └── coach.ts             regelbasierte Antworten auf eigene Daten
├── data/            Persistenz und abgeleiteter Zustand
│   ├── db.ts                IndexedDB-Wrapper
│   ├── defaults.ts          Startkonfiguration aus dem Athletenprofil
│   ├── store.ts             Zustand-Store, alle Mutationen
│   ├── derived.ts           Indizes und zusammengesetzte Sichten
│   └── backup.ts            JSON-Backup, CSV-Export, Import-Validierung
├── ui/              Designsystem: Primitives, Charts, Sheets, Icons
├── screens/         ein Modul pro Route (inkl. CheckIn als Vollbild-Flow)
└── app/             Shell, Navigation, Hooks, Theme
```

Die Abhängigkeiten zeigen nur nach unten: `screens → app → data → domain`. Die
Domänenschicht kennt weder React noch IndexedDB.

## 5. Datenmodell

Alle Entitäten liegen in `src/domain/types.ts`.

**Konfiguration** — `AppSettings` (Profil, Trainingswerte, Erholungsschwellen,
Benachrichtigungen, Theme), `ShiftType`, `TrainingPlan` mit `TrainingPhase[]`, `Exercise`.

**Planung und Protokoll** — `TrainingSession` (geplante *und* tatsächliche Werte in einem
Datensatz, damit Adhärenz messbar bleibt), `ShiftAssignment` pro Tag, `DailyCheckIn`
pro Tag, `Habit` + `HabitEntry`, `Task`, `Goal` + `GoalMilestone`, `PersonalRecord`,
`WeeklyReview`.

**Abgeleitet, nie gespeichert** — `Readiness`, `HybridScore`, `DailyRecommendation`,
`LoadPoint`, `WeekSummary`, `Insight`. Diese Werte werden bei jedem Render neu berechnet.
Das ist bewusst so: eine gespeicherte Kennzahl wäre nach einer nachgetragenen Einheit
falsch, und ein Bugfix in der Formel würde die Historie nicht korrigieren.

### Vorbereitung auf externe Integrationen

Jeder importierbare Datensatz trägt `source: DataSource` und optional `externalId`.
`TrainingSession` hat bereits Felder für Herzfrequenz, Leistung, Normalized Power,
Höhenmeter und Minuten pro Zone; `DailyCheckIn` trägt Ruhepuls, HRV und WHOOP-Recovery.
Ein Importer für Garmin, WHOOP, Polar oder Apple Health kann ergänzt werden, ohne das
Schema zu migrieren. Die Integrationen sind in der UI sichtbar als *geplant*
gekennzeichnet — es gibt keine Schaltfläche, die nichts tut.

## 6. Navigation

Mobile: feste Tableiste mit **Heute · Training · Habits · Tasks · Statistik · Mehr**.
Woche, Ziele, Coach und Profil liegen unter *Mehr* — neun gleichrangige Tabs sind auf
einem iPhone nicht mit dem Daumen bedienbar.

Ab 860 px wird die Tableiste durch eine Seitenleiste mit allen Zielen ersetzt.

Die Trennung folgt einer einzigen Regel: **Was heute handlungsrelevant ist, gehört auf
Heute. Alles, was eine Zahl über die Vergangenheit ist, gehört in Statistik.** Deshalb
liegen Hybrid Score, Verläufe, Records und Hinweise im Statistik-Tab und nicht auf dem
Tagesbildschirm.

## 7. Wichtigste Screens

**Check-in** — der erste Bildschirm des Tages. Öffnet sich beim ersten Start automatisch
und führt in fünf Schritten durch Schicht, Schlaf, Befinden, optionale Gerätewerte und
endet mit dem Ergebnis: Readiness plus die daraus errechnete Einheit, direkt einplanbar.
Jede Antwort ist ein Tap, nichts braucht die Tastatur außer den optionalen Gerätewerten,
und der Flow lässt sich jederzeit überspringen. Er erscheint pro Tag genau einmal —
Überspringen darf nicht zu Nörgeln werden.

**Heute** — bewusst schmal: Datum und Schicht, die Empfehlung mit ausklappbarem „Warum?",
ein Statusblock aus Readiness-Ring, Schlaf- und Wochenbalken, dann die handlungsrelevanten
Listen: heutiges Training, Habits zum Abhaken, fällige Aufgaben. Keine Verläufe, keine
Scores, keine Vorschauen — was heute nicht handlungsrelevant ist, steht hier nicht.

**Training** — Tagesnavigation, Schichtkapazität, geplante Einheiten, die Empfehlung mit
Alternativen und einer aufklappbaren Liste der ausgeschlossenen Optionen samt Grund.
Darunter Wochenumfang gegen Ziel, Verteilung nach Sportart und Intensität, Belastungsstatus.

**Woche** — Sieben-Tage-Raster mit Schicht, Trainingspunkten und Auswahl; Tagesdetail;
Balken der Tagesbelastung; automatisch generierter Wochenrückblick mit eigenem Notizfeld.

**Statistik** — alles Numerische an einem Ort: Hinweise, Hybrid Score mit vollständiger
Aufschlüsselung jeder Säule und Komponente,
Wochenumfang, Fitness-/Ermüdungsverlauf, Detailansicht je Sportart, Kraftbestwerte,
Personal Records, Konstanz-Heatmap.

**Profil** — jeder Wert aus Abschnitt 34 der Anforderung ist hier änderbar, inklusive der
Trainingsregeln pro Schichtart.
