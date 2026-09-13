# Hybrid Athlete OS

Eine private Trainings-App für den Wechselschichtdienst. Läuft als PWA auf dem iPhone,
alle Daten bleiben auf dem Gerät.

**Der Stand: leeres Projekt.** Vite, React, TypeScript, sonst nichts. Aufgebaut wird von
hier aus Tab für Tab.

## Was es vorher gab

Zwei vollständige Fassungen liegen in der Historie und lassen sich jederzeit ansehen oder
in Teilen zurückholen:

- `coach-v1` — der erste Coach: Phasenmodell in festen Minuten, Zyklusvorlage, Blickfeld
  über 27 Tage.
- `coach-v2` — der zweite: 35-Tage-Schichtrhythmus, Volumen aus der Messung, rollendes
  Blickfeld über sieben Tage.

Beide wurden gelöscht, weil sie mehr entschieden haben, als sie erklären konnten.

## Befehle

```
npm run dev         Entwicklungsserver
npm run build       Typprüfung und Produktionsbau
npm run typecheck   nur die Typen (tsc -b, nicht tsc -p)
npm test            Tests
```

## Grundsätze, die bleiben

Sie sind aus der Arbeit an den beiden Vorgängern entstanden, nicht vorher aufgeschrieben:

1. **Eine Stelle entscheidet.** Zwei Bildschirme, die verschiedene Sachen sagen, machen
   den ganzen Plan wertlos — das ist dreimal passiert und war jedes Mal derselbe Fehler.
2. **Eine Prüfung, die nichts misst, ist schlimmer als keine.** Nach jedem Test einmal den
   Draht durchschneiden und sehen, ob er rot wird.
3. **Messen statt behaupten.** Zahlen, die eine App über den Athleten annimmt, sind
   entweder gemessen oder erfragt — nie geraten.
4. **Widersprüche hinschreiben.** Wo zwei Vorgaben sich widersprechen, sagt die App es,
   statt eine davon still fallen zu lassen.
