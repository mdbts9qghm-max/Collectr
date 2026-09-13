import { useMemo, useState } from 'react';
import type { ISODate } from '../domain/types.ts';
import type { CoachView } from '../data/derived.ts';
import type { SessionKind } from '../domain/coach/catalogue.ts';
import { CATALOGUE, HARTE_REGEL_LAUFEN } from '../domain/coach/catalogue.ts';
import { rulesReaching } from '../domain/coach/horizon.ts';
import { weeksUntilDeload } from '../domain/coach/phases.ts';
import { CYCLE_DAY_META, formatClock } from '../domain/windows.ts';
import { FIXED_ZONES, TEST_PROTOCOL, zoneRanges } from '../domain/zones.ts';
import { formatDateLong, formatDuration, weekdayShort } from '../domain/format.ts';
import { addDays, diffDays, today as todayIso } from '../domain/date.ts';
import { useCoach, useToday } from '../app/hooks.ts';
import { useStore } from '../data/store.ts';
import {
  Button,
  Card,
  Disclosure,
  Field,
  Pill,
  ReasonList,
  SectionTitle,
  TextInput,
} from '../ui/primitives.tsx';

/**
 * Der Coach.
 *
 * Eine Aufgabe: beim Draufschauen ist klar, was heute zu tun ist. Alles, was
 * erklärt statt anweist, liegt hinter einem Knopf — die Begründung ist wichtig,
 * aber sie ist nie das Erste, was man liest.
 *
 * Darunter das Blickfeld als rollender Streifen. Bewusst kein Monatskalender:
 * ein Kalender hat Kanten, an denen etwas aufhört, und genau das soll dieses
 * Fenster nicht haben. Der Streifen läuft durch, heute steht in der Mitte, und
 * jeder Tag trägt die Regeln, die ihn noch mit heute verbinden. Wo keine mehr
 * reicht, wird der Tag blass — nicht weil er vergessen wurde, sondern weil er
 * nachweislich keinen Einfluss mehr hat.
 */
