import { useMemo } from 'react'
import { useApp } from '../../app/AppState'
import { recoveryHistory } from '../../app/compute'
import type { RecoveryDay } from '../../core/types'

/** Vergleichszeitraum für den Schnitt (Tage). */
const MEAN_DAYS = 30

type Key = 'hrvMs' | 'restingHr' | 'respiratoryRate'
const ITEMS: { key: Key; label: string; unit: string; digits: number; goodUp: boolean }[] = [
  { key: 'hrvMs', label: 'HRV', unit: 'ms', digits: 0, goodUp: true },
  { key: 'restingHr', label: 'Ruhepuls', unit: 'bpm', digits: 0, goodUp: false },
  { key: 'respiratoryRate', label: 'Atmung', unit: '/min', digits: 1, goodUp: false },
]

const fmt = (v: number, digits: number) => v.toFixed(digits).replace('.', ',')

/** HRV, Ruhepuls und Atemfrequenz von heute mit Abweichung zum 30-Tage-Schnitt. */
export function Vitals() {
  const app = useApp()
  const history = useMemo(() => recoveryHistory(app.data, app.cal, app.today, MEAN_DAYS + 1), [app.data, app.cal, app.today])
  const today = history.find((d) => d.date === app.today)
  const before = history.filter((d) => d.date < app.today)
  const mean = (k: Key) => {
    const v = before.map((d: RecoveryDay) => d[k]).filter((x): x is number => typeof x === 'number')
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined
  }
  return (
    <div className="grid grid-cols-3 gap-2" data-testid="vitals">
      {ITEMS.map((it) => {
        const v = today?.[it.key]
        const m = mean(it.key)
        const diff = v !== undefined && m !== undefined ? v - m : undefined
        const good = diff === undefined || Math.abs(diff) < 10 ** -it.digits ? null : diff > 0 === it.goodUp
        return (
          <div key={it.key} className="rounded-xl bg-panel-2 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{it.label}</div>
            <div className="text-xl font-bold">
              {v !== undefined ? fmt(v, it.digits) : '–'}
              <span className="ml-1 text-xs font-normal text-muted">{it.unit}</span>
            </div>
            <div className={`text-[11px] ${good === null ? 'text-muted' : good ? 'text-green' : 'text-yellow'}`}>
              {diff !== undefined ? `${diff >= 0 ? '+' : '−'}${fmt(Math.abs(diff), it.digits)} zum Schnitt` : m !== undefined ? `Schnitt ${fmt(m, it.digits)}` : 'keine Daten'}
            </div>
          </div>
        )
      })}
    </div>
  )
}
