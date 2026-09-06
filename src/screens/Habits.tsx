import { useMemo, useState } from 'react';
import type { Habit, HabitCategory, HabitSchedule, RestDayPolicy } from '../domain/types.ts';
import { dateRange, lastNDays, nowTimestamp, startOfWeek } from '../domain/date.ts';
import { weekdayShortByIndex } from '../domain/format.ts';
import {
  computeStreak,
  dailyCompletionSeries,
  overallCompletion,
  progressPct,
  quotaFor,
  statusOn,
} from '../domain/habits.ts';
import { makeId } from '../domain/ids.ts';
import { activeHabits, entriesFor } from '../data/derived.ts';
import { useStore } from '../data/store.ts';
import { useData, useDayContext, useIndexes, useToday } from '../app/hooks.ts';
import {
  Button,
  Card,
  Check,
  Empty,
  Field,
  ProgressBar,
  SectionTitle,
  Segmented,
  Select,
  Sheet,
  Stepper,
  TextInput,
} from '../ui/primitives.tsx';
import { Heatmap, LineChart } from '../ui/charts.tsx';
import { IconFlame, IconPlus, IconTrash } from '../ui/icons.tsx';

const CATEGORY_LABELS: Record<HabitCategory, string> = {
  sleep: 'Schlaf',
  nutrition: 'Ernährung',
  training: 'Training',
  recovery: 'Regeneration',
  mind: 'Kopf',
  care: 'Pflege',
  other: 'Sonstiges',
};

