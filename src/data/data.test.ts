import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { parseBackup } from './backup'
import { IndexedDbRepository } from './indexedDb'

let n = 0
const repo = () => new IndexedDbRepository(`test-${n++}`)

describe('IndexedDB-Repository', () => {
  it('liefert Standardeinstellungen aus SPEC 3/4', async () => {
    const s = await repo().getSettings()
    expect(s.onboarded).toBe(false)
    expect(s.profile.weeklyKmStart).toBe(30)
    expect(s.anchorDate).toBe('2026-10-02')
  })

  it('speichert Overrides, Protokolle, Eingaben und Kraftstand', async () => {
    const r = repo()
    await r.putOverride({ date: '2026-10-06', kind: 'V' })
    await r.putOverride({ date: '2026-10-06', kind: 'URLAUB' })
    expect(await r.listOverrides()).toEqual([{ date: '2026-10-06', kind: 'URLAUB' }])
    await r.deleteOverride('2026-10-06')
    expect(await r.listOverrides()).toEqual([])
    await r.putLog({ sessionId: 'a#lauf', date: '2026-10-03', status: 'done', feeling: 4 })
    await r.putManual({ date: '2026-10-03', sleepMin: 420, quality: 4, feeling: 3 })
    await r.putDecision({ sessionId: 'a#lauf', date: '2026-10-03', rejected: true, decidedAt: 'x' })
    expect(await r.listLogs()).toHaveLength(1)
    expect(await r.listManual()).toHaveLength(1)
    expect((await r.listDecisions())[0]!.rejected).toBe(true)
  })

  it('Backup: Export und Import ergeben denselben Stand, ungültige Dateien werden abgelehnt', async () => {
    const a = repo()
    await a.saveSettings({ ...(await a.getSettings()), onboarded: true, demoMode: true })
    await a.putOverride({ date: '2027-06-18', kind: 'URLAUB' })
    await a.saveChecklist({ lampe: true })
    const backup = await a.exportAll(new Date('2026-10-01T10:00:00Z'))
    const parsed = parseBackup(JSON.stringify(backup))
    expect(parsed.ok).toBe(true)
    const b = repo()
    if (parsed.ok) await b.importAll(parsed.data)
    expect(await b.exportAll(new Date('2026-10-01T10:00:00Z'))).toEqual(backup)
    expect(parseBackup('{kaputt').ok).toBe(false)
    expect(parseBackup(JSON.stringify({ ...backup, version: 2 })).ok).toBe(false)
  })

  it('Zurücksetzen löscht alles', async () => {
    const r = repo()
    await r.putLog({ sessionId: 'x', date: '2026-10-03', status: 'skipped' })
    await r.clearAll()
    expect(await r.listLogs()).toEqual([])
    expect((await r.getSettings()).onboarded).toBe(false)
  })
})
