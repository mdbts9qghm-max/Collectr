import { Card, Disclaimer, H2 } from '../components/common'

/** Datenschutzerklärung (auch als Privacy-Policy-URL für das WHOOP Developer Dashboard). */
export function Privacy() {
  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 py-8 text-sm leading-relaxed">
      <h1 className="text-2xl font-bold">Datenschutz – Collectr</h1>
      <Card>
        <H2>Zweck</H2>
        <p>
          Collectr ist eine private Trainings-App für eine einzelne Person (Vorbereitung auf den Ehrwald Trail 2027). Es gibt keine weiteren Nutzer, keine
          Werbung und keine Weitergabe an Dritte.
        </p>
      </Card>
      <Card>
        <H2>Welche Daten</H2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Eingaben in der App: Profil, Dienstplan-Einträge, Trainingsprotokolle, Krafttests, manuelle Erholungsangaben.</li>
          <li>
            Nach Verbindung mit WHOOP: Recovery, HRV, Ruhepuls, SpO2, Schlaf (Dauer, Phasen, Bedarf), Strain, Workouts und Körpermaße über die WHOOP
            Developer API.
          </li>
        </ul>
      </Card>
      <Card>
        <H2>Speicherung</H2>
        <p>
          Die Daten liegen lokal auf dem Gerät (IndexedDB) und in einer Supabase-Datenbank in der EU (Frankfurt). Zugriff hat nur das angemeldete Konto
          (Row Level Security). WHOOP-Zugangsschlüssel werden ausschließlich serverseitig gespeichert.
        </p>
      </Card>
      <Card>
        <H2>Löschen und Widerruf</H2>
        <p>
          In den Einstellungen kann die WHOOP-Verbindung jederzeit getrennt werden (der Zugriff wird bei WHOOP widerrufen, gespeicherte Schlüssel werden
          gelöscht). „Alle Daten zurücksetzen“ löscht die eigenen Einträge.
        </p>
      </Card>
      <Disclaimer />
    </div>
  )
}
