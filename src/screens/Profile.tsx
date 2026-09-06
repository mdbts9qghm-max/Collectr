import { useEffect, useRef, useState } from 'react';
import type { ShiftType, TrainingPhase } from '../domain/types.ts';
import { INTENSITIES } from '../domain/types.ts';
import { INTENSITY_META, formatDuration, formatPace } from '../domain/format.ts';
import { PHASE_META } from '../domain/phases.ts';
import { storageEstimate } from '../data/db.ts';
import {
  backupFilename,
  buildBackup,
  checkInsToCsv,
  downloadFile,
  habitEntriesToCsv,
  parseBackup,
  sessionsToCsv,
  tasksToCsv,
} from '../data/backup.ts';
import { useStore } from '../data/store.ts';
import { useData } from '../app/hooks.ts';
import { APP_VERSION, BUILD_REV, formatBuildTime } from '../app/version.ts';
import { forceRefresh } from '../app/updates.ts';
import {
  Button,
  Card,
  Field,
  Pill,
  SectionTitle,
  Segmented,
  Select,
  SettingRow,
  Sheet,
  Switch,
  TextInput,
} from '../ui/primitives.tsx';
import { IconDownload, IconPlus, IconUpload } from '../ui/icons.tsx';
import { PhaseSheet, PlanSheet, newPhase } from '../ui/PhaseSheet.tsx';