export function Habits() {
  const today = useToday();
  const data = useData();
  const idx = useIndexes();
  const contextFor = useDayContext(today);
  const logHabit = useStore((s) => s.logHabit);
  const [editing, setEditing] = useState<Habit | null>(null);
  const [range, setRange] = useState<'week' | 'month'>('week');

  const habits = activeHabits(data);
  const weekDates = dateRange(startOfWeek(today, data.settings.weekStartsOn), today);
  const rangeDates = range === 'week' ? weekDates : lastNDays(today, 28);

  const overall = useMemo(
    () => overallCompletion(habits, (id) => entriesFor(idx, id), contextFor, rangeDates),
    [habits, idx, contextFor, rangeDates],
  );

  const trend = useMemo(
    () => dailyCompletionSeries(habits, (id) => entriesFor(idx, id), contextFor, lastNDays(today, 28)),
    [habits, idx, contextFor, today],
  );

  if (habits.length === 0) {
    return (
      <>
        <SectionTitle title="Habits" />
        <Card>
          <Empty
            icon="✅"
            title="Noch keine Habits"
            hint="Leg die Gewohnheiten an, die dein Training tragen — Schlaf, Protein, Mobility."
            action={
              <Button variant="primary" onClick={() => setEditing(newHabit(data.habits.length))}>
                <IconPlus size={16} /> Habit anlegen
              </Button>
            }
          />
        </Card>
        <HabitSheet habit={editing} onClose={() => setEditing(null)} />
      </>
    );
  }

  return (
    <>
      <div className="row between">
        <h1 className="t-title">Habits</h1>
        <Button size="sm" onClick={() => setEditing(newHabit(data.habits.length))}>
          <IconPlus size={15} /> Neu
        </Button>
      </div>

      <Segmented
        value={range}
        onChange={setRange}
        options={[
          { value: 'week', label: 'Diese Woche' },
          { value: 'month', label: '28 Tage' },
        ]}
      />

      <Card>
        <div className="row between">
          <div>
            <div className="stat-label">Erfüllung</div>
            <div className="stat-value lg t-num">{overall.pct} %</div>
            <div className="stat-sub">
              {overall.done} von {overall.opportunities} Gelegenheiten
            </div>
          </div>
          <div className="right">
            <div className="stat-label">Zeitraum</div>
            <div className="t-small secondary">
              {range === 'week' ? `${weekDates.length} Tage` : '28 Tage'}
            </div>
          </div>
        </div>
        <div className="mt-4">
          <LineChart
            height={92}
            min={0}
            max={100}
            series={[
              {
                points: trend.map((t) => t.pct),
                color: 'var(--accent)',
                label: 'Tägliche Erfüllung',
                fill: true,
              },
            ]}
            labels={[trend[0]?.date.slice(5) ?? '', today.slice(5)]}
            valueFormat={(v) => `${Math.round(v)} %`}
          />
        </div>
      </Card>

      <div className="col gap-3">
        {habits.map((habit) => {
          const entries = entriesFor(idx, habit.id);
          const entry = entries.get(today);
          const status = statusOn(habit, today, entry, contextFor(today));
          const streak = computeStreak(habit, entries, contextFor, today);
          const quota = quotaFor(habit, entries, contextFor, rangeDates);
          const value = entry?.value ?? 0;

          return (
            <Card key={habit.id} tight>
              <div className="row gap-3">
                <Check
                  state={status === 'complete' ? 'checked' : status === 'partial' ? 'partial' : 'empty'}
                  label={habit.name}
                  onClick={() => {
                    const target = habit.target ?? 1;
                    logHabit(habit.id, today, value >= target ? 0 : target);
                  }}
                />
                <button
                  type="button"
                  className="grow left"
                  onClick={() => setEditing(habit)}
                  style={{ minWidth: 0 }}
                >
                  <div className="row between gap-2">
                    <span className="t-body truncate" style={{ fontWeight: 570 }}>
                      {habit.icon} {habit.name}
                    </span>
                    {streak.current > 0 && (
                      <span className="row gap-1 t-caption" style={{ color: 'var(--warn)' }}>
                        <IconFlame size={13} /> {streak.current}
                      </span>
                    )}
                  </div>
                  <div className="t-caption muted mt-2">
                    {status === 'skipped'
                      ? 'Heute ausgesetzt — zählt nicht gegen dich'
                      : `${quota.done} / ${quota.required} · ${describeSchedule(habit.schedule)}`}
                  </div>
                </button>
              </div>

              {habit.kind === 'quantity' && status !== 'skipped' && (
                <>
                  <div className="row between mt-3">
                    <span className="t-caption muted t-num">
                      {value.toLocaleString('de-DE')} / {habit.target?.toLocaleString('de-DE')} {habit.unit}
                    </span>
                    <Stepper
                      value={value}
                      step={habit.step ?? 1}
                      min={0}
                      onChange={(v) => logHabit(habit.id, today, v)}
                      format={(v) => `${v.toLocaleString('de-DE')}${habit.unit ? ` ${habit.unit}` : ''}`}
                    />
                  </div>
                  <div className="mt-3">
                    <ProgressBar
                      value={progressPct(habit, entry)}
                      max={100}
                      color={habit.color}
                      thickness="thin"
                      marker={
                        habit.minimum && habit.target
                          ? (habit.minimum / habit.target) * 100
                          : undefined
                      }
                    />
                  </div>
                </>
              )}

              <div className="mt-3">
                <Heatmap
                  columns={28}
                  cellSize={8}
                  gap={2}
                  cells={lastNDays(today, 28).map((date) => {
                    const s = statusOn(habit, date, entries.get(date), contextFor(date));
                    return {
                      date,
                      title: `${date}: ${s}`,
                      intensity: s === 'complete' ? 1 : s === 'partial' ? 0.5 : s === 'skipped' ? 0.15 : 0,
                      color: habit.color,
                    };
                  })}
                />
              </div>
            </Card>
          );
        })}
      </div>

      <Card tight>
        <div className="row gap-3 row-top">
          <span style={{ fontSize: 17 }}>🛡️</span>
          <p className="t-caption muted grow">
            Streaks brechen nicht, wenn ein Habit an einem geplanten Ruhetag, an einer Tagschicht
            oder bei Krankheit ausgesetzt ist — je nach Regel, die du pro Habit einstellst. Ein
            Teilerfolg über dem Mindestwert hält die Serie ebenfalls am Leben.
          </p>
        </div>
      </Card>

      <HabitSheet habit={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function newHabit(order: number): Habit {
  return {
    id: makeId('habit'),
    name: '',
    icon: '⭐',
    category: 'other',
    kind: 'binary',
    direction: 'at_least',
    schedule: { type: 'daily' },
    restDayPolicy: 'always',
    color: 'var(--accent)',
    order: order + 1,
    archived: false,
    createdAt: nowTimestamp(),
  };
}

function describeSchedule(s: HabitSchedule): string {
  if (s.type === 'daily') return 'täglich';
  if (s.type === 'times_per_week') return `${s.count}× pro Woche`;
  return s.days.map(weekdayShortByIndex).join(', ');
}

/* ------------------------------------------------------------------ *
 * Editor
 * ------------------------------------------------------------------ */

function HabitSheet({ habit, onClose }: { habit: Habit | null; onClose: () => void }) {
  const saveHabit = useStore((s) => s.saveHabit);
  const deleteHabit = useStore((s) => s.deleteHabit);
  const toast = useStore((s) => s.toast);
  const [draft, setDraft] = useState<Habit | null>(habit);

  const current = draft && habit && draft.id === habit.id ? draft : habit;
  if (!current) return null;

  const patch = (p: Partial<Habit>) => setDraft({ ...current, ...p });

  return (
    <Sheet
      open
      onClose={onClose}
      title={habit?.name || 'Neuer Habit'}
      footer={
        <>
          {habit?.name && (
            <Button
              variant="danger"
              onClick={() => {
                deleteHabit(current.id);
                onClose();
                toast('Habit gelöscht');
              }}
              aria-label="Habit löschen"
            >
              <IconTrash size={17} />
            </Button>
          )}
          <Button
            variant="primary"
            block
            onClick={() => {
              if (!current.name.trim()) {
                toast('Der Habit braucht einen Namen', 'bad');
                return;
              }
              saveHabit(current);
              onClose();
              toast('Habit gespeichert', 'good');
            }}
          >
            Speichern
          </Button>
        </>
      }
    >
      <div className="row gap-3">
        <TextInput
          value={current.icon}
          onChange={(e) => patch({ icon: e.target.value.slice(0, 2) })}
          style={{ width: 62, textAlign: 'center', fontSize: 20 }}
          aria-label="Icon"
        />
        <div className="grow">
          <TextInput
            value={current.name}
            placeholder="Name des Habits"
            onChange={(e) => patch({ name: e.target.value })}
            aria-label="Name"
          />
        </div>
      </div>

      <Field label="Kategorie">
        <Select
          value={current.category}
          onChange={(e) => patch({ category: e.target.value as HabitCategory })}
          options={Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))}
        />
      </Field>

      <Field label="Art">
        <Segmented
          value={current.kind}
          onChange={(kind) =>
            patch({ kind, target: kind === 'quantity' ? (current.target ?? 1) : undefined })
          }
          options={[
            { value: 'binary', label: 'Erledigt / nicht' },
            { value: 'quantity', label: 'Mit Zielwert' },
          ]}
        />
      </Field>

      {current.kind === 'quantity' && (
        <>
          <div className="grid-2">
            <Field label="Zielwert">
              <TextInput
                type="number"
                inputMode="decimal"
                step="any"
                value={current.target ?? ''}
                onChange={(e) => patch({ target: Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label="Einheit">
              <TextInput
                value={current.unit ?? ''}
                placeholder="g, l, h, min"
                onChange={(e) => patch({ unit: e.target.value || undefined })}
              />
            </Field>
          </div>
          <div className="grid-2">
            <Field label="Mindestwert" hint="Hält die Streak am Leben.">
              <TextInput
                type="number"
                inputMode="decimal"
                step="any"
                value={current.minimum ?? ''}
                onChange={(e) => patch({ minimum: Number(e.target.value) || undefined })}
              />
            </Field>
            <Field label="Schrittweite">
              <TextInput
                type="number"
                inputMode="decimal"
                step="any"
                value={current.step ?? 1}
                onChange={(e) => patch({ step: Number(e.target.value) || 1 })}
              />
            </Field>
          </div>
        </>
      )}

      <Field label="Rhythmus">
        <Segmented
          value={current.schedule.type}
          onChange={(type) =>
            patch({
              schedule:
                type === 'daily'
                  ? { type: 'daily' }
                  : type === 'weekdays'
                    ? { type: 'weekdays', days: [1, 2, 3, 4, 5] }
                    : { type: 'times_per_week', count: 3 },
            })
          }
          options={[
            { value: 'daily', label: 'Täglich' },
            { value: 'weekdays', label: 'Wochentage' },
            { value: 'times_per_week', label: 'X / Woche' },
          ]}
        />
      </Field>

      {current.schedule.type === 'weekdays' && (
        <div className="chip-row">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => {
            const days = current.schedule.type === 'weekdays' ? current.schedule.days : [];
            return (
              <button
                key={d}
                type="button"
                className={`chip ${days.includes(d) ? 'active' : ''}`}
                onClick={() =>
                  patch({
                    schedule: {
                      type: 'weekdays',
                      days: days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort(),
                    },
                  })
                }
              >
                {weekdayShortByIndex(d)}
              </button>
            );
          })}
        </div>
      )}

      {current.schedule.type === 'times_per_week' && (
        <Field label="Wie oft pro Woche?">
          <Stepper
            value={current.schedule.count}
            min={1}
            max={7}
            onChange={(count) => patch({ schedule: { type: 'times_per_week', count } })}
          />
        </Field>
      )}

      <Field label="An welchen Tagen darf der Habit ausfallen?" hint="Ausgesetzte Tage brechen keine Streak.">
        <Select
          value={current.restDayPolicy}
          onChange={(e) => patch({ restDayPolicy: e.target.value as RestDayPolicy })}
          options={[
            { value: 'always', label: 'Nie aussetzen — gilt jeden Tag' },
            { value: 'skip_on_rest_day', label: 'An Ruhetagen aussetzen' },
            { value: 'skip_on_day_shift', label: 'An Tagschichten aussetzen' },
          ]}
        />
      </Field>

      {current.autoSource && (
        <Card tight>
          <p className="t-caption muted">
            Dieser Habit wird automatisch aus deinem Tages-Check-in gefüllt — du musst denselben Wert
            nicht zweimal eintragen.
          </p>
        </Card>
      )}
    </Sheet>
  );
}
