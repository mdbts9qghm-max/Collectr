import { useEffect, useMemo, useState } from 'react';
import type {
  Exercise,
  IntensityKey,
  MuscleGroup,
  SportKey,
  StrengthEntry,
  TrainingSession,
} from '../domain/types.ts';
import { INTENSITIES, SPORTS } from '../domain/types.ts';
import { INTENSITY_META, SPORT_META, formatDuration } from '../domain/format.ts';
import { nowTimestamp } from '../domain/date.ts';
import { makeId } from '../domain/ids.ts';
import { sessionLoad } from '../domain/load.ts';
import { muscleLabel } from '../domain/engine.ts';
import { useStore } from '../data/store.ts';
import {
  Button,
  Field,
  Pill,
  Segmented,
  Select,
  Sheet,
  TextArea,
  TextInput,
} from './primitives.tsx';
import { IconPlus, IconTrash } from './icons.tsx';

const SPORTS_WITH_DISTANCE: SportKey[] = ['run', 'bike', 'swim', 'hike', 'other_endurance'];

export function emptySession(date: string, sport: SportKey = 'run'): TrainingSession {
  return {
    id: makeId('ses'),
    date,
    sport,
    title: '',
    status: 'planned',
    plannedIntensity: 'easy',
    plannedDurationMin: 45,
    muscleGroups: [],
    source: 'manual',
    createdAt: nowTimestamp(),
    updatedAt: nowTimestamp(),
  };
}

