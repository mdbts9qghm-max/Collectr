import { useState } from 'react';
import type { ISODate } from '../domain/types.ts';
import { addDays, dateRange } from '../domain/date.ts';
import { formatDateLong, formatDuration, weekdayLong } from '../domain/format.ts';
import { applyRotation } from '../domain/shifts.ts';
import { useStore } from '../data/store.ts';
import { Button, Field, Select, Sheet } from './primitives.tsx';

export function ShiftSheet({
  open,
  date,
  onClose,
}: {
  open: boolean;
  date: ISODate;
  onClose: () => void;
}) {
  const shiftTypes = useStore((s) => s.shiftTypes);
  const current = useStore((s) => s.shifts[date]);
  const setShift = useStore((s) => s.setShift);
  const setShifts = useStore((s) => s.setShifts);
  const rotation = useStore((s) => s.settings.shiftRotation);
  const toast = useStore((s) => s.toast);

  const [repeatDays, setRepeatDays] = useState('0');

  const assign = (typeId: string | null) => {
    const days = Number(repeatDays);
    if (typeId && days > 0) {
      setShifts(
        dateRange(date, addDays(date, days - 1)).map((d) => ({
          date: d,
          shiftTypeId: typeId,
          source: 'manual' as const,
        })),
      );
      toast(`${days} Tage gesetzt`, 'good');
    } else {
      setShift(date, typeId);
    }
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={`${weekdayLong(date)}, ${formatDateLong(date)}`}>
      <Field label="Wie viele Tage ab hier?">
        <Select
          value={repeatDays}
          onChange={(e) => setRepeatDays(e.target.value)}
          options={[
            { value: '0', label: 'Nur dieser Tag' },
            { value: '2', label: '2 Tage' },
            { value: '3', label: '3 Tage' },
            { value: '4', label: '4 Tage' },
            { value: '7', label: '1 Woche' },
          ]}
        />
      </Field>

      <div className="col gap-2">
        {shiftTypes.map((type) => (
          <button
            key={type.id}
            type="button"
            className="list-item clickable"
            style={{
              borderRadius: 'var(--r-md)',
              border: `1px solid ${current?.shiftTypeId === type.id ? type.color : 'var(--border)'}`,
              background: current?.shiftTypeId === type.id ? 'var(--surface-2)' : 'transparent',
            }}
            onClick={() => assign(type.id)}
          >
            <span className="icon-badge" style={{ background: `color-mix(in srgb, ${type.color} 18%, transparent)` }}>
              {type.icon}
            </span>
            <span className="grow">
              <span className="t-body" style={{ fontWeight: 600, display: 'block' }}>
                {type.label}
              </span>
              <span className="t-caption muted">
                {type.work ? `${type.work.start}–${type.work.end} · ` : ''}
                {type.training.maxMinutes > 0
                  ? `max. ${formatDuration(type.training.maxMinutes)} Training`
                  : 'kein Training'}
              </span>
            </span>
            <span
              className="dot"
              style={{
                background:
                  type.training.rating === 'green'
                    ? 'var(--good)'
                    : type.training.rating === 'amber'
                      ? 'var(--warn)'
                      : 'var(--bad)',
              }}
            />
          </button>
        ))}
      </div>

      <div className="divider" />

      <Button
        block
        onClick={() => {
          setShifts(applyRotation(date, 28, rotation));
          toast('4 Wochen nach deinem Rotationsmuster gefüllt', 'good');
          onClose();
        }}
      >
        Rotationsmuster für 4 Wochen anwenden
      </Button>
      <p className="t-caption muted">
        Das Muster stellst du im Profil ein. Einzelne Tage kannst du danach jederzeit überschreiben.
      </p>

      {current && (
        <Button variant="ghost" block onClick={() => assign(null)}>
          Schicht entfernen
        </Button>
      )}
    </Sheet>
  );
}
