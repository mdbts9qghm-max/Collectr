import { useState } from 'react';
import type { PhaseKind, SportKey, TrainingPhase, TrainingPlan } from '../domain/types.ts';
import { SPORTS } from '../domain/types.ts';
import { PHASE_META } from '../domain/phases.ts';
import { SPORT_META, formatDuration } from '../domain/format.ts';
import { makeId } from '../domain/ids.ts';
import { useStore } from '../data/store.ts';
import {
  Button,
  Field,
  Pill,
  Select,
  Sheet,
  Stepper,
  TextArea,
  TextInput,
} from './primitives.tsx';
import { IconPlus, IconTrash } from './icons.tsx';

const PHASE_KINDS: PhaseKind[] = ['base', 'build', 'peak', 'taper', 'recovery'];

/** Sports that carry a meaningful share of weekly volume. */
const FOCUS_SPORTS: SportKey[] = SPORTS.filter(
  (s) => s !== 'recovery' && s !== 'other_endurance',
);

export function newPhase(plan: TrainingPlan): TrainingPhase {
  const last = plan.phases[plan.phases.length - 1];
  const start = last ? last.endDate : plan.startDate;
  return {
    id: makeId('phase'),
    kind: 'build',
    label: 'Neue Phase',
    startDate: start,
    endDate: start,
    weeklyHoursTarget: 9,
    sportFocus: { run: 0.45, bike: 0.25, swim: 0.08, strength: 0.15, mobility: 0.07 },
    intensityDistribution: { easy: 0.8, moderate: 0.12, hard: 0.08 },
    strengthSessionsPerWeek: 2,
    focus: [],
  };
}

/**
 * Phase editor.
 *
 * The sport shares are entered as plain numbers and normalised to percentages
 * on display, so the values never have to add up to exactly 100 while typing —
 * the engine normalises them anyway.
 */
