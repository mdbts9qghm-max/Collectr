// Abendroutine und Vorbereitung für morgen (Tab „Schlaf & Erholung“): abgeleitet von der
// empfohlenen Zubettgehzeit, der Schicht und den Einheiten von morgen. Rein, ohne Datum/Uhr.

import { CONFIG } from '../config'
import { formatNumberDE, formatTime } from '../time'
import type { EffectiveShift, Minutes, PlannedSession, SleepRecommendation } from '../types'

const E = CONFIG.sleep.evening

export interface RoutineStep {
  /** Uhrzeit am Abend (Minuten ab Mitternacht, kann bei spätem Zubettgehen negativ/über 1440 sein). */
  atMin: Minutes
  text: string
}

export interface EveningRoutine {
  /** Zeitplan für heute Abend (leer, wenn heute Nachtdienst ist). */
  steps: RoutineStep[]
  /** Was heute Abend für morgen vorbereitet werden sollte. */
  prepare: string[]
}

const LONG: ReadonlySet<string> = new Set(['long_run', 'b2b_1', 'b2b_2', 'mountain_day', 'night_run', 'race'])

export function eveningRoutine(rec: SleepRecommendation, today: EffectiveShift, tomorrow: EffectiveShift, tomorrowSessions: readonly PlannedSession[]): EveningRoutine {
  const prepare: string[] = []
  const steps: RoutineStep[] = []
  const main = tomorrowSessions.filter((s) => !s.optional)

  if (rec.night) {
    const bed = rec.night.start.minutes
    steps.push({ atMin: bed - E.caffeineStopMin, text: 'Letzter Kaffee, Tee oder Energy-Drink' })
    steps.push({ atMin: bed - E.lastMealMin, text: 'Letzte größere Mahlzeit, danach nur noch leicht' })
    steps.push({ atMin: bed - E.prepareMin, text: 'Sachen für morgen bereitlegen (siehe unten)' })
    steps.push({ atMin: bed - E.screensOffMin, text: 'Bildschirme weg, Licht dimmen, Zimmer kühl und dunkel' })
    steps.push({ atMin: bed, text: `Ins Bett, Wecker auf ${formatTime(rec.night.end.minutes)} Uhr` })
  }

  // Schicht morgen
  if (tomorrow.work && (tomorrow.code === 'T' || tomorrow.code === 'V' || tomorrow.code === 'FB')) {
    prepare.push(`Arbeitskleidung, Tasche und Frühstück für morgen vorbereiten. Losfahren ${formatTime(tomorrow.work.departure)} Uhr.`)
  } else if (tomorrow.dayKind === 'pre_night') {
    prepare.push('Morgen Nachtschicht: Training am Vormittag, Nap ab 15:00. Heute normal schlafen, morgen ohne Wecker ausschlafen, falls keine Einheit früh ansteht.')
  } else if (today.code === 'N') {
    prepare.push('Heute Nacht Dienst: Sonnenbrille für den Heimweg einpacken, Schlafzimmer vorher abdunkeln, Ohrstöpsel bereitlegen.')
  } else if (tomorrow.code === 'U' || tomorrow.code === 'F' || tomorrow.code === 'S') {
    if (main.length === 0) prepare.push('Morgen frei ohne Training: gleiche Aufstehzeit wie sonst, das stabilisiert den Rhythmus.')
  }

  // Einheiten morgen
  for (const s of main) {
    const at = s.startMin !== undefined ? ` um ${formatTime(s.startMin)} Uhr` : ''
    if (LONG.has(s.type)) {
      prepare.push(`${s.title}${at}: heute Abend kohlenhydratreich essen und genug trinken.`)
      if (s.fueling) prepare.push(`Verpflegung für unterwegs packen (wie im Rennen 60–90 g Kohlenhydrate pro Stunde) und die Ausrüstung testen: Rucksack, Stöcke, Schuhe.`)
      if (s.type === 'night_run') prepare.push('Stirnlampe und Ersatzakku laden, Warnweste und warme Schicht bereitlegen.')
      if (s.distanceKm) prepare.push(`Route für ${formatNumberDE(s.distanceKm)} km${s.elevationM ? ` mit ${s.elevationM} hm` : ''} vorher festlegen.`)
    } else if (s.category === 'run') {
      prepare.push(`${s.title}${at}: Laufsachen und Schuhe bereitlegen.`)
    } else if (s.category === 'strength') {
      prepare.push(`${s.title}${at}: Trainingssachen bereitlegen${s.type === 'legs_heavy' ? ', danach Eiweiß einplanen' : ''}.`)
    }
    if (s.startMin !== undefined && s.startMin < E.earlySessionBefore) prepare.push(`Die Einheit beginnt früh: Frühstück klein halten, etwas leicht Verdauliches bereitstellen.`)
  }

  return { steps: steps.sort((a, b) => a.atMin - b.atMin), prepare: [...new Set(prepare)] }
}