export function Training() {
  const today = useToday();
  const plan = useCoach(today);

  return (
    <>
      <TodayCard plan={plan} />
      <HorizonStrip plan={plan} today={today} />
      <VolumeCard plan={plan} />
      <ZoneCard />

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

function TodayCard({ plan }: { plan: CoachView }) {
  const today = plan.today;
  const meta = VERDICT_META[today.verdict];
  const day = plan.days.find((d) => d.date === plan.anchor) ?? null;
  const zoneColor = today.zone ? ZONE_COLORS[today.zone - 1] : 'var(--text-muted)';

  return (
    <Card hero className="coach-hero" style={{ borderLeft: `4px solid ${meta.tone}` }}>
      <div className="row between">
        <span className="t-label" style={{ color: meta.tone }}>
          {meta.label}
        </span>
        <div className="row gap-2">
          {today.stepsDown > 0 && (
            <Pill tone="warn">
              {today.stepsDown === 1 ? 'eine Stufe zurück' : `${today.stepsDown} Stufen zurück`}
            </Pill>
          )}
          <Pill
            tone={
              (day?.recovery ?? 0) >= 75 ? 'good' : (day?.recovery ?? 0) >= 45 ? 'warn' : 'bad'
            }
          >
            Erholung {day?.recovery ?? 0}
          </Pill>
        </div>
      </div>

      <h2 className="coach-headline mt-2">{today.headline}</h2>

      {today.zone && (
        <div className="row gap-2 mt-3">
          <span
            className="pill"
            style={{
              background: `color-mix(in srgb, ${zoneColor} 22%, transparent)`,
              borderColor: 'transparent',
              color: 'var(--text)',
            }}
          >
            Z{today.zone} · {today.zoneLabel}
          </span>
          {today.startMinutes != null && <Pill>ab {formatClock(today.startMinutes)}</Pill>}
        </div>
      )}

      {/* Steht Kraft daneben, gehört sie auf dieselbe Karte. */}
      {day?.strength && (
        <div className="t-small secondary mt-3">
          Dazu {CATALOGUE[day.strength.kind].label} · {formatDuration(day.strength.minutes)}
        </div>
      )}

      {today.steps.length > 0 && today.kind !== 'ruhe' && (
        <ul className="coach-steps mt-3">
          {today.steps.map((s) => (
            <li key={s} className="t-small secondary">
              {s}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        <Disclosure summary={<span className="t-label">Warum?</span>}>
          <ReasonList
            reasons={today.reasons.map((r) => ({
              text: `${r.title}: ${r.detail}`,
              impact:
                r.effect === 'sperrt' || r.effect === 'stuft ab' || r.effect === 'begrenzt'
                  ? ('negative' as const)
                  : ('neutral' as const),
            }))}
          />
        </Disclosure>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Das Blickfeld
 * ------------------------------------------------------------------ */

export const KIND_COLOR: Record<SessionKind, string> = {
  ruhe: 'var(--text-muted)',
  gehen: 'var(--zone-1)',
  rad: 'var(--sport-bike)',
  lockerer_lauf: 'var(--zone-2)',
  grundlagenlauf: 'var(--sport-run)',
  longrun_verkuerzt: 'var(--zone-3)',
  longrun: 'var(--accent)',
  intervall_kurz: 'var(--zone-4)',
  intervall: 'var(--zone-5)',
  kraft_leicht: 'var(--sport-mobility)',
  kraft_oberkoerper: 'var(--sport-strength)',
  kraft_ganzkoerper: 'var(--bad)',
};

function HorizonStrip({ plan, today }: { plan: CoachView; today: ISODate }) {
  const [selected, setSelected] = useState<ISODate | null>(null);
  const day = selected ? plan.days.find((d) => d.date === selected) : null;
  const reaching = selected ? rulesReaching(today, selected) : [];

  /*
   * Der Streifen reicht bewusst über das Blickfeld hinaus — drei Tage an jedem
   * Ende. Sonst wäre jeder gezeigte Tag per Definition einer mit Einfluss, und
   * die Kante, um die es hier geht, wäre unsichtbar. Man soll sehen, wo der
   * Einfluss aufhört, nicht nur, dass er irgendwo aufhört.
   */
  const cells = useMemo(() => {
    const first = plan.days[0]?.date ?? today;
    const last = plan.days[plan.days.length - 1]?.date ?? today;
    const out: { date: ISODate; day: (typeof plan.days)[number] | null }[] = [];
    for (let i = 3; i >= 1; i--) out.push({ date: addDays(first, -i), day: null });
    for (const d of plan.days) out.push({ date: d.date, day: d });
    for (let i = 1; i <= 3; i++) out.push({ date: addDays(last, i), day: null });
    return out;
  }, [plan.days, today]);

  return (
    <Card tight>
      <SectionTitle
        title="Blickfeld"
        subtitle="Rollend, nicht nach Kalenderwoche. Ein Tag wird blass, wenn keine Regel ihn mehr mit heute verbindet."
      />
      <div className="horizon-scroll">
        {cells.map(({ date, day: d }) => {
          const rules = rulesReaching(today, date);
          const faded = rules.length === 0;
          return (
            <button
              key={date}
              type="button"
              className={[
                'horizon-day',
                date === today ? 'is-today' : '',
                date === selected ? 'is-selected' : '',
                faded ? 'is-faded' : '',
                d?.done ? 'is-done' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setSelected(selected === date ? null : date)}
              aria-pressed={date === selected}
              aria-label={`${weekdayShort(date)} ${Number(date.slice(8))}.${
                d?.run ? `, ${CATALOGUE[d.run.kind].label}` : ', keine Einheit'
              }${faded ? ', ohne Einfluss auf heute' : ''}`}
            >
              <span className="horizon-dow">{weekdayShort(date)}</span>
              <span className="horizon-num t-num">{Number(date.slice(8))}</span>
              <span className="horizon-shift">
                {d?.cycleDay ? CYCLE_DAY_META[d.cycleDay].short : '–'}
              </span>
              <span className="horizon-marks">
                {d?.run && (
                  <span
                    className="cal-bar"
                    style={{
                      background: KIND_COLOR[d.run.kind],
                      height: Math.max(4, Math.min(22, Math.round(d.run.minutes / 5))),
                    }}
                  />
                )}
                {d?.strength && (
                  <span
                    className="cal-bar"
                    style={{
                      background: KIND_COLOR[d.strength.kind],
                      height: Math.max(4, Math.min(14, Math.round(d.strength.minutes / 5))),
                    }}
                  />
                )}
              </span>
              {date === today && <span className="horizon-today-dot" />}
            </button>
          );
        })}
      </div>

      {day ? (
        <div className="cal-detail mt-3">
          <div className="row between">
            <span className="t-small" style={{ fontWeight: 600 }}>
              {formatDateLong(day.date)}
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
            {day.cycleDay ? CYCLE_DAY_META[day.cycleDay].label : 'Keine Schicht eingetragen'}
            {day.window &&
              ` · Fenster ${formatClock(day.window.start)}–${formatClock(day.window.end)}`}
          </div>

          {day.run || day.strength ? (
            <div className="cal-detail-list mt-2">
              {day.run && (
                <div className="row gap-2">
                  <span className="cal-bar" style={{ background: KIND_COLOR[day.run.kind] }} />
                  <span className="t-small grow">
                    {CATALOGUE[day.run.kind].label} · {formatDuration(day.run.minutes)}
                    {day.run.zone ? ` · Z${day.run.zone}` : ''}
                    {day.run.startMinutes != null ? ` · ab ${formatClock(day.run.startMinutes)}` : ''}
                  </span>
                </div>
              )}
              {day.strength && (
                <div className="row gap-2">
                  <span className="cal-bar" style={{ background: KIND_COLOR[day.strength.kind] }} />
                  <span className="t-small grow">
                    {CATALOGUE[day.strength.kind].label} · {formatDuration(day.strength.minutes)}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="t-caption muted mt-2">Keine Einheit.</div>
          )}

          {day.note && <div className="t-caption muted mt-2">{day.note}</div>}

          <div className="mt-3">
            {reaching.length ? (
              <>
                <div className="t-caption muted">Was diesen Tag mit heute verbindet:</div>
                <div className="row wrap gap-2 mt-2">
                  {reaching.map((r) => (
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
 * Wo der Plan steht
 * ------------------------------------------------------------------ */

function VolumeCard({ plan }: { plan: CoachView }) {
  const untilDeload = weeksUntilDeload(plan.week);

  return (
    <Card>
      <SectionTitle title="Wo der Plan steht" />
      <div className="coach-facts">
        <div>
          <div className="t-num coach-fact-value">{plan.planWeek}</div>
          <div className="t-caption muted">Woche</div>
        </div>
        <div>
          <div className="t-num coach-fact-value">{plan.target.runMinutes}</div>
          <div className="t-caption muted">Laufminuten / 10 Tage</div>
        </div>
        <div>
          <div className="t-num coach-fact-value">{plan.phase.id}</div>
          <div className="t-caption muted">{plan.phase.span}</div>
        </div>
        <div>
          <div className="t-num coach-fact-value">{plan.stage.stage.id}</div>
          <div className="t-caption muted">Bahnstufe</div>
        </div>
      </div>

      <div className="t-caption secondary mt-3">{plan.target.reason}</div>

      {/*
        Wo zwei Vorgaben sich widersprechen, sagt der Coach es — statt eine
        davon still fallen zu lassen. Das ist der Unterschied zwischen einem
        Plan, dem man glauben kann, und einem, der immer recht hat.
      */}
      {plan.conflict && (
        <div className="callout mt-3 warn">
          <div className="t-heading">Zwei Vorgaben gleichzeitig gehen hier nicht</div>
          <div className="t-small secondary mt-2">{plan.conflict}</div>
        </div>
      )}

      <div className="t-caption muted mt-2">
        Zone 2: {Math.round(plan.zone2Share * 100)} % der Laufminuten.
      </div>

      <div className="mt-3">
        <Disclosure summary={<span className="t-small" style={{ fontWeight: 600 }}>Phase, Stufe, Entlastung</span>}>
          <div className="t-small secondary">{plan.phase.focus}</div>
          <div className="t-small secondary mt-2">{plan.stage.reason}</div>
          <div className="t-small secondary mt-2">{plan.stage.stage.instruction}</div>
          <div className="t-small secondary mt-2">{plan.strengthTarget.reason}</div>
          <div className="t-caption muted mt-3">
            {plan.isDeloadWeek
              ? 'Diese Woche ist die Entlastung: Laufminuten −40 %, keine harte Einheit, langer Lauf halbiert.'
              : `Nächste Entlastungswoche in ${untilDeload} ${untilDeload === 1 ? 'Woche' : 'Wochen'}.`}
          </div>
        </Disclosure>
      </div>

      <PlanSettings plan={plan} />
    </Card>
  );
}

/**
 * Die zwei Werte, die der Coach nicht herleiten kann.
 *
 * Sie stehen hier und nicht im Profil, weil sie die Zahlen zwei Zeilen weiter
 * oben verschieben. Eine Einstellung, deren Wirkung man sofort sieht, stellt man
 * einmal richtig ein statt dreimal falsch.
 */
function PlanSettings({ plan }: { plan: CoachView }) {
  const trainingStart = useStore((s) => s.settings.trainingStart);
  const startRunMinutes = useStore((s) => s.settings.startRunMinutes);
  const updateSettings = useStore((s) => s.updateSettings);
  const toast = useStore((s) => s.toast);
  const today = todayIso();
  const measured = plan.target.measured;

  return (
    <>
      <div className="divider mt-3" />
      <div className="grid-2">
        <Field label="Woche 1 beginnt am" hint="Bestimmt Phase, Stufen und Entlastungsrhythmus.">
          <TextInput
            type="date"
            max={today}
            value={trainingStart ?? plan.planStart}
            onChange={(e) => {
              if (!e.target.value) return;
              updateSettings({ trainingStart: e.target.value });
              toast('Planbeginn gesetzt', 'good');
            }}
          />
        </Field>
        <Field
          label="Startvolumen (min / 10 Tage)"
          hint="Wie viel du gerade läufst. Gilt, bis zehn Tage erfasst sind."
        >
          <TextInput
            type="number"
            inputMode="numeric"
            min={0}
            step={10}
            value={startRunMinutes ?? ''}
            placeholder="150"
            onChange={(e) => {
              const value = Number(e.target.value);
              updateSettings({ startRunMinutes: Number.isFinite(value) && value > 0 ? value : null });
            }}
          />
        </Field>
      </div>
      <div className="t-caption muted">
        {measured != null ? (
          <>
            Gemessen: {measured} Laufminuten in den zehn Tagen davor. Das Startvolumen spielt keine
            Rolle mehr — der Plan rechnet mit dem, was du wirklich gelaufen bist.
          </>
        ) : (
          <>
            Noch nichts zu messen. Sobald zehn Tage mit erfassten Läufen vorliegen, ersetzt die
            Messung diese Angabe.
          </>
        )}
        {!trainingStart && ` Planbeginn ist angenommen, nicht angegeben: ${formatDateLong(plan.planStart)}.`}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Zonen
 * ------------------------------------------------------------------ */

function ZoneCard() {
  const bounds = useStore((s) => s.settings.hrZones) ?? FIXED_ZONES;
  const ranges = useMemo(() => zoneRanges(bounds), [bounds]);
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
            className="zone-seg"
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
          <div className="t-caption muted mt-3" style={{ fontWeight: 600 }}>
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

export { Button };
