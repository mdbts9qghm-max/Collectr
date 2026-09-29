import { useState } from 'react'
import { useApp } from '../../app/AppState'
import { nextTrainingDay, whoopActive, type DayItem, type Warning } from '../../app/compute'
import { PHASE_LABEL } from '../../core/plan'
import { raceCountdown } from '../../core/race'
import type { ReadinessResult } from '../../core/recovery'
import { effectiveShift, shiftLabel } from '../../core/shift'
import { berlinToInstant, formatDateDE, formatNumberDE, formatTime, weekdayLongDE } from '../../core/time'
import type { SleepBlock, SleepRecommendation } from '../../core/types'
import { Button, Card, Chip, Disclosure, H2, Stat, TRAFFIC_LABEL } from '../components/common'
import { ManualReadinessForm } from '../components/ManualReadinessForm'
import { OverrideSheet } from '../components/OverrideSheet'
import { Vitals } from '../components/Vitals'
import { Ring, RING_COLOR } from '../components/Ring'
import { SessionCard, SessionDetails, sessionMeta } from '../components/SessionCard'

export function Today() {
  const app = useApp()
  const { today, plan, data } = app
  const v = app.dayView(today)
  const [editReadiness, setEditReadiness] = useState(false)
  const [shiftSheet, setShiftSheet] = useState(false)
  // Bei simuliertem Datum zählt der Countdown ab 12:00 Uhr dieses Tages.
  const cd = raceCountdown(data.settings.simulatedDate ? berlinToInstant(today, 12 * 60) : app.now)
  const r = v.readiness
  const showForm = !v.afterRace && (r.needsManualInput || editReadiness)

  // Die Urlaubs-Warnung zum Rennen steht im Coach bei der Checkliste Rennwoche (Wunsch: nicht auf Heute).
  const warnings = v.warnings.filter((w) => w.id !== 'vacation')

  return (
    <div className="space-y-4">
      {warnings.map((w) => (
        <WarningBanner key={w.id} w={w} onAck={() => app.updateSettings({ vacationReminderAck: today })} />
      ))}

      <Card data-testid="shift-card">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{weekdayLongDE(today)} · Schicht</div>
            <div className="text-xl font-bold">{v.day ? shiftLabel(v.day.shift.code) : shiftLabel(effectiveShift(app.cal, today).code)}</div>
            {v.day ? (
              <div className="text-sm text-muted" data-testid="shift-info">
                Zyklustag {v.day.shift.cycleDay} · {shiftLabel(v.day.shift.code)}
                {v.day.shift.work && ` · Beginn ${formatTime(v.day.shift.work.actualStart)} · losfahren ${formatTime(v.day.shift.work.departure)}`}
              </div>
            ) : (
              <div className="text-sm text-muted">{v.beforePlan ? 'Der Plan beginnt am 02.10.2026.' : 'Außerhalb des Plans'}</div>
            )}
          </div>
          {v.day && (
            <Button className="shrink-0" onClick={() => setShiftSheet(true)}>
              Schicht ändern
            </Button>
          )}
        </div>
        {v.day?.window && (
          <div className="mt-3">
            <Chip>
              Trainingsfenster {formatTime(v.day.window.start)}–{formatTime(v.day.window.end)} Uhr{v.day.window.easyOnly && ' · nur locker'}
            </Chip>
          </div>
        )}
      </Card>

      {!v.afterRace && (
        <Card data-testid="readiness">
          <div className="grid grid-cols-3 gap-2">
            <RecoveryRing r={r} source={r.source === 'manual' ? 'manuell' : whoopActive(data) ? 'WHOOP' : 'WHOOP (Beispieldaten)'} onEdit={() => setEditReadiness((e) => !e)} />
            <SleepRing r={r} />
            <TrainingRing items={v.items} />
          </div>
          {showForm && (
            <div className="mt-4 border-t border-line pt-4">
              <p className="mb-3 text-sm text-muted">
                {r.needsManualInput
                  ? whoopActive(data) && v.day?.shift.dayKind === 'sleep_day'
                    ? 'Dein Tagschlaf ist noch nicht in WHOOP. Bitte kurz eintragen (oder später erneut öffnen):'
                    : 'Keine WHOOP-Daten für heute. Bitte kurz eintragen:'
                  : 'Erholung selbst eintragen:'}
              </p>
              <ManualReadinessForm
                date={today}
                {...(data.manual.find((m) => m.date === today) ? { initial: data.manual.find((m) => m.date === today)! } : {})}
                onSave={async (m) => {
                  await app.saveManual(m)
                  setEditReadiness(false)
                }}
              />
            </div>
          )}
          <div className="mt-4">
            <Vitals />
          </div>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between gap-3" data-testid="countdown">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Ehrwald Trail · 18.06.2027, 23:00 Uhr</div>
            {v.micro && (
              <div className="mt-1 text-sm text-muted">
                {PHASE_LABEL[v.micro.phase]} · Meso {v.micro.mesoIndex} · Mikro {v.micro.index}
                {v.micro.kind === 'deload' && ' · Entlastung'}
              </div>
            )}
          </div>
          <div className="shrink-0 text-right">
            <div className="text-3xl font-bold leading-none text-accent">{cd.started ? '🏁' : cd.days}</div>
            <div className="mt-1 text-[11px] uppercase tracking-wider text-muted">{cd.started ? 'Rennen' : 'Tage bis Start'}</div>
          </div>
        </div>
      </Card>

      <Card>
        <H2>Training heute</H2>
        {v.beforePlan ? (
          <BeforePlan next={nextTrainingDay(plan, today)} />
        ) : v.items.length === 0 ? (
          <div className="text-sm">
            <p className="font-medium">Ruhetag</p>
            {v.day?.optionalNote && <p className="text-muted">{v.day.optionalNote}</p>}
          </div>
        ) : (
          <div className="space-y-3">
            {v.items.map((item) => (
              <TodayItem key={item.session.id} item={item} />
            ))}
          </div>
        )}
        {v.day && v.day.removed.length > 0 && (
          <Disclosure title={`${v.day.removed.length} Einheit${v.day.removed.length === 1 ? '' : 'en'} gestrichen`} className="mt-3">
            <ul className="space-y-1 text-xs text-muted" data-testid="removed">
              {v.day.removed.map((x, i) => (
                <li key={i}>
                  {x.session.title}: {x.note}
                </li>
              ))}
            </ul>
          </Disclosure>
        )}
      </Card>

      {v.catchUp && (
        <Card>
          <H2>Vorschlag</H2>
          <p className="text-sm">{v.catchUp.text}</p>
        </Card>
      )}

      <SleepCard rec={v.sleep} />
      {shiftSheet && <OverrideSheet date={today} onClose={() => setShiftSheet(false)} />}
    </div>
  )
}

const TRAFFIC_RING = { green: RING_COLOR.green, yellow: RING_COLOR.yellow, red: RING_COLOR.red } as const
const hours = (min: number) => (min / 60).toFixed(1).replace('.', ',')

function RecoveryRing({ r, source, onEdit }: { r: ReadinessResult; source: string; onEdit: () => void }) {
  const has = !r.needsManualInput && r.score !== undefined
  return (
    <Ring
      progress={has ? (r.score ?? 0) / 100 : 0}
      color={has && r.traffic ? TRAFFIC_RING[r.traffic] : RING_COLOR.none}
      value={has ? `${r.score} %` : '–'}
      label="Erholung"
      sub={has ? `${TRAFFIC_LABEL[r.traffic!]} · ${source}` : 'bitte eintragen'}
      onClick={onEdit}
      valueTestId="traffic"
    />
  )
}

function SleepRing({ r }: { r: ReadinessResult }) {
  const has = r.sleepMin !== undefined
  return (
    <Ring
      progress={has ? r.sleepMin! / (r.needMin || 1) : 0}
      color={RING_COLOR.sleep}
      value={has ? hours(r.sleepMin!) : '–'}
      {...(has ? { unit: 'h' } : {})}
      label="Schlaf"
      sub={`Bedarf ${hours(r.needMin)} h`}
    />
  )
}

function TrainingRing({ items }: { items: DayItem[] }) {
  let planned = 0
  let done = 0
  let km = 0
  for (const it of items) {
    const active = it.rejected ? it.session : it.adjustment.adjusted
    if (!active || active.optional) continue
    planned += active.durationMin
    if (active.category === 'run') km += active.distanceKm ?? 0
    if (it.log?.status === 'done') done += it.log.durationMin ?? active.durationMin
  }
  return (
    <Ring
      progress={planned ? done / planned : 0}
      color={RING_COLOR.training}
      value={planned ? String(done) : '–'}
      {...(planned ? { unit: 'min' } : {})}
      label="Training"
      sub={planned ? `von ${planned} min${km ? ` · ${formatNumberDE(km)} km` : ''}` : 'Ruhetag'}
      testId="training-ring"
    />
  )
}

function WarningBanner({ w, onAck }: { w: Warning; onAck: () => void }) {
  const cls = { danger: 'border-red/50 bg-red/10', warn: 'border-yellow/50 bg-yellow/10', info: 'border-accent/40 bg-accent/10' }[w.level]
  // Erster Satz sichtbar, der Rest beim Antippen
  const m = /^(.+?[.!?])\s+(.+)$/s.exec(w.text)
  const head = m ? m[1]! : w.text
  const rest = m ? m[2]! : ''
  return (
    <div role="alert" className={`rounded-2xl border p-3 text-sm ${cls}`} data-testid={`warning-${w.id}`}>
      <p className="font-medium">{head}</p>
      {rest && (
        <Disclosure title="Mehr lesen">
          <p>{rest}</p>
        </Disclosure>
      )}
      {w.ackable && (
        <Button className="mt-2" onClick={onAck}>
          Verstanden
        </Button>
      )}
    </div>
  )
}

function BeforePlan({ next }: { next: ReturnType<typeof nextTrainingDay> }) {
  if (!next) return null
  return (
    <div className="space-y-2 text-sm">
      <p>
        Erste Einheit am <strong>{weekdayLongDE(next.date)}, {formatDateDE(next.date)}</strong>:
      </p>
      {next.sessions
        .filter((s) => !s.optional)
        .map((s) => (
          <SessionCard key={s.id} s={s} />
        ))}
    </div>
  )
}

function TodayItem({ item }: { item: DayItem }) {
  const app = useApp()
  const { session, adjustment, log, rejected } = item
  const changed = adjustment.action !== 'keep' && adjustment.action !== 'needs_input'
  const active = rejected ? session : adjustment.adjusted
  const shown = active ?? session
  return (
    <div className="space-y-3 rounded-xl bg-panel-2 p-3" data-testid="today-item">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={`font-medium ${active ? '' : 'line-through decoration-muted'}`}>{active ? active.title : `${session.title} → Ruhetag`}</div>
          <div className="text-xs text-muted">{sessionMeta(shown)}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {changed && !rejected && <Chip tone="warn">angepasst</Chip>}
          {shown.isKey && <Chip tone="accent">Schlüssel</Chip>}
          {shown.optional && <Chip>optional</Chip>}
        </div>
      </div>

      {changed && !rejected && (
        <div className="rounded-lg border border-yellow/30 bg-yellow/5 p-2" data-testid="adjustment">
          <p className="text-sm" data-testid="reason">
            {adjustment.reason}
          </p>
          {adjustment.alternative && <p className="mt-1 text-xs text-muted">Freiwillig: {adjustment.alternative.title}</p>}
          <Disclosure title="Original ansehen">
            <div className="text-xs">
              <div className="line-through decoration-muted">{session.title}</div>
              <div className="text-muted">{sessionMeta(session)}</div>
            </div>
          </Disclosure>
          {!log && (
            <Button variant="ghost" className="px-0" onClick={() => app.setDecision(session.id, session.date, true)}>
              Original ausführen
            </Button>
          )}
        </div>
      )}
      {rejected && changed && (
        <p className="text-xs text-yellow">
          Anpassung abgelehnt, Original wird ausgeführt (protokolliert).{' '}
          {!log && (
            <button className="underline" onClick={() => app.setDecision(session.id, session.date, false)}>
              Anpassung doch annehmen
            </button>
          )}
        </p>
      )}
      {adjustment.action === 'needs_input' && <p className="text-xs text-muted">Bewertung folgt nach der Eingabe deiner Erholung.</p>}

      {active && (
        <Disclosure title="Ablauf und Übungen">
          <SessionDetails s={active} />
        </Disclosure>
      )}

      {log ? (
        <div className="flex items-center justify-between text-sm">
          <Chip tone={log.status === 'done' ? 'accent' : 'neutral'}>{log.status === 'done' ? 'Erledigt' : 'Ausgelassen'}</Chip>
          <Button variant="ghost" onClick={() => app.removeLog(session.id)}>
            rückgängig
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="primary"
            onClick={() =>
              app.saveLog({
                sessionId: session.id,
                date: session.date,
                status: 'done',
                ...(rejected ? { adjustmentRejected: true } : changed ? { reduced: true } : {}),
                ...(active ? { durationMin: active.durationMin } : {}),
                ...(active?.distanceKm !== undefined && active.category === 'run' ? { distanceKm: active.distanceKm } : {}),
                ...(active?.elevationM !== undefined ? { elevationM: active.elevationM } : {}),
              })
            }
          >
            Erledigt
          </Button>
          <Button onClick={() => app.saveLog({ sessionId: session.id, date: session.date, status: 'skipped' })}>Auslassen</Button>
        </div>
      )}
    </div>
  )
}

function blockText(b: SleepBlock): string {
  return `${formatTime(b.start.minutes)}–${formatTime(b.end.minutes)} Uhr`
}

function SleepCard({ rec }: { rec: SleepRecommendation }) {
  const small: { label: string; value: string }[] = []
  if (rec.daySleep) small.push({ label: 'Tagschlaf', value: blockText(rec.daySleep) })
  if (rec.nap) small.push({ label: 'Nap', value: blockText(rec.nap) })
  if (rec.departure !== undefined) small.push({ label: 'Losfahren', value: `${formatTime(rec.departure)} Uhr` })
  const tips = [rec.tip, ...rec.notes].filter((t): t is string => !!t).slice(0, 2)
  return (
    <Card data-testid="sleep">
      <H2>Schlaf</H2>
      {rec.night ? (
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Heute ins Bett" value={`${formatTime(rec.night.start.minutes)}`} sub="Uhr" />
          <Stat label="Morgen aufstehen" value={`${formatTime(rec.night.end.minutes)}`} sub="Uhr" />
        </div>
      ) : (
        <p className="text-sm">Heute Nacht Dienst: Der Hauptschlaf folgt morgen nach der Schicht.</p>
      )}
      {small.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {small.map((x) => (
            <li key={x.label}>
              <span className="text-muted">{x.label}: </span>
              <span className="font-medium">{x.value}</span>
            </li>
          ))}
        </ul>
      )}
      {tips.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-accent" data-testid="sleep-tips">
          {tips.map((t, i) => (
            <li key={i}>💡 {t}</li>
          ))}
        </ul>
      )}
    </Card>
  )
}
