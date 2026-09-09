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

## 4b. Der Coach

### Das Ziel bestimmt die Struktur

Es gibt **kein Rennen, kein Zieldatum und kein Tapering**. Das Ziel ist ein dauerhaft
belastbares Herz-Kreislauf-System. Die 100 km sind ein Nebenprodukt davon, kein
Trainingsziel. Daraus folgt:

- **Die Steuergröße ist der aerobe Reiz, nicht die Kilometerzahl.** Gerechnet wird in
  Laufminuten und Herzfrequenzzonen.
- Fortschritt misst sich an **VO2max, Schwellenherzfrequenz, Ruhepuls, HRV und der
  Herzfrequenz-Erholung nach einer Minute** — nicht an Bestzeiten und nicht an
  Wochenkilometern.
- Der Plan läuft unbefristet weiter. Es gibt keine Zielwoche, auf die er zuläuft.

### Es wird gelaufen

> Das gesamte Ausdauervolumen entsteht durch Laufen. Rad, Rudergerät und Crosstrainer sind
> keine zulässigen Trainingsformen und auch keine Ausweichoption bei schlechter Erholung.
> Die einzige Alternative zum Laufen ist weniger Laufen oder Ruhe.

Der Einheitenkatalog kennt deshalb keinen Modus. Er kennt Läufe, Krafteinheiten, Gehen und
Ruhe. Eine Abstufung geht immer innerhalb derselben Sache nach unten:

```
Intensität → kürzere Intensität → lockerer Lauf → Gehen → Ruhe
Longrun    → verkürzter Longrun → lockerer Lauf → Gehen → Ruhe
Kraft      → Oberkörper         → Mobilität und Rumpf     → Ruhe
```

**Gehen ist die letzte Stufe vor Ruhe, nicht eine andere Sportart.**

### Das Einflussfenster

Der eigentliche Kern. Ein Tag steht nie für sich: er wird von dem beeinflusst, was davor
lag, und er beeinflusst, was danach kommt — über Zyklus- und Wochengrenzen hinweg. Aber
dieser Einfluss ist endlich. Jede Regel deklariert in `coach/horizon.ts` ihre Reichweite in
Tagen, und das Blickfeld des Coaches ist das Maximum darüber. Was weiter weg liegt, ist
nachweislich ohne Einfluss und wird verworfen.

| Regel | zurück | voraus | warum genau so weit |
| --- | --- | --- | --- |
| Abstand zur Schlafphase | 0 | 0 | betrifft nur die Uhrzeit innerhalb eines Tages |
| Beinkraft vor Intensität | 1 | 1 | die 24-Stunden-Sperre ist am übernächsten Tag abgelaufen |
| 48 h zwischen harten Läufen | 2 | 2 | vorgestern lässt heute wieder eine harte Einheit zu |
| Ruhetag je Zyklus | 4 | 4 | der Zyklus ist fünf Tage lang |
| Schlüsseleinheiten je Zyklus | 4 | 4 | dasselbe Zyklusbudget |
| Zone-2-Anteil | 9 | 9 | das Zehn-Tage-Fenster ist rollend |
| Longrun-Schritt | 10 | 10 | ein Schritt ist ein Makrozyklus |
| Bahnstufe | 9 | 9 | zwei saubere Zyklen sind zehn Tage |
| Volumenwachstum | 19 | 9 | der Vergleich braucht zwei Zehn-Tage-Fenster, nach vorn nur eines |
| Abstiegsserie | 19 | 19 | zwei Blöcke à zehn Tage |
| Deload-Rhythmus | 19 | 19 | vier Zyklen sind zwanzig Tage |
| Belastungsverhältnis | 27 | 27 | der 28-Tage-Nenner ist die längste Regel — er spannt das Blickfeld auf |

Das Blickfeld ist damit **27 Tage zurück und 27 voraus**. Sichtbar wird es im Kalender des
Coach-Tabs: jeder Tag lässt sich antippen und nennt neben Schicht und Einheit auch die Regeln,
über die er heute noch wirkt. Wo keine mehr reicht, sagt der Coach das ausdrücklich — er kann
auch das Vergessen begründen.

### Zonen

Fest, in Schlägen, gemessen statt gerechnet:

| Zone | Schläge | Zweck |
| --- | --- | --- |
| Z1 | 114–138 | Aufwärmen, Auslaufen, aktive Erholung |
| Z2 | 139–160 | aerobe Grundlage |
| Z3 | 161–175 | der Bereich dazwischen |
| Z4 | 176–190 | Schwelle |
| Z5 | 191–205 | VO2max |

Sie ändern sich nur über den 30-Minuten-Test alle 10 bis 12 Wochen, und auch dann nur, wenn
der Vorschlag angenommen wird. Die App verschiebt keine Zone im Hintergrund: eine Zone, die
sich unbemerkt verschiebt, macht jeden Vergleich mit den Wochen davor wertlos. Unter drei
Schlägen Unterschied meldet der Vorschlag ausdrücklich Messrauschen statt Anpassung.

