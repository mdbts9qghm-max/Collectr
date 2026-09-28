import { useMemo, useState } from 'react'
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useApp } from '../../app/AppState'
import { adherence, recoveryRows, type RecoveryRow, type ShiftBand } from '../../app/recoveryView'
import { CONFIG } from '../../core/config'
import { shiftLabel } from '../../core/shift'
import { formatDateDE } from '../../core/time'
import { Card, H2 } from '../components/common'

// Validierte Farben (dataviz, dunkle Fläche): Tagdienst Orange, Nacht Blau (Schlaftag = helleres Blau).
// Die Datenlinie ist neutral (Text-Ton), die Schichten sind nur Hintergrund.
const BAND: Record<ShiftBand, { fill: string; opacity: number; label: string }> = {
  day: { fill: '#d95926', opacity: 0.22, label: 'Tagdienst (T/V)' },
  night: { fill: '#3987e5', opacity: 0.35, label: 'Nachtschicht' },
  after_night: { fill: '#3987e5', opacity: 0.15, label: 'Schlaftag' },
  none: { fill: 'transparent', opacity: 0, label: 'frei' },
}
const INK = '#e6edf3'
const MUTED = '#9aa7b6'
const GRID = '#253041'

type Metric = { key: keyof RecoveryRow; name: string; unit: string; ref?: { key: keyof RecoveryRow; name: string }; lines?: number[] }

const METRICS: Metric[] = [
  { key: 'score', name: 'Recovery', unit: '%', lines: [CONFIG.recovery.greenMin, CONFIG.recovery.yellowMin] },
  { key: 'hrv', name: 'HRV', unit: 'ms', ref: { key: 'hrv7', name: '7-Tage-Mittel' } },
  { key: 'rhr', name: 'Ruhepuls', unit: 'bpm' },
  { key: 'sleepH', name: 'Schlaf', unit: 'h', ref: { key: 'needH', name: 'Bedarf' } },
]

