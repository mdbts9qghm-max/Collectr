# Planung (Phase 1): Architektur, Datenmodell, Algorithmen

Stand: 28.09.2026. Grundlage ist `docs/SPEC.md`, die Entscheidungen des Nutzers stehen in `CLAUDE.md`.
In diesem Dokument steht noch kein Code, nur die Beschreibung, wie die Logik gebaut wird.

---

## 1. Überblick

```
┌──────────────────────────── Frontend (Vite + React + TS, PWA, Vercel) ────────────────────────────┐
│  UI (src/ui)  ──►  App-Services (src/app)  ──►  Kernlogik (src/core, rein, ohne I/O)              │
│                         │                                                                          │
│                         ▼                                                                          │
│                 Repository-Interface (src/data)                                                    │
│                  ├─ LocalRepository   (IndexedDB, Phase 2–3 und Offline-Cache)                     │
│                  └─ SupabaseRepository (Phase 4+)                                                  │
└────────────────────────────────────────────┬───────────────────────────────────────────────────────┘
                                             │ HTTPS (nur anon key + User-JWT)
┌────────────────────────────────── Supabase ▼───────────────────────────────────────────────────────┐
│  Postgres + RLS (ein Nutzer) · Auth (Magic Link)                                                    │
│  Edge Functions: whoop-oauth-start, whoop-oauth-callback, whoop-sync, whoop-webhook, push-send      │
│  pg_cron: täglicher Abruf, Token-Refresh, Schlaf-Erinnerungen                                       │
└────────────────────────────────────────────┬───────────────────────────────────────────────────────┘
                                             ▼
                                WHOOP Developer API v2 (OAuth 2.0)
```

Grundprinzipien:

1. **Der Plan ist eine Funktion.** `Masterplan = generatePlan(profil, schichtOverrides, krafttestErgebnisse, config)`.
   Er ist deterministisch und wird nach jeder relevanten Änderung neu berechnet (V-Schicht, Urlaub, Krafttest).
   Die Datenbank speichert die Eingaben und die Ist-Daten. Der generierte Plan wird nur als Cache gespeichert.
2. **Die tägliche Anpassung ist eine zweite Funktion.** `Anpassung = adjustSession(geplanteEinheit, erholung, schichtKontext, vorschau, config)`.
   Sie erzeugt immer das Paar *Original + Anpassung + Begründungssatz* (SPEC 6.4).
3. **Die Zeit ist ein Parameter.** Kein Modul in `src/core` liest die Systemuhr, dadurch sind alle Szenarien testbar.
4. **Eine Konfiguration:** Schwellen, Gewichte, Progressionskriterien und Umfangswerte stehen kommentiert in `src/core/config.ts`.
   Die Nutzer-Einstellungen (Gewichtung der Erholungsfaktoren) überschreiben nur ausdrücklich freigegebene Werte.

---

## 2. Technik und Bibliotheken

| Zweck | Wahl | Begründung |
|---|---|---|
| Build/UI | Vite, React 18, TypeScript (strict) | laut SPEC |
| Styling | Tailwind CSS, `darkMode: 'class'`, Standard dunkel | laut SPEC |
| Diagramme | Recharts | laut SPEC |
| Routing | React Router | 9 Ansichten, einfache Tab-Navigation |
| Datum/Zeitzone | `date-fns` + `@date-fns/tz` | Europe/Berlin und Sommerzeit zuverlässig; Kalendertage als `YYYY-MM-DD`-Strings |
| Lokale Daten | IndexedDB über `idb` (dünner Wrapper) | offline lesbar, später Cache für Supabase |
| PWA | `vite-plugin-pwa` (Workbox) | installierbar, Heute-Ansicht offline |
| Tests | Vitest (Kernlogik), Playwright (Handy-Viewport, Phase 3) | laut SPEC |
| Backend | Supabase (Postgres, Auth, Edge Functions in Deno, pg_cron) | laut SPEC |
| Push | Web Push (VAPID), Versand aus Edge Function | SPEC 6.3b |
| Validierung | `zod` für JSON-Backup-Import und WHOOP-Antworten | robuste Importe |

---

## 3. Ordnerstruktur

