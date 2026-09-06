import { useEffect, useState } from 'react';
import type { DailyCheckIn, ISODate } from '../domain/types.ts';
import { nowTimestamp } from '../domain/date.ts';
import { useStore } from '../data/store.ts';
import { Button, Field, ScalePicker, Sheet, TextArea, TextInput } from './primitives.tsx';

function blank(date: ISODate): DailyCheckIn {
  return { date, source: 'manual', updatedAt: nowTimestamp() };
}

export function CheckInSheet({
  open,
  date,
  onClose,
}: {
  open: boolean;
  date: ISODate;
  onClose: () => void;
}) {
  const existing = useStore((s) => s.checkIns[date]);
  const saveCheckIn = useStore((s) => s.saveCheckIn);
  const toast = useStore((s) => s.toast);
  const [draft, setDraft] = useState<DailyCheckIn>(existing ?? blank(date));

  useEffect(() => {
    setDraft(existing ?? blank(date));
  }, [existing, date, open]);

  const patch = (p: Partial<DailyCheckIn>) => setDraft((d) => ({ ...d, ...p }));
  const num = (v: string) => (v === '' ? undefined : Number(v));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Tages-Check-in"
      footer={
        <Button
          variant="primary"
          block
          onClick={() => {
            saveCheckIn(draft);
            onClose();
            toast('Check-in gespeichert', 'good');
          }}
        >
          Speichern
        </Button>
      }
    >
      <p className="t-small muted">
        Diese Werte steuern die Readiness und damit die Trainingsempfehlung. Alles ist optional —
        die App rechnet mit dem, was da ist, und gewichtet fehlende Angaben nicht einfach als
        Durchschnitt.
      </p>

      <div className="grid-2">
        <Field label="Schlafdauer">
          <TextInput
            type="number"
            inputMode="decimal"
            step="0.25"
            min={0}
            max={16}
            suffix="h"
            value={draft.sleepHours ?? ''}
            onChange={(e) => patch({ sleepHours: num(e.target.value) })}
          />
        </Field>
        <Field label="Körpergewicht">
          <TextInput
            type="number"
            inputMode="decimal"
            step="0.1"
            suffix="kg"
            value={draft.bodyweightKg ?? ''}
            onChange={(e) => patch({ bodyweightKg: num(e.target.value) })}
          />
        </Field>
      </div>

      <div className="grid-2">
        <Field label="Schlaf von">
          <TextInput
            type="time"
            value={draft.sleepStart ?? ''}
            onChange={(e) => patch({ sleepStart: e.target.value || undefined })}
          />
        </Field>
        <Field label="Schlaf bis">
          <TextInput
            type="time"
            value={draft.sleepEnd ?? ''}
            onChange={(e) => patch({ sleepEnd: e.target.value || undefined })}
          />
        </Field>
      </div>

      <Field label="Schlafqualität">
        <ScalePicker
          value={draft.sleepQuality}
          onChange={(v) => patch({ sleepQuality: v })}
          labels={['schlecht', 'sehr gut']}
        />
      </Field>

      <Field label="Müdigkeit">
        <ScalePicker value={draft.fatigue} onChange={(v) => patch({ fatigue: v })} labels={['frisch', 'erschöpft']} />
      </Field>

      <Field label="Muskelkater">
        <ScalePicker value={draft.soreness} onChange={(v) => patch({ soreness: v })} labels={['keiner', 'stark']} />
      </Field>

      <Field label="Stress">
        <ScalePicker value={draft.stress} onChange={(v) => patch({ stress: v })} labels={['ruhig', 'sehr hoch']} />
      </Field>

      <Field label="Motivation">
        <ScalePicker
          value={draft.motivation}
          onChange={(v) => patch({ motivation: v })}
          labels={['kein Antrieb', 'voll da']}
        />
      </Field>

      <div className="divider" />
      <div className="t-label">Gerätedaten</div>
      <p className="t-caption muted">
        Noch manuell — die automatische Übernahme aus Garmin, WHOOP und Polar ist in der
        Datenstruktur vorbereitet, aber noch nicht angebunden.
      </p>

      <div className="grid-2">
        <Field label="Ruhepuls">
          <TextInput
            type="number"
            inputMode="numeric"
            suffix="bpm"
            value={draft.restingHr ?? ''}
            onChange={(e) => patch({ restingHr: num(e.target.value) })}
          />
        </Field>
        <Field label="HRV">
          <TextInput
            type="number"
            inputMode="numeric"
            suffix="ms"
            value={draft.hrvMs ?? ''}
            onChange={(e) => patch({ hrvMs: num(e.target.value) })}
          />
        </Field>
      </div>

      <div className="grid-2">
        <Field label="WHOOP Recovery">
          <TextInput
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            suffix="%"
            value={draft.whoopRecovery ?? ''}
            onChange={(e) => patch({ whoopRecovery: num(e.target.value) })}
          />
        </Field>
        <Field label="Schritte">
          <TextInput
            type="number"
            inputMode="numeric"
            value={draft.steps ?? ''}
            onChange={(e) => patch({ steps: num(e.target.value) })}
          />
        </Field>
      </div>

      <Field label="Notizen">
        <TextArea
          value={draft.notes ?? ''}
          placeholder="Alles, was den Tag erklärt."
          onChange={(e) => patch({ notes: e.target.value || undefined })}
        />
      </Field>
    </Sheet>
  );
}
