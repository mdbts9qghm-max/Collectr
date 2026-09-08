# Trainingslogik

Alle Regeln hier sind Faustformeln aus der Trainingspraxis, keine medizinischen Aussagen.
Jede Zahl ist in den Einstellungen änderbar.

## 1. Belastungsmodell

**Session Load = Dauer × RPE**, skaliert so, dass eine Stunde an der Schwelle 100 Punkte
ergibt (`LOAD_SCALE = 4.5`). Das ist die sRPE-Methode: gut validiert und der einzige
Ansatz, der ohne Brustgurt bei jeder Einheit funktioniert — bei Krafttraining, Mobility
und Schwimmen genauso wie beim Laufen.

Die App nimmt den jeweils genauesten verfügbaren Wert:

1. Minuten pro Zone, falls erfasst
2. tatsächlich eingetragene RPE
3. Standard-RPE der gewählten Intensität

Daraus entstehen drei Zeitreihen:

| Kennzahl | Bedeutung | Berechnung |
| --- | --- | --- |
| **CTL** (Fitness) | was der Körper gewohnt ist | exponentieller Schnitt, τ = 42 Tage |
| **ATL** (Ermüdung) | was gerade nachwirkt | exponentieller Schnitt, τ = 7 Tage |
| **TSB** (Form) | CTL − ATL | positiv = frisch, negativ = belastet |
| **ACWR** | akut : chronisch | 7-Tage-Schnitt ÷ 28-Tage-Schnitt |

Über einem ACWR von 1,35 (einstellbar) blockiert die Engine intensive Einheiten. Der
Zusammenhang zwischen schnellen Belastungssprüngen und Verletzungen ist in der Literatur
gut dokumentiert, auch wenn die exakte Schwelle diskutiert wird — deshalb ist sie
konfigurierbar und nicht fest verdrahtet.

Zusätzlich gilt eine lange Ausdauereinheit ab 120 Minuten auch bei niedriger Intensität
als harte Einheit: drei Stunden locker kosten ebenfalls Tage an Frische.

## 2. Readiness

Gewichtete Mischung aus allem, was vorhanden ist:

| Komponente | Gewicht | Quelle |
| --- | --- | --- |
| Schlaf | 0,26 | Dauer gegen Ziel, dazu Qualität |
| Befinden | 0,24 | Müdigkeit, Muskelkater, Stress, Motivation |
| Belastung | 0,26 | TSB relativ zu CTL, ACWR, Trainingstage in Folge |
| WHOOP Recovery | 0,14 | falls eingetragen |
| HRV / Ruhepuls | 0,10 | Abweichung von der 30-Tage-Baseline |

**Fehlende Komponenten werden nicht als Durchschnitt angenommen.** Ihr Gewicht wird auf
die vorhandenen verteilt. Und ohne mindestens einen selbst berichteten oder gemessenen
Wert gibt es gar keinen Score — die App sagt dann „kein Check-in" statt ein
selbstbewusstes READY zu erfinden. Das ist der Unterschied zwischen einer Schätzung und
einer Behauptung.

Schichtmodifikatoren am Ende: Schlaftag −8, Nachtschicht heute −4, Nachtschicht gestern
−6, Tagschicht −3, krank −40.

| Level | Bereich | Intensitätsdeckel |
| --- | --- | --- |
| READY | ≥ 70 | alles |
| MODERATE | 45–69 | Z3 |
| RECOVERY | < 45 | nur Regeneration |
| unbekannt | kein Check-in | Z3 |

Im roten Bereich wird auch Z2 blockiert: Wenn der Körper nicht regeneriert, ist auch eine
lockere Stunde ein Reiz, den er nicht verarbeiten kann.

## 3. Periodisierung

Fünf Phasen (Base → Build → Peak → Taper → **Nach dem Ziel**) mit eigenem Wochenumfang,
eigener Sportverteilung, eigener Intensitätsverteilung und eigener Kraftfrequenz. Alle
vier Größen sind im Profil pro Phase editierbar; die Sportanteile werden als freie Zahlen
eingegeben und ins Verhältnis gesetzt, sodass sie sich beim Tippen nie exakt auf 100
addieren müssen.

Innerhalb jeder Phase läuft eine **3:1-Welle**: 100 %, 107 %, 114 %, 68 %. Die
Entlastungswoche kommt automatisch, weil konstant hoher Wochenumfang der häufigste Weg
ist, sich in ein Loch zu trainieren.

