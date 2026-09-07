import { useState } from 'react';
import type { DayOptions } from '../domain/cycle/options.ts';
import type { PlannedUnit, SessionKind } from '../domain/cycle/types.ts';
import { CATALOGUE } from '../domain/cycle/catalogue.ts';
import { formatClock } from '../domain/cycle/windows.ts';
import { RECOVERY_BAND_META } from '../domain/cycle/recovery.ts';
import { shapeOf } from '../domain/cycle/toSession.ts';
import { SPORT_META, formatDuration } from '../domain/format.ts';
import { Card, Disclosure, Pill, SectionTitle } from './primitives.tsx';
import { IconPlus } from './icons.tsx';

/**
 * What to train on one day — the only place in the app that answers that.
 *
 * The week view and the cycle view used to ask two different engines and got
 * two different answers for the same Tuesday. Both now render this, from the
 * one plan, so they cannot disagree.
 */
export function DaySuggestion({
  options,
  onPlan,
}: {
  options: DayOptions;
  onPlan: (unit: PlannedUnit) => void;
}) {
  const { day, planned, alternatives, blocked } = options;
  if (!day) return null;

  const band = day.recovery.known ? RECOVERY_BAND_META[day.recovery.band] : null;

  /** An alternative is planned by swapping it into the day's own slot. */
  const planKind = (kind: SessionKind, start: number, durationMinutes: number) =>
    onPlan({
      date: options.date,
      kind,
      start,
      durationMinutes,
      load: CATALOGUE[kind].load,
      reasons: [`Selbst gewählt statt ${planned[0] ? CATALOGUE[planned[0].kind].label : 'nichts'}`],
    });

  return (
    <>
      <SectionTitle
        title="Vorschlag"
        subtitle={
          band
            ? `Erholungswert ${day.recovery.value} — ${band.label}`
            : 'Ohne Schicht kann die App diesen Tag nicht einschätzen'
        }
      />

      {planned.length === 0 ? (
        <Card tight>
          <div className="t-small secondary">
            {!day.recovery.known
              ? 'Keine Schicht eingetragen — dieser Tag wird nicht verplant.'
              : day.shape.trainingWindow
                ? 'Für diesen Tag ist bewusst keine Einheit vorgesehen.'
                : 'Dieser Tag hat kein Trainingsfenster.'}
          </div>
        </Card>
      ) : (
        <div className="col gap-2">
          {planned.map((unit) => (
            <UnitRow key={`${unit.kind}-${unit.start}`} unit={unit} onPlan={() => onPlan(unit)} top />
          ))}
        </div>
      )}

      {alternatives.length > 0 && (
        <Card tight>
          <Disclosure
            summary={
              <span className="row gap-2">
                <span className="t-label">Alternativen</span>
                <Pill>{alternatives.length}</Pill>
              </span>
            }
          >
            <div className="col gap-2">
              {alternatives.map((alt) => (
                <UnitRow
                  key={alt.kind}
                  unit={{
                    date: options.date,
                    kind: alt.kind,
                    start: alt.start,
                    durationMinutes: alt.durationMinutes,
                    load: CATALOGUE[alt.kind].load,
                    reasons: [],
                  }}
                  onPlan={() => planKind(alt.kind, alt.start, alt.durationMinutes)}
                />
              ))}
            </div>
          </Disclosure>
        </Card>
      )}

      {blocked.length > 0 && (
        <Card tight>
          <Disclosure
            summary={
              <span className="row gap-2">
                <span className="t-label">Nicht möglich</span>
                <Pill tone="bad">{blocked.length}</Pill>
              </span>
            }
          >
            <div className="col gap-2">
              {blocked.map((b) => (
                <div className="row gap-2 row-top" key={b.kind}>
                  <span style={{ fontSize: 14, opacity: 0.6 }}>
                    {SPORT_META[shapeOf(b.kind).sport].icon}
                  </span>
                  <div className="grow">
                    <div className="t-caption" style={{ fontWeight: 560 }}>
                      {CATALOGUE[b.kind].label}
                    </div>
                    <div className="t-caption bad">{b.blockedBy}</div>
                  </div>
                </div>
              ))}
            </div>
          </Disclosure>
        </Card>
      )}
    </>
  );
}

function UnitRow({
  unit,
  onPlan,
  top,
}: {
  unit: PlannedUnit;
  onPlan: () => void;
  top?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const spec = CATALOGUE[unit.kind];

  return (
    <div className={`reco ${top ? 'top' : ''}`}>
      <div className="reco-head">
        <button
          type="button"
          className="row gap-3 grow left"
          style={{ minWidth: 0 }}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <span style={{ fontSize: 17, lineHeight: 1, flex: 'none' }}>
            {SPORT_META[shapeOf(unit.kind).sport].icon}
          </span>
          <span className="grow" style={{ minWidth: 0 }}>
            <span className="reco-title truncate" style={{ display: 'block' }}>
              {spec.label}
            </span>
            <span className="reco-meta">
              {[formatDuration(unit.durationMinutes), spec.description, `ab ${formatClock(unit.start)}`].join(
                ' · ',
              )}
            </span>
          </span>
        </button>
        <button type="button" className="reco-add" onClick={onPlan} aria-label={`${spec.label} einplanen`}>
          <IconPlus size={16} />
        </button>
      </div>

      {open && (
        <div className="reco-body">
          {unit.downgradedFrom && (
            <div className="t-caption warn mb-2">
              Abgestuft von {CATALOGUE[unit.downgradedFrom].label}
            </div>
          )}
          {unit.reasons.length > 0 ? (
            unit.reasons.map((r, i) => (
              <div key={i} className="t-caption muted">
                · {r}
              </div>
            ))
          ) : (
            <div className="t-caption muted">
              Braucht Erholungswert {spec.minRecovery}, kostet {spec.load} Lastpunkte.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
