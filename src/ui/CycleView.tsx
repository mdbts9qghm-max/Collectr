import { useState } from 'react';
import type { ISODate } from '../domain/types.ts';
import type { CyclePlanView } from '../data/derived.ts';
import type { DayPlan, PlannedUnit } from '../domain/cycle/types.ts';
import { CATALOGUE } from '../domain/cycle/catalogue.ts';
import { ACWR_LOWER, ACWR_UPPER } from '../domain/cycle/acwr.ts';
import { CYCLE_DAY_META, formatClock } from '../domain/cycle/windows.ts';
import { RECOVERY_BAND_META } from '../domain/cycle/recovery.ts';
import { shapeOf } from '../domain/cycle/toSession.ts';
import { formatDateShort, SPORT_META, weekdayShort } from '../domain/format.ts';
import { Button, Card, Pill } from '../ui/primitives.tsx';
import { IconPlus } from '../ui/icons.tsx';

/**
 * The cycle, not the week.
 *
 * The shift rotation is five days long, so a calendar week cuts every cycle in
 * a different place and the same weekday means something different each time.
 * This view is therefore organised by cycle day, with the rolling seven-day
 * window shown separately — that window is what the load rules actually govern.
 */
export function CycleView({
  plan,
  today,
  onPlan,
  onSelect,
  selected,
}: {
  plan: CyclePlanView;
  today: ISODate;
  onPlan: (unit: PlannedUnit) => void;
  onSelect: (date: ISODate) => void;
  selected: ISODate;
}) {
  const { macrocycle, acwr } = plan;

  return (
    <>
      {/*
        The macrocycle, not a rolling week. The rotation is five days long, so a
        seven-day count cuts every cycle in a different place; ten days is the
        first span where the template's own arithmetic closes: 4 runs + 4
        strength sessions.
      */}
      <Card tight>
        <div className="row between">
          <span className="t-label">Makrozyklus · 2 Zyklen</span>
          <span className="t-small t-num">{macrocycle.load} Punkte</span>
        </div>
        <div className="row gap-4 mt-3">
          <Balance label="Läufe" value={macrocycle.runs} target={4} />
          <Balance label="Kraft" value={macrocycle.strengthSessions} target={4} />
          <Balance label="Ruhetage" value={macrocycle.restDays} target={2} />
        </div>
        <div className="row between mt-3 t-caption muted">
          <span>
            {formatDateShort(macrocycle.from)} – {formatDateShort(macrocycle.to)}
          </span>
          <span>Zone 2: {Math.round(macrocycle.zone2Share * 100)} % der Laufminuten</span>
        </div>
        {!macrocycle.complete && (
          <div className="t-caption muted mt-2">
            Noch kein vollständiger Makrozyklus im Zeitraum — die Bilanz ist unvollständig.
          </div>
        )}
      </Card>

      {/* Acute against chronic load, with the target band marked. */}
      <Card tight>
        <div className="row between">
          <span className="t-label">Belastungsverhältnis</span>
          <span
            className="t-small t-num"
            style={{
              color:
                acwr.band === 'ok'
                  ? 'var(--good)'
                  : acwr.band === 'unknown'
                    ? 'var(--text-muted)'
                    : 'var(--warn)',
            }}
          >
            {acwr.ratio != null ? acwr.ratio.toFixed(2) : 'unbekannt'}
          </span>
        </div>
        <AcwrCurve history={acwr.history} />
        <div className="row between mt-2 t-caption muted">
          <span>Zielband {ACWR_LOWER.toFixed(1)} – {ACWR_UPPER.toFixed(1)}</span>
          <span>7 Tage gegen 28 Tage</span>
        </div>
        {acwr.message && <div className="t-caption warn mt-2">{acwr.message}</div>}
        {acwr.band === 'unknown' && (
          <div className="t-caption muted mt-2">
            Noch zu wenig Historie — das Verhältnis wird erst ab zwei Wochen erfasster Tage berechnet.
          </div>
        )}
      </Card>

      {plan.warnings.map((warning) => (
        <Card key={warning} tight style={{ background: 'var(--warn-soft)', borderColor: 'transparent' }}>
          <div className="row gap-3 row-top">
            <span style={{ fontSize: 15 }}>⚠️</span>
            <span className="t-small grow">{warning}</span>
          </div>
        </Card>
      ))}

      {plan.cycles.map((cycle) => (
        <Card key={cycle.from} flush>
          <div className="row between" style={{ padding: 'var(--s3) var(--s3) 0' }}>
            <span className="row gap-2">
              <span className="t-label">Zyklus {cycle.type}</span>
              <Pill tone={cycle.isDeload ? 'warn' : undefined}>
                {cycle.isDeload ? 'Deload' : `${cycle.position} von 2`}
              </Pill>
            </span>
            <span className="t-caption muted t-num">{cycle.load} Punkte</span>
          </div>
          <div className="t-caption muted" style={{ padding: '4px var(--s3) 0' }}>
            {cycle.isDeload
              ? 'Jeder vierte Zyklus: Umfang halbiert, kein intensiver Lauf, Kraft moderat.'
              : cycle.type === 'A'
                ? 'Schlüsseleinheit an Tag 4: intensiver Lauf'
                : 'Schlüsseleinheit an Tag 4: langer Lauf'}
          </div>
          <div className="list">
            {cycle.days.map((day) => (
              <CycleDayRow
                key={day.shape.date}
                day={day}
                today={today}
                selected={day.shape.date === selected}
                onPlan={onPlan}
                onSelect={() => onSelect(day.shape.date)}
              />
            ))}
          </div>
        </Card>
      ))}
    </>
  );
}