Der Standardplan ist bewusst konservativ: 16 Wochen Base. Von 25 Minuten auf 5 km zu 100
km führt kein schneller Weg, und der begrenzende Faktor ist nicht die Lunge, sondern
Sehnen, Bänder und Knochen.

### Was nach dem Taper kommt

Nach dem Ziel steht keine Lücke, sondern eine eigene Phase. 100 km kosten Wochen, nicht
Tage — und die Belastung, die am längsten nachwirkt, ist nicht die Ausdauer, sondern der
Aufprall. Die Phase läuft deshalb sechs Wochen mit fünf Stunden Grundumfang, ohne
Intensität, und mit dem niedrigsten Laufanteil aller Phasen: Rad und Wasser halten die
Grundlage, während die Beine den Stoß nicht mehr abbekommen.

In dieser Phase läuft die Welle **umgekehrt**: 55 %, 70 %, 85 %, 100 %. Es gibt keine
Entlastungswoche, weil die ganze Phase eine ist. Nach einem Wettkampf aufzubauen wäre
genau die falsche Richtung.

### Wenn der Plan ausläuft

Ein zu Ende gelaufener Plan war vorher nicht von „gar kein Plan" zu unterscheiden: beides
ergab keine aktive Phase, und keine aktive Phase hieß stillschweigend *Woche eins der
Welle, voller Umfang, für immer* — die Entlastungswoche kam nie wieder.

Jetzt zählt die Welle nach dem Planende weiter, gemessen an den Wochen seit dem letzten
Plantag. Die Entlastungswoche kommt also weiter, und die Empfehlungs-Engine zieht ihre
Punkte auch dann ab, wenn keine Phase mehr läuft. Sichtbar ist der Zustand ebenfalls: im
Trainings- und im Wochentab steht, seit wie vielen Wochen der Plan aus ist und dass ohne
Phase kein Schwerpunkt mehr gesetzt wird.

## 4. Empfehlungs-Engine

Für jeden Tag werden 18 Kandidaten erzeugt und in zwei Stufen bewertet.

### Harte Ausschlusskriterien

Ein Kandidat, der eine dieser Regeln verletzt, wird ausgeschlossen — mit sichtbarem Grund:

1. Dauer passt nicht ins Zeitfenster der Schicht
2. Intensität über dem Deckel der Schicht
3. Intensität über dem Deckel der Readiness
4. Abstand zur letzten harten Einheit unter 40 h
5. Muskelgruppe innerhalb der letzten 48 h belastet
6. ACWR über dem Limit und Kandidat nicht locker
7. Wöchentliches Einheiten-Limit erreicht
8. Fünf Trainingstage in Folge → nur noch Regeneration
9. Wochenumfang über 125 % des Ziels
10. **Kalter Start:** unter vier erfassten Einheiten in vier Wochen keine langen oder
    intensiven Einheiten und maximal 75 Minuten
11. **Progressionsgrenze:** eine lange Einheit darf die längste der letzten vier Wochen
    um höchstens 25 % übertreffen

Regeln 10 und 11 sind der Grund, warum die App am ersten Tag Krafttraining und nicht
einen 85-Minuten-Long-Run vorschlägt: Ohne Historie ist die sichere Annahme nicht die
optimistische.

### Weiche Bewertung

Jeder überlebende Kandidat startet bei 50 Punkten. Neunzehn Faktoren addieren oder
subtrahieren, **jeder mit einem Satz Begründung**, der in der UI landet:

Wochenlücke der Sportart · Gesamtumfang der Woche · Tage seit dieser Sportart ·
Intensitätsverteilung gegen das Phasenziel · Passung zur Readiness · Passung zur Schicht ·
morgen Nachtschicht · gestern Nachtschicht · Long-Run-Abstand · Kraftfrequenz ·
Mobility-Basis · Zielausrichtung · Phasenschwerpunkt · Trainingstage in Folge ·
Laufumfang gegen Zielkilometer · Cross-Training-Entlastung · gelernte Präferenzen ·
Kürzung wegen Zeitmangel · **Platzierung von Schlüsseleinheiten · Restkapazität der Woche ·
Schlafausblick · bereits geplante Belastung.**

### Der Blick nach vorn