```
/
├─ CLAUDE.md
├─ docs/  SPEC.md · PLANUNG.md
├─ index.html · vite.config.ts · tailwind.config.ts · tsconfig*.json · vitest.config.ts · playwright.config.ts
├─ public/                         Icons, Manifest-Assets
├─ src/
│  ├─ core/                        ◄── reine Trainingslogik, vollständig getestet
│  │  ├─ config.ts                 ALLE Schwellen/Gewichte, kommentiert
│  │  ├─ types.ts                  gemeinsame Domänentypen
│  │  ├─ time/                     LocalDate, Uhrzeit-Arithmetik, Europe/Berlin, Kalenderwochen
│  │  ├─ shift/                    Zyklustag, Schichtzeiten, Overrides, Trainingsfenster, ICS-Import-Parser
│  │  ├─ plan/                     Phasen, Mesozyklen, Umfangsprogression, Einheiten-Vorlagen, Wochenverteiler, Verschieben
│  │  ├─ strength/                 Progressionsleitern, Stufenkriterien, Krafttest-Auswertung, Session-Bau
│  │  ├─ recovery/                 Eingangsnormalisierung, Einheiten-Faktor, Regeln, Vorschau (6.3a), Warnsignal, Muster
│  │  ├─ sleep/                    Schlafempfehlungen, Nap, Rennschlafplan, Tipps, Umsetzungsquote
│  │  ├─ whoop/                    Zuordnung WHOOP-Zyklus/Schlaf/Workout → Trainingstag (rein, ohne HTTP)
│  │  ├─ race/                     Rennwoche, Urlaubskonflikt, Checkliste
│  │  └─ export/                   ICS-Export, JSON-Backup-Schema
│  │  (Tests liegen jeweils daneben als *.test.ts)
│  ├─ data/                        Repository-Interface, LocalRepository, später SupabaseRepository
│  ├─ app/                         Services: planStore, todayService, sync; verbinden core mit data
│  ├─ ui/
│  │  ├─ components/               Ampel, EinheitKarte, Vergleich Original/Anpassung, Countdown, Footer-Hinweis …
│  │  └─ pages/                    Onboarding, Heute, Zyklus, Gesamtplan, Erholung, Kraft, Tracking, Einstellungen, Export
│  └─ main.tsx
├─ e2e/                            Playwright-Tests (Handy-Format)
└─ supabase/
   ├─ migrations/                  SQL-Schema + RLS
   └─ functions/                   whoop-oauth-start, whoop-oauth-callback, whoop-sync, whoop-webhook, push-send
```

---

## 4. Datenmodell

Die Typen stehen in `src/core/types.ts`. In Phase 4 werden daraus 1:1 Postgres-Tabellen, jede mit `user_id` und RLS `user_id = auth.uid()`.

### 4.1 Eingaben (vom Nutzer)

| Entität | Felder (Auszug) |
|---|---|
| `Profile` | Laufumfang/Woche (Std. 30 km), längster Lauf, Calisthenics-Level, Ziele, Zugang Studio/Park, Arbeitsweg (15 min), Puffer (0 min, siehe 6.2), Renndaten |
| `ShiftSettings` | Ankerdatum 2026-10-02, Grundrhythmus `[T,N,S,F,F]`, Schichtzeiten, Vorlauf 15 min |
| `ShiftOverride` | `date`, `type` (`V`, `URLAUB`, `KRANK`, `TAUSCH→T/N/S/F`, `UEBERSTUNDEN`, `FORTBILDUNG`), optionale Zeiten, Notiz, Quelle (`manuell`/`ics`) |
| `RecoveryWeights` | Nutzer-Overrides der Gewichte aus `config.ts` |
| `StrengthTest` | Datum, max. Klimmzüge, max. Dips, Hollow-Hold (s), beste FL-/BL-Stufe + Haltezeit, weitere Werte |
| `ManualReadiness` | Datum, Schlafdauer, Schlafqualität 1–5, Gefühl 1–5 (Ersatz, wenn WHOOP-Daten fehlen) |
| `SessionLog` | Session-ID, Status (`erledigt`/`ausgelassen`), Ist-Dauer/-km/-hm, Gefühl 1–5, Notiz, Verpflegung (g KH/h, Produkte), Ausrüstungstest, Anpassung abgelehnt (ja/nein) |
| `ChecklistItem` | Rennwochen-Checkliste mit Status |

### 4.2 Abgeleitete Daten (berechnet)

