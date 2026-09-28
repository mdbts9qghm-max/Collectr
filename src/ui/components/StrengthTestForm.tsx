import { useState } from 'react'
import { LADDERS } from '../../core/strength'
import type { LocalDate, StrengthTest } from '../../core/types'
import { Button, Field, NumberInput } from './common'

/** Krafttest (SPEC 5.5): max. Klimmzüge, Dips, Hollow Hold, beste Lever-Stufe mit Haltezeit. */
export function StrengthTestForm({ date, onSave, submitLabel = 'Test speichern' }: { date: LocalDate; onSave: (t: StrengthTest) => void; submitLabel?: string }) {
  const [pullups, setPullups] = useState<number | undefined>()
  const [dips, setDips] = useState<number | undefined>()
  const [hollow, setHollow] = useState<number | undefined>()
  const [fl, setFl] = useState(0)
  const [flHold, setFlHold] = useState<number | undefined>()
  const [bl, setBl] = useState(0)
  const [blHold, setBlHold] = useState<number | undefined>()
  const [hang, setHang] = useState<number | undefined>()
  const [pushups, setPushups] = useState<number | undefined>()
  const [rows, setRows] = useState<number | undefined>()
  const valid = pullups !== undefined && dips !== undefined && hollow !== undefined

  const stageSelect = (ladder: 'front_lever' | 'back_lever', value: number, set: (v: number) => void) => (
    <select className="min-h-11 w-full rounded-xl border border-line bg-panel-2 px-3" value={value} onChange={(e) => set(Number(e.target.value))} aria-label={`${LADDERS[ladder].name} Stufe`}>
      {LADDERS[ladder].levels.map((l, i) => (
        <option key={i} value={i}>
          {l.name}
        </option>
      ))}
    </select>
  )

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        onSave({
          date,
          maxPullups: pullups!,
          maxDips: dips!,
          hollowHoldSec: hollow!,
          frontLever: { stage: fl, holdSec: flHold ?? 0 },
          backLever: { stage: bl, holdSec: blHold ?? 0 },
          ...(hang !== undefined ? { deadHangSec: hang } : {}),
          ...(pushups !== undefined ? { maxPushups: pushups } : {}),
          ...(rows !== undefined ? { maxAustralianRows: rows } : {}),
        })
      }}
    >
      <div className="grid grid-cols-3 gap-2">
        <Field label="Klimmzüge">
          <NumberInput value={pullups} onChange={setPullups} min={0} aria-label="Max. Klimmzüge" />
        </Field>
        <Field label="Dips">
          <NumberInput value={dips} onChange={setDips} min={0} aria-label="Max. Dips" />
        </Field>
        <Field label="Hollow (s)">
          <NumberInput value={hollow} onChange={setHollow} min={0} aria-label="Hollow Body Hold in Sekunden" />
        </Field>
      </div>
      <div className="grid grid-cols-[1fr_6rem] gap-2">
        <Field label="Front Lever: beste Stufe">{stageSelect('front_lever', fl, setFl)}</Field>
        <Field label="Halten (s)">
          <NumberInput value={flHold} onChange={setFlHold} min={0} aria-label="Front Lever Haltezeit" />
        </Field>
        <Field label="Back Lever: beste Stufe">{stageSelect('back_lever', bl, setBl)}</Field>
        <Field label="Halten (s)">
          <NumberInput value={blHold} onChange={setBlHold} min={0} aria-label="Back Lever Haltezeit" />
        </Field>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted">Optional (hilft bei 0 Klimmzügen/Dips)</summary>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Field label="Hängen (s)">
            <NumberInput value={hang} onChange={setHang} min={0} />
          </Field>
          <Field label="Liegestütz">
            <NumberInput value={pushups} onChange={setPushups} min={0} />
          </Field>
          <Field label="Aus. Rows">
            <NumberInput value={rows} onChange={setRows} min={0} />
          </Field>
        </div>
      </details>
      <Button type="submit" variant="primary" className="w-full" disabled={!valid}>
        {submitLabel}
      </Button>
    </form>
  )
}
