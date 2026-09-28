# SPEC: Trainings-App für den Ehrwald Trail 2027

Diese Datei ist die vollständige Vorgabe für die App. Lies sie komplett, bevor du planst oder Code schreibst. Wenn etwas unklar oder widersprüchlich ist, frag nach, statt zu raten.

---

## 1. Ziel der App

Eine Web-App (mobile-first, als PWA installierbar), die mich als Schichtarbeiter vom **1. Oktober 2026 bis zum Renntag am 18. Juni 2027** auf meinen ersten Ultratrail vorbereitet. Sie verbindet Lauftraining und Calisthenics-Krafttraining in einem Plan, der sich vollautomatisch an meinen Schichtplan, meinen Schlaf und meine Erholung (WHOOP-Daten) anpasst.

Leitsatz: **Ich will gesund und im Zeitlimit ins Ziel kommen und dabei in Calisthenics stärker werden.** Konsistenz und Erholung gehen vor maximaler Belastung.

---

## 2. Das Rennen

- **Ehrwald Trail** beim Zugspitz Ultra Trail by UTMB
- 86 km, 4.295 Höhenmeter positiv (entsprechend viel bergab), alpines Gelände rund um die Zugspitze
- Start: **Freitag, 18. Juni 2027, 23:00 Uhr** in Ehrwald (Tirol)
- Zeitlimit: **22 Stunden**, also Zielschluss spätestens Samstag, 19. Juni 2027, 21:00 Uhr
- Ein großer Teil läuft nachts mit Stirnlampe
- Mein Ziel: **Ankommen im Zeitlimit.** Keine Zielzeit.

---

## 3. Athletenprofil

- Aktueller Laufumfang: 20–40 km pro Woche
- Längster Lauf bisher: unter 42 km, noch kein Ultra
- Keine Verletzungen oder bekannten Schwachstellen
- Wohnort: eher flach, keine Berge in der Nähe
- Zugang zu: Fitnessstudio (inkl. Laufband mit Steigung) und Calisthenics-Park
- Calisthenics: Anfänger (wenige Klimmzüge)
- Calisthenics-Ziele: **Muscle-Up, Front Lever, Back Lever, allgemein stärker werden**
- Trainingsumfang: legt der Plan fest, abhängig von Phase, Schichten und Erholung
- Wearable: **WHOOP** (für Schlaf, Recovery, HRV, Ruhepuls, Strain)

Alle diese Werte sind im Onboarding vorausgefüllt und in den Einstellungen änderbar.

---

## 4. Schichtmodell (exakt so hinterlegen)

### 4.1 Rhythmus
Wechselschichtdienst mit einem **5-Tage-Grundrhythmus**, der sich 7-mal zu einem **35-Tage-Zyklus** wiederholt:

| Zyklustag | Schicht | Dienstzeit | Tatsächlicher Arbeitsbeginn |
|---|---|---|---|
| 1 | Tagschicht (T) | 07:00–19:00 | 06:45 |
| 2 | Nachtschicht (N) | 19:00–07:00 (Folgetag) | 18:45 |
| 3 | Schlaftag (S) | – | – |
| 4 | Frei (F) | – | – |
| 5 | Frei (F) **oder** V-Schicht (V) | V: 08:00–20:00 | V: 07:45 |

- **Ankerdatum:** Freitag, **2. Oktober 2026 = Zyklustag 1** (Tagschicht). Alle weiteren Tage werden daraus berechnet: `zyklustag = ((datum − 2026-10-02) mod 5) + 1`.
- Ich beginne immer 15 Minuten vor Schichtbeginn.
- **V-Schichten fallen willkürlich** auf einen Tag 5. Ich trage sie manuell ein (ein Tipp im Kalender genügt), sobald ich sie kenne. Die App plant dann sofort um.
- Einzelne Tage müssen manuell überschreibbar sein: Urlaub, Tausch, Krankheit, Überstunden, Fortbildung. Urlaub zählt als freier Tag.
- Optional: Import einer .ics-Datei mit dem Dienstplan, falls mein Arbeitgeber einen liefert.

