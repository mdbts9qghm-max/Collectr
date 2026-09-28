import { useState } from 'react'
import { useApp } from '../../app/AppState'
import { nextTrainingDay, whoopActive, type DayItem, type Warning } from '../../app/compute'
import { PHASE_LABEL } from '../../core/plan'
import { raceCountdown } from '../../core/race'
import { shiftLabel } from '../../core/shift'
import { berlinToInstant, formatDateDE, formatTime, weekdayLongDE } from '../../core/time'
import type { SleepBlock, SleepRecommendation } from '../../core/types'
import { Button, Card, Chip, H2, TRAFFIC_LABEL, TrafficDot } from '../components/common'
import { ManualReadinessForm } from '../components/ManualReadinessForm'
import { SessionCard, sessionMeta } from '../components/SessionCard'

export function Today() {
  const app = useApp()
  const { today, plan, data } = app
  const v = app.dayView(today)
  const [editReadiness, setEditReadiness] = useState(false)
  // Bei simuliertem Datum zählt der Countdown ab 12:00 Uhr dieses Tages.
  const cd = raceCountdown(data.settings.simulatedDate ? berlinToInstant(today, 12 * 60) : app.now)

  return (
    <div className="space-y-4">
      {v.warnings.map((w) => (
        <WarningBanner key={w.id} w={w} onAck={() => app.updateSettings({ vacationReminderAck: today })} />
      ))}

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">{weekdayLongDE(today)}</div>
            {v.day ? (
              <div className="text-sm text-muted" data-testid="shift-info">
                Zyklustag {v.day.shift.cycleDay} · {shiftLabel(v.day.shift.code)}
                {v.day.shift.work && ` · Beginn ${formatTime(v.day.shift.work.actualStart)}`}
              </div>
            ) : (
              <div className="text-sm text-muted">{v.beforePlan ? 'Der Plan beginnt am 02.10.2026.' : 'Außerhalb des Plans'}</div>
            )}
            {v.micro && (
              <div className="mt-1 text-xs text-muted">
                {PHASE_LABEL[v.micro.phase]} · Mesozyklus {v.micro.mesoIndex} · Mikrozyklus {v.micro.index}
                {v.micro.kind === 'deload' && ' · Entlastung'}
              </div>
            )}
          </div>
          <div className="text-right" data-testid="countdown">
            <div className="text-2xl font-bold text-accent">{cd.started ? '🏁' : cd.days}</div>
            <div className="text-xs text-muted">{cd.started ? 'Rennen' : 'Tage bis zum Start'}</div>
          </div>
        </div>
        {v.day?.window && (
          <p className="mt-3 text-sm">
            Trainingsfenster {formatTime(v.day.window.start)}–{formatTime(v.day.window.end)} Uhr
            {v.day.window.easyOnly && ' · nur locker'}
          </p>
        )}
      </Card>

      {!v.beforePlan && !v.afterRace && (
        <Card data-testid="readiness">
          <H2>Erholung</H2>
          {v.readiness.needsManualInput || editReadiness ? (
            <>
              <p className="mb-3 text-sm text-muted">
                {whoopActive(data) && v.day?.shift.dayKind === 'sleep_day'
                  ? 'Dein Tagschlaf ist noch nicht in WHOOP. Bitte kurz eintragen (oder später erneut öffnen):'
                  : 'Keine WHOOP-Daten für heute. Bitte kurz eintragen:'}
              </p>
              <ManualReadinessForm
                date={today}
                {...(data.manual.find((m) => m.date === today) ? { initial: data.manual.find((m) => m.date === today)! } : {})}
                onSave={async (m) => {
                  await app.saveManual(m)
                  setEditReadiness(false)
                }}
              />
            </>
          ) : (
            <div className="flex items-center gap-4">
              <TrafficDot traffic={v.readiness.traffic} size="lg" />
              <div className="flex-1">
                <div className="text-lg font-semibold" data-testid="traffic">
                  {TRAFFIC_LABEL[v.readiness.traffic!]} · {v.readiness.score} %
                </div>
                <div className="text-xs text-muted">
                  {v.readiness.source === 'manual' ? 'manuelle Eingabe' : whoopActive(data) ? 'WHOOP' : 'WHOOP (Beispieldaten)'}
                  {v.readiness.sleepMin !== undefined && ` · ${(v.readiness.sleepMin / 60).toFixed(1).replace('.', ',')} h Schlaf`}
                </div>
              </div>
              <Button variant="ghost" onClick={() => setEditReadiness(true)}>
                ändern
              </Button>
            </div>
          )}
        </Card>
      )}

      <Card>
        <H2>Heute</H2>
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
          <ul className="mt-3 space-y-1 text-xs text-muted" data-testid="removed">
            {v.day.removed.map((r, i) => (
              <li key={i}>
                {r.session.title}: {r.note}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {v.catchUp && (
        <Card>
          <H2>Vorschlag</H2>
          <p className="text-sm">{v.catchUp.text}</p>
        </Card>
      )}

      <SleepCard rec={v.sleep} />
    </div>
  )
}

function WarningBanner({ w, onAck }: { w: Warning; onAck: () => void }) {
  const cls = { danger: 'border-red/50 bg-red/10', warn: 'border-yellow/50 bg-yellow/10', info: 'border-accent/40 bg-accent/10' }[w.level]
  return (
    <div role="alert" className={`rounded-2xl border p-3 text-sm ${cls}`} data-testid={`warning-${w.id}`}>
      <p>{w.text}</p>
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
  return (
    <div className="space-y-2" data-testid="today-item">
      {changed && !rejected ? (
        <div className="rounded-xl border border-yellow/40 bg-yellow/5 p-3" data-testid="adjustment">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-muted">Original</div>
              <div className="line-through decoration-muted">{session.title}</div>
              <div className="text-muted">{sessionMeta(session)}</div>
            </div>
            <div>
              <div className="text-muted">Anpassung</div>
              <div className="font-medium">{adjustment.adjusted ? adjustment.adjusted.title : 'Ruhetag'}</div>
              {adjustment.adjusted && <div className="text-muted">{sessionMeta(adjustment.adjusted)}</div>}
            </div>
          </div>
          <p className="mt-2 text-sm" data-testid="reason">
            {adjustment.reason}
          </p>
          {adjustment.alternative && <p className="mt-1 text-xs text-muted">Freiwillig: {adjustment.alternative.title}</p>}
          {!log && (
            <Button variant="ghost" className="mt-1 px-0" onClick={() => app.setDecision(session.id, session.date, true)}>
              Original ausführen
            </Button>
          )}
        </div>
      ) : null}
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
      {active ? <SessionCard s={active} /> : null}
      {adjustment.action === 'needs_input' && <p className="text-xs text-muted">Bewertung folgt nach der Eingabe deiner Erholung.</p>}
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
  return (
    <Card data-testid="sleep">
      <H2>Schlaf</H2>
      <ul className="space-y-1 text-sm">
        {rec.daySleep && <li>Tagschlaf nach der Nacht: {blockText(rec.daySleep)}</li>}
        {rec.nap && <li>Nap: {blockText(rec.nap)}</li>}
        {rec.departure !== undefined && <li>Losfahren: {formatTime(rec.departure)} Uhr</li>}
        {rec.night && (
          <li>
            Heute Nacht: ins Bett {formatTime(rec.night.start.minutes)} Uhr, aufstehen {formatTime(rec.night.end.minutes)} Uhr
          </li>
        )}
      </ul>
      {rec.notes.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">
          {rec.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      {rec.tip && <p className="mt-2 text-xs text-accent">Tipp: {rec.tip}</p>}
    </Card>
  )
}
