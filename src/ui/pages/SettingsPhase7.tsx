// Einstellungen aus Phase 7: Installieren, Erinnerungen (Push), Kalender-Export, Dienstplan-Import.

import { useEffect, useRef, useState } from 'react'
import { useApp } from '../../app/AppState'
import { useCloud } from '../../app/cloud'
import { currentSubscription, disablePush, enablePush, isIos, isStandalone, pushSupported, upcomingReminders, uploadReminders } from '../../app/push'
import { CONFIG } from '../../core/config'
import { buildIcs } from '../../core/export'
import { buildImportPreview, type ImportPreview } from '../../core/shift'
import { addDays, formatDateDE, formatTime, instantToBerlin } from '../../core/time'
import { Button, Sub } from '../components/common'

function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function InstallCard() {
  if (isStandalone()) return null
  return (
    <section data-testid="install-hint" className="space-y-2">
      <Sub>Als App installieren</Sub>
      {isIos() ? (
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>In Safari unten auf „Teilen“ tippen (Quadrat mit Pfeil).</li>
          <li>„Zum Home-Bildschirm“ wählen und „Hinzufügen“.</li>
          <li>Collectr über das neue Symbol öffnen. Erst dort gehen Erinnerungen.</li>
        </ol>
      ) : (
        <p className="text-sm">Im Browser-Menü „App installieren“ bzw. „Zum Startbildschirm hinzufügen“ wählen. Danach startet Collectr wie eine App und ist auch offline lesbar.</p>
      )}
    </section>
  )
}

