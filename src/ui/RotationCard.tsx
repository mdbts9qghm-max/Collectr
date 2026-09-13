import type { ISODate } from '../domain/types.ts';
import { addDays, dateRange, today as todayIso } from '../domain/date.ts';
import { formatDateLong, weekdayShort } from '../domain/format.ts';
import { rotationIndexOn } from '../domain/shifts.ts';
import { useStore } from '../data/store.ts';
import { shiftTypeOn } from '../data/derived.ts';
import { useData, useIndexes } from '../app/hooks.ts';
import { Button, Card, Field, Select } from './primitives.tsx';
import { IconPlus, IconTrash } from './icons.tsx';

/** Wie weit die Vorschau reicht — zwei Wochen zeigen den Rhythmus, ohne zu erschlagen. */
const PREVIEW_DAYS = 14;

/**
 * Der Schichtrhythmus, einmal eingestellt.
 *
 * Vorher endete der Kalender am letzten von Hand eingetragenen Tag, und dahinter
 * plante der Coach ins Leere. Hier steht das Muster und der eine Tag, an dem es
 * anliegt — daraus ergibt sich jeder kommende Tag von selbst. Einzelne Tage
 * bleiben trotzdem überschreibbar: eine V-Schicht sticht die Fortschreibung.
 */
export function RotationCard() {
  const data = useData();
  const idx = useIndexes();
  const updateSettings = useStore((s) => s.updateSettings);
  const toast = useStore((s) => s.toast);

  const today = todayIso();
  const rotation = data.settings.shiftRotation;
  const anchor = data.settings.shiftAnchor ?? null;
  const typeOf = (id: string) => data.shiftTypes.find((t) => t.id === id) ?? null;

  const todayIndex =
    anchor && rotation.length > 0 ? rotationIndexOn(today, anchor, rotation.length) : null;

  const setPosition = (at: number, id: string) => {
    updateSettings({ shiftRotation: rotation.map((x, i) => (i === at ? id : x)) });
  };

  const addPosition = () => {
    updateSettings({ shiftRotation: [...rotation, 'shift_off'] });
  };

  const removePosition = (at: number) => {
    if (rotation.length <= 1) return;
    const next = rotation.filter((_, i) => i !== at);
    // Der Anker zeigt auf eine Stelle im Muster. Wird sie kürzer, muss er
    // mitrutschen — sonst läge er plötzlich auf einer anderen Schicht.
    const shifted =
      anchor && anchor.index > at
        ? { ...anchor, index: anchor.index - 1 }
        : anchor && anchor.index === at
          ? null
          : anchor;
    updateSettings({ shiftRotation: next, shiftAnchor: shifted });
  };

  const setToday = (index: number) => {
    updateSettings({ shiftAnchor: { date: today, index } });
    toast('Der Kalender steht jetzt für jeden kommenden Tag', 'good');
  };

  const stop = () => {
    updateSettings({ shiftAnchor: null });
    toast('Fortschreibung beendet');
  };

  const preview: ISODate[] = dateRange(today, addDays(today, PREVIEW_DAYS - 1));

  return (
    <Card tight>
      <Field
        label="Dein Rhythmus"
        hint="Die Reihenfolge deiner Schichten. Sie wiederholt sich ohne Ende."
      >
        <div className="col gap-2">
          {rotation.map((id, i) => (
            <div className="row gap-2" key={`${id}-${i}`}>
              <span className="t-caption muted t-num" style={{ minWidth: 44 }}>
                Tag {i + 1}
              </span>
              <span className="grow">
                <Select
                  value={id}
                  onChange={(e) => setPosition(i, e.target.value)}
                  options={data.shiftTypes.map((t) => ({ value: t.id, label: `${t.icon} ${t.label}` }))}
                />
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => removePosition(i)}
                disabled={rotation.length <= 1}
                aria-label={`Tag ${i + 1} entfernen`}
              >
                <IconTrash size={15} />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={addPosition}>
            <IconPlus size={15} /> Tag anhängen
          </Button>
        </div>
      </Field>

      <div className="divider" />

      <Field
        label="Welcher Tag ist heute?"
        hint="Ein Tap, und jeder kommende Tag steht fest — ohne dass du ihn einträgst."
      >
        <div className="chip-row">
          {rotation.map((id, i) => {
            const type = typeOf(id);
            return (
              <button
                key={`heute-${i}`}
                type="button"
                className={`chip ${todayIndex === i ? 'active' : ''}`}
                onClick={() => setToday(i)}
              >
                {type?.icon} Tag {i + 1}
              </button>
            );
          })}
        </div>
      </Field>

      <p className="t-caption muted">
        {anchor ? (
          <>
            Schreibt sich fort seit {formatDateLong(anchor.date)}. Einzelne Tage kannst du im
            Kalender weiter überschreiben — eine V-Schicht oder ein Tauschtag sticht den Rhythmus.
          </>
        ) : (
          <>
            Noch nicht eingestellt: der Kalender endet am letzten Tag, den du von Hand eingetragen
            hast, und dahinter kann der Coach nichts planen.
          </>
        )}
      </p>

      {anchor && (
        <>
          <div className="divider" />
          <div className="t-label mb-3">Die nächsten zwei Wochen</div>
          <div className="col gap-2">
            {preview.map((date) => {
              const type = shiftTypeOn(idx, date);
              const stored = idx.shiftAssignments.get(date);
              const isException = stored?.source === 'manual';
              return (
                <div className="row gap-2" key={date}>
                  <span className="t-caption muted" style={{ minWidth: 76 }}>
                    {weekdayShort(date)} {Number(date.slice(8))}.{Number(date.slice(5, 7))}.
                  </span>
                  <span className="t-small grow">
                    {type ? `${type.icon} ${type.label}` : '— keine Schicht'}
                  </span>
                  {isException && <span className="t-caption muted">von Hand</span>}
                </div>
              );
            })}
          </div>
          <Button variant="ghost" block className="mt-3" onClick={stop}>
            Fortschreibung beenden
          </Button>
        </>
      )}
    </Card>
  );
}
