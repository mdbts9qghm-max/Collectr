import { useEffect, useMemo, useRef, useState } from 'react';
import type { HorizonNote, TodayDecision } from '../domain/coach/coach.ts';
import type { CoachView } from '../data/derived.ts';
import type { SessionKind } from '../domain/coach/catalogue.ts';
import { CATALOGUE, HARTE_REGEL_LAUFEN } from '../domain/coach/catalogue.ts';
import { FIXED_ZONES, TEST_PROTOCOL, retestState, zoneRanges } from '../domain/coach/zones.ts';
import { CYCLE_DAY_META, formatClock } from '../domain/coach/windows.ts';
import { cyclesUntilDeload } from '../domain/coach/phases.ts';
import { useCoach, useToday } from '../app/hooks.ts';
import { useStore } from '../data/store.ts';
import { Card, Disclosure, Pill, SectionTitle } from '../ui/primitives.tsx';

/**
 * Der Coach.
 *
 * Der Bildschirm hat eine Aufgabe: beim Draufschauen ist klar, was heute zu tun
 * ist. Alles, was erklärt statt anweist, liegt hinter einem Knopf — die
 * Begründung ist wichtig, aber sie ist nie das Erste, was man liest.
 *
 * Darunter steht das Blickfeld: die Tage davor und danach, über Wochen hinweg,
 * mit der Angabe, welche Regel jeden einzelnen davon heute noch relevant macht.
 * Wo keine Regel mehr reicht, wird der Tag blass — nicht weil er vergessen wurde,
 * sondern weil er nachweislich keinen Einfluss mehr hat.
 */