export function Profile() {
  const data = useData();
  const updateSettings = useStore((s) => s.updateSettings);
  const replaceAll = useStore((s) => s.replaceAll);
  const resetAll = useStore((s) => s.resetAll);
  const persistent = useStore((s) => s.persistent);
  const storageError = useStore((s) => s.storageError);
  const toast = useStore((s) => s.toast);

  const [editingShift, setEditingShift] = useState<ShiftType | null>(null);
  const [editingPhase, setEditingPhase] = useState<TrainingPhase | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void storageEstimate().then(setStorage);
  }, []);

  const { settings } = data;
  const set = updateSettings;
  const activePlan = data.plans.find((p) => p.active) ?? data.plans[0] ?? null;

  const handleImport = async (file: File) => {
    const text = await file.text();
    const result = parseBackup(text);
    if (!result.ok || !result.data) {
      toast(result.error ?? 'Import fehlgeschlagen', 'bad');
      return;
    }
    const counts = result.summary?.map((s) => `${s.count} ${s.label}`).join(', ');
    if (!confirm(`Backup importieren und alle aktuellen Daten ersetzen?\n\n${counts}`)) return;
    await replaceAll(result.data);
    toast('Backup importiert', 'good');
  };

  return (
    <>
      <h1 className="t-title">Profil & Einstellungen</h1>

      {storageError && (
        <Card tight style={{ background: 'var(--bad-soft)', borderColor: 'transparent' }}>
          <div className="t-small">{storageError}</div>
        </Card>
      )}

      {/* ---------- Profile ---------- */}
      <SectionTitle title="Athlet" />
      <Card>
        <Field label="Name">
          <TextInput
            value={settings.profile.name}
            onChange={(e) => set({ profile: { ...settings.profile, name: e.target.value } })}
          />
        </Field>
        <div className="grid-2 mt-4">
          <Field label="Geburtsjahr">
            <TextInput
              type="number"
              inputMode="numeric"
              value={settings.profile.birthYear}
              onChange={(e) => set({ profile: { ...settings.profile, birthYear: Number(e.target.value) || 0 } })}
            />
          </Field>
          <Field label="Größe">
            <TextInput
              type="number"
              inputMode="numeric"
              suffix="cm"
              value={settings.profile.heightCm}
              onChange={(e) => set({ profile: { ...settings.profile, heightCm: Number(e.target.value) || 0 } })}
            />
          </Field>
        </div>
        <div className="grid-2 mt-4">
          <Field label="Körpergewicht" hint="Wird vom letzten Check-in überschrieben.">
            <TextInput
              type="number"
              inputMode="decimal"
              step="0.1"
              suffix="kg"
              value={settings.profile.bodyweightKg}
              onChange={(e) => set({ profile: { ...settings.profile, bodyweightKg: Number(e.target.value) || 0 } })}
            />
          </Field>
          <Field label="Maximalpuls">
            <TextInput
              type="number"
              inputMode="numeric"
              suffix="bpm"
              value={settings.profile.maxHr ?? ''}
              onChange={(e) => set({ profile: { ...settings.profile, maxHr: Number(e.target.value) || undefined } })}
            />
          </Field>
        </div>
      </Card>

      {/* ---------- Training ---------- */}
      <SectionTitle title="Trainingswerte" subtitle="Diese Werte steuern Empfehlungen und Score." />
      <Card>
        <div className="grid-2">
          <Field label="Wochenstunden Ziel">
            <TextInput
              type="number"
              inputMode="decimal"
              step="0.5"
              suffix="h"
              value={settings.training.weeklyHoursTarget}
              onChange={(e) =>
                set({ training: { ...settings.training, weeklyHoursTarget: Number(e.target.value) || 0 } })
              }
            />
          </Field>
          <Field label="Trainingstage / Woche">
            <TextInput
              type="number"
              inputMode="numeric"
              min={1}
              max={7}
              value={settings.training.trainingDaysPerWeek}
              onChange={(e) =>
                set({ training: { ...settings.training, trainingDaysPerWeek: Number(e.target.value) || 1 } })
              }
            />
          </Field>
        </div>

        <div className="grid-2 mt-4">
          <Field label="FTP">
            <TextInput
              type="number"
              inputMode="numeric"
              suffix="W"
              value={settings.training.ftpWatts}
              onChange={(e) => set({ training: { ...settings.training, ftpWatts: Number(e.target.value) || 0 } })}
            />
          </Field>
          <Field label="Max. Einheiten / Woche">
            <TextInput
              type="number"
              inputMode="numeric"
              value={settings.training.maxSessionsPerWeek}
              onChange={(e) =>
                set({ training: { ...settings.training, maxSessionsPerWeek: Number(e.target.value) || 1 } })
              }
            />
          </Field>
        </div>

        <div className="grid-2 mt-4">
          <Field label="Zone-2-Pace" hint={formatPace(settings.training.z2PaceSecPerKm)}>
            <TextInput
              type="number"
              inputMode="numeric"
              suffix="s/km"
              value={settings.training.z2PaceSecPerKm}
              onChange={(e) =>
                set({ training: { ...settings.training, z2PaceSecPerKm: Number(e.target.value) || 0 } })
              }
            />
          </Field>
          <Field label="Schwellenpace" hint={formatPace(settings.training.thresholdPaceSecPerKm)}>
            <TextInput
              type="number"
              inputMode="numeric"
              suffix="s/km"
              value={settings.training.thresholdPaceSecPerKm}
              onChange={(e) =>
                set({ training: { ...settings.training, thresholdPaceSecPerKm: Number(e.target.value) || 0 } })
              }
            />
          </Field>
        </div>

        <div className="grid-2 mt-4">
          <Field label="Schwimmpace" hint={formatPace(settings.training.swimPaceSecPer100m, '/100m')}>
            <TextInput
              type="number"
              inputMode="numeric"
              suffix="s/100m"
              value={settings.training.swimPaceSecPer100m}
              onChange={(e) =>
                set({ training: { ...settings.training, swimPaceSecPer100m: Number(e.target.value) || 0 } })
              }
            />
          </Field>
          <Field label="Mobility-Ziel / Woche">
            <TextInput
              type="number"
              inputMode="numeric"
              suffix="min"
              value={settings.training.mobilityMinutesTarget}
              onChange={(e) =>
                set({ training: { ...settings.training, mobilityMinutesTarget: Number(e.target.value) || 0 } })
              }
            />
          </Field>
        </div>

        <div className="divider mt-4" />

        <SettingRow
          label="Mindestabstand harte Einheiten"
          hint={`Aktuell ${settings.training.minHoursBetweenHard} h`}
        >
          <TextInput
            type="number"
            inputMode="numeric"
            suffix="h"
            style={{ width: 110 }}
            value={settings.training.minHoursBetweenHard}
            onChange={(e) =>
              set({ training: { ...settings.training, minHoursBetweenHard: Number(e.target.value) || 0 } })
            }
          />
        </SettingRow>

        <SettingRow label="Erholung pro Muskelgruppe" hint="Blockiert Krafteinheiten für dieselbe Gruppe.">
          <TextInput
            type="number"
            inputMode="numeric"
            suffix="h"
            style={{ width: 110 }}
            value={settings.training.strengthRecoveryHours}
            onChange={(e) =>
              set({ training: { ...settings.training, strengthRecoveryHours: Number(e.target.value) || 0 } })
            }
          />
        </SettingRow>

        <SettingRow
          label="Max. Umfangssteigerung"
          hint={`${Math.round(settings.training.maxWeeklyRampRate * 100)} % pro Woche`}
        >
          <TextInput
            type="number"
            inputMode="decimal"
            step="0.01"
            style={{ width: 110 }}
            value={settings.training.maxWeeklyRampRate}
            onChange={(e) =>
              set({ training: { ...settings.training, maxWeeklyRampRate: Number(e.target.value) || 0 } })
            }
          />
        </SettingRow>
      </Card>

      {/* ---------- Recovery ---------- */}
      <SectionTitle title="Erholung" />
      <Card>
        <div className="grid-2">
          <Field label="Schlafziel">
            <TextInput
              type="number"
              inputMode="decimal"
              step="0.25"
              suffix="h"
              value={settings.recovery.sleepHoursTarget}
              onChange={(e) =>
                set({ recovery: { ...settings.recovery, sleepHoursTarget: Number(e.target.value) || 0 } })
              }
            />
          </Field>
          <Field label="ACWR-Limit" hint="Über diesem Wert blockiert die App harte Einheiten.">
            <TextInput
              type="number"
              inputMode="decimal"
              step="0.05"
              value={settings.recovery.acwrCeiling}
              onChange={(e) =>
                set({ recovery: { ...settings.recovery, acwrCeiling: Number(e.target.value) || 1 } })
              }
            />
          </Field>
        </div>
        <div className="grid-2 mt-4">
          <Field label="Readiness READY ab">
            <TextInput
              type="number"
              inputMode="numeric"
              value={settings.recovery.readyThreshold}
              onChange={(e) =>
                set({ recovery: { ...settings.recovery, readyThreshold: Number(e.target.value) || 0 } })
              }
            />
          </Field>
          <Field label="Readiness RECOVERY unter">
            <TextInput
              type="number"
              inputMode="numeric"
              value={settings.recovery.recoveryThreshold}
              onChange={(e) =>
                set({ recovery: { ...settings.recovery, recoveryThreshold: Number(e.target.value) || 0 } })
              }
            />
          </Field>
        </div>
      </Card>

      {/* ---------- Shifts ---------- */}
      <SectionTitle title="Schichtsystem" subtitle="Zeiten und Trainingsregeln pro Schichtart." />
      <Card flush>
        <div className="list">
          {data.shiftTypes.map((type) => (
            <button
              key={type.id}
              type="button"
              className="list-item clickable"
              onClick={() => setEditingShift(type)}
            >
              <span
                className="icon-badge"
                style={{ background: `color-mix(in srgb, ${type.color} 18%, transparent)` }}
              >
                {type.icon}
              </span>
              <span className="grow">
                <span className="t-body" style={{ fontWeight: 560, display: 'block' }}>
                  {type.label}
                </span>
                <span className="t-caption muted">
                  {type.work ? `${type.work.start}–${type.work.end} · ` : 'frei · '}
                  {type.training.maxMinutes > 0
                    ? `max. ${formatDuration(type.training.maxMinutes)}, bis ${INTENSITY_META[type.training.maxIntensity].label}`
                    : 'kein Training'}
                </span>
              </span>
              <span
                className="dot"
                style={{
                  background:
                    type.training.rating === 'green'
                      ? 'var(--good)'
                      : type.training.rating === 'amber'
                        ? 'var(--warn)'
                        : 'var(--bad)',
                }}
              />
            </button>
          ))}
        </div>
      </Card>

      <Card tight>
        <Field
          label="Rotationsmuster"
          hint="Kürzel in Reihenfolge, z. B. T,T,N,S,F,F. Wird beim Ausfüllen des Kalenders verwendet."
        >
          <TextInput
            value={settings.shiftRotation
              .map((id) => data.shiftTypes.find((t) => t.id === id)?.short ?? '?')
              .join(',')}
            onChange={(e) => {
              const shorts = e.target.value.split(',').map((s) => s.trim().toUpperCase());
              const ids = shorts
                .map((s) => data.shiftTypes.find((t) => t.short.toUpperCase() === s)?.id)
                .filter((id): id is string => !!id);
              if (ids.length > 0) set({ shiftRotation: ids });
            }}
          />
        </Field>
      </Card>

      {/* ---------- Training plan ---------- */}
      {activePlan && (
        <>
          <SectionTitle
            title="Trainingsplan"
            action={
              <Button size="sm" variant="ghost" onClick={() => setPlanOpen(true)}>
                Bearbeiten
              </Button>
            }
          />
          <Card tight>
            <div className="row between">
              <div className="grow">
                <div className="t-body" style={{ fontWeight: 570 }}>
                  {activePlan.name}
                </div>
                <div className="t-caption muted mt-2">
                  {activePlan.startDate} – {activePlan.targetDate} · Blöcke à{' '}
                  {activePlan.mesocycleWeeks} Wochen
                </div>
              </div>
            </div>
          </Card>

          <SectionTitle
            title="Phasen"
            action={
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditingPhase(newPhase(activePlan))}
              >
                <IconPlus size={15} /> Phase
              </Button>
            }
          />
          <Card flush>
            <div className="list">
              {activePlan.phases.map((phase) => (
                <button
                  key={phase.id}
                  type="button"
                  className="list-item clickable"
                  onClick={() => setEditingPhase(phase)}
                >
                  <span className="dot" style={{ background: PHASE_META[phase.kind].color }} />
                  <span className="grow">
                    <span className="t-body" style={{ fontWeight: 560, display: 'block' }}>
                      {phase.label}
                    </span>
                    <span className="t-caption muted">
                      {phase.startDate} – {phase.endDate} · {phase.weeklyHoursTarget} h/Woche
                    </span>
                  </span>
                  <Pill>{phase.strengthSessionsPerWeek}× Kraft</Pill>
                </button>
              ))}
            </div>
          </Card>
          <p className="t-caption muted">
            Aus Phase und Blocklänge ergibt sich das Wochenziel, samt automatischer
            Entlastungswoche am Blockende.
          </p>
        </>
      )}

      {/* ---------- Appearance ---------- */}
      <SectionTitle title="Darstellung" />
      <Card>
        <Field label="Theme">
          <Segmented
            value={settings.theme}
            onChange={(theme) => set({ theme })}
            options={[
              { value: 'dark', label: 'Dunkel' },
              { value: 'light', label: 'Hell' },
              { value: 'system', label: 'System' },
            ]}
          />
        </Field>
        <div className="mt-4">
          <Field label="Wochenbeginn">
            <Select
              value={String(settings.weekStartsOn)}
              onChange={(e) => set({ weekStartsOn: Number(e.target.value) as 0 | 1 })}
              options={[
                { value: '1', label: 'Montag' },
                { value: '0', label: 'Sonntag' },
              ]}
            />
          </Field>
        </div>
      </Card>

      {/* ---------- Notifications ---------- */}
      <SectionTitle title="Benachrichtigungen" />
      <Card>
        <SettingRow
          label="Benachrichtigungen aktiv"
          hint={
            settings.notifications.systemPermissionGranted
              ? 'Systemberechtigung erteilt.'
              : 'Browser-Berechtigung wird beim Aktivieren angefragt. Auf dem iPhone nur möglich, wenn die App zum Home-Bildschirm hinzugefügt wurde.'
          }
        >
          <Switch
            checked={settings.notifications.enabled}
            label="Benachrichtigungen"
            onChange={async (enabled) => {
              if (enabled && typeof Notification !== 'undefined') {
                const permission = await Notification.requestPermission();
                set({
                  notifications: {
                    ...settings.notifications,
                    enabled: permission === 'granted',
                    systemPermissionGranted: permission === 'granted',
                  },
                });
                if (permission !== 'granted') toast('Berechtigung wurde nicht erteilt', 'bad');
                return;
              }
              set({ notifications: { ...settings.notifications, enabled } });
            }}
          />
        </SettingRow>

        <SettingRow label="Morgen-Briefing" hint={settings.notifications.morningBriefingTime}>
          <Switch
            checked={settings.notifications.morningBriefing}
            label="Morgen-Briefing"
            onChange={(morningBriefing) => set({ notifications: { ...settings.notifications, morningBriefing } })}
          />
        </SettingRow>
        <SettingRow label="Abend-Check-in" hint={settings.notifications.eveningCheckInTime}>
          <Switch
            checked={settings.notifications.eveningCheckIn}
            label="Abend-Check-in"
            onChange={(eveningCheckIn) => set({ notifications: { ...settings.notifications, eveningCheckIn } })}
          />
        </SettingRow>
        <SettingRow label="Belastungswarnungen" hint="Meldet zu schnelle Steigerungen.">
          <Switch
            checked={settings.notifications.loadWarnings}
            label="Belastungswarnungen"
            onChange={(loadWarnings) => set({ notifications: { ...settings.notifications, loadWarnings } })}
          />
        </SettingRow>
        <SettingRow label="Habit-Hinweise" hint="Nur wenn ein Habit deutlich zurückliegt.">
          <Switch
            checked={settings.notifications.habitNudges}
            label="Habit-Hinweise"
            onChange={(habitNudges) => set({ notifications: { ...settings.notifications, habitNudges } })}
          />
        </SettingRow>
      </Card>

      {/* ---------- Data ---------- */}
      <SectionTitle title="Daten" />
      <Card>
        <p className="t-small muted">
          Alle Daten liegen ausschließlich auf diesem Gerät. Es gibt keinen Server und keine
          Übertragung an Dritte.
        </p>

        <div className="row gap-2 wrap mt-4">
          <Pill tone={persistent ? 'good' : 'warn'}>
            {persistent ? 'Speicher dauerhaft' : 'Speicher nicht garantiert'}
          </Pill>
          {storage && storage.quota > 0 && (
            <Pill>
              {(storage.usage / 1024 / 1024).toFixed(1)} MB von {(storage.quota / 1024 / 1024).toFixed(0)} MB
            </Pill>
          )}
          <Pill>Version {APP_VERSION}</Pill>
        </div>

        <div className="col gap-2 mt-4">
          <Button
            block
            onClick={() => {
              downloadFile(
                backupFilename('hybrid-athlete-backup', 'json'),
                JSON.stringify(buildBackup(data, APP_VERSION), null, 2),
                'application/json',
              );
              toast('Backup exportiert', 'good');
            }}
          >
            <IconDownload size={17} /> Vollständiges Backup (JSON)
          </Button>

          <Button block onClick={() => fileRef.current?.click()}>
            <IconUpload size={17} /> Backup importieren
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImport(file);
              e.target.value = '';
            }}
          />
        </div>

        <div className="divider mt-4" />
        <div className="t-label mb-3">CSV-Export</div>
        <div className="grid-2">
          <Button
            size="sm"
            onClick={() =>
              downloadFile(backupFilename('trainings', 'csv'), sessionsToCsv(data.sessions), 'text/csv')
            }
          >
            Trainings
          </Button>
          <Button
            size="sm"
            onClick={() => downloadFile(backupFilename('habits', 'csv'), habitEntriesToCsv(data), 'text/csv')}
          >
            Habits
          </Button>
          <Button
            size="sm"
            onClick={() => downloadFile(backupFilename('checkins', 'csv'), checkInsToCsv(data), 'text/csv')}
          >
            Check-ins
          </Button>
          <Button
            size="sm"
            onClick={() => downloadFile(backupFilename('aufgaben', 'csv'), tasksToCsv(data), 'text/csv')}
          >
            Aufgaben
          </Button>
        </div>

        <div className="divider mt-4" />
        <div className="t-label mb-3">App-Version</div>
        <div className="col gap-2 mb-3">
          <div className="row between">
            <span className="t-small secondary">Stand dieser Version</span>
            <span className="t-small t-num">{formatBuildTime()}</span>
          </div>
          <div className="row between">
            <span className="t-small secondary">Build</span>
            <span className="t-small t-num muted">{BUILD_REV}</span>
          </div>
        </div>
        <p className="t-caption muted mb-3">
          Beim Öffnen der App wird eine bereitstehende neue Version sofort übernommen. Findet die
          App während der Nutzung eine, fragt sie erst nach — ein Neuladen mitten im Check-in würde
          deine Eingaben verwerfen.
        </p>
        <div className="col gap-2">
          <Button
            block
            onClick={async () => {
              await window.__hybridCheckForUpdate?.();
              toast('Nach Updates gesucht — falls eine neue Version da ist, meldet sie sich gleich');
            }}
          >
            Jetzt nach Update suchen
          </Button>
          <Button
            block
            variant="outline"
            onClick={() => {
              if (
                !confirm(
                  'App-Zwischenspeicher leeren und neu laden?\n\nDeine Daten bleiben erhalten — Trainings, Habits und Check-ins liegen in der Datenbank, nicht im Zwischenspeicher.',
                )
              ) {
                return;
              }
              void forceRefresh();
            }}
          >
            Aktualisierung erzwingen
          </Button>
        </div>
        <p className="t-caption muted mt-2">
          Erzwingen hilft, wenn die App auf einer alten Version festhängt. Sie verwirft nur den
          Zwischenspeicher und lädt neu — Trainings, Habits und Check-ins bleiben unangetastet.
        </p>

        <div className="divider mt-4" />
        <Button
          variant="danger"
          block
          onClick={() => {
            if (!confirm('Wirklich alle Daten löschen? Das lässt sich nicht rückgängig machen.')) return;
            if (!confirm('Letzte Sicherheitsfrage: Hast du ein Backup exportiert?')) return;
            void resetAll().then(() => toast('Alle Daten gelöscht'));
          }}
        >
          Alle Daten löschen
        </Button>
      </Card>

      {/* ---------- Integrations ---------- */}
      <SectionTitle title="Integrationen" />
      <Card>
        <p className="t-small muted">
          Noch nicht angebunden. Die Datenstruktur ist vorbereitet: jede Einheit, jeder Check-in und
          jeder Habit-Eintrag trägt bereits ein Quellenfeld und eine externe ID, sodass ein Import
          ohne Datenmigration ergänzt werden kann.
        </p>
        <div className="col gap-3 mt-4">
          {[
            ['⌚', 'Garmin Forerunner 265', 'Einheiten, Distanzen, Herzfrequenz, Schlaf'],
            ['🔴', 'WHOOP', 'Recovery, HRV, Ruhepuls, Schlafphasen'],
            ['💓', 'Polar H10', 'Herzfrequenz pro Einheit'],
            ['🍎', 'Apple Health', 'Schritte, Gewicht, Schlaf'],
            ['📅', 'Kalender', 'Schichten und Termine'],
          ].map(([icon, name, what]) => (
            <div className="row gap-3" key={name}>
              <span className="icon-badge sm">{icon}</span>
              <span className="grow">
                <span className="t-small" style={{ fontWeight: 560, display: 'block' }}>
                  {name}
                </span>
                <span className="t-caption muted">{what}</span>
              </span>
              <Pill>geplant</Pill>
            </div>
          ))}
        </div>
      </Card>

      <p className="t-caption muted center" style={{ paddingBottom: 12 }}>
        Diese App gibt Trainingshinweise, keine medizinischen Empfehlungen. Bei Schmerzen,
        anhaltender Erschöpfung oder gesundheitlichen Fragen ist ärztlicher Rat die richtige Adresse.
      </p>

      <ShiftTypeSheet type={editingShift} onClose={() => setEditingShift(null)} />
      {activePlan && editingPhase && (
        <PhaseSheet plan={activePlan} phase={editingPhase} onClose={() => setEditingPhase(null)} />
      )}
      {activePlan && planOpen && <PlanSheet plan={activePlan} onClose={() => setPlanOpen(false)} />}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Shift type editor
 * ------------------------------------------------------------------ */

