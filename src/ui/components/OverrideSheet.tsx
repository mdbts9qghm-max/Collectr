// Blatt zum Ändern der Schicht eines Tages (V-Schicht, Urlaub, Krank, Tausch, Überstunden, Fortbildung).
// Wird in „Heute“ und im Coach (Zyklus) verwendet.
import { useState } from 'react'
import { useApp } from '../../app/AppState'
import { shiftLabel } from '../../core/shift'
import { formatDateDE, formatTime, weekdayShortDE } from '../../core/time'
import type { LocalDate, OverrideKind, PlanDay, ShiftOverride } from '../../core/types'
import { Button, Field, Input } from './common'
import { SessionCard } from './SessionCard'

const KINDS: { kind: OverrideKind; label: string }[] = [
  { kind: 'V', label: 'V-Schicht' },
  { kind: 'URLAUB', label: 'Urlaub' },
  { kind: 'KRANK', label: 'Krank' },
  { kind: 'TAUSCH', label: 'Tausch' },
  { kind: 'UEBERSTUNDEN', label: 'Überstunden' },
  { kind: 'FORTBILDUNG', label: 'Fortbildung' },
]

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

export function OverrideSheet({ date, onClose }: { date: LocalDate; onClose: () => void }) {
  const app = useApp()
  const day = app.plan.days.find((d) => d.date === date)!
  const existing = app.data.overrides.find((o) => o.date === date)
  const [kind, setKind] = useState<OverrideKind | null>(existing?.kind ?? null)
  const [swapTo, setSwapTo] = useState<'T' | 'N' | 'F' | 'V'>((existing?.swapTo as 'T' | 'N' | 'F' | 'V') ?? 'F')
  const [start, setStart] = useState(existing?.start !== undefined ? formatTime(existing.start) : '08:00')
  const [end, setEnd] = useState(existing?.end !== undefined ? formatTime(existing.end) : '16:00')

  const save = async () => {
    if (!kind) return
    const o: ShiftOverride = { date, kind, source: 'manual' }
    if (kind === 'TAUSCH') o.swapTo = swapTo
    if (kind === 'FORTBILDUNG') {
      o.start = toMin(start)
      o.end = toMin(end)
    }
    if (kind === 'UEBERSTUNDEN') {
      const e = toMin(end)
      // Ende vor Beginn → Folgetag (z. B. Nachtschicht bis 09:00)
      o.end = day.shift.work && e < day.shift.work.start ? e + 1440 : e
    }
    await app.setOverride(o)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end bg-black/60" role="dialog" aria-modal="true" aria-label="Tag bearbeiten" onClick={onClose}>
      <div className="mx-auto w-full max-w-xl space-y-4 rounded-t-3xl border border-line bg-panel p-4 pb-8" onClick={(e) => e.stopPropagation()}>
        <div>
          <div className="text-lg font-semibold">
            {weekdayShortDE(date)}, {formatDateDE(date)}
          </div>
          <div className="text-sm text-muted">
            Zyklustag {day.shift.cycleDay} · aktuell {shiftLabel(day.shift.code)}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              aria-pressed={kind === k.kind}
              onClick={() => setKind(k.kind)}
              className={`min-h-11 rounded-xl border text-sm ${kind === k.kind ? 'border-accent bg-accent/20 text-accent' : 'border-line bg-panel-2'}`}
            >
              {k.label}
            </button>
          ))}
        </div>
        {kind === 'TAUSCH' && (
          <Field label="Stattdessen">
            <select className="min-h-11 w-full rounded-xl border border-line bg-panel-2 px-3" value={swapTo} onChange={(e) => setSwapTo(e.target.value as 'T')}>
              <option value="F">Frei</option>
              <option value="T">Tagschicht</option>
              <option value="N">Nachtschicht</option>
              <option value="V">V-Schicht</option>
            </select>
          </Field>
        )}
        {kind === 'FORTBILDUNG' && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Beginn">
              <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="Ende">
              <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </Field>
          </div>
        )}
        {kind === 'UEBERSTUNDEN' && (
          <Field label="Neues Dienstende">
            <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        )}
        <SessionPreview day={day} />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="primary" onClick={save} disabled={!kind}>
            Speichern
          </Button>
          {existing ? (
            <Button
              variant="danger"
              onClick={async () => {
                await app.removeOverride(date)
                onClose()
              }}
            >
              Eintrag entfernen
            </Button>
          ) : (
            <Button onClick={onClose}>Abbrechen</Button>
          )}
        </div>
      </div>
    </div>
  )
}

function SessionPreview({ day }: { day: PlanDay }) {
  if (day.sessions.length === 0) return null
  return (
    <div className="space-y-2">
      <div className="text-xs text-muted">Geplant an diesem Tag:</div>
      {day.sessions.map((s) => (
        <SessionCard key={s.id} s={s} />
      ))}
    </div>
  )
}
