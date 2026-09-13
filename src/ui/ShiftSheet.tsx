import { useState } from 'react';
import type { ISODate } from '../domain/types.ts';
import { isBefore } from '../domain/date.ts';
import { formatDateLong, formatDuration, weekdayLong } from '../domain/format.ts';
import { rotationIndexOn } from '../domain/shifts.ts';
import { useStore } from '../data/store.ts';
import { Button, Field, Segmented, Sheet } from './primitives.tsx';

/**
 * Ein Tag im Kalender.
 *
 * Zwei Dinge lassen sich hier tun, und sie sind bewusst getrennt: eine einzelne
 * Schicht setzen — die Ausnahme, die den Rhythmus sticht — oder den Rhythmus ab
 * diesem Tag fortschreiben. Gewählt wird dabei die Stelle im Muster, nicht die
 * Schichtart: bei zwei freien Tagen im Muster wäre „Freischicht" zweideutig,
 * „Tag 4" ist es nicht.
 */
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
  const updateSettings = useStore((s) => s.updateSettings);
  const rotation = useStore((s) => s.settings.shiftRotation);
  const anchor = useStore((s) => s.settings.shiftAnchor);
  const toast = useStore((s) => s.toast);

  const [mode, setMode] = useState<'einzeln' | 'rhythmus'>('einzeln');

  const typeOf = (id: string) => shiftTypes.find((t) => t.id === id) ?? null;
  const indexHere =
    anchor && rotation.length > 0 ? rotationIndexOn(date, anchor, rotation.length) : null;

  /*
   * Welche Schicht an diesem Tag wirklich steht — von Hand gesetzt oder
   * fortgeschrieben. Ohne diese Unterscheidung zeigte das Blatt einen
   * fortgeschriebenen Tag als leer an und bot nicht einmal an, ihn zu leeren.
   */
  const effectiveId = current
    ? current.cleared
      ? null
      : current.shiftTypeId
    : indexHere != null && anchor && !isBefore(date, anchor.date)
      ? rotation[indexHere]
      : null;

  const assign = (typeId: string | null) => {
    setShift(date, typeId);
    onClose();
  };

  const anchorHere = (index: number) => {
    updateSettings({ shiftAnchor: { date, index } });
    toast('Rhythmus ab hier fortgeschrieben', 'good');
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={`${weekdayLong(date)}, ${formatDateLong(date)}`}>
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'einzeln', label: 'Nur dieser Tag' },
          { value: 'rhythmus', label: 'Ab hier fortschreiben' },
        ]}
      />

      {mode === 'einzeln' ? (
        <>
          <div className="col gap-2 mt-3">
            {shiftTypes.map((type) => (
              <button
                key={type.id}
                type="button"
                className="list-item clickable"
                style={{
                  borderRadius: 'var(--r-md)',
                  border: `1px solid ${effectiveId === type.id ? type.color : 'var(--border)'}`,
                  background: effectiveId === type.id ? 'var(--surface-2)' : 'transparent',
                }}
                onClick={() => assign(type.id)}
              >
                <span
                  className="icon-badge"
                  style={{ background: `color-mix(in srgb, ${type.color} 18%, transparent)` }}
                >
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
          {anchor && (
            <p className="t-caption muted mt-3">
              Der Rhythmus schreibt sich fort. Was du hier setzt, gilt als Ausnahme für diesen einen
              Tag und sticht ihn.
            </p>
          )}
        </>
      ) : (
        <>
          <Field
            label="Welche Stelle des Musters ist dieser Tag?"
            hint="Danach steht jeder folgende Tag fest, ohne dass du ihn einträgst."
          >
            <div className="col gap-2">
              {rotation.map((id, i) => {
                const type = typeOf(id);
                return (
                  <button
                    key={`pos-${i}`}
                    type="button"
                    className="list-item clickable"
                    style={{
                      borderRadius: 'var(--r-md)',
                      border: `1px solid ${indexHere === i ? (type?.color ?? 'var(--border)') : 'var(--border)'}`,
                      background: indexHere === i ? 'var(--surface-2)' : 'transparent',
                    }}
                    onClick={() => anchorHere(i)}
                  >
                    <span
                      className="icon-badge"
                      style={{
                        background: `color-mix(in srgb, ${type?.color ?? 'var(--border)'} 18%, transparent)`,
                      }}
                    >
                      {type?.icon}
                    </span>
                    <span className="grow">
                      <span className="t-body" style={{ fontWeight: 600, display: 'block' }}>
                        Tag {i + 1} · {type?.label ?? 'unbekannt'}
                      </span>
                      <span className="t-caption muted">
                        {i + 1} von {rotation.length} im Muster
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Field>
          <p className="t-caption muted">
            Das Muster selbst stellst du im Profil unter „Schichtsystem" ein.
          </p>
        </>
      )}

      {effectiveId && (
        <Button variant="ghost" block className="mt-3" onClick={() => assign(null)}>
          Schicht entfernen
        </Button>
      )}
    </Sheet>
  );
}
