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

## 4b. Zyklusplaner

### Die zentrale Designentscheidung

Frühere Versionen haben jeden Tag frei bewertet und dann optimiert. Das ist hier falsch:

- Die Rotation ist **vollständig vorhersehbar**. Ein Optimierer würde bei gleicher
  Ausgangslage unterschiedliche Pläne erzeugen — schlecht für die Trainingskonsistenz und
  für die Vergleichbarkeit über Zyklen.
- Trainingsanpassung entsteht aus **wiederholten, gleichartigen Reizen**, nicht aus
  jeweils lokal optimalen Einzelentscheidungen.
- Deshalb: **feste Zyklusvorlage**, die über einen Makrozyklus rotiert. Der Erholungswert
  ist nur noch ein **Abstufungs-Filter**, keine Planungsgrundlage.

Es gibt keine Zielfunktion und keine lokale Suche mehr. Ein Test prüft, dass zweimal
dieselbe Ausgangslage zweimal denselben Plan ergibt.

### Kapazität der Rotation

| Zyklustag | Schicht | Trainingsfenster |
| --- | --- | --- |
| 1 | Tagschicht 07:00–19:00 | **keins** |
| 2 | Nachtschicht 19:00–07:00 | 09:00–13:30 |
| 3 | Schlaftag | 16:00–20:00 |
| 4 | Frei | 08:00–19:00 |
| 5 | Frei | 08:00–19:00 |

Vier nutzbare Fenster pro Fünf-Tage-Zyklus sind 5,6 Einheiten pro 7 Tage. Das oft zitierte
Ziel 3 + 3 = 6 ist auf dieser Rotation **ohne Doppeleinheiten nicht erreichbar**, und
erzwungene Doppel kosten Qualität in beiden Einheiten. Deshalb wird das Ziel neu definiert
statt erzwungen:

> **8 Einheiten pro Makrozyklus (2 Zyklen = 10 Tage): 4 Läufe + 4 Krafteinheiten**
> = 2,8 Läufe und 2,8 Krafteinheiten pro Woche

### Die Vorlage

**Zyklus A**

| Tag | Fenster | Einheit | Last |
| --- | --- | --- | --- |
| 1 · Tagschicht | – | Ruhetag | 0 |
| 2 · Nachtschicht | 09:00–13:30 | lockerer Lauf 40 min Z2 + 5 × 15 s Steigerungen | 30 |
| 3 · Schlaftag | 16:00–20:00 | Oberkörperkraft, strikt beinfrei | 30 |
| 4 · Frei | vormittags | **intensiver Lauf** | 80 |
| 5 · Frei | vormittags | **schwere Kraft**, Unterkörper | 70 |

**Zyklus B** ist identisch, nur trägt Tag 4 den **langen Lauf** (60) statt des intensiven.

Die App alterniert A → B → A → B.

**Tatsächliche Bilanz je Makrozyklus:** 4 Läufe + 4 Krafteinheiten · **400 Lastpunkte** ·
**Zone-2-Anteil 76 %** der Laufminuten (170 von 225).

### Warum genau diese Belegung

**Tag 2 — lockerer Lauf, keine Kraft.** Der Vormittag ist das zirkadiane Leistungstief:
Körperkerntemperatur am Minimum, Maximalkraft typisch 3–8 % unter dem Tageshoch,
Gelenksteifigkeit erhöht. Schwere Kraft dort ist ineffizient und riskanter. Ein Z2-Lauf ist
davon praktisch unbeeinflusst. Die Steigerungen erhalten die neuromuskuläre Qualität bei
minimalen systemischen Kosten — sie ersetzen die intensive Einheit nicht.

**Tag 3 — Oberkörperkraft, kein Laufen.** Nach 6 h Tagschlaf und rund 24 h vorheriger
Wachzeit ist die neuromuskuläre Kontrolle reduziert. Stoßbelastung durch Laufen ist hier
das größte Verletzungsrisiko im Zyklus. Oberkörperkraft hat niedrige systemische Kosten und
null Stoßbelastung. Strikt beinfrei, weil am Folgetag der Schlüssellauf steht.

**Tag 4 — Schlüssellauf.** Zwei Nächte regulärer Schlaf davor, ganzes Fenster frei. Der
einzige Tag im Zyklus, der einen Maximalreiz trägt.

**Tag 5 — schwere Kraft.** Harter Lauf → schwere Beinkraft ist die richtige Richtung.
Umgekehrt würde die Beinkraft die Laufqualität am Folgetag beschädigen. Deshalb wandert die
schwere Kraft nie auf Tag 4.

**Tag 1 — Ruhe.** Der Tagschichttag erfüllt die Ruhetagsanforderung automatisch.

### Harte Regeln

**Fenster und Schlaf**

- Keine Einheit außerhalb ihres Fensters.
- Nachtschichttag: Ende spätestens 13:30 — 90 min Puffer vor dem Vorschlaf um 15:00.
- Schlaftag: Beginn frühestens 16:00 (Schlafträgheit), Ende spätestens 20:00.
- Keine Einheit mit Last ≥ 60 endet weniger als 3 h vor dem nächsten Schlafbeginn. Der
  Vorschlaf zählt mit.
- Kein Training am Tagschichttag, auch nicht früh oder spät.

**Belastungssteuerung**

- Kein intensiver Lauf an Nachtschicht-, Schlaf- oder V-Schichttagen.
- ≥ 48 h zwischen zwei harten Einheiten derselben Disziplin, ≥ 24 h bei verschiedener.
- Schwere Beinkraft nie in den 24 h **vor** langem oder intensivem Lauf. Danach zulässig.
- Doppeleinheit nur an freien Tagen, ≥ 6 h Abstand. Die für das Ziel wichtigere Einheit
  zuerst, im Zweifel Kraft vor Lauf.