| Entität | Inhalt |
|---|---|
| `PlanDay` | Datum, Zyklustag, effektive Schicht, Trainingsfenster, Liste `PlannedSession` |
| `PlannedSession` | ID (stabil: `datum#slot`), Typ, Empfindlichkeit, Schlüsseleinheit ja/nein, Ziel (1 Satz), Dauer/km, Soll-hm, Intensität (Zone/RPE), Ablauf (Aufwärmen/Haupt/Abwärmen), Kraftübungen (Sätze, Wdh./Haltezeit, Pause), Herkunft (`geplant`/`verschoben von …`) |
| `SessionAdjustment` | Session-ID, Datum der Bewertung, Einheiten-Faktor, Aktion (`keep`/`downgrade`/`shorten`/`convert`/`cancel`), angepasste Einheit, Begründungssatz, abgelehnt ja/nein |
| `Mesocycle`, `Microcycle` | Nummer, Datumsbereich, Phase, Entlastung ja/nein, Soll-km, Soll-hm, Kraftvolumen |
| `SleepRecommendation` | Datum, Zubettgehen, Aufstehen, Nap (von/bis), Begründung, Tipp |

### 4.3 WHOOP (Phase 5, serverseitig befüllt)

| Tabelle | Inhalt |
|---|---|
| `whoop_tokens` | Access/Refresh-Token, Ablaufzeit. **Kein RLS-Lesezugriff für den Client**, nur die Service Role in Edge Functions |
| `whoop_cycles` | Zyklus-ID, Start, Ende, Strain, kJ, Zeitzonen-Offset |
| `whoop_recoveries` | Zyklus-ID, Sleep-ID, Score, HRV (RMSSD), Ruhepuls, SpO2, Hauttemperatur |
| `whoop_sleeps` | Sleep-ID, Start, Ende, Nap ja/nein, Phasen, Effizienz, Performance, Schlafbedarf (Baseline, Defizit, Strain, Nap-Anteil) |
| `whoop_workouts` | ID, Start/Ende, Sportart, Strain, HF-Zonen, Distanz, Höhenmeter, zugeordnete Session-ID, manuell korrigiert |
| `push_subscriptions` | Web-Push-Endpunkt + Schlüssel |

Der Client liest die WHOOP-Rohdaten nur lesend. Die Zuordnung zu Trainingstagen macht `src/core/whoop`.

---

## 5. Algorithmen

### 5.1 Schichtberechnung (`core/shift`)

- `cycleDay(date) = ((daysBetween(2026-10-02, date) mod 5) + 5) mod 5 + 1`. Gerechnet wird auf Kalendertagen (`LocalDate`) statt Millisekunden, deshalb hat die Sommerzeitumstellung keinen Einfluss.
  Geprüft: 02.10.2026 = 1, 14.06.2027 = 1, **18.06.2027 = 5**, 19.06.2027 = 1.
- `effectiveShift(date)`: Grundschicht nach Zyklustag, dann Override (V, Urlaub, Tausch …). Urlaub zählt als Frei.
- `shiftTimes`: T 07:00–19:00 (Beginn 06:45), N 19:00–07:00 (+1 Tag, Beginn 18:45), V 08:00–20:00 (Beginn 07:45).
- **Losfahren = tatsächlicher Arbeitsbeginn − Arbeitsweg** (15 min, **ohne** zusätzlichen Puffer, Entscheidung des Nutzers).
  Also Tag 1: 06:30, Tag 2: 18:30, V: 07:30.
- `trainingWindow(date)`: aus Zyklustag, Override und Schlafplan:
  - Tag 1, V, Krank: kein Fenster (optional 10 min Mobility am Abend an Tag 1)
  - Tag 2: 08:00–13:30 (das Ende ergibt sich aus Nap-Beginn − Essen/Pause, Werte in der Config)
  - Tag 3: ab 15:00 bis Schlafenszeit − 3 h, nur „locker“ zulässig
  - Tag 4/5 frei bzw. Urlaub: ganztägig
  - Das Fenster rechnet mit **dem tatsächlichen Schichtkontext**: Liegt z. B. nach einem Tausch eine Nachtschicht auf dem Folgetag, gilt die Tag-2-Logik.
- ICS-Import (optional): Parser in `core/shift/ics.ts` erzeugt Overrides. Abweichungen vom berechneten Rhythmus werden dem Nutzer vor dem Übernehmen angezeigt.

### 5.2 Phasen und Mesozyklen (`core/plan/periodization`)