export function Recovery() {
  const app = useApp()
  const [days, setDays] = useState(30)
  const [table, setTable] = useState(false)
  const rows = useMemo(() => recoveryRows(app.data, app.cal, app.today, days), [app.data, app.cal, app.today, days])
  const adh = useMemo(() => adherence(app.data, app.cal, app.plan, app.today, 14), [app.data, app.cal, app.plan, app.today])
  const hasData = rows.some((r) => r.score !== undefined)

  return (
    <div className="space-y-4">
      <div className="flex gap-2" role="group" aria-label="Zeitraum">
        {[14, 30, 60].map((d) => (
          <button
            key={d}
            aria-pressed={days === d}
            onClick={() => setDays(d)}
            className={`min-h-11 flex-1 rounded-xl border text-sm ${days === d ? 'border-accent bg-accent/20 text-accent' : 'border-line bg-panel-2'}`}
          >
            {d} Tage
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted" aria-label="Legende Schichten" data-testid="shift-legend">
        {(['day', 'night', 'after_night'] as ShiftBand[]).map((b) => (
          <span key={b} className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: BAND[b].fill, opacity: Math.min(1, BAND[b].opacity * 2.5) }} />
            {BAND[b].label}
          </span>
        ))}
        <button className="ml-auto underline" onClick={() => setTable((t) => !t)}>
          {table ? 'Diagramme' : 'Tabelle'}
        </button>
      </div>

      {!hasData && (
        <Card>
          <p className="text-sm text-muted">Noch keine Erholungsdaten. Verbinde WHOOP, trage deine Erholung in „Heute“ ein oder schalte den Demo-Modus ein.</p>
        </Card>
      )}

      {hasData && table && <RecoveryTable rows={rows} />}
      {hasData && !table && METRICS.map((m) => <MetricChart key={m.key} rows={rows} m={m} />)}

      <Card data-testid="patterns">
        <H2>Auswertungen</H2>
        {app.patterns.enoughData ? (
          <ul className="space-y-2 text-sm">
            {app.patterns.effects.map((e) => (
              <li key={e.key}>{e.sentence}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">
            Aussagen gibt es ab ca. 6 Wochen Daten (bisher {app.patterns.daysWithData} Tage). Dann siehst du hier, wie Nachtschichten, lange Läufe und schweres
            Beintraining deine Recovery und HRV beeinflussen.
          </p>
        )}
        <p className="mt-2 text-xs text-muted">
          In der Vorausschau: {app.data.settings.usePatterns ? 'genutzt' : 'nicht genutzt'} (Schalter in den Einstellungen).
        </p>
      </Card>

      <Card data-testid="adherence">
        <H2>Schlaf-Empfehlungen umgesetzt</H2>
        {adh && adh.rate !== null ? (
          <>
            <p className="text-2xl font-bold text-accent">{Math.round(adh.rate * 100)} %</p>
            <p className="text-xs text-muted">der letzten 14 Tage innerhalb von ±{CONFIG.sleep.adherenceToleranceMin} min bei Zubettgehen und Aufstehen</p>
            <ul className="mt-2 space-y-1 text-xs">
              {adh.days
                .filter((d) => !d.ok)
                .slice(-5)
                .map((d) => (
                  <li key={d.date}>
                    {formatDateDE(d.date)}: ins Bett {d.bedDiffMin > 0 ? `${d.bedDiffMin} min später` : `${-d.bedDiffMin} min früher`}, aufgestanden{' '}
                    {d.wakeDiffMin > 0 ? `${d.wakeDiffMin} min später` : `${-d.wakeDiffMin} min früher`}
                  </li>
                ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-muted">Braucht echte Schlafdaten aus WHOOP.</p>
        )}
      </Card>
    </div>
  )
}

function MetricChart({ rows, m }: { rows: RecoveryRow[]; m: Metric }) {
  const values = rows.map((r) => r[m.key]).filter((v): v is number => typeof v === 'number')
  if (values.length === 0) return null
  const max = Math.max(...values, ...(m.lines ?? []), ...(m.ref ? rows.map((r) => r[m.ref!.key]).filter((v): v is number => typeof v === 'number') : []))
  const min = Math.min(...values)
  const top = m.key === 'score' ? 100 : Math.ceil(max * 1.1)
  const bottom = m.key === 'score' || m.key === 'sleepH' ? 0 : Math.max(0, Math.floor(min * 0.9))
  const data = rows.map((r) => ({ ...r, bg: top }))
  return (
    <Card>
      <div className="mb-1 flex items-center justify-between">
        <H2>
          {m.name} ({m.unit})
        </H2>
        {m.ref && (
          <span className="flex items-center gap-1 text-xs text-muted">
            <span className="inline-block h-0.5 w-4 border-t border-dashed" style={{ borderColor: MUTED }} /> {m.ref.name}
          </span>
        )}
      </div>
      <div className="h-40" data-testid="recovery-chart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap={0}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 10 }} interval="preserveStartEnd" minTickGap={24} tickLine={false} axisLine={{ stroke: GRID }} />
            <YAxis domain={[bottom, top]} tick={{ fill: MUTED, fontSize: 10 }} tickLine={false} axisLine={false} width={34} />
            <Bar dataKey="bg" name="bg" isAnimationActive={false} legendType="none">
              {data.map((r) => (
                <Cell key={r.date} fill={BAND[r.band].fill} fillOpacity={BAND[r.band].opacity} />
              ))}
            </Bar>
            {m.lines?.map((y) => <ReferenceLine key={y} y={y} stroke={MUTED} strokeDasharray="3 3" />)}
            {m.ref && <Line dataKey={m.ref.key} stroke={MUTED} strokeDasharray="4 3" strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />}
            <Line dataKey={m.key} stroke={INK} strokeWidth={2} dot={{ r: 2.5, fill: INK, stroke: '#121821', strokeWidth: 1 }} connectNulls={false} isAnimationActive={false} />
            <Tooltip
              cursor={{ stroke: MUTED }}
              contentStyle={{ background: '#1a2230', border: '1px solid #253041', borderRadius: 12, fontSize: 12 }}
              itemStyle={{ color: INK }}
              labelStyle={{ color: INK }}
              labelFormatter={(l, p) => {
                const r = p?.[0]?.payload as RecoveryRow | undefined
                return r ? `${formatDateDE(r.date)} · ${shiftLabel(r.code)}` : String(l)
              }}
              formatter={(v, name) => (name === 'bg' ? [null, null] : [`${v} ${m.unit}`, name === m.key ? m.name : (m.ref?.name ?? String(name))])}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

function RecoveryTable({ rows }: { rows: RecoveryRow[] }) {
  return (
    <Card>
      <div className="max-h-96 overflow-y-auto">
        <table className="w-full text-xs" data-testid="recovery-table">
          <thead className="text-muted">
            <tr>
              <th className="text-left font-normal">Datum</th>
              <th className="text-left font-normal">Schicht</th>
              <th className="text-right font-normal">Rec.</th>
              <th className="text-right font-normal">HRV</th>
              <th className="text-right font-normal">RP</th>
              <th className="text-right font-normal">Schlaf</th>
            </tr>
          </thead>
          <tbody>
            {[...rows].reverse().map((r) => (
              <tr key={r.date} className="border-t border-line">
                <td>{r.label}</td>
                <td>{shiftLabel(r.code)}</td>
                <td className="text-right">{r.score ?? '–'}</td>
                <td className="text-right">{r.hrv ?? '–'}</td>
                <td className="text-right">{r.rhr ?? '–'}</td>
                <td className="text-right">{r.sleepH !== undefined ? String(r.sleepH).replace('.', ',') : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
