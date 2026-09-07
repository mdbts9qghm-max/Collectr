import { useState } from 'react';
import type { ISODate } from '../domain/types.ts';
import type { PlannedUnit, DayPlan } from '../domain/aerobic/planner.ts';
import type { Mode } from '../domain/aerobic/catalogue.ts';
import { CATALOGUE, MODE_META } from '../domain/aerobic/catalogue.ts';
import { CYCLE_DAY_META, formatClock } from '../domain/aerobic/windows.ts';
import { RECOVERY_BAND_META } from '../domain/aerobic/recovery.ts';
import { MIN_BASE_SHARE } from '../domain/aerobic/volume.ts';
import { ZONE_TABLE, SUBJECTIVE_GUIDANCE, thresholdFor, zoneRanges } from '../domain/aerobic/zones.ts';
import { ruleById } from '../domain/aerobic/rules.ts';
import { formatDateShort, weekdayShort } from '../domain/format.ts';
import { useAerobicPlan, useData, useToday } from '../app/hooks.ts';
import { useStore } from '../data/store.ts';
import { Card, Disclosure, Pill, SectionTitle, Segmented } from '../ui/primitives.tsx';

/**
 * The training tab.
 *
 * Organised by cycle, not by calendar week: the rotation is five days long and
 * walks through the week, so the same weekday means something different every
 * time. What the athlete needs to see is where they are in the rotation, what
 * the session is, and — because this plan is multimodal — which mode it is in
 * and what changing that would cost the running total.
 */
