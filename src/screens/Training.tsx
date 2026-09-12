import { useMemo, useState } from 'react';
import type { TodayDecision } from '../domain/coach/coach.ts';
import type { ISODate } from '../domain/types.ts';
import type { CoachView } from '../data/derived.ts';
import type { SessionKind } from '../domain/coach/catalogue.ts';
import { CATALOGUE, HARTE_REGEL_LAUFEN } from '../domain/coach/catalogue.ts';
import { FIXED_ZONES, TEST_PROTOCOL, retestState, zoneRanges } from '../domain/coach/zones.ts';
import { CYCLE_DAY_META, formatClock } from '../domain/coach/windows.ts';
import {
  addDays,
  dateRange,
  diffDays,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
} from '../domain/date.ts';
import { cyclesUntilDeload } from '../domain/coach/phases.ts';
import { useCoach, useToday } from '../app/hooks.ts';
import { useStore } from '../data/store.ts';
import { Card, Disclosure, Pill, SectionTitle } from '../ui/primitives.tsx';
import { IconChevronLeft } from '../ui/icons.tsx';

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

  /*
   * Der Kalender darf über das Blickfeld hinausblättern. Liegt der gezeigte
   * Monat außerhalb, wird der Coach für dessen Mitte gerechnet — sonst stünde
   * dort ein leerer Monat, obwohl die Rotation längst feststeht.
   */
  const [month, setMonth] = useState<ISODate>(today);
  const monthAnchor = month.slice(0, 7) === today.slice(0, 7) ? today : `${month.slice(0, 7)}-15`;
  const monthPlan = useCoach(monthAnchor);

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
      <CoachCalendar monthPlan={monthPlan} today={today} month={month} onMonth={setMonth} />
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

      {today.kind === 'ruhe' && today.strength?.kind && (
        <div className="coach-facts mt-4">
          <div>
            <div className="t-num coach-fact-value">{today.strength.minutes}</div>
            <div className="t-caption muted">Minuten</div>
          </div>
          <div>
            <div className="t-num coach-fact-value">RPE {today.strength.rpe}</div>
            <div className="t-caption muted">~{today.strength.percentOfMax} % vom Maximum</div>
          </div>
          {today.window && (
            <div>
              <div className="t-num coach-fact-value">{formatClock(today.window.start)}</div>
              <div className="t-caption muted">bis {formatClock(today.window.end)}</div>
            </div>
          )}
        </div>
      )}

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
 * Der Kalender
 * ------------------------------------------------------------------ */

/*
 * Jede Einheitenart braucht eine eigene Farbe, sonst ist der Kalender eine
 * Behauptung statt einer Auskunft. Zwei Paare waren derselbe Ton: `--zone-4` und
 * `--sport-run` (verkürzte Bahneinheit sah aus wie ein Longrun), sowie
 * `--sport-mobility` und `--zone-2` (Mobilität sah aus wie ein Grundlagenlauf).
 */
export const KIND_COLOR: Record<SessionKind, string> = {
  ruhe: 'var(--surface-3)',
  gehen: 'var(--zone-1)',
  lockerer_lauf: 'var(--zone-2)',
  grundlagenlauf: 'var(--zone-2)',
  longrun_verkuerzt: 'var(--sport-hike)',
  longrun: 'var(--sport-run)',
  intervall_kurz: 'var(--sport-other)',
  intervall: 'var(--zone-5)',
  kraft_leicht: 'var(--sport-swim)',
  kraft_oberkoerper: 'var(--sport-strength)',
  kraft_ganzkoerper: 'var(--sport-strength)',
};

const SHIFT_COLOR: Record<number, string> = {
  1: 'var(--shift-day)',
  2: 'var(--shift-night)',
  3: 'var(--shift-sleep)',
  4: 'var(--shift-off)',
  5: 'var(--shift-off)',
};

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/*
 * Vollständig: jede Farbe, die im Raster auftauchen kann, steht hier. Eine
 * Legende, die eine Farbe auslässt, ist schlimmer als keine — man sucht dann
 * nach etwas, das es nicht gibt.
 */
export const LEGEND: { kind: SessionKind; label: string }[] = [
  { kind: 'grundlagenlauf', label: 'Grundlage' },
  { kind: 'longrun', label: 'Longrun' },
  { kind: 'longrun_verkuerzt', label: 'Longrun kurz' },
  { kind: 'intervall', label: 'Bahn' },
  { kind: 'intervall_kurz', label: 'Bahn kurz' },
  { kind: 'gehen', label: 'Gehen' },
  { kind: 'kraft_ganzkoerper', label: 'Kraft' },
  { kind: 'kraft_leicht', label: 'Mobilität' },
];

