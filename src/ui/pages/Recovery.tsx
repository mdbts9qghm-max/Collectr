import { useMemo, useState } from 'react'
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useApp } from '../../app/AppState'
import { adherence, recoveryRows, type RecoveryRow, type ShiftBand } from '../../app/recoveryView'
import { CONFIG } from '../../core/config'
import { effectiveShift, shiftLabel } from '../../core/shift'
import { microIndexOf } from '../../core/plan'
import { eveningRoutine, recommendSleep } from '../../core/sleep'
import { addDays, formatDateDE, formatTime, weekdayShortDE } from '../../core/time'
import { Button, Card, Chip, H2, SegmentedButtons, Sub, TRAFFIC_LABEL } from '../components/common'
import { Ring, RING_COLOR } from '../components/Ring'
import { Vitals } from '../components/Vitals'

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
  const [stats, setStats] = useState(false)
  const rows = useMemo(() => recoveryRows(app.data, app.cal, app.today, days), [app.data, app.cal, app.today, days])
  const adh = useMemo(() => adherence(app.data, app.cal, app.plan, app.today, 14), [app.data, app.cal, app.plan, app.today])
  const hasData = rows.some((r) => r.score !== undefined)
  const view = app.dayView(app.today)
  const r = view.readiness

  return (
    <div className="space-y-4">
      <Card data-testid="whoop-today">
        <H2>Heute</H2>
        <div className="grid grid-cols-2 gap-2">
          <Ring
            progress={r.score !== undefined && !r.needsManualInput ? r.score / 100 : 0}
            color={r.traffic && !r.needsManualInput ? RING_COLOR[r.traffic] : RING_COLOR.none}
            value={r.score !== undefined && !r.needsManualInput ? `${r.score} %` : '–'}
            label="Erholung"
            sub={r.traffic && !r.needsManualInput ? TRAFFIC_LABEL[r.traffic] : 'keine Daten'}
          />
          <Ring
            progress={r.sleepMin !== undefined ? r.sleepMin / (r.needMin || 1) : 0}
            color={RING_COLOR.sleep}
            value={r.sleepMin !== undefined ? (r.sleepMin / 60).toFixed(1).replace('.', ',') : '–'}
            {...(r.sleepMin !== undefined ? { unit: 'h' } : {})}
            label="Schlaf"
            sub={`Bedarf ${(r.needMin / 60).toFixed(1).replace('.', ',')} h${r.debtMin > 0 ? ` · Defizit ${Math.round(r.debtMin / 60 * 10) / 10} h`.replace('.', ',') : ''}`}
          />
        </div>
        <div className="mt-4">
          <Vitals />
        </div>
      </Card>

      <EveningCard />

      <SleepPlan />

      <Button className="w-full" aria-expanded={stats} onClick={() => setStats((x) => !x)}>
        {stats ? 'Statistiken ausblenden' : 'Statistiken'}
      </Button>

      {stats && (
        <div className="space-y-4" data-testid="statistics">
          <SegmentedButtons
            label="Zeitraum"
            value={days}
            onChange={setDays}
            options={[14, 30, 60].map((d) => ({ value: d, label: `${d} Tage` }))}
          />

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
        </div>
      )}

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
            <p className="text-3xl font-bold text-accent">{Math.round(adh.rate * 100)} %</p>
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

/** Schlafplan für den aktuellen und den nächsten Rhythmus (10 Tage). */
function SleepPlan() {
  const app = useApp()
  const current = microIndexOf(app.today)
  const from = current ? app.plan.microcycles[current - 1]!.start : app.today
  const dates = Array.from({ length: CONFIG.plan.microLengthDays * 2 }, (_, i) => addDays(from, i))
  return (
    <Card data-testid="sleep-plan">
      <H2>Schlafplan · aktueller und nächster Rhythmus</H2>
      <ul className="divide-y divide-line">
        {dates.map((date) => {
          const rec = date === app.today ? app.dayView(date).sleep : recommendSleep({ cal: app.cal, date, plan: app.plan })
          const sh = effectiveShift(app.cal, date)
          const extra = [
            rec.daySleep && `Tagschlaf ${formatTime(rec.daySleep.start.minutes)}–${formatTime(rec.daySleep.end.minutes)}`,
            rec.nap && `Nap ${formatTime(rec.nap.start.minutes)}–${formatTime(rec.nap.end.minutes)}`,
            rec.departure !== undefined && `losfahren ${formatTime(rec.departure)}`,
          ].filter(Boolean)
          return (
            <li key={date} className={`py-2 text-sm ${date === app.today ? 'text-accent' : ''}`} data-testid="sleep-plan-row">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  {weekdayShortDE(date)} {formatDateDE(date)}
                </span>
                <Chip>{shiftLabel(sh.code)}</Chip>
              </div>
              <div className="text-xs text-muted">
                {rec.night ? `ins Bett ${formatTime(rec.night.start.minutes)} · aufstehen ${formatTime(rec.night.end.minutes)}` : 'Nacht im Dienst'}
                {extra.length > 0 && ` · ${extra.join(' · ')}`}
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

/** Heute Abend und morgen: Zeitplan, Vorbereitung und Tipps. */
function EveningCard() {
  const app = useApp()
  const rec = app.dayView(app.today).sleep
  const tomorrow = addDays(app.today, 1)
  const routine = eveningRoutine(rec, effectiveShift(app.cal, app.today), effectiveShift(app.cal, tomorrow), app.plan.days.find((d) => d.date === tomorrow)?.sessions ?? [])
  const tips = [rec.tip, ...rec.notes].filter((t): t is string => !!t)
  return (
    <Card data-testid="evening">
      <H2>Heute Abend und morgen</H2>
      {routine.steps.length > 0 && (
        <ol className="relative mb-4 space-y-2 border-l border-line pl-4">
          {routine.steps.map((st) => (
            <li key={st.text} className="relative text-sm">
              <span aria-hidden className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-[#3987e5]" />
              <span className="font-semibold">{formatTime(st.atMin)}</span> <span className="text-muted">·</span> {st.text}
            </li>
          ))}
        </ol>
      )}
      {routine.prepare.length > 0 && (
        <>
          <Sub>Vorbereitung für morgen</Sub>
          <ul className="mt-1 mb-4 list-disc space-y-1 pl-5 text-sm">
            {routine.prepare.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </>
      )}
      {tips.length > 0 && (
        <>
          <Sub>Tipps</Sub>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">
            {tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}