export function PhaseSheet({
  plan,
  phase,
  onClose,
}: {
  plan: TrainingPlan;
  phase: TrainingPhase | null;
  onClose: () => void;
}) {
  const savePlan = useStore((s) => s.savePlan);
  const toast = useStore((s) => s.toast);
  const [draft, setDraft] = useState<TrainingPhase | null>(phase);
  const [focusInput, setFocusInput] = useState('');

  const current = draft && phase && draft.id === phase.id ? draft : phase;
  if (!current) return null;

  const patch = (p: Partial<TrainingPhase>) => setDraft({ ...current, ...p });

  const focusTotal = Object.values(current.sportFocus).reduce((a, b) => a + (b ?? 0), 0) || 1;
  const intensityTotal =
    current.intensityDistribution.easy +
    current.intensityDistribution.moderate +
    current.intensityDistribution.hard || 1;
  const weeklyMinutes = current.weeklyHoursTarget * 60;

  const commit = (phases: TrainingPhase[]) => {
    savePlan({
      ...plan,
      phases: phases.sort((a, b) => a.startDate.localeCompare(b.startDate)),
    });
  };

  const save = () => {
    if (current.endDate < current.startDate) {
      toast('Das Enddatum liegt vor dem Startdatum', 'bad');
      return;
    }
    commit([...plan.phases.filter((p) => p.id !== current.id), current]);
    onClose();
    toast('Phase gespeichert', 'good');
  };

  const remove = () => {
    if (plan.phases.length <= 1) {
      toast('Der Plan braucht mindestens eine Phase', 'bad');
      return;
    }
    commit(plan.phases.filter((p) => p.id !== current.id));
    onClose();
    toast('Phase gelöscht');
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={phase?.label ?? 'Phase'}
      footer={
        <>
          <Button variant="danger" onClick={remove} aria-label="Phase löschen">
            <IconTrash size={17} />
          </Button>
          <Button variant="primary" block onClick={save}>
            Speichern
          </Button>
        </>
      }
    >
      <Field label="Name">
        <TextInput value={current.label} onChange={(e) => patch({ label: e.target.value })} />
      </Field>

      <Field label="Art" hint={PHASE_META[current.kind].description}>
        <Select
          value={current.kind}
          onChange={(e) => patch({ kind: e.target.value as PhaseKind })}
          options={PHASE_KINDS.map((k) => ({ value: k, label: PHASE_META[k].label }))}
        />
      </Field>

      <div className="grid-2">
        <Field label="Beginn">
          <TextInput
            type="date"
            value={current.startDate}
            onChange={(e) => patch({ startDate: e.target.value })}
          />
        </Field>
        <Field label="Ende">
          <TextInput
            type="date"
            value={current.endDate}
            onChange={(e) => patch({ endDate: e.target.value })}
          />
        </Field>
      </div>

      <Field
        label="Wochenstunden (Basis)"
        hint="Grundwert vor der 3:1-Welle. Die Entlastungswoche senkt ihn automatisch."
      >
        <Stepper
          value={current.weeklyHoursTarget}
          step={0.5}
          min={1}
          max={25}
          onChange={(weeklyHoursTarget) => patch({ weeklyHoursTarget })}
          format={(v) => `${v.toString().replace('.', ',')} h`}
        />
      </Field>

      <Field label="Krafteinheiten pro Woche">
        <Stepper
          value={current.strengthSessionsPerWeek}
          min={0}
          max={5}
          onChange={(strengthSessionsPerWeek) => patch({ strengthSessionsPerWeek })}
        />
      </Field>

      <div className="divider" />

      <div>
        <div className="field-label mb-3">Verteilung nach Sportart</div>
        <div className="col gap-3">
          {FOCUS_SPORTS.map((sport) => {
            const raw = current.sportFocus[sport] ?? 0;
            const share = raw / focusTotal;
            return (
              <div className="row gap-3" key={sport}>
                <span className="dot" style={{ background: SPORT_META[sport].color }} />
                <span className="grow t-small truncate">{SPORT_META[sport].label}</span>
                <span className="t-caption muted t-num nowrap" style={{ width: 74, textAlign: 'right' }}>
                  {Math.round(share * 100)} % · {formatDuration(share * weeklyMinutes)}
                </span>
                <Stepper
                  value={Math.round(raw * 100)}
                  step={5}
                  min={0}
                  max={100}
                  onChange={(v) => patch({ sportFocus: { ...current.sportFocus, [sport]: v / 100 } })}
                  format={(v) => String(v)}
                />
              </div>
            );
          })}
        </div>
        <p className="t-caption muted mt-3">
          Die Werte müssen sich nicht auf 100 addieren — sie werden ins Verhältnis gesetzt.
        </p>
      </div>

      <div className="divider" />

      <div>
        <div className="field-label mb-3">Intensitätsverteilung</div>
        <div className="col gap-3">
          {(
            [
              ['easy', 'Locker (Z1–Z2)', 'var(--zone-2)'],
              ['moderate', 'Moderat (Z3)', 'var(--zone-3)'],
              ['hard', 'Intensiv (Z4–Z5)', 'var(--zone-5)'],
            ] as const
          ).map(([key, label, color]) => {
            const share = current.intensityDistribution[key] / intensityTotal;
            return (
              <div className="row gap-3" key={key}>
                <span className="dot" style={{ background: color }} />
                <span className="grow t-small">{label}</span>
                <span className="t-caption muted t-num" style={{ width: 42, textAlign: 'right' }}>
                  {Math.round(share * 100)} %
                </span>
                <Stepper
                  value={Math.round(current.intensityDistribution[key] * 100)}
                  step={1}
                  min={0}
                  max={100}
                  onChange={(v) =>
                    patch({
                      intensityDistribution: {
                        ...current.intensityDistribution,
                        [key]: v / 100,
                      },
                    })
                  }
                  format={(v) => String(v)}
                />
              </div>
            );
          })}
        </div>
        {current.intensityDistribution.hard / intensityTotal > 0.2 && (
          <p className="t-caption warn mt-3">
            Über 20 % intensiv ist für einen Grundlagenblock viel. Für ein Ultra-Ziel trägt der
            lockere Anteil den Fortschritt.
          </p>
        )}
      </div>

      <div className="divider" />

      <Field label="Schwerpunkte" hint="Erscheinen als Fokus des Tages und in der Wochenansicht.">
        <div className="row gap-2">
          <div className="grow">
            <TextInput
              value={focusInput}
              placeholder="z. B. Lauftechnik"
              onChange={(e) => setFocusInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || !focusInput.trim()) return;
                e.preventDefault();
                patch({ focus: [...current.focus, focusInput.trim()] });
                setFocusInput('');
              }}
            />
          </div>
          <Button
            onClick={() => {
              if (!focusInput.trim()) return;
              patch({ focus: [...current.focus, focusInput.trim()] });
              setFocusInput('');
            }}
          >
            <IconPlus size={16} />
          </Button>
        </div>
      </Field>
      {current.focus.length > 0 && (
        <div className="row gap-2 wrap">
          {current.focus.map((f, i) => (
            <button
              key={`${f}-${i}`}
              type="button"
              className="pill"
              onClick={() => patch({ focus: current.focus.filter((_, j) => j !== i) })}
            >
              {f} ×
            </button>
          ))}
        </div>
      )}

      <Field label="Notiz">
        <TextArea
          value={current.notes ?? ''}
          placeholder="Worum geht es in dieser Phase?"
          onChange={(e) => patch({ notes: e.target.value || undefined })}
        />
      </Field>
    </Sheet>
  );
}

/** Plan-level settings: target date and the length of a build block. */
export function PlanSheet({ plan, onClose }: { plan: TrainingPlan; onClose: () => void }) {
  const savePlan = useStore((s) => s.savePlan);
  const toast = useStore((s) => s.toast);
  const [draft, setDraft] = useState(plan);

  return (
    <Sheet
      open
      onClose={onClose}
      title="Trainingsplan"
      footer={
        <Button
          variant="primary"
          block
          onClick={() => {
            savePlan(draft);
            onClose();
            toast('Plan gespeichert', 'good');
          }}
        >
          Speichern
        </Button>
      }
    >
      <Field label="Name">
        <TextInput value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      </Field>
      <div className="grid-2">
        <Field label="Beginn">
          <TextInput
            type="date"
            value={draft.startDate}
            onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
          />
        </Field>
        <Field label="Zieldatum">
          <TextInput
            type="date"
            value={draft.targetDate}
            onChange={(e) => setDraft({ ...draft, targetDate: e.target.value })}
          />
        </Field>
      </div>
      <Field
        label="Wochen pro Block"
        hint="Die letzte Woche jedes Blocks ist automatisch eine Entlastungswoche."
      >
        <Stepper
          value={draft.mesocycleWeeks}
          min={2}
          max={6}
          onChange={(mesocycleWeeks) => setDraft({ ...draft, mesocycleWeeks })}
          format={(v) => `${v} Wochen`}
        />
      </Field>
      <div className="row between">
        <span className="t-small secondary">Phasen im Plan</span>
        <Pill>{plan.phases.length}</Pill>
      </div>
    </Sheet>
  );
}
