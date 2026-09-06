import { useMemo, useState } from 'react';
import type { Task, TaskCategory, TaskPriority, TaskRecurrence } from '../domain/types.ts';
import { TASK_CATEGORIES } from '../domain/types.ts';
import { addDays, nowTimestamp } from '../domain/date.ts';
import { formatDateShort, relativeDayLabel, weekdayShortByIndex } from '../domain/format.ts';
import {
  CATEGORY_META,
  PRIORITY_META,
  compareTasks,
  describeRecurrence,
  dueLabel,
  summarise,
} from '../domain/tasks.ts';
import { makeId } from '../domain/ids.ts';
import { useStore } from '../data/store.ts';
import { useData, useToday } from '../app/hooks.ts';
import {
  Button,
  Card,
  Check,
  Empty,
  Field,
  Pill,
  SectionTitle,
  Segmented,
  Select,
  Sheet,
  TextArea,
  TextInput,
} from '../ui/primitives.tsx';
import { IconPlus, IconTrash } from '../ui/icons.tsx';

type Filter = 'open' | 'today' | 'done';

export function Tasks() {
  const today = useToday();
  const data = useData();
  const toggleTask = useStore((s) => s.toggleTask);
  const [filter, setFilter] = useState<Filter>('open');
  const [category, setCategory] = useState<TaskCategory | 'all'>('all');
  const [editing, setEditing] = useState<Task | null>(null);

  const summary = summarise(data.tasks, today);

  const visible = useMemo(() => {
    let list = data.tasks.slice();
    if (filter === 'done') list = list.filter((t) => t.status === 'done');
    else if (filter === 'today')
      list = list.filter(
        (t) => t.status === 'open' && (t.dueDate === today || (t.dueDate != null && t.dueDate < today)),
      );
    else list = list.filter((t) => t.status === 'open');

    if (category !== 'all') list = list.filter((t) => t.category === category);
    return list.sort((a, b) =>
      filter === 'done'
        ? (b.completedAt ?? '').localeCompare(a.completedAt ?? '')
        : compareTasks(a, b),
    );
  }, [data.tasks, filter, category, today]);

  const grouped = useMemo(() => groupByDue(visible, today), [visible, today]);

  return (
    <>
      <div className="row between">
        <h1 className="t-title">Aufgaben</h1>
        <Button size="sm" onClick={() => setEditing(newTask(today, data.tasks.length))}>
          <IconPlus size={15} /> Neu
        </Button>
      </div>

      <div className="grid-3">
        <Card tight>
          <div className="stat-label">Offen</div>
          <div className="stat-value sm t-num">{summary.open}</div>
        </Card>
        <Card tight>
          <div className="stat-label">Heute</div>
          <div className="stat-value sm t-num">{summary.dueToday}</div>
        </Card>
        <Card tight>
          <div className="stat-label">Überfällig</div>
          <div className={`stat-value sm t-num ${summary.overdue > 0 ? 'bad' : ''}`}>{summary.overdue}</div>
        </Card>
      </div>

      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'open', label: 'Offen' },
          { value: 'today', label: 'Heute' },
          { value: 'done', label: 'Erledigt' },
        ]}
      />

      <div className="chip-row">
        <button
          type="button"
          className={`chip ${category === 'all' ? 'active' : ''}`}
          onClick={() => setCategory('all')}
        >
          Alle
        </button>
        {TASK_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className={`chip ${category === c ? 'active' : ''}`}
            onClick={() => setCategory(c)}
          >
            {CATEGORY_META[c].icon} {CATEGORY_META[c].label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <Card>
          <Empty
            icon={filter === 'done' ? '📦' : '🎉'}
            title={filter === 'done' ? 'Noch nichts erledigt' : 'Keine offenen Aufgaben'}
            hint={filter === 'done' ? undefined : 'Alles abgearbeitet — oder noch nichts angelegt.'}
          />
        </Card>
      ) : (
        grouped.map(([label, tasks]) => (
          <div key={label}>
            <SectionTitle title={label} />
            <Card flush>
              <div className="list">
                {tasks.map((task) => {
                  const due = dueLabel(task, today);
                  return (
                    <div className={`list-item ${task.status === 'done' ? 'done' : ''}`} key={task.id}>
                      <Check
                        round
                        state={task.status === 'done' ? 'checked' : 'empty'}
                        label={task.title}
                        onClick={() => toggleTask(task.id)}
                      />
                      <button
                        type="button"
                        className="grow left"
                        onClick={() => setEditing(task)}
                        style={{ minWidth: 0 }}
                      >
                        <span className="row gap-2">
                          <span
                            className="dot"
                            style={{ background: PRIORITY_META[task.priority].color }}
                            aria-label={PRIORITY_META[task.priority].label}
                          />
                          <span
                            className="t-body truncate"
                            style={{ textDecoration: task.status === 'done' ? 'line-through' : undefined }}
                          >
                            {task.title}
                          </span>
                        </span>
                        <span className="t-caption muted mt-2" style={{ display: 'block' }}>
                          {CATEGORY_META[task.category].icon} {CATEGORY_META[task.category].label}
                          {task.recurrence.type !== 'none' && ` · ${describeRecurrence(task.recurrence)}`}
                          {task.effortMin ? ` · ${task.effortMin} min` : ''}
                        </span>
                      </button>
                      {task.status === 'open' && task.dueDate && (
                        <Pill tone={due.tone === 'bad' ? 'bad' : due.tone === 'warn' ? 'warn' : 'default'}>
                          {due.text}
                        </Pill>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        ))
      )}

      <TaskSheet task={editing} onClose={() => setEditing(null)} />

      <button
        type="button"
        className="fab"
        onClick={() => setEditing(newTask(today, data.tasks.length))}
        aria-label="Neue Aufgabe"
      >
        <IconPlus size={24} />
      </button>
    </>
  );
}

function groupByDue(tasks: Task[], today: string): [string, Task[]][] {
  const groups = new Map<string, Task[]>();
  for (const task of tasks) {
    let key: string;
    if (task.status === 'done') key = 'Erledigt';
    else if (!task.dueDate) key = 'Ohne Datum';
    else if (task.dueDate < today) key = 'Überfällig';
    else if (task.dueDate === today) key = 'Heute';
    else if (task.dueDate <= addDays(today, 7)) key = relativeDayLabel(task.dueDate, today);
    else key = formatDateShort(task.dueDate);
    groups.set(key, [...(groups.get(key) ?? []), task]);
  }
  const order = ['Überfällig', 'Heute', 'Morgen', 'Übermorgen'];
  return [...groups.entries()].sort(([a], [b]) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    if (a === 'Ohne Datum') return 1;
    if (b === 'Ohne Datum') return -1;
    return a.localeCompare(b);
  });
}

function newTask(today: string, order: number): Task {
  return {
    id: makeId('task'),
    title: '',
    priority: 'normal',
    category: 'private',
    recurrence: { type: 'none' },
    status: 'open',
    dueDate: today,
    createdAt: nowTimestamp(),
    order: order + 1,
  };
}

/* ------------------------------------------------------------------ *
 * Editor
 * ------------------------------------------------------------------ */

function TaskSheet({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const saveTask = useStore((s) => s.saveTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const habits = useStore((s) => s.habits);
  const shiftTypes = useStore((s) => s.shiftTypes);
  const toast = useStore((s) => s.toast);
  const [draft, setDraft] = useState<Task | null>(task);

  const current = draft && task && draft.id === task.id ? draft : task;
  if (!current) return null;
  const patch = (p: Partial<Task>) => setDraft({ ...current, ...p });

  return (
    <Sheet
      open
      onClose={onClose}
      title={task?.title || 'Neue Aufgabe'}
      footer={
        <>
          {task?.title && (
            <Button
              variant="danger"
              onClick={() => {
                deleteTask(current.id);
                onClose();
                toast('Aufgabe gelöscht');
              }}
              aria-label="Aufgabe löschen"
            >
              <IconTrash size={17} />
            </Button>
          )}
          <Button
            variant="primary"
            block
            onClick={() => {
              if (!current.title.trim()) {
                toast('Die Aufgabe braucht einen Titel', 'bad');
                return;
              }
              saveTask(current);
              onClose();
              toast('Aufgabe gespeichert', 'good');
            }}
          >
            Speichern
          </Button>
        </>
      }
    >
      <Field label="Titel">
        <TextInput
          value={current.title}
          placeholder="Was ist zu tun?"
          onChange={(e) => patch({ title: e.target.value })}
          autoFocus={!task?.title}
        />
      </Field>

      <Field label="Priorität">
        <Segmented
          value={current.priority}
          onChange={(priority: TaskPriority) => patch({ priority })}
          options={[
            { value: 'high', label: '🔴 Wichtig' },
            { value: 'normal', label: '🟡 Normal' },
            { value: 'low', label: '🟢 Niedrig' },
          ]}
        />
      </Field>

      <Field label="Kategorie">
        <div className="chip-row">
          {TASK_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              className={`chip ${current.category === c ? 'active' : ''}`}
              onClick={() => patch({ category: c })}
            >
              {CATEGORY_META[c].icon} {CATEGORY_META[c].label}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid-2">
        <Field label="Fällig am">
          <TextInput
            type="date"
            value={current.dueDate ?? ''}
            onChange={(e) => patch({ dueDate: e.target.value || undefined })}
          />
        </Field>
        <Field label="Uhrzeit">
          <TextInput
            type="time"
            value={current.dueTime ?? ''}
            onChange={(e) => patch({ dueTime: e.target.value || undefined })}
          />
        </Field>
      </div>

      <Field label="Wiederholung">
        <Select
          value={current.recurrence.type}
          onChange={(e) => {
            const type = e.target.value as TaskRecurrence['type'];
            patch({
              recurrence:
                type === 'none'
                  ? { type: 'none' }
                  : type === 'daily'
                    ? { type: 'daily', interval: 1 }
                    : type === 'weekly'
                      ? { type: 'weekly', days: [1] }
                      : type === 'monthly'
                        ? { type: 'monthly', day: 1 }
                        : { type: 'shift', shiftTypeId: shiftTypes[0]?.id ?? '' },
            });
          }}
          options={[
            { value: 'none', label: 'Einmalig' },
            { value: 'daily', label: 'Täglich' },
            { value: 'weekly', label: 'Wöchentlich' },
            { value: 'monthly', label: 'Monatlich' },
            { value: 'shift', label: 'Bei jeder bestimmten Schicht' },
          ]}
        />
      </Field>

      {current.recurrence.type === 'weekly' && (
        <div className="chip-row">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => {
            const days = current.recurrence.type === 'weekly' ? current.recurrence.days : [];
            return (
              <button
                key={d}
                type="button"
                className={`chip ${days.includes(d) ? 'active' : ''}`}
                onClick={() =>
                  patch({
                    recurrence: {
                      type: 'weekly',
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

      {current.recurrence.type === 'shift' && (
        <Field label="Nach welcher Schicht?">
          <Select
            value={current.recurrence.shiftTypeId}
            onChange={(e) => patch({ recurrence: { type: 'shift', shiftTypeId: e.target.value } })}
            options={shiftTypes.map((t) => ({ value: t.id, label: t.label }))}
          />
        </Field>
      )}

      <div className="grid-2">
        <Field label="Aufwand">
          <TextInput
            type="number"
            inputMode="numeric"
            suffix="min"
            value={current.effortMin ?? ''}
            onChange={(e) => patch({ effortMin: Number(e.target.value) || undefined })}
          />
        </Field>
        <Field label="Habit verknüpfen">
          <Select
            value={current.habitId ?? ''}
            onChange={(e) => patch({ habitId: e.target.value || undefined })}
            options={[
              { value: '', label: 'Keiner' },
              ...habits.filter((h) => !h.archived).map((h) => ({ value: h.id, label: h.name })),
            ]}
          />
        </Field>
      </div>

      <Field label="Beschreibung">
        <TextArea
          value={current.notes ?? ''}
          onChange={(e) => patch({ notes: e.target.value || undefined })}
        />
      </Field>
    </Sheet>
  );
}