- Von zwei Läufen an Nachbartagen darf nur einer hart sein; der zweite höchstens 35 min und
  immer nach dem harten.
- Mindestens ein Tag mit Last 0 pro Zyklus.

### Erholungsfilter

Der Erholungswert plant nicht, er stuft ab. Startwert nach Zyklustag: Tag 4 = 100 ·
Tag 5 = 90 · Tag 2 = 75 · Tag 3 = 60 · V-Schicht = 55 · Tag 1 = 0.

| Bedingung | Anpassung |
| --- | --- |
| Schlaf ≥ 1 h unter dem Soll des Tages | −10 je voller Stunde |
| Vorschlaf am Nachtschichttag ausgefallen | −15 |
| Befinden 1–10 | (Wert − 7) × 5 |
| Muskelkater ≥ 3 von 5 | −15 |
| Ruhepuls ≥ 7 über dem Normwert | −15 |

Der Normwert für den Ruhepuls ist der Median der letzten 30 erfassten Morgen, ersatzweise
der Profilwert. Mindestanforderungen: intensiver Lauf 85 · schwere Kraft 70 · langer Lauf 75
· moderate Kraft 55 · Oberkörperkraft 45 · lockerer Lauf 40 · Regeneration 0.

Abstufungsketten, **niemals streichen**: intensiver → langer → lockerer Lauf → Regeneration,
und schwere → moderate → Oberkörperkraft → Regeneration. Bei nur vier Einheiten pro Zyklus
ist Frequenzerhalt wichtiger als Einzelintensität, und eine gestrichene Einheit lässt sich
auf dieser Rotation nicht nachholen.

### Belastungsverhältnis akut zu chronisch

Last der letzten 7 Tage geteilt durch den Tagesdurchschnitt der letzten 28. Zielband
**0,8 bis 1,3**. Außerhalb gibt die App eine Warnung aus und stuft die **nächste** harte
Einheit eine Stufe ab — einmal, nicht dauerhaft. Unter zwei Wochen erfasster Historie sagt
sie „unbekannt" statt eine Zahl zu erfinden.

### Deload

Jeder vierte Zyklus: der intensive Lauf entfällt, schwere Kraft wird moderate Kraft, die
Umfänge werden halbiert. Die Last folgt dabei der **tatsächlich geplanten** Dauer, nicht dem
angeforderten Faktor — die Mindestdauern fangen die Halbierung teilweise auf, und eine
Einheit als halb so teuer zu buchen, während sie fünf Sechstel so lang ist, wäre falsch.

### Ausnahme V-Schicht

Ersetzt Zyklustag 5. Lauf im Fenster 06:15–07:15 vor Dienstbeginn, höchstens 45 min. Das
Abendfenster 20:15–21:00 nur, wenn der Folgetag kein Tagschichttag ist. Die Krafteinheit
wandert als zweite Einheit auf Tag 4, ≥ 6 h nach dem Lauf, und wird dabei auf moderate Kraft
abgestuft. Bedingung: Erholungswert an Tag 4 ≥ 85. Sonst entfällt sie **ersatzlos** — kein
Nachholen im Folgezyklus.

### Ablauf

1. Zyklustag und Zyklustyp (A oder B) bestimmen
2. Vorlage laden
3. V-Schichten prüfen und die Ausnahmeregel anwenden
4. Deload-Zyklus prüfen und gegebenenfalls anwenden
5. Erholungswert berechnen, Mindestanforderung prüfen, bei Unterschreitung abstufen
6. Belastungsverhältnis prüfen, bei Überschreitung warnen und abstufen
7. Harte Regeln als letzte Prüfschicht
8. Plan, angewandte Abstufungen und Begründungen ausgeben

### Wo die Spezifikation von der Umsetzung abweicht

Vier Stellen, an denen die geschriebene Vorgabe mit sich selbst in Konflikt stand. Umgesetzt
ist jeweils die Regel, nicht die daraus abgeleitete Zahl:

| Vorgabe | Tatsächlich | Grund |
| --- | --- | --- |
| Gesamtlast 420 je Makrozyklus | **400** | Die Vorlage summiert sich auf 210 + 190 |
| Zone-2-Anteil ≈ 82 % | **76 %** | 170 Z2-Minuten von 225 Laufminuten |
| Erholungswert 70 → langer Lauf | → **lockerer Lauf** | Die Mindesttabelle setzt den langen Lauf auf 75 |
| Deload −40 % | **−34 %** | Ergibt sich aus Substitution plus halbierten Umfängen |

Dazu eine strukturelle Folge: „jeder vierte Zyklus" fällt bei alternierendem A/B **immer auf
einen B-Zyklus**. Die Deload-Klausel „der intensive Lauf entfällt" greift deshalb nie — ein
B-Zyklus hat keinen intensiven Lauf. Die Reduktion tragen die Substitution der schweren
Kraft und die halbierten Umfänge.

### Eine Quelle für alle Ansichten

Zyklustab, Wochentab, Tagesbildschirm und Morgen-Check-in lesen denselben Plan. Der Kalender
zeigt die Einheiten als gestrichelte Blöcke — Vorschlag, nicht Zusage. Der Smoke-Test
vergleicht beide Ansichten bei jedem Lauf und schlägt fehl, wenn sie auseinanderlaufen.

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