export function RemindersCard() {
  const app = useApp()
  const cloud = useCloud()
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const supported = pushSupported()

  useEffect(() => {
    void currentSubscription().then((s) => setEnabled(!!s))
  }, [])

  const reminders = upcomingReminders(app.cal, app.plan, app.today, app.dayView(app.today).sleep, app.now).slice(0, 3)
  const lead = CONFIG.sleep.reminderLeadMin

  let hint: string | null = null
  if (!cloud) hint = 'Erinnerungen brauchen ein Konto (Supabase), weil sie vom Server geschickt werden.'
  else if (!supported) hint = isIos() && !isStandalone() ? 'Auf dem iPhone gehen Erinnerungen nur in der installierten App (siehe „Als App installieren“).' : 'Dieser Browser unterstützt keine Push-Benachrichtigungen.'

  const toggle = async (on: boolean) => {
    if (!cloud) return
    setBusy(true)
    setMsg(null)
    setEnabled(on)
    const err = on ? await enablePush(cloud.client) : await disablePush(cloud.client)
    if (!err && on) {
      try {
        await uploadReminders(cloud.client, upcomingReminders(app.cal, app.plan, app.today, app.dayView(app.today).sleep, app.now))
      } catch (e) {
        setMsg(`Erinnerungen nicht gespeichert: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (err) setMsg(err)
    setEnabled((await currentSubscription()) !== null)
    setBusy(false)
  }

  return (
    <section data-testid="reminders" className="space-y-2">
      <Sub>Erinnerungen</Sub>
      <p className="mb-2 text-sm text-muted">Push-Nachricht {lead} min vor dem empfohlenen Zubettgehen und vor dem Nap (z. B. vor der Nachtschicht).</p>
      {hint ? (
        <p className="text-sm text-yellow">{hint}</p>
      ) : (
        <label className="flex min-h-11 items-center justify-between">
          <span>Erinnerungen auf diesem Gerät</span>
          <input
            type="checkbox"
            className="h-6 w-6 accent-[#34d399]"
            checked={enabled ?? false}
            disabled={busy || enabled === null}
            onChange={(e) => void toggle(e.target.checked)}
            aria-label="Erinnerungen"
          />
        </label>
      )}
      {msg && (
        <p role="alert" className="mt-1 text-sm text-red">
          {msg}
        </p>
      )}
      {app.data.settings.simulatedDate && <p className="mt-1 text-xs text-yellow">Mit simuliertem Datum werden keine Erinnerungen geplant.</p>}
      {reminders.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-muted" data-testid="next-reminders">
          {reminders.map((r) => {
            const at = instantToBerlin(r.dueAt)
            return (
              <li key={r.id}>
                {formatDateDE(at.date)} {formatTime(at.minutes)}: {r.title}. {r.body}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export function CalendarExportCard() {
  const app = useApp()
  const [range, setRange] = useState<'4w' | 'all'>('4w')
  const [opts, setOpts] = useState({ sessions: true, shifts: true, sleep: true })
  const last = app.plan.days[app.plan.days.length - 1]?.date ?? app.today
  const first = app.plan.days[0]?.date ?? app.today
  const from = app.today < first ? first : app.today
  const to = range === '4w' ? addDays(from, 27) : last

  const run = () => {
    const ics = buildIcs(app.plan, app.cal, { from, to, ...opts, now: new Date(app.now).toISOString() })
    downloadFile(`collectr-${from}-bis-${to}.ics`, ics, 'text/calendar;charset=utf-8')
  }
  const LABEL = { sessions: 'Trainingseinheiten', shifts: 'Schichten', sleep: 'Schlaf und Nap' } as const

  return (
    <section data-testid="calendar-export" className="space-y-2">
      <Sub>Kalender-Export (.ics)</Sub>
      <div className="mb-2 flex gap-2" role="group" aria-label="Zeitraum Export">
        {(
          [
            ['4w', 'Nächste 4 Wochen'],
            ['all', 'Gesamter Plan'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} aria-pressed={range === k} onClick={() => setRange(k)} className={`min-h-11 flex-1 rounded-xl border text-sm ${range === k ? 'border-accent bg-accent/20 text-accent' : 'border-line bg-panel-2'}`}>
            {l}
          </button>
        ))}
      </div>
      {(Object.keys(LABEL) as (keyof typeof LABEL)[]).map((k) => (
        <label key={k} className="flex min-h-11 items-center justify-between">
          <span>{LABEL[k]}</span>
          <input type="checkbox" className="h-6 w-6 accent-[#34d399]" checked={opts[k]} onChange={(e) => setOpts({ ...opts, [k]: e.target.checked })} aria-label={LABEL[k]} />
        </label>
      ))}
      <Button className="mt-2 w-full" disabled={!opts.sessions && !opts.shifts && !opts.sleep} onClick={run}>
        Kalenderdatei herunterladen
      </Button>
      <p className="mt-2 text-xs text-muted">
        {formatDateDE(from)} bis {formatDateDE(to)}. Enthält den geplanten Stand. Anpassungen an deine Erholung passieren tagesaktuell in der App.
      </p>
    </section>
  )
}

export function RosterImportCard() {
  const app = useApp()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [msg, setMsg] = useState<string | null>(null)

  const load = async (file: File) => {
    const p = buildImportPreview(await file.text(), app.cal)
    setPreview(p)
    setSelected(new Set(p.changes.map((c) => c.date)))
    setMsg(p.changes.length === 0 && p.unknown.length === 0 && p.unchanged === 0 ? 'In der Datei wurden keine Termine gefunden.' : null)
  }

  const apply = async () => {
    if (!preview) return
    const chosen = preview.changes.filter((c) => selected.has(c.date))
    for (const c of chosen) await app.setOverride(c.override)
    setMsg(`${chosen.length} Änderung${chosen.length === 1 ? '' : 'en'} übernommen. Der Plan wurde neu berechnet.`)
    setPreview(null)
  }

  return (
    <section data-testid="roster-import" className="space-y-2">
      <Sub>Dienstplan importieren (.ics)</Sub>
      <p className="mb-2 text-sm text-muted">Kalenderdatei aus dem Dienstplan wählen. Du siehst vorher, was sich gegenüber dem berechneten Rhythmus ändert, und bestätigst jede Änderung.</p>
      <Button className="w-full" onClick={() => fileRef.current?.click()}>
        Datei wählen
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept=".ics,text/calendar"
        className="hidden"
        data-testid="roster-file"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void load(f)
          e.target.value = ''
        }}
      />
      {msg && (
        <p role="status" className="mt-2 text-sm">
          {msg}
        </p>
      )}
      {preview && (
        <div className="mt-3 space-y-2" data-testid="roster-preview">
          <p className="text-sm">
            {preview.from && preview.to ? `${formatDateDE(preview.from)} bis ${formatDateDE(preview.to)}: ` : ''}
            {preview.changes.length} Abweichung{preview.changes.length === 1 ? '' : 'en'}, {preview.unchanged} passend
          </p>
          {preview.changes.map((c) => (
            <label key={c.date} className="flex min-h-11 items-center gap-3 rounded-xl border border-line bg-panel-2 px-3 text-sm">
              <input
                type="checkbox"
                className="h-5 w-5 accent-[#34d399]"
                checked={selected.has(c.date)}
                onChange={(e) => {
                  const next = new Set(selected)
                  if (e.target.checked) next.add(c.date)
                  else next.delete(c.date)
                  setSelected(next)
                }}
              />
              <span>{c.text}</span>
            </label>
          ))}
          {preview.unknown.length > 0 && (
            <details className="text-xs text-muted">
              <summary>{preview.unknown.length} Termin(e) nicht erkannt</summary>
              <ul className="mt-1 space-y-0.5">
                {preview.unknown.map((u, i) => (
                  <li key={i}>
                    {formatDateDE(u.date)}: {u.summary}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="primary" disabled={selected.size === 0} onClick={() => void apply()}>
              Übernehmen ({selected.size})
            </Button>
            <Button onClick={() => setPreview(null)}>Abbrechen</Button>
          </div>
        </div>
      )}
    </section>
  )
}
