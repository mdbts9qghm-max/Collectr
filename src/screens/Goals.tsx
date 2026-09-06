import { useState } from 'react';
import type { Goal, MetricKey, SportKey } from '../domain/types.ts';
import { TRACKED_METRICS } from '../domain/types.ts';
import { nowTimestamp } from '../domain/date.ts';
import { formatMetric, SPORT_META } from '../domain/format.ts';
import { METRIC_META } from '../domain/metrics.ts';
import { generateMilestones, goalProgress, goalStatusText } from '../domain/goals.ts';
import { makeId } from '../domain/ids.ts';
import { useStore } from '../data/store.ts';
import { useData, useMetrics, useToday } from '../app/hooks.ts';
import {
  Button,
  Card,
  Empty,
  Field,
  Pill,
  ProgressBar,
  SectionTitle,
  Select,
  Sheet,
  Switch,
  TextArea,
  TextInput,
} from '../ui/primitives.tsx';
import { IconPlus, IconTrash } from '../ui/icons.tsx';

export function Goals() {
  const today = useToday();
  const data = useData();
  const metrics = useMetrics(today);
  const [editing, setEditing] = useState<Goal | null>(null);

  const active = data.goals.filter((g) => g.active);
  const inactive = data.goals.filter((g) => !g.active);

  return (
    <>
      <div className="row between">
        <h1 className="t-title">Ziele</h1>
        <Button size="sm" onClick={() => setEditing(newGoal())}>
          <IconPlus size={15} /> Neu
        </Button>
      </div>

      {active.length === 0 ? (
        <Card>
          <Empty
            icon="🎯"
            title="Noch keine Ziele"
            hint="Ziele steuern nicht nur die Anzeige — ein als primär markiertes Ziel gewichtet die Trainingsempfehlung."
            action={
              <Button variant="primary" onClick={() => setEditing(newGoal())}>
                <IconPlus size={16} /> Ziel anlegen
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="col gap-3">
          {active.map((goal) => {
            const p = goalProgress(goal, metrics, today);
            const status = goalStatusText(p);
            return (
              <Card key={goal.id} accentEdge={goal.primary}>
                <button
                  type="button"
                  className="col left gap-2"
                  style={{ width: '100%' }}
                  onClick={() => setEditing(goal)}
                >
                  <div className="row between gap-3" style={{ width: '100%' }}>
                    <span className="t-heading truncate">{goal.title}</span>
                    <Pill tone={status.tone === 'good' ? 'good' : status.tone === 'bad' ? 'bad' : status.tone === 'warn' ? 'warn' : 'default'}>
                      {status.text}
                    </Pill>
                  </div>
                  <div className="t-small muted">{p.detail}</div>
                </button>

                <div className="mt-3">
                  <ProgressBar
                    value={p.pct}
                    max={100}
                    color={goal.sport ? SPORT_META[goal.sport].color : 'var(--accent)'}
                    thickness="thick"
                    marker={p.expectedPct ?? undefined}
                  />
                </div>

                <div className="row between mt-2 t-caption muted">
                  <span>{Math.round(p.pct)} % erreicht</span>
                  {p.daysLeft != null && (
                    <span>{p.daysLeft > 0 ? `noch ${p.daysLeft} Tage` : 'Zieldatum erreicht'}</span>
                  )}
                </div>

                {goal.milestones.length > 0 && (
                  <div className="row gap-2 wrap mt-3">
                    {goal.milestones.map((m) => {
                      const reached =
                        p.current != null &&
                        (goal.direction === 'increase' ? p.current >= m.value : p.current <= m.value);
                      return (
                        <Pill key={m.id} tone={reached ? 'good' : 'default'}>
                          {reached ? '✓ ' : ''}
                          {m.label}
                        </Pill>
                      );
                    })}
                  </div>
                )}

                {goal.primary && (
                  <div className="t-caption accent mt-3">
                    Primärziel — beeinflusst die tägliche Trainingsempfehlung
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {inactive.length > 0 && (
        <>
          <SectionTitle title="Archiviert" />
          <Card flush>
            <div className="list">
              {inactive.map((goal) => (
                <button
                  key={goal.id}
                  type="button"
                  className="list-item clickable done"
                  onClick={() => setEditing(goal)}
                >
                  <span className="grow t-small">{goal.title}</span>
                </button>
              ))}
            </div>
          </Card>
        </>
      )}

      <GoalSheet goal={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function newGoal(): Goal {
  return {
    id: makeId('goal'),
    title: '',
    metric: 'run_longest_km',
    unit: 'km',
    startValue: 0,
    targetValue: 10,
    direction: 'increase',
    milestones: [],
    primary: false,
    active: true,
    createdAt: nowTimestamp(),
  };
}

function GoalSheet({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const saveGoal = useStore((s) => s.saveGoal);
  const deleteGoal = useStore((s) => s.deleteGoal);
  const goals = useStore((s) => s.goals);
  const toast = useStore((s) => s.toast);
  const [draft, setDraft] = useState<Goal | null>(goal);

  const current = draft && goal && draft.id === goal.id ? draft : goal;
  if (!current) return null;
  const patch = (p: Partial<Goal>) => setDraft({ ...current, ...p });
  const meta = METRIC_META[current.metric as string];

  return (
    <Sheet
      open
      onClose={onClose}
      title={goal?.title || 'Neues Ziel'}
      footer={
        <>
          {goal?.title && (
            <Button
              variant="danger"
              onClick={() => {
                deleteGoal(current.id);
                onClose();
                toast('Ziel gelöscht');
              }}
              aria-label="Ziel löschen"
            >
              <IconTrash size={17} />
            </Button>
          )}
          <Button
            variant="primary"
            block
            onClick={() => {
              if (!current.title.trim()) {
                toast('Das Ziel braucht einen Titel', 'bad');
                return;
              }
              // Only one goal steers the engine at a time.
              if (current.primary) {
                for (const g of goals) {
                  if (g.id !== current.id && g.primary) saveGoal({ ...g, primary: false });
                }
              }
              saveGoal(current);
              onClose();
              toast('Ziel gespeichert', 'good');
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
          placeholder="z. B. 100 km Ultra finishen"
          onChange={(e) => patch({ title: e.target.value })}
        />
      </Field>

      <Field label="Kennzahl" hint="Nur Kennzahlen, die die App aus deinen Daten berechnen kann.">
        <Select
          value={current.metric as string}
          onChange={(e) => {
            const metric = e.target.value as MetricKey;
            const m = METRIC_META[metric];
            patch({
              metric,
              unit: m?.unit ?? '',
              direction: m?.betterIsLower ? 'decrease' : 'increase',
            });
          }}
          options={TRACKED_METRICS.map((m) => ({ value: m, label: METRIC_META[m].label }))}
        />
      </Field>

      <div className="grid-2">
        <Field label="Startwert" hint={meta?.betterIsLower ? 'In Sekunden' : undefined}>
          <TextInput
            type="number"
            inputMode="decimal"
            step="any"
            value={current.startValue}
            onChange={(e) => patch({ startValue: Number(e.target.value) || 0 })}
          />
        </Field>
        <Field label="Zielwert">
          <TextInput
            type="number"
            inputMode="decimal"
            step="any"
            value={current.targetValue}
            onChange={(e) => patch({ targetValue: Number(e.target.value) || 0 })}
          />
        </Field>
      </div>

      <div className="t-caption muted">
        {formatMetric(current.metric as string, current.startValue)} →{' '}
        {formatMetric(current.metric as string, current.targetValue)}
      </div>

      <Field label="Zieldatum">
        <TextInput
          type="date"
          value={current.targetDate ?? ''}
          onChange={(e) => patch({ targetDate: e.target.value || undefined })}
        />
      </Field>

      <Field label="Sportart">
        <Select
          value={current.sport ?? ''}
          onChange={(e) => patch({ sport: (e.target.value || undefined) as SportKey | undefined })}
          options={[
            { value: '', label: 'Keine' },
            ...(Object.keys(SPORT_META) as SportKey[]).map((s) => ({
              value: s,
              label: SPORT_META[s].label,
            })),
          ]}
        />
      </Field>

      <div className="row between">
        <div className="grow">
          <div className="t-body" style={{ fontWeight: 560 }}>
            Primärziel
          </div>
          <div className="t-caption muted mt-2">
            Gewichtet die Sportart in der täglichen Empfehlung. Nur eines möglich.
          </div>
        </div>
        <Switch checked={current.primary} onChange={(primary) => patch({ primary })} label="Primärziel" />
      </div>

      <div className="row between">
        <div className="grow">
          <div className="t-body" style={{ fontWeight: 560 }}>
            Aktiv
          </div>
          <div className="t-caption muted mt-2">Archivierte Ziele bleiben erhalten, zählen aber nicht mehr.</div>
        </div>
        <Switch checked={current.active} onChange={(active) => patch({ active })} label="Aktiv" />
      </div>

      <div className="row between">
        <span className="field-label">Zwischenziele ({current.milestones.length})</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            patch({
              milestones: generateMilestones(current.startValue, current.targetValue, 3).map((m) => ({
                id: makeId('ms'),
                label: formatMetric(current.metric as string, m.value),
                value: m.value,
              })),
            })
          }
        >
          Automatisch erzeugen
        </Button>
      </div>
      {current.milestones.length > 0 && (
        <div className="row gap-2 wrap">
          {current.milestones.map((m) => (
            <button
              key={m.id}
              type="button"
              className="pill"
              onClick={() => patch({ milestones: current.milestones.filter((x) => x.id !== m.id) })}
            >
              {m.label} ×
            </button>
          ))}
        </div>
      )}

      <Field label="Notizen">
        <TextArea
          value={current.notes ?? ''}
          onChange={(e) => patch({ notes: e.target.value || undefined })}
        />
      </Field>
    </Sheet>
  );
}