Die letzten vier Faktoren stammen aus `outlook.ts`, das einen **7-Tage-Horizont** aus dem
Schichtplan ableitet: nutzbare Trainingsminuten pro Tag (abzüglich dessen, was schon
geplant ist), erwarteter Schlaf aus dem Schlaffenster der Schicht, und die bereits
festgelegte Belastung.

Daraus entstehen vier Entscheidungen:

* **Schlüsseleinheiten werden platziert, nicht verteilt.** Steht der Long Run heute auf
  einer Schicht mit wenig Zeit, während in drei Tagen eine Freischicht kommt, verliert er
  20 Punkte — mit dem Hinweis, welcher Tag besser passt. Gibt es umgekehrt in den
  nächsten sieben Tagen keinen Tag mit Platz für eine lange Einheit, gewinnt er 20 Punkte.
* **Wochenkapazität statt Kalendertage.** Vorher zählte die App „noch 4 Tage übrig", egal
  ob das vier Freischichten (16 h) oder vier Tagschichten (80 min) waren. Jetzt zählt sie
  die tatsächlich nutzbaren Minuten und erkennt, wenn sich das Wochenziel heute entscheidet.
* **Schlafausblick.** Ein harter Reiz braucht die Nächte danach. Zeigt der Schichtplan für
  die nächsten Tage im Schnitt mehr als eine Stunde unter dem Schlafziel — etwa eine Serie
  Nachtschichten mit 3 h Vorschlaf — verliert jede intensive Einheit 16 Punkte.
* **Bereits geplante Belastung.** Eine zweite lange Einheit wird hart blockiert, wenn
  innerhalb von zwei Tagen schon eine im Kalender steht. Vor einer geplanten intensiven
  Einheit verliert Intensität Punkte und lockeres Training gewinnt welche.

Ein Beispiel mit identischer Vergangenheit und identischer Readiness, nur unterschiedlicher
Zukunft:

| Rest der Woche | Empfehlung | Score |
| --- | --- | --- |
| 4× Freischicht | Long Run | 162 |
| 4× Tagschicht | Long Run | **169** — letzte Gelegenheit |
| 4× Nachtschicht | Long Run | **143** — Schlafausblick zieht ab |

**Leere Tage erzeugen keine Schlüsse.** Tage ohne eingetragene Schicht sind als
`known: false` markiert und werden aus jeder Aussage herausgehalten. Ein leerer Kalender
bedeutet nicht, dass keine guten Tage kommen — die App tut nicht so, als wüsste sie es.

Der höchste Wert ist die Empfehlung, die nächsten drei aus *anderen* Sportarten sind
Alternativen. Der Ruhetag hat dabei einen eigenen Platz: Er konkurriert nicht mit dem
lockeren Spaziergang um denselben Slot und wird immer angeboten, auch wenn er nicht
gewinnt — „nichts tun" muss eine sichtbare, begründete Option sein, keine Lücke.

### Bewertung des eigenen Plans

Steht schon etwas im Kalender, blockt die Engine es nicht — sie prüft es: passt es
(`aligned`), sollte es angepasst werden (`adjust`), oder sprengt es die Schicht
(`too_much`). Der Plan des Athleten hat Vorrang, aber nicht ohne Kommentar.

### Personalisierung

`personalization.ts` lernt aus den Daten, welche Sportarten und Wochentage tatsächlich
umgesetzt werden, und verschiebt die Bewertung um maximal ±6 Punkte. Bewusst klein: Eine
Vorliebe darf eine knappe Entscheidung kippen, aber niemals eine Erholungsregel
überstimmen.

## 4b. Aerober Planer

### Das Ziel bestimmt die Struktur

Der Nutzer trainiert **nicht auf einen Wettkampf hin**. Das Ziel ist ein dauerhaft
leistungsfähiges Herz-Kreislauf-System; 100 km laufen zu können ist ein gewünschtes
Nebenprodukt. Daraus folgt:

- **Kein Zieltermin, kein Taper.** Der Plan läuft unbefristet in rotierenden Blöcken.
- **Die Steuergröße ist der aerobe Reiz, nicht der Laufkilometer.** Gerechnet wird in
  Trainingsminuten und Herzfrequenzzonen.
- Fortschritt misst sich an physiologischen Markern, nicht an Zeiten.

