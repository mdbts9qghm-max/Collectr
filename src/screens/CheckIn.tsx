import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DailyCheckIn, ISODate, TrainingSession } from '../domain/types.ts';
import { addDays, nowTimestamp } from '../domain/date.ts';
import { formatDateLong, formatDuration, SPORT_META, weekdayLong, weekdayShort } from '../domain/format.ts';
import { READINESS_LEVEL_META } from '../domain/readiness.ts';
import { shiftSleepMinutes } from '../domain/shifts.ts';
import { CATALOGUE } from '../domain/cycle/catalogue.ts';
import { RECOVERY_BAND_META } from '../domain/cycle/recovery.ts';
import { formatClock } from '../domain/cycle/windows.ts';
import { suggestAdjustment, wellbeingBaseline } from '../domain/cycle/adjust.ts';
import { sessionFromUnit, shapeOf } from '../domain/cycle/toSession.ts';
import { makeId } from '../domain/ids.ts';
import { useStore } from '../data/store.ts';
import { useCyclePlan, useDayView, useToday } from '../app/hooks.ts';
import { Button, Card, Pill, ReasonList, TextInput } from '../ui/primitives.tsx';
import { Ring } from '../ui/charts.tsx';
import { IconChevronLeft, IconCheck, IconPlus } from '../ui/icons.tsx';
import { markCheckInSeen } from '../app/checkinGate.ts';

type Step = 'shift' | 'sleep' | 'body' | 'devices' | 'result';

const STEPS: Step[] = ['shift', 'sleep', 'body', 'devices', 'result'];

/**
 * The morning check-in.
 *
 * This is the one screen that has to work half-awake before a shift, so every
 * answer is a single tap, nothing needs the keyboard except the optional device
 * numbers, and the whole thing can be skipped at any point without penalty.
 * It ends by showing what the answers produced — readiness and today's session —
 * so the effort of filling it in pays off immediately.
 */
