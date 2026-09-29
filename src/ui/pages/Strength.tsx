import { useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useApp } from '../../app/AppState'
import { effectiveStrengthState } from '../../app/compute'
import { canEnterLevel, isNewLevel, LADDER_IDS, LADDERS, levelDef, maxLevel } from '../../core/strength'
import { formatDateDE, formatDayMonthDE } from '../../core/time'
import { Button, Card, Chip, Disclosure, H2 } from '../components/common'
import { Tracking } from './Tracking'
import { StrengthTestForm } from '../components/StrengthTestForm'

const PULL = '#3987e5'
const DIPS = '#d95926'

export function Strength() {
  const app = useApp()
  const state = effectiveStrengthState(app.data)
  const [showForm, setShowForm] = useState(false)
  const tests = [...app.data.strengthTests].sort((a, b) => (a.date < b.date ? -1 : 1))
  const nextTest = app.plan.days.flatMap((d) => d.sessions).find((s) => s.type === 'strength_test' && s.date >= app.today)

  return (
    <div className="space-y-4">
      <Card data-testid="skill-bar">
        <H2>Fortschritt Skills</H2>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {LADDER_IDS.map((id) => {
            const lvl = state.levels[id]
            const max = maxLevel(id)
            return (
              <div key={id}>
                <div className="flex items-baseline justify-between gap-1 text-xs">
                  <span className="truncate font-medium">{LADDERS[id].name}</span>
                  <span className="shrink-0 text-muted">
                    {lvl + 1}/{max + 1}
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-line" aria-hidden>
                  <div className="h-2 rounded-full bg-accent" style={{ width: `${((lvl + 1) / (max + 1)) * 100}%` }} />
                </div>
                <div className="mt-0.5 truncate text-[11px] text-muted">
                  {levelDef(id, lvl).name}
                  {isNewLevel(state, id) && <span className="ml-1 text-accent">neu</span>}
                </div>
              </div>
            )
          })}
        </div>
      </Card>
      <Disclosure card title="Stufen und nächste Ziele">
        <ul className="space-y-3" data-testid="ladders">
          {LADDER_IDS.map((id) => {
            const lvl = state.levels[id]
            const def = levelDef(id, lvl)
            const last = lvl >= maxLevel(id)
            const next = last ? null : levelDef(id, lvl + 1)
            const blocked = !last && !canEnterLevel(id, lvl + 1, state.levels)
            return (
              <li key={id} className="rounded-xl bg-panel-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted">{LADDERS[id].name}</span>
                  <span className="text-xs text-muted">
                    Stufe {lvl + 1}/{maxLevel(id) + 1}
                  </span>
                </div>
                <div className="font-medium">
                  {def.name} {isNewLevel(state, id) && <Chip tone="accent">neu</Chip>}
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-line" aria-hidden>
                  <div className="h-1.5 rounded-full bg-accent" style={{ width: `${((lvl + 1) / (maxLevel(id) + 1)) * 100}%` }} />
                </div>
                {next ? (
                  <p className="mt-2 text-xs text-muted">
                    Nächstes Ziel: <span className="text-ink">{next.name}</span>. Aufstieg bei: {def.criterion.description}
                    {state.streak[id] > 0 && ` (${state.streak[id]}× erfüllt)`}
                    {blocked && <span className="text-yellow"> · Voraussetzung fehlt noch (z. B. 10 Dips für Muscle-Up-Training)</span>}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-accent">Zielstufe erreicht, Erhaltung.</p>
                )}
              </li>
            )
          })}
        </ul>
      </Disclosure>

      <Card>
        <H2>Krafttests</H2>
        {nextTest && <p className="mb-2 text-sm">Nächster Test im Plan: {formatDateDE(nextTest.date)}</p>}
        {tests.length >= 1 && (
          <>
            <div className="mb-2 flex gap-4 text-xs text-muted" aria-hidden>
              <span className="flex items-center gap-1">
                <span className="inline-block h-0.5 w-4" style={{ background: PULL }} /> Klimmzüge
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-0.5 w-4" style={{ background: DIPS }} /> Dips
              </span>
            </div>
            <div className="h-40" data-testid="test-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={tests.map((t) => ({ label: formatDayMonthDE(t.date), pull: t.maxPullups, dips: t.maxDips }))} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#253041" />
                  <XAxis dataKey="label" tick={{ fill: '#9aa7b6', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#253041' }} />
                  <YAxis allowDecimals={false} tick={{ fill: '#9aa7b6', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ background: '#1a2230', border: '1px solid #253041', borderRadius: 12, fontSize: 12 }}
                    itemStyle={{ color: '#e6edf3' }}
                    formatter={(v, n) => [`${v} Wdh.`, n === 'pull' ? 'Klimmzüge' : 'Dips']}
                  />
                  <Line dataKey="pull" stroke={PULL} strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
                  <Line dataKey="dips" stroke={DIPS} strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <Disclosure title={`Alle Tests (${tests.length})`} className="mt-2">
              <table className="w-full text-xs">
                <thead className="text-muted">
                  <tr>
                    <th className="text-left font-normal">Datum</th>
                    <th className="text-right font-normal">Klimmz.</th>
                    <th className="text-right font-normal">Dips</th>
                    <th className="text-right font-normal">Hollow</th>
                    <th className="text-right font-normal">FL / BL</th>
                  </tr>
                </thead>
                <tbody>
                  {tests.map((t) => (
                    <tr key={t.date} className="border-t border-line">
                      <td>{formatDateDE(t.date)}</td>
                      <td className="text-right">{t.maxPullups}</td>
                      <td className="text-right">{t.maxDips}</td>
                      <td className="text-right">{t.hollowHoldSec} s</td>
                      <td className="text-right">
                        {t.frontLever.stage + 1}/{t.backLever.stage + 1}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Disclosure>
          </>
        )}
        {showForm ? (
          <div className="mt-3">
            <StrengthTestForm
              date={app.today}
              onSave={async (t) => {
                await app.saveStrengthTest(t)
                setShowForm(false)
              }}
            />
          </div>
        ) : (
          <Button className="mt-3 w-full" onClick={() => setShowForm(true)}>
            Neuen Krafttest eintragen
          </Button>
        )}
      </Card>
      <Tracking />
    </div>
  )
}
