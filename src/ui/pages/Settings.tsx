import { useRef, useState } from 'react'
import { useApp } from '../../app/AppState'
import { CONFIG, resolveConfig, type RecoveryWeights } from '../../core/config'
import { isValidDate } from '../../core/time'
import type { Profile } from '../../core/types'
import { Button, Card, Field, H2, Input, NumberInput } from '../components/common'

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

  return (
    <div className="space-y-4">
      {msg && (
        <div role="status" className="rounded-2xl border border-accent/40 bg-accent/10 p-3 text-sm">
          {msg}
        </div>
      )}
      <Card>
        <H2>Profil</H2>
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
      </Card>

      <Card>
        <H2>Schichtmodell</H2>
        <p className="mb-2 text-sm text-muted">
          5-Tage-Rhythmus: Tag → Nacht → Schlaftag → Frei → Frei (oder V-Schicht). Dienstbeginn 15 min früher, Losfahren = Arbeitsbeginn − Arbeitsweg.
        </p>
        <Field label="Ankerdatum (Zyklustag 1, Tagschicht)">
          <Input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} />
        </Field>
        <Button className="mt-3 w-full" disabled={!isValidDate(anchor)} onClick={() => app.updateSettings({ anchorDate: anchor })}>
          Ankerdatum speichern
        </Button>
      </Card>

      <Card>
        <H2>Gewichtung der Erholungsfaktoren</H2>
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
      </Card>

      <Card>
        <H2>WHOOP</H2>
        <p className="text-sm text-muted">Die Verbindung zu WHOOP folgt in Phase 5. Bis dahin: manuelle Eingabe oder Demo-Modus.</p>
        <label className="mt-3 flex min-h-11 items-center justify-between">
          <span>Demo-Modus (Beispieldaten)</span>
          <input type="checkbox" className="h-6 w-6 accent-[#34d399]" checked={s.demoMode} onChange={(e) => app.updateSettings({ demoMode: e.target.checked })} aria-label="Demo-Modus" />
        </label>
      </Card>

      <Card>
        <H2>Datum simulieren</H2>
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
      </Card>

      <Card>
        <H2>Backup</H2>
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
            if (window.confirm('Alle Daten auf diesem Gerät löschen? Das kann nicht rückgängig gemacht werden.')) await app.resetAll()
          }}
        >
          Alle Daten zurücksetzen
        </Button>
      </Card>
    </div>
  )
}
