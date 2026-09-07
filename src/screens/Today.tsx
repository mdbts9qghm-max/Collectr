import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { TrainingSession } from '../domain/types.ts';
import { isoWeekNumber, nowTimestamp } from '../domain/date.ts';
import {
  SPORT_META,
  formatDateLong,
  formatDuration,
  formatHours,
  weekdayLong,
} from '../domain/format.ts';
import { READINESS_LEVEL_META } from '../domain/readiness.ts';
import type { PlannedUnit } from '../domain/cycle/types.ts';
import { CATALOGUE } from '../domain/cycle/catalogue.ts';
import { formatClock } from '../domain/cycle/windows.ts';
import { sessionFromUnit, shapeOf } from '../domain/cycle/toSession.ts';
import { statusOn } from '../domain/habits.ts';
import { summarise, tasksForDay } from '../domain/tasks.ts';
import { makeId } from '../domain/ids.ts';
import { useStore } from '../data/store.ts';
import { activeHabits, entriesFor } from '../data/derived.ts';
import { useCyclePlan, useData, useDayContext, useDayView, useIndexes, useToday } from '../app/hooks.ts';
import {
  Button,
  Card,
  Check,
  Disclosure,
  Pill,
  ProgressBar,
  ReasonList,
  SectionTitle,
} from '../ui/primitives.tsx';
import { Ring } from '../ui/charts.tsx';
import { IconChevronRight, IconPlus } from '../ui/icons.tsx';
import { ShiftSheet } from '../ui/ShiftSheet.tsx';
import { SessionSheet, emptySession } from '../ui/SessionSheet.tsx';
import { SessionRow } from '../ui/SessionRow.tsx';

/**
 * The daily screen.
 *
 * Deliberately narrow: what shift is it, what should I do, and where do I
 * stand. Everything numeric — score breakdowns, trends, records — lives under
 * Statistik. Anything that cannot be acted on today does not belong here.
 */
