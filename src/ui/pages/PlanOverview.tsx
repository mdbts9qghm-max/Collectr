import { useMemo, useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useApp } from '../../app/AppState'
import { calendarWeeks, PHASE_LABEL } from '../../core/plan'
import { raceChecklist } from '../../core/race'
import { addDays, formatDateDE, formatDayMonthDE, isoWeek } from '../../core/time'
import { Card, Chip, H2 } from '../components/common'

// Validierte Farben (dataviz): Soll = Blau, Ist = Orange; dunkle Stufen für die dunkle Fläche.
const SOLL = '#3987e5'
const IST = '#d95926'
const GRID = '#253041'
const AXIS = '#9aa7b6'

type Mode = 'micro' | 'week'

interface Row {
  key: string
  label: string
  soll: number
  ist: number | null
  note: string
}

export function PlanOverview() {
  const { plan, data, today } = useApp()
  const [mode, setMode] = useState<Mode>('micro')

  const actual = useMemo(() => {
    const byDate = new Map<string, { km: number; hm: number; sets: number }>()
    const sessions = new Map(plan.days.flatMap((d) => d.sessions).map((s) => [s.id, s]))
    for (const l of data.logs) {
      if (l.status !== 'done') continue
      const s = sessions.get(l.sessionId)
      const e = byDate.get(l.date) ?? { km: 0, hm: 0, sets: 0 }
      if (s?.category === 'run' || l.distanceKm !== undefined) {
        e.km += l.distanceKm ?? s?.distanceKm ?? 0
        e.hm += l.elevationM ?? s?.elevationM ?? 0
      }
      if (s?.category === 'strength') e.sets += s.strengthSets ?? 0
      byDate.set(l.date, e)
    }
    return byDate
  }, [data.logs, plan])

  const rows = useMemo(() => {
    const sumActual = (from: string, to: string, k: 'km' | 'hm' | 'sets') => {
      let v = 0
      for (const [d, e] of actual) if (d >= from && d <= to) v += e[k]
      return v
    }
    // Ist-Werte erst ab dem ersten Protokoll und nur für begonnene Zeiträume.
    const firstLog = data.logs.map((l) => l.date).sort()[0]
    const past = (start: string, end: string) => start <= today && firstLog !== undefined && end >= firstLog
    if (mode === 'micro') {
      return plan.microcycles.map((m) => {
        const note = `${PHASE_LABEL[m.phase]}${m.kind === 'deload' ? ', Entlastung' : ''}${m.isKeyPeak ? ', Schlüsselspitze' : ''}`
        const mk = (soll: number, k: 'km' | 'hm' | 'sets', f = 7 / 5): Row => ({
          key: String(m.index),
          label: formatDayMonthDE(m.start),
          soll: Math.round(soll * f),
          ist: past(m.start, m.end) ? Math.round(sumActual(m.start, m.end, k) * f) : null,
          note,
        })
        return { km: mk(m.plannedKm, 'km'), hm: mk(m.plannedElevationM, 'hm'), sets: mk(m.strengthSets, 'sets', 1) }
      })
    }
    return calendarWeeks(plan).map((w) => {
      const to = addDays(w.start, 6)
      const note = `KW ${w.week}`
      const mk = (soll: number, k: 'km' | 'hm' | 'sets'): Row => ({
        key: `${w.year}-${w.week}`,
        label: formatDayMonthDE(w.start),
        soll: Math.round(soll),
        ist: past(w.start, to) ? Math.round(sumActual(w.start, to, k)) : null,
        note,
      })
      return { km: mk(w.plannedKm, 'km'), hm: mk(w.plannedElevationM, 'hm'), sets: mk(w.strengthSets, 'sets') }
    })
  }, [plan, mode, actual, today, data.logs])

  const unit = mode === 'micro' ? 'pro Woche (Mikrozyklus × 7/5)' : 'je Kalenderwoche'
  return (
    <div className="space-y-4">
      <div className="flex gap-2" role="group" aria-label="Zeiteinheit">
        {(['micro', 'week'] as Mode[]).map((m) => (
          <button
            key={m}
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={`min-h-11 flex-1 rounded-xl border text-sm ${mode === m ? 'border-accent bg-accent/20 text-accent' : 'border-line bg-panel-2'}`}
          >
            {m === 'micro' ? 'Mikrozyklen' : 'Kalenderwochen'}
          </button>
        ))}
      </div>

      <ChartCard title={`Laufkilometer ${unit}`} rows={rows.map((r) => r.km)} unit="km" />
      <ChartCard title={`Höhenmeter ${unit}`} rows={rows.map((r) => r.hm)} unit="hm" />
      <ChartCard title={mode === 'micro' ? 'Kraftvolumen (Sätze je Mikrozyklus)' : 'Kraftvolumen (Sätze je Woche)'} rows={rows.map((r) => r.sets)} unit="Sätze" />

      <Card>
        <H2>Mesozyklen</H2>
        <ul className="space-y-2 text-sm" data-testid="mesocycles">
          {plan.mesocycles.map((m) => {
            const micros = plan.microcycles.filter((x) => x.mesoIndex === m.index)
            const deload = micros.find((x) => x.kind === 'deload')
            const active = today >= m.start && today <= m.end
            return (
              <li key={m.index} className={`rounded-xl border p-3 ${active ? 'border-accent' : 'border-line'} bg-panel-2`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {m.index === 8 ? 'Taper' : `Meso ${m.index}`} · {PHASE_LABEL[m.phase]}
                  </span>
                  {active && <Chip tone="accent">aktuell</Chip>}
                </div>
                <div className="text-xs text-muted">
                  {formatDateDE(m.start)}–{formatDateDE(m.end)}
                  {deload && ` · Entlastung ab ${formatDateDE(deload.start)}`}
                </div>
              </li>
            )
          })}
        </ul>
        <div className="mt-3 space-y-1 text-xs text-muted">
          {plan.mountainWeekends.map((w) => (
            <p key={w.microIndex}>
              ⛰ Bergwochenende {formatDateDE(w.days[0])}/{formatDateDE(w.days[1])}
              {!w.feasible && ' (durch Dienst blockiert)'}
            </p>
          ))}
          <p>🏁 Rennen: Freitag, 18.06.2027, 23:00 Uhr (KW {isoWeek('2027-06-18').week})</p>
        </div>
      </Card>

      <RaceChecklist />
    </div>
  )
}

function RaceChecklist() {
  const app = useApp()
  const done = app.data.checklist
  return (
    <Card>
      <H2>Checkliste Rennwoche</H2>
      <ul className="space-y-1" data-testid="checklist">
        {raceChecklist().map((i) => (
          <li key={i.id}>
            <label className="flex min-h-11 items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 shrink-0 accent-[#34d399]"
                checked={done[i.id] ?? false}
                onChange={(e) => app.setChecklist({ ...done, [i.id]: e.target.checked })}
              />
              <span>
                <span className="text-xs text-muted">{i.group}: </span>
                {i.text}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function ChartCard({ title, rows, unit }: { title: string; rows: Row[]; unit: string }) {
  const [table, setTable] = useState(false)
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between gap-2">
        <H2>{title}</H2>
        <button className="text-xs text-muted underline" onClick={() => setTable((t) => !t)}>
          {table ? 'Diagramm' : 'Tabelle'}
        </button>
      </div>
      <div className="mb-2 flex gap-4 text-xs text-muted" aria-hidden>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: SOLL }} /> Soll
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4" style={{ background: IST }} /> Ist
        </span>
      </div>
      {table ? (
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="text-muted">
              <tr>
                <th className="text-left font-normal">Beginn</th>
                <th className="text-right font-normal">Soll</th>
                <th className="text-right font-normal">Ist</th>
                <th className="text-left font-normal pl-2">Hinweis</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-line">
                  <td>{r.label}</td>
                  <td className="text-right">{r.soll}</td>
                  <td className="text-right">{r.ist ?? '–'}</td>
                  <td className="pl-2 text-muted">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-48 w-full" data-testid="chart">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap={2}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 10 }} interval="preserveStartEnd" minTickGap={24} tickLine={false} axisLine={{ stroke: GRID }} />
              <YAxis tick={{ fill: AXIS, fontSize: 10 }} tickLine={false} axisLine={false} width={40} tickFormatter={(v: number) => v.toLocaleString('de-DE')} />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                contentStyle={{ background: '#1a2230', border: '1px solid #253041', borderRadius: 12, fontSize: 12 }}
                labelStyle={{ color: '#e6edf3' }}
                itemStyle={{ color: '#e6edf3' }}
                formatter={(v, name) => [`${v} ${unit}`, name === 'soll' ? 'Soll' : 'Ist']}
                labelFormatter={(l, p) => `${l} · ${(p?.[0]?.payload as Row | undefined)?.note ?? ''}`}
              />
              <Bar dataKey="soll" name="soll" fill={SOLL} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Line dataKey="ist" name="ist" stroke={IST} strokeWidth={2} dot={{ r: 3, fill: IST, stroke: '#121821', strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}
