# Phase 2: Kernlogik (reine TypeScript-Module + Vitest)

## Kontext

Phase 1 ist freigegeben (`docs/PLANUNG.md`, `CLAUDE.md`). In Phase 2 entsteht die gesamte Trainingslogik als UI-unabhängige, voll getestete Module in `src/core/`. Grundlage sind Beispieldaten statt WHOOP (SPEC 12, Punkt 2). Oberfläche, Supabase, WHOOP-HTTP, ICS-Export und Auswertungs-Ansichten folgen in späteren Phasen.

Neu geklärt für Phase 2 (wird in `CLAUDE.md` ergänzt):
- **Nachtlauf an Tag 4 nachts** (Start ca. 21:00–22:00), danach an Tag 5 ausschlafen. Tag 5 ist dann locker bzw. Oberkörper oder der 2. Teil eines B2B am Nachmittag.
- **Vorausschau (6.3a) nur ab Gelb.** Bei Grün läuft die Einheit immer wie geplant. HRV-Trend, Schlafdefizit und Nachtschicht verstärken die Reduktion nur ab Gelb.

## 1. Projekt-Setup

- Vite + React + TypeScript (strict), `npm`, Node 22. Minimales `App.tsx` als Platzhalter. Tailwind, Router und PWA kommen erst in Phase 3.
- Abhängigkeiten: `date-fns`, `@date-fns/tz` (nur für UTC↔Europe/Berlin in `core/time`). Dev: `vitest`, `@vitest/coverage-v8`.
- Scripts: `dev`, `build` (`tsc -b && vite build`), `test` (`vitest run`), `test:watch`, `coverage`, `lint`.
- `.env.example` (leer, Vorlage für später).

## 2. Module in `src/core/` (jeweils mit `*.test.ts` daneben)

