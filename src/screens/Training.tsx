import { useState } from 'react';
import type { Recommendation, TrainingSession } from '../domain/types.ts';
import { addDays, nowTimestamp } from '../domain/date.ts';
import {
  INTENSITY_META,
  SPORT_META,
  formatDateShort,
  formatDuration,
  formatHours,
  relativeDayLabel,
  weekdayShort,
} from '../domain/format.ts';
import type { Outlook } from '../domain/outlook.ts';
import { PHASE_META } from '../domain/phases.ts';
import { makeId } from '../domain/ids.ts';
import { useStore } from '../data/store.ts';
import { useData, useDayView, useToday } from '../app/hooks.ts';
import {
  Button,
  Card,
  Disclosure,
  Empty,
  Pill,
  ProgressBar,
  ReasonList,
  SectionTitle,
} from '../ui/primitives.tsx';
import { DistributionBar } from '../ui/charts.tsx';
import { IconChevronLeft, IconChevronRight, IconPlus } from '../ui/icons.tsx';
import { SessionSheet, emptySession, sessionSubtitle } from '../ui/SessionSheet.tsx';
import { ShiftSheet } from '../ui/ShiftSheet.tsx';

export function Training() {
  const today = useToday();
  const data = useData();
  const [date, setDate] = useState(today);
  const view = useDayView(date);
  const saveSession = useStore((s) => s.saveSession);
  const toast = useStore((s) => s.toast);

  const [editing, setEditing] = useState<TrainingSession | null>(null);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);

  const accept = (rec: Recommendation) => {
    if (rec.template.isRest) {
      toast('Ruhetag braucht keinen Eintrag.', 'good');
      return;
    }
    saveSession({
      ...emptySession(date, rec.template.sport),
      id: makeId('ses'),
      title: rec.template.title,
      plannedIntensity: rec.template.intensity,
      plannedDurationMin: rec.template.durationMin,
      plannedDistanceKm: rec.template.distanceKm,
      startTime: rec.suggestedStart,
      goal: rec.template.goal,
      muscleGroups: rec.template.muscleGroups,
      fromRecommendationId: rec.id,
      createdAt: nowTimestamp(),
      updatedAt: nowTimestamp(),
    });
    toast(`${rec.template.title} eingeplant`, 'good');
  };

  const target = view.target;
  const sportDistribution = (Object.keys(view.week.bySport) as (keyof typeof view.week.bySport)[])
    .filter((s) => view.week.bySport[s].minutes > 0)
    .map((s) => ({
      label: SPORT_META[s].label,
      value: view.week.bySport[s].minutes,
      color: SPORT_META[s].color,
    }));

  return (
    <>
      {/* ---------- Date navigation ---------- */}
      <div className="row between">
        <Button variant="ghost" size="sm" onClick={() => setDate(addDays(date, -1))} aria-label="Vorheriger Tag">
          <IconChevronLeft size={18} />
        </Button>
        <button type="button" className="col center" onClick={() => setDate(today)}>
          <div className="t-heading">{relativeDayLabel(date, today)}</div>
          <div className="t-caption muted">
            {weekdayShort(date)}, {formatDateShort(date)}
          </div>
        </button>
        <Button variant="ghost" size="sm" onClick={() => setDate(addDays(date, 1))} aria-label="Nächster Tag">
          <IconChevronRight size={18} />
        </Button>
      </div>

      {/* ---------- Shift capacity ---------- */}
      <Card tight>
        <button type="button" className="row gap-3" style={{ width: '100%' }} onClick={() => setShiftOpen(true)}>
          {view.shift.type ? (
            <>
              <span
                className="icon-badge"
                style={{ background: `color-mix(in srgb, ${view.shift.type.color} 18%, transparent)` }}
              >
                {view.shift.type.icon}
              </span>
              <span className="grow left">
                <span className="t-body" style={{ fontWeight: 570, display: 'block' }}>
                  {view.shift.type.label}
                </span>
                <span className="t-caption muted">{view.shift.type.training.note}</span>
              </span>
              <Pill
                tone={
                  view.shift.type.training.rating === 'green'
                    ? 'good'
                    : view.shift.type.training.rating === 'amber'
                      ? 'warn'
                      : 'bad'
                }
              >
                {view.shift.type.training.maxMinutes > 0
                  ? `max ${formatDuration(view.shift.type.training.maxMinutes)}`
                  : 'kein Training'}
              </Pill>
            </>
          ) : (
            <>
              <span className="icon-badge">📅</span>
              <span className="grow left t-small">
                Keine Schicht eingetragen — die Empfehlung rechnet mit einem normalen freien Tag.
              </span>
              <Pill tone="warn">setzen</Pill>
            </>
          )}
        </button>
      </Card>

      {/* ---------- Planned sessions ---------- */}
      <SectionTitle
        title="Geplant"
        action={
          <Button size="sm" variant="ghost" onClick={() => setEditing(emptySession(date))}>
            <IconPlus size={15} /> Einheit
          </Button>
        }
      />
      {view.sessions.length === 0 ? (
        <Card>
          <Empty icon="📋" title="Für diesen Tag ist nichts geplant" hint="Übernimm eine Empfehlung oder leg eine Einheit selbst an." />
        </Card>
      ) : (
        <Card flush>
          <div className="list">
            {view.sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                className={`list-item clickable ${session.status === 'skipped' ? 'done' : ''}`}
                onClick={() => setEditing(session)}
              >
                <span
                  className="icon-badge"
                  style={{ background: `color-mix(in srgb, ${SPORT_META[session.sport].color} 18%, transparent)` }}
                >
                  {SPORT_META[session.sport].icon}
                </span>
                <span className="grow">
                  <span className="t-body truncate" style={{ fontWeight: 570, display: 'block' }}>
                    {session.startTime ? `${session.startTime} · ` : ''}
                    {session.title}
                  </span>
                  <span className="t-caption muted">{sessionSubtitle(session)}</span>
                </span>
                {session.status === 'completed' && <Pill tone="good">✓</Pill>}
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* ---------- Recommendations ---------- */}
      <SectionTitle title="Empfohlen" subtitle={view.recommendation.focus} />
      {view.recommendation.recommended.map((rec) => (
        <RecommendationCard key={rec.id} rec={rec} onAccept={accept} highlighted />
      ))}

      {view.recommendation.alternatives.length > 0 && (
        <>
          <SectionTitle title="Alternativen" />
          {view.recommendation.alternatives.map((rec) => (
            <RecommendationCard key={rec.id} rec={rec} onAccept={accept} />
          ))}
        </>
      )}

      {view.recommendation.notRecommended.length > 0 && (
        <Card tight>
          <Disclosure
            summary={
              <span className="row gap-2">
                <span className="t-label">Nicht empfohlen</span>
                <Pill tone="bad">{view.recommendation.notRecommended.length}</Pill>
              </span>
            }
            defaultOpen={showExcluded}
          >
            <div className="col gap-3" onClick={() => setShowExcluded(true)}>
              {view.recommendation.notRecommended.map((rec) => (
                <div className="row gap-3 row-top" key={rec.id}>
                  <span style={{ fontSize: 17, opacity: 0.6 }}>{SPORT_META[rec.template.sport].icon}</span>
                  <div className="grow">
                    <div className="t-small" style={{ fontWeight: 560 }}>
                      {rec.template.title}
                    </div>
                    <div className="t-caption bad mt-2">{rec.blockedBy}</div>
                  </div>
                </div>
              ))}
            </div>
          </Disclosure>
        </Card>
      )}

      {/* ---------- Week context ---------- */}
      <SectionTitle title="Diese Woche" subtitle={target.phase ? PHASE_META[target.phase.kind].description : undefined} />
      <Card>
        <div className="row between">
          <div>
            <div className="stat-label">Umfang</div>
            <div className="stat-value t-num">{formatHours(view.week.total.minutes / 60)}</div>
          </div>
          <div className="right">
            <div className="stat-label">Ziel</div>
            <div className="stat-value t-num muted">{formatHours(target.minutes / 60)}</div>
          </div>
        </div>
        <div className="mt-3">
          <ProgressBar value={view.week.total.minutes} max={target.minutes} thickness="thick" />
        </div>
        <div className="row between mt-2 t-caption muted">
          <span>
            {view.week.total.sessions} Einheiten · {view.week.hardSessions} intensiv
          </span>
          <span>
            {target.deload
              ? 'Deload-Woche'
              : `Aufbauwoche ${target.weekIndex} · ${Math.round(target.waveFactor * 100)} % Basisumfang`}
          </span>
        </div>

        <div className="divider mt-4" />

        <div className="t-label mb-3">Verteilung nach Sportart</div>
        <DistributionBar items={sportDistribution} formatValue={(v) => formatDuration(v)} />

        <div className="divider mt-4" />

        <div className="t-label mb-3">Intensitätsverteilung</div>
        <DistributionBar
          items={[
            { label: 'Locker (Z1–Z2)', value: view.week.byIntensity.easy, color: 'var(--zone-2)' },
            { label: 'Moderat (Z3)', value: view.week.byIntensity.moderate, color: 'var(--zone-3)' },
            { label: 'Intensiv (Z4–Z5)', value: view.week.byIntensity.hard, color: 'var(--zone-5)' },
          ]}
          formatValue={(v) => formatDuration(v)}
        />
        <div className="t-caption muted mt-3">
          Ziel dieser Phase: {Math.round(target.intensityDistribution.easy * 100)} % locker ·{' '}
          {Math.round(target.intensityDistribution.moderate * 100)} % moderat ·{' '}
          {Math.round(target.intensityDistribution.hard * 100)} % intensiv
        </div>
      </Card>

      {/* ---------- Forward horizon ---------- */}
      <SectionTitle
        title="Ausblick"
        subtitle="Was die Empfehlung über die kommenden Tage weiß"
      />
      <OutlookCard outlook={view.outlook} sleepTarget={data.settings.recovery.sleepHoursTarget} />

      {/* ---------- Load ---------- */}
      <Card>
        <div className="t-label mb-3">Belastungsstatus</div>
        <div className="grid-3">
          <div className="stat">
            <div className="stat-label">Fitness</div>
            <div className="stat-value sm t-num">{view.load.ctl}</div>
            <div className="stat-sub">CTL</div>
          </div>
          <div className="stat">
            <div className="stat-label">Ermüdung</div>
            <div className="stat-value sm t-num">{view.load.atl}</div>
            <div className="stat-sub">ATL</div>
          </div>
          <div className="stat">
            <div className="stat-label">Form</div>
            <div className={`stat-value sm t-num ${view.load.tsb > 0 ? 'good' : view.load.tsb < -15 ? 'bad' : ''}`}>
              {view.load.tsb > 0 ? '+' : ''}
              {view.load.tsb}
            </div>
            <div className="stat-sub">TSB</div>
          </div>
        </div>
        {view.load.acwr > 0 && (
          <div className="row between mt-4">
            <span className="t-small secondary">Akut : Chronisch</span>
            <Pill tone={view.load.acwr > data.settings.recovery.acwrCeiling ? 'bad' : 'good'}>
              {view.load.acwr.toFixed(2)}
            </Pill>
          </div>
        )}
      </Card>

      <SessionSheet open={!!editing} session={editing} onClose={() => setEditing(null)} />
      <ShiftSheet open={shiftOpen} date={date} onClose={() => setShiftOpen(false)} />
    </>
  );
}

function OutlookCard({ outlook, sleepTarget }: { outlook: Outlook; sleepTarget: number }) {
  const known = outlook.days.filter((d) => d.known);

  return (
    <Card>
      <div className="grid-3">
        <div className="stat">
          <div className="stat-label">Restwoche</div>
          <div className="stat-value sm t-num">
            {outlook.isLastDayOfWeek
              ? '–'
              : outlook.restOfWeekComplete
                ? formatDuration(outlook.restOfWeekFreeMinutes)
                : '–'}
          </div>
          <div className="stat-sub">
            {outlook.isLastDayOfWeek
              ? 'Woche endet heute'
              : outlook.restOfWeekComplete
                ? 'freie Zeit'
                : 'Schichten fehlen'}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">7 Tage</div>
          <div className="stat-value sm t-num">
            {known.length > 0 ? formatHours(outlook.totalFreeMinutes / 60) : '–'}
          </div>
          <div className="stat-sub">{outlook.longCapableDays} Tage für lange Einheit</div>
        </div>
        <div className="stat">
          <div className="stat-label">Schlaf</div>
          <div className={`stat-value sm t-num ${outlook.sleepConstrainedAhead ? 'warn' : ''}`}>
            {outlook.expectedSleepAhead != null ? `${outlook.expectedSleepAhead} h` : '–'}
          </div>
          <div className="stat-sub">laut Schichtplan</div>
        </div>
      </div>

      <div className="divider mt-4" />

      <div className="col gap-3">
        {outlook.days.map((day) => (
          <div className="row gap-3" key={day.date}>
            <span className="t-caption muted" style={{ width: 62 }}>
              {weekdayShort(day.date)}, {formatDateShort(day.date)}
            </span>
            {day.shift ? (
              <span
                className="shift-tag"
                style={{ background: `color-mix(in srgb, ${day.shift.color} 22%, transparent)` }}
              >
                {day.shift.short}
              </span>
            ) : (
              <span className="shift-tag" style={{ background: 'var(--surface-3)', color: 'var(--text-muted)' }}>
                ?
              </span>
            )}
            <span className="grow">
              <ProgressBar
                value={day.known ? day.freeMinutes : 0}
                max={240}
                thickness="thin"
                color={
                  day.rating === 'green'
                    ? 'var(--good)'
                    : day.rating === 'amber'
                      ? 'var(--warn)'
                      : 'var(--bad)'
                }
              />
            </span>
            <span className="t-caption muted t-num nowrap" style={{ width: 62, textAlign: 'right' }}>
              {day.known ? formatDuration(day.freeMinutes) : 'offen'}
            </span>
          </div>
        ))}
      </div>

      {outlook.unknownDays > 0 && (
        <p className="t-caption muted mt-4">
          {outlook.unknownDays} von {outlook.horizonDays} Tagen haben noch keine Schicht. Solange das
          so ist, zieht die Empfehlung daraus bewusst keine Schlüsse — ein leerer Kalender heißt nicht,
          dass keine guten Tage kommen.
        </p>
      )}

      {outlook.sleepConstrainedAhead && (
        <p className="t-caption warn mt-3">
          Die kommenden Tage lassen im Schnitt nur {outlook.expectedSleepAhead} h Schlaf zu (Ziel{' '}
          {sleepTarget} h). Harte Reize werden deshalb heute niedriger bewertet.
        </p>
      )}
    </Card>
  );
}

function RecommendationCard({
  rec,
  onAccept,
  highlighted,
}: {
  rec: Recommendation;
  onAccept: (rec: Recommendation) => void;
  highlighted?: boolean;
}) {
  return (
    <Card accentEdge={highlighted} hero={highlighted}>
      <div className="row gap-3 row-top">
        <span style={{ fontSize: 26, lineHeight: 1 }}>{SPORT_META[rec.template.sport].icon}</span>
        <div className="grow">
          <div className="t-heading">{rec.template.title}</div>
          <div className="t-small secondary mt-2">
            {rec.template.isRest
              ? 'Kein Training'
              : [
                  formatDuration(rec.template.durationMin),
                  rec.template.distanceKm ? `≈ ${rec.template.distanceKm.toFixed(1)} km` : null,
                  INTENSITY_META[rec.template.intensity].zone,
                  rec.suggestedStart ? `ab ${rec.suggestedStart}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
          </div>
        </div>
        {!rec.template.isRest && <Pill tone="accent">{rec.estimatedLoad} Load</Pill>}
      </div>

      {rec.template.goal && <div className="t-small muted mt-3">Ziel: {rec.template.goal}</div>}

      <div className="mt-3">
        <Disclosure defaultOpen={highlighted} summary={<span className="t-label">Warum?</span>}>
          <ReasonList reasons={rec.reasons} />
        </Disclosure>
      </div>

      {!rec.template.isRest && (
        <Button variant={highlighted ? 'primary' : 'outline'} block className="mt-4" onClick={() => onAccept(rec)}>
          <IconPlus size={16} /> Einplanen
        </Button>
      )}
    </Card>
  );
}
