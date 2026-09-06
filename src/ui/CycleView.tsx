import { useState } from 'react';
import type { ISODate } from '../domain/types.ts';
import type { CyclePlanView } from '../data/derived.ts';
import type { DayPlan, PlannedUnit } from '../domain/cycle/types.ts';
import { CATALOGUE } from '../domain/cycle/catalogue.ts';
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
  const cycles = groupByCycle(plan.days);

  return (
    <>
      <Card tight>
        <div className="row between">
          <span className="t-label">Rollierendes 7-Tage-Fenster</span>
          <span className="t-small t-num">
            {plan.window.load} / {plan.settings.weeklyLoadCap}
          </span>
        </div>
        <div className="segmented-bar mt-2">
          <span
            style={{
              width: `${Math.min(100, (plan.window.load / Math.max(plan.settings.weeklyLoadCap, 1)) * 100)}%`,
              background: plan.window.load > plan.settings.weeklyLoadCap ? 'var(--bad)' : 'var(--accent)',
            }}
          />
        </div>
        <div className="row between mt-2 t-caption muted">
          <span>
            {formatDateShort(plan.window.from)} – {formatDateShort(plan.window.to)} ·{' '}
            {plan.window.restDays} {plan.window.restDays === 1 ? 'Ruhetag' : 'Ruhetage'}
          </span>
          <span>
            {plan.window.previousLoad > 0
              ? `Vorfenster ${plan.window.previousLoad}`
              : 'Vorfenster unbekannt'}
          </span>
        </div>
        {plan.missing.length > 0 && (
          <div className="t-caption muted mt-2">
            Fehlt im Fenster: {plan.missing.map((k) => CATALOGUE[k].label).join(', ')}
          </div>
        )}
      </Card>

      {cycles.map((cycle) => (
        <Card key={cycle[0].shape.date} flush>
          <div className="row between" style={{ padding: 'var(--s3) var(--s3) 0' }}>
            <span className="t-label">
              Zyklus ab {formatDateShort(cycle[0].shape.date)}
            </span>
            <span className="t-caption muted t-num">
              {cycle.reduce((sum, d) => sum + d.load, 0)} Punkte
            </span>
          </div>
          <div className="list">
            {cycle.map((day) => (
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

function groupByCycle(days: DayPlan[]): DayPlan[][] {
  const out: DayPlan[][] = [];
  let current: DayPlan[] = [];
  for (const day of days) {
    if (day.shape.cycleDay === 1 && current.length > 0) {
      out.push(current);
      current = [];
    }
    current.push(day);
  }
  if (current.length) out.push(current);
  return out;
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
  const band = RECOVERY_BAND_META[day.recovery.band];
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
            {day.shape.isVShift ? 'V-Schicht' : (meta?.label ?? 'unbekannt')} ·{' '}
            <span style={{ color: band.color }}>Erholung {day.recovery.value}</span>
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
          {day.shape.trainingWindow ? 'Kein Training vorgesehen' : 'Kein Trainingsfenster'}
        </div>
      )}

      {day.violations.map((v) => (
        <div key={v.rule + v.date} className="cycle-warn t-caption">
          ⚠️ {v.message}
        </div>
      ))}

      {open && (
        <div className="cycle-explain">
          <div className="t-caption muted">{meta?.purpose}</div>
          <div className="t-caption mt-2">{band.advice}</div>
          <div className="divider mt-3 mb-3" />
          <div className="t-label mb-2">Erholungswert {day.recovery.value}</div>
          <div className="t-caption muted">Basis {day.recovery.base}</div>
          {day.recovery.adjustments.map((a) => (
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