| Modul | Inhalt |
|---|---|
| `config.ts` | **alle** Schwellen, Gewichte, Zeiten, Umfangskurven, Priorität der Schlüsseleinheiten, Kraftkriterien, Tipp-Pool, jeweils kommentiert. Begründung der Spitzenwerte als Kommentar. Nutzer-Overrides über `resolveConfig(overrides)` (nur freigegebene Felder, Gewichte werden auf Summe 1 normiert) |
| `types.ts` | `LocalDate` (`YYYY-MM-DD`), Zeiten als Minuten seit Mitternacht (Werte > 1440 = Folgetag), `ShiftCode`, `ShiftOverride`, `SessionType`, `Sensitivity`, `PlannedSession`, `PlanDay`, `Microcycle`, `Mesocycle`, `SessionAdjustment`, `RecoveryDay`, `ManualReadiness`, `SessionLog`, `StrengthState`, `StrengthTest`, `SleepRecommendation` |
| `time/` | `addDays`, `daysBetween` (über Kalenderdaten, keine ms), Wochentag, ISO-Kalenderwoche, `instantToBerlin`/`berlinToInstant`, Formatierung TT.MM.JJJJ |
| `shift/` | `cycleDay`, `baseShift`, `effectiveShift` (Overrides: V, Urlaub=frei, Krank, Tausch→T/N/S/F, Überstunden = verlängertes Ende, Fortbildung = Arbeitstag mit Zeiten), `workTimes` (Beginn −15 min, Losfahren = Arbeitsbeginn −15 min), `trainingWindow` (Tag 2 bis Nap-Beginn −90 min, Tag 3 ab 15:00 bis Schlafenszeit −3 h und nur locker, Tag 4/5 ganztägig, Tag 1/V/Krank keins) und `shiftContext` (Stunden seit bzw. bis zur Schicht, letzte Nacht Arbeitsnacht) |
| `plan/periodization.ts` | Mesozyklen 1–7 + Taper (3 Mikrozyklen), Phasen 2/3/2, Entlastung = Mikrozyklus 7 in Meso 1–6, Taper-Stufen, 52 Mikrozyklen |
| `plan/volume.ts` | Soll-km und Soll-hm pro Mikrozyklus: Start 30 km/Woche, Phasenziele (Ende Grundlage ≈ 45, Ende Aufbau ≈ 62, Spitze 70–75 km/Woche), max. +7 %/Mikrozyklus (≙ 10 %/Woche), Entlastung −35 %, Taper −40 %/−55 %/Rennwoche. Faktor für Mikrozyklus-Reduktion aus der Erholung als Eingabe. Lange Läufe als eigene Progression (Grundlage 14→22 km, Aufbau bis 34 km, spezifisch B2B bis ca. 30+20 km, längster Lauf 50 km, 2 Bergwochenenden à 6–8 h + 3–4 h). Umrechnung auf Kalenderwochen für die Anzeige |
| `plan/templates.ts` | Einheiten-Vorlagen je Typ: Ziel in 1 Satz, Dauer/km, Soll-hm (Laufband: `Distanz × Steigung`), Intensität (Zone/RPE), Ablauf Aufwärmen/Haupt/Abwärmen, Empfindlichkeit, Schlüssel ja/nein, Verpflegungs- und Ausrüstungstest ab Aufbau bei langen Läufen |
| `plan/scheduler.ts` | Slots je Phase/Mikrozyklus-Art (normal, Entlastung, B2B, Berg, Test, Taper) auf Tage verteilen. Harte Regeln (nichts auf Tag 1/V/Krank, Tag 3 nur locker, Fenster-Prüfung, lang/B2B nur Tag 4/5, schwere Beine vorrangig Tag 2 und nie am Vortag von lang/Qualität/Rennen, Nachtlauf Tag 4). Einmaliges Verschieben von Schlüsseleinheiten bei V/Krank/Auslassen auf den nächsten passenden Tag 4/5, sonst streichen. Kein Nachholen von Umfang. Bergwochenend-Termine + Erinnerungsdatum (−28 Tage) |
| `plan/generatePlan.ts` | `generatePlan({ profile, shiftSettings, overrides, logs, microModifiers, config })` → `PlanDay[]` vom 02.10.2026 bis 18.06.2027 (deterministisch). Kraftübungen werden erst beim Materialisieren mit dem aktuellen `StrengthState` eingesetzt |
| `strength/ladders.ts` | 6 Leitern (Zug/Muscle-Up, Drücken/Dips, Front Lever, Back Lever, Core, Beine) mit Stufen, Arbeitsschema (Sätze, Wdh./Haltezeit, Pause) und Aufstiegskriterium |
| `strength/progression.ts` | `levelsFromTest(test)`, `evaluateProgress(state, logs)` (Aufstieg nur bei erfülltem Kriterium: im Test oder in 2 Sessions in Folge; Muscle-Up erst ab 10 Klimmzügen + 10 Dips), `buildStrengthSession(kind, state, phase)` (Hauptsession, Erhaltung, schwere Beine, exzentrisch, Skill leicht, Test) und Kraftvolumen |
| `recovery/inputs.ts` | Normalisierung der Teilwerte (Recovery, HRV-z vs. 7/30 Tage, Ruhepuls, Schlaf, Defizit, Last, Schicht) und manueller Ersatz (Schlaf, Qualität, Gefühl). Fehlende Daten → `needsManualInput` statt Fehler |
| `recovery/factor.ts` | `readiness`, Ampel (WHOOP-Score oder Ersatz), Einheiten-Faktor je Empfindlichkeit |
| `recovery/rules.ts` | Regel-Pipeline: Warnsignal → Rot → Schlaf < 5 h → Tag 3 (≥ Gelb und ≥ 5 h Tagschlaf) → Gelb (nur hohe Empfindlichkeit eine Stufe runter, −10 bis −25 %) → Vorausschau → Grün. Nie härter als geplant. Vorschlag „verschobene Schlüsseleinheit nachholen“ bei sehr guter Recovery. Begründungssatz aus Bausteinen |
| `recovery/lookahead.ts` | Horizont 1–2 Tage, **nur ab Gelb**. Stärke = Wichtigkeit × Nähe (+ HRV-Trend, Defizit, Nachtschicht). Harte Einheit wird reduziert bzw. umgewandelt (Schwelle → 45 min locker, schwere Beine → Oberkörper/Mobility), nicht gestrichen. Optionaler Eingang „erwarteter Recovery-Abfall“ für die gelernten Muster (die Berechnung selbst kommt in Phase 6) |
| `recovery/microcycle.ts` | Serien-Erkennung (≥ 2 rot bzw. ≥ 3 gelb/rot in Folge, Defizit-Schwelle) → Reduktionsfaktor für den nächsten Mikrozyklus |
| `sleep/recommend.ts` | Empfehlungen pro Tag: vor Tag 1 Aufstehen 05:45 (Losfahren 06:30), Tag 2 Nap ab 15:00 (20–120 min nach Bedarf, Aufstehen ≤ 18:00, Losfahren 18:30), nach der Nacht 08:00–14:00, Abend Tag 3 normal (Training endet −3 h), freie Tage konstant + Defizitabbau, mehr Schlaf vor Schlüsseleinheiten, Nachtlauf verschiebt die Nacht, Rennschlafplan in den letzten 14 Tagen, rotierende Tipps. `sleepAdherence(recs, actual)` |
| `whoop/assign.ts` | normalisierte WHOOP-Typen (Zyklus, Schlaf, Recovery, Workout). Recovery/Schlaf → Trainingstag über den **Hauptschlaf, der zuletzt vor dem Trainingsfenster endete** (Nap ≠ Hauptschlaf). Workout → Einheit über Zeitüberlappung + Sportart, mehrdeutig = Vorschlag |
| `race/` | Konflikterkennung 18./19.06. (+ Empfehlung 14.–20.06.), Erinnerungstermine, Checkliste, Taper-Schichtregeln (Tag 3 im Taper Ruhe, kein schweres Bein ≥ 10 Tage vor dem Rennen) |
| `fixtures/` | Beispieldaten: ca. 60 Tage synthetische WHOOP-ähnliche Werte mit Nachtschicht-Dips, rote Serie, fehlende Tage. Werden in Phase 3 auch für die UI genutzt |

