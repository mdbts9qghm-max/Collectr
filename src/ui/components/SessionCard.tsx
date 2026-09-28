import { useState } from 'react'
import { formatNumberDE, formatTime } from '../../core/time'
import type { ExercisePrescription, PlannedSession } from '../../core/types'
import { Chip } from './common'

export function sessionMeta(s: PlannedSession): string {
  const parts = [`${s.durationMin} min`]
  if (s.distanceKm !== undefined && s.category === 'run') parts.push(`${formatNumberDE(s.distanceKm)} km`)
  if (s.elevationM) parts.push(`${s.elevationM} hm`)
  if (s.startMin !== undefined) parts.push(`ab ${formatTime(s.startMin)}`)
  return parts.join(' · ')
}

function exerciseDose(e: ExercisePrescription): string {
  const dose = e.reps !== undefined ? `${e.reps} Wdh.` : e.holdSec !== undefined ? `${e.holdSec} s` : 'max.'
  return `${e.sets} × ${dose}${e.perSide ? ' je Seite' : ''} · Pause ${e.restSec} s`
}

export function SessionDetails({ s }: { s: PlannedSession }) {
  return (
    <div className="mt-3 space-y-2 text-sm">
      <p className="text-muted">{s.goal}</p>
      <p>
        <span className="text-muted">Intensität: </span>
        {s.intensity.label}
      </p>
      <dl className="space-y-1">
        <div>
          <dt className="inline text-muted">Aufwärmen: </dt>
          <dd className="inline">{s.structure.warmup}</dd>
        </div>
        <div>
          <dt className="inline text-muted">Hauptteil: </dt>
          <dd className="inline">{s.structure.main}</dd>
        </div>
        <div>
          <dt className="inline text-muted">Abwärmen: </dt>
          <dd className="inline">{s.structure.cooldown}</dd>
        </div>
      </dl>
      {s.exercises && s.exercises.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {s.exercises.map((e, i) => (
            <li key={i} className="px-3 py-2">
              <div>{e.name}</div>
              <div className="text-xs text-muted">
                {exerciseDose(e)}
                {e.note ? ` · ${e.note}` : ''}
              </div>
            </li>
          ))}
        </ul>
      )}
      {s.origin?.movedFrom && <p className="text-xs text-yellow">Verschoben vom {s.origin.movedFrom.split('-').reverse().join('.')}</p>}
      {s.origin?.note && <p className="text-xs text-yellow">{s.origin.note}</p>}
    </div>
  )
}

export function SessionCard({ s, defaultOpen = false, children }: { s: PlannedSession; defaultOpen?: boolean; children?: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl border border-line bg-panel-2 p-3" data-testid="session">
      <button type="button" className="flex w-full items-start justify-between gap-2 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <div>
          <div className="font-medium">{s.title}</div>
          <div className="text-xs text-muted">{sessionMeta(s)}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {s.isKey && <Chip tone="accent">Schlüssel</Chip>}
          {s.optional && <Chip>optional</Chip>}
        </div>
      </button>
      {open && <SessionDetails s={s} />}
      {children}
    </div>
  )
}