### Phasen — in Laufminuten je zehn Tage

| Phase | Zeitraum | Laufminuten / 10 Tage |
| --- | --- | --- |
| P0 | Woche 1–8 | 300 → 420 |
| P1 | Monat 3–6 | 420 → 600 |
| P2 | Monat 7–10 | 600 → 750 |
| P3 | ab Monat 11 | 700 → 850, dann gehalten |

> Verlangt das Phasenziel mehr, gilt die Grenze. Das Ziel wird nach hinten verschoben, nicht
> die Grenze gedehnt. Es gibt keinen Ersatzweg, um Volumen schneller aufzubauen.

Genau so ist es gebaut: das Phasenziel ist eine Absicht, die 8-%-Wachstumsgrenze ist ein
Gesetz. Wo beide sich widersprechen, gewinnt die Grenze.

### Bahnstufen

`8 × 100 m → 8 × 200 m → 6 × 400 m → 5 × 800 m → 4 × 4 Minuten`

Intervalle laufen von Beginn an mit, aber nicht sofort in der Zielform. Eine Stufe wird erst
verlassen, wenn **zwei Zyklen sauber** durchlaufen wurden — ohne Abstufung, ohne Abbruch.
Ein unsauberer Zyklus setzt den Zähler zurück, wirft die Stufe aber nicht weg.

### Die Rollenverteilung im Makrozyklus

Zehn Tage, zwei Zyklen. Die Rollen liegen fest, weil die Rotation feststeht — ein
Optimierer würde aus derselben Ausgangslage jedes Mal einen anderen Plan bauen, und
Anpassung entsteht aus der Wiederholung ähnlicher Reize.

| Tag | Schicht | Einheit | Fenster |
| --- | --- | --- | --- |
| 1 | T1 Tagschicht | Ruhe | — |
| 2 | T2 Nachtschicht | lockerer Lauf **+ Kraft** | 09:00–13:30 |
| 3 | T3 Schlaftag | Grundlagenlauf | 16:00–20:00 |
| 4 | T4 frei | **Intervalle** | 08:00–19:00 |
| 5 | T5 frei | Grundlagenlauf **+ Kraft** | 08:00–19:00 |
| 6 | T1 Tagschicht | Ruhe | — |
| 7 | T2 Nachtschicht | lockerer Lauf **+ Kraft** | 09:00–13:30 |
| 8 | T3 Schlaftag | Grundlagenlauf | 16:00–20:00 |
| 9 | T4 frei | Grundlagenlauf **+ Kraft** | 08:00–19:00 |
| 10 | T5 frei | **Longrun** | 08:00–19:00 |

Die 48 Stunden zwischen den harten Einheiten stecken schon darin.

### Das Tagesbudget entscheidet über die zweite Einheit

Die Vorlage legt nur fest, **welcher Lauf** wann liegt — daran hängen die 48 Stunden
zwischen den harten Einheiten, und die will man garantiert und nicht jedes Mal neu gesucht.
Ob ein Tag darüber hinaus eine **zweite Einheit** trägt, steht nirgends geschrieben. Der
Tag rechnet es aus:

```
Restkapazität = Erholung − Schichtlast − geplante Trainingslast
```

Ab einer Restkapazität von 20 trägt der Tag eine zweite Einheit. Die Schwelle ist kein
gefitteter Wert: die kleinste sinnvolle zweite Einheit — Mobilität und Rumpf — kostet 12
Punkte, und wer die gerade so bezahlen kann, hat keinen Reiz mehr übrig, sondern nur noch
Müdigkeit. Dazu drei Sperren, die nichts mit dem Budget zu tun haben: kein Fenster, eine
Schlüsseleinheit am selben Tag, oder gestern schon Kraft.

Über eine gewöhnliche Rotation ergibt das:

| Tag | Erholung | − Schicht | − Training | = Rest | Ergebnis |
| --- | --- | --- | --- | --- | --- |
| T1 Tagschicht | 0 | 30 | 0 | −30 | kein Fenster |
| T2 Nachtschicht | 75 | 55 | 19 | **1** | einfach |
| T3 Schlaftag | 60 | 20 | 27 | **13** | einfach |
| T4 frei (Bahn) | 100 | 0 | 60 | 40 | Schlüsseltag, einfach |
| T5 frei | 90 | 0 | 27 | **63** | **Doppel** |
| T4 frei | 100 | 0 | 27 | **73** | **Doppel** |
| T5 frei (Longrun) | 90 | 0 | 66 | 24 | Schlüsseltag, einfach |