export function Today() {
  const today = useToday();
  const data = useData();
  const idx = useIndexes();
  const view = useDayView(today);
  const contextFor = useDayContext(today);
  const logHabit = useStore((s) => s.logHabit);
  const toggleTask = useStore((s) => s.toggleTask);
  const saveSession = useStore((s) => s.saveSession);
  const toast = useStore((s) => s.toast);

  const [shiftOpen, setShiftOpen] = useState(false);
  const [editing, setEditing] = useState<TrainingSession | null>(null);

  const habits = activeHabits(data);
  const tasks = tasksForDay(data.tasks, today, today);
  const taskSummary = summarise(data.tasks, today);

  const habitRows = habits.map((h) => {
    const entry = entriesFor(idx, h.id).get(today);
    return { habit: h, entry, status: statusOn(h, today, entry, contextFor(today)) };
  });
  const habitsCounted = habitRows.filter((h) => h.status !== 'skipped');
  const habitsDone = habitRows.filter((h) => h.status === 'complete').length;

  const readinessMeta = READINESS_LEVEL_META[view.readiness.level];
  // One cycle is enough: this card only ever speaks about today.
  const cyclePlan = useCyclePlan(today, 1);
  const cycleDay = cyclePlan.days.find((d) => d.shape.date === today) ?? null;
  const unit = cycleDay?.units[0] ?? null;
  const done = view.sessions.filter((s) => s.status === 'completed').length;

  const planUnit = (unit: PlannedUnit) => {
    const stamp = nowTimestamp();
    saveSession(sessionFromUnit(unit, { id: makeId('ses'), createdAt: stamp, updatedAt: stamp }));
    toast(`${CATALOGUE[unit.kind].label} eingeplant`, 'good');
  };

  return (
    <>
      {/* ---------- Wer bin ich, wann bin ich ---------- */}
      <div className="row between">
        <div>
          <div className="t-label">
            {weekdayLong(today)} · KW {isoWeekNumber(today)}
          </div>
          <h1 className="t-title mt-2">{formatDateLong(today)}</h1>
        </div>
        <button type="button" onClick={() => setShiftOpen(true)}>
          {view.shift.type ? (
            <span
              className="pill"
              style={{
                background: `color-mix(in srgb, ${view.shift.type.color} 20%, transparent)`,
                borderColor: 'transparent',
                color: 'var(--text)',
              }}
            >
              {view.shift.type.icon} {view.shift.type.label}
            </span>
          ) : (
            <Pill tone="warn">Schicht eintragen</Pill>
          )}
        </button>
      </div>

      {/*
        ---------- Die eine Antwort ----------
        From the cycle planner, the same source the training tab and the morning
        check-in read. There is one plan, so there is one answer.
      */}
      <Card hero accentEdge>
        <div className="row between">
          <span className="t-label">Heute</span>
          {cycleDay?.recovery.known && (
            <Pill
              tone={
                cycleDay.recovery.band === 'green'
                  ? 'good'
                  : cycleDay.recovery.band === 'amber'
                    ? 'warn'
                    : 'bad'
              }
            >
              Erholung {cycleDay.recovery.value}
            </Pill>
          )}
        </div>
        {unit ? (
          <>
            <div className="row gap-3 mt-3">
              <span style={{ fontSize: 32, lineHeight: 1 }}>
                {SPORT_META[shapeOf(unit.kind).sport].icon}
              </span>
              <div className="grow">
                <div className="t-title">{CATALOGUE[unit.kind].label}</div>
                <div className="t-small secondary mt-2">
                  {[
                    formatDuration(unit.durationMinutes),
                    CATALOGUE[unit.kind].description,
                    `ab ${formatClock(unit.start)}`,
                  ].join(' · ')}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <Disclosure summary={<span className="t-label">Warum?</span>}>
                <ReasonList
                  reasons={unit.reasons.map((text) => ({ text, impact: 'neutral' as const }))}
                />
              </Disclosure>
            </div>

            <div className="row gap-2 mt-4">
              <Button variant="primary" onClick={() => planUnit(unit)}>
                <IconPlus size={16} /> Einplanen
              </Button>
              <Link to="/training" className="btn btn-outline">
                Andere Optionen <IconChevronRight size={15} />
              </Link>
            </div>
          </>
        ) : (
          <div className="mt-3">
            <div className="t-title">
              {cycleDay?.recovery.known === false ? 'Keine Schicht eingetragen' : 'Ruhetag'}
            </div>
            <p className="t-small secondary mt-2">
              {cycleDay?.recovery.known === false
                ? 'Ohne Schicht weiß die App nicht, was der Tag mit deinem Schlaf macht — und plant ihn deshalb nicht.'
                : cycleDay?.shape.trainingWindow
                  ? 'Für heute ist bewusst keine Einheit vorgesehen.'
                  : 'Dieser Schichttag hat kein Trainingsfenster.'}
            </p>
            <div className="row gap-2 mt-4">
              <Link to="/training" className="btn btn-outline">
                Trotzdem etwas planen <IconChevronRight size={15} />
              </Link>
            </div>
          </div>
        )}
      </Card>

      {/* ---------- Plan passt nicht ---------- */}
      {view.recommendation.planReview && view.recommendation.planReview.verdict !== 'aligned' && (
        <Card
          tight
          style={{ background: 'var(--warn-soft)', borderColor: 'transparent' }}
        >
          <div className="row gap-3 row-top">
            <span style={{ fontSize: 17 }}>⚠️</span>
            <span className="t-small grow">{view.recommendation.planReview.message}</span>
          </div>
        </Card>
      )}

      {/* ---------- Wie es steht ---------- */}
      <Card>
        <div className="row gap-4">
          <Link to="/checkin" aria-label="Check-in öffnen">
            <Ring
              size={78}
              stroke={7}
              value={view.readiness.score ?? 0}
              color={
                view.readiness.level === 'ready'
                  ? 'var(--good)'
                  : view.readiness.level === 'moderate'
                    ? 'var(--warn)'
                    : view.readiness.level === 'recovery'
                      ? 'var(--bad)'
                      : 'var(--text-muted)'
              }
              label={view.readiness.score != null ? String(Math.round(view.readiness.score)) : '–'}
              sublabel="Readiness"
            />
          </Link>
          <div className="grow col gap-3">
            <div>
              <div className={`t-heading ${readinessMeta.tone === 'muted' ? 'muted' : readinessMeta.tone}`}>
                {readinessMeta.label}
              </div>
              <div className="t-caption muted">{readinessMeta.description}</div>
            </div>
            <StatusLine
              label="Schlaf"
              value={
                view.checkIn?.sleepHours != null
                  ? `${view.checkIn.sleepHours.toFixed(1)} h`
                  : 'offen'
              }
              progress={view.checkIn?.sleepHours ?? 0}
              max={data.settings.recovery.sleepHoursTarget}
              color="var(--sport-strength)"
            />
            <StatusLine
              label="Woche"
              value={`${formatHours(view.week.total.minutes / 60)} / ${formatHours(view.target.minutes / 60)}`}
              progress={view.week.total.minutes}
              max={view.target.minutes}
              color="var(--sport-run)"
            />
          </div>
        </div>

        {view.readiness.score == null && (
          <Link to="/checkin" className="btn btn-outline btn-block mt-4">
            Check-in nachholen
          </Link>
        )}
      </Card>

      {/* ---------- Training heute ---------- */}
      {view.sessions.length > 0 && (
        <>
          <SectionTitle
            title="Training heute"
            action={
              <Button size="sm" variant="ghost" onClick={() => setEditing(emptySession(today))}>
                <IconPlus size={15} />
              </Button>
            }
          />
          <Card flush>
            <div className="list">
              {view.sessions.map((session) => (
                <SessionRow key={session.id} session={session} onOpen={() => setEditing(session)} />
              ))}
            </div>
          </Card>
        </>
      )}

      {view.sessions.length === 0 && (
        <Button variant="ghost" block onClick={() => setEditing(emptySession(today))}>
          <IconPlus size={16} /> Einheit selbst eintragen
        </Button>
      )}

      {/* ---------- Habits ---------- */}
      {habits.length > 0 && (
        <>
          <SectionTitle
            title="Habits"
            action={
              <span className="t-caption muted t-num">
                {habitsDone} / {habitsCounted.length}
              </span>
            }
          />
          <Card flush>
            <div className="list dense">
              {habitRows.map(({ habit, entry, status }) => (
                <div className={`list-item ${status === 'skipped' ? 'done' : ''}`} key={habit.id}>
                  <Check
                    state={status === 'complete' ? 'checked' : status === 'partial' ? 'partial' : 'empty'}
                    label={habit.name}
                    onClick={() => {
                      const target = habit.target ?? 1;
                      logHabit(habit.id, today, (entry?.value ?? 0) >= target ? 0 : target);
                    }}
                  />
                  <span className="grow">
                    <span className="t-body truncate" style={{ display: 'block' }}>
                      {habit.icon} {habit.name}
                    </span>
                    {habit.kind === 'quantity' && status !== 'skipped' && (
                      <span className="t-caption muted t-num">
                        {(entry?.value ?? 0).toLocaleString('de-DE')} / {habit.target} {habit.unit}
                      </span>
                    )}
                  </span>
                  {status === 'skipped' && <Pill>frei</Pill>}
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {/* ---------- Aufgaben ---------- */}
      {tasks.length > 0 && (
        <>
          <SectionTitle
            title="Aufgaben"
            action={
              taskSummary.overdue > 0 ? (
                <Pill tone="bad">{taskSummary.overdue} überfällig</Pill>
              ) : (
                <Link to="/tasks" className="t-caption accent">
                  alle
                </Link>
              )
            }
          />
          <Card flush>
            <div className="list">
              {tasks.slice(0, 5).map((task) => (
                <div className="list-item" key={task.id}>
                  <Check round state="empty" label={task.title} onClick={() => toggleTask(task.id)} />
                  <span className="grow truncate">{task.title}</span>
                  {task.dueDate && task.dueDate < today && <Pill tone="bad">überfällig</Pill>}
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {done > 0 && (
        <div className="t-caption muted center" style={{ paddingBottom: 8 }}>
          {done} von {view.sessions.length} Einheiten erledigt
        </div>
      )}

      <ShiftSheet open={shiftOpen} date={today} onClose={() => setShiftOpen(false)} />
      <SessionSheet open={!!editing} session={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function StatusLine({
  label,
  value,
  progress,
  max,
  color,
}: {
  label: string;
  value: string;
  progress: number;
  max: number;
  color: string;
}) {
  return (
    <div>
      <div className="row between">
        <span className="t-caption secondary">{label}</span>
        <span className="t-caption t-num">{value}</span>
      </div>
      <div className="mt-2">
        <ProgressBar value={progress} max={max} color={color} thickness="thin" />
      </div>
    </div>
  );
}
