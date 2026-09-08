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
import type { TodayDecision } from '../domain/coach/coach.ts';
import { CATALOGUE } from '../domain/coach/catalogue.ts';
import { formatClock } from '../domain/coach/windows.ts';
import { sessionFromDecision, sessionFromStrength, shapeOf } from '../domain/coach/toSession.ts';
import { RECOVERY_BAND_META } from '../domain/coach/recovery.ts';
import { statusOn } from '../domain/habits.ts';
import { summarise, tasksForDay } from '../domain/tasks.ts';
import { makeId } from '../domain/ids.ts';
import { useStore } from '../data/store.ts';
import { activeHabits, entriesFor } from '../data/derived.ts';
import { useCoach, useData, useDayContext, useDayView, useIndexes, useToday } from '../app/hooks.ts';
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
  const done = view.sessions.filter((x) => x.status === 'completed').length;

  /*
   * Dieselbe Quelle wie der Coach-Tab. Es gibt einen Plan, also gibt es eine
   * Antwort — zwei Bildschirme, die verschiedene Einheiten vorschlagen, sind
   * genau der Fehler, den diese Karte einmal hatte.
   */
  const coach = useCoach(today);
  const decision = coach.today;
  const coachDay = coach.timeline.days.find((d) => d.date === today) ?? null;
  const recoveryBand: 'red' | 'amber' | 'green' =
    decision.verdict === 'ruhe' ? 'red' : decision.verdict === 'reduziert' ? 'amber' : 'green';

  const planToday = (d: TodayDecision) => {
    const stamp = nowTimestamp();
    const run = sessionFromDecision(d, { id: makeId('ses'), createdAt: stamp, updatedAt: stamp });
    if (run) saveSession(run);
    if (d.strength?.kind) {
      const strength = sessionFromStrength(today, d.strength, {
        id: makeId('ses'),
        createdAt: stamp,
        updatedAt: stamp,
      });
      if (strength) saveSession(strength);
    }
    if (run) toast(`${CATALOGUE[d.kind].label} eingeplant`, 'good');
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
          {coachDay && coachDay.cycleDay != null && (
            <Pill tone={recoveryBand === 'green' ? 'good' : recoveryBand === 'amber' ? 'warn' : 'bad'}>
              Erholung {coachDay.recovery}
            </Pill>
          )}
        </div>
        {decision.kind !== 'ruhe' ? (
          <>
            <div className="row gap-3 mt-3">
              <span style={{ fontSize: 32, lineHeight: 1 }}>
                {SPORT_META[shapeOf(decision.kind).sport].icon}
              </span>
              <div className="grow">
                <div className="t-title">{CATALOGUE[decision.kind].label}</div>
                <div className="t-small secondary mt-2">
                  {[
                    formatDuration(decision.minutes),
                    decision.zoneLabel,
                    decision.startMinutes != null ? `ab ${formatClock(decision.startMinutes)}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
            </div>

            {decision.stepsDown > 0 && (
              <div className="t-caption mt-3" style={{ color: 'var(--warn)' }}>
                {RECOVERY_BAND_META.amber.advice}
              </div>
            )}

            <div className="mt-4">
              <Disclosure summary={<span className="t-label">Warum?</span>}>
                <ReasonList
                  reasons={decision.reasons.map((r) => ({
                    text: `${r.title}: ${r.detail}`,
                    impact:
                      r.effect === 'sperrt'
                        ? ('negative' as const)
                        : r.effect === 'stuft ab' || r.effect === 'begrenzt'
                          ? ('negative' as const)
                          : ('neutral' as const),
                  }))}
                />
              </Disclosure>
            </div>

            <div className="row gap-2 mt-4">
              <Button variant="primary" onClick={() => planToday(decision)}>
                <IconPlus size={16} /> Einplanen
              </Button>
              <Link to="/training" className="btn btn-outline">
                Zum Coach <IconChevronRight size={15} />
              </Link>
            </div>
          </>
        ) : (
          <div className="mt-3">
            <div className="t-title">{decision.headline}</div>
            <p className="t-small secondary mt-2">
              {coachDay?.cycleDay == null
                ? 'Ohne Schicht weiß die App nicht, was der Tag mit deinem Schlaf macht — und plant ihn deshalb nicht.'
                : decision.steps[0]}
            </p>
            <div className="row gap-2 mt-4">
              <Link to="/training" className="btn btn-outline">
                Zum Coach <IconChevronRight size={15} />
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
