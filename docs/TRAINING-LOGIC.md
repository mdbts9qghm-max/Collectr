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
Intensität, und mit dem niedrigsten Laufumfang aller Phasen: kurze lockere Läufe und
Gehen halten die Grundlage, bis die Beine den Stoß wieder abbekommen können. Eine andere
Sportart tritt auch hier nicht an die Stelle des Laufens — die harte Regel gilt in jeder
Phase.

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

## 4. Entfernt: die alte Empfehlungs-Engine

Es gab einmal einen zweiten Planer: achtzehn Kandidaten je Tag, elf harte Ausschlüsse,
neunzehn gewichtete Faktoren, dazu ein Sieben-Tage-Ausblick und gelernte Vorlieben aus dem
bisherigen Verhalten. Er ist gelöscht.

Zuletzt tat er nur noch eins: er verglich, was geplant war, mit seiner **eigenen**
Empfehlung und meldete auf dem Tagesbildschirm Sätze wie *„Dein Plan passt grundsätzlich.
Laufen hätte diese Woche aber die größere Lücke."* — eine zweite Stelle, die über das
Training urteilt, mit anderen Regeln als der Coach und ohne dessen Blickfeld.

Genau das ist der Fehler, den dieser Plan an mehreren Stellen hatte und der ihn unbrauchbar
macht: **wenn zwei Bildschirme verschiedene Sachen sagen, weiß man nicht mehr, welchem man
glauben soll.** Der Ort, der über Training entschied, war danach `src/domain/coach/` — und
der ist inzwischen selbst gelöscht, siehe Abschnitt 4b. Entschieden wird jetzt vom
Athleten.

Mit der Engine gingen `outlook.ts` (der Sieben-Tage-Ausblick, den das Blickfeld des Coaches
ersetzt) und `personalization.ts` (gelernte Vorlieben, die in einem regelbasierten Plan
nichts zu suchen haben). Geblieben sind Belastungsmodell, Readiness und Phasen — die
braucht auch der Coach.

## 4b. Der Coach

Es gab ihn schon einmal, und er wurde auf Ansage gelöscht: *„die Automatik ist falsch."*
Was jetzt steht, ist neu gebaut, und die Unterschiede sind die Lehre aus dem ersten Versuch.

### Der Schichtrhythmus

**T · N · Ü · DF · DF**, siebenmal hintereinander — 35 Tage, danach fällt dasselbe Muster
wieder auf denselben Wochentag. Geplant wird auf den fünf Tagen; die 35 sind eine
Kalenderaussage, keine Trainingsaussage. Dienstbeginn ist jeweils 15 Minuten vor
Schichtbeginn: T 06:45–19:00, N 18:45–07:00.

| Tag | Schlaf | Trainingsfenster | Rolle |
| --- | --- | --- | --- |
| T | 23:30 → 05:30 | keins | Ruhe, und der leere Tag der Woche |
| N | 23:30 → 08:00, Vorschlaf 15:00–17:30 | 09:00–13:30 | locker, vor dem Vorschlaf |
| Ü | 08:00 → 14:00 | 15:30–21:00 | locker oder Kraft, **nie Intensität** |
| DF1 | 00:00 → 08:00 | 09:00–19:00 | die Schlüsseleinheit |
| DF2 | 23:30 → 08:00 | 09:00–17:00 | Grundlage, Bett um 22:00 |

### Das Volumen wächst aus der Messung, nicht aus einer Tabelle

Die ursprüngliche Vorgabe hatte eine Spalte „aerobe Minuten je 10 Tage" (300 → 850). Sie
ist gestrichen, und das ist die sicherere Konstruktion: eine absolute Vorgabe kennt den
Ausgangspunkt nicht. Wer bei 120 Laufminuten steht und eine Tabelle liest, die 300
verlangt, bekommt entweder eine Überlastung oder eine Zahl, die zwei Monate lang
unerreichbar bleibt und deshalb nichts steuert.

