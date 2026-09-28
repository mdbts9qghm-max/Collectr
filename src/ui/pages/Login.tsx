import { useState } from 'react'
import { Button, Card, Disclaimer, Field, Input } from '../components/common'

/**
 * Anmeldung. Mit `fixedEmail` (VITE_LOGIN_EMAIL) zeigt die Seite nur ein Passwort-Feld,
 * die E-Mail ist fest hinterlegt. Die Sicherheit bleibt gleich (Supabase-Login, RLS).
 */
export function Login({ onLogin, fixedEmail }: { onLogin: (email: string, password: string) => Promise<string | null>; fixedEmail?: string }) {
  const [email, setEmail] = useState(fixedEmail ?? '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 py-10">
      <div>
        <h1 className="text-2xl font-bold">Collectr</h1>
        <p className="text-sm text-muted">Trainingsplan Ehrwald Trail 2027. Bitte anmelden.</p>
      </div>
      <Card>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            const err = await onLogin(email.trim(), password)
            setBusy(false)
            setError(err ? (/invalid/i.test(err) ? (fixedEmail ? 'Passwort falsch.' : 'E-Mail oder Passwort falsch.') : `Anmeldung fehlgeschlagen: ${err}`) : null)
          }}
        >
          {fixedEmail ? (
            // Unsichtbar, damit Passwort-Manager das Konto zuordnen können
            <input type="email" autoComplete="username" value={email} readOnly hidden />
          ) : (
            <Field label="E-Mail">
              <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
          )}
          <Field label="Passwort">
            <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-red">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" className="w-full" disabled={busy}>
            {busy ? 'Anmelden …' : 'Anmelden'}
          </Button>
        </form>
      </Card>
      <Disclaimer />
    </div>
  )
}