| Meso | Zeitraum | Phase | Entlastung (Mikrozyklus 7) |
|---|---|---|---|
| 1 | 02.10.–05.11.2026 | Grundlage | 01.11.–05.11. |
| 2 | 06.11.–10.12.2026 | Grundlage | 06.12.–10.12. |
| 3 | 11.12.2026–14.01.2027 | Aufbau | 10.01.–14.01. |
| 4 | 15.01.–18.02.2027 | Aufbau | 14.02.–18.02. |
| 5 | 19.02.–25.03.2027 | Aufbau | 21.03.–25.03. |
| 6 | 26.03.–29.04.2027 | Rennspezifisch | 25.04.–29.04. |
| 7 | 30.04.–03.06.2027 | Rennspezifisch | keine, der Taper folgt |
| Taper | 04.06.–18.06.2027 | Taper (3 Mikrozyklen: ca. −40 %, −55 %, Rennwoche) | – |

Insgesamt 52 Mikrozyklen. Krafttests liegen im Entlastungs-Mikrozyklus (Meso 1–6) bzw. im letzten Mikrozyklus von Meso 7 als kurzer Erhaltungstest. Im Taper gibt es keinen Test.

### 5.3 Laufumfang und Spitzenwerte (`core/plan/volume`)

- Rechengröße ist der **Umfang pro Mikrozyklus**. Anzeige in km/Woche = Mikrozyklus-km × 7/5.
- Start: 30 km/Woche (einstellbar) ≈ 21 km pro Mikrozyklus.
- Steigerung: max. 10 %/Woche ≙ **max. ca. 7 % pro Mikrozyklus** (1,10^(5/7) ≈ 1,07). Standardmäßig wird mit ca. 5–6 % geplant, als Puffer für Schichtausfälle.
- Entlastung: −35 % gegenüber dem vorherigen Mikrozyklus. Danach wird auf dem Niveau vor der Entlastung weitergemacht, nicht darüber.
- **Vorgeschlagene Spitzenwerte** (die Begründung kommt als Kommentar in `config.ts`):
  - **ca. 70–75 km/Woche** (≈ 50–53 km pro Mikrozyklus) und **ca. 2.500–3.000 hm/Woche** (überwiegend Laufband/Treppe) in den Spitzen-Mikrozyklen von Meso 6–7.
  - Längster Einzellauf 50–55 km bzw. 6–7 h (Bergwochenende bis 8 h Bewegungszeit), Back-to-back bis ca. 35 + 25 km.
  - Begründung: Für ein erstes Finish in 22 h (ca. 3,9 km/h Schnitt, also viel Gehen) zählt die Zeit auf den Beinen und die Robustheit bergab mehr als Tempo. 70–75 km/Woche sind mit drei vollwertigen Trainingstagen pro 5 Tagen (davon zwei Tage mit Langeinheiten) umsetzbar. Höhere Werte würden bei Nachtschichten die Erholung überfordern, und die Verletzungsgefahr steigt, weil der Nutzer von 20–40 km/Woche kommt. Das entspricht verbreiteten Empfehlungen für erste 80–100-km-Rennen (60–90 km/Woche Spitze).
- Verteilung pro Mikrozyklus: Der lange Lauf bekommt 35–45 % des Umfangs (Tag 4 oder 5), die restlichen Kilometer verteilen sich auf Tag 2 (mittel oder Qualität) und optional Tag 3 (Regeneration). Ca. 80 % locker.
- **Verlorene Tage (V-Schicht, Krankheit) werden nicht nachgeholt.** Der Soll-Umfang des Mikrozyklus sinkt entsprechend, und die Anzeige zeigt „entfallen“.

### 5.4 Einheiten-Verteiler (`core/plan/scheduler`)

Für jeden Mikrozyklus gibt es eine Phasen-Vorlage mit Slots (Schlüsseleinheiten, Kraft, locker). Der Verteiler weist sie Tagen zu. Er arbeitet als Regelprüfer mit Prioritäten, nicht als freie Optimierung:

1. **Harte Regeln:** keine Einheit an Tag 1, V oder Krank. Tag 3 nur locker. Einheit passt ins Zeitfenster (Dauer inkl. Aufwärmen). Lange Läufe und Back-to-back nur Tag 4/5. **Schweres Beintraining vorrangig Tag 2**, auf Tag 4 nur, wenn Tag 5 keinen langen Lauf und keine Qualitätseinheit hat. Nie am Vortag eines langen Laufs, einer Qualitätseinheit oder des Rennens.
2. **Prioritäten:** Schlüsseleinheiten (langer Lauf, B2B, Qualität, Bergwochenende, Krafttest) > Calisthenics-Hauptsession > lockere Läufe > Zusatzkraft/Mobility.
3. **Zuordnung pro Phase** (Regelfall, wenn Tag 5 frei ist):

