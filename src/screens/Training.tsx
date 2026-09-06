import { useState } from 'react';
import type { Recommendation, TrainingSession } from '../domain/types.ts';
import type { WeekDayCell } from '../data/derived.ts';
import { addDays, isoWeekNumber, nowTimestamp, startOfWeek } from '../domain/date.ts';
import {
  INTENSITY_META,
  SPORT_META,
  formatDateShort,
  formatDuration,
  formatHours,
  relativeDayLabel,
  weekdayShort,
} from '../domain/format.ts';
import { PHASE_META } from '../domain/phases.ts';
import { makeId } from '../domain/ids.ts';
import { useStore } from '../data/store.ts';
import { useData, useDayView, useToday, useWeek } from '../app/hooks.ts';
import {
  Button,
  Card,
  Disclosure,
  Pill,
  ReasonList,
  SectionTitle,
} from '../ui/primitives.tsx';
import { DistributionBar } from '../ui/charts.tsx';
import { IconChevronLeft, IconChevronRight, IconPlus } from '../ui/icons.tsx';
import { SessionSheet, emptySession } from '../ui/SessionSheet.tsx';
import { SessionRow } from '../ui/SessionRow.tsx';
import { ShiftSheet } from '../ui/ShiftSheet.tsx';
import { OutlookCard } from '../ui/OutlookCard.tsx';

/**
 * The week planner.
 *
 * Training is planned in weeks, not days: how much a Tuesday is worth only
 * makes sense next to the free Saturday. So the whole week is always on screen,
 * with one day selected. Recommendations sit underneath as compact rows —
 * expandable when the reasoning matters, out of the way when it does not.
 */