### 4.2 Schlafmuster und Arbeitsweg
- Arbeitsweg: **unter 15 Minuten** pro Strecke. Die App rechnet mit 15 Minuten plus 15 Minuten Puffer vor dem Arbeitsbeginn.
- **Vor der Nachtschicht schlafe ich regelmäßig vor** (Nap am Nachmittag). Dieser Nap ist fest eingeplant, Training an Tag 2 muss rechtzeitig davor enden.
- Nach der Nachtschicht schlafe ich **von ca. 08:00 bis 14:00 Uhr**. Der Schlaftag (Tag 3) beginnt also mit Schlaf, Training ist frühestens ab dem Nachmittag möglich.

### 4.3 Trainingsfenster pro Zyklustag (harte Regeln)

| Zyklustag | Training möglich? | Zeitfenster | Geeignete Einheiten |
|---|---|---|---|
| 1 Tagschicht | **Nein** | – | Ruhetag, höchstens 10 min Mobility am Abend (optional) |
| 2 Nachtschicht | **Ja, vor der Schicht** | ca. 08:00–13:30, damit danach Essen und der Vorschlaf-Nap (ca. 15:00–17:00) Platz haben | **alle Einheiten**, die ins Zeitfenster passen: Qualitätseinheiten, mittellange Läufe, Kraft, Calisthenics. Keine pauschale Einschränkung, nur Recovery (Abschnitt 6) und Zeitfenster entscheiden. |
| 3 Schlaftag | **Nur je nach Erholung** | ab ca. 15:00 | nur locker: Regenerationslauf, Mobility, leichtes Skill-Training. Bei schlechter Recovery: Ruhetag. |
| 4 Frei | **Ja** | ganztägig | Schlüsseleinheiten: langer Lauf, Höhenmeter-Einheit, Intervall, schweres Beintraining |
| 5 Frei | **Ja** | ganztägig | Schlüsseleinheiten: Back-to-back-Lauf, Calisthenics-Hauptsession, Nachtlauf |
| 5 V-Schicht | **Nein** (wie Tagschicht) | – | Ruhetag. Geplante Einheit wird verschoben oder gestrichen, nie auf Tag 1 gelegt. |

Konsequenz: Pro 5-Tage-Rhythmus gibt es in der Regel **drei vollwertige Trainingstage (2, 4 und 5)** und einen **optionalen Tag (3)**. Tag 2 ist nur durch das Zeitfenster begrenzt, deshalb liegen sehr lange Läufe und Back-to-backs auf Tag 4 und 5. Wenn Tag 5 eine V-Schicht ist, fällt ein vollwertiger Tag weg. Der Plan muss damit realistisch umgehen und darf Verlorenes nicht in die restlichen Tage quetschen.

---

## 5. Planungslogik

### 5.1 Planungseinheiten
Wichtige Designentscheidung: **Der Plan denkt nicht in Kalenderwochen, sondern in Schichtzyklen.**
- **Mikrozyklus = 5-Tage-Schichtrhythmus**
- **Mesozyklus = 35-Tage-Zyklus** (7 Mikrozyklen). Der letzte (oder die letzten 1–2) Mikrozyklen eines Mesozyklus sind Entlastung mit ca. 30–40 % weniger Umfang.
- Für die Anzeige rechnet die App zusätzlich auf Kalenderwochen um (Wochenkilometer, Wochenhöhenmeter), damit ich vertraute Zahlen sehe.

Zeitraum: ca. 260 Tage, also 52 Mikrozyklen bzw. gut 7 Mesozyklen.

### 5.2 Phasen (rückwärts vom Renntag berechnen)

