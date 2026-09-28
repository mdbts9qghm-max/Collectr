import { useState } from 'react'
import { useApp } from '../../app/AppState'
import { LADDERS } from '../../core/strength'
import { addDays, formatDateDE, weekdayShortDE } from '../../core/time'
import type { Ladder, PlannedSession, SessionLog, StrengthResult } from '../../core/types'
import { Button, Card, Chip, Field, H2, Input, NumberInput, Rating } from '../components/common'
import { sessionMeta } from '../components/SessionCard'

const LOOKBACK_DAYS = 7

export function Tracking() {
  const app = useApp()
  const [selected, setSelected] = useState<PlannedSession | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const from = addDays(app.today, -LOOKBACK_DAYS)
  const days = app.plan.days.filter((d) => d.date >= from && d.date <= app.today).reverse()
  const logs = [...app.data.logs].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 15)
  const allSessions = new Map(app.plan.days.flatMap((d) => d.sessions).map((s) => [s.id, s]))

  if (selected) {
    return (
      <TrackingForm
        s={selected}
        existing={app.data.logs.find((l) => l.sessionId === selected.id)}
        onCancel={() => setSelected(null)}
        onSaved={(msg) => {
          setSelected(null)
          setMessage(msg)
        }}
      />
    )
  }

  return (
    <div className="space-y-4">
      {message && (
        <div role="status" className="rounded-2xl border border-accent/40 bg-accent/10 p-3 text-sm" data-testid="tracking-message">
          {message}
        </div>
      )}
      <Card>
        <H2>Einheiten abhaken</H2>
        {days.every((d) => d.sessions.length === 0) && <p className="text-sm text-muted">In den letzten Tagen waren keine Einheiten geplant.</p>}
        <ul className="space-y-2">
          {days.flatMap((d) =>
            d.sessions.map((s) => {
              const log = app.data.logs.find((l) => l.sessionId === s.id)
              return (
                <li key={s.id}>
                  <button
                    className="flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-panel-2 p-3 text-left"
                    onClick={() => setSelected(s)}
                    data-testid="track-session"
                  >
                    <div>
                      <div className="text-sm font-medium">{s.title}</div>
                      <div className="text-xs text-muted">
                        {weekdayShortDE(d.date)} {formatDateDE(d.date)} · {sessionMeta(s)}
                      </div>
                    </div>
                    {log ? <Chip tone={log.status === 'done' ? 'accent' : 'neutral'}>{log.status === 'done' ? 'erledigt' : 'ausgelassen'}</Chip> : <Chip>offen</Chip>}
                  </button>
                </li>
              )
            }),
          )}
        </ul>
      </Card>
      <Card>
        <H2>Verlauf</H2>
        {logs.length === 0 ? (
          <p className="text-sm text-muted">Noch keine Einträge.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {logs.map((l) => (
              <li key={l.sessionId} className="py-2">
                <div className="flex justify-between">
                  <span>{allSessions.get(l.sessionId)?.title ?? l.sessionId}</span>
                  <span className="text-muted">{formatDateDE(l.date)}</span>
                </div>
                <div className="text-xs text-muted">
                  {l.status === 'done' ? 'erledigt' : 'ausgelassen'}
                  {l.durationMin !== undefined && ` · ${l.durationMin} min`}
                  {l.distanceKm !== undefined && ` · ${String(l.distanceKm).replace('.', ',')} km`}
                  {l.feeling !== undefined && ` · Gefühl ${l.feeling}/5`}
                  {l.carbsPerHour !== undefined && ` · ${l.carbsPerHour} g KH/h`}
                  {l.adjustmentRejected && ' · Original statt Anpassung'}
                  {l.note && ` · ${l.note}`}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

interface LadderInput {
  ladder: Ladder
  level: number
  name: string
  kind: 'reps' | 'hold'
  sets: (number | undefined)[]
}

function ladderInputs(s: PlannedSession): LadderInput[] {
  const seen = new Set<Ladder>()
  const out: LadderInput[] = []
  for (const e of s.exercises ?? []) {
    if (!e.ladder || e.level === undefined || seen.has(e.ladder)) continue
    seen.add(e.ladder)
    const crit = LADDERS[e.ladder].levels[e.level]?.criterion
    const n = Math.max(e.sets, crit?.sets ?? 1)
    out.push({ ladder: e.ladder, level: e.level, name: e.name, kind: e.holdSec !== undefined ? 'hold' : 'reps', sets: Array.from({ length: n }, () => undefined) })
  }
  return out
}

function TrackingForm({ s, existing, onCancel, onSaved }: { s: PlannedSession; existing?: SessionLog; onCancel: () => void; onSaved: (msg: string) => void }) {
  const app = useApp()
  const isRun = s.category === 'run'
  const isLong = s.fueling === true
  const [status, setStatus] = useState<'done' | 'skipped'>(existing?.status ?? 'done')
  const [duration, setDuration] = useState<number | undefined>(existing?.durationMin ?? s.durationMin)
  const [km, setKm] = useState<number | undefined>(existing?.distanceKm ?? (isRun ? s.distanceKm : undefined))
  const [hm, setHm] = useState<number | undefined>(existing?.elevationM ?? (isRun ? s.elevationM : undefined))
  const [feeling, setFeeling] = useState<1 | 2 | 3 | 4 | 5 | undefined>(existing?.feeling)
  const [note, setNote] = useState(existing?.note ?? '')
  const [carbs, setCarbs] = useState<number | undefined>(existing?.carbsPerHour)
  const [fuelingNote, setFuelingNote] = useState(existing?.fuelingNote ?? '')
  const [gearNote, setGearNote] = useState(existing?.gearNote ?? '')
  const [ladders, setLadders] = useState<LadderInput[]>(() => ladderInputs(s))
  const [rpe, setRpe] = useState<number | undefined>()

  const save = async () => {
    const log: SessionLog = {
      sessionId: s.id,
      date: s.date,
      status,
      ...(existing?.adjustmentRejected ? { adjustmentRejected: true } : {}),
      ...(existing?.reduced ? { reduced: true } : {}),
      ...(status === 'done' && duration !== undefined ? { durationMin: duration } : {}),
      ...(status === 'done' && km !== undefined ? { distanceKm: km } : {}),
      ...(status === 'done' && hm !== undefined ? { elevationM: hm } : {}),
      ...(feeling ? { feeling } : {}),
      ...(note ? { note } : {}),
      ...(carbs !== undefined ? { carbsPerHour: carbs } : {}),
      ...(fuelingNote ? { fuelingNote } : {}),
      ...(gearNote ? { gearNote } : {}),
    }
    const results: StrengthResult[] = ladders
      .filter((l) => l.sets.some((v) => v !== undefined))
      .map((l) => ({
        ladder: l.ladder,
        level: l.level,
        sets: l.sets.filter((v): v is number => v !== undefined).map((v) => (l.kind === 'hold' ? { holdSec: v } : { reps: v })),
        ...(l.ladder === 'legs' && rpe !== undefined ? { rpe } : {}),
      }))
    if (results.length) log.strength = results
    await app.saveLog(log)
    let msg = `${s.title}: gespeichert.`
    if (status === 'done' && results.length) {
      const r = await app.saveStrengthResults(results)
      if (r.advanced.length) msg += ` Aufstieg: ${r.advanced.map((l) => LADDERS[l].name).join(', ')}!`
      if (r.blocked.length) msg += ' Kriterium erfüllt, aber eine Voraussetzung fehlt noch.'
    }
    onSaved(msg)
  }

  return (
    <Card>
      <H2>{s.title}</H2>
      <p className="mb-3 text-xs text-muted">
        {formatDateDE(s.date)} · geplant: {sessionMeta(s)}
      </p>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Status">
          {(['done', 'skipped'] as const).map((st) => (
            <button
              key={st}
              aria-pressed={status === st}
              onClick={() => setStatus(st)}
              className={`min-h-11 rounded-xl border text-sm ${status === st ? 'border-accent bg-accent/20 text-accent' : 'border-line bg-panel-2'}`}
            >
              {st === 'done' ? 'Erledigt' : 'Ausgelassen'}
            </button>
          ))}
        </div>
        {status === 'done' && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Dauer (min)">
                <NumberInput value={duration} onChange={setDuration} min={0} />
              </Field>
              {isRun && (
                <>
                  <Field label="km">
                    <NumberInput value={km} onChange={setKm} min={0} step={0.1} />
                  </Field>
                  <Field label="hm">
                    <NumberInput value={hm} onChange={setHm} min={0} />
                  </Field>
                </>
              )}
            </div>
            {isLong && (
              <div className="space-y-2 rounded-xl border border-line p-3">
                <div className="text-sm font-medium">Verpflegung und Ausrüstung</div>
                <Field label="Kohlenhydrate pro Stunde (g)">
                  <NumberInput value={carbs} onChange={setCarbs} min={0} aria-label="Kohlenhydrate pro Stunde" />
                </Field>
                <Field label="Was hast du gegessen/getrunken?">
                  <Input value={fuelingNote} onChange={(e) => setFuelingNote(e.target.value)} />
                </Field>
                <Field label="Ausrüstungstest (Rucksack, Stöcke, Schuhe, Stirnlampe …)">
                  <Input value={gearNote} onChange={(e) => setGearNote(e.target.value)} />
                </Field>
              </div>
            )}
            {ladders.length > 0 && (
              <div className="space-y-3 rounded-xl border border-line p-3" data-testid="strength-results">
                <div className="text-sm font-medium">Kraft-Ergebnisse (Hauptübung je Leiter)</div>
                {ladders.map((l, li) => (
                  <div key={l.ladder}>
                    <div className="text-xs text-muted">
                      {l.name} · {l.kind === 'hold' ? 'Sekunden je Satz' : 'Wiederholungen je Satz'}
                    </div>
                    <div className="mt-1 grid grid-cols-5 gap-1">
                      {l.sets.map((v, si) => (
                        <NumberInput
                          key={si}
                          value={v}
                          min={0}
                          aria-label={`${l.name} Satz ${si + 1}`}
                          onChange={(nv) =>
                            setLadders((prev) => prev.map((x, i) => (i === li ? { ...x, sets: x.sets.map((y, j) => (j === si ? nv : y)) } : x)))
                          }
                        />
                      ))}
                    </div>
                  </div>
                ))}
                {ladders.some((l) => l.ladder === 'legs') && (
                  <Field label="Anstrengung Beine (RPE 1–10)">
                    <NumberInput value={rpe} onChange={setRpe} min={1} max={10} />
                  </Field>
                )}
              </div>
            )}
          </>
        )}
        <Rating label="Gefühl (1–5)" value={feeling} onChange={setFeeling} />
        <Field label="Notiz">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="primary" onClick={save}>
            Speichern
          </Button>
          <Button onClick={onCancel}>Abbrechen</Button>
        </div>
      </div>
    </Card>
  )
}