**Der entscheidende Punkt:** Wenn das Ziel ein starkes Herz ist und kein Laufwettkampf,
muss der aerobe Reiz nicht aus dem Laufen kommen. Rad und Rudergerät erzeugen dieselben
zentralen Anpassungen — größeres Schlagvolumen, mehr Plasmavolumen, mehr Mitochondrien —
bei einem Bruchteil der orthopädischen Belastung. Progressionsgrenzen im Laufen sind
damit **keine Bremse fürs Herz**, sondern eine Aufteilungsfrage.

### Zonen aus der Schwelle

Fünf Zonen auf Basis der **Schwellenherzfrequenz**, nicht der Maximalfrequenz: Formeln
für die Maximalfrequenz liegen um zehn Schläge und mehr daneben, und das ist breiter als
die Zonen selbst.

| Zone | Anteil der Schwelle | Zweck |
| --- | --- | --- |
| Z1 | < 82 % | Regeneration |
| Z2 | 82–89 % | Grundlage, Hauptzone |
| Z3 | 90–94 % | Tempo, sparsam |
| Z4 | 95–102 % | Schwelle |
| Z5 | > 102 % | VO2max |

Bestimmt über ein 30-Minuten-Zeitfahren, Durchschnitt der letzten 20 Minuten. Erstmals
nach P0, danach alle 10 bis 12 Wochen. Bis dahin steuert die App **ausschließlich
subjektiv**: Zone 2 ist die Intensität, bei der ein vollständiger Satz sprechbar bleibt.

### Phasen und Blöcke

| Phase | ab Makrozyklus | aerobe Minuten je 10 Tage | Laufanteil |
| --- | --- | --- | --- |
| P0 Einstieg | 0 | 300 → 420 | 40 % |
| P1 Volumen | 6 | 420 → 600 | 50 % |
| P2 Kapazität | 18 | 600 → 750 | 60 % |
| P3 Dauerbetrieb | 30 | 700–850 | 60–75 % |

Ab P3 rotieren Volumen-, VO2max- und Schwellenblock dauerhaft, je drei Makrozyklen. P3
steigt nicht endlos linear, sondern schwingt über sechs Makrozyklen durch sein Band —
endloses Wachstum ist kein Plan, sondern ein Countdown.

### Vorlage

Ein Makrozyklus sind zwei Zyklen, zehn Tage, acht Fenster: **6 aerobe Einheiten +
2 Krafteinheiten**, davon eine Intensitäts- und eine lange Einheit.

| Tag | Zyklus A | Zyklus B |
| --- | --- | --- |
| 1 Tagschicht | Ruhe | Ruhe |
| 2 Nachtschicht | Lauf Z2 locker | Lauf Z2 + Bergsprints |
| 3 Schlaftag | Kraft | Kraft |
| 4 Frei | **Intensitätseinheit** | **lange Einheit Z2** |
| 5 Frei | Rad/Rudern (ab P2: Z1 regenerativ) | Rad/Rudern, ab P2 Lauf Z2 |

Tag 5 ist bis P2 kein Lauftag: der Tag nach der harten oder langen Einheit trägt die
höchste Verletzungsanfälligkeit, und Rad oder Rudern liefern dort denselben aeroben Reiz
bei null Stoßbelastung.

### Intervalle auf der Bahn ab Zyklus 1

Die Intensitätseinheit gibt es **ab dem ersten Zyklus**. Was in Stufen steigt, ist ihre
Form, nicht ihre Existenz. Auf der Bahn, weil Tartan nachgiebiger und gleichmäßig eben ist
und weil die exakte Distanzkontrolle den häufigsten Anfängerfehler sofort sichtbar macht:
die erste Wiederholung zu schnell.

| Stufe | ab Makrozyklus | Einheit |
| --- | --- | --- |
| I | 0 | 8 × 100 m, 100 m gehen |
| II | 3 | 10 × 200 m |
| III | 6 | 8 × 400 m |
| IV | 9 | 6 × 800 m |
| V | 18 | nach Blockschwerpunkt |

Ein Stufenwechsel verlangt **zwei Makrozyklen ohne Abstufung** — Kalenderwochen allein
reichen nicht. Laufrichtung wechselt jede Einheit. Ohne Bahn: Feldweg, dann Rad oder
Rudern nach Zeit, Straße zuletzt.

### Volumen und Überlauf

Aerobe Minuten dürfen um höchstens 10 % pro Makrozyklus wachsen, Laufminuten nur um 8 %.
**Wächst das aerobe Ziel schneller, als das Laufen es hergibt, landet die Differenz auf
Rad oder Rudergerät — das Ziel wird nicht gekürzt.** Das ist der strukturelle Kern.

