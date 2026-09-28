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
  deletes: { table: string; query: string }[]
  rpcs: { name: string; body: unknown }[]
  whoopSyncs?: number
}

/** Berlin-Zeit → ISO (Oktober 2026 = MESZ, UTC+2). */
const berlin = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+02:00`).toISOString()

/** Nachgebildete WHOOP-Daten nach dem Abruf (was whoop-sync in die Tabellen schreiben würde). */
function whoopRows(): Record<string, Record<string, unknown>[]> {
  const now = new Date().toISOString()
  const row = (id: string, data: unknown) => ({ id, data, deleted: false, updated_at: now })
  return {
    whoop_status: [{ key: 'whoop', data: { connected: true, connectedAt: now, lastSyncAt: now, counts: { recoveries: 1, sleeps: 2, workouts: 2 } }, deleted: false, updated_at: now }],
    whoop_sleeps: [
      row('s-night', { id: 's-night', start: berlin('2026-10-02', '22:30'), end: berlin('2026-10-03', '07:15'), nap: false, asleepMin: 480 }),
      row('s-day', { id: 's-day', start: berlin('2026-10-04', '08:05'), end: berlin('2026-10-04', '14:00'), nap: false, asleepMin: 330 }),
    ],
    whoop_recoveries: [row('1', { cycleId: 1, sleepId: 's-night', score: 78 }), row('2', { cycleId: 2, sleepId: 's-day', score: 41, hrvMs: 50, restingHr: 57 })],
    whoop_cycles: [],
    whoop_workouts: [
      row('w-run', { id: 'w-run', start: berlin('2026-10-03', '08:35'), end: berlin('2026-10-03', '09:25'), sportName: 'running', distanceM: 7200, strain: 9.4 }),
      row('w-golf', { id: 'w-golf', start: berlin('2026-10-04', '16:00'), end: berlin('2026-10-04', '17:00'), sportName: 'golf' }),
    ],
  }
}

async function fakeSupabase(page: Page, opts: { password: string }): Promise<Store> {
  const store: Store = { rows: {}, posts: [], deletes: [], rpcs: [] }
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
    if (url.pathname === '/functions/v1/whoop-oauth-start') {
      // Echte Function leitet zu WHOOP; hier direkt zurück zur App wie nach erfolgreichem Callback
      Object.assign(store.rows, { whoop_status: whoopRows().whoop_status })
      return route.fulfill({ status: 200, headers: cors, json: { url: 'http://localhost:4174/einstellungen?whoop=verbunden' } })
    }
    if (url.pathname === '/functions/v1/whoop-sync') {
      store.whoopSyncs = (store.whoopSyncs ?? 0) + 1
      Object.assign(store.rows, whoopRows())
      return route.fulfill({ status: 200, headers: cors, json: { skipped: false, counts: { recoveries: 2 } } })
    }
    const rpc = /^\/rest\/v1\/rpc\/(\w+)$/.exec(url.pathname)
    if (rpc) {
      store.rpcs.push({ name: rpc[1]!, body: req.postDataJSON() })
      return route.fulfill({ status: 204, headers: cors, body: '' })
    }
    const m = /^\/rest\/v1\/(\w+)$/.exec(url.pathname)
    if (m) {
      const table = m[1]!
      if (req.method() === 'GET') return route.fulfill({ status: 200, headers: cors, json: store.rows[table] ?? [] })
      if (req.method() === 'POST') {
        const body = req.postDataJSON() as Record<string, unknown>[] | Record<string, unknown>
        store.posts.push({ table, body })
        store.rows[table] = [...(store.rows[table] ?? []), ...(Array.isArray(body) ? body : [body]).map((b) => ({ ...b, updated_at: new Date().toISOString() }))]
        return route.fulfill({ status: 201, headers: cors, body: '' })
      }
      if (req.method() === 'DELETE') {
        store.deletes.push({ table, query: url.search })
        return route.fulfill({ status: 204, headers: cors, body: '' })
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

test('WHOOP verbinden, abrufen, Recovery nach der Nachtschicht, Workout automatisch erledigt', async ({ page }) => {
  const store = await fakeSupabase(page, { password: 'richtig' })
  await page.goto('/')
  await page.getByLabel('E-Mail').fill('ich@example.com')
  await page.getByLabel('Passwort').fill('richtig')
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await page.getByRole('button', { name: 'Weiter' }).click()
  await page.getByRole('button', { name: 'Weiter' }).click()
  await page.getByRole('button', { name: 'Später machen' }).click()
  await page.getByRole('button', { name: 'Plan starten' }).click()

  // Schlaftag nach der Nachtschicht simulieren und WHOOP verbinden
  await page.getByRole('link', { name: 'Einstellungen' }).click()
  await page.getByLabel('Simuliertes Datum').fill('2026-10-04')
  await page.getByRole('button', { name: 'Setzen', exact: true }).click()
  await page.getByRole('button', { name: 'Mit WHOOP verbinden' }).click()
  await expect(page).toHaveURL(/whoop=verbunden/)
  await expect(page.getByText('WHOOP wurde verbunden')).toBeVisible()
  await expect(page.getByTestId('whoop-section')).toContainText('Verbunden seit', { timeout: 10_000 })
  await expect.poll(() => store.whoopSyncs ?? 0).toBeGreaterThan(0)
  await page.screenshot({ path: 'docs/screenshots/11-whoop-verbunden.png' })

  // Heute: Recovery aus dem Tagschlaf (41 %), Quelle WHOOP
  await page.getByRole('link', { name: 'Heute' }).click()
  await expect(page.getByTestId('traffic')).toContainText('41 %', { timeout: 10_000 })
  await expect(page.getByTestId('readiness')).toContainText('WHOOP')
  await expect(page.getByTestId('readiness')).not.toContainText('Beispieldaten')

  // Tracking: Lauf vom 03.10. automatisch erledigt, Golf als Vorschlag
  await page.getByRole('link', { name: 'Tracking' }).click()
  await expect(page.getByTestId('track-session').filter({ hasText: 'Lockerer Lauf' }).first()).toContainText('erledigt')
  const sugg = page.getByTestId('workout-suggestions')
  await expect(sugg).toContainText('golf')
  await page.screenshot({ path: 'docs/screenshots/12-whoop-tracking.png' })
  await sugg.getByRole('button', { name: 'Ignorieren' }).click()
  await expect(page.getByTestId('workout-suggestions')).toHaveCount(0)
  await expect.poll(() => store.posts.some((p) => p.table === 'workout_assignments')).toBe(true)
  await expect.poll(() => store.posts.some((p) => p.table === 'session_logs')).toBe(true)
})


test('Erinnerungen: Push-Abo speichern, Erinnerungen hochladen, wieder abbestellen', async ({ page, context }) => {
  // Headless-Chromium hat keinen Push-Dienst: Abo und Erlaubnis werden nachgebildet
  await context.grantPermissions(['notifications'])
  await page.addInitScript(() => {
    let sub: PushSubscription | null = null
    const fake = {
      endpoint: 'https://push.example/abo-1',
      toJSON: () => ({ endpoint: 'https://push.example/abo-1', keys: { p256dh: 'p256dh-key', auth: 'auth-key' } }),
      unsubscribe: async () => {
        sub = null
        return true
      },
    } as unknown as PushSubscription
    PushManager.prototype.subscribe = async function () {
      sub = fake
      return fake
    }
    PushManager.prototype.getSubscription = async function () {
      return sub
    }
    Notification.requestPermission = async () => 'granted'
  })
  const store = await fakeSupabase(page, { password: 'richtig' })
  await page.goto('/')
  await page.getByLabel('E-Mail').fill('ich@example.com')
  await page.getByLabel('Passwort').fill('richtig')
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await page.getByRole('button', { name: 'Weiter' }).click()
  await page.getByRole('button', { name: 'Weiter' }).click()
  await page.getByRole('button', { name: 'Später machen' }).click()
  await page.getByRole('button', { name: 'Plan starten' }).click()
  await page.getByRole('link', { name: 'Einstellungen' }).click()

  const card = page.getByTestId('reminders')
  await expect(card).toContainText('30 min vor dem empfohlenen Zubettgehen')
  await expect(page.getByTestId('next-reminders')).toContainText('In 30 min schlafen gehen')
  const toggle = card.getByLabel('Erinnerungen')
  await expect(toggle).toBeEnabled()
  await toggle.check()
  await expect(toggle).toBeChecked()
  await expect.poll(() => store.posts.find((p) => p.table === 'push_subscriptions')?.body).toMatchObject({ endpoint: 'https://push.example/abo-1', p256dh: 'p256dh-key', auth: 'auth-key' })
  await expect.poll(() => store.rpcs.length).toBeGreaterThan(0)
  const items = (store.rpcs[0]!.body as { items: { id: string; due_at: string; title: string }[] }).items
  expect(items.length).toBeGreaterThan(3)
  expect(items.some((i) => i.id.endsWith('-bed') && i.title === 'In 30 min schlafen gehen')).toBe(true)
  expect(items.every((i) => Date.parse(i.due_at) > Date.now() - 60_000)).toBe(true)
  await page.screenshot({ path: 'docs/screenshots/17-erinnerungen.png' })

  await toggle.uncheck()
  await expect(toggle).not.toBeChecked()
  await expect.poll(() => store.deletes.some((d) => d.table === 'push_subscriptions' && d.query.includes('endpoint'))).toBe(true)
})