export function Training() {
  const today = useToday();
  const data = useData();
  const [selected, setSelected] = useState(today);
  const week = useWeek(selected);
  const view = useDayView(selected);
  const saveSession = useStore((s) => s.saveSession);
  const toast = useStore((s) => s.toast);

  const [editing, setEditing] = useState<TrainingSession | null>(null);
  const [shiftDate, setShiftDate] = useState<string | null>(null);

  const weekStart = startOfWeek(selected, data.settings.weekStartsOn);
  const target = view.target;

  const doneMinutes = week.reduce((sum, d) => sum + d.completedMinutes, 0);
  const plannedMinutes = week.reduce((sum, d) => sum + d.plannedMinutes, 0);
  // Only days with a shift contribute a known capacity; the rest are unknown,
  // not zero and not 2:30 h.
  const knownDays = week.filter((d) => d.shift);
  const capacityMinutes = knownDays.reduce((sum, d) => sum + d.capacityMinutes, 0);
  const missingShifts = week.length - knownDays.length;
  const sessionCount = week.reduce((sum, d) => sum + d.sessions.length, 0);

  const goWeek = (delta: number) => {
    const next = addDays(weekStart, delta * 7);
    // Keep the same weekday when moving between weeks.
    const offset = week.findIndex((d) => d.date === selected);
    setSelected(addDays(next, offset >= 0 ? offset : 0));
  };

  const plan = (rec: Recommendation) => {
    if (rec.template.isRest) {
      toast('Ruhetag braucht keinen Eintrag.', 'good');
      return;
    }
    saveSession({
      ...emptySession(selected, rec.template.sport),
      id: makeId('ses'),
      title: rec.template.title,
      plannedIntensity: rec.template.intensity,
      plannedDurationMin: rec.template.durationMin,
      plannedDistanceKm: rec.template.distanceKm,
      startTime: rec.suggestedStart,
      goal: rec.template.goal,
      muscleGroups: rec.template.muscleGroups,
      fromRecommendationId: rec.id,
      createdAt: nowTimestamp(),
      updatedAt: nowTimestamp(),
    });
    toast(`${rec.template.title} für ${relativeDayLabel(selected, today)} eingeplant`, 'good');
  };

  const sportDistribution = (Object.keys(view.week.bySport) as (keyof typeof view.week.bySport)[])
    .filter((s) => view.week.bySport[s].minutes > 0)
    .map((s) => ({
      label: SPORT_META[s].label,
      value: view.week.bySport[s].minutes,
      color: SPORT_META[s].color,
    }));

  return (
    <>
      {/* ---------- Week navigation ---------- */}
      <div className="row between">
        <Button variant="ghost" size="sm" onClick={() => goWeek(-1)} aria-label="Vorherige Woche">
          <IconChevronLeft size={18} />
        </Button>
        <button type="button" className="col center" onClick={() => setSelected(today)}>
          <div className="t-heading">KW {isoWeekNumber(weekStart)}</div>
          <div className="t-caption muted">
            {formatDateShort(weekStart)} – {formatDateShort(addDays(weekStart, 6))}
          </div>
        </button>
        <Button variant="ghost" size="sm" onClick={() => goWeek(1)} aria-label="Nächste Woche">
          <IconChevronRight size={18} />
        </Button>
      </div>

      {/* ---------- The week ---------- */}
      <Card tight>
        <div className="col gap-1">
          {week.map((day) => (
            <PlanDay
              key={day.date}
              day={day}
              selected={day.date === selected}
              onSelect={() => setSelected(day.date)}
            />
          ))}
        </div>

        <div className="divider mt-3" />

        <div className="row between">
          <span className="t-small secondary">
            {formatHours(doneMinutes / 60)} erledigt
            {plannedMinutes > 0 && ` · ${formatHours(plannedMinutes / 60)} geplant`}
          </span>
          <span className="t-small t-num muted">Ziel {formatHours(target.minutes / 60)}</span>
        </div>
        <div className="mt-2">
          <div className="plan-fill" style={{ height: 8 }}>
            <span
              style={{
                width: `${Math.min(100, (doneMinutes / Math.max(target.minutes, 1)) * 100)}%`,
                background: 'var(--accent)',
              }}
            />
            <span
              style={{
                width: `${Math.min(100 - (doneMinutes / Math.max(target.minutes, 1)) * 100, (plannedMinutes / Math.max(target.minutes, 1)) * 100)}%`,
                background: 'var(--info)',
              }}
            />
          </div>
        </div>
        <div className="row between mt-2 t-caption muted">
          <span>
            {sessionCount} {sessionCount === 1 ? 'Einheit' : 'Einheiten'}
            {missingShifts === 0
              ? ` · Kapazität ${formatHours(capacityMinutes / 60)}`
              : ` · ${missingShifts} ${missingShifts === 1 ? 'Tag' : 'Tage'} ohne Schicht`}
          </span>
          <span>
            {target.phase ? `${target.phase.label}` : 'keine Phase'}
            {target.deload ? ' · Deload' : ''}
          </span>
        </div>
      </Card>

      {/* ---------- Selected day ---------- */}
      <SectionTitle
        title={`${relativeDayLabel(selected, today)} · ${weekdayShort(selected)}, ${formatDateShort(selected)}`}
        action={
          <Button size="sm" variant="ghost" onClick={() => setEditing(emptySession(selected))}>
            <IconPlus size={15} /> Einheit
          </Button>
        }
      />

      <Card tight>
        <button
          type="button"
          className="row gap-3"
          style={{ width: '100%' }}
          onClick={() => setShiftDate(selected)}
        >
          {view.shift.type ? (
            <>
              <span
                className="icon-badge sm"
                style={{ background: `color-mix(in srgb, ${view.shift.type.color} 18%, transparent)` }}
              >
                {view.shift.type.icon}
              </span>
              <span className="grow left" style={{ minWidth: 0 }}>
                <span className="t-small" style={{ fontWeight: 600, display: 'block' }}>
                  {view.shift.type.label}
                </span>
                <span className="t-caption muted">{view.shift.type.training.note}</span>
              </span>
            </>
          ) : (
            <>
              <span className="icon-badge sm">📅</span>
              <span className="grow left t-small">Keine Schicht eingetragen</span>
            </>
          )}
          <Pill
            tone={
              view.shift.type?.training.rating === 'green'
                ? 'good'
                : view.shift.type?.training.rating === 'red'
                  ? 'bad'
                  : 'warn'
            }
          >
            {formatDuration(view.shift.availableMinutes)}
          </Pill>
        </button>

        {view.sessions.length > 0 && (
          <>
            <div className="divider mt-3" />
            <div className="list dense" style={{ margin: '0 calc(var(--s3) * -1)' }}>
              {view.sessions.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  showTime
                  onOpen={() => setEditing(session)}
                />
              ))}
            </div>
          </>
        )}
      </Card>

      {/* ---------- Recommendations, compact ---------- */}
      {view.recommendation.planReview && view.recommendation.planReview.verdict !== 'aligned' && (
        <Card tight style={{ background: 'var(--warn-soft)', borderColor: 'transparent' }}>
          <div className="row gap-3 row-top">
            <span style={{ fontSize: 15 }}>⚠️</span>
            <span className="t-small grow">{view.recommendation.planReview.message}</span>
          </div>
        </Card>
      )}

      <SectionTitle title="Vorschlag" subtitle={view.recommendation.focus} />
      <div className="col gap-2">
        {view.recommendation.recommended.map((rec) => (
          <CompactRecommendation key={rec.id} rec={rec} onPlan={plan} top />
        ))}
      </div>

      {view.recommendation.alternatives.length > 0 && (
        <Card tight>
          <Disclosure
            summary={
              <span className="row gap-2">
                <span className="t-label">Alternativen</span>
                <Pill>{view.recommendation.alternatives.length}</Pill>
              </span>
            }
          >
            <div className="col gap-2">
              {view.recommendation.alternatives.map((rec) => (
                <CompactRecommendation key={rec.id} rec={rec} onPlan={plan} />
              ))}
            </div>
          </Disclosure>
        </Card>
      )}

      {view.recommendation.notRecommended.length > 0 && (
        <Card tight>
          <Disclosure
            summary={
              <span className="row gap-2">
                <span className="t-label">Nicht empfohlen</span>
                <Pill tone="bad">{view.recommendation.notRecommended.length}</Pill>
              </span>
            }
          >
            <div className="col gap-2">
              {view.recommendation.notRecommended.map((rec) => (
                <div className="row gap-2 row-top" key={rec.id}>
                  <span style={{ fontSize: 14, opacity: 0.6 }}>
                    {SPORT_META[rec.template.sport].icon}
                  </span>
                  <div className="grow">
                    <div className="t-caption" style={{ fontWeight: 560 }}>
                      {rec.template.title}
                    </div>
                    <div className="t-caption bad">{rec.blockedBy}</div>
                  </div>
                </div>
              ))}
            </div>
          </Disclosure>
        </Card>
      )}

      {/* ---------- Week detail, folded away ---------- */}
      <Card tight>
        <Disclosure summary={<span className="t-label">Verteilung dieser Woche</span>}>
          <div className="mt-2">
            <div className="t-caption muted mb-2">Nach Sportart</div>
            <DistributionBar items={sportDistribution} formatValue={(v) => formatDuration(v)} />
            <div className="divider mt-4" />
            <div className="t-caption muted mb-2">Nach Intensität</div>
            <DistributionBar
              items={[
                { label: 'Locker (Z1–Z2)', value: view.week.byIntensity.easy, color: 'var(--zone-2)' },
                { label: 'Moderat (Z3)', value: view.week.byIntensity.moderate, color: 'var(--zone-3)' },
                { label: 'Intensiv (Z4–Z5)', value: view.week.byIntensity.hard, color: 'var(--zone-5)' },
              ]}
              formatValue={(v) => formatDuration(v)}
            />
            <div className="t-caption muted mt-3">
              Ziel dieser Phase: {Math.round(target.intensityDistribution.easy * 100)} % locker ·{' '}
              {Math.round(target.intensityDistribution.moderate * 100)} % moderat ·{' '}
              {Math.round(target.intensityDistribution.hard * 100)} % intensiv
            </div>
            {target.phase && (
              <div className="t-caption muted mt-3">
                {target.phase.notes ?? PHASE_META[target.phase.kind].description}
              </div>
            )}
          </div>
        </Disclosure>
      </Card>

      <Card tight>
        <Disclosure summary={<span className="t-label">Ausblick auf die nächsten Tage</span>}>
          <div className="mt-2">
            <OutlookCard outlook={view.outlook} sleepTarget={data.settings.recovery.sleepHoursTarget} bare />
          </div>
        </Disclosure>
      </Card>

      <Card tight>
        <Disclosure summary={<span className="t-label">Belastungsstatus</span>}>
          <div className="grid-3 mt-3">
            <div className="stat">
              <div className="stat-label">Fitness</div>
              <div className="stat-value sm t-num">{view.load.ctl}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Ermüdung</div>
              <div className="stat-value sm t-num">{view.load.atl}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Form</div>
              <div className={`stat-value sm t-num ${view.load.tsb > 0 ? 'good' : view.load.tsb < -15 ? 'bad' : ''}`}>
                {view.load.tsb > 0 ? '+' : ''}
                {view.load.tsb}
              </div>
            </div>
          </div>
          {view.load.acwr > 0 && (
            <div className="row between mt-3">
              <span className="t-small secondary">Akut : Chronisch</span>
              <Pill tone={view.load.acwr > data.settings.recovery.acwrCeiling ? 'bad' : 'good'}>
                {view.load.acwr.toFixed(2)}
              </Pill>
            </div>
          )}
        </Disclosure>
      </Card>

      <SessionSheet open={!!editing} session={editing} onClose={() => setEditing(null)} />
      {shiftDate && <ShiftSheet open date={shiftDate} onClose={() => setShiftDate(null)} />}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * One day in the week plan
 * ------------------------------------------------------------------ */