Die Ober- und Untergrenzen je Einheit sind Anteile des Phasenziels, keine festen Minuten:
25 min als Untergrenze ist in P0 sinnvoll und in P3 absurd, 150 min als Obergrenze
umgekehrt. Ein Zone-1/2-Anteil von mindestens 80 % steht über allen Volumenzielen.

### Der Erholungswert stuft ab — und wechselt zuerst den Modus

> **Die erste Abstufungsstufe ist immer der Moduswechsel, nicht die Intensitätsreduktion.**

Bei mäßiger Erholung, aber intakter Motivation ist dieselbe Einheit auf dem Rad die
bessere Antwort als ein abgeschwächter Lauf: der aerobe Reiz bleibt vollständig, nur die
orthopädische Last fällt weg. Ein Moduswechsel senkt die Mindestanforderung um **20
Punkte**, weil genau die Stoßbelastung wegfällt, gegen die die Mindestwerte schützen —
sonst wäre der Wechsel nie erreichbar und die Kette spränge direkt zum lockeren Ausrollen.

Ketten: intensiv → **dasselbe auf dem Rad** → Schwelle → Z2 locker → Regeneration ·
lang → **lang auf dem Rad** → verkürzt → Regeneration · Kraft schwer → moderat →
beinfrei → Regeneration.

**Schmerz beim Gehen** ist keine Zahl in einer Formel: die Einheit entfällt. Das ist genau
der Unterschied zwischen Muskelkater und einer Verletzung.

### WHOOP: zwei Fallstricke

**Der physiologische Zyklus passt nicht auf den Kalendertag.** Jede Schlafperiode wird dem
Zyklustag explizit zugeordnet — Ende vor Mittag zählt zum Aufwachtag, sonst zum Starttag —
und der Vorschlaf 15:00–17:30 wird an seinem Fenster als Nap erkannt, nicht an seiner
Länge.

**Absolute Recovery-Schwellen sind unbrauchbar.** Bewertet wird die Abweichung vom
28-Tage-Mittel **dieses Zyklustags**. 45 % am Schlaftag bei einer Baseline von 48 % ist ein
normaler Schlaftag, keine Warnung. Unter 28 Tagen Historie arbeitet die App im manuellen
Modus ganz ohne automatische Abstufung.

### Optionale Volumenerweiterung

25 bis 30 Wochenstunden sind mit vier Fenstern pro Zyklus **nicht erreichbar**. Die App
sagt das einmal offen und wiederholt es nicht. Ab P2 und nach drei Makrozyklen ohne
Abstufung lassen sich zusätzliche Fenster einschalten — alle in Zone 1 oder 2, denn
Zusatzvolumen wird nie über Intensität erzeugt. Der Tagschichttag bleibt auch dann frei.

### Wo die Vorgabe nachgerechnet werden musste

| Vorgabe | Umsetzung | Grund |
| --- | --- | --- |
| Erholungswert 65 → Rad in gleicher Intensität | Moduswechsel senkt die Anforderung um 20 | Sonst wäre die Radvariante bei 65 unerreichbar, weil sie dieselbe Mindestanforderung trägt |
| Abschnitt 7 (Krafttraining) | ohne Überschrift in der Vorlage | Der Abschnitt beginnt mitten im Text nach 6b |
| P2/P3 erreichen ihr aerobes Ziel | 540 von 600 bzw. mit Deload weniger | Vier Fenster tragen das Ziel nicht — genau der Punkt, den 6b benennt |

## 4c. Schlaf und Regeneration

Eigenes Modul, eigener Tab. Es gibt **Verhaltensempfehlungen auf Basis schlafmedizinischer
Standardliteratur** — keine Diagnose, kein Ersatz für ärztliche Beratung.

### Warum es nicht optional ist

Schichtarbeit erzeugt eine dauerhafte Fehlstellung zwischen innerer Uhr und Arbeitszeit.
Auflösen lässt sie sich nicht, abmildern schon. Die drei Stellschrauben, in dieser
Reihenfolge:

1. **Licht** — der mit Abstand stärkste Taktgeber
2. **Schlaf-Timing** — feste Ankerzeiten schlagen hohe Gesamtdauer
3. **Koffein-Timing** — der Zeitpunkt entscheidet, nicht die Menge

