// Plausibilitätsausgabe des Gesamtplans (npm run plan:print).
// Druckt eine Tabelle zur manuellen Prüfung der Umfangskurve; prüft selbst nur, dass der Plan entsteht.

import { describe, expect, it } from 'vitest'
import { formatDayMonthDE } from '../time'
import { generatePlan, PHASE_LABEL, weeklyEquivalentKm } from './index'

describe('Gesamtplan (Ausgabe)', () => {
  it('druckt die Mikrozyklen', () => {
    const plan = generatePlan()
    const rows = plan.microcycles.map((m) => {
      const keys = plan.days
        .filter((d) => d.microIndex === m.index)
        .flatMap((d) => d.sessions.filter((s) => !s.optional).map((s) => `T${d.shift.cycleDay}:${s.title}`))
        .join(' | ')
      return [
        String(m.index).padStart(2),
        formatDayMonthDE(m.start),
        PHASE_LABEL[m.phase].padEnd(14),
        m.template.padEnd(18),
        `${weeklyEquivalentKm(m)}`.padStart(5) + ' km/W',
        `${Math.round((m.plannedElevationM * 7) / 5)}`.padStart(5) + ' hm/W',
        `lang ${m.longRunKm}`.padEnd(9),
        keys,
      ].join('  ')
    })
    if (process.env.PRINT_PLAN) console.log('\n' + rows.join('\n'))
    expect(rows).toHaveLength(52)
  })
})
