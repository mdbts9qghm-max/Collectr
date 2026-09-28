import { useRef, useState } from 'react'
import { useApp } from '../../app/AppState'
import { useCloud } from '../../app/cloud'
import { CONFIG, resolveConfig, type RecoveryWeights } from '../../core/config'
import { formatDateDE, isValidDate } from '../../core/time'
import type { Profile } from '../../core/types'
import { Button, Disclosure, Field, Input, NumberInput, Sub } from '../components/common'
import { CalendarExportCard, InstallCard, RemindersCard, RosterImportCard } from './SettingsPhase7'

const WEIGHT_LABEL: Record<keyof RecoveryWeights, string> = {
  recovery: 'Recovery Score',
  hrv: 'HRV',
  restingHr: 'Ruhepuls',
  sleep: 'Schlaf',
  sleepDebt: 'Schlafdefizit',
  load: 'Trainingslast',
  shift: 'Schichtkontext',
}

export function ProfileFields({ profile, onChange }: { profile: Profile; onChange: (p: Profile) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label="Aktueller Umfang (km/Woche)">
        <NumberInput value={profile.weeklyKmStart} min={5} max={200} onChange={(v) => onChange({ ...profile, weeklyKmStart: v ?? profile.weeklyKmStart })} />
      </Field>
      <Field label="Längster Lauf (km)">
        <NumberInput value={profile.longestRunKm} min={0} onChange={(v) => onChange({ ...profile, longestRunKm: v ?? 0 })} />
      </Field>
      <Field label="Arbeitsweg (min)">
        <NumberInput value={profile.commuteMin} min={0} max={180} onChange={(v) => onChange({ ...profile, commuteMin: v ?? profile.commuteMin })} />
      </Field>
      <Field label="Calisthenics">
        <select
          className="min-h-11 w-full rounded-xl border border-line bg-panel-2 px-3"
          value={profile.calisthenicsLevel}
          onChange={(e) => onChange({ ...profile, calisthenicsLevel: e.target.value as Profile['calisthenicsLevel'] })}
        >
          <option value="beginner">Anfänger</option>
          <option value="intermediate">Fortgeschritten</option>
          <option value="advanced">Erfahren</option>
        </select>
      </Field>
      <div className="col-span-2">
        <Field label="Verletzungen / Schwachstellen">
          <Input value={profile.injuries} placeholder="keine" onChange={(e) => onChange({ ...profile, injuries: e.target.value })} />
        </Field>
      </div>
      <div className="col-span-2 text-xs text-muted">
        Zugang: {profile.hasGym ? 'Fitnessstudio (Laufband mit Steigung)' : ''}
        {profile.hasCalisthenicsPark ? ', Calisthenics-Park' : ''} · Ziele: {profile.calisthenicsGoals.join(', ')} · Wearable: WHOOP
      </div>
    </div>
  )
}

function WhoopSection() {
  const app = useApp()
  const cloud = useCloud()
  const status = app.data.whoop.status
  const params = new URLSearchParams(window.location.search)
  const result = params.get('whoop')
  const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' }) : '–')
  if (!cloud) return <p className="text-sm text-muted">Für WHOOP ist die Anmeldung mit Supabase nötig. Bis dahin: manuelle Eingabe oder Demo-Modus.</p>
  return (
    <div className="space-y-2 text-sm" data-testid="whoop-section">
      {result === 'verbunden' && <p className="text-accent">WHOOP wurde verbunden. Die Daten werden geladen …</p>}
      {result === 'fehler' && <p className="text-red">Verbindung fehlgeschlagen: {params.get('grund') ?? 'unbekannt'}</p>}
      {status?.connected ? (
        <>
          <p>
            Verbunden seit {fmt(status.connectedAt)}. Letzter Abruf: {fmt(status.lastSyncAt)}
            {status.counts && ` (${status.counts.recoveries ?? 0} Recoveries, ${status.counts.sleeps ?? 0} Schlafphasen, ${status.counts.workouts ?? 0} Workouts)`}
          </p>
          {status.lastError && <p className="text-red">Letzter Fehler: {status.lastError}</p>}
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => void cloud.whoop.fetchNow(true)} disabled={cloud.whoop.busy}>
              {cloud.whoop.busy ? 'Lade …' : 'Jetzt abrufen'}
            </Button>
            <Button variant="danger" onClick={() => void cloud.whoop.disconnect()} disabled={cloud.whoop.busy}>
              Trennen
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-muted">Verbinde WHOOP, damit Recovery, HRV, Ruhepuls, Schlaf, Strain und Workouts automatisch in den Plan einfließen.</p>
          <Button variant="primary" className="w-full" onClick={() => void cloud.whoop.connect()}>
            Mit WHOOP verbinden
          </Button>
        </>
      )}
      {cloud.whoop.error && <p className="text-red">{cloud.whoop.error}</p>}
    </div>
  )
}