Für das Trainingsziel ist das kein Beiwerk: Schlaf ist der Zeitraum, in dem Sehnen- und
Knochenanpassung stattfindet — genau die begrenzende Größe im aeroben Aufbau.

### Licht

Die Regel unter jeder Zeile: helles Licht am **Ende** der Wachphase verschiebt die innere
Uhr nach hinten, am **Beginn** nach vorne. Im Nachtdienst will man beides, zu
unterschiedlichen Stunden — deshalb ist das eine Tabelle und kein „geh mehr raus".

Zwei Punkte erklärt die App aktiv:

- Die **Sonnenbrille auf dem Heimweg um 07:00** ist die wirksamste Einzelmaßnahme für den
  Tagschlaf. Morgenlicht nach der Nachtschicht schiebt die Uhr in die falsche Richtung und
  unterdrückt Melatonin genau vor dem geplanten Schlaf.
- **Kein helles Licht nach 04:00.** Es verschiebt die Uhr nach hinten und erschwert die
  Rückkehr zum Nachtschlaf an den freien Tagen.

### Koffein

Halbwertszeit rund 5 bis 6 Stunden. Der Nachtschichttag hat **zwei** Grenzen, nicht eine
durchgehende: 10:00, damit der Vorschlaf gelingt, und 01:00 während des Dienstes, damit der
Tagschlaf gelingt. Beides in eine Zahl zu pressen würde entweder den Vorschlaf zerstören
oder Koffein genau dann verbieten, wenn es am meisten nützt.

Die App zählt zur jeweils nächsten Grenze herunter und erinnert 30 Minuten vorher.

### Kopplung an die Trainingsplanung

| Signal | Wirkung |
| --- | --- |
| Vorschlaf ausgefallen | Erholungswert −15 |
| Tagschlaf unter 5 h | −15, am Folgetag keine harte Einheit |
| Koffeingrenze wiederholt überschritten | Hinweis, **keine** Abstufung |
| Schlafschuld über 5 h | nächste harte Einheit eine Stufe zurück |
| Schlafschuld über 8 h | Deload, unabhängig vom Zyklusrhythmus |

**Das Schlafmodul stuft nie selbst ab.** Es liefert Signale, der aerobe Planer entscheidet.
Ein einziger Ort entscheidet über Abstufungen — zwei Orte wären der Anfang eines Plans, der
sich selbst widerspricht.

Dabei fiel auf, dass der Abzug an der ersten *Einheit* verbraucht wurde statt an der ersten
*harten*: der lockere Lauf am Zyklustag 2 hat die Abstufung aufgebraucht und die
Intensitätseinheit blieb unangetastet — das Gegenteil des Zwecks.

### Substanzen

Zu Koffein plant die App, weil es ein Alltagsmittel und das Timing planungsrelevant ist. Zu
allem anderen erklärt sie die Wirkweise und verweist an Apotheke oder Arzt — **keine
Dosierung, kein Produkt, kein Einnahmeplan.** Zu Melatonin darf sie sagen, dass es
chronobiologisch wirkt und kein Schlafmittel ist.

### Ärztliche Abklärung

Die App rät dazu bei anhaltender Tagesschläfrigkeit trotz genug Schlaf, Einschlafen gegen
den Willen, beobachteten Atemaussetzern, Schlaf dauerhaft unter 6 h, oder wenn die Qualität
über mehr als vier Wochen absinkt. Diese Hinweise stehen **oben** auf dem Bildschirm, über
allem Verhaltensrat.

### Keine Gamification auf Schlafdaten

Punkte und Serien auf Schlafmetriken fördern Orthosomnie — die Verschlechterung des Schlafs
durch dessen Überwachung. Das ist die eine Fehlwirkung, die ein Modul wie dieses ganz
allein verursachen kann. Der Smoke-Test prüft bei jedem Lauf, dass keine Abzeichen
auftauchen.

## 5. Hybrid Score

Sechs Säulen, jede 0–100:

| Säule | Gewicht | Woraus |
| --- | --- | --- |
| Endurance | 26 % | 5-km-Zeit, Zone-2-Pace, FTP pro kg, Schwimmpace, längster Lauf, Ausdauerumfang |
| Consistency | 20 % | Trainingstage, Plan-Umsetzung, längste Pause, Gleichmäßigkeit |
| Strength | 19 % | Pull-ups, Push-ups, Krafthäufigkeit, Kraftumfang |
| Recovery | 16 % | Readiness-Schnitt, Schlafdauer, ACWR im sicheren Band |
| Habits | 12 % | Erfüllungsquote über 28 Tage |
| Mobility | 7 % | Minuten und Häufigkeit pro Woche |

