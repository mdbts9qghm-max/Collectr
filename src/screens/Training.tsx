import { useMemo, useState } from 'react';
import type { TrainingSession } from '../domain/types.ts';
import type { PlannedUnit } from '../domain/cycle/types.ts';
import { CATALOGUE } from '../domain/cycle/catalogue.ts';
import type { WeekDayCell } from '../data/derived.ts';
import { addDays, isoWeekNumber, nowTimestamp, startOfWeek } from '../domain/date.ts';
import {
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
import { useCyclePlan, useData, useDayView, useToday, useWeek } from '../app/hooks.ts';
import {
  Button,
  Card,
  Disclosure,
  Pill,
  SectionTitle,
  Segmented,
} from '../ui/primitives.tsx';
import { DistributionBar } from '../ui/charts.tsx';
import { IconChevronLeft, IconChevronRight, IconPlus } from '../ui/icons.tsx';
import { SessionSheet, emptySession } from '../ui/SessionSheet.tsx';
import { SessionRow } from '../ui/SessionRow.tsx';
import { ShiftSheet } from '../ui/ShiftSheet.tsx';
import { OutlookCard } from '../ui/OutlookCard.tsx';
import { CycleView } from '../ui/CycleView.tsx';
import { shapeOf } from '../domain/cycle/toSession.ts';
import { DaySuggestion } from '../ui/DaySuggestion.tsx';
import { dayOptions } from '../domain/cycle/options.ts';
import { sessionFromUnit } from '../domain/cycle/toSession.ts';

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
  // 'cycle' is the shift rotation the planner works in, 'week' the calendar the
  // rest of the world runs on. Both are real; neither replaces the other.
  const [mode, setMode] = useState<'cycle' | 'week'>('cycle');
  const cyclePlan = useCyclePlan(selected, 3);
  const selectedOptions = useMemo(() => dayOptions(cyclePlan, selected), [cyclePlan, selected]);
  const suggestedByDate = useMemo(
    () => new Map(cyclePlan.days.map((d) => [d.shape.date, d.units])),
    [cyclePlan],
  );

  /** Turns a planned unit into a real session the athlete can log against. */
  const takeUnit = (unit: PlannedUnit) => {
    const stamp = nowTimestamp();
    saveSession(sessionFromUnit(unit, { id: makeId('ses'), createdAt: stamp, updatedAt: stamp }));
    toast(`${CATALOGUE[unit.kind].label} eingeplant`, 'good');
  };

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

      {/*
        A plan that has run out used to be indistinguishable from no plan at
        all — the app just carried on prescribing full weeks. Now it says so.
      */}
      {(target.status === 'ended' || target.status === 'none') && (
        <Card tight style={{ background: 'var(--warn-soft)', borderColor: 'transparent' }}>
          <div className="row gap-3 row-top">
            <span style={{ fontSize: 15 }}>🏁</span>
            <span className="t-small grow">
              {target.status === 'ended' ? (
                <>
                  Dein Plan ist ausgelaufen — seit {target.weeksPastPlan}{' '}
                  {target.weeksPastPlan === 1 ? 'Woche' : 'Wochen'}. Die App hält den Umfang auf
                  deinem Wochenziel und legt die Entlastungswoche weiter ein, aber ohne Phase gibt
                  es keinen Schwerpunkt mehr. Leg im Profil einen neuen Block an.
                </>
              ) : (
                <>Kein Trainingsplan aktiv. Ohne Phasen gibt es keinen Schwerpunkt und keine Periodisierung.</>
              )}
            </span>
          </div>
        </Card>
      )}

      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'cycle', label: 'Zyklus' },
          { value: 'week', label: 'Woche' },
        ]}
      />

      {/* ---------- The cycle, which is what the planner reasons in ---------- */}
      {mode === 'cycle' && (
        <CycleView
          plan={cyclePlan}
          today={today}
          selected={selected}
          onSelect={setSelected}
          onPlan={takeUnit}
        />
      )}

      {/* ---------- The week as a calendar ---------- */}
      {mode === 'week' && (
      <Card tight>
        <div className="cal-week">
          {week.map((day) => (
            <CalendarDay
              key={day.date}
              day={day}
              selected={day.date === selected}
              onSelect={() => setSelected(day.date)}
              suggested={suggestedByDate.get(day.date) ?? []}
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
          <div className="segmented-bar">
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
            {target.phase
              ? target.phase.label
              : target.status === 'ended'
                ? 'Plan ausgelaufen'
                : 'keine Phase'}
            {target.deload ? ' · Deload' : ''}
          </span>
        </div>
      </Card>
      )}

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

      {/*
        ---------- What to train on the selected day ----------
        One source for both modes. The week view and the cycle view used to be
        fed by two different engines and proposed two different sessions for the
        same day; now they render the same plan.
      */}
      {view.recommendation.planReview && view.recommendation.planReview.verdict !== 'aligned' && (
        <Card tight style={{ background: 'var(--warn-soft)', borderColor: 'transparent' }}>
          <div className="row gap-3 row-top">
            <span style={{ fontSize: 15 }}>⚠️</span>
            <span className="t-small grow">{view.recommendation.planReview.message}</span>
          </div>
        </Card>
      )}

      <DaySuggestion options={selectedOptions} onPlan={takeUnit} />

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

/** "45m" / "2:10" — short enough for a 50 px calendar column. */
function compactDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

function CalendarDay({
  day,
  selected,
  onSelect,
  suggested,
}: {
  day: WeekDayCell;
  selected: boolean;
  onSelect: () => void;
  /** What the cycle planner proposes for this day, shown when nothing is logged. */
  suggested: PlannedUnit[];
}) {
  const hasShift = !!day.shift;
  const noRoom = day.capacityMinutes < 25;

  // Block height follows duration, so the week's shape is readable at a glance:
  // a two-hour long run has to look bigger than a twenty-minute mobility block.
  const blockHeight = (minutes: number) => Math.round(Math.min(56, Math.max(20, minutes * 0.42)));

  return (
    <button
      type="button"
      className={[
        'cal-day',
        selected ? 'selected' : '',
        day.isToday ? 'today' : '',
        day.isPast ? 'past' : '',
        hasShift ? '' : 'unset',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      aria-label={`${weekdayShort(day.date)} ${formatDateShort(day.date)}${
        day.shift ? `, ${day.shift.label}` : ', keine Schicht'
      }`}
    >
      <span className="cal-dow">{weekdayShort(day.date)}</span>
      <span className="cal-num">{Number(day.date.slice(8))}</span>
      <span
        className="cal-shift"
        style={{
          background: day.shift
            ? `color-mix(in srgb, ${day.shift.color} 26%, transparent)`
            : 'transparent',
          color: day.shift ? 'var(--text)' : 'var(--text-muted)',
        }}
      >
        {day.shift?.short ?? '–'}
      </span>

      <span className="cal-blocks">
        {/*
          Sessions that exist, then what the cycle planner suggests for the days
          that have none. The calendar shows the same plan as the cycle view —
          two views of one thing, not two opinions.
        */}
        {day.sessions.map((session) => {
          const minutes =
            session.actualDurationMin ?? session.plannedDurationMin ?? 0;
          const color = SPORT_META[session.sport].color;
          return (
            <span
              key={session.id}
              className={`cal-block ${session.status === 'completed' ? 'done' : 'planned'}`}
              style={{
                height: blockHeight(minutes),
                background: `color-mix(in srgb, ${color} ${session.status === 'completed' ? 26 : 14}%, transparent)`,
                color,
              }}
              title={`${session.title} · ${formatDuration(minutes)}`}
            >
              <span className="cal-block-icon">{SPORT_META[session.sport].icon}</span>
              {minutes > 0 && (
                <span className="cal-block-time" style={{ color: 'var(--text-secondary)' }}>
                  {compactDuration(minutes)}
                </span>
              )}
            </span>
          );
        })}
        {day.sessions.length === 0 &&
          suggested.map((unit) => {
            const sport = shapeOf(unit.kind).sport;
            const color = SPORT_META[sport].color;
            return (
              <span
                key={`${unit.kind}-${unit.start}`}
                className="cal-block suggested"
                style={{
                  height: blockHeight(unit.durationMinutes),
                  borderColor: `color-mix(in srgb, ${color} 45%, transparent)`,
                  color,
                }}
                title={`Vorschlag: ${CATALOGUE[unit.kind].label} · ${formatDuration(unit.durationMinutes)}`}
              >
                <span className="cal-block-icon">{SPORT_META[sport].icon}</span>
                <span className="cal-block-time" style={{ color: 'var(--text-muted)' }}>
                  {compactDuration(unit.durationMinutes)}
                </span>
              </span>
            );
          })}
      </span>

      <span className="cal-free">
        {!hasShift
          ? 'Schicht?'
          : day.sessions.length > 0
            ? formatDuration(day.completedMinutes + day.plannedMinutes)
            : day.isPast
              ? '–'
              : noRoom
                ? '–'
                : formatDuration(day.freeMinutes)}
      </span>
    </button>
  );
}