Der Doppeltag vor der Nachtschicht fällt damit von selbst weg — nicht weil eine Regel ihn
verbietet, sondern weil zwölf Stunden Nachtdienst das Budget aufgebraucht haben. Genau so
sollte es sein: Erholung und Belastung sind die Steuergrößen, nicht eine Tabellenzeile.

### Die Schicht ist eine Belastung

Vorher kam der Dienst nur als Fenster vor — er sagte, *wann* trainiert werden kann, nie
*wie viel schon getragen wird*. Zwölf Stunden Nachtdienst zählten null.

| Schicht | Last | Begründung |
| --- | --- | --- |
| T1 Tagschicht | 30 | zwölf Stunden Dienst, aber im Takt des Tages |
| T2 Nachtschicht | 55 | zwölf Stunden gegen den zirkadianen Rhythmus |
| T3 Schlaftag | 20 | der Dienst ist vorbei, der Preis nicht: 24 h Wachzeit, 6 h Tagschlaf |
| T4/T5 frei | 0 | — |
| V-Schicht | 30 | zwölf Stunden Dienst, der Lauf liegt darin |

**Diese Zahlen sind Urteil, keine Messung.** Sie liegen auf der Skala der Trainingslast,
damit sie sich mit ihr verrechnen lassen; die Größenordnung stammt aus dem Vergleich, dass
eine Nachtschicht mehr Erholung kostet als ein lockerer Lauf und weniger als ein Longrun.

Die Schichtlast wirkt an **genau einer Stelle**: im Tagesbudget. Nicht im
Belastungsverhältnis, weil das in der Literatur ein Verhältnis von *Trainingslast* ist —
bei einer regelmäßigen Rotation stiege der Zähler ungefähr wie der Nenner, das Verhältnis
bliebe fast gleich und würde nur unempfindlicher gegen den Trainingssprung, den es messen
soll. Und nicht im Erholungswert des Folgetags, weil sie dort schon steckt: der Grundwert
des Schlaftags ist 60 „nach 24 h Wachzeit", der des Tagschichttags 0.

Die **V-Schicht** überschreibt den Tag: 30 bis 60 Minuten locker im Dienst. Das ist kein
Abschreiben des Tages, aber keine Intensität.

### Krafttraining — nach denselben Regeln wie das Laufen

Kraft war lange die Ausnahme im Plan: das Laufen hatte ein Volumenziel je zehn Tage, eine
Wachstumsgrenze, Phasen, Bahnstufen und einen Deload — die Kraft bekam, was an Zeit und
Erholung übrig blieb. Jetzt hat sie dasselbe Gerüst.

| Laufen | Kraft |
| --- | --- |
| Laufminuten je 10 Tage aus der Phase | Kraftminuten je 10 Tage aus derselben Phase |
| höchstens 8 % Wachstum je 10 Tage | dieselbe Grenze |
| Bahnstufen 8×100 m → 4×4 | Kraftstufen Anpassung → Maximalkraft |
| zwei saubere Zyklen je Stufe | dieselbe Regel |
| Deload: 40 % weniger, keine Intensität | Deload: 40 % weniger, keine schwere Beinlast |
| 48 h zwischen harten Läufen | 48 h zwischen schweren Beineinheiten |
| Phase setzt, Erholung stuft ab | Stufe setzt, Erholung stuft ab |

**Kraftminuten je zehn Tage:**

| Phase | von | bis | Schwerpunkt |
| --- | --- | --- | --- |
| P0 | 60 | 90 | Technik vor Last, die Sehnen brauchen länger als die Muskeln |
| P1 | 90 | 120 | Aufbau bis auf die zwei Einheiten die Woche, die ein Läufer trägt |
| P2 | 120 | 140 | Maximalkraft in den Grundübungen — sie trägt den Longrun |
| P3 | 140 | 140 | Halten |

**Kraftstufen:**

| Stufe | Sätze × Wdh. | Ziel-RPE | Zweck |
| --- | --- | --- | --- |
| A Anpassung | 2 × 12–15 | 6 | Bewegungen lernen, Sehnen an Last gewöhnen |
| B Hypertrophie | 3 × 8–12 | 7 | Muskelquerschnitt als Grundlage |
| C Kraft | 4 × 6–8 | 8 | der Bereich, in dem ein Läufer lebt |
| D Maximalkraft | 4 × 4–6 | 9 | neuronale Ansteuerung, wenig Muskelkater |

Die Stufe setzt die **Zielanstrengung**, die Erholung darf sie nur **senken**. Das ist
dieselbe Rangfolge wie beim Laufen: die Phase setzt, der Erholungswert stuft ab — nie
umgekehrt. Sätze und Wiederholungen kommen aus der Stufe, die Länge aus dem Volumenziel,
und der Katalog gibt nur noch die Grenzen, in denen sie liegen darf.