export function Training() {
  const today = useToday();
  const data = useData();
  const [selected, setSelected] = useState<ISODate>(today);
  const plan = useAerobicPlan(today, 2);
  const [view, setView] = useState<'cycle' | 'progress'>('cycle');

  const { macrocycle } = plan;
  const runThreshold = thresholdFor(data.settings.thresholdTests, 'run');
  const updateSettings = useStore((s) => s.updateSettings);
  const toast = useStore((s) => s.toast);

  const setMode = (date: ISODate, slotId: string, mode: Mode) => {
    const key = `${date}:${slotId}`;
    const next = { ...data.settings.modeOverrides };
    // Choosing the mode the template already had clears the override rather
    // than storing a redundant one.
    const planned = plan.days.find((d) => d.date === date)?.units.find((u) => u.slotId === slotId);
    if (planned?.mode === mode) delete next[key];
    else next[key] = mode;
    updateSettings({ modeOverrides: next });
    toast(`Auf ${MODE_META[mode].label} umgestellt`, 'good');
  };

  return (
    <>
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: 'cycle', label: 'Zyklus' },
          { value: 'progress', label: 'Fortschritt' },
        ]}
      />

      {view === 'progress' ? (
        <Progress plan={plan} thresholdHr={runThreshold} tests={data.settings.thresholdTests} />
      ) : (
        <>
          {/* ---------- Where we are ---------- */}
          <Card tight>
            <div className="row between">
              <span className="row gap-2">
                <span className="t-label">
                  Phase {macrocycle.target.phase.key} · {macrocycle.target.phase.label}
                </span>
                {macrocycle.block && <Pill tone="accent">{macrocycle.block.label}</Pill>}
              </span>
              <span className="t-caption muted t-num">Makrozyklus {macrocycle.index + 1}</span>
            </div>
            <div className="t-caption muted mt-2">{macrocycle.target.phase.focus}</div>
            {macrocycle.block && (
              <div className="t-caption muted mt-1">{macrocycle.block.emphasis}</div>
            )}
            <div className="t-caption mt-3">
              Bahnstufe {macrocycle.stage.stage.key} — {macrocycle.stage.stage.label}
            </div>
          </Card>

          <ZoneBar plan={plan} />

          {!runThreshold && (
            <Card tight>
              <div className="t-label">Noch keine Schwelle gemessen</div>
              <div className="t-small secondary mt-2">
                Bis zum ersten 30-Minuten-Test steuert die App über die Belastung, nicht über
                Herzfrequenz: Zone 2 ist die Intensität, bei der ein vollständiger Satz sprechbar
                bleibt.
              </div>
            </Card>
          )}

          {plan.warnings.map((w) => (
            <Card key={w} tight style={{ background: 'var(--warn-soft)', borderColor: 'transparent' }}>
              <div className="row gap-3 row-top">
                <span style={{ fontSize: 15 }}>⚠️</span>
                <span className="t-small grow">{w}</span>
              </div>
            </Card>
          ))}

          {plan.cycles.map((cycle) => (
            <Card key={cycle.index} flush>
              <div className="row between" style={{ padding: 'var(--s3) var(--s3) 0' }}>
                <span className="row gap-2">
                  <span className="t-label">Zyklus {cycle.type}</span>
                  <Pill tone={cycle.isDeload ? 'warn' : undefined}>
                    {cycle.isDeload ? 'Deload' : `${cycle.position} von 2`}
                  </Pill>
                </span>
                <span className="t-caption muted t-num">{cycle.load} Punkte</span>
              </div>
              <div className="list">
                {cycle.days.map((day) => (
                  <DayRow
                    key={day.date}
                    day={day}
                    today={today}
                    thresholdHr={runThreshold}
                    selected={day.date === selected}
                    onSelect={() => setSelected(day.date)}
                    onMode={(slotId, mode) => setMode(day.date, slotId, mode)}
                  />
                ))}
              </div>
            </Card>
          ))}

          {!plan.extension.active && (
            <Card tight>
              <div className="t-label">Volumenerweiterung</div>
              <div className="t-small secondary mt-2">{plan.extension.reason}</div>
              <div className="t-caption muted mt-2">
                Zusätzliche Fenster gibt es nur in Zone 1 und 2 — mehr Volumen wird nie über
                Intensität erzeugt. Einschalten im Profil.
              </div>
            </Card>
          )}
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Zone distribution with the 80 % mark
 * ------------------------------------------------------------------ */

function ZoneBar({ plan }: { plan: ReturnType<typeof useAerobicPlan> }) {
  const { macrocycle } = plan;
  const units = plan.days.flatMap((d) => d.units).filter((u) => CATALOGUE[u.kind].discipline === 'aerobic');
  const total = units.reduce((sum, u) => sum + u.durationMinutes, 0) || 1;

  const byZone = (['z1', 'z2', 'z3', 'z4', 'z5'] as const).map((zone) => ({
    zone,
    minutes: units.filter((u) => u.zone === zone).reduce((sum, u) => sum + u.durationMinutes, 0),
  }));

  const met = macrocycle.baseShare >= MIN_BASE_SHARE;

  return (
    <Card tight>
      <div className="row between">
        <span className="t-label">Zonenverteilung im Makrozyklus</span>
        <span className="t-small t-num" style={{ color: met ? 'var(--good)' : 'var(--warn)' }}>
          {Math.round(macrocycle.baseShare * 100)} % Z1–Z2
        </span>
      </div>

      {/*
        The 80 % mark is drawn on the bar rather than written under it, because
        this rule sits above every other volume goal — it should be impossible to
        read the bar without seeing whether it is met.
      */}
      <div className="zone-bar mt-3">
        {byZone.map(({ zone, minutes }) => (
          <span
            key={zone}
            className={`zone-seg zone-${zone}`}
            style={{ width: `${(minutes / total) * 100}%` }}
            title={`${ZONE_TABLE[zone].label}: ${minutes} min`}
          />
        ))}
        <span className="zone-mark" style={{ left: `${MIN_BASE_SHARE * 100}%` }} />
      </div>
      <div className="row between mt-2 t-caption muted">
        <span>{macrocycle.aerobicMinutes} min aerob</span>
        <span>
          🏃 {macrocycle.runMinutes} · 🚴 {macrocycle.crossMinutes} min
        </span>
      </div>
      {macrocycle.spilledToCross > 0 && (
        <div className="t-caption muted mt-2">
          {macrocycle.spilledToCross} min, die das Laufen nicht hergibt, laufen auf dem Rad weiter —
          das aerobe Ziel wird nicht gekürzt.
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * One day of the cycle
 * ------------------------------------------------------------------ */

function DayRow({
  day,
  today,
  selected,
  thresholdHr,
  onSelect,
  onMode,
}: {
  day: DayPlan;
  today: ISODate;
  selected: boolean;
  thresholdHr: number | null;
  onSelect: () => void;
  onMode: (slotId: string, mode: Mode) => void;
}) {
  const [open, setOpen] = useState(false);
  const meta = day.cycleDay ? CYCLE_DAY_META[day.cycleDay] : null;
  const known = day.recovery.known;
  const band = known
    ? RECOVERY_BAND_META[day.recovery.band]
    : { label: 'unbekannt', color: 'var(--text-muted)', advice: 'Trag die Schicht ein, dann plant die App den Tag mit.' };
  const isPast = day.date < today;

  return (
    <div className={`cycle-day ${selected ? 'selected' : ''} ${isPast ? 'past' : ''}`}>
      <button
        type="button"
        className="cycle-day-head"
        onClick={() => {
          onSelect();
          setOpen((o) => !o);
        }}
        aria-expanded={open}
      >
        <span className="cycle-badge" style={{ borderColor: band.color, color: band.color }}>
          {day.isVShift ? 'V' : (meta?.short ?? '–')}
        </span>
        <span className="grow left" style={{ minWidth: 0 }}>
          <span className="row gap-2">
            <span className="t-small" style={{ fontWeight: 620 }}>
              {weekdayShort(day.date)}, {formatDateShort(day.date)}
            </span>
            {day.date === today && <Pill tone="accent">heute</Pill>}
          </span>
          <span className="t-caption muted" style={{ display: 'block' }}>
            {day.isVShift ? 'V-Schicht' : (meta?.label ?? 'keine Schicht')} ·{' '}
            <span style={{ color: band.color }}>
              {known ? `Erholung ${day.recovery.value}` : 'Erholung unbekannt'}
            </span>
          </span>
        </span>
        <span className="t-caption muted t-num">{day.load > 0 ? day.load : '–'}</span>
      </button>

      {/* Sleep gets its own row: on a rotation it is the fixed point everything
          else is planned around, not a detail of the session. */}
      {day.windows && (
        <div className="cycle-sleep">
          <span>😴</span>
          <span>
            {formatClock(day.windows.sleepStart)}–{formatClock(day.windows.sleepEnd)}
            {day.windows.nap &&
              ` · Vorschlaf ${formatClock(day.windows.nap.start)}–${formatClock(day.windows.nap.end)}`}
          </span>
          <span className="grow" />
          <span>{(day.windows.sleepTargetMinutes / 60).toFixed(1)} h Ziel</span>
        </div>
      )}

      {day.units.map((unit) => (
        <UnitRow
          key={unit.slotId}
          unit={unit}
          thresholdHr={thresholdHr}
          onMode={(mode) => onMode(unit.slotId, mode)}
        />
      ))}

      {day.units.length === 0 && (
        <div className="cycle-unit muted t-caption">
          {!known
            ? 'Keine Schicht eingetragen — dieser Tag wird nicht verplant'
            : day.cycleDay === 1
              ? 'Ruhetag — 12 h Dienst, kein Ersatztraining'
              : 'Kein Trainingsfenster'}
        </div>
      )}

      {day.violations.map((v) => (
        <div key={v.rule} className="cycle-warn t-caption">
          ⚠️ {v.message}
          <span className="muted"> — {ruleById(v.rule)?.description}</span>
        </div>
      ))}

      {open && (
        <div className="cycle-explain">
          <div className="t-caption">{band.advice}</div>
          {known && (
            <>
              <div className="divider mt-3 mb-3" />
              <div className="t-label mb-2">Erholungswert {day.recovery.value}</div>
              <div className="t-caption muted">Basis {day.recovery.base}</div>
              {day.recovery.adjustments.map((a) => (
                <div key={a.label} className="row between t-caption">
                  <span className="muted">{a.label}</span>
                  <span className={a.delta >= 0 ? 'good t-num' : 'bad t-num'}>
                    {a.delta > 0 ? '+' : ''}
                    {a.delta}
                  </span>
                </div>
              ))}
              {day.recovery.manualMode && (
                <div className="t-caption muted mt-2">
                  Manueller Modus — noch zu wenig Gerätehistorie für eine automatische Abstufung.
                </div>
              )}
            </>
          )}
          {day.units.flatMap((u) => u.reasons).length > 0 && (
            <>
              <div className="divider mt-3 mb-3" />
              <div className="t-label mb-2">Warum diese Einheit</div>
              {day.units.flatMap((u) => u.reasons).map((r, i) => (
                <div key={i} className="t-caption muted">
                  · {r}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function UnitRow({
  unit,
  thresholdHr,
  onMode,
}: {
  unit: PlannedUnit;
  thresholdHr: number | null;
  onMode: (mode: Mode) => void;
}) {
  const spec = CATALOGUE[unit.kind];
  const range = zoneRanges(thresholdHr).find((r) => r.zone === unit.zone);
  const modes: Mode[] = spec.modes;

  if (unit.blocked) {
    return (
      <div className="cycle-unit">
        <span style={{ fontSize: 16 }}>🚫</span>
        <span className="grow t-caption bad">{unit.blocked}</span>
      </div>
    );
  }

  return (
    <div className="cycle-unit col" style={{ alignItems: 'stretch' }}>
      <div className="row gap-3">
        <span style={{ fontSize: 16 }}>{unit.mode ? MODE_META[unit.mode].icon : '💪'}</span>
        <span className="grow" style={{ minWidth: 0 }}>
          <span className="t-small" style={{ fontWeight: 580, display: 'block' }}>
            {spec.label}
            {unit.fromExtension && <span className="t-caption muted"> · Erweiterung</span>}
          </span>
          <span className="t-caption muted">
            {formatClock(unit.start)}–{formatClock(unit.start + unit.durationMinutes)} ·{' '}
            {unit.durationMinutes} min · {ZONE_TABLE[unit.zone].label}
            {range?.fromBpm ? ` (${range.fromBpm}–${range.toBpm ?? '∞'} bpm)` : ''}
          </span>
        </span>
      </div>

      {unit.interval && (
        <div className="t-caption mt-2" style={{ paddingLeft: 28 }}>
          <span style={{ fontWeight: 560 }}>{unit.interval.label}</span>
          {unit.interval.notes.map((n) => (
            <div key={n} className="muted">
              · {n}
            </div>
          ))}
        </div>
      )}

      {unit.appendix && (
        <div className="t-caption muted mt-1" style={{ paddingLeft: 28 }}>
          · {unit.appendix}
        </div>
      )}

      {unit.downgradedFrom && (
        <div className="t-caption warn mt-1" style={{ paddingLeft: 28 }}>
          Abgestuft von {CATALOGUE[unit.downgradedFrom.kind].label}
          {unit.downgradedFrom.mode ? ` (${MODE_META[unit.downgradedFrom.mode].label})` : ''}
        </div>
      )}

      {!range?.fromBpm && (
        <div className="t-caption muted mt-1" style={{ paddingLeft: 28 }}>
          {SUBJECTIVE_GUIDANCE[unit.zone]}
        </div>
      )}

      {/*
        The mode is switchable per session, and the switch says what it costs:
        moving a run onto the bike takes those minutes out of the macrocycle's
        running total. That is the trade the athlete is actually making.
      */}
      {modes.length > 1 && (
        <div className="mode-switch mt-2" style={{ marginLeft: 28 }}>
          {modes.map((m) => (
            <button
              key={m}
              type="button"
              className={`mode-chip ${unit.mode === m ? 'active' : ''}`}
              onClick={() => onMode(m)}
              aria-pressed={unit.mode === m}
              title={
                m === 'run'
                  ? `+${unit.durationMinutes} min Laufen im Makrozyklus`
                  : unit.mode === 'run'
                    ? `−${unit.durationMinutes} min Laufen, dieselbe aerobe Wirkung`
                    : 'ohne Stoßbelastung'
              }
            >
              {MODE_META[m].icon} {MODE_META[m].label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Progress markers
 * ------------------------------------------------------------------ */

function Progress({
  plan,
  thresholdHr,
  tests,
}: {
  plan: ReturnType<typeof useAerobicPlan>;
  thresholdHr: number | null;
  tests: { date: string; mode: string; thresholdHr: number }[];
}) {
  return (
    <>
      <SectionTitle
        title="Fortschritt"
        subtitle="Physiologische Marker über Monate — keine Punkte, keine Serien, keine Abzeichen."
      />

      <Card>
        <div className="t-label">Schwellenherzfrequenz</div>
        {thresholdHr ? (
          <>
            <div className="t-title mt-2 t-num">{thresholdHr} bpm</div>
            <div className="divider mt-3 mb-3" />
            {zoneRanges(thresholdHr).map((r) => (
              <div key={r.zone} className="row between t-caption">
                <span className="muted">
                  {ZONE_TABLE[r.zone].label} · {ZONE_TABLE[r.zone].purpose}
                </span>
                <span className="t-num">
                  {r.fromBpm}
                  {r.toBpm ? `–${r.toBpm}` : '+'} bpm
                </span>
              </div>
            ))}
          </>
        ) : (
          <div className="t-small secondary mt-2">
            Noch nicht gemessen. 30-Minuten-Zeitfahren im gleichmäßig höchsten Tempo, die
            Durchschnittsfrequenz der letzten 20 Minuten ist deine Schwelle. Frühestens nach
            Phase P0 — vorher gibt es nichts Stabiles zu messen.
          </div>
        )}
        <div className="t-caption muted mt-3">
          Zonen aus der Schwelle, nicht aus der Maximalfrequenz: Formeln für die Maximalfrequenz
          liegen um zehn Schläge und mehr daneben, und das ist breiter als die Zonen selbst.
        </div>
      </Card>

      <Card tight>
        <Disclosure summary={<span className="t-label">Bisherige Tests</span>}>
          <div className="mt-2">
            {tests.length === 0 ? (
              <div className="t-caption muted">Noch keine Tests erfasst.</div>
            ) : (
              tests.map((t) => (
                <div key={t.date + t.mode} className="row between t-caption">
                  <span className="muted">
                    {formatDateShort(t.date)} · {t.mode === 'run' ? 'Laufen' : 'Rad'}
                  </span>
                  <span className="t-num">{t.thresholdHr} bpm</span>
                </div>
              ))
            )}
          </div>
        </Disclosure>
      </Card>

      <Card tight>
        <div className="t-label">Nächste Tests</div>
        <div className="t-small secondary mt-2">
          Alle 10 bis 12 Wochen, immer am Zyklustag 4, mit mindestens 48 h ohne harte Einheit
          davor.
        </div>
        <ul className="t-caption muted mt-3" style={{ paddingLeft: '1.1em' }}>
          <li>30-Minuten-Zeitfahren → Schwellenfrequenz, Zonen neu</li>
          <li>12-Minuten-Lauf über maximale Distanz → VO2max-Schätzung</li>
          <li>Herzfrequenzerholung nach 1 min → parasympathische Funktion</li>
        </ul>
      </Card>

      <Card tight>
        <div className="t-label">Aus dem Zyklus</div>
        <div className="row between mt-2 t-small">
          <span className="muted">Aerobe Minuten</span>
          <span className="t-num">{plan.macrocycle.aerobicMinutes}</span>
        </div>
        <div className="row between t-small">
          <span className="muted">davon Laufen</span>
          <span className="t-num">{plan.macrocycle.runMinutes}</span>
        </div>
        <div className="row between t-small">
          <span className="muted">Zone 1 und 2</span>
          <span className="t-num">{Math.round(plan.macrocycle.baseShare * 100)} %</span>
        </div>
        <div className="t-caption muted mt-3">
          Ruhepuls und HRV sind bei Schichtarbeit nur im 28-Tage-Trend aussagekräftig, nie als
          Tageswert. Sie stehen im Statistik-Tab.
        </div>
      </Card>
    </>
  );
}