1. **Grundlage** (Oktober bis Dezember 2026): aerober Umfang langsam aufbauen, viele lockere Kilometer, Lauf-ABC, Beinkraft und Sehnenstabilität, Calisthenics-Basis (Hauptfokus Kraft in dieser Phase).
2. **Aufbau** (Januar bis März 2027): Umfang und Höhenmeter steigern, Bergauf-Einheiten auf dem Laufband, erste längere Läufe über 30 km, Calisthenics-Skills im Aufbau.
3. **Rennspezifisch** (April bis Ende Mai 2027): Back-to-back-Läufe, lange Läufe bis ca. 50–60 km bzw. 6–8 Stunden, Nachtläufe mit Stirnlampe, Wochenenden in den Bergen, Verpflegungstraining. Calisthenics nur noch auf Erhaltungsniveau.
4. **Tapering** (ca. 2–3 Wochen vor dem Rennen): Umfang deutlich runter, Intensität in kleinen Dosen erhalten, Kraft stark reduziert, Fokus auf Schlaf.

Die genauen Grenzen berechnet die App, sie sollen aber auf Grenzen von Mesozyklen fallen.

### 5.3 Laufprogression
- Start bei meinem aktuellen Umfang (Standard 30 km pro Woche, einstellbar).
- Steigerung höchstens ca. 10 % pro Woche, Entlastung wie in 5.1.
- Der Plan legt den Zielumfang für die Spitzenphase selbst fest. Er soll für ein erstes Finish bei 86 km und 4.300 hm realistisch und für einen Schichtarbeiter umsetzbar sein. Begründe die gewählten Spitzenwerte in einem Code-Kommentar.
- Lange Läufe liegen immer auf Tag 4 oder 5, Back-to-backs auf Tag 4 + 5.
- Intensität überwiegend locker (ca. 80 % locker), wenige gezielte Qualitätseinheiten (Bergauf-Intervalle, Schwellenläufe).
- Ab der Aufbauphase: zu jedem langen Lauf Verpflegungstraining (Kohlenhydrate pro Stunde protokollieren) und Ausrüstungstest.

### 5.4 Höhenmeter im Flachland
Ich habe keine Berge in der Nähe. Der Plan muss Höhenmeter ersetzen durch:
- **Laufband mit Steigung** (10–15 %), Gehen und Laufen im Wechsel, auch mit Stöcken und Rucksack
- **Stairmaster, Treppen, Parkhäuser, Brücken oder Deiche**
- **Exzentrische Beinkraft** für das Bergablaufen: Step-downs, bulgarische Split Squats, Nordic Curls, Tempo-Kniebeugen, Wadenheben
- **Bergwochenenden** in der rennspezifischen Phase (z. B. alle 4–6 Wochen an zwei freien Tagen am Stück), mit Hinweis rechtzeitig vorher, damit ich planen kann

Jede Einheit hat Soll-Höhenmeter. Bei Laufband-Einheiten berechnet die App die Höhenmeter aus Steigung und Distanz.

### 5.5 Kraft und Calisthenics
Ich bin Anfänger. Der Plan arbeitet mit **Progressionsstufen**, und ich steige erst auf, wenn ich die Kriterien der aktuellen Stufe erfülle.

Progressionen (Beispiele, bitte fachlich sauber ausbauen):
- **Klimmzug / Muscle-Up:** Hängen und Scapula-Pulls → Australian Rows → Negativ-Klimmzüge → Band-Klimmzüge → strikte Klimmzüge → explosive Klimmzüge (bis Brust/Hüfte) → Übergangstraining (z. B. mit Band oder niedriger Stange) → Muscle-Up. Voraussetzungen für Muscle-Up-Training z. B. ca. 10 saubere Klimmzüge und 10+ Dips.
- **Dips / Drücken:** Liegestütz-Varianten → Stütz halten → Negativ-Dips → Dips → schwerere Varianten.
- **Front Lever:** Hollow Body Hold → Tuck Front Lever → Advanced Tuck → One Leg → Straddle.
- **Back Lever:** German Hang → Skin the Cat → Tuck Back Lever → Advanced Tuck → One Leg.
- **Core:** Hollow Body, Hanging Knee Raises → Leg Raises, L-Sit-Vorstufen.
- **Beine (Fitnessstudio):** Kniebeuge-Varianten, Split Squats, Kreuzheben (moderat), Step-ups, Wadenkraft. Ziel ist Trail-Robustheit, keine Maximalkraft.