export function SessionSheet({
  open,
  session,
  onClose,
}: {
  open: boolean;
  session: TrainingSession | null;
  onClose: () => void;
}) {
  const saveSession = useStore((s) => s.saveSession);
  const deleteSession = useStore((s) => s.deleteSession);
  const exercises = useStore((s) => s.exercises);
  const toast = useStore((s) => s.toast);

  const [draft, setDraft] = useState<TrainingSession | null>(session);
  const [tab, setTab] = useState<'plan' | 'result'>('plan');

  useEffect(() => {
    setDraft(session);
    setTab(session?.status === 'completed' ? 'result' : 'plan');
  }, [session]);

  const estimatedLoad = useMemo(() => (draft ? sessionLoad(draft) : 0), [draft]);

  if (!draft) return null;
  const patch = (p: Partial<TrainingSession>) => setDraft({ ...draft, ...p });
  const isStrength = draft.sport === 'strength';
  const hasDistance = SPORTS_WITH_DISTANCE.includes(draft.sport);

  const handleSave = () => {
    const title = draft.title.trim() || defaultTitle(draft.sport, draft.plannedIntensity);
    const records = saveSession({ ...draft, title });
    onClose();
    if (records.length > 0) {
      toast(`Neue Bestleistung: ${records.map((r) => r.label).join(', ')} 🏆`, 'good');
    } else {
      toast(draft.status === 'completed' ? 'Einheit gespeichert' : 'Training geplant', 'good');
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={session?.title || 'Training'}
      footer={
        <>
          {session && (
            <Button
              variant="danger"
              onClick={() => {
                deleteSession(draft.id);
                onClose();
                toast('Einheit gelöscht');
              }}
              aria-label="Einheit löschen"
            >
              <IconTrash size={17} />
            </Button>
          )}
          <Button variant="primary" block onClick={handleSave}>
            Speichern
          </Button>
        </>
      }
    >
      <Field label="Sportart">
        <div className="chip-row">
          {SPORTS.map((sport) => (
            <button
              key={sport}
              type="button"
              className={`chip ${draft.sport === sport ? 'active' : ''}`}
              onClick={() =>
                patch({
                  sport,
                  muscleGroups: sport === 'strength' ? draft.muscleGroups : [],
                })
              }
            >
              {SPORT_META[sport].icon} {SPORT_META[sport].short}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Titel">
        <TextInput
          value={draft.title}
          placeholder={defaultTitle(draft.sport, draft.plannedIntensity)}
          onChange={(e) => patch({ title: e.target.value })}
        />
      </Field>

      <div className="grid-2">
        <Field label="Datum">
          <TextInput type="date" value={draft.date} onChange={(e) => patch({ date: e.target.value })} />
        </Field>
        <Field label="Uhrzeit">
          <TextInput
            type="time"
            value={draft.startTime ?? ''}
            onChange={(e) => patch({ startTime: e.target.value || undefined })}
          />
        </Field>
      </div>

      <Field label="Status">
        <Segmented
          accent
          value={draft.status}
          onChange={(v) => {
            patch({
              status: v,
              actualDurationMin:
                v === 'completed' ? (draft.actualDurationMin ?? draft.plannedDurationMin) : draft.actualDurationMin,
              actualDistanceKm:
                v === 'completed' ? (draft.actualDistanceKm ?? draft.plannedDistanceKm) : draft.actualDistanceKm,
            });
            if (v === 'completed') setTab('result');
          }}
          options={[
            { value: 'planned', label: 'Geplant' },
            { value: 'completed', label: 'Absolviert' },
            { value: 'skipped', label: 'Ausgefallen' },
          ]}
        />
      </Field>

      {draft.status !== 'skipped' && (
        <>
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'plan', label: 'Planung' },
              { value: 'result', label: 'Ergebnis' },
            ]}
          />

          {tab === 'plan' ? (
            <>
              <Field label="Intensität">
                <div className="chip-row">
                  {INTENSITIES.map((i) => (
                    <button
                      key={i}
                      type="button"
                      className={`chip ${draft.plannedIntensity === i ? 'active' : ''}`}
                      onClick={() => patch({ plannedIntensity: i })}
                    >
                      {INTENSITY_META[i].zone} · {INTENSITY_META[i].label}
                    </button>
                  ))}
                </div>
              </Field>

              <div className="grid-2">
                <Field label="Dauer (min)">
                  <TextInput
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={draft.plannedDurationMin ?? ''}
                    onChange={(e) => patch({ plannedDurationMin: numberOrUndefined(e.target.value) })}
                  />
                </Field>
                {hasDistance && (
                  <Field label="Distanz (km)">
                    <TextInput
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      min={0}
                      value={draft.plannedDistanceKm ?? ''}
                      onChange={(e) => patch({ plannedDistanceKm: numberOrUndefined(e.target.value) })}
                    />
                  </Field>
                )}
              </div>

              <Field label="Ziel der Einheit" hint="Warum machst du diese Einheit?">
                <TextInput
                  value={draft.goal ?? ''}
                  placeholder="z. B. aerobe Grundlage"
                  onChange={(e) => patch({ goal: e.target.value || undefined })}
                />
              </Field>
            </>
          ) : (
            <>
              <div className="grid-2">
                <Field label="Dauer (min)">
                  <TextInput
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={draft.actualDurationMin ?? ''}
                    placeholder={String(draft.plannedDurationMin ?? '')}
                    onChange={(e) => patch({ actualDurationMin: numberOrUndefined(e.target.value) })}
                  />
                </Field>
                {hasDistance && (
                  <Field label="Distanz (km)">
                    <TextInput
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min={0}
                      value={draft.actualDistanceKm ?? ''}
                      placeholder={String(draft.plannedDistanceKm ?? '')}
                      onChange={(e) => patch({ actualDistanceKm: numberOrUndefined(e.target.value) })}
                    />
                  </Field>
                )}
              </div>

              <Field label="Tatsächliche Intensität">
                <div className="chip-row">
                  {INTENSITIES.map((i) => (
                    <button
                      key={i}
                      type="button"
                      className={`chip ${(draft.actualIntensity ?? draft.plannedIntensity) === i ? 'active' : ''}`}
                      onClick={() => patch({ actualIntensity: i })}
                    >
                      {INTENSITY_META[i].zone}
                    </button>
                  ))}
                </div>
              </Field>

              <Field
                label="Empfundene Anstrengung (RPE 1–10)"
                hint="Der genaueste Einzelwert für die Belastungsberechnung."
              >
                <div className="chip-row">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`chip ${draft.rpe === n ? 'active' : ''}`}
                      onClick={() => patch({ rpe: draft.rpe === n ? undefined : n })}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </Field>

              <div className="grid-2">
                <Field label="Ø Herzfrequenz">
                  <TextInput
                    type="number"
                    inputMode="numeric"
                    value={draft.avgHr ?? ''}
                    suffix="bpm"
                    onChange={(e) => patch({ avgHr: numberOrUndefined(e.target.value) })}
                  />
                </Field>
                <Field label="Höhenmeter">
                  <TextInput
                    type="number"
                    inputMode="numeric"
                    value={draft.elevationGainM ?? ''}
                    suffix="m"
                    onChange={(e) => patch({ elevationGainM: numberOrUndefined(e.target.value) })}
                  />
                </Field>
              </div>

              {draft.sport === 'bike' && (
                <div className="grid-2">
                  <Field label="Ø Leistung">
                    <TextInput
                      type="number"
                      inputMode="numeric"
                      value={draft.avgPowerW ?? ''}
                      suffix="W"
                      onChange={(e) => patch({ avgPowerW: numberOrUndefined(e.target.value) })}
                    />
                  </Field>
                  <Field label="Normalized Power">
                    <TextInput
                      type="number"
                      inputMode="numeric"
                      value={draft.normalizedPowerW ?? ''}
                      suffix="W"
                      onChange={(e) => patch({ normalizedPowerW: numberOrUndefined(e.target.value) })}
                    />
                  </Field>
                </div>
              )}
            </>
          )}
        </>
      )}

      {isStrength && (
        <StrengthEditor
          entries={draft.strength ?? []}
          exercises={exercises}
          onChange={(entries) =>
            patch({
              strength: entries,
              muscleGroups: deriveMuscleGroups(entries, exercises),
            })
          }
        />
      )}

      {!isStrength && (
        <Field label="Belastete Muskelgruppen" hint="Steuert, wann die Gruppe wieder belastbar ist.">
          <div className="chip-row">
            {(['legs_quads', 'legs_hamstrings', 'glutes', 'calves', 'core', 'back', 'chest', 'shoulders', 'arms'] as MuscleGroup[]).map(
              (g) => (
                <button
                  key={g}
                  type="button"
                  className={`chip ${draft.muscleGroups.includes(g) ? 'active' : ''}`}
                  onClick={() =>
                    patch({
                      muscleGroups: draft.muscleGroups.includes(g)
                        ? draft.muscleGroups.filter((x) => x !== g)
                        : [...draft.muscleGroups, g],
                    })
                  }
                >
                  {muscleLabel(g)}
                </button>
              ),
            )}
          </div>
        </Field>
      )}

      <Field label="Notizen">
        <TextArea
          value={draft.notes ?? ''}
          placeholder="Wie hat es sich angefühlt?"
          onChange={(e) => patch({ notes: e.target.value || undefined })}
        />
      </Field>

      <div className="row between">
        <span className="t-small muted">Berechnete Belastung</span>
        <Pill tone="accent">{estimatedLoad} Load</Pill>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ *
 * Strength editor
 * ------------------------------------------------------------------ */

function StrengthEditor({
  entries,
  exercises,
  onChange,
}: {
  entries: StrengthEntry[];
  exercises: Exercise[];
  onChange: (entries: StrengthEntry[]) => void;
}) {
  const available = exercises.filter((e) => !e.archived);
  const [picked, setPicked] = useState(available[0]?.id ?? '');
  const byId = new Map(available.map((e) => [e.id, e]));

  const addExercise = () => {
    if (!picked || entries.some((e) => e.exerciseId === picked)) return;
    onChange([...entries, { exerciseId: picked, sets: [{ reps: 8 }] }]);
  };

  const updateEntry = (index: number, entry: StrengthEntry) => {
    onChange(entries.map((e, i) => (i === index ? entry : e)));
  };

  return (
    <div className="col gap-3">
      <div className="field-label">Übungen</div>

      {entries.map((entry, i) => {
        const exercise = byId.get(entry.exerciseId);
        const volume = entry.sets.reduce((s, set) => s + (set.weightKg ?? 0) * set.reps, 0);
        return (
          <div className="card tight" key={entry.exerciseId}>
            <div className="row between mb-2">
              <div className="t-heading">{exercise?.name ?? entry.exerciseId}</div>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => onChange(entries.filter((_, j) => j !== i))}
                aria-label={`${exercise?.name ?? 'Übung'} entfernen`}
              >
                <IconTrash size={16} />
              </button>
            </div>

            <div className="col gap-2 mt-2">
              {entry.sets.map((set, si) => (
                <div className="row gap-2" key={si}>
                  <span className="t-caption muted" style={{ width: 20 }}>
                    {si + 1}
                  </span>
                  <TextInput
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={set.reps}
                    aria-label={`Satz ${si + 1} Wiederholungen`}
                    onChange={(e) =>
                      updateEntry(i, {
                        ...entry,
                        sets: entry.sets.map((s, j) =>
                          j === si ? { ...s, reps: Number(e.target.value) || 0 } : s,
                        ),
                      })
                    }
                  />
                  <span className="t-caption muted">×</span>
                  <TextInput
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    min={0}
                    placeholder="KG"
                    value={set.weightKg ?? ''}
                    aria-label={`Satz ${si + 1} Gewicht`}
                    onChange={(e) =>
                      updateEntry(i, {
                        ...entry,
                        sets: entry.sets.map((s, j) =>
                          j === si ? { ...s, weightKg: numberOrUndefined(e.target.value) } : s,
                        ),
                      })
                    }
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    onClick={() =>
                      updateEntry(i, { ...entry, sets: entry.sets.filter((_, j) => j !== si) })
                    }
                    aria-label={`Satz ${si + 1} entfernen`}
                  >
                    <IconTrash size={15} />
                  </button>
                </div>
              ))}
            </div>

            <div className="row between mt-3">
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  updateEntry(i, {
                    ...entry,
                    sets: [...entry.sets, entry.sets[entry.sets.length - 1] ?? { reps: 8 }],
                  })
                }
              >
                <IconPlus size={15} /> Satz
              </Button>
              {volume > 0 && <span className="t-caption muted t-num">{Math.round(volume)} kg Volumen</span>}
            </div>
          </div>
        );
      })}

      <div className="row gap-2">
        <Select
          value={picked}
          onChange={(e) => setPicked(e.target.value)}
          options={available
            .filter((e) => !entries.some((x) => x.exerciseId === e.id))
            .map((e) => ({ value: e.id, label: e.name }))}
        />
        <Button onClick={addExercise}>
          <IconPlus size={16} />
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function numberOrUndefined(value: string): number | undefined {
  if (value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function deriveMuscleGroups(entries: StrengthEntry[], exercises: Exercise[]): MuscleGroup[] {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const set = new Set<MuscleGroup>();
  for (const entry of entries) {
    for (const g of byId.get(entry.exerciseId)?.muscleGroups ?? []) set.add(g);
  }
  return [...set];
}

export function defaultTitle(sport: SportKey, intensity: IntensityKey): string {
  const meta = SPORT_META[sport];
  if (sport === 'strength') return 'Krafttraining';
  if (sport === 'mobility') return 'Mobility';
  if (sport === 'recovery') return 'Regeneration';
  return `${meta.label} · ${INTENSITY_META[intensity].label}`;
}

export function sessionSubtitle(session: TrainingSession): string {
  const parts: string[] = [];
  const duration = session.actualDurationMin ?? session.plannedDurationMin;
  const distance = session.actualDistanceKm ?? session.plannedDistanceKm;
  if (duration) parts.push(formatDuration(duration));
  if (distance) parts.push(`${distance.toFixed(distance >= 10 ? 0 : 1)} km`);
  parts.push(INTENSITY_META[session.actualIntensity ?? session.plannedIntensity].zone);
  return parts.join(' · ');
}