| Phase | Tag 2 (08:00–13:30) | Tag 3 (optional) | Tag 4 | Tag 5 |
|---|---|---|---|---|
| Grundlage | lockerer/mittlerer Lauf + Calisthenics-Hauptsession **oder** schwere Beine | Regenerationslauf/Mobility/Skill leicht | langer Lauf (locker) + Lauf-ABC | Laufband-Steigung + Calisthenics |
| Aufbau | Qualität (Bergauf-Intervalle/Schwelle) + Oberkörper **oder** schwere Beine | wie oben | langer Lauf bis > 30 km | Höhenmeter-Einheit / Calisthenics-Hauptsession |
| Rennspezifisch | mittlerer Lauf + Kraft-Erhaltung | wie oben | B2B Teil 1 (lang) | B2B Teil 2, Nachtlauf mit Stirnlampe (abwechselnd) |
| Taper | kurze Qualität in kleiner Dosis | locker oder Ruhe | moderater Lauf | kurz locker |

4. **V-Schicht auf Tag 5** (auch kurzfristig): Die Einheit dieses Tags wird **einmal** auf den nächsten passenden Tag 4/5 verschoben, wenn dort keine gleichwertige oder wichtigere Schlüsseleinheit liegt und die Regeln aus Punkt 1 erfüllt sind. Sonst wird sie gestrichen. Ein B2B wird zum einzelnen langen Lauf an Tag 4. Die Einheit wird nie auf Tag 1 gelegt, und es wird kein Umfang nachgeholt.
5. **Bergwochenenden:** 2 Termine (Meso 6 und Meso 7) auf Tag 4+5-Paaren, beide Tage frei. Die App erinnert **ca. 4 Wochen vorher** und fordert auf, die Tage abzusichern. Fällt eine V-Schicht darauf, wird auf das nächste freie Paar ausgewichen, sonst gibt es Laufband-Ersatz.
6. **Rennwoche:** Solange kein Urlaub eingetragen ist, bleibt der Schichtplan wie berechnet (14.06. T, 15.06. N …), und die Warnung wird angezeigt. Wird Urlaub eingetragen, plant die App den Taper sofort neu.

### 5.5 Höhenmeter (`core/plan/elevation`)

- Laufband: `hm = Distanz(m) × Steigung(%) / 100` (z. B. 5 km bei 12 % = 600 hm). Die Steigung wird auf 15 % begrenzt (Config).
- Treppe/Stairmaster: hm aus Stockwerken (Config: 3 m pro Stockwerk) oder Gerätewert.
- Jede Einheit hat Soll-hm. Bergab-Ersatz: exzentrisches Beintraining (Step-downs, bulgarische Split Squats, Nordic Curls, Tempo-Kniebeugen, Wadenheben).

### 5.6 Kraft und Calisthenics (`core/strength`)

Progressionsleitern mit Stufen. Jede Stufe hat ein **Arbeitsschema** (Sätze × Wdh./Haltezeit, Pause) und ein **Aufstiegskriterium**. Aufstieg nur, wenn das Kriterium erfüllt ist: entweder im Krafttest oder in 2 aufeinanderfolgenden Sessions mit protokollierter Erfüllung.

| Leiter | Stufen (Kriterium für den Aufstieg, Auszug) |
|---|---|
| Zug / Muscle-Up | 1 Hängen + Scapula-Pulls (3×30 s Hang) → 2 Australian Rows (3×12) → 3 Negativ-Klimmzüge (3×5 à 5 s) → 4 Band-Klimmzüge (3×8, leichtes Band) → 5 strikte Klimmzüge (3×5) → 6 strikt 8–10 (**10 saubere**) → 7 explosive Klimmzüge bis Brust (3×5) → 8 bis Hüfte / Übergang mit Band oder tiefer Stange → 9 Muscle-Up. Voraussetzung ab Stufe 7: **10 Klimmzüge + 10 Dips** |
| Drücken / Dips | Wand-/Knie-/Liegestütz → Stütz halten (3×30 s) → Negativ-Dips (3×5) → Dips (3×8, Ziel 10+) → Dips mit Zusatzgewicht / Ring-Stütz |
| Front Lever | Hollow Body (3×30 s) → Tuck FL (3×10 s) → Advanced Tuck (3×10 s) → One Leg (3×8 s) → Straddle |
| Back Lever | German Hang (3×20 s) → Skin the Cat (3×3 kontrolliert) → Tuck BL (3×10 s) → Advanced Tuck (3×10 s) → One Leg |
| Core | Hollow Body → Hanging Knee Raises (3×10) → Hanging Leg Raises (3×8) → L-Sit-Vorstufen (Tuck-L-Sit 3×15 s → L-Sit) |
| Beine (Studio) | Goblet-Kniebeuge → Tempo-Kniebeuge / Split Squats → bulgarische Split Squats, Step-ups, Step-downs, Nordic Curls (Negativ), Kreuzheben moderat (RPE ≤ 7), Wadenheben einbeinig. Ziel: Robustheit, keine Maximalkraft |

