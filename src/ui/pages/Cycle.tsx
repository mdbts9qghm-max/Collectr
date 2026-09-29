import { useMemo, useState } from 'react'
import { useApp } from '../../app/AppState'
import { actualByDate, plannedVolume, sumVolume } from '../../app/volumeView'
import { CONFIG } from '../../core/config'
import { microIndexOf } from '../../core/plan'
import { shiftLabel } from '../../core/shift'
import { addDays, formatDateDE, formatNumberDE, isoWeek, isoWeekStart, weekdayShortDE } from '../../core/time'
import type { LocalDate, PlanDay } from '../../core/types'
import { Card, Chip, Disclosure, H2, SegmentedButtons, SegmentedLinks, Stat } from '../components/common'
import { OverrideSheet } from '../components/OverrideSheet'

const SHIFT_TONE: Record<string, 'neutral' | 'accent' | 'warn' | 'danger'> = {
  T: 'warn',
  N: 'danger',
  V: 'warn',
  FB: 'warn',
  K: 'danger',
  S: 'neutral',
  F: 'accent',
  U: 'accent',
}

type View = 'micro' | 'week'

export function Cycle() {
  const { plan, today, data } = useApp()
  const [selected, setSelected] = useState<LocalDate | null>(null)
  const [view, setView] = useState<View>('micro')
  const actual = useMemo(() => actualByDate(plan, data.logs), [plan, data.logs])
  const current = microIndexOf(today) ?? (today < CONFIG.plan.startDate ? 1 : plan.microcycles.length)
  const micros = plan.microcycles.filter((m) => m.index >= current - 1 && m.index <= current + 1)
  const thisWeek = isoWeekStart(today)
  const weeks = [addDays(thisWeek, -7), thisWeek, addDays(thisWeek, 7)]

  const block = (key: string, title: string, from: LocalDate, to: LocalDate, unit: string, extra: string | null, past: boolean) => {
    const soll = plannedVolume(plan, from, to)
    const ist = sumVolume(actual, from, to)
    const days = plan.days.filter((d) => d.date >= from && d.date <= to)
    const started = from <= today
    const body = (
      <>
        <div className="mb-3 grid grid-cols-3 gap-2" data-testid="volume">
          <Stat label={`Soll ${unit}`} value={`${formatNumberDE(soll.km)} km`} sub={`${soll.hm} hm`} />
          <Stat label={`Ist ${unit}`} value={started ? `${formatNumberDE(ist.km)} km` : '–'} sub={started ? `${ist.hm} hm` : 'noch nicht begonnen'} />
          {extra ? <Stat label="Block" value={extra.split(' · ')[0]!} sub={extra.split(' · ').slice(1).join(' · ')} /> : <Stat label="Tage" value={days.length} />}
        </div>
        <ul className="space-y-2">
          {days.map((d) => (
            <DayRow key={d.date} day={d} isToday={d.date === today} onSelect={() => setSelected(d.date)} />
          ))}
        </ul>
      </>
    )
    return past ? (
      <Disclosure key={key} card title={title} summary={`Ist ${formatNumberDE(ist.km)} / Soll ${formatNumberDE(soll.km)} km`}>
        {body}
      </Disclosure>
    ) : (
      <Card key={key}>
        <H2>{title}</H2>
        {body}
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <SegmentedLinks label="Coach" items={[{ to: '/zyklus', label: 'Zyklus' }, { to: '/plan', label: 'Gesamtplan' }]} />
      <SegmentedButtons
        label="Ansicht"
        value={view}
        onChange={setView}
        options={[
          { value: 'micro', label: 'Rhythmus (5 Tage)' },
          { value: 'week', label: 'Kalenderwochen' },
        ]}
      />
      {view === 'micro'
        ? micros.map((m) =>
            block(
              `m${m.index}`,
              `${m.index < current ? 'Voriger' : m.index === current ? 'Aktueller' : 'Nächster'} Rhythmus · ${formatDateDE(m.start)}–${formatDateDE(m.end)}`,
              m.start,
              m.end,
              'pro Rhythmus',
              `Mikro ${m.index} · Meso ${m.mesoIndex}${m.kind === 'deload' ? ' · Entlastung' : ''}`,
              m.index < current,
            ),
          )
        : weeks.map((w, i) =>
            block(
              `w${w}`,
              `${['Vorige', 'Aktuelle', 'Nächste'][i]} Woche · KW ${isoWeek(w).week} · ${formatDateDE(w)}–${formatDateDE(addDays(w, 6))}`,
              w,
              addDays(w, 6),
              'pro Woche',
              null,
              i === 0,
            ),
          )}
      {selected && <OverrideSheet date={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function DayRow({ day, isToday, onSelect }: { day: PlanDay; isToday: boolean; onSelect: () => void }) {
  const main = day.sessions.filter((s) => !s.optional)
  const optional = day.sessions.filter((s) => s.optional)
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`w-full rounded-xl p-3 text-left ${isToday ? 'ring-2 ring-accent' : ''} bg-panel-2`}
        data-testid={`day-${day.date}`}
      >
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">
            {weekdayShortDE(day.date)} {formatDateDE(day.date)} · Tag {day.shift.cycleDay}
          </div>
          <Chip tone={SHIFT_TONE[day.shift.code] ?? 'neutral'}>{shiftLabel(day.shift.code)}</Chip>
        </div>
        <div className="mt-1 text-xs text-muted">
          {main.length > 0 ? main.map((s) => s.title).join(' · ') : day.isRaceDay ? '' : 'Ruhetag'}
          {optional.length > 0 && <span> · optional: {optional.map((s) => s.title).join(', ')}</span>}
        </div>
        {day.removed.filter((r) => r.reason !== 'replaced').length > 0 && (
          <div className="mt-1 text-xs text-yellow">
            {day.removed
              .filter((r) => r.reason !== 'replaced')
              .map((r) => `${r.session.title}: ${r.note}`)
              .join(' ')}
          </div>
        )}
      </button>
    </li>
  )
}

