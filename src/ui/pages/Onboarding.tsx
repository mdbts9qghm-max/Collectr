import { useState } from 'react'
import { useApp } from '../../app/AppState'
import { buildCalendar } from '../../app/compute'
import { CONFIG } from '../../core/config'
import { raceConflict } from '../../core/race'
import { effectiveShift, shiftLabel } from '../../core/shift'
import { addDays, compareDates, formatDateDE, formatTime, isValidDate, weekdayShortDE } from '../../core/time'
import { Button, Card, Disclaimer, Field, H2, Input } from '../components/common'
import { StrengthTestForm } from '../components/StrengthTestForm'
import { ProfileFields } from './Settings'

const STEPS = ['Profil', 'Schichtmodell', 'Krafttest', 'Rennen']

export function Onboarding() {
  const app = useApp()
  const [step, setStep] = useState(0)
  const [profile, setProfile] = useState(app.data.settings.profile)
  const [anchor, setAnchor] = useState(app.data.settings.anchorDate)
  const cal = buildCalendar({ ...app.data.settings, anchorDate: isValidDate(anchor) ? anchor : CONFIG.shift.anchorDate, profile }, app.data.overrides)
  const previewStart = compareDates(app.today, CONFIG.plan.startDate) < 0 ? CONFIG.plan.startDate : app.today
  const conflict = raceConflict(cal)

  const finish = () => app.updateSettings({ profile, anchorDate: anchor, onboarded: true })

  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 py-6" style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))' }}>
      <div>
        <h1 className="text-2xl font-bold">Willkommen bei Collectr</h1>
        <p className="text-sm text-muted">Dein Plan für den Ehrwald Trail am 18.06.2027: 86 km, 4.295 hm, Start 23:00 Uhr, Zeitlimit 22 h.</p>
      </div>
      <ol className="flex gap-1" aria-label="Schritte">
        {STEPS.map((s, i) => (
          <li key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-accent' : 'bg-line'}`} aria-label={`${s}${i === step ? ' (aktuell)' : ''}`} />
        ))}
      </ol>

      {step === 0 && (
        <Card>
          <H2>1. Profil</H2>
          <p className="mb-3 text-sm text-muted">Vorausgefüllt aus deinen Angaben. Du kannst alles später in den Einstellungen ändern.</p>
          <ProfileFields profile={profile} onChange={setProfile} />
          <Button variant="primary" className="mt-4 w-full" onClick={() => setStep(1)}>
            Weiter
          </Button>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <H2>2. Schichtmodell</H2>
          <p className="mb-3 text-sm text-muted">
            Tagschicht 07:00–19:00, Nachtschicht 19:00–07:00, Schlaftag, zwei freie Tage (Tag 5 manchmal V-Schicht 08:00–20:00). V-Schichten, Urlaub und
            Tausch trägst du in der Zyklus-Ansicht per Tipp ein.
          </p>
          <Field label="Ankerdatum (Zyklustag 1 = Tagschicht)">
            <Input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} />
          </Field>
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line text-sm" data-testid="shift-preview">
            {Array.from({ length: 10 }, (_, i) => addDays(previewStart, i)).map((d) => {
              const s = effectiveShift(cal, d)
              return (
                <li key={d} className="flex justify-between px-3 py-2">
                  <span>
                    {weekdayShortDE(d)} {formatDateDE(d)} · Tag {s.cycleDay}
                  </span>
                  <span className="text-muted">
                    {shiftLabel(s.code)}
                    {s.work && ` ab ${formatTime(s.work.actualStart)}`}
                  </span>
                </li>
              )
            })}
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button onClick={() => setStep(0)}>Zurück</Button>
            <Button variant="primary" disabled={!isValidDate(anchor)} onClick={() => setStep(2)}>
              Weiter
            </Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <H2>3. Erster Krafttest</H2>
          <p className="mb-3 text-sm text-muted">Saubere Wiederholungen, volle Pause dazwischen. Daraus bestimmt die App deine Startstufen.</p>
          <StrengthTestForm
            date={app.today}
            submitLabel="Test speichern und weiter"
            onSave={async (t) => {
              await app.saveStrengthTest(t, true)
              setStep(3)
            }}
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button onClick={() => setStep(1)}>Zurück</Button>
            <Button variant="ghost" onClick={() => setStep(3)}>
              Später machen
            </Button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <H2>4. Rennen und Dienstplan</H2>
          {conflict.hasConflict ? (
            <div role="alert" className="rounded-xl border border-red/50 bg-red/10 p-3 text-sm" data-testid="onboarding-conflict">
              <p className="font-semibold">Wichtig: Urlaub beantragen!</p>
              <p className="mt-1">{conflict.message}</p>
              <ul className="mt-2 text-xs">
                {conflict.days.map((d) => (
                  <li key={d.date}>
                    {weekdayShortDE(d.date)} {formatDateDE(d.date)}: {d.label}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm">{conflict.message}</p>
          )}
          <div className="mt-3 rounded-xl border border-line p-3 text-sm">
            <p className="font-medium">WHOOP verbinden</p>
            <p className="text-muted">Nach dem Start unter Einstellungen → WHOOP. Ohne WHOOP trägst du Schlaf und Gefühl in „Heute“ kurz selbst ein.</p>
          </div>
          <div className="mt-3">
            <Disclaimer />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button onClick={() => setStep(2)}>Zurück</Button>
            <Button variant="primary" onClick={finish}>
              Plan starten
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