- Kraftfrequenz pro Mikrozyklus: Grundlage 2–3, Aufbau 2, Rennspezifisch 1–2 (Erhaltung, ca. −40 % Volumen), Taper 1 kurze Einheit.
- Das Kraftvolumen (Sätze pro Muskelgruppe) wird für das Diagramm im Gesamtplan gespeichert.
- Krafttest alle 35 Tage (siehe 5.2). Die Ergebnisse setzen die Stufen neu (auch Abstieg, wenn das Kriterium nicht mehr erfüllt ist). Das Mapping steht in der Config.

### 5.7 Erholung und Einheiten-Faktor (`core/recovery`)

**Eingänge normalisieren** (jeweils 0–1, 1 = optimal, Formeln in der Config):

| Teilwert | Grundlage |
|---|---|
| `rec` | WHOOP Recovery Score / 100 |
| `hrv` | ln(HRV) vs. 7- und 30-Tage-Mittel (z-Score, gekappt) |
| `rhr` | Ruhepuls vs. 30-Tage-Mittel (Abweichung in bpm) |
| `sleep` | Schlafdauer vs. Bedarf, Sleep Performance, Effizienz |
| `debt` | aufgelaufenes Schlafdefizit der letzten 3–5 Tage |
| `load` | Strain des Vortags + Trainingslast der letzten 7 Tage vs. 28-Tage-Schnitt |
| `shift` | Schichtkontext: Stunden seit Schichtende, bis zur nächsten Schicht, letzte Nacht Arbeitsnacht |

`readiness = Σ gewicht_i × teilwert_i` (Gewichte in der Config, in den Einstellungen änderbar, Summe 1).
Fehlen WHOOP-Daten: `ManualReadiness` (Schlafdauer, Qualität 1–5, Gefühl 1–5) ersetzt `rec/sleep`. Es wird kein Fehler ausgelöst, die UI fordert die Eingabe an.

**Ampel:** Primär der WHOOP Recovery Score (grün ≥ 67, gelb 34–66, rot ≤ 33). Ohne WHOOP wird die Ampel aus dem `readiness`-Wert mit denselben Grenzen gebildet.

**Einheiten-Faktor (0–100 %)** pro Einheit = Funktion aus Ampel, readiness und Empfindlichkeit (hoch/mittel/niedrig).
Er bestimmt nur **wie stark** eine Anpassung ausfällt, **ob** angepasst wird, entscheiden die Regeln:

Regel-Pipeline (die erste harte Regel gewinnt, die Begründungen werden gesammelt):

1. **Warnsignal** (Ruhepuls ≥ X bpm über dem Mittel **und** HRV ≥ Y % unter dem Mittel an ≥ 2–3 Tagen): Hinweis auf Pause bzw. ärztliche Abklärung, heute Ruhe oder Mobility.
2. **Rot:** Ruhetag oder höchstens 30 min sehr locker/Mobility (niedrige Empfindlichkeit → 30 min locker, sonst Ruhetag/Mobility).
3. **Schlaf < 5 h:** keine Intensität, kein schweres Krafttraining (Umwandlung in eine lockere Variante), gilt unabhängig von der Recovery.
4. **Tag 3:** nur Training, wenn die Ampel ≥ gelb ist **und** der Tagschlaf ≥ 5 h betrug, sonst Ruhetag.
5. **Gelb:** **nur hohe Empfindlichkeit** wird eine Stufe runtergestuft (Intervall → lockerer Lauf, schwere Sätze → Technik-Sätze, neue Skill-Stufe → aktuelle Stufe), Dauer −10 bis −25 % (je nach Faktor). Mittlere und niedrige Empfindlichkeit bleiben **unverändert**.
6. **Vorausschau 6.3a** (siehe 5.8).
7. **Grün:** wie geplant. Es wird **nie** automatisch härter gemacht. Bei sehr guter Recovery höchstens der Vorschlag, eine einmal verschobene Schlüsseleinheit nachzuholen, wenn das regelkonform ist.
8. **Tag 2:** Es gibt keine eigene Obergrenze. Die kommende Nachtschicht fließt über `shift` in den Faktor ein und löst die Vorausschau aus. Das Training muss vor dem Nap enden (Fensterprüfung).

