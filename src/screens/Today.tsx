import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Recommendation, TrainingSession } from '../domain/types.ts';
import { addDays, isoWeekNumber, lastNDays, startOfWeek } from '../domain/date.ts';
import {
  INTENSITY_META,
  SPORT_META,
  formatDateLong,
  formatDuration,
  formatHours,
  weekdayLong,
} from '../domain/format.ts';
import { READINESS_LEVEL_META } from '../domain/readiness.ts';
import { PHASE_META } from '../domain/phases.ts';
import { buildInsights } from '../domain/insights.ts';
import { statusOn } from '../domain/habits.ts';
import { summarise, tasksForDay } from '../domain/tasks.ts';
import { nowTimestamp } from '../domain/date.ts';
import { makeId } from '../domain/ids.ts';
import { useStore } from '../data/store.ts';
import { activeHabits, entriesFor } from '../data/derived.ts';
import { useData, useDayContext, useDayView, useHybridScore, useIndexes, useToday } from '../app/hooks.ts';
import {
  Button,
  Card,
  Check,
  Disclosure,
  Empty,
  Pill,
  ProgressBar,
  ReasonList,
  SectionTitle,
} from '../ui/primitives.tsx';
import { Ring } from '../ui/charts.tsx';
import { IconChevronRight, IconPlus } from '../ui/icons.tsx';
import { CheckInSheet } from '../ui/CheckInSheet.tsx';
import { ShiftSheet } from '../ui/ShiftSheet.tsx';
import { SessionSheet, emptySession, sessionSubtitle } from '../ui/SessionSheet.tsx';