Regeln:
- In der Grundlagenphase 2–3 Krafteinheiten pro 5-Tage-Rhythmus, später weniger, in der spezifischen Phase Erhaltung, im Taper nur noch kurze Einheiten.
- **Oberkörper-Calisthenics und lockeres Laufen** dürfen am selben Tag stattfinden.
- **Schweres Beintraining nie am Tag vor einem langen Lauf oder einer Qualitätseinheit** und nie am Nachttag vor dem Rennen.
- Tag 2 eignet sich gut für Calisthenics-Hauptsessions und Krafttraining, weil danach Nap und Schicht folgen, aber kein Lauf am nächsten Tag (Tag 3 ist optional).
- Alle 35 Tage ein **Krafttest** am Ende des Mesozyklus: max. saubere Klimmzüge, max. Dips, Hollow-Body-Hold, beste Lever-Stufe mit Haltezeit. Die Ergebnisse steuern die nächsten Stufen.

---

## 6. Schlaf und Erholung als Faktor jeder Einheit (Kernfeature!)

**Jede einzelne Einheit** wird vor der Durchführung anhand meiner aktuellen Erholung bewertet und bei Bedarf angepasst. Das gilt für Laufen, Kraft und Skill-Training gleichermaßen.

### 6.1 Eingangsgrößen
- WHOOP **Recovery Score** (grün 67–100, gelb 34–66, rot 0–33)
- **HRV** im Vergleich zu meinem persönlichen 7-Tage- und 30-Tage-Mittel
- **Ruhepuls** im Vergleich zum persönlichen Mittel
- **Schlafdauer, Sleep Performance, Schlafeffizienz** und aufgelaufenes **Schlafdefizit** der letzten Tage
- **Strain** des Vortags und die Trainingslast der letzten 7 Tage
- **Schichtkontext:** Zyklustag, Stunden seit Schichtende, Stunden bis zum nächsten Schichtbeginn, ob die letzte Nacht eine Arbeitsnacht war
- Wenn WHOOP-Daten fehlen: kurze manuelle Eingabe (Schlafdauer, Schlafqualität 1–5, Gefühl 1–5)

### 6.2 Berechnung
Aus diesen Größen berechnet die App pro Einheit einen **Einheiten-Faktor** (z. B. 0–100 %), der bestimmt, wie viel der geplanten Einheit sinnvoll ist. Die Gewichtung liegt in einer eigenen, gut kommentierten Konfigurationsdatei, damit ich sie später nachjustieren kann.

Unterschiedliche Einheiten reagieren unterschiedlich empfindlich:
- **Hohe Empfindlichkeit:** Intervalle, Schwellenläufe, schweres Beintraining, Maximalkraft-Versuche und neue Skill-Stufen
- **Mittlere Empfindlichkeit:** lange Läufe, Höhenmeter-Einheiten, Calisthenics-Hauptsession
- **Niedrige Empfindlichkeit:** lockere Läufe, Mobility, leichtes Skill-Training

### 6.3 Anpassungsregeln (Ausgangspunkt, fachlich prüfen und verfeinern)
- **Grün:** Einheit wie geplant.
- **Gelb:** **Nur harte Einheiten** (hohe Empfindlichkeit laut 6.2) werden runtergestuft: Intensität eine Stufe runter (Intervall wird lockerer Lauf, schwere Sätze werden technische Sätze, neue Skill-Stufe wird Training auf der aktuellen Stufe), Dauer 10–25 % kürzer. Alle anderen Einheiten, also auch lange Läufe, Höhenmeter-Einheiten und die Calisthenics-Hauptsession, laufen **wie geplant**.
- **Rot:** Ruhetag oder höchstens 30 Minuten sehr locker bzw. Mobility.
- **Schlaf unter 5 Stunden:** unabhängig von der Recovery keine Intensität und kein schweres Krafttraining.
- **Schlaftag (Tag 3):** Training nur, wenn Recovery mindestens gelb ist und der Tagschlaf mindestens ca. 5 Stunden betrug.
- **Tag 2 vor der Nachtschicht:** keine pauschale Obergrenze. Die kommende Nachtschicht fließt wie jede andere Belastung in den Einheiten-Faktor und die vorausschauende Regel (6.3a) ein: Bei grüner Recovery läuft die Einheit wie geplant, bei gelber Recovery gilt dasselbe wie an jedem anderen Tag: Nur harte Einheiten werden runtergestuft. Das Training muss vor dem Nap enden.
- **Mehrere gelbe/rote Tage in Folge oder wachsendes Schlafdefizit:** Umfang des nächsten Mikrozyklus automatisch reduzieren.
- **Warnsignal** (z. B. Ruhepuls mehrere Tage deutlich erhöht und HRV deutlich unter dem Mittel): Hinweis, eine Pause einzulegen und bei Krankheitsgefühl ärztlich abklären zu lassen.
- **Nie** automatisch härter machen als geplant. Bei sehr guter Recovery darf die App höchstens vorschlagen, eine verschobene Schlüsseleinheit nachzuholen, wenn das die Regeln aus Abschnitt 4 und 5 nicht verletzt.
- Verpasste Schlüsseleinheiten werden höchstens einmal verschoben (auf den nächsten passenden Tag 4 oder 5), sonst gestrichen. Kein Nachholen von Umfang.