Gesteuert wird über die **Steigerung**: höchstens 8 % mehr je zehn Tage, gerechnet auf das,
was tatsächlich gelaufen wurde. Solange es nichts zu messen gibt, gilt eine **Einstufung**.

Gefragt wird dabei nicht nach Minuten. „Wie viele Laufminuten hattest du in den letzten
zehn Tagen" verlangt eine Buchhaltung, die niemand führt, der noch nicht strukturiert
trainiert — wer sie beantworten könnte, bräuchte sie nicht. Gefragt wird, was man über sich
weiß: wie lange am Stück, wie oft.

| Einstufung | zugrunde gelegt | Laufminuten / 10 Tage |
| --- | --- | --- |
| Wiedereinstieg | 2 × 20 min | 55 |
| Anfänger mit Grundlage | 3 × 30 min | 130 |
| Regelmäßig | 3 × 45 min | 195 |
| Fortgeschritten | 4 × 50 min | 285 |

Die Zahlen sehen niedrig aus, und das ist Absicht. Der begrenzende Faktor beim Laufeinstieg
ist nicht das Herz-Kreislauf-System, sondern Knochen, Sehnen und Faszien: die kardiale
Anpassung kommt in Wochen, der Knochenumbau läuft über Zyklen von drei bis vier Monaten.
Deshalb häufen sich Stressreaktionen an Schienbein und Mittelfuß in den ersten acht bis
zwölf Wochen eines Laufprogramms — bei Leuten, deren Puls längst mehr hergäbe. Ein Einstieg,
der sich zu leicht anfühlt, ist die Bedingung dafür, dass in sechs Monaten noch gelaufen
wird: 8 % je zehn Tage bringen von 130 Minuten in einem halben Jahr auf über 500, ohne dass
eine Woche einen Sprung macht.

Die Phase bestimmt dann nur noch den Charakter: Läufe je Woche, Anteil des langen Laufs,
Fokus. Das sind Anteile, und Anteile funktionieren auf jedem Niveau.

| Phase | Zeitraum | Läufe/Woche | Longrun-Anteil | Fokus |
| --- | --- | --- | --- | --- |
| P0 | Woche 1–8 | 3 | 30 % | Laufgewöhnung, Intervalle kurz und wenige |
| P1 | Monat 3–6 | 4 | 33 % | Zone-2-Minuten tragen den Zuwachs |
| P2 | Monat 7–10 | 4 | 35 % | VO2max und Schwelle |
| P3 | ab Monat 11 | 4 | 35 % | rotierende Blöcke, unbefristet |

### Das Blickfeld rollt

Jede Regel trägt ihre eigene Reichweite in Tagen. Ein Tag zählt für heute, solange
mindestens eine Regel so weit reicht; reicht keine mehr, ist er nachweislich ohne
Einfluss — und wird begründet vernachlässigt, nicht vergessen.

Es gibt deshalb kein „diese Woche". Das Fenster hat keine Kanten, an denen etwas abreißt:
ein Montag verliert seinen Einfluss nicht dadurch, dass eine neue Kalenderwoche anfängt,
sondern dadurch, dass genug Tage vergangen sind. Die meisten Regeln reichen sechs Tage in
jede Richtung; zwei reichen weiter, weil sie es müssen — die Steigerungsgrenze vergleicht
zehn Tage mit zehn Tagen, die Bahnstufe verlangt zwei saubere Wochen.

Im Coach-Tab ist das ein Streifen, kein Kalender, und er reicht **drei Tage über das
Fenster hinaus**. Sonst wäre jeder gezeigte Tag per Definition einer mit Einfluss, und die
Kante, um die es geht, unsichtbar.

### Fünf Tage gegen sieben

Der Schichtrhythmus läuft in fünf Tagen, die Regeln in sieben. Diese Zahlen gehen nicht
ineinander auf, und daraus folgt etwas Konkretes: **der Rhythmus kann nicht jede Umdrehung
eine Schlüsseleinheit tragen.** Zweimal alle fünf Tage sind zwei in sieben, und erlaubt ist
eine. Ungefähr jede vierte Umdrehung fällt aus.