function Balance({ label, value, target }: { label: string; value: number; target: number }) {
  const met = value === target;
  return (
    <div className="grow">
      <div className="t-caption muted">{label}</div>
      <div className="t-heading t-num" style={{ color: met ? 'var(--good)' : 'var(--text)' }}>
        {value}
        <span className="t-caption muted"> / {target}</span>
      </div>
    </div>
  );
}

/**
 * The ratio over the last four weeks with the target band drawn behind it.
 *
 * A single number says whether today is fine; the curve says whether the load
 * is drifting, which is the part worth acting on.
 */
function AcwrCurve({ history }: { history: { date: ISODate; ratio: number | null }[] }) {
  const points = history.filter((h) => h.ratio != null) as { date: ISODate; ratio: number }[];
  if (points.length < 2) {
    return <div className="acwr-empty t-caption muted">Kurve ab zwei Wochen Historie</div>;
  }

  const W = 300;
  const H = 56;
  const max = Math.max(1.6, ...points.map((p) => p.ratio));
  const min = Math.min(0.6, ...points.map((p) => p.ratio));
  const y = (v: number) => H - ((v - min) / (max - min)) * H;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.ratio).toFixed(1)}`).join(' ');

  return (
    <svg className="acwr-curve mt-2" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <rect
        x="0"
        y={y(ACWR_UPPER)}
        width={W}
        height={Math.max(1, y(ACWR_LOWER) - y(ACWR_UPPER))}
        fill="var(--good)"
        opacity="0.14"
      />
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function CycleDayRow({
  day,
  today,
  selected,
  onPlan,
  onSelect,
}: {
  day: DayPlan;
  today: ISODate;
  selected: boolean;
  onPlan: (unit: PlannedUnit) => void;
  onSelect: () => void;
}) {
  const [open, setOpen] = useState(false);
  const meta = day.shape.cycleDay ? CYCLE_DAY_META[day.shape.cycleDay] : null;
  // A day without a shift has no recovery value worth showing. Its number is a
  // placeholder the planner ignores, so the row stays grey and says so rather
  // than putting a confident green figure on a blank day.
  const known = day.recovery.known;
  const band = known
    ? RECOVERY_BAND_META[day.recovery.band]
    : { label: 'unbekannt', color: 'var(--text-muted)', advice: 'Trag die Schicht ein, dann plant die App diesen Tag mit.' };
  const isToday = day.shape.date === today;
  const isPast = day.shape.date < today;

  return (
    <div className={`cycle-day ${selected ? 'selected' : ''} ${isPast ? 'past' : ''}`}>
      <button
        type="button"
        className="cycle-day-head"
        onClick={() => {
          onSelect();
          setOpen((o) => !o);
        }}
        aria-expanded={open}
      >
        <span className="cycle-badge" style={{ borderColor: band.color, color: band.color }}>
          {day.shape.isVShift ? 'V' : (meta?.short ?? '–')}
        </span>

        <span className="grow left" style={{ minWidth: 0 }}>
          <span className="row gap-2">
            <span className="t-small" style={{ fontWeight: 620 }}>
              {weekdayShort(day.shape.date)}, {formatDateShort(day.shape.date)}
            </span>
            {isToday && <Pill tone="accent">heute</Pill>}
          </span>
          <span className="t-caption muted" style={{ display: 'block' }}>
            {day.shape.isVShift ? 'V-Schicht' : (meta?.label ?? 'keine Schicht')} ·{' '}
            <span style={{ color: band.color }}>
              {known ? `Erholung ${day.recovery.value}` : 'Erholung unbekannt'}
            </span>
          </span>
        </span>

        <span className="t-caption muted t-num">{day.load > 0 ? day.load : '–'}</span>
      </button>

      <div className="cycle-sleep">
        <span>😴</span>
        <span>
          {formatClock(day.shape.sleep.start)}–{formatClock(day.shape.sleep.end)}
          {day.shape.nap &&
            ` · Vorschlaf ${formatClock(day.shape.nap.start)}–${formatClock(day.shape.nap.end)}`}
        </span>
        <span className="grow" />
        <span>{Math.round((day.shape.sleep.targetMinutes / 60) * 10) / 10} h Ziel</span>
      </div>

      {day.units.map((unit) => (
        <div key={`${unit.date}-${unit.kind}-${unit.start}`} className="cycle-unit">
          <span style={{ fontSize: 16 }}>{SPORT_META[shapeOf(unit.kind).sport].icon}</span>
          <span className="grow" style={{ minWidth: 0 }}>
            <span className="t-small" style={{ fontWeight: 580, display: 'block' }}>
              {CATALOGUE[unit.kind].label}
            </span>
            <span className="t-caption muted">
              {formatClock(unit.start)}–{formatClock(unit.start + unit.durationMinutes)} ·{' '}
              {unit.durationMinutes} min
              {unit.downgradedFrom && ` · abgestuft von ${CATALOGUE[unit.downgradedFrom].label}`}
            </span>
          </span>
          {!isPast && (
            <Button size="sm" variant="ghost" onClick={() => onPlan(unit)} aria-label="Übernehmen">
              <IconPlus size={15} />
            </Button>
          )}
        </div>
      ))}

      {day.units.length === 0 && (
        <div className="cycle-unit muted t-caption">
          {!known
            ? 'Keine Schicht eingetragen — dieser Tag wird nicht verplant'
            : day.shape.trainingWindow
              ? 'Kein Training vorgesehen'
              : 'Kein Trainingsfenster'}
        </div>
      )}

      {day.violations.map((v) => (
        <div key={v.rule + v.date} className="cycle-warn t-caption">
          ⚠️ {v.message}
        </div>
      ))}

      {open && (
        <div className="cycle-explain">
          {meta && <div className="t-caption muted">{meta.purpose}</div>}
          <div className="t-caption mt-2">{band.advice}</div>
          {known && (
            <>
              <div className="divider mt-3 mb-3" />
              <div className="t-label mb-2">Erholungswert {day.recovery.value}</div>
              <div className="t-caption muted">Basis {day.recovery.base}</div>
            </>
          )}
          {known && day.recovery.adjustments.map((a) => (
            <div key={a.label} className="row between t-caption">
              <span className="muted">{a.label}</span>
              <span className={a.delta >= 0 ? 'good t-num' : 'bad t-num'}>
                {a.delta > 0 ? '+' : ''}
                {a.delta}
              </span>
            </div>
          ))}
          {day.units.length > 0 && (
            <>
              <div className="divider mt-3 mb-3" />
              <div className="t-label mb-2">Warum diese Einheit</div>
              {day.units.flatMap((u) => u.reasons).map((r, i) => (
                <div key={i} className="t-caption muted">
                  · {r}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