**Mikrozyklus-Reduktion:** ≥ 2 rote oder ≥ 3 gelb/rote Tage in Folge oder ein Schlafdefizit über der Schwelle → der Umfang des **nächsten** Mikrozyklus sinkt um 15–25 % (Config).

**Begründungssatz:** Er wird aus Bausteinen gebaut, z. B. „Recovery 41 %, nur 5,5 h Schlaf nach der Nachtschicht: Intervall wird lockerer Lauf, 40 statt 55 min“.
Wird eine Anpassung abgelehnt, wird der Originalplan ausgeführt und die Ablehnung protokolliert.

### 5.8 Vorausschauende Erholung (`core/recovery/lookahead`)

- Horizont: 1–2 Tage. Gesucht werden Schlüsseleinheiten (langer Lauf, B2B, Qualität, Bergwochenende, Krafttest).
- Auslöser: Ampel gelb, fallender HRV-Trend über 2–3 Tage, wachsendes Schlafdefizit oder eine Nachtschicht zwischen heute und der Schlüsseleinheit.
- Nur **harte** Einheiten heute werden reduziert, nicht gestrichen: Schwellenlauf → 45 min locker, schwere Beine → Oberkörper-Calisthenics oder Mobility. Die Stärke hängt ab von der Wichtigkeit der kommenden Einheit (B2B/Berg > langer Lauf > Qualität > Krafttest) und der Nähe (morgen > übermorgen).
- Gestrichen wird nur bei rot oder unter 5 h Schlaf (Regeln 2 und 3).
- **Gelernte Muster** (ab ca. 6 Wochen Daten): typischer Recovery-Abfall nach Nachtschicht, langem Lauf und Krafttraining (Median der Differenz). Der erwartete Abfall fließt optional in die Vorausschau ein (Schalter in den Einstellungen).
- Die Begründung nennt immer die kommende Einheit.

### 5.9 Schlafempfehlungen (`core/sleep`)

Eingänge: Schlafbedarf laut WHOOP (Baseline + Defizit + Strain-Anteil − Nap-Anteil; ohne WHOOP 8 h), Schicht, Losfahrzeit (Arbeitsbeginn − 15 min), geplante Einheiten der nächsten Tage.

| Situation | Empfehlung (Ausgangswerte) |
|---|---|
| Nacht vor Tag 1 (Tagschicht) | Aufstehen **05:45** (Losfahren 06:30), Zubettgehen = 05:45 − Bedarf − Einschlafzeit (typisch 21:30–22:00) |
| Nacht nach Tag 1 → Tag 2 | normal, Ausschlafen erlaubt |
| Tag 2 | Training endet ≤ 13:30, Nap ca. 15:00–17:00 (90 min Standard, nach Bedarf 20–120 min), Aufstehen so, dass Losfahren um **18:30** möglich ist |
| Nach der Nachtschicht (Tag 3) | Schlaf ca. 08:00–14:00, Tipps: Sonnenbrille auf dem Heimweg, abdunkeln, Ohrstöpsel |
| Abend Tag 3 | normales Zubettgehen (z. B. 22:30), Training endet ≤ Schlafenszeit − 3 h |
| Tag 4/5 frei | gleichbleibende Zeiten, Defizit abbauen (bis +60 min), besonders vor und nach langen Läufen |
| Vor Schlüsseleinheiten / nach harten Tagen | +30–60 min Schlafgelegenheit |
| Nachtlauf | Schlafplan für diese Nacht und den Folgetag wird verschoben (Nap vorher, Ausschlafen danach) |
| Letzte 2 Wochen | Rennschlafplan: gute Nächte vor dem Rennen, Nap am Renntag nachmittags vor dem Start um 23:00 |

- Tipps rotieren aus einem Pool (jeder Tipp höchstens einmal in N Tagen).
- Umsetzungsquote: Abweichung zwischen empfohlenen und tatsächlichen Zeiten laut WHOOP (±30 min gilt als umgesetzt).
- Push-Erinnerung (optional) zur Schlafenszeit und zum Nap.

### 5.10 WHOOP-Zuordnung (`core/whoop`, rein und getestet)