function ShiftTypeSheet({ type, onClose }: { type: ShiftType | null; onClose: () => void }) {
  const saveShiftType = useStore((s) => s.saveShiftType);
  const toast = useStore((s) => s.toast);
  const [draft, setDraft] = useState<ShiftType | null>(type);

  const current = draft && type && draft.id === type.id ? draft : type;
  if (!current) return null;
  const patch = (p: Partial<ShiftType>) => setDraft({ ...current, ...p });
  const patchTraining = (p: Partial<ShiftType['training']>) =>
    setDraft({ ...current, training: { ...current.training, ...p } });

  return (
    <Sheet
      open
      onClose={onClose}
      title={current.label}
      footer={
        <Button
          variant="primary"
          block
          onClick={() => {
            saveShiftType(current);
            onClose();
            toast('Schicht gespeichert', 'good');
          }}
        >
          Speichern
        </Button>
      }
    >
      <div className="row gap-3">
        <TextInput
          value={current.icon}
          onChange={(e) => patch({ icon: e.target.value.slice(0, 2) })}
          style={{ width: 62, textAlign: 'center', fontSize: 20 }}
          aria-label="Icon"
        />
        <div className="grow">
          <TextInput value={current.label} onChange={(e) => patch({ label: e.target.value })} aria-label="Bezeichnung" />
        </div>
        <TextInput
          value={current.short}
          onChange={(e) => patch({ short: e.target.value.slice(0, 3) })}
          style={{ width: 62, textAlign: 'center' }}
          aria-label="Kürzel"
        />
      </div>

      <div className="grid-2">
        <Field label="Dienst von">
          <TextInput
            type="time"
            value={current.work?.start ?? ''}
            onChange={(e) =>
              patch({
                work: e.target.value
                  ? { start: e.target.value, end: current.work?.end ?? '00:00' }
                  : undefined,
              })
            }
          />
        </Field>
        <Field label="Dienst bis">
          <TextInput
            type="time"
            value={current.work?.end ?? ''}
            onChange={(e) =>
              patch({
                work: e.target.value
                  ? { start: current.work?.start ?? '00:00', end: e.target.value }
                  : undefined,
              })
            }
          />
        </Field>
      </div>

      <div className="grid-2">
        <Field label="Schlaf von">
          <TextInput
            type="time"
            value={current.sleep?.start ?? ''}
            onChange={(e) =>
              patch({
                sleep: e.target.value
                  ? { start: e.target.value, end: current.sleep?.end ?? '00:00' }
                  : undefined,
              })
            }
          />
        </Field>
        <Field label="Schlaf bis">
          <TextInput
            type="time"
            value={current.sleep?.end ?? ''}
            onChange={(e) =>
              patch({
                sleep: e.target.value
                  ? { start: current.sleep?.start ?? '00:00', end: e.target.value }
                  : undefined,
              })
            }
          />
        </Field>
      </div>

      <div className="divider" />
      <div className="t-label">Trainingsregeln</div>

      <Field label="Maximale Trainingsdauer">
        <TextInput
          type="number"
          inputMode="numeric"
          suffix="min"
          value={current.training.maxMinutes}
          onChange={(e) => patchTraining({ maxMinutes: Number(e.target.value) || 0 })}
        />
      </Field>

      <Field label="Maximale Intensität">
        <div className="chip-row">
          {INTENSITIES.map((i) => (
            <button
              key={i}
              type="button"
              className={`chip ${current.training.maxIntensity === i ? 'active' : ''}`}
              onClick={() => patchTraining({ maxIntensity: i })}
            >
              {INTENSITY_META[i].zone} · {INTENSITY_META[i].label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Bewertung">
        <Segmented
          value={current.training.rating}
          onChange={(rating) => patchTraining({ rating })}
          options={[
            { value: 'green', label: '🟢 Ideal' },
            { value: 'amber', label: '🟡 Eingeschränkt' },
            { value: 'red', label: '🔴 Kein Training' },
          ]}
        />
      </Field>

      <div className="grid-2">
        <Field label="Trainingsfenster von">
          <TextInput
            type="time"
            value={current.training.window?.start ?? ''}
            onChange={(e) =>
              patchTraining({
                window: e.target.value
                  ? { start: e.target.value, end: current.training.window?.end ?? '00:00' }
                  : undefined,
              })
            }
          />
        </Field>
        <Field label="bis">
          <TextInput
            type="time"
            value={current.training.window?.end ?? ''}
            onChange={(e) =>
              patchTraining({
                window: e.target.value
                  ? { start: current.training.window?.start ?? '00:00', end: e.target.value }
                  : undefined,
              })
            }
          />
        </Field>
      </div>

      <SettingRow label="Zwei Einheiten erlaubt" hint="Nur für Tage mit viel Zeit sinnvoll.">
        <Switch
          checked={current.training.allowDouble}
          label="Doppeleinheiten"
          onChange={(allowDouble) => patchTraining({ allowDouble })}
        />
      </SettingRow>

      <Field label="Begründung" hint="Wird in der App als Erklärung angezeigt.">
        <TextInput value={current.training.note} onChange={(e) => patchTraining({ note: e.target.value })} />
      </Field>
    </Sheet>
  );
}