### 6.3a Vorausschauende Erholung (Schlüsseleinheiten schützen)
Die App bewertet nicht nur den heutigen Tag, sondern schaut **1–2 Tage nach vorn**. Stehen dort Schlüsseleinheiten an (langer Lauf, Back-to-back, Qualitätseinheit, Bergwochenende, Krafttest), wird die heutige Einheit so gewählt, dass ich dafür möglichst erholt bin.

- **Grundsatz: reduzieren statt streichen.** Die heutige Einheit wird gekürzt, in der Intensität gesenkt oder in eine schonendere Variante umgewandelt (z. B. schweres Beintraining wird Oberkörper-Calisthenics oder Mobility, ein Tempolauf wird ein kurzer lockerer Lauf). Gestrichen wird nur bei roter Recovery oder unter 5 Stunden Schlaf, wie in 6.3. Bei gelber Recovery gilt auch hier: Nur harte Einheiten werden reduziert, lockere und mittlere Einheiten bleiben.
- **Auslöser:** heutige Recovery gelb, ein fallender HRV-Trend über 2–3 Tage, wachsendes Schlafdefizit oder eine Nachtschicht zwischen heute und der Schlüsseleinheit.
- **Stärke der Reduktion:** abhängig davon, wie wichtig die kommende Einheit ist und wie nah sie liegt. Beispiel: Back-to-back an Tag 4 und 5, heute ist Tag 2 mit gelber Recovery und einem geplanten Schwellenlauf: Der Schwellenlauf wird ein lockerer Lauf von 45 Minuten. Ein ohnehin lockerer Lauf bliebe unverändert.
- **Gelernte Muster:** Sobald genug Daten da sind (siehe 6.4), berücksichtigt die App, wie stark meine Recovery typischerweise nach einer Nachtschicht oder einem langen Lauf abfällt, und plant diesen Abfall ein.
- Die Begründung nennt die kommende Einheit (z. B. "Recovery 55 %, übermorgen steht der 35-km-Lauf an: Schwellenlauf wird 45 min locker").

### 6.3b Schlafempfehlungen
Die App empfiehlt mir **aktiv** für jeden Tag, wann ich schlafen gehen und aufstehen soll, und plant den Nap vor der Nachtschicht mit ein.

