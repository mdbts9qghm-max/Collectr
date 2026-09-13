import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { TrainingSession } from '../domain/types.ts';
import { isoWeekNumber } from '../domain/date.ts';
import {
  formatDateLong,
  formatDuration,
  formatHours,
  weekdayLong,
} from '../domain/format.ts';
import { READINESS_LEVEL_META } from '../domain/readiness.ts';
import { formatClock, vShiftWindows, windowsFor } from '../domain/windows.ts';
import { statusOn } from '../domain/habits.ts';
import { useStore } from '../data/store.ts';
import { activeHabits, entriesFor } from '../data/derived.ts';
import { useData, useDayContext, useDayView, useIndexes, useRecovery, useToday } from '../app/hooks.ts';
import {
  Button,
  Card,
  Check,
  Pill,
  ProgressBar,
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

  const [shiftOpen, setShiftOpen] = useState(false);
  const [editing, setEditing] = useState<TrainingSession | null>(null);

  const habits = activeHabits(data);

  const habitRows = habits.map((h) => {
    const entry = entriesFor(idx, h.id).get(today);
    return { habit: h, entry, status: statusOn(h, today, entry, contextFor(today)) };
  });
  const habitsCounted = habitRows.filter((h) => h.status !== 'skipped');
  const habitsDone = habitRows.filter((h) => h.status === 'complete').length;

  const readinessMeta = READINESS_LEVEL_META[view.readiness.level];
  const done = view.sessions.filter((x) => x.status === 'completed').length;

  /*
   * Die Erholung misst, sie plant nicht. Was heute trainiert wird, steht in
   * den Einheiten, die eingetragen sind — nirgends sonst.
   */
  const recovery = useRecovery(today);
  const cycleDayToday = view.cycleDay;
  const windows =
    view.shift.type && cycleDayToday != null
      ? view.isVShift
        ? vShiftWindows()
        : windowsFor(cycleDayToday, data.settings.planner.dayShiftWakeMinutes)
      : null;

  const plannedToday = view.sessions.filter((x) => x.status === 'planned');
  const plannedMinutes = plannedToday.reduce((sum, x) => sum + (x.plannedDurationMin ?? 0), 0);

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
        ---------- Wie der Tag dasteht ----------
        Kein Vorschlag mehr. Die Karte sagt, was der Tag hergibt — Schicht,
        Fenster, Erholung — und was du dafür eingetragen hast. Entschieden wird
        von dir.
      */}
      <Card hero accentEdge>
        <div className="row between">
          <span className="t-label">Heute</span>
          {cycleDayToday != null && (
            <Pill
              tone={
                recovery.band === 'green' ? 'good' : recovery.band === 'amber' ? 'warn' : 'bad'
              }
            >
              Erholung {recovery.value}
            </Pill>
          )}
        </div>

        {view.shift.type ? (
          <>
            <div className="t-title mt-3">
              {view.shift.type.icon} {view.shift.type.label}
            </div>
            <div className="t-small secondary mt-2">
              {[
                view.shift.type.work
                  ? `Dienst ${view.shift.type.work.start}–${view.shift.type.work.end}`
                  : 'kein Dienst',
                windows?.trainingWindow
                  ? `Fenster ${formatClock(windows.trainingWindow.start)}–${formatClock(windows.trainingWindow.end)}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
            {recovery.blocked && recovery.blockedReason && (
              <div className="t-caption mt-2" style={{ color: 'var(--bad)' }}>
                {recovery.blockedReason}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="t-title mt-3">Keine Schicht eingetragen</div>
            <p className="t-small secondary mt-2">
              Ohne Schicht weiß die App nicht, wie viel Zeit der Tag hat und was er mit deinem
              Schlaf macht.
            </p>
            <Button variant="primary" className="mt-3" onClick={() => setShiftOpen(true)}>
              Schicht eintragen
            </Button>
          </>
        )}

        {view.shift.type && (
          <div className="row gap-2 mt-4">
            <Button variant="primary" onClick={() => setEditing(emptySession(today))}>
              <IconPlus size={16} /> Einheit eintragen
            </Button>
            <Link to="/training" className="btn btn-outline">
              Zur Woche <IconChevronRight size={15} />
            </Link>
          </div>
        )}

        {plannedToday.length > 0 && (
          <div className="t-caption muted mt-3">
            {plannedToday.length === 1 ? 'Eine Einheit' : `${plannedToday.length} Einheiten`} geplant
            {plannedMinutes > 0 ? ` · ${formatDuration(plannedMinutes)}` : ''}.
          </div>
        )}
      </Card>

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