export function Today() {
  const today = useToday();
  const data = useData();
  const idx = useIndexes();
  const view = useDayView(today);
  const score = useHybridScore(today);
  const contextFor = useDayContext(today);
  const logHabit = useStore((s) => s.logHabit);
  const toggleTask = useStore((s) => s.toggleTask);
  const saveSession = useStore((s) => s.saveSession);
  const toast = useStore((s) => s.toast);

  const [checkInOpen, setCheckInOpen] = useState(false);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [editing, setEditing] = useState<TrainingSession | null>(null);

  // The hero card already carries today's recommendation, so it is dropped from
  // the notice list rather than shown twice on the same screen.
  const insights = useMemo(
    () =>
      buildInsights(data, idx, today).filter(
        (i) => i.id !== 'today-recommendation' && i.id !== 'today-rest',
      ),
    [data, idx, today],
  );
  const habits = activeHabits(data);
  const tasks = tasksForDay(data.tasks, today, today);
  const taskSummary = summarise(data.tasks, today);

  const habitStatuses = habits.map((h) => ({
    habit: h,
    entry: entriesFor(idx, h.id).get(today),
    status: statusOn(h, today, entriesFor(idx, h.id).get(today), contextFor(today)),
  }));
  const habitsDone = habitStatuses.filter((h) => h.status === 'complete').length;
  const habitsCounted = habitStatuses.filter((h) => h.status !== 'skipped').length;

  const readinessMeta = READINESS_LEVEL_META[view.readiness.level];
  const top = view.recommendation.recommended[0];

  const acceptRecommendation = (rec: Recommendation) => {
    if (rec.template.isRest) {
      toast('Ruhetag — nichts zu planen. Das ist die Einheit.', 'good');
      return;
    }
    const session: TrainingSession = {
      ...emptySession(today, rec.template.sport),
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
      id: makeId('ses'),
    };
    saveSession(session);
    toast(`${rec.template.title} für heute eingeplant`, 'good');
  };

  return (
    <>
      {/* ---------- Header ---------- */}
      <div className="col gap-1">
        <div className="row between">
          <div>
            <div className="t-label">
              {weekdayLong(today)} · KW {isoWeekNumber(today)}
            </div>
            <h1 className="t-title mt-2">{formatDateLong(today)}</h1>
          </div>
          <button type="button" onClick={() => setShiftOpen(true)} className="col gap-1" style={{ alignItems: 'flex-end' }}>
            {view.shift.type ? (
              <>
                <span
                  className="pill"
                  style={{
                    background: `color-mix(in srgb, ${view.shift.type.color} 18%, transparent)`,
                    borderColor: 'transparent',
                    color: 'var(--text)',
                  }}
                >
                  {view.shift.type.icon} {view.shift.type.label}
                </span>
                <span className="t-caption muted">
                  {view.shift.type.work
                    ? `${view.shift.type.work.start}–${view.shift.type.work.end}`
                    : 'frei'}
                </span>
              </>
            ) : (
              <Pill tone="warn">Schicht eintragen</Pill>
            )}
          </button>
        </div>
        {view.target.phase && (
          <div className="row gap-2 mt-2">
            <span
              className="pill"
              style={{
                background: `color-mix(in srgb, ${PHASE_META[view.target.phase.kind].color} 16%, transparent)`,
                borderColor: 'transparent',
              }}
            >
              {view.target.phase.label}-Phase · Woche {view.target.weekIndex}
            </span>
            {view.target.deload && <Pill tone="info">Deload</Pill>}
          </div>
        )}
      </div>

      {/* ---------- The answer ---------- */}
      <Card hero accentEdge>
        <div className="t-label">Heute</div>
        {top ? (
          <>
            <div className="row gap-3 mt-3">
              <span style={{ fontSize: 30, lineHeight: 1 }}>{SPORT_META[top.template.sport].icon}</span>
              <div className="grow">
                <div className="t-title">{top.template.title}</div>
                <div className="t-small secondary mt-2">
                  {top.template.isRest
                    ? 'Kein Training — bewusst.'
                    : [
                        formatDuration(top.template.durationMin),
                        top.template.distanceKm ? `≈ ${top.template.distanceKm.toFixed(1)} km` : null,
                        INTENSITY_META[top.template.intensity].zone,
                        top.suggestedStart ? `ab ${top.suggestedStart}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                </div>
              </div>
            </div>

            {top.template.goal && (
              <div className="t-small muted mt-3">Ziel: {top.template.goal}</div>
            )}

            <div className="mt-4">
              <Disclosure
                defaultOpen
                summary={<span className="t-label">Warum?</span>}
              >
                <ReasonList reasons={top.reasons} />
              </Disclosure>
            </div>

            <div className="row gap-2 mt-4">
              {!top.template.isRest && (
                <Button variant="primary" onClick={() => acceptRecommendation(top)}>
                  <IconPlus size={16} /> Einplanen
                </Button>
              )}
              <Link to="/training" className="btn btn-outline">
                Alle Optionen <IconChevronRight size={15} />
              </Link>
            </div>
          </>
        ) : (
          <div className="mt-3">
            <div className="t-title">Ruhetag</div>
            <p className="t-small secondary mt-2">
              Jede Trainingsoption ist heute durch Schicht, Erholung oder Belastung ausgeschlossen.
            </p>
          </div>
        )}

        <div className="divider mt-4" />
        <div className="row gap-2">
          <span className="t-label">Fokus</span>
          <span className="t-small grow right">{view.recommendation.focus}</span>
        </div>
      </Card>

      {/* ---------- Plan review ---------- */}
      {view.recommendation.planReview && (
        <Card
          tight
          style={{
            borderColor:
              view.recommendation.planReview.verdict === 'aligned' ? 'var(--good-soft)' : 'var(--warn-soft)',
            background:
              view.recommendation.planReview.verdict === 'aligned' ? 'var(--good-soft)' : 'var(--warn-soft)',
          }}
        >
          <div className="row gap-3 row-top">
            <span style={{ fontSize: 17 }}>
              {view.recommendation.planReview.verdict === 'aligned' ? '✓' : '⚠️'}
            </span>
            <span className="t-small grow">{view.recommendation.planReview.message}</span>
          </div>
        </Card>
      )}

      {/* ---------- Day status ---------- */}
      <div className="grid-2">
        <Card tight>
          <button type="button" className="row gap-3" style={{ width: '100%' }} onClick={() => setCheckInOpen(true)}>
            <Ring
              size={62}
              stroke={6}
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
            />
            <div className="grow left">
              <div className="stat-label">Readiness</div>
              <div className={`t-heading ${readinessMeta.tone === 'muted' ? 'muted' : readinessMeta.tone}`}>
                {readinessMeta.label}
              </div>
              <div className="t-caption muted">{readinessMeta.description}</div>
            </div>
          </button>
        </Card>

        <Card tight>
          <Link to="/analytics" className="row gap-3">
            <Ring
              size={62}
              stroke={6}
              value={score.total}
              color={score.provisional ? 'var(--text-muted)' : 'var(--accent)'}
              label={String(score.total)}
            />
            <div className="grow">
              <div className="stat-label">Hybrid Score</div>
              <div className="t-heading">
                {score.provisional ? 'vorläufig' : `${score.total} / 100`}
              </div>
              <div className="t-caption muted">
                {score.provisional
                  ? `Erst ${score.coverage} % Datenbasis`
                  : score.coverage < 80
                    ? `${score.coverage} % Datenbasis`
                    : 'Aufschlüsselung ansehen'}
              </div>
            </div>
          </Link>
        </Card>
      </div>

      <Card>
        <div className="row between mb-3">
          <span className="t-label">Tagesstatus</span>
          <Link to="/week" className="t-caption accent">
            Woche ansehen
          </Link>
        </div>
        <div className="col gap-4">
          <StatusRow
            label="Schlaf"
            value={
              view.checkIn?.sleepHours != null
                ? `${view.checkIn.sleepHours.toFixed(1)} h`
                : 'nicht erfasst'
            }
            progress={view.checkIn?.sleepHours ?? 0}
            max={data.settings.recovery.sleepHoursTarget}
            color="var(--sport-strength)"
            onClick={() => setCheckInOpen(true)}
          />
          <StatusRow
            label="Trainingsload (Woche)"
            value={`${view.week.total.load} · ${formatHours(view.week.total.minutes / 60)}`}
            progress={view.week.total.minutes}
            max={view.target.minutes}
            color="var(--sport-run)"
          />
          <StatusRow
            label="Habits"
            value={habitsCounted > 0 ? `${habitsDone} / ${habitsCounted}` : 'keine aktiven Habits'}
            progress={habitsDone}
            max={Math.max(1, habitsCounted)}
            color="var(--sport-swim)"
          />
          <StatusRow
            label="Aufgaben"
            value={
              taskSummary.open === 0
                ? 'alles erledigt'
                : `${taskSummary.dueToday} heute · ${taskSummary.overdue} überfällig`
            }
            progress={taskSummary.doneToday}
            max={Math.max(1, taskSummary.doneToday + taskSummary.dueToday)}
            color="var(--warn)"
          />
        </div>
      </Card>

      {/* ---------- Today's sessions ---------- */}
      <SectionTitle
        title="Training heute"
        action={
          <Button size="sm" variant="ghost" onClick={() => setEditing(emptySession(today))}>
            <IconPlus size={15} /> Neu
          </Button>
        }
      />
      {view.sessions.length === 0 ? (
        <Card>
          <Empty
            icon="🏃"
            title="Noch nichts geplant"
            hint={
              top && !top.template.isRest
                ? `Die Empfehlung oben lässt sich mit einem Tap übernehmen.`
                : 'Für heute ist ein Ruhetag die sinnvollste Entscheidung.'
            }
          />
        </Card>
      ) : (
        <Card flush>
          <div className="list">
            {view.sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                className={`list-item clickable ${session.status === 'skipped' ? 'done' : ''}`}
                onClick={() => setEditing(session)}
              >
                <span
                  className="icon-badge"
                  style={{ background: `color-mix(in srgb, ${SPORT_META[session.sport].color} 18%, transparent)` }}
                >
                  {SPORT_META[session.sport].icon}
                </span>
                <span className="grow">
                  <span className="t-body truncate" style={{ fontWeight: 570, display: 'block' }}>
                    {session.title}
                  </span>
                  <span className="t-caption muted">{sessionSubtitle(session)}</span>
                </span>
                {session.status === 'completed' ? (
                  <Pill tone="good">erledigt</Pill>
                ) : session.status === 'skipped' ? (
                  <Pill>ausgefallen</Pill>
                ) : (
                  <Pill tone="info">geplant</Pill>
                )}
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* ---------- Habits ---------- */}
      {habits.length > 0 && (
        <>
          <SectionTitle
            title="Habits heute"
            action={
              <Link to="/habits" className="t-caption accent">
                Alle
              </Link>
            }
          />
          <Card flush>
            <div className="list">
              {habitStatuses.slice(0, 6).map(({ habit, entry, status }) => (
                <div className={`list-item ${status === 'skipped' ? 'done' : ''}`} key={habit.id}>
                  <Check
                    state={status === 'complete' ? 'checked' : status === 'partial' ? 'partial' : 'empty'}
                    label={habit.name}
                    onClick={() => {
                      if (habit.kind === 'binary') {
                        logHabit(habit.id, today, (entry?.value ?? 0) >= 1 ? 0 : 1);
                      } else {
                        const target = habit.target ?? 1;
                        logHabit(habit.id, today, (entry?.value ?? 0) >= target ? 0 : target);
                      }
                    }}
                  />
                  <span className="grow">
                    <span className="t-body truncate" style={{ display: 'block' }}>
                      {habit.icon} {habit.name}
                    </span>
                    {habit.kind === 'quantity' && (
                      <span className="t-caption muted t-num">
                        {(entry?.value ?? 0).toLocaleString('de-DE')} / {habit.target} {habit.unit}
                      </span>
                    )}
                  </span>
                  {status === 'skipped' && <Pill>Ruhetag</Pill>}
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {/* ---------- Tasks ---------- */}
      {tasks.length > 0 && (
        <>
          <SectionTitle
            title="Aufgaben"
            action={
              <Link to="/tasks" className="t-caption accent">
                Alle
              </Link>
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

      {/* ---------- Insights ---------- */}
      {insights.length > 0 && (
        <>
          <SectionTitle title="Hinweise" />
          <div className="col gap-3">
            {insights.slice(0, 4).map((insight) => (
              <Card key={insight.id} tight>
                <div className="row gap-3 row-top">
                  <span style={{ fontSize: 19 }}>{insight.icon}</span>
                  <div className="grow">
                    <div className="t-body" style={{ fontWeight: 570 }}>
                      {insight.title}
                    </div>
                    <div className="t-small muted mt-2">{insight.body}</div>
                  </div>
                  {insight.action && (
                    <Link to={insight.action.to} className="btn btn-ghost btn-sm">
                      {insight.action.label}
                    </Link>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* ---------- Week preview ---------- */}
      <SectionTitle title="Nächste Tage" />
      <Card tight>
        <div className="col gap-3">
          {lastNDays(addDays(today, 4), 4)
            .filter((d) => d > today)
            .map((date) => {
              const shiftId = data.shifts[date]?.shiftTypeId;
              const type = shiftId ? idx.shiftTypes.get(shiftId) : null;
              const sessions = idx.sessionsByDate.get(date) ?? [];
              return (
                <div className="row gap-3" key={date}>
                  <span className="t-small muted" style={{ width: 76 }}>
                    {weekdayLong(date).slice(0, 2)}, {date.slice(8)}.{date.slice(5, 7)}.
                  </span>
                  {type ? (
                    <span className="shift-tag" style={{ background: `color-mix(in srgb, ${type.color} 20%, transparent)` }}>
                      {type.short}
                    </span>
                  ) : (
                    <span className="t-caption muted">–</span>
                  )}
                  <span className="grow t-small truncate">
                    {sessions.length > 0
                      ? sessions.map((s) => `${SPORT_META[s.sport].icon} ${s.title}`).join(', ')
                      : type
                        ? type.training.maxMinutes > 30
                          ? `${formatDuration(type.training.maxMinutes)} Fenster`
                          : 'kein Training'
                        : 'keine Schicht'}
                  </span>
                </div>
              );
            })}
        </div>
        <Link to="/week" className="btn btn-ghost btn-block mt-3">
          Ganze Woche <IconChevronRight size={15} />
        </Link>
      </Card>

      <div className="t-caption muted center" style={{ paddingBottom: 8 }}>
        Woche ab {startOfWeek(today, data.settings.weekStartsOn).slice(8)}.
        {startOfWeek(today, data.settings.weekStartsOn).slice(5, 7)}. · Ziel{' '}
        {formatHours(view.target.minutes / 60)}
      </div>

      <CheckInSheet open={checkInOpen} date={today} onClose={() => setCheckInOpen(false)} />
      <ShiftSheet open={shiftOpen} date={today} onClose={() => setShiftOpen(false)} />
      <SessionSheet open={!!editing} session={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function StatusRow({
  label,
  value,
  progress,
  max,
  color,
  onClick,
}: {
  label: string;
  value: string;
  progress: number;
  max: number;
  color: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className="row between">
        <span className="t-small secondary">{label}</span>
        <span className="t-small t-num">{value}</span>
      </div>
      <div className="mt-2">
        <ProgressBar value={progress} max={max} color={color} thickness="thin" />
      </div>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} style={{ width: '100%', textAlign: 'left' }}>
        {content}
      </button>
    );
  }
  return <div>{content}</div>;
}
