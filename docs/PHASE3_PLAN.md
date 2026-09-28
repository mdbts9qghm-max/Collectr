# Phase 3: Oberfläche (mobile-first, Dark Mode, Deutsch)

## Kontext

Die Kernlogik aus Phase 2 (`src/core/`, 160 Tests) ist fertig. In Phase 3 entsteht die Oberfläche (SPEC 9, 12.3): Onboarding, Heute, Zyklus, Gesamtplan, Kraft und Tracking, dazu (Entscheidung) einfache Einstellungen. Die Daten liegen bis Phase 4 lokal in IndexedDB. Erholungsdaten kommen aus der manuellen Eingabe oder aus einem abschaltbaren Demo-Modus mit den Beispieldaten. In den Einstellungen gibt es „Datum simulieren“. Die Ansichten Erholung (Phase 6) und Export (Phase 7) folgen später.

## 1. Setup

- Tailwind CSS v4 (`@tailwindcss/vite`), Dark Mode als Standard, Recharts, React Router, `idb`
- Playwright (`@playwright/test`, Chromium aus `/opt/pw-browsers`), Viewport iPhone 13 (390×844), Script `npm run e2e`
- `index.html`: `lang="de"`, `viewport-fit=cover`, Theme-Farbe

## 2. Architektur

```
src/
  data/        Repository-Interface + IndexedDbRepository (Phase 4 tauscht nur die Implementierung)
               Stores: settings (Profil, Schichteinstellungen, Gewichte, Demo, Datum-Simulation, Onboarding-Status,
               Urlaubs-Erinnerung quittiert), overrides, logs, manualReadiness, strengthTests, strengthState,
               checklist, adjustmentDecisions (Anpassung abgelehnt), backup (JSON-Export/-Import mit zod)
  app/         AppState (React-Context): lädt Repository, berechnet mit src/core
               - Kalender (createShiftCalendar + Overrides), Plan (generatePlan mit Logs, microModifiers, strengthState)
               - todayService: Tag, Fenster, Readiness (manuell oder Demo), adjustSession, Vorausschau, Schlafempfehlung,
                 Nachhol-Vorschlag, Warnungen (Urlaubskonflikt, Bergwochenende, Taper-Nachtschichten)
               - clock: echtes Datum (Europe/Berlin) oder simuliertes Datum
  ui/
    components/ Ampel, SessionCard (Typ, Ziel, Dauer/km, hm, Intensität, Ablauf, Übungen), AdjustmentCompare
                (Original ↔ Anpassung + Begründung, „Original ausführen“), ShiftBadge, Countdown, SleepCard,
                ManualReadinessForm, WarningBanner, Footer-Hinweis (SPEC 13), BottomNav
    pages/      Onboarding, Heute, Zyklus, Gesamtplan, Kraft, Tracking, Einstellungen
```

Die Logik bleibt in `src/core`, die UI ruft sie nur auf. Wenn eine kleine reine Hilfsfunktion fehlt (z. B. Zusammenfassung für den Tag), kommt sie mit Test nach `src/core`.

## 3. Ansichten

1. **Onboarding** (4 Schritte): Profil (vorausgefüllt, SPEC 3) → Schichtmodell mit Ankerdatum 02.10.2026, Vorschau der nächsten 10 Tage → erster Krafttest (max. Klimmzüge, Dips, Hollow Hold, Lever-Stufen + Haltezeit, optional Hängen/Liegestütz/Rows) → Hinweis auf den Urlaubskonflikt 18./19./20.06. und SPEC-13-Hinweis. Der WHOOP-Schritt wird als „folgt später“ angezeigt.
2. **Heute** (Start): Datum, Zyklustag + Schicht, Countdown, Warnbanner, Recovery-Ampel (oder manuelle Eingabe bzw. Demo), heutige Einheiten mit Zeitfenster, Original vs. Anpassung + Begründung, Buttons „Erledigt“/„Auslassen“ und „Original ausführen“ (wird protokolliert), Schlafempfehlung (heute + kommende Nacht, Nap), Tipp, Nachhol-Vorschlag.
3. **Zyklus**: aktueller und nächster 5-Tage-Rhythmus mit Schicht und Einheiten. Ein Tipp auf einen Tag öffnet ein Sheet: V-Schicht, Urlaub, Krank, Tausch, Überstunden, Fortbildung setzen/entfernen. Der Plan wird sofort neu berechnet, Verschiebungen/Streichungen werden angezeigt.
4. **Gesamtplan**: Mesozyklen mit Phasen, Entlastungen markiert. Recharts: km/Woche und hm/Woche (Soll aus dem Plan, Ist aus dem Tracking, Umschalter Mikrozyklus/Kalenderwoche), Kraftvolumen. Bergwochenenden und Rennen markiert.
5. **Kraft**: aktuelle Stufe je Leiter mit Kriterium für den Aufstieg, nächstes Ziel, Testergebnisse im Verlauf (Diagramm), neuen Krafttest eintragen.
6. **Tracking**: Einheit abhaken mit Ist-Werten (Dauer, km, hm), Gefühl 1–5, Notiz, Verpflegung (g KH/h) und Ausrüstung bei langen Läufen, Kraft-Ergebnisse je Übung (Sätze/Wdh./Haltezeit, RPE bei Beinen) → `evaluateSession` → Aufstieg anzeigen. Verlauf der letzten Einheiten.
7. **Einstellungen**: Profil, Arbeitsweg, Schichtmodell (Anker), Gewichtung der Erholungsfaktoren (Schieberegler), Demo-Modus, Datum simulieren, JSON-Backup Export/Import, Daten zurücksetzen.

Navigation: untere Tab-Leiste (Heute, Zyklus, Plan, Kraft, Tracking), Einstellungen über das Zahnrad. Footer-Hinweis (SPEC 13) auf allen Seiten.

## 4. Tests

- Vitest: Repository (fake-indexeddb), Backup-Schema, todayService (Demo/manuell/fehlende Daten), ggf. neue Core-Helfer
- Playwright im Handy-Format (390×844), mit simuliertem Datum:
  - Onboarding komplett, danach Heute sichtbar, Urlaubshinweis angezeigt
  - Heute: manuelle Eingabe → Ampel + angepasste Einheit mit Begründung, „Original ausführen“, „Erledigt“
  - Zyklus: V-Schicht auf Tag 5 eintragen → Einheit verschwindet/verschoben
  - Gesamtplan rendert Diagramme, Kraft-Test eintragen, Tracking mit Kraft-Ergebnissen
  - keine horizontale Scrollleiste, Footer-Hinweis sichtbar
- Screenshots der Ansichten zur eigenen Kontrolle (und für dich)

## 5. Abschluss

`npm test`, `npm run e2e`, `npm run build`, `npm run lint` grün → CLAUDE.md aktualisieren → Commit + Push auf `claude/gifted-ride-l7rok2` → Screenshots senden → Planung Phase 4 im Plan-Modus.
