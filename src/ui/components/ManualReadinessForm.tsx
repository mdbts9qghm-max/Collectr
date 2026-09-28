import { useState } from 'react'
import type { LocalDate, ManualReadiness } from '../../core/types'
import { Button, Field, Input, Rating } from './common'

/** Kurze manuelle Eingabe, wenn WHOOP-Daten fehlen (SPEC 6.1). */
export function ManualReadinessForm({ date, initial, onSave }: { date: LocalDate; initial?: ManualReadiness; onSave: (m: ManualReadiness) => void }) {
  const [hours, setHours] = useState(initial ? String(initial.sleepMin / 60).replace('.', ',') : '')
  const [quality, setQuality] = useState<1 | 2 | 3 | 4 | 5 | undefined>(initial?.quality)
  const [feeling, setFeeling] = useState<1 | 2 | 3 | 4 | 5 | undefined>(initial?.feeling)
  const h = Number(hours.replace(',', '.'))
  const valid = hours !== '' && Number.isFinite(h) && h >= 0 && h <= 16 && quality !== undefined && feeling !== undefined
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) onSave({ date, sleepMin: Math.round(h * 60), quality: quality!, feeling: feeling! })
      }}
    >
      <Field label="Schlafdauer letzte Nacht bzw. Tagschlaf (Stunden)">
        <Input inputMode="decimal" placeholder="z. B. 7,5" value={hours} onChange={(e) => setHours(e.target.value)} aria-label="Schlafdauer in Stunden" />
      </Field>
      <Rating label="Schlafqualität (1 = schlecht, 5 = sehr gut)" value={quality} onChange={setQuality} />
      <Rating label="Gefühl heute (1 = platt, 5 = top)" value={feeling} onChange={setFeeling} />
      <Button type="submit" variant="primary" disabled={!valid} className="w-full">
        Speichern
      </Button>
    </form>
  )
}