- **Grundlage:** mein Schlafbedarf laut WHOOP (inklusive Schlafdefizit, Strain und aktueller Recovery), die Schichtzeiten aus Abschnitt 4, mein Arbeitsweg und die geplanten Einheiten der nächsten Tage.
- **Typische Empfehlungen pro Zyklustag** (Ausgangswerte, dynamisch anpassen):
  - **Abend vor der Tagschicht** (Tag 5 bzw. Tag vor Tag 1): Aufstehen ca. 05:45, Zubettgehen so, dass der Schlafbedarf gedeckt ist (typisch ca. 21:30–22:00).
  - **Nach der Tagschicht** (Nacht zu Tag 2): normal schlafen, morgens ausschlafen erlaubt, damit ich für die Nacht Reserven habe.
  - **Tag 2:** Nap ca. 15:00–17:00 (Dauer nach Bedarf, z. B. 90 Minuten für einen vollen Schlafzyklus), Aufstehen spätestens so, dass ich um 18:30 losfahren kann.
  - **Nach der Nachtschicht:** Schlaf ca. 08:00–14:00 wie gewohnt, mit Tipps für dunklen, ruhigen Schlaf.
  - **Abend des Schlaftags:** Zubettgehen zu einer normalen Uhrzeit, damit ich schnell wieder in den Tagesrhythmus komme. Training an Tag 3 endet deshalb spätestens ca. 3 Stunden vor der empfohlenen Schlafenszeit.
  - **Freie Tage:** möglichst gleichbleibende Zeiten, Schlafdefizit gezielt abbauen, besonders vor und nach langen Läufen.
- **Kopplung ans Training:** Vor Schlüsseleinheiten und nach harten Tagen empfiehlt die App mehr Schlaf. Ein geplanter Nachtlauf verschiebt die Empfehlung für diese Nacht und den Folgetag.
- **Rennvorbereitung:** In den letzten zwei Wochen empfiehlt die App einen Schlafplan für den Rennstart um 23:00 Uhr (guter Nachtschlaf in den Nächten davor, Nap am Nachmittag des Renntags).
- **Kurze Tipps** dürfen dabei sein (z. B. Koffein nicht zu spät, Licht nach der Nachtschicht meiden), aber knapp und nicht jeden Tag dieselben.
- **Erinnerung:** optionale Push-Benachrichtigung (Web Push über die PWA) zur empfohlenen Schlafenszeit und zum Nap.
- Die App vergleicht Empfehlung und tatsächlichen Schlaf laut WHOOP und zeigt mir, wie gut ich die Empfehlungen umsetze.

### 6.4 Transparenz
- Jede angepasste Einheit zeigt **Original und Anpassung** nebeneinander und den **Grund in einem Satz** (z. B. "Recovery 41 %, nur 5,5 h Schlaf nach der Nachtschicht: Intervall wird lockerer Lauf, 40 statt 55 min").
- Ich kann eine Anpassung ablehnen und den Originalplan ausführen. Das wird protokolliert.
- Nach ca. 6 Wochen zeigt die App Auswertungen: Wie reagieren meine Recovery und HRV auf Nachtschichten, lange Läufe und Krafttraining? Diese Muster fließen optional in die Gewichtung ein.

---

## 7. Rennwoche und Konflikt mit dem Schichtplan

Nach dem Ankerdatum fällt die Rennwoche so:

| Datum | Zyklustag |
|---|---|
| Mo, 14.06.2027 | Tagschicht |
| Di, 15.06.2027 | Nachtschicht |
| Mi, 16.06.2027 | Schlaftag |
| Do, 17.06.2027 | Frei |
| **Fr, 18.06.2027 (Rennstart 23:00)** | Frei oder V-Schicht |
| **Sa, 19.06.2027 (Zielschluss 21:00)** | **Tagschicht** |
| So, 20.06.2027 | Nachtschicht |

Die App muss:
- diesen **Konflikt beim ersten Start deutlich anzeigen** und mich frühzeitig erinnern, **Urlaub zu beantragen** (mindestens für 18. bis 20.06., besser ab 14.06. für einen ausgeruhten Taper und die Anreise)
- eine Checkliste für die Rennwoche enthalten: Anreise nach Ehrwald, Pflichtausrüstung, Stirnlampe und Ersatzakkus, Verpflegungsplan, Schlafstrategie für den Start um 23:00 Uhr (Nap am Nachmittag)
- Schichten in der Taper-Phase besonders berücksichtigen, weil jede Nachtschicht vor dem Rennen die Erholung kostet

---

## 8. WHOOP-Integration