Genau dieses Paar rutschte in der ersten Fassung durch die Prüfung, weil sie „drei Tage
zurück, drei voraus" um jeden Tag schaute: zwei Tage im Abstand von fünf liegen in keinem
dieser Fenster. Geprüft wird jetzt über **jedes** Fenster aus sieben aufeinanderfolgenden
Tagen.

### Was an einer Bahneinheit wirklich hart ist

Hier stand einmal ein Konflikt: „Intervalle von Anfang an" und „Zone 2 ≥ 80 %" sollten bei
kleinem Volumen nicht beide gehen.

Den Konflikt gab es nie. Er war eine Folge davon, dass eine **ganze** Bahneinheit als
Zone 5 verbucht wurde. Eine Stufe-I-Einheit dauert 39 Minuten: 15 Minuten einlaufen, gut
drei Minuten auf der Bahn, elf Minuten Trabpause, zehn Minuten auslaufen. Hart sind die
drei. Wer die 39 als Zone 5 bucht, rechnet um den Faktor zwölf falsch — und verbietet sich
damit Intervalle, die längst hineinpassen.

Jede geplante Einheit trägt deshalb ihre Belastungsminuten getrennt von ihrer Dauer. Der
Zone-2-Anteil liegt damit auch bei Anfängervolumen über 95 %. Die Konfliktmeldung gibt es
weiterhin, aber sie greift erst, wenn wirklich zu viel hart wäre — auf hohen Bahnstufen
sind die Belastungsminuten ein Vielfaches.

### Das Rad

Geplant wird nie Rad. Es steht an genau einer Stelle jeder Abstufungskette: unter dem
lockeren Lauf, über dem Gehen.

`Intervalle → kürzere Intervalle → lockerer Lauf → Rad → Gehen → Ruhe`

Warum dort: an dieser Stelle ist der Grund für die Abstufung fast immer muskuloskelettal,
nicht kardial. Wer keinen Stoß mehr verträgt, kann meist noch treten — und hält damit den
aeroben Reiz, statt ihn ganz zu verlieren.

### Was der Coach nicht entscheidet

Er stuft ab, er plant nicht am Athleten vorbei. Erholung, Schlafschuld und Schicht können
eine Einheit kleiner machen; was überhaupt trainiert wird, kommt aus Phase, Rhythmus und
Volumen. Und jede Einheit lässt sich von Hand überschreiben — ab dann gehört sie dem
Athleten und der Coach führt sie nicht mehr nach.


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

## 5. Entfernt: Hybrid Score

Es gab einmal einen Gesamtscore aus sechs Säulen. Er ist mit dem Statistiktab gelöscht
worden — samt Berechnung, Zeitreihe und der Antwort „warum ist mein Score gesunken".

Der Grund ist inhaltlich, nicht technisch: ein Score, der Ausdauer, Kraft, Schlaf, Habits
und Konstanz zu einer Zahl verrechnet, sagt weniger als jede seiner Zutaten einzeln. Er
steigt und fällt, ohne dass daraus eine Handlung folgt — und die Steuergrößen dieses Plans
stehen ohnehin fest: VO2max, Schwellenherzfrequenz, Ruhepuls, HRV und die
Ein-Minuten-Herzfrequenzerholung.

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

## 7. Entfernt: Aufgaben und Statistik

Beide Tabs gab es einmal und gibt es nicht mehr. Der Aufgabentab konnte schichtbasierte
Wiederholungen („bei jeder Nachtschicht"), der Statistiktab zeigte den Hybrid Score aus
sechs Säulen. Gelöscht wurde nicht nur die Anzeige, sondern der ganze Code dahinter —
inklusive Datenablage, CSV-Export und den zugehörigen Antworten der Frage-Antwort-Seite.

Geblieben sind die Teile, die anderswo gebraucht werden: die Kennzahlen und die
Bestleistungserkennung für den Zieltab, der Wochenrückblick für den Wochentab.

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