/**
 * Schicht und Einheit im Monatsraster.
 *
 * Der Fünf-Tage-Rhythmus läuft durch die Sieben-Tage-Woche — im Monatsraster
 * sieht man diese Wanderung, und damit auch, warum der Longrun nicht jede Woche
 * am selben Wochentag liegt. Das ist der eigentliche Grund für die Kalenderform:
 * eine Wochenansicht würde die Rotation verstecken, die den ganzen Plan bestimmt.
 *
 * Das Einflussfenster ist damit nicht weg. Es steckt in der Tagesansicht: welche
 * Regeln einen angetippten Tag noch mit heute verbinden, steht dort — nur nicht
 * mehr als eigene Zeitleiste, sondern dort, wo man ohnehin hinschaut.
 */
function CoachCalendar({
  monthPlan,
  today,
  month,
  onMonth,
}: {
  monthPlan: CoachView;
  today: ISODate;
  month: ISODate;
  onMonth: (m: ISODate) => void;
}) {
  const [selected, setSelected] = useState<ISODate | null>(null);

  const byDate = useMemo(
    () => new Map(monthPlan.timeline.days.map((d) => [d.date, d])),
    [monthPlan],
  );
  const noteByDate = useMemo(
    () => new Map(monthPlan.notes.map((n) => [n.date, n])),
    [monthPlan],
  );

  // Ganze Wochen, damit das Raster nicht mitten in einer Zeile anfängt.
  const cells = useMemo(
    () => dateRange(startOfWeek(startOfMonth(month), 1), endOfWeek(endOfMonth(month), 1)),
    [month],
  );

  const inMonth = (d: ISODate) => d.slice(0, 7) === month.slice(0, 7);
  const day = selected ? byDate.get(selected) : null;
  const note = selected ? noteByDate.get(selected) : null;

  /*
   * Der Kalender fängt bei heute an. Was davor liegt, bleibt als leere Zelle
   * stehen, damit die Wochentage in Spalten bleiben — nur so sieht man, wie der
   * Fünf-Tage-Rhythmus durch die Sieben-Tage-Woche wandert.
   *
   * Die Rückschau des Coaches ist davon unberührt: er schaut für seine Regeln
   * weiterhin 27 Tage zurück. Sie steht nur nicht mehr im Raster, weil dort
   * nichts zu entscheiden ist.
   */
  const atCurrentMonth = month.slice(0, 7) === today.slice(0, 7);

  return (
    <Card tight>
      <div className="row between">
        <button
          type="button"
          className="cal-nav"
          onClick={() => onMonth(addDays(startOfMonth(month), -1))}
          aria-label="Voriger Monat"
          disabled={atCurrentMonth}
          style={atCurrentMonth ? { opacity: 0.25 } : undefined}
        >
          <IconChevronLeft size={17} />
        </button>
        <div className="col center">
          <div className="t-label">{monthName(month)}</div>
          {month.slice(0, 7) !== today.slice(0, 7) && (
            <button type="button" className="t-caption accent-text" onClick={() => onMonth(today)}>
              zu heute
            </button>
          )}
        </div>
        <button
          type="button"
          className="cal-nav"
          onClick={() => onMonth(addDays(endOfMonth(month), 1))}
          aria-label="Nächster Monat"
        >
          <span style={{ display: 'grid', transform: 'rotate(180deg)' }}>
            <IconChevronLeft size={17} />
          </span>
        </button>
      </div>

      <div className="cal-grid cal-head mt-3">
        {WEEKDAYS.map((w) => (
          <span key={w} className="cal-dow">
            {w}
          </span>
        ))}
      </div>

      <div className="cal-grid mt-1">
        {cells.map((date) => {
          const d = byDate.get(date);
          const isToday = date === today;

          // Vergangene Tage halten nur die Spalte, sie sagen nichts mehr.
          if (date < today) {
            return (
              <div key={date} className="cal-cell is-past" aria-hidden="true">
                <span className="cal-num t-num">{Number(date.slice(8))}</span>
              </div>
            );
          }

          return (
            <button
              key={date}
              type="button"
              className={[
                'cal-cell',
                inMonth(date) ? '' : 'is-outside',
                isToday ? 'is-today' : '',
                selected === date ? 'is-selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setSelected(selected === date ? null : date)}
              aria-pressed={selected === date}
              aria-label={`${Number(date.slice(8))}. ${monthName(date)}${
                d?.run ? `, ${CATALOGUE[d.run.kind].label}` : ''
              }`}
            >
              <span className="cal-num t-num">{Number(date.slice(8))}</span>
              {d?.cycleDay ? (
                <span
                  className="cal-shift"
                  style={{
                    background: `color-mix(in srgb, ${
                      d.isVShift ? 'var(--shift-v)' : SHIFT_COLOR[d.cycleDay]
                    } 26%, transparent)`,
                    color: d.isVShift ? 'var(--shift-v)' : SHIFT_COLOR[d.cycleDay],
                  }}
                >
                  {d.isVShift ? 'V' : CYCLE_DAY_META[d.cycleDay].short}
                </span>
              ) : (
                <span className="cal-shift cal-shift-empty">–</span>
              )}
              <span className="cal-marks">
                {d?.run && (
                  <span className="cal-bar" style={{ background: KIND_COLOR[d.run.kind] }} />
                )}
                {d?.strength && (
                  <span
                    className="cal-bar cal-bar-thin"
                    style={{ background: KIND_COLOR[d.strength.kind] }}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="cal-legend mt-3">
        {LEGEND.map((l) => (
          <span key={l.kind} className="cal-legend-item">
            <span className="cal-bar" style={{ background: KIND_COLOR[l.kind], width: 12 }} />
            <span className="t-caption muted">{l.label}</span>
          </span>
        ))}
      </div>

      {day ? (
        <div className="cal-detail mt-3">
          <div className="row between">
            <span className="t-small" style={{ fontWeight: 600 }}>
              {longDate(day.date)}
            </span>
            <span className="t-caption muted">
              {day.date === today
                ? 'heute'
                : day.date < today
                  ? `vor ${diffDays(today, day.date)} Tagen`
                  : `in ${diffDays(day.date, today)} Tagen`}
            </span>
          </div>

          <div className="t-caption secondary mt-1">
            {shiftLine(day)}
            {day.window && ` · Fenster ${formatClock(day.window.start)}–${formatClock(day.window.end)}`}
          </div>

          {day.run || day.strength ? (
            <div className="cal-detail-list mt-2">
              {day.run && (
                <div className="row gap-2">
                  <span className="cal-bar" style={{ background: KIND_COLOR[day.run.kind] }} />
                  <span className="t-small grow">
                    {CATALOGUE[day.run.kind].label} · {day.run.minutes} min
                    {day.run.zone ? ` · Z${day.run.zone}` : ''}
                    {day.run.startMinutes != null ? ` · ab ${formatClock(day.run.startMinutes)}` : ''}
                  </span>
                </div>
              )}
              {day.strength && (
                <div className="row gap-2">
                  <span
                    className="cal-bar"
                    style={{ background: KIND_COLOR[day.strength.kind] }}
                  />
                  <span className="t-small grow">
                    {CATALOGUE[day.strength.kind].label} · {day.strength.minutes} min
                    {day.strength.startMinutes != null
                      ? ` · ab ${formatClock(day.strength.startMinutes)}`
                      : ''}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="t-caption muted mt-2">
              {day.cycleDay === 1
                ? 'Tagschicht 07:00–19:00 — kein Trainingsfenster.'
                : 'Keine Einheit geplant.'}
            </div>
          )}

          {/*
            Das Tagesbudget im Klartext. Es entscheidet, ob der Tag eine zweite
            Einheit trägt, und es soll nachrechenbar sein statt geglaubt werden.
          */}
          {day.secondUnit && day.window && (
            <div className="t-caption muted mt-2">{day.secondUnit.reason}</div>
          )}

          {/*
            Das Einflussfenster, an der Stelle, wo man ohnehin hinschaut: welche
            Regeln diesen Tag noch mit heute verbinden.
          */}
          {note && (
            <div className="mt-3">
              {note.reaching.length ? (
                <>
                  <div className="t-caption muted">Was diesen Tag mit heute verbindet:</div>
                  <div className="row wrap gap-2 mt-2">
                    {note.reaching.map((r) => (
                      <Pill key={r.id}>{r.label}</Pill>
                    ))}
                  </div>
                </>
              ) : (
                <div className="t-caption muted">
                  Keine Regel reicht so weit. Dieser Tag beeinflusst heute nichts mehr.
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="t-caption muted mt-3">
          Tippe einen Tag an: Schicht, Fenster, Einheit — und welche Regeln ihn noch mit heute
          verbinden.
        </div>
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

      <div className="coach-facts mt-3">
        <div>
          <div className="t-num coach-fact-value">{plan.strengthTarget.minutes}</div>
          <div className="t-caption muted">Kraftminuten / 10 Tage</div>
        </div>
        <div>
          <div className="t-num coach-fact-value">{plan.strengthStage.stage.id}</div>
          <div className="t-caption muted">Kraftstufe</div>
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
          <div className="t-small secondary mt-2">{plan.strengthTarget.reason}</div>
          <div className="t-small secondary mt-2">{plan.strengthStage.reason}</div>
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

const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

function monthName(iso: string): string {
  return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

/**
 * Schichtart und Dienstzeit in einer Zeile.
 *
 * Die freien Tage tragen in der Tabelle „frei" als Dienstzeit — angehängt an
 * ihr Etikett ergäbe das „Frei · frei". Wo es keine Dienstzeit gibt, steht
 * deshalb nur das Etikett.
 */
function shiftLine(day: { cycleDay: number | null; isVShift: boolean }): string {
  if (day.isVShift) return 'V-Schicht · 08:00–20:00';
  if (day.cycleDay == null) return 'Keine Schicht eingetragen';
  const meta = CYCLE_DAY_META[day.cycleDay];
  return meta.shift === 'frei' ? `${meta.label}, kein Dienst` : `${meta.label} · ${meta.shift}`;
}

function longDate(iso: string): string {
  return `${Number(iso.slice(8))}. ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
}