- Anbindung an die **WHOOP Developer API v2** per OAuth 2.0 (Authorization Code Flow)
- Scopes: `offline read:profile read:recovery read:sleep read:cycles read:workout read:body_measurement`
- Täglicher automatischer Abruf: Recovery Score, HRV, Ruhepuls, SpO2 (falls vorhanden), Schlaf (Dauer, Phasen, Effizienz, Performance, Schlafbedarf), Strain und Workouts
- **Webhooks** für `recovery.updated`, `sleep.updated` und `workout.updated`, damit der Plan sich direkt nach dem Aufwachen anpasst (also auch nach dem Tagschlaf nach der Nachtschicht). Fallback: Abruf beim Öffnen der App.
- WHOOP-Workouts werden automatisch einer geplanten Einheit zugeordnet und als Ist-Werte übernommen (Dauer, Strain, Herzfrequenzzonen, Distanz und Höhenmeter falls vorhanden). Ich kann die Zuordnung korrigieren.
- Access-Token automatisch per Refresh-Token erneuern, API-Limits beachten, Daten cachen.
- Wichtig: Nach Nachtschichten liegt mein Hauptschlaf am Tag. Die Zuordnung von Schlaf und Recovery zum richtigen Trainingstag muss über WHOOP-Zyklen laufen, nicht über Kalendertage. Bitte dafür eigene Tests schreiben.

---

## 9. Funktionen und Ansichten

1. **Onboarding:** Profil (vorausgefüllt aus Abschnitt 3), Schichtmodell mit Ankerdatum (vorausgefüllt aus Abschnitt 4), WHOOP verbinden, erster Krafttest, Hinweis auf den Urlaubskonflikt.
2. **Heute (Startbildschirm):** Zyklustag und Schicht, Recovery-Ampel, die heutige Einheit mit Anpassung und Begründung, Zeitfenster, Schlafempfehlung für heute und die kommende Nacht (inklusive Nap vor der Nachtschicht), Button "Erledigt" bzw. "Auslassen". Außerdem ein Countdown bis zum Rennen.
3. **Zyklus-Ansicht:** der aktuelle 5-Tage-Rhythmus und der nächste, mit Schichten und Einheiten. V-Schicht und Urlaub per Tipp eintragbar.
4. **Gesamtplan:** alle Mesozyklen mit Phasen, Diagramme für Laufkilometer und Höhenmeter (Soll/Ist), Kraftvolumen, Entlastungszyklen markiert.
5. **Erholung:** Verlauf von Recovery, HRV, Ruhepuls und Schlaf, mit Schichten als Hintergrundfarbe, damit Zusammenhänge sichtbar werden.
6. **Kraft:** aktuelle Stufe je Progression, Testergebnisse im Verlauf, nächstes Ziel.
7. **Tracking:** Einheiten abhaken, Ist-Werte, Gefühl 1–5, Notizen, Verpflegung bei langen Läufen.
8. **Einstellungen:** Profil, Schichtmodell, Gewichtung der Erholungsfaktoren, WHOOP-Verbindung.
9. **Export:** Plan als .ics-Kalender, Backup als JSON (Export und Import).

Jede Einheit enthält: Typ, Ziel der Einheit in einem Satz, Dauer bzw. km, Höhenmeter, Intensität (Pulszone oder Gefühl), Ablauf (Aufwärmen, Hauptteil, Abwärmen), bei Kraft die Übungen mit Sätzen, Wiederholungen bzw. Haltezeiten und Pausen.

Sprache: Deutsch. Einheiten: km, m, kg. Datumsformat: TT.MM.JJJJ. Zeitzone: Europe/Berlin.

---

## 10. Technik

- **Frontend:** Vite + React + TypeScript, Tailwind CSS, Recharts
- **Backend:** Supabase (Postgres, Auth für mich als einzigen Nutzer, Edge Functions für WHOOP-OAuth-Callback, Token-Refresh, Datenabruf und Webhook-Empfang, Row Level Security)
- Client Secret und Tokens **nur serverseitig**, niemals im Frontend oder im Repo. Secrets über Umgebungsvariablen, `.env` in `.gitignore`.
- **Deployment:** Frontend auf Vercel
- Mobile-first, Dark Mode, PWA (installierbar, Heute-Ansicht offline lesbar)
- **Architektur:** Die gesamte Trainingslogik (Planerstellung, Schichtberechnung, Erholungsfaktor, Anpassungsregeln, Kraftprogression) liegt als **reine, UI-unabhängige TypeScript-Module** in einem eigenen Ordner und ist vollständig testbar. Alle Schwellenwerte und Gewichtungen stehen in einer zentralen Konfigurationsdatei mit Kommentaren.