Zwei Regeln machen den Score ehrlich:

* **Komponenten ohne Daten zählen nicht als Null**, sondern fallen aus der Rechnung; ihr
  Gewicht wird verteilt. Das gilt auch für ganze Säulen.
* Unter 45 % Datenabdeckung wird der Gesamtwert als **vorläufig** ausgewiesen. Eine 19
  ohne Daten sagt etwas über die App aus, nicht über den Athleten.

Zielwerte kommen aus den eigenen Zielen, wo eines existiert, sonst aus
Amateur-Benchmarks. Jede Komponente meldet Wert, Zielwert, Gewicht und Beitrag — die
Frage „warum habe ich 78 Punkte?" hat in der UI eine vollständige Antwort.

## 6. Habits

Zeitpläne: täglich, bestimmte Wochentage, oder X-mal pro Woche. Mengen-Habits kennen
Zielwert *und* Mindestwert.

**Streaks bestrafen kein richtiges Verhalten.** Ein Tag zählt als *ausgesetzt* — er
verlängert die Serie nicht, bricht sie aber auch nicht — wenn:

* der Habit auf „an Ruhetagen aussetzen" steht und kein Training stattfand,
* der Habit auf „an Tagschichten aussetzen" steht und eine Tagschicht eingetragen ist,
* der Tag als krank markiert ist.

Ein Teilerfolg über dem Mindestwert hält die Serie ebenfalls am Leben, und ein noch nicht
eingetragener heutiger Tag bricht nichts. Die Wochenquote reduziert sich um ausgesetzte
Tage, statt sie als Fehlschlag zu werten.

Habits mit `autoSource` füllen sich aus dem Tages-Check-in — dieselbe Zahl wird nie zweimal
abgefragt.

## 7. Aufgaben

Priorität, Kategorie, Fälligkeit mit Uhrzeit, Aufwandsschätzung, Habit-Verknüpfung.

Wiederholungen: täglich, wöchentlich mit Wochentagen, monatlich — und **schichtbasiert**,
also „bei jeder Nachtschicht". Das ist die Wiederholung, die in einem Schichtleben
tatsächlich gebraucht wird und die Standard-Task-Apps nicht können.

Eine erledigte Wiederholung wird abgeschlossen *und* erzeugt die nächste Instanz. Die
Historie bleibt dadurch ehrlich, statt dass eine Zeile stillschweigend weiterwandert.

## 8. Schichtlogik

Jede Schichtart trägt ihre eigene Trainingsrichtlinie: maximale Dauer, maximale
Intensität, Doppeleinheiten erlaubt, bevorzugtes Zeitfenster, Bewertung und ein
Begründungstext, der in der App wörtlich angezeigt wird.

| Schicht | Fenster | Max. Dauer | Max. Intensität |
| --- | --- | --- | --- |
| Tagschicht 07–19 | 19:45–21:00 | 20 min | Regeneration |
| Nachtschicht 19–07 | 17:15–18:30 | 75 min | Moderat |
| Schlaftag | 16:00–18:30 | 50 min | Locker |
| Freischicht | 09:00–18:00 | 240 min | alles |
| V-Schicht 08–20 | 06:15–07:30 | 40 min | Locker |

Diese Werte sind Startwerte, keine Konstanten — sie stehen in der Datenbank und werden im
Profil bearbeitet.

Zusätzlich wirken Schichten über den Tag hinaus: Nach einer Nachtschicht sinkt das
Zeitbudget auf 60 Minuten, eine harte Einheit vor einer Nachtschicht bekommt Abzug, und
der Schlaftag wird nicht automatisch zum Trainingstag, nur weil er frei ist.

## 9. Was die App bewusst nicht tut

* Sie stellt keine Diagnosen und interpretiert keine Symptome.
* Sie erfindet keine Zahlen. Fehlende Daten heißen „keine Daten", nicht 0.
* Sie erzwingt keine tägliche Optimierung. Ein Ruhetag ist ein gültiges Ergebnis, und
  Konstanz steht in der Prioritätenliste über Progression.
* Sie zeigt keine Funktion, die nicht funktioniert. Nicht angebundene Integrationen sind
  als *geplant* markiert und haben keine toten Schaltflächen.
