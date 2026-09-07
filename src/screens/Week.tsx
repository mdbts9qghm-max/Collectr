import { useState } from 'react';
import { addDays, isoWeekNumber, startOfWeek } from '../domain/date.ts';
import {
  SPORT_META,
  formatDateShort,
  formatDuration,
  formatHours,
  weekdayShort,
} from '../domain/format.ts';
import { PHASE_META, weekTarget } from '../domain/phases.ts';
import { activePlan } from '../data/derived.ts';
import { buildWeekSummary } from '../domain/review.ts';
import { useStore } from '../data/store.ts';
import { useData, useIndexes, useToday, useWeek } from '../app/hooks.ts';
import {
  Button,
  Card,
  Pill,
  ProgressBar,
  SectionTitle,
  TextArea,
} from '../ui/primitives.tsx';
import { BarChart } from '../ui/charts.tsx';
import { IconChevronLeft, IconChevronRight } from '../ui/icons.tsx';
import { ShiftSheet } from '../ui/ShiftSheet.tsx';
import { SessionSheet, emptySession } from '../ui/SessionSheet.tsx';
import type { TrainingSession } from '../domain/types.ts';

export function Week() {
  const today = useToday();
  const data = useData();
  const idx = useIndexes();
  const [anchor, setAnchor] = useState(startOfWeek(today, data.settings.weekStartsOn));
  const days = useWeek(anchor);
  const saveReview = useStore((s) => s.saveReview);
  const toast = useStore((s) => s.toast);

  const [shiftDate, setShiftDate] = useState<string | null>(null);
  const [editing, setEditing] = useState<TrainingSession | null>(null);
  const [selected, setSelected] = useState(today);

  const summary = buildWeekSummary(data, idx, anchor);
  const target = weekTarget(activePlan(data), anchor, data.settings.training.weeklyHoursTarget, data.settings.weekStartsOn);
  const review = data.reviews[anchor];
  const isPastWeek = addDays(anchor, 6) < today;

  const selectedDay = days.find((d) => d.date === selected) ?? days[0];

  return (
    <>
      <div className="row between">
        <Button variant="ghost" size="sm" onClick={() => setAnchor(addDays(anchor, -7))} aria-label="Vorherige Woche">
          <IconChevronLeft size={18} />
        </Button>
        <button
          type="button"
          className="col center"
          onClick={() => setAnchor(startOfWeek(today, data.settings.weekStartsOn))}
        >
          <div className="t-heading">KW {isoWeekNumber(anchor)}</div>
          <div className="t-caption muted">
            {formatDateShort(anchor)} – {formatDateShort(addDays(anchor, 6))}
          </div>
        </button>
        <Button variant="ghost" size="sm" onClick={() => setAnchor(addDays(anchor, 7))} aria-label="Nächste Woche">
          <IconChevronRight size={18} />
        </Button>
      </div>

      {/* ---------- Week grid ---------- */}
      <Card tight>
        <div className="week-strip">
          {days.map((day) => (
            <button
              key={day.date}
              type="button"
              className={`week-day ${day.isToday ? 'today' : ''} ${day.date === selected && !day.isToday ? 'selected' : ''}`}
              onClick={() => setSelected(day.date)}
            >
              <span className="week-day-dow">{weekdayShort(day.date)}</span>
              <span className="week-day-num">{Number(day.date.slice(8))}</span>
              {day.shift ? (
                <span
                  className="shift-tag"
                  style={{ background: `color-mix(in srgb, ${day.shift.color} 24%, transparent)` }}
                >
                  {day.shift.short}
                </span>
              ) : (
                <span className="shift-tag" style={{ background: 'var(--surface-3)', color: 'var(--text-muted)' }}>
                  ?
                </span>
              )}
              <span className="week-day-marks">
                {day.sessions.slice(0, 4).map((s) => (
                  <span
                    key={s.id}
                    className="week-day-mark"
                    style={{
                      background: SPORT_META[s.sport].color,
                      opacity: s.status === 'completed' ? 1 : 0.4,
                    }}
                  />
                ))}
              </span>
            </button>
          ))}
        </div>

        <div className="row between mt-4">
          <span className="t-small secondary">
            {formatHours(summary.totalMinutes / 60)} von {formatHours(target.minutes / 60)}
          </span>
          <span className="t-caption muted">
            {target.phase
              ? `${target.phase.label}-Phase`
              : target.status === 'ended'
                ? `Plan ausgelaufen · Woche ${target.weeksPastPlan} danach`
                : 'keine Phase'}
            {target.deload ? ' · Deload' : ''}
          </span>
        </div>
        <div className="mt-2">
          <ProgressBar value={summary.totalMinutes} max={target.minutes} thickness="thick" />
        </div>
      </Card>

      {/* ---------- Selected day ---------- */}
      {selectedDay && (
        <Card>
          <div className="row between">
            <div>
              <div className="t-heading">
                {weekdayShort(selectedDay.date)}, {formatDateShort(selectedDay.date)}
              </div>
              <div className="t-caption muted">
                {selectedDay.shift ? selectedDay.shift.label : 'keine Schicht eingetragen'}
              </div>
            </div>
            <Button size="sm" onClick={() => setShiftDate(selectedDay.date)}>
              Schicht
            </Button>
          </div>

          <div className="grid-3 mt-4">
            <div className="stat">
              <div className="stat-label">Schlaf</div>
              <div className="stat-value sm t-num">
                {selectedDay.sleepHours != null ? `${selectedDay.sleepHours.toFixed(1)} h` : '–'}
              </div>
            </div>
            <div className="stat">
              <div className="stat-label">Readiness</div>
              <div className="stat-value sm t-num">{selectedDay.readinessScore ?? '–'}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Habits</div>
              <div className="stat-value sm t-num">
                {selectedDay.habitPct != null ? `${selectedDay.habitPct} %` : '–'}
              </div>
            </div>
          </div>

          <div className="divider mt-4" />

          {selectedDay.sessions.length === 0 ? (
            <div className="row between">
              <span className="t-small muted">
                {selectedDay.shift && selectedDay.shift.training.maxMinutes < 30
                  ? 'Kein Trainingsfenster an diesem Tag.'
                  : 'Kein Training eingetragen.'}
              </span>
              <Button size="sm" variant="ghost" onClick={() => setEditing(emptySession(selectedDay.date))}>
                Hinzufügen
              </Button>
            </div>
          ) : (
            <div className="col gap-3">
              {selectedDay.sessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  className="row gap-3"
                  style={{ width: '100%', textAlign: 'left' }}
                  onClick={() => setEditing(session)}
                >
                  <span style={{ fontSize: 18 }}>{SPORT_META[session.sport].icon}</span>
                  <span className="grow truncate t-small">{session.title}</span>
                  <span className="t-caption muted">
                    {formatDuration(session.actualDurationMin ?? session.plannedDurationMin ?? 0)}
                  </span>
                  {session.status === 'completed' && <Pill tone="good">✓</Pill>}
                </button>
              ))}
              <Button size="sm" variant="ghost" onClick={() => setEditing(emptySession(selectedDay.date))}>
                Weitere Einheit
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* ---------- Daily load bars ---------- */}
      <SectionTitle title="Belastung pro Tag" />
      <Card>
        <BarChart
          height={110}
          data={days.map((d) => ({
            label: weekdayShort(d.date),
            value: d.completedMinutes,
            color: d.completedMinutes > 0 ? 'var(--accent)' : 'var(--surface-3)',
            highlight: d.isToday,
            segments:
              d.sessions.filter((s) => s.status === 'completed').length > 1
                ? d.sessions
                    .filter((s) => s.status === 'completed')
                    .map((s) => ({
                      value: s.actualDurationMin ?? s.plannedDurationMin ?? 0,
                      color: SPORT_META[s.sport].color,
                    }))
                : undefined,
          }))}
          target={target.minutes / 7}
          targetLabel="Ø Ziel"
          valueFormat={(v) => `${Math.round(v)}`}
        />
      </Card>

      {/* ---------- Weekly review ---------- */}
      <SectionTitle
        title="Wochenrückblick"
        subtitle={isPastWeek ? undefined : 'Wird am Ende der Woche aussagekräftig.'}
      />
      <Card>
        <div className="grid-2">
          <div className="stat">
            <div className="stat-label">Training</div>
            <div className="stat-value t-num">{formatHours(summary.totalMinutes / 60)}</div>
            <div className="stat-sub">
              {summary.sessions} Einheiten · Load {summary.load}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">Schlaf Ø</div>
            <div className="stat-value t-num">
              {summary.avgSleepHours != null ? `${summary.avgSleepHours.toFixed(1)} h` : '–'}
            </div>
            <div className="stat-sub">
              Readiness Ø {summary.avgReadiness ?? '–'} · Habits {summary.habitPct ?? '–'} %
            </div>
          </div>
        </div>

        {summary.bySport.length > 0 && (
          <div className="col gap-2 mt-4">
            {summary.bySport.map((b) => (
              <div className="row gap-2" key={b.sport}>
                <span className="dot" style={{ background: SPORT_META[b.sport].color }} />
                <span className="grow t-small">{SPORT_META[b.sport].label}</span>
                <span className="t-small t-num muted">
                  {formatDuration(b.minutes)}
                  {b.distanceKm > 0 ? ` · ${b.distanceKm.toFixed(1)} km` : ''}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="divider mt-4" />

        <div className="col gap-4">
          <div>
            <div className="t-label mb-2">Was lief gut</div>
            <ul className="reasons">
              {summary.wentWell.map((t, i) => (
                <li className="reason" key={i}>
                  <span className="reason-mark positive">+</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="t-label mb-2">Was besser werden sollte</div>
            <ul className="reasons">
              {summary.toImprove.map((t, i) => (
                <li className="reason" key={i}>
                  <span className="reason-mark negative">−</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="t-label mb-2">Empfehlung nächste Woche</div>
            <ul className="reasons">
              {summary.nextWeek.map((t, i) => (
                <li className="reason" key={i}>
                  <span className="reason-mark neutral">→</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="divider mt-4" />

        <div className="t-label mb-2">Deine Notiz</div>
        <TextArea
          defaultValue={review?.notes ?? ''}
          placeholder="Was hat diese Woche geprägt?"
          onBlur={(e) => {
            const notes = e.target.value;
            if (notes === (review?.notes ?? '')) return;
            saveReview({
              weekStart: anchor,
              notes,
              wentWell: review?.wentWell,
              toImprove: review?.toImprove,
              rating: review?.rating,
              createdAt: review?.createdAt ?? new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            toast('Notiz gespeichert', 'good');
          }}
        />
      </Card>

      {target.phase && (
        <Card tight>
          <div className="row gap-3 row-top">
            <span
              className="dot"
              style={{ background: PHASE_META[target.phase.kind].color, marginTop: 6 }}
            />
            <div className="grow">
              <div className="t-small" style={{ fontWeight: 570 }}>
                {target.phase.label}-Phase · Woche {target.weekIndex}
              </div>
              <div className="t-caption muted mt-2">{target.phase.notes ?? PHASE_META[target.phase.kind].description}</div>
              <div className="row gap-2 wrap mt-3">
                {target.phase.focus.map((f) => (
                  <Pill key={f}>{f}</Pill>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {shiftDate && <ShiftSheet open date={shiftDate} onClose={() => setShiftDate(null)} />}
      <SessionSheet open={!!editing} session={editing} onClose={() => setEditing(null)} />
    </>
  );
}