---

## 11. Tests (Vitest)

Mindestens diese Szenarien:
- Zyklustag-Berechnung ab dem 02.10.2026, inklusive Jahreswechsel, Sommerzeitumstellung und Renntag (18.06.2027 = Tag 5)
- Keine Einheit auf Tag 1 oder einer V-Schicht; auf Tag 2 sind alle Einheitentypen erlaubt, solange sie ins Zeitfenster passen
- V-Schicht wird kurzfristig eingetragen: Einheit wird korrekt verschoben oder gestrichen
- Grüne, gelbe und rote Recovery für jeden Einheitentyp
- Schlaf nach der Nachtschicht (08:00–14:00) wird dem Schlaftag richtig zugeordnet
- Mehrere rote Tage in Folge senken den nächsten Mikrozyklus
- Gelbe Recovery stuft nur harte Einheiten runter; lange Läufe, Höhenmeter-Einheiten, Calisthenics-Hauptsession und lockere Einheiten bleiben unverändert
- Vorausschauende Regel: gelbe Recovery vor einem Back-to-back reduziert eine harte Einheit heute, statt sie zu streichen, und lässt lockere Einheiten unverändert; nur bei Rot oder unter 5 h Schlaf wird gestrichen
- Kein Nachholen von verpasstem Umfang
- Kraftstufe steigt nur bei erfüllten Kriterien
- Kein schweres Beintraining vor langen Läufen
- Taper-Phase und Rennwoche inklusive Urlaubswarnung
- Fehlende WHOOP-Daten führen zur manuellen Eingabe statt zu einem Fehler
- Schlafempfehlungen: Training an Tag 2 endet vor dem Nap, Aufstehzeit vor der Tagschicht passt zu Arbeitsweg und Arbeitsbeginn 06:45, Empfehlung am Abend des Schlaftags liegt in einem normalen Rhythmus

---

## 12. Vorgehen

Arbeite in diesen Phasen. Beginne jede Phase im Plan-Modus, warte auf mein OK, prüfe am Ende Tests und Build, aktualisiere die Fortschrittsliste in der `CLAUDE.md` und schlage einen Git-Commit vor.

1. **Planung:** offene Fragen stellen, dann Architektur, Datenmodell, Ordnerstruktur und Algorithmen beschreiben. Noch kein Code. `CLAUDE.md` mit Regeln und Fortschrittsliste anlegen, Git einrichten.
2. **Kernlogik:** Schichtberechnung, Planerstellung, Kraftprogression, Erholungsfaktor und Anpassungsregeln als reine Module mit allen Tests, mit Beispieldaten statt WHOOP.
3. **Oberfläche:** Onboarding, Heute, Zyklus, Gesamtplan, Kraft, Tracking. Teste selbst im Handy-Format (Playwright).
4. **Supabase:** Auth, Schema, Row Level Security, Umzug der Daten. Erkläre mir jeden Schritt, den ich selbst im Dashboard machen muss.
5. **WHOOP:** OAuth, Abruf, Token-Refresh, Zuordnung zu Einheiten. Sag mir genau, welche Redirect-URI und Scopes ich im WHOOP Developer Dashboard eintragen muss.
6. **Automatik:** Webhooks, tägliche Anpassung, Erholungs-Ansicht, Auswertungen.
7. **Livegang:** PWA, Deployment auf Vercel, .ics-Export, README mit Anleitung.

---

## 13. Hinweis

Im Footer und im Onboarding: Der Plan ist eine automatische Empfehlung und ersetzt keine Beratung durch Trainer oder Arzt. Bei Schmerzen, Krankheit oder anhaltend schlechten Erholungswerten hat Pause Vorrang.