export function Training() {
  const today = useToday();
  const plan = useCoach(today);

  return (
    <>
      <div className="row between">
        <div>
          <div className="t-label">
            {plan.timeline.days.find((d) => d.date === today)?.isVShift
              ? 'V-Schicht'
              : (CYCLE_DAY_META[plan.timeline.days.find((d) => d.date === today)?.cycleDay ?? 0]?.label ??
                'Keine Schicht eingetragen')}
          </div>
          <h1 className="t-title mt-2">Coach</h1>
        </div>
        <Pill tone={plan.isDeload ? 'info' : 'default'}>
          {plan.isDeload ? 'Deload' : plan.target.phase.id}
        </Pill>
      </div>

      <TodayCard today={plan.today} />
      <StrengthCard today={plan.today} />
      <HorizonStrip plan={plan} />
      <VolumeCard plan={plan} />
      <ZoneCard plan={plan} />

      <Card tight>
        <div className="t-caption muted">{HARTE_REGEL_LAUFEN}</div>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Heute
 * ------------------------------------------------------------------ */

const VERDICT_META = {
  los: { tone: 'var(--accent)', label: 'Plan steht' },
  reduziert: { tone: 'var(--warn)', label: 'Abgestuft' },
  ruhe: { tone: 'var(--text-muted)', label: 'Ruhe' },
} as const;

const ZONE_COLORS = ['var(--zone-1)', 'var(--zone-2)', 'var(--zone-3)', 'var(--zone-4)', 'var(--zone-5)'];

function TodayCard({ today }: { today: TodayDecision }) {
  const meta = VERDICT_META[today.verdict];
  const zoneColor = today.zone ? ZONE_COLORS[today.zone - 1] : 'var(--text-muted)';

  return (
    <Card hero className="coach-hero" style={{ borderLeft: `4px solid ${meta.tone}` }}>
      <div className="row between">
        <span className="t-label" style={{ color: meta.tone }}>
          {meta.label}
        </span>
        {today.stepsDown > 0 && (
          <Pill tone="warn">
            {today.stepsDown === 1 ? 'eine Stufe zurück' : `${today.stepsDown} Stufen zurück`}
          </Pill>
        )}
      </div>

      <h2 className="coach-headline mt-2">{today.headline}</h2>

      {today.kind !== 'ruhe' && (
        <div className="coach-facts mt-4">
          <div>
            <div className="t-num coach-fact-value">{today.minutes}</div>
            <div className="t-caption muted">Minuten</div>
          </div>
          {today.zoneLabel && (
            <div>
              <div className="t-num coach-fact-value" style={{ color: zoneColor }}>
                Z{today.zone}
              </div>
              <div className="t-caption muted">{today.zoneLabel.replace(/^Z\d /, '')} bpm</div>
            </div>
          )}
          {today.startMinutes != null && (
            <div>
              <div className="t-num coach-fact-value">{formatClock(today.startMinutes)}</div>
              <div className="t-caption muted">
                {today.window ? `bis ${formatClock(today.window.end)}` : 'Start'}
              </div>
            </div>
          )}
        </div>
      )}

      <ol className="coach-steps mt-4">
        {today.steps.map((step) => (
          <li key={step} className="t-small">
            {step}
          </li>
        ))}
      </ol>

      {today.blockers.length > 0 && (
        <div className="coach-blockers mt-3">
          {today.blockers.map((b) => (
            <div key={b.ruleId + b.message} className="t-small">
              {b.message}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4" style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--s3)' }}>
        <Disclosure summary={<span className="t-small" style={{ fontWeight: 600 }}>Warum heute das?</span>}>
          <ul className="coach-reasons">
            {today.reasons.map((r, i) => (
              <li key={`${r.ruleId ?? 'plan'}-${i}`}>
                <span className={`coach-effect coach-effect-${effectClass(r.effect)}`}>{r.effect}</span>
                <span className="grow">
                  <span className="t-small" style={{ fontWeight: 600, display: 'block' }}>
                    {r.title}
                  </span>
                  <span className="t-caption secondary">{r.detail}</span>
                  {r.date && <span className="t-caption muted"> · {shortDate(r.date)}</span>}
                </span>
              </li>
            ))}
          </ul>
        </Disclosure>
      </div>
    </Card>
  );
}

function effectClass(effect: string): string {
  if (effect === 'sperrt') return 'block';
  if (effect === 'stuft ab' || effect === 'begrenzt') return 'limit';
  return 'set';
}

/* ------------------------------------------------------------------ *
 * Kraft
 * ------------------------------------------------------------------ */

function StrengthCard({ today }: { today: TodayDecision }) {
  const strength = today.strength;
  if (!strength?.kind) return null;

  return (
    <Card>
      <div className="row between">
        <div className="t-label">{CATALOGUE[strength.kind].label}</div>
        <Pill tone="accent">RPE {strength.rpe}</Pill>
      </div>
      <div className="t-small secondary mt-2">{strength.reason}</div>
      <div className="coach-facts mt-3">
        <div>
          <div className="t-num coach-fact-value">{strength.minutes}</div>
          <div className="t-caption muted">Minuten</div>
        </div>
        <div>
          <div className="t-num coach-fact-value">~{strength.percentOfMax}%</div>
          <div className="t-caption muted">vom Maximum</div>
        </div>
        <div>
          <div className="t-num coach-fact-value">{strength.repsInReserve}</div>
          <div className="t-caption muted">Wdh. in Reserve</div>
        </div>
      </div>

      <div className="mt-3">
        <Disclosure summary={<span className="t-small" style={{ fontWeight: 600 }}>Übungen</span>}>
          <ul className="coach-blocks">
            {strength.blocks.map((b) => (
              <li key={b.name}>
                <div className="row between gap-3">
                  <span className="t-small" style={{ fontWeight: 600 }}>
                    {b.name}
                  </span>
                  <span className="t-num t-caption" style={{ whiteSpace: 'nowrap' }}>
                    {b.sets} × {b.reps}
                  </span>
                </div>
                <div className="t-caption muted mt-1">{b.note}</div>
              </li>
            ))}
          </ul>
        </Disclosure>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Das Blickfeld
 * ------------------------------------------------------------------ */

const KIND_COLOR: Record<SessionKind, string> = {
  ruhe: 'var(--surface-3)',
  gehen: 'var(--zone-1)',
  lockerer_lauf: 'var(--zone-2)',
  grundlagenlauf: 'var(--zone-2)',
  longrun_verkuerzt: 'var(--sport-hike)',
  longrun: 'var(--sport-run)',
  intervall_kurz: 'var(--zone-4)',
  intervall: 'var(--zone-5)',
  kraft_leicht: 'var(--sport-mobility)',
  kraft_oberkoerper: 'var(--sport-strength)',
  kraft_ganzkoerper: 'var(--sport-strength)',
};

function HorizonStrip({ plan }: { plan: CoachView }) {
  const [selected, setSelected] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);

  // Beim Öffnen steht heute in der Mitte, nicht am linken Rand.
  useEffect(() => {
    const el = anchorRef.current;
    const box = scroller.current;
    if (!el || !box) return;
    box.scrollLeft = el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2;
  }, []);

  const maxLoad = Math.max(60, ...plan.notes.map((n) => n.load));
  const note = plan.notes.find((n) => n.date === selected) ?? null;

  return (
    <Card tight>
      <div className="row between">
        <div className="t-label">Blickfeld</div>
        <span className="t-caption muted">
          −{plan.horizon.back} bis +{plan.horizon.forward} Tage
        </span>
      </div>

      <div className="horizon-scroll" ref={scroller}>
        {plan.notes.map((n) => (
          <button
            key={n.date}
            type="button"
            ref={n.isAnchor ? anchorRef : undefined}
            className={`horizon-day ${n.isAnchor ? 'is-anchor' : ''} ${selected === n.date ? 'is-selected' : ''}`}
            onClick={() => setSelected(selected === n.date ? null : n.date)}
            aria-pressed={selected === n.date}
            aria-label={`${n.date}, ${n.label}`}
          >
            <span className="horizon-bar-track">
              <span
                className="horizon-bar"
                style={{
                  height: `${Math.max(3, (n.load / maxLoad) * 100)}%`,
                  background: n.kind ? KIND_COLOR[n.kind] : 'var(--surface-3)',
                  // Je weniger Regeln den Tag noch erreichen, desto blasser.
                  opacity: n.reaching.length ? 0.35 + 0.65 * (n.reaching.length / 12) : 0.12,
                }}
              />
            </span>
            <span className="horizon-cycle t-caption">
              {n.cycleDay ? CYCLE_DAY_META[n.cycleDay].short : '–'}
            </span>
            <span className="horizon-date t-caption">{n.date.slice(8)}</span>
          </button>
        ))}
      </div>

      {note ? (
        <div className="horizon-detail mt-3">
          <div className="row between">
            <span className="t-small" style={{ fontWeight: 600 }}>
              {shortDate(note.date)} · {note.label}
            </span>
            <span className="t-caption muted">
              {note.offset === 0
                ? 'heute'
                : note.offset < 0
                  ? `vor ${-note.offset} Tagen`
                  : `in ${note.offset} Tagen`}
            </span>
          </div>
          {note.minutes > 0 && (
            <div className="t-caption secondary mt-1">{note.minutes} Minuten</div>
          )}
          {note.reaching.length ? (
            <>
              <div className="t-caption muted mt-2">Was diesen Tag mit heute verbindet:</div>
              <div className="row wrap gap-2 mt-2">
                {note.reaching.map((r) => (
                  <Pill key={r.id}>{r.label}</Pill>
                ))}
              </div>
            </>
          ) : (
            <div className="t-caption muted mt-2">
              Keine Regel reicht so weit. Dieser Tag beeinflusst heute nichts mehr.
            </div>
          )}
        </div>
      ) : (
        <div className="t-caption muted mt-2">{plan.horizonSummary}</div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Volumen und Stufe
 * ------------------------------------------------------------------ */

function VolumeCard({ plan }: { plan: CoachView }) {
  const { target, stage } = plan;
  const untilDeload = cyclesUntilDeload(plan.anchorCycleIndex);

  return (
    <Card>
      <SectionTitle title="Wo der Plan steht" />
      <div className="coach-facts">
        <div>
          <div className="t-num coach-fact-value">{target.runMinutes}</div>
          <div className="t-caption muted">Laufminuten / 10 Tage</div>
        </div>
        <div>
          <div className="t-num coach-fact-value">{target.phase.id}</div>
          <div className="t-caption muted">{target.phase.span}</div>
        </div>
        <div>
          <div className="t-num coach-fact-value">{stage.stage.id}</div>
          <div className="t-caption muted">Bahnstufe</div>
        </div>
      </div>

      <div className="coach-meter mt-3">
        <div
          className="coach-meter-fill"
          style={{
            width: `${Math.min(100, (target.runMinutes / Math.max(target.phaseTarget, target.runMinutes)) * 100)}%`,
          }}
        />
      </div>
      <div className="t-caption secondary mt-2">{target.reason}</div>

      <div className="mt-3">
        <Disclosure summary={<span className="t-small" style={{ fontWeight: 600 }}>Phase, Stufe, Deload</span>}>
          <div className="t-small secondary">{target.phase.focus}</div>
          <div className="t-small secondary mt-2">{stage.reason}</div>
          <div className="t-small secondary mt-2">{stage.stage.instruction}</div>
          <div className="t-caption muted mt-3">
            {plan.isDeload
              ? 'Dieser Zyklus ist der Deload: 40 % weniger Laufminuten, keine Intensität, Longrun halbiert.'
              : `Nächster Deload in ${untilDeload} ${untilDeload === 1 ? 'Zyklus' : 'Zyklen'}.`}
          </div>
        </Disclosure>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Zonen
 * ------------------------------------------------------------------ */

function ZoneCard({ plan }: { plan: CoachView }) {
  const settings = useStore((s) => s.settings);
  const bounds = settings.coachZones ?? FIXED_ZONES;
  const ranges = useMemo(() => zoneRanges(bounds), [bounds]);
  const retest = retestState(bounds, plan.anchor);
  const lowest = ranges[0].lower;
  const highest = ranges[ranges.length - 1].upper;
  const span = highest - lowest;

  return (
    <Card>
      <SectionTitle title="Zonen" subtitle="Gemessen, nicht gerechnet." />
      <div className="zone-bar">
        {ranges.map((r) => (
          <div
            key={r.zone}
            className={`zone-seg ${plan.today.zone === r.zone ? 'is-active' : ''}`}
            style={
              {
                flexGrow: (r.upper - r.lower) / span,
                '--seg': ZONE_COLORS[r.zone - 1],
              } as React.CSSProperties
            }
          >
            <span className="t-caption">Z{r.zone}</span>
          </div>
        ))}
      </div>
      <div className="row between mt-1">
        <span className="t-caption muted t-num">{lowest}</span>
        <span className="t-caption muted t-num">{highest}</span>
      </div>

      <div className="mt-3">
        <Disclosure summary={<span className="t-small" style={{ fontWeight: 600 }}>Zonen und Nachkalibrierung</span>}>
          <ul className="coach-blocks">
            {ranges.map((r) => (
              <li key={r.zone}>
                <div className="row between gap-3">
                  <span className="t-small" style={{ fontWeight: 600 }}>
                    {r.label}
                  </span>
                  <span className="t-num t-caption">
                    {r.lower}–{r.upper}
                  </span>
                </div>
                <div className="t-caption muted mt-1">{r.feel}</div>
              </li>
            ))}
          </ul>
          <div className="t-small secondary mt-3">{retest.message}</div>
          <div className="t-caption muted mt-2" style={{ fontWeight: 600 }}>
            {TEST_PROTOCOL.title}
          </div>
          <ol className="coach-steps mt-2">
            {TEST_PROTOCOL.steps.map((s) => (
              <li key={s} className="t-caption secondary">
                {s}
              </li>
            ))}
          </ol>
          <div className="t-caption muted mt-2">{TEST_PROTOCOL.caveat}</div>
        </Disclosure>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}.${m}.`;
}

export type { HorizonNote };
