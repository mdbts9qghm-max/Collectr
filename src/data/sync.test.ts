import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { IndexedDbRepository } from './indexedDb'
import { MemoryRemote } from './remote'
import { SyncEngine } from './sync'
import { SyncingRepository } from './syncingRepository'

let n = 0
function setup(remote = new MemoryRemote()) {
  const local = new IndexedDbRepository(`sync-${n++}`)
  let t = Date.UTC(2026, 9, 3, 8)
  const clock = () => new Date((t += 1000))
  const engine = new SyncEngine(local, remote, clock)
  const repo = new SyncingRepository(local, engine)
  return { local, engine, repo, remote }
}

describe('Synchronisation mit Supabase (lokal zuerst)', () => {
  it('offline eingetragen, später hochgeladen', async () => {
    const { repo, engine, remote } = setup()
    remote.offline = true
    await repo.putLog({ sessionId: '2026-10-03#lauf', date: '2026-10-03', status: 'done' })
    await engine.sync()
    expect(engine.getStatus()).toMatchObject({ state: 'offline', pending: 1 })
    expect(await repo.listLogs()).toHaveLength(1) // lokal sofort sichtbar
    remote.offline = false
    await engine.sync()
    expect(engine.getStatus()).toMatchObject({ state: 'idle', pending: 0 })
    expect(remote.rows.get('session_logs/2026-10-03#lauf')?.value).toMatchObject({ status: 'done' })
  })

  it('Änderungen eines anderen Geräts werden übernommen und melden sich', async () => {
    const { repo, engine, remote } = setup()
    const changed = vi.fn()
    engine.onRemoteChange(changed)
    remote.external({ collection: 'shift_overrides', key: '2026-10-06', value: { date: '2026-10-06', kind: 'V' }, clientUpdatedAt: '2026-10-05T10:00:00Z' })
    await engine.sync()
    expect(await repo.listOverrides()).toEqual([{ date: '2026-10-06', kind: 'V' }])
    expect(changed).toHaveBeenCalledTimes(1)
    await engine.sync() // nichts Neues
    expect(changed).toHaveBeenCalledTimes(1)
  })

  it('der neuere Stand gewinnt – in beide Richtungen', async () => {
    const { repo, engine, remote } = setup()
    // Cloud älter als lokale Änderung → lokal gewinnt
    remote.offline = true
    await repo.putManual({ date: '2026-10-03', sleepMin: 420, quality: 4, feeling: 4 })
    remote.external({ collection: 'manual_readiness', key: '2026-10-03', value: { date: '2026-10-03', sleepMin: 300, quality: 2, feeling: 2 }, clientUpdatedAt: '2026-10-01T00:00:00Z' })
    remote.offline = false
    await engine.sync()
    expect((await repo.listManual())[0]!.sleepMin).toBe(420)
    expect((remote.rows.get('manual_readiness/2026-10-03')!.value as { sleepMin: number }).sleepMin).toBe(420)
    // Cloud neuer als lokale Änderung → Cloud gewinnt
    remote.offline = true
    await repo.putManual({ date: '2026-10-04', sleepMin: 360, quality: 3, feeling: 3 })
    remote.external({ collection: 'manual_readiness', key: '2026-10-04', value: { date: '2026-10-04', sleepMin: 480, quality: 5, feeling: 5 }, clientUpdatedAt: '2030-01-01T00:00:00Z' })
    remote.offline = false
    await engine.sync()
    expect((await repo.listManual()).find((m) => m.date === '2026-10-04')!.sleepMin).toBe(480)
  })

  it('Löschungen werden als Tombstone synchronisiert', async () => {
    const a = setup()
    await a.repo.putOverride({ date: '2026-10-06', kind: 'V' })
    await a.engine.sync()
    await a.repo.deleteOverride('2026-10-06')
    await a.engine.sync()
    expect(a.remote.rows.get('shift_overrides/2026-10-06')!.value).toBeNull()
    // zweites Gerät übernimmt die Löschung
    const b = setup(a.remote)
    await b.local.putOverride({ date: '2026-10-06', kind: 'V' })
    await b.engine.sync()
    expect(await b.repo.listOverrides()).toEqual([])
  })

  it('Erst-Umzug: lokale Daten werden einmalig hochgeladen, das simulierte Datum bleibt lokal', async () => {
    const { local, engine, remote, repo } = setup()
    await local.putLog({ sessionId: 'a', date: '2026-10-03', status: 'done' })
    await local.saveSettings({ ...(await local.getSettings()), onboarded: true, simulatedDate: '2027-01-01' })
    expect(await engine.migrateLocal('user-1')).toBe(2)
    expect(await engine.migrateLocal('user-1')).toBe(0)
    await engine.sync()
    expect(remote.rows.has('session_logs/a')).toBe(true)
    const s = remote.rows.get('settings/settings')!.value as Record<string, unknown>
    expect(s.onboarded).toBe(true)
    expect('simulatedDate' in s).toBe(false)
    // Settings aus der Cloud überschreiben das lokale simulierte Datum nicht
    remote.external({ collection: 'settings', key: 'settings', value: { ...s, demoMode: true }, clientUpdatedAt: '2030-01-01T00:00:00Z' })
    await engine.sync()
    const local2 = await repo.getSettings()
    expect(local2.demoMode).toBe(true)
    expect(local2.simulatedDate).toBe('2027-01-01')
  })

  it('Erst-Umzug: neuere Cloud-Daten gewinnen gegen lokale Daten ohne Zeitstempel', async () => {
    const remote = new MemoryRemote()
    remote.external({ collection: 'session_logs', key: 'a', value: { sessionId: 'a', date: '2026-10-03', status: 'skipped' }, clientUpdatedAt: '2026-10-03T12:00:00Z' })
    const { local, engine, repo } = setup(remote)
    await local.putLog({ sessionId: 'a', date: '2026-10-03', status: 'done' })
    await engine.migrateLocal('user-1')
    await engine.sync()
    expect((await repo.listLogs())[0]!.status).toBe('skipped')
  })

  it('nur das simulierte Datum geändert → nichts hochzuladen', async () => {
    const { repo, engine } = setup()
    await repo.saveSettings({ ...(await repo.getSettings()), simulatedDate: '2027-05-01' })
    expect(engine.getStatus().pending).toBe(0)
  })

  it('Zurücksetzen löscht auch in der Cloud', async () => {
    const { repo, engine, remote } = setup()
    await repo.putLog({ sessionId: 'x', date: '2026-10-03', status: 'done' })
    await engine.sync()
    await repo.clearAll()
    await engine.sync()
    expect(remote.rows.get('session_logs/x')!.value).toBeNull()
    expect(await repo.listLogs()).toEqual([])
  })

  it('WHOOP-Daten werden nur gelesen, Workout-Zuordnungen synchronisiert', async () => {
    const { repo, engine, remote } = setup()
    remote.external({ collection: 'whoop_recoveries', key: '93845', value: { cycleId: 93845, score: 61 }, clientUpdatedAt: '2026-10-04T12:00:00Z' })
    remote.external({ collection: 'whoop_status', key: 'whoop', value: { connected: true }, clientUpdatedAt: '2026-10-04T12:00:00Z' })
    await engine.sync()
    const w = await repo.listWhoop()
    expect(w.recoveries).toEqual([{ cycleId: 93845, score: 61 }])
    expect(w.status).toEqual({ connected: true })
    await repo.putAssignment({ workoutId: 'w1', sessionId: 's1', decidedAt: 'x' })
    await engine.sync()
    expect(remote.rows.get('workout_assignments/w1')!.value).toMatchObject({ sessionId: 's1' })
    // Zurücksetzen löscht WHOOP-Daten nicht in der Cloud
    await repo.clearAll()
    await engine.sync()
    expect(remote.rows.get('whoop_recoveries/93845')!.value).not.toBeNull()
    expect((await repo.listWhoop()).recoveries).toHaveLength(1) // neu abgerufen
  })
})