## 3. Tests (alle Szenarien aus SPEC 11 + Zusatz)

- Zyklustag: 02.10.2026 = 1, Jahreswechsel, Sommerzeit 28.03.2027 / 31.10.2027, 18.06.2027 = 5, 14.06. = 1, 19.06. = 1, Datum vor dem Anker
- Scheduler: nichts auf Tag 1 oder V. Auf Tag 2 jeder Typ, der ins Fenster passt, ein zu langer Typ nicht. Kurzfristige V-Schicht → einmal verschoben bzw. gestrichen. Kein Umfangs-Nachholen (Mikrozyklus- und Folgemikrozyklus-Summe nicht erhöht). Keine schweren Beine am Vortag von lang/Qualität/Rennen. Nachtlauf nur Tag 4
- Plan gesamt: 52 Mikrozyklen, Phasengrenzen = Meso-Grenzen, Steigerung ≤ 7 %/Mikrozyklus, Entlastungen −30 bis −40 %, Spitzenwerte im Zielkorridor, 2 Bergwochenenden, Taper ab 04.06.
- Erholung: Grün, Gelb und Rot × **jeder** Einheitentyp (Tabellentest). Gelb stuft nur harte Einheiten runter (lang, hm, Calisthenics-Hauptsession, locker unverändert). < 5 h Schlaf. Tag 3. Warnsignal. Rote Serie senkt den nächsten Mikrozyklus. Fehlende WHOOP-Daten → manuelle Eingabe. **Eigenschaftstest: nie härter als geplant**
- Vorausschau: Gelb + B2B an Tag 4/5, Tag 2 Schwellenlauf → 45 min locker (nicht gestrichen), lockere Einheit unverändert, Grün → unverändert, nur Rot oder < 5 h streicht. Begründung nennt die kommende Einheit
- Kraft: Aufstieg nur bei erfülltem Kriterium, Muscle-Up-Voraussetzung, Abstieg nach Test
- WHOOP: Schlaf 08:00–14:00 → Schlaftag, Nap vor der Nachtschicht ≠ Hauptschlaf, Zeitzonen-Offset, Sommerzeit, Workout-Zuordnung
- Schlaf: Training an Tag 2 endet vor dem Nap, Aufstehen 05:45 passt zu 06:45 und Losfahren 06:30, Abend Tag 3 im normalen Rhythmus, Rennschlafplan
- Rennen: Taper-Phase, Rennwoche, Urlaubswarnung aktiv bzw. verschwindet mit eingetragenem Urlaub

## 4. Abschluss der Phase

1. `npm test` und `npm run build` grün (Ausgabe prüfen)
2. `CLAUDE.md`: Entscheidungen (Nachtlauf, Vorausschau) ergänzen, Fortschritt Phase 2 abhaken
3. Commit „Phase 2: Kernlogik …“ und automatischer Push auf `claude/gifted-ride-l7rok2`
4. Kurze Zusammenfassung mit den gewählten Zahlen (Umfangskurve, Spitzenwerte), danach Planung von Phase 3 im Plan-Modus

## Verifikation

- `npm test` (Vitest): alle Szenarien oben
- `npm run coverage`: Ziel ≥ 90 % Zeilenabdeckung in `src/core`
- `npm run build`: Typecheck strict + Vite-Build
- Plausibilitätsausgabe: kleines Testskript druckt den Gesamtplan als Tabelle (Mikrozyklus, Phase, km/Woche, hm/Woche, langer Lauf), damit die Kurve manuell geprüft werden kann
