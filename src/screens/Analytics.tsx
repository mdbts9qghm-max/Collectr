import { useMemo, useState } from 'react';
import type { SportKey } from '../domain/types.ts';
import { addDays, isoWeekNumber, lastNDays, startOfWeek } from '../domain/date.ts';
import {
  SPORT_META,
  formatDistance,
  formatDuration,
  formatHours,
  formatMetric,
  formatPace,
} from '../domain/format.ts';
import { loadSeries, periodStats } from '../domain/load.ts';
import { PILLAR_META } from '../domain/score.ts';
import { bestWeek, describeRecord, strengthRecords } from '../domain/metrics.ts';
import { weeklySeries } from '../data/derived.ts';
import { buildInsights } from '../domain/insights.ts';
import { useData, useHybridScore, useIndexes, useMetrics, useToday } from '../app/hooks.ts';
import { useLocalState } from '../app/hooks.ts';
import { Card, Disclosure, Empty, Pill, ProgressBar, SectionTitle, Segmented } from '../ui/primitives.tsx';
import { BarChart, DistributionBar, LineChart, MultiRing, Ring } from '../ui/charts.tsx';

type Range = '4' | '12' | '26';

export function Analytics() {
  const today = useToday();
  const data = useData();
  const idx = useIndexes();
  const metrics = useMetrics(today);
  const score = useHybridScore(today);
  // The daily screen stays free of advisory text; it lives here instead.
  const insights = useMemo(() => buildInsights(data, idx, today), [data, idx, today]);
  const [range, setRange] = useLocalState<Range>('analytics-range', '12');
  const [sport, setSport] = useState<SportKey | 'all'>('all');

  const weeks = Number(range);
  const series = useMemo(() => weeklySeries(data, today, weeks), [data, today, weeks]);
  const loads = useMemo(
    () => loadSeries(data.sessions, addDays(today, -weeks * 7), today),
    [data.sessions, today, weeks],
  );
  const period = useMemo(
    () => periodStats(data.sessions, addDays(today, -(weeks * 7 - 1)), today),
    [data.sessions, today, weeks],
  );

  const strength = useMemo(() => strengthRecords(data.sessions, data.exercises), [data.sessions, data.exercises]);
  const best = useMemo(() => bestWeek(data.sessions, today, weeks), [data.sessions, today, weeks]);

  const hasData = data.sessions.some((s) => s.status === 'completed');

  const sportsWithData = (Object.keys(period.bySport) as SportKey[]).filter(
    (s) => period.bySport[s].minutes > 0,
  );

  const bestRecords = useMemo(() => {
    const map = new Map<string, (typeof data.records)[number]>();
    for (const r of data.records) {
      const prev = map.get(r.metric as string);
      if (!prev || (r.betterIsLower ? r.value < prev.value : r.value > prev.value)) {
        map.set(r.metric as string, r);
      }
    }
    return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [data.records]);

  return (
    <>
      <h1 className="t-title">Statistik</h1>

      {insights.length > 0 && (
        <div className="col gap-3">
          {insights.slice(0, 3).map((insight) => (
            <Card key={insight.id} tight>
              <div className="row gap-3 row-top">
                <span style={{ fontSize: 18 }}>{insight.icon}</span>
                <div className="grow">
                  <div className="t-body" style={{ fontWeight: 570 }}>
                    {insight.title}
                  </div>
                  <div className="t-small muted mt-2">{insight.body}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Segmented
        value={range}
        onChange={setRange}
        options={[
          { value: '4', label: '4 Wochen' },
          { value: '12', label: '12 Wochen' },
          { value: '26', label: '6 Monate' },
        ]}
      />

      {/* ---------- Hybrid score ---------- */}
      <Card hero>
        <div className="row gap-4">
          <div style={{ position: 'relative' }}>
            <MultiRing
              size={128}
              stroke={9}
              gap={3}
              rings={score.pillars.map((p) => ({
                value: p.score,
                color: PILLAR_META[p.key].color,
                label: PILLAR_META[p.key].label,
              }))}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                pointerEvents: 'none',
              }}
            >
              <div className="center">
                <div className="t-num" style={{ fontSize: 26, fontWeight: 700, lineHeight: 1 }}>
                  {score.total}
                </div>
                <div className="t-caption muted">/ 100</div>
              </div>
            </div>
          </div>
          <div className="grow col gap-2">
            <div className="row between gap-2">
              <span className="t-label">Hybrid Score</span>
              {score.provisional && <Pill tone="warn">vorläufig</Pill>}
            </div>
            {score.pillars.map((p) => (
              <div className="row gap-2" key={p.key}>
                <span className="dot" style={{ background: PILLAR_META[p.key].color }} />
                <span className="grow t-small truncate">{PILLAR_META[p.key].label}</span>
                <span className="t-small t-num">{Math.round(p.score)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="divider mt-4" />

        <Disclosure summary={<span className="t-label">Warum habe ich {score.total} Punkte?</span>}>
          <div className="col gap-4 mt-2">
            {score.pillars.map((p) => (
              <div key={p.key}>
                <div className="row between">
                  <span className="t-small" style={{ fontWeight: 570 }}>
                    {PILLAR_META[p.key].icon} {PILLAR_META[p.key].label}
                  </span>
                  <span className="t-small t-num muted">
                    {Math.round(p.score)} × {Math.round(p.weight * 100)} % = {p.contribution.toFixed(1)}
                  </span>
                </div>
                <div className="mt-2">
                  <ProgressBar value={p.score} max={100} color={PILLAR_META[p.key].color} thickness="thin" />
                </div>
                <div className="col gap-2 mt-3">
                  {p.components.map((c) => (
                    <div className="row between gap-3" key={c.label}>
                      <span className={`t-caption ${c.hasData ? 'secondary' : 'muted'} truncate`}>
                        {c.label}
                      </span>
                      <span className="t-caption muted right" style={{ flex: '0 1 auto', minWidth: 0 }}>
                        {c.detail}
                      </span>
                      <span className="t-caption t-num" style={{ width: 30, textAlign: 'right' }}>
                        {c.hasData ? Math.round(c.score) : '–'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {score.coverage < 100 && (
              <p className="t-caption muted">
                {score.coverage} % der Bewertungskomponenten haben Daten. Komponenten ohne Daten werden
                nicht als Null gewertet, sondern aus der Rechnung genommen — ebenso ganze Säulen, deren
                Gewicht dann auf die messbaren Säulen verteilt wird.
                {score.provisional
                  ? ' Bei dieser Datenlage ist der Gesamtwert noch vorläufig.'
                  : ''}
              </p>
            )}
          </div>
        </Disclosure>

        {score.levers.length > 0 && (
          <>
            <div className="divider mt-4" />
            <div className="t-label mb-3">Größte Hebel</div>
            <div className="col gap-3">
              {score.levers.map((l) => (
                <div className="row gap-3 row-top" key={l.pillar}>
                  <Pill tone="accent">+{l.gain.toFixed(1)}</Pill>
                  <span className="t-small grow">{l.text}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      {!hasData && (
        <Card>
          <Empty
            icon="📊"
            title="Noch keine abgeschlossenen Einheiten"
            hint="Sobald du Trainings als absolviert einträgst, füllen sich alle Auswertungen hier automatisch."
          />
        </Card>
      )}

      {hasData && (
        <>
          {/* ---------- Volume ---------- */}
          <SectionTitle title="Wochenumfang" subtitle={`Letzte ${weeks} Wochen`} />
          <Card>
            <BarChart
              height={130}
              data={series.map((w) => ({
                label: `${isoWeekNumber(w.weekStart)}`,
                value: w.stats.total.minutes,
                highlight: w.weekStart === startOfWeek(today, data.settings.weekStartsOn),
                segments: sportsWithData
                  .filter((s) => w.stats.bySport[s].minutes > 0)
                  .map((s) => ({ value: w.stats.bySport[s].minutes, color: SPORT_META[s].color })),
              }))}
              target={data.settings.training.weeklyHoursTarget * 60}
              targetLabel="Ziel"
              valueFormat={(v) => `${Math.round(v / 60)}h`}
            />
            <div className="divider mt-4" />
            <DistributionBar
              items={sportsWithData.map((s) => ({
                label: SPORT_META[s].label,
                value: period.bySport[s].minutes,
                color: SPORT_META[s].color,
              }))}
              formatValue={(v) => formatDuration(v)}
            />
          </Card>

          {/* ---------- Fitness / fatigue ---------- */}
          <SectionTitle title="Fitness & Ermüdung" subtitle="CTL, ATL und Form über die Zeit" />
          <Card>
            <LineChart
              height={150}
              series={[
                { points: loads.map((p) => p.ctl), color: 'var(--info)', label: 'Fitness (CTL)', fill: true },
                { points: loads.map((p) => p.atl), color: 'var(--sport-run)', label: 'Ermüdung (ATL)' },
                { points: loads.map((p) => p.tsb), color: 'var(--accent)', label: 'Form (TSB)', dashed: true },
              ]}
              zeroLine={0}
              labels={[loads[0]?.date.slice(5) ?? '', today.slice(5)]}
            />
            <div className="grid-3 mt-4">
              <div className="stat">
                <div className="stat-label">Fitness</div>
                <div className="stat-value sm t-num">{loads[loads.length - 1]?.ctl ?? 0}</div>
              </div>
              <div className="stat">
                <div className="stat-label">Ermüdung</div>
                <div className="stat-value sm t-num">{loads[loads.length - 1]?.atl ?? 0}</div>
              </div>
              <div className="stat">
                <div className="stat-label">ACWR</div>
                <div className="stat-value sm t-num">
                  {loads[loads.length - 1]?.acwr ? loads[loads.length - 1].acwr.toFixed(2) : '–'}
                </div>
              </div>
            </div>
          </Card>

          {/* ---------- Per-sport detail ---------- */}
          <SectionTitle title="Nach Sportart" />
          <div className="chip-row">
            <button
              type="button"
              className={`chip ${sport === 'all' ? 'active' : ''}`}
              onClick={() => setSport('all')}
            >
              Übersicht
            </button>
            {sportsWithData.map((s) => (
              <button
                key={s}
                type="button"
                className={`chip ${sport === s ? 'active' : ''}`}
                onClick={() => setSport(s)}
              >
                {SPORT_META[s].icon} {SPORT_META[s].short}
              </button>
            ))}
          </div>

          {sport === 'all' ? (
            <Card flush>
              <div className="list">
                {sportsWithData.map((s) => (
                  <div className="list-item" key={s}>
                    <span
                      className="icon-badge sm"
                      style={{ background: `color-mix(in srgb, ${SPORT_META[s].color} 18%, transparent)` }}
                    >
                      {SPORT_META[s].icon}
                    </span>
                    <span className="grow t-small">{SPORT_META[s].label}</span>
                    <span className="t-small t-num muted">
                      {formatDuration(period.bySport[s].minutes)}
                      {period.bySport[s].distanceKm > 0 && ` · ${formatDistance(period.bySport[s].distanceKm)}`}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <SportDetail
              sport={sport}
              weeks={weeks}
              series={series}
              metrics={metrics}
              settings={data.settings}
            />
          )}

          {/* ---------- Strength ---------- */}
          {strength.length > 0 && (
            <>
              <SectionTitle title="Krafttraining" subtitle="Bestwerte je Übung" />
              <Card flush>
                <div className="list">
                  {strength.map((r) => (
                    <div className="list-item" key={r.exerciseId}>
                      <span className="grow t-small">{r.exerciseName}</span>
                      <span className="t-small t-num muted">
                        {r.bestWeightKg
                          ? `${r.bestWeightKg} kg × ${r.bestWeightReps}`
                          : r.bestReps
                            ? `${r.bestReps} Wdh`
                            : r.bestSeconds
                              ? `${r.bestSeconds} s`
                              : '–'}
                      </span>
                      {r.estimated1RM && <Pill>≈ {r.estimated1RM} kg 1RM</Pill>}
                    </div>
                  ))}
                </div>
              </Card>
              <p className="t-caption muted">
                Der geschätzte 1RM ist nach Epley aus Gewicht und Wiederholungen berechnet — ein
                Vergleichswert, kein getesteter Maximalversuch.
              </p>
            </>
          )}

          {/* ---------- Records ---------- */}
          <SectionTitle title="Personal Records" />
          {bestRecords.length === 0 ? (
            <Card>
              <Empty
                icon="🏆"
                title="Noch keine Bestleistungen"
                hint="Sie entstehen automatisch, sobald Einheiten mit Distanz, Zeit oder Wiederholungen erfasst sind."
              />
            </Card>
          ) : (
            <Card flush>
              <div className="list">
                {bestRecords.map((r) => (
                  <div className="list-item" key={r.id}>
                    <span className="icon-badge sm">🏆</span>
                    <span className="grow">
                      <span className="t-small" style={{ fontWeight: 560, display: 'block' }}>
                        {r.label}
                      </span>
                      <span className="t-caption muted">{r.date}</span>
                    </span>
                    <span className="t-small t-num">{describeRecord(r)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {best && (
            <Card tight>
              <div className="row between">
                <div>
                  <div className="stat-label">Beste Trainingswoche</div>
                  <div className="t-small secondary mt-2">
                    Ab {best.weekStart} · {formatHours(best.minutes / 60)}
                  </div>
                </div>
                <Ring size={54} stroke={5} value={100} label={String(best.load)} color="var(--accent)" />
              </div>
            </Card>
          )}

          {/* ---------- Consistency ---------- */}
          <SectionTitle title="Konstanz" subtitle="Trainingstage der letzten 12 Wochen" />
          <Card>
            <ConsistencyGrid data={data} today={today} />
          </Card>
        </>
      )}

    </>
  );
}

function SportDetail({
  sport,
  weeks,
  series,
  metrics,
  settings,
}: {
  sport: SportKey;
  weeks: number;
  series: ReturnType<typeof weeklySeries>;
  metrics: ReturnType<typeof useMetrics>;
  settings: ReturnType<typeof useData>['settings'];
}) {
  const totals = series.reduce(
    (acc, w) => ({
      minutes: acc.minutes + w.stats.bySport[sport].minutes,
      distance: acc.distance + w.stats.bySport[sport].distanceKm,
      sessions: acc.sessions + w.stats.bySport[sport].sessions,
      elevation: acc.elevation + w.stats.bySport[sport].elevationM,
    }),
    { minutes: 0, distance: 0, sessions: 0, elevation: 0 },
  );

  const showDistance = totals.distance > 0;
  const avgPace = showDistance && totals.minutes > 0 ? (totals.minutes * 60) / totals.distance : 0;

  const relevantMetrics =
    sport === 'run'
      ? (['run_5k_seconds', 'run_10k_seconds', 'run_longest_km', 'run_z2_pace_sec_per_km'] as const)
      : sport === 'bike'
        ? (['bike_ftp_w', 'bike_longest_km'] as const)
        : sport === 'swim'
          ? (['swim_100m_seconds'] as const)
          : ([] as const);

  return (
    <Card>
      <div className="grid-2">
        <div className="stat">
          <div className="stat-label">Zeit</div>
          <div className="stat-value t-num">{formatHours(totals.minutes / 60)}</div>
          <div className="stat-sub">{totals.sessions} Einheiten</div>
        </div>
        {showDistance ? (
          <div className="stat">
            <div className="stat-label">Distanz</div>
            <div className="stat-value t-num">{formatDistance(totals.distance)}</div>
            <div className="stat-sub">
              Ø {formatDistance(totals.distance / weeks)}/Woche
              {totals.elevation > 0 ? ` · ${totals.elevation} hm` : ''}
            </div>
          </div>
        ) : (
          <div className="stat">
            <div className="stat-label">Ø pro Woche</div>
            <div className="stat-value t-num">{formatDuration(totals.minutes / weeks)}</div>
          </div>
        )}
      </div>

      {showDistance && (
        <div className="row between mt-4">
          <span className="t-small secondary">
            {sport === 'swim' ? 'Ø Pace' : 'Ø Pace'}
          </span>
          <span className="t-small t-num">
            {sport === 'swim' ? formatPace(avgPace / 10, '/100m') : formatPace(avgPace)}
          </span>
        </div>
      )}

      {sport === 'run' && (
        <div className="row between mt-2">
          <span className="t-small secondary">Ziel-Zone-2-Pace</span>
          <span className="t-small t-num muted">{formatPace(settings.training.z2PaceSecPerKm)}</span>
        </div>
      )}

      <div className="divider mt-4" />

      <BarChart
        height={100}
        data={series.map((w) => ({
          label: `${isoWeekNumber(w.weekStart)}`,
          value: showDistance ? w.stats.bySport[sport].distanceKm : w.stats.bySport[sport].minutes,
          color: SPORT_META[sport].color,
        }))}
        valueFormat={(v) => (showDistance ? `${Math.round(v)}` : `${Math.round(v / 60)}h`)}
      />

      {relevantMetrics.length > 0 && (
        <>
          <div className="divider mt-4" />
          <div className="col gap-2">
            {relevantMetrics.map((key) => {
              const m = metrics.get(key);
              return (
                <div className="row between" key={key}>
                  <span className="t-small secondary">{m?.label ?? key}</span>
                  <span className="t-small t-num">
                    {m ? formatMetric(key, m.value) : 'keine Daten'}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}

function ConsistencyGrid({ data, today }: { data: ReturnType<typeof useData>; today: string }) {
  const dates = lastNDays(today, 84);
  const byDate = new Map<string, number>();
  for (const s of data.sessions) {
    if (s.status !== 'completed') continue;
    byDate.set(s.date, (byDate.get(s.date) ?? 0) + (s.actualDurationMin ?? s.plannedDurationMin ?? 0));
  }
  const activeDays = dates.filter((d) => (byDate.get(d) ?? 0) > 0).length;

  return (
    <>
      <div className="row between mb-3">
        <span className="t-small secondary">
          {activeDays} von {dates.length} Tagen aktiv
        </span>
        <span className="t-small t-num muted">{Math.round((activeDays / dates.length) * 100)} %</span>
      </div>
      <div className="scroll-x">
        <Heatmapish dates={dates} byDate={byDate} />
      </div>
    </>
  );
}

function Heatmapish({ dates, byDate }: { dates: string[]; byDate: Map<string, number> }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateRows: 'repeat(7, 12px)',
        gridAutoFlow: 'column',
        gap: 3,
      }}
    >
      {dates.map((date) => {
        const minutes = byDate.get(date) ?? 0;
        const intensity = Math.min(1, minutes / 90);
        return (
          <div
            key={date}
            title={`${date}: ${minutes > 0 ? formatDuration(minutes) : 'kein Training'}`}
            style={{
              width: 12,
              height: 12,
              borderRadius: 3,
              background:
                minutes === 0
                  ? 'var(--surface-3)'
                  : `color-mix(in srgb, var(--accent) ${Math.round(intensity * 100)}%, var(--surface-3))`,
            }}
          />
        );
      })}
    </div>
  );
}