function AccountSection() {
  const cloud = useCloud()
  if (!cloud) return <p className="text-sm text-muted">Nur lokal auf diesem Gerät gespeichert (Supabase ist nicht konfiguriert).</p>
  const { status } = cloud
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        {status.state === 'error' ? `Fehler: ${status.error}` : status.state === 'offline' ? 'Offline, Änderungen werden später hochgeladen.' : 'Daten werden mit Supabase synchronisiert.'}
        {status.pending > 0 && ` ${status.pending} Änderung(en) ausstehend.`}
        {status.lastSync && ` Zuletzt: ${new Date(status.lastSync).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}`}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => void cloud.syncNow()}>Jetzt synchronisieren</Button>
        <Button onClick={() => void cloud.signOut()}>Abmelden</Button>
      </div>
    </div>
  )
}

export function Settings() {
  const app = useApp()
  const s = app.data.settings
  const [profile, setProfile] = useState(s.profile)
  const [anchor, setAnchor] = useState(s.anchorDate)
  const [sim, setSim] = useState(s.simulatedDate ?? '')
  const [msg, setMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const weights = resolveConfig({ recoveryWeights: s.recoveryWeights }).recoveryWeights
  const raw = { ...CONFIG.recovery.weights, ...s.recoveryWeights }

  const download = async () => {
    const json = await app.exportBackup()
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `collectr-backup-${app.today}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const cloud = useCloud()
  const whoopReturn = new URLSearchParams(window.location.search).has('whoop')
  const whoop = app.data.whoop.status

  return (
    <div className="space-y-3">
      {msg && (
        <div role="status" className="rounded-2xl border border-accent/40 bg-accent/10 p-3 text-sm">
          {msg}
        </div>
      )}
      <Disclosure card title="Konto" summary={cloud ? `Angemeldet als ${cloud.email}` : 'nur lokal'}>
        <AccountSection />
      </Disclosure>

      <Disclosure card title="Profil" summary={`${s.profile.weeklyKmStart} km/Woche · Arbeitsweg ${s.profile.commuteMin} min`}>
        <ProfileFields profile={profile} onChange={setProfile} />
        <Button
          variant="primary"
          className="mt-3 w-full"
          onClick={async () => {
            await app.updateSettings({ profile })
            setMsg('Profil gespeichert, Plan neu berechnet.')
          }}
        >
          Profil speichern
        </Button>
      </Disclosure>

      <Disclosure card title="Schichten & Dienstplan" summary={`Anker ${formatDateDE(s.anchorDate)}`}>
        <div className="space-y-6">
          <section className="space-y-2">
            <Sub>Schichtmodell</Sub>
            <p className="mb-2 text-sm text-muted">
              5-Tage-Rhythmus: Tag → Nacht → Schlaftag → Frei → Frei (oder V-Schicht). Dienstbeginn 15 min früher, Losfahren = Arbeitsbeginn − Arbeitsweg.
            </p>
            <Field label="Ankerdatum (Zyklustag 1, Tagschicht)">
              <Input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} />
            </Field>
            <Button className="mt-3 w-full" disabled={!isValidDate(anchor)} onClick={() => app.updateSettings({ anchorDate: anchor })}>
              Ankerdatum speichern
            </Button>
          </section>
          <RosterImportCard />
        </div>
      </Disclosure>

      <Disclosure card title="WHOOP & Erinnerungen" summary={whoop?.connected ? 'WHOOP verbunden' : s.demoMode ? 'Demo-Modus' : 'nicht verbunden'} defaultOpen={whoopReturn}>
        <div className="space-y-6">
          <section className="space-y-2">
            <Sub>WHOOP</Sub>
            <WhoopSection />
            <label className="mt-3 flex min-h-11 items-center justify-between">
              <span>Demo-Modus (Beispieldaten)</span>
              <input type="checkbox" className="h-6 w-6 accent-[#34d399]" checked={s.demoMode} onChange={(e) => app.updateSettings({ demoMode: e.target.checked })} aria-label="Demo-Modus" />
            </label>
          </section>
          <RemindersCard />
          <InstallCard />
        </div>
      </Disclosure>

      <Disclosure card title="Kalender & Backup">
        <div className="space-y-6">
          <CalendarExportCard />
          <section className="space-y-2">
            <Sub>Backup</Sub>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={download}>Export (JSON)</Button>
              <Button onClick={() => fileRef.current?.click()}>Import</Button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (!f) return
                const err = await app.importBackup(await f.text())
                setMsg(err ?? 'Backup importiert.')
              }}
            />
            <Button
              variant="danger"
              className="mt-3 w-full"
              onClick={async () => {
                if (window.confirm('Alle Daten löschen (auf diesem Gerät und, wenn angemeldet, auch in der Cloud)? Das kann nicht rückgängig gemacht werden.')) await app.resetAll()
              }}
            >
              Alle Daten zurücksetzen
            </Button>
          </section>
        </div>
      </Disclosure>

      <Disclosure card title="Erweitert" summary={s.simulatedDate ? `Datum simuliert: ${formatDateDE(s.simulatedDate)}` : 'Gewichtung, Muster, Testdatum'}>
        <div className="space-y-6">
          <section className="space-y-2">
            <Sub>Gewichtung der Erholungsfaktoren</Sub>
            <p className="mb-3 text-xs text-muted">Die Werte werden automatisch auf 100 % normiert.</p>
            <div className="space-y-3">
              {(Object.keys(WEIGHT_LABEL) as (keyof RecoveryWeights)[]).map((k) => (
                <label key={k} className="block">
                  <div className="flex justify-between text-sm">
                    <span>{WEIGHT_LABEL[k]}</span>
                    <span className="text-muted">{Math.round(weights[k] * 100)} %</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={raw[k]}
                    className="w-full accent-[#34d399]"
                    onChange={(e) => app.updateSettings({ recoveryWeights: { ...s.recoveryWeights, [k]: Number(e.target.value) } })}
                  />
                </label>
              ))}
            </div>
            <Button variant="ghost" className="mt-2 px-0" onClick={() => app.updateSettings({ recoveryWeights: {} })}>
              Auf Standard zurücksetzen
            </Button>
          </section>
          <section className="space-y-2">
            <Sub>Gelernte Muster</Sub>
            <label className="flex min-h-11 items-center justify-between gap-3">
              <span className="text-sm">In der Vorausschau nutzen (z. B. typischer Recovery-Abfall nach Nachtschichten)</span>
              <input
                type="checkbox"
                className="h-6 w-6 shrink-0 accent-[#34d399]"
                checked={s.usePatterns ?? false}
                onChange={(e) => app.updateSettings({ usePatterns: e.target.checked })}
                aria-label="Gelernte Muster nutzen"
              />
            </label>
            <p className="text-xs text-muted">
              {app.patterns.enoughData ? 'Genügend Daten vorhanden.' : `Wirkt erst ab ca. 6 Wochen Daten (bisher ${app.patterns.daysWithData} Tage).`} Auswertungen siehst du unter „Erholung“.
            </p>
          </section>
          <section className="space-y-2">
            <Sub>Datum simulieren</Sub>
            <p className="mb-2 text-xs text-muted">Nur zum Ausprobieren. Leer lassen für das echte Datum.</p>
            <div className="flex gap-2">
              <Input type="date" value={sim} onChange={(e) => setSim(e.target.value)} aria-label="Simuliertes Datum" />
              <Button onClick={() => app.updateSettings({ simulatedDate: sim && isValidDate(sim) ? sim : null })}>Setzen</Button>
            </div>
            {s.simulatedDate && (
              <Button
                variant="ghost"
                className="mt-2 px-0"
                onClick={() => {
                  setSim('')
                  void app.updateSettings({ simulatedDate: null })
                }}
              >
                Echtes Datum verwenden
              </Button>
            )}
          </section>
        </div>
      </Disclosure>
    </div>
  )
}