function PlanDay({
  day,
  selected,
  onSelect,
}: {
  day: WeekDayCell;
  selected: boolean;
  onSelect: () => void;
}) {
  const capacity = Math.max(day.capacityMinutes, 1);
  const donePct = Math.min(100, (day.completedMinutes / capacity) * 100);
  const plannedPct = Math.min(100 - donePct, (day.plannedMinutes / capacity) * 100);
  const noRoom = day.capacityMinutes < 25;
  const booked = day.completedMinutes + day.plannedMinutes;
  const hasShift = !!day.shift;

  // A day without a shift has no known capacity, and a day in the past has no
  // capacity left to offer. Neither should advertise free training time.
  const rightLabel = booked > 0
    ? formatDuration(booked)
    : !hasShift
      ? '–'
      : day.isPast || noRoom
        ? '–'
        : formatDuration(day.capacityMinutes);

  const emptyLabel = !hasShift
    ? 'Schicht eintragen'
    : day.isPast
      ? 'nichts erfasst'
      : noRoom
        ? 'kein Trainingsfenster'
        : 'offen';

  return (
    <button
      type="button"
      className={`plan-day ${selected ? 'selected' : ''} ${day.isToday ? 'today' : ''} ${day.isPast ? 'past' : ''}`}
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
    >
      <span className="plan-day-date">
        <span className="plan-day-dow">{weekdayShort(day.date)}</span>
        <span className="plan-day-num">{Number(day.date.slice(8))}.</span>
      </span>

      <span
        className="shift-tag"
        style={{
          background: day.shift
            ? `color-mix(in srgb, ${day.shift.color} 24%, transparent)`
            : 'var(--surface-3)',
          color: day.shift ? 'var(--text)' : 'var(--text-muted)',
          flex: 'none',
          minWidth: 22,
          textAlign: 'center',
        }}
      >
        {day.shift?.short ?? '?'}
      </span>

      <span className="plan-day-body">
        <span className="plan-chips">
          {day.sessions.length > 0 ? (
            day.sessions.map((s) => (
              <span key={s.id} className={`plan-chip ${s.status === 'completed' ? 'done' : ''}`}>
                {SPORT_META[s.sport].icon} {s.title}
              </span>
            ))
          ) : (
            <span className={`t-caption ${hasShift ? 'muted' : 'warn'}`}>{emptyLabel}</span>
          )}
        </span>
        {hasShift && (
          <span className="plan-fill">
            <span style={{ width: `${donePct}%`, background: 'var(--accent)' }} />
            <span style={{ width: `${plannedPct}%`, background: 'var(--info)' }} />
          </span>
        )}
      </span>

      <span className="plan-day-right">{rightLabel}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Compact, collapsed recommendation
 * ------------------------------------------------------------------ */

function CompactRecommendation({
  rec,
  onPlan,
  top,
}: {
  rec: Recommendation;
  onPlan: (rec: Recommendation) => void;
  top?: boolean;
}) {
  const [open, setOpen] = useState(false);

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
            {SPORT_META[rec.template.sport].icon}
          </span>
          <span className="grow" style={{ minWidth: 0 }}>
            <span className="reco-title truncate" style={{ display: 'block' }}>
              {rec.template.title}
            </span>
            <span className="reco-meta">
              {rec.template.isRest
                ? 'kein Training'
                : [
                    formatDuration(rec.template.durationMin),
                    rec.template.distanceKm ? `${rec.template.distanceKm.toFixed(1)} km` : null,
                    INTENSITY_META[rec.template.intensity].zone,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
            </span>
          </span>
        </button>
        {!rec.template.isRest && (
          <button
            type="button"
            className="reco-add"
            onClick={() => onPlan(rec)}
            aria-label={`${rec.template.title} einplanen`}
          >
            <IconPlus size={16} />
          </button>
        )}
      </div>
      {open && (
        <div className="reco-body">
          {rec.template.goal && <div className="t-caption muted mb-2">{rec.template.goal}</div>}
          <ReasonList reasons={rec.reasons.slice(0, 4)} />
        </div>
      )}
    </div>
  );
}