**Die eine Stelle, an der die Kraft dem Laufen bewusst nicht folgt**, ist P3: dort ist das
Laufvolumen bei 850 Minuten angekommen und die Kraft bleibt bei 140. Kraft ist die Stütze
des Laufens, nicht sein Wettbewerber — eine Kraft, die in P3 mitwüchse, konkurrierte um
dieselbe Erholung.

Die harte Nachbarschaftsgrenze gilt weiter: **schwere Beinkraft liegt nie in den 24 Stunden
vor einer Intensitäts- oder Longrun-Einheit.** Sie schiebt nicht die Last ins Leichte,
sondern die Übungen nach oben — Oberkörper geht auch am Tag vor der Bahn.

### Deload

Jeder vierte **Zyklus** — nicht Makrozyklus — ist ein Deload: 40 % weniger Laufminuten in
diesen fünf Tagen, keine Intensität, Longrun halbiert. Der Bahntag fällt dabei nicht weg, er
wird ein Grundlagenlauf.

### Was das Schlafmodul ins Training meldet

Das Schlafmodul entscheidet nie selbst über Abstufungen — es liefert Signale, und
der Coach übersetzt sie. Vier Leitungen, alle verdrahtet und alle durch Tests
festgehalten, die rot werden, wenn eine davon reißt:

| Signal | Schwelle | Wirkung |
| --- | --- | --- |
| Tagschlaf zu kurz | unter 5 h | am Folgetag keine harte Einheit |
| Vorschlaf ausgefallen | — | −15 auf den Erholungswert dieses Tages |
| Schlafschuld über 10 Tage | ab 5 h | die **nächste** harte Einheit geht eine Stufe zurück |
| Schlafschuld über 10 Tage | ab 8 h | Deload, unabhängig vom Vierer-Rhythmus |

Die Abstufung trifft genau eine Einheit, nicht jede: Schlafschuld nimmt die
nächste harte Belastung heraus und ist damit abgegolten. Alles Weitere macht der
Erholungswert Tag für Tag. Der erzwungene Deload **ersetzt den nächsten
planmäßigen nicht** — Schlafmangel ist ein anderer Grund als angesammelte
Trainingslast und leistet deren Erholung nicht mit.

Das Schlafziel des Schlaftags sind sechs Stunden. Das ist eine Beschreibung der
Rotation, keine Empfehlung: der Zyklus liegt mit Schlafverlängerung und Vorschlaf
vor der Nachtschicht bei 41,25 h auf fünf Tage, also 8,25 h am Tag. Fällt der
Vorschlaf weg, fällt der Schnitt auf 7,75 h — deshalb kostet er Erholungspunkte.
Die ärztliche Empfehlung hängt am **Vier-Wochen-Schnitt unter sechs Stunden**,
nicht an einem einzelnen kurzen Tag, sonst schlüge sie jeden Zyklus grundlos an.

### Wo die Vorgabe nachgerechnet werden musste

| Vorgabe | Umsetzung | Grund |
| --- | --- | --- |
| „P3 ab Monat 11 (700–850), unbegrenzt" | `open` heißt: die **Phase** endet nie. Das Volumen läuft die Spanne hoch und bleibt bei 850. | Zuerst umgekehrt gelesen — das Ziel wuchs in P3 entlang der 8-%-Grenze weiter, weil kein Phasenziel mehr bremste. Über genug Makrozyklen ergab das 2846 Laufminuten je zehn Tage, also 47 Stunden. Eine Grenze, die man durch Warten überschreiten kann, ist keine. |
| „Zone 2 mindestens 80 % der Laufminuten" | gezählt wird Zone 1 **und** 2 | Wörtlich genommen fielen Ein- und Auslaufen einer korrekt gelaufenen Intervalleinheit gegen die Regel. Eine Regel, die richtiges Aufwärmen bestraft, misst nicht, was sie messen soll. |
| Volumenwachstum ≤ 8 % je 10 Tage | Fenster mit Deload-Tagen sind ausgenommen | Sonst bestraft die Regel den geplanten Einbruch und zieht das Volumen bei jedem vierten Zyklus dauerhaft nach unten. |
| Longrun ≤ 10 min Wachstum pro Schritt | der halbierte Deload-Longrun steht nicht in der Schrittfolge | Sonst gälte der Rücksprung danach als Steigerung um vierzig Minuten. |
| Zehn-Tage-Regeln allgemein | schweigen, wenn ein vergangener Trainingstag ohne Eintrag im Fenster liegt | Eine Datenlücke ist keine Regelverletzung. Der Coach sagt lieber nichts als etwas Falsches. |
| Phasen nach Monaten | umgerechnet auf Wochen (P1 ab Woche 9, P2 ab 27, P3 ab 44) | Der Zyklus läuft in Tagen, und ein Monat ist keine ganze Zahl von Zyklen. |


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