export function CheckIn() {
  const today = useToday();
  const navigate = useNavigate();
  const existing = useStore((s) => s.checkIns[today]);
  const shiftTypes = useStore((s) => s.shiftTypes);
  const shifts = useStore((s) => s.shifts);
  const saveCheckIn = useStore((s) => s.saveCheckIn);
  const setShift = useStore((s) => s.setShift);
  const saveSession = useStore((s) => s.saveSession);
  const toast = useStore((s) => s.toast);

  const [step, setStep] = useState<Step>(existing ? 'result' : 'shift');
  const [draft, setDraft] = useState<DailyCheckIn>(
    existing ?? { date: today, source: 'manual', updatedAt: nowTimestamp() },
  );

  const view = useDayView(today);
  const todayShiftId = shifts[today]?.shiftTypeId;

  // Seed the sleep field from what the shift plan makes possible, so the
  // common case is confirming a number rather than dialling one in.
  useEffect(() => {
    if (draft.sleepHours != null || !todayShiftId) return;
    const type = shiftTypes.find((t) => t.id === todayShiftId);
    const minutes = shiftSleepMinutes(type ?? null);
    if (minutes > 0) setDraft((d) => ({ ...d, sleepHours: Math.round((minutes / 60) * 2) / 2 }));
  }, [todayShiftId, shiftTypes, draft.sleepHours]);

  const patch = (p: Partial<DailyCheckIn>) => setDraft((d) => ({ ...d, ...p }));

  const persist = (next: DailyCheckIn) => {
    saveCheckIn(next);
    markCheckInSeen(today);
  };

  const goNext = () => {
    const i = STEPS.indexOf(step);
    const next = STEPS[Math.min(i + 1, STEPS.length - 1)];
    if (next === 'result') persist(draft);
    setStep(next);
  };

  const goBack = () => {
    const i = STEPS.indexOf(step);
    if (i === 0) {
      markCheckInSeen(today);
      navigate('/today');
      return;
    }
    setStep(STEPS[i - 1]);
  };

  const finish = () => {
    markCheckInSeen(today);
    navigate('/today');
  };

  const skipAll = () => {
    markCheckInSeen(today);
    navigate('/today');
    toast('Check-in übersprungen — die Empfehlung rechnet ohne Erholungsdaten');
  };

  const stepIndex = STEPS.indexOf(step);

  return (
    <div className="checkin">
      <div className="checkin-top">
        <div className="checkin-progress" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span key={s} className={i <= stepIndex ? 'done' : ''} />
          ))}
        </div>
        <div className="row between">
          <button type="button" className="btn btn-ghost btn-sm" onClick={goBack}>
            <IconChevronLeft size={16} /> Zurück
          </button>
          <span className="t-caption muted">
            {weekdayLong(today)}, {formatDateLong(today)}
          </span>
        </div>
      </div>

      <div className="checkin-body">
        {step === 'shift' && (
          <>
            <h1 className="checkin-question">Welche Schicht hast du heute?</h1>
            <p className="t-small muted">
              Der wichtigste Wert. Er entscheidet, wie viel Zeit und welche Intensität heute
              überhaupt möglich sind.
            </p>
            <div className="pick-grid">
              {shiftTypes.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  className={`pick ${todayShiftId === type.id ? 'active' : ''}`}
                  onClick={() => setShift(today, type.id)}
                >
                  <span className="pick-icon">{type.icon}</span>
                  <span className="pick-label">{type.label}</span>
                  <span className="pick-sub">
                    {type.training.maxMinutes > 0
                      ? `max ${formatDuration(type.training.maxMinutes)}`
                      : 'kein Training'}
                  </span>
                </button>
              ))}
            </div>

            <UpcomingShifts today={today} />
          </>
        )}

        {step === 'sleep' && (
          <>
            <h1 className="checkin-question">Wie lange hast du geschlafen?</h1>
            <div className="quick-row">
              {[3, 4, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 10].map((h) => (
                <button
                  key={h}
                  type="button"
                  className={`quick ${draft.sleepHours === h ? 'active' : ''}`}
                  onClick={() => patch({ sleepHours: h })}
                >
                  {h.toString().replace('.', ',')} h
                </button>
              ))}
            </div>
            <p className="t-caption muted">
              Geteilter Schlaf zählt zusammen — Vorschlaf vor der Nachtschicht plus das, was danach
              kam.
            </p>

            <Rate
              label="Wie war die Qualität?"
              value={draft.sleepQuality}
              onChange={(v) => patch({ sleepQuality: v })}
              low="schlecht"
              high="sehr gut"
            />
          </>
        )}

        {step === 'body' && (
          <>
            <h1 className="checkin-question">Wie fühlst du dich?</h1>
            {/*
              The overall number comes first: it is the one answer the cycle
              planner acts on, and the only one worth having if the rest is
              skipped. The four ratings below feed readiness.
            */}
            <Rate
              label="Befinden gesamt"
              value={draft.wellbeing}
              onChange={(v) => patch({ wellbeing: v })}
              low="mies"
              high="top"
              max={10}
            />
            <p className="t-caption muted">
              Sieben ist dein Normalwert. Jeder Punkt darüber oder darunter verschiebt den
              Erholungswert um fünf.
            </p>
            <div className="divider" />
            <Rate
              label="Müdigkeit"
              value={draft.fatigue}
              onChange={(v) => patch({ fatigue: v })}
              low="frisch"
              high="erschöpft"
            />
            <Rate
              label="Muskelkater"
              value={draft.soreness}
              onChange={(v) => patch({ soreness: v })}
              low="keiner"
              high="stark"
            />
            <Rate
              label="Stress"
              value={draft.stress}
              onChange={(v) => patch({ stress: v })}
              low="ruhig"
              high="sehr hoch"
            />
            <Rate
              label="Motivation"
              value={draft.motivation}
              onChange={(v) => patch({ motivation: v })}
              low="kein Antrieb"
              high="voll da"
            />
          </>
        )}

        {step === 'devices' && (
          <>
            <h1 className="checkin-question">Werte von deinen Geräten</h1>
            <p className="t-small muted">
              Alles optional. Was du einträgst, macht die Readiness genauer — was fehlt, wird nicht
              geschätzt, sondern weggelassen.
            </p>
            <div className="grid-2">
              <NumberField
                label="WHOOP Recovery"
                suffix="%"
                value={draft.whoopRecovery}
                onChange={(v) => patch({ whoopRecovery: v })}
              />
              <NumberField
                label="HRV"
                suffix="ms"
                value={draft.hrvMs}
                onChange={(v) => patch({ hrvMs: v })}
              />
              <NumberField
                label="Ruhepuls"
                suffix="bpm"
                value={draft.restingHr}
                onChange={(v) => patch({ restingHr: v })}
              />
              <NumberField
                label="Gewicht"
                suffix="kg"
                step="0.1"
                value={draft.bodyweightKg}
                onChange={(v) => patch({ bodyweightKg: v })}
              />
            </div>
            <NumberField
              label="Schritte gestern"
              value={draft.steps}
              onChange={(v) => patch({ steps: v })}
            />
          </>
        )}

        {step === 'result' && (
          <Result view={view} draft={draft} onPlan={saveSession} onDone={finish} today={today} />
        )}
      </div>

      <div className="checkin-foot">
        {step === 'result' ? (
          <Button variant="primary" block size="lg" onClick={finish}>
            <IconCheck size={18} /> Fertig
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={skipAll}>
              Überspringen
            </Button>
            <Button variant="primary" block size="lg" onClick={goNext}>
              Weiter
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Pieces
 * ------------------------------------------------------------------ */

function Rate({
  label,
  value,
  onChange,
  low,
  high,
  max = 5,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number) => void;
  low: string;
  high: string;
  /** Highest step. Ten wraps onto two rows so the buttons stay tappable. */
  max?: number;
}) {
  return (
    <div className="rate">
      <div className="t-heading">{label}</div>
      <div className={`rate-row ${max > 5 ? 'wide' : ''}`} role="group" aria-label={label}>
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            className={`rate-btn ${value === n ? 'active' : ''}`}
            aria-pressed={value === n}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="rate-ends">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  suffix,
  step,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  suffix?: string;
  step?: string;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <TextInput
        type="number"
        inputMode="decimal"
        step={step}
        suffix={suffix}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      />
    </label>
  );
}

/** Lets the athlete fill the next few days' shifts while they are already here. */
function UpcomingShifts({ today }: { today: ISODate }) {
  const shiftTypes = useStore((s) => s.shiftTypes);
  const shifts = useStore((s) => s.shifts);
  const setShift = useStore((s) => s.setShift);
  const [openDate, setOpenDate] = useState<ISODate | null>(null);

  const days = useMemo(() => [1, 2, 3].map((i) => addDays(today, i)), [today]);
  const missing = days.filter((d) => !shifts[d]).length;
  if (missing === 0) return null;

  return (
    <Card tight>
      <div className="t-label mb-3">Nächste Tage ({missing} offen)</div>
      <p className="t-caption muted mb-3">
        Solange diese Tage leer sind, kann die App nicht erkennen, ob heute die letzte Gelegenheit
        der Woche ist.
      </p>
      <div className="col gap-2">
        {days.map((date) => {
          const assigned = shifts[date]?.shiftTypeId;
          const type = shiftTypes.find((t) => t.id === assigned);
          return (
            <div key={date}>
              <button
                type="button"
                className="row gap-3"
                style={{ width: '100%' }}
                onClick={() => setOpenDate(openDate === date ? null : date)}
              >
                <span className="t-small muted" style={{ width: 58, textAlign: 'left' }}>
                  {weekdayShort(date)}, {date.slice(8)}.{date.slice(5, 7)}.
                </span>
                <span className="grow left t-small">
                  {type ? `${type.icon} ${type.label}` : 'antippen zum Setzen'}
                </span>
                {!type && <Pill tone="warn">offen</Pill>}
              </button>
              {openDate === date && (
                <div className="chip-row mt-2">
                  {shiftTypes.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`chip ${assigned === t.id ? 'active' : ''}`}
                      onClick={() => {
                        setShift(date, t.id);
                        setOpenDate(null);
                      }}
                    >
                      {t.icon} {t.short}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Result({
  view,
  draft,
  onPlan,
  onDone,
  today,
}: {
  view: ReturnType<typeof useDayView>;
  draft: DailyCheckIn;
  onPlan: (s: TrainingSession) => unknown;
  onDone: () => void;
  today: ISODate;
}) {
  const toast = useStore((s) => s.toast);
  const checkIns = useStore((s) => s.checkIns);
  const [planned, setPlanned] = useState(false);
  const meta = READINESS_LEVEL_META[view.readiness.level];

  // One cycle is enough here: the check-in only ever asks about today.
  const cycle = useCyclePlan(today, 1);
  const day = cycle.days.find((d) => d.shape.date === today) ?? null;
  const unit = day?.units[0] ?? null;

  // The draft holds what was just tapped in, which may not be saved yet, so the
  // suggestion reacts to the answer rather than to the previous state.
  const baseline = useMemo(
    () => wellbeingBaseline(new Map(Object.entries(checkIns)), today),
    [checkIns, today],
  );
  const adjustment = suggestAdjustment(unit, draft.wellbeing, baseline, day?.recovery.value);

  // Null until the athlete answers: neither button is pre-selected, because the
  // app proposes the change but does not decide it.
  const [accepted, setAccepted] = useState<boolean | null>(null);
  const shownKind = accepted === true && adjustment ? adjustment.to : unit?.kind;
  const spec = shownKind ? CATALOGUE[shownKind] : null;

  const plan = () => {
    if (!unit || !shownKind) {
      onDone();
      return;
    }
    // The adjusted session keeps the slot the planner found; only the kind and
    // its duration change, so the day's windows still hold.
    const target = CATALOGUE[shownKind];
    const stamp = nowTimestamp();
    onPlan(
      sessionFromUnit(
        {
          ...unit,
          kind: shownKind,
          load: target.load,
          durationMinutes: Math.min(unit.durationMinutes, target.maxMinutes),
        },
        { id: makeId('ses'), createdAt: stamp, updatedAt: stamp },
      ),
    );
    setPlanned(true);
    toast(`${target.label} eingeplant`, 'good');
  };

  return (
    <>
      <div className="checkin-result">
        <Ring
          size={132}
          stroke={11}
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
        <div className={`t-title mt-4 ${meta.tone === 'muted' ? 'muted' : meta.tone}`}>
          {meta.label}
        </div>
        <div className="t-small muted mt-2">{meta.description}</div>
      </div>

      {day && (
        <Card hero accentEdge>
          <div className="row between">
            <div className="t-label">Dein Training heute</div>
            <Pill tone={day.recovery.band === 'green' ? 'good' : day.recovery.band === 'amber' ? 'warn' : 'bad'}>
              Erholung {day.recovery.value}
            </Pill>
          </div>

          {spec ? (
            <>
              <div className="row gap-3 mt-3">
                <span style={{ fontSize: 28, lineHeight: 1 }}>
                  {SPORT_META[shapeOf(spec.kind).sport].icon}
                </span>
                <div className="grow">
                  <div className="t-title">{spec.label}</div>
                  <div className="t-small secondary mt-2">
                    {[
                      formatDuration(Math.min(unit!.durationMinutes, spec.maxMinutes)),
                      spec.description,
                      `ab ${formatClock(unit!.start)}`,
                    ].join(' · ')}
                  </div>
                </div>
              </div>

              <div className="divider mt-4" />
              <div className="t-label mb-3">Warum</div>
              <ReasonList
                reasons={unit!.reasons.slice(0, 3).map((text) => ({ text, impact: 'neutral' as const }))}
              />
            </>
          ) : (
            <div className="t-small secondary mt-3">
              Heute steht keine Einheit an. {RECOVERY_BAND_META[day.recovery.band].advice}
            </div>
          )}

          {adjustment && !planned && (
            <div className={`callout mt-4 ${adjustment.direction === 'down' ? 'warn' : 'good'}`}>
              <div className="t-heading">
                {adjustment.direction === 'down' ? 'Abstufen?' : 'Aufstufen?'}
              </div>
              <div className="t-small secondary mt-2">
                {adjustment.reason} Vorschlag: {CATALOGUE[adjustment.from].label} →{' '}
                {CATALOGUE[adjustment.to].label}.
              </div>
              <div className="row gap-2 mt-3">
                <Button
                  variant={accepted === true ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setAccepted(true)}
                >
                  Übernehmen
                </Button>
                <Button
                  variant={accepted === false ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setAccepted(false)}
                >
                  Beim Plan bleiben
                </Button>
              </div>
            </div>
          )}

          {spec && (
            <Button
              variant={planned ? 'outline' : 'primary'}
              block
              className="mt-4"
              disabled={planned}
              onClick={plan}
            >
              {planned ? (
                <>
                  <IconCheck size={16} /> Eingeplant
                </>
              ) : (
                <>
                  <IconPlus size={16} /> Für heute einplanen
                </>
              )}
            </Button>
          )}
        </Card>
      )}

      {view.readiness.missingInputs.length > 0 && (
        <p className="t-caption muted">
          Noch offen: {view.readiness.missingInputs.join(', ')}. Fehlende Angaben werden nicht
          geschätzt — die Readiness rechnet nur mit dem, was da ist.
        </p>
      )}
    </>
  );
}