WHOOP-Zyklen laufen von Einschlafen zu Einschlafen, nicht von Mitternacht zu Mitternacht. Regeln:

- **Recovery für Trainingstag D** = Recovery des WHOOP-Zyklus, dessen **Hauptschlaf (kein Nap) zuletzt vor Beginn des Trainingsfensters von D endete** und nicht älter als ca. 20 h ist.
  - Tag 3: Hauptschlaf 08:00–14:00 an D → Recovery dieses Zyklus → gilt für das Fenster ab 15:00 an Tag 3 (Test aus SPEC 11).
  - Tag 2: Nachtschlaf vor Tag 2 → Morgen-Recovery. Der Nap am Nachmittag wird als Nap geführt und ändert die Recovery nicht, zählt aber zur Schlafsumme bzw. zum Defizit.
  - Nacht Tag 2 → 3 ohne Schlaf: Es gibt keinen neuen Zyklus, bis um 08:00 geschlafen wird. Das wird korrekt als „Arbeitsnacht“ erkannt.
- **Schlafdauer „letzte Nacht“** = Summe der Schlafe seit Ende des vorletzten Hauptschlafs (Nap eingeschlossen), wird für die < 5 h-Regel genutzt.
- **Workout → Einheit:** Die Einheit am selben Trainingstag mit maximaler Zeitüberlappung zum Fenster und passender Sportart (Lauf/Kraft) wird zugeordnet. Mehrdeutige Fälle werden als Vorschlag markiert, der Nutzer kann korrigieren.
- Zeitzonen: Die WHOOP-Zeiten (UTC + `timezone_offset`) werden nach Europe/Berlin umgerechnet und über die Sommerzeitgrenze getestet.

### 5.11 Rennwoche (`core/race`)

- Konflikt-Erkennung: 18.06. (Tag 5, evtl. V) und 19.06. (Tagschicht) → Warnung beim ersten Start und im Heute-Banner, bis Urlaub für 18.–20.06. eingetragen ist. Empfehlung: ab 14.06.
- Erinnerungen: frühzeitig (sofort beim Onboarding, dann z. B. 01.12., 01.02., 01.04. bzw. vor der Urlaubsplanung) bis Urlaub eingetragen ist.
- Checkliste: Anreise Ehrwald, Pflichtausrüstung, Stirnlampe + Ersatzakkus, Verpflegungsplan, Schlafstrategie (Nap am Nachmittag).
- Taper: Nachtschichten im Taper senken den Umfang zusätzlich (Config-Wert), und die Schlafempfehlungen priorisieren Erholung.

---

## 6. Testplan (Vitest, Phase 2)

Alle Szenarien aus SPEC 11. Dazu gehören:

- `shift`: Zyklustag ab 02.10.2026, Jahreswechsel, Sommerzeit (28.03.2027 / 31.10.2027), 18.06.2027 = 5, negative Differenzen, Overrides
- `scheduler`: nichts auf Tag 1/V, alle Typen auf Tag 2 wenn sie ins Fenster passen, V-Schicht kurzfristig → Verschieben einmal / Streichen, kein Umfangs-Nachholen, keine schweren Beine vor langen Läufen, Qualität und Rennen
- `recovery`: Grün, gelb und rot × jeder Einheitentyp, gelb stuft nur harte Einheiten runter, < 5 h Schlaf, Tag 3, Warnsignal, rote Serie → nächster Mikrozyklus reduziert, fehlende WHOOP-Daten → manuelle Eingabe
- `lookahead`: gelb vor B2B reduziert harte Einheit (Schwelle → 45 min locker), locker bleibt, nur rot oder < 5 h streicht
- `strength`: Aufstieg nur bei erfülltem Kriterium, Muscle-Up-Voraussetzungen
- `whoop`: Tagschlaf 08–14 → Tag 3, Nap vor der Nachtschicht zählt nicht als Hauptschlaf, Zeitzonen
- `sleep`: Training an Tag 2 endet vor dem Nap, Aufstehen 05:45 passt zu 06:45 und Losfahren 06:30, Abend Tag 3 im normalen Rhythmus
- `race`: Taper-Phase, Rennwoche, Urlaubswarnung

---

## 7. Nächste Schritte

Nach dem OK zu diesem Dokument folgt **Phase 2 (Kernlogik)** im Plan-Modus: Projekt-Setup (Vite, TS, Vitest) und dann `src/core` Modul für Modul mit Tests. Es arbeitet mit Beispieldaten statt WHOOP.
