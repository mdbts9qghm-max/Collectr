import { expect, test, type Page, type Route } from '@playwright/test'

// Nachgebildeter Supabase-Server: Auth (Passwort-Login) und PostgREST (Upsert/Select je Tabelle).
const USER = { id: '11111111-1111-1111-1111-111111111111', email: 'ich@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-09-28T00:00:00Z' }

function session() {
  const now = Math.floor(Date.now() / 1000)
  return { access_token: 'token', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'refresh', user: USER }
}

interface Store {
  rows: Record<string, Record<string, unknown>[]>
  posts: { table: string; body: unknown }[]
}

async function fakeSupabase(page: Page, opts: { password: string }): Promise<Store> {
  const store: Store = { rows: {}, posts: [] }
  await page.route('https://fake.supabase.test/**', async (route: Route) => {
    const req = route.request()
    const url = new URL(req.url())
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (url.pathname === '/auth/v1/token') {
      const body = req.postDataJSON() as { password: string }
      if (body.password !== opts.password) return route.fulfill({ status: 400, headers: cors, json: { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials', code: 'invalid_credentials' } })
      return route.fulfill({ status: 200, headers: cors, json: session() })
    }
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers: cors })
    if (url.pathname.startsWith('/auth/v1/user')) return route.fulfill({ status: 200, headers: cors, json: USER })
    const m = /^\/rest\/v1\/(\w+)$/.exec(url.pathname)
    if (m) {
      const table = m[1]!
      if (req.method() === 'GET') return route.fulfill({ status: 200, headers: cors, json: store.rows[table] ?? [] })
      if (req.method() === 'POST') {
        const body = req.postDataJSON() as Record<string, unknown>[]
        store.posts.push({ table, body })
        store.rows[table] = [...(store.rows[table] ?? []), ...body.map((b) => ({ ...b, updated_at: new Date().toISOString() }))]
        return route.fulfill({ status: 201, headers: cors, body: '' })
      }
    }
    return route.fulfill({ status: 404, headers: cors, json: { message: `unbekannt: ${url.pathname}` } })
  })
  return store
}

test('Login mit E-Mail und Passwort, Erst-Umzug und Synchronisation', async ({ page }) => {
  const store = await fakeSupabase(page, { password: 'richtig' })
  await page.goto('/')

  // Falsches Passwort
  await page.getByLabel('E-Mail').fill('ich@example.com')
  await page.getByLabel('Passwort').fill('falsch')
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await expect(page.getByRole('alert')).toContainText('E-Mail oder Passwort falsch')

  // Richtiges Passwort → Onboarding
  await page.getByLabel('Passwort').fill('richtig')
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await expect(page.getByRole('heading', { name: 'Willkommen bei Collectr' })).toBeVisible()
  await page.getByRole('button', { name: 'Weiter' }).click()
  await page.getByRole('button', { name: 'Weiter' }).click()
  await page.getByRole('button', { name: 'Später machen' }).click()
  await page.getByRole('button', { name: 'Plan starten' }).click()

  // Einstellungen landen in der Cloud (ohne simuliertes Datum)
  await expect(page.getByTestId('sync-badge')).toContainText('Synchron', { timeout: 10_000 })
  await expect.poll(() => store.posts.some((p) => p.table === 'settings')).toBe(true)

  // Simuliertes Datum ist gerätespezifisch und wird nicht hochgeladen
  await page.getByRole('link', { name: 'Einstellungen' }).click()
  await expect(page.getByText('Angemeldet als ich@example.com')).toBeVisible()
  const before = store.posts.length
  await page.getByLabel('Simuliertes Datum').fill('2026-10-03')
  await page.getByRole('button', { name: 'Setzen', exact: true }).click()
  await page.getByRole('link', { name: 'Heute' }).click()

  // Eintrag wird hochgeladen
  await page.getByTestId('today-item').first().getByRole('button', { name: 'Auslassen' }).click()
  await expect.poll(() => store.posts.some((p) => p.table === 'session_logs')).toBe(true)
  const settingsPostsAfter = store.posts.slice(before).filter((p) => p.table === 'settings')
  expect(settingsPostsAfter).toEqual([])
  const log = store.posts.find((p) => p.table === 'session_logs')!.body as { session_id: string; data: { value: { status: string } } }[]
  expect(log[0]!.data.value.status).toBe('skipped')
  await expect(page.getByTestId('sync-badge')).toContainText('Synchron', { timeout: 10_000 })
  await page.screenshot({ path: 'docs/screenshots/10-sync.png' })

  // Abmelden → Login
  await page.getByRole('link', { name: 'Einstellungen' }).click()
  await page.getByRole('button', { name: 'Abmelden' }).click()
  await expect(page.getByRole('button', { name: 'Anmelden' })).toBeVisible()
})
