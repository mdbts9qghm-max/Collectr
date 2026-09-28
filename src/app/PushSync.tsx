// Lädt die geplanten Erinnerungen hoch, sobald sich Plan, Schichten oder Schlafbedarf ändern (Phase 7).

import { useEffect, useMemo, useRef } from 'react'
import { useApp } from './AppState'
import { useCloud } from './cloud'
import { currentSubscription, pushSupported, uploadReminders, upcomingReminders } from './push'

export function PushSync() {
  const app = useApp()
  const cloud = useCloud()
  const simulated = !!app.data.settings.simulatedDate
  const todaySleep = app.dayView(app.today).sleep
  // Nur alle 10 min neu rechnen (now tickt minütlich), sonst bei Änderungen an Plan/Kalender/Schlaf
  const bucket = Math.floor(app.now / 600_000)
  const reminders = useMemo(
    () => (simulated ? [] : upcomingReminders(app.cal, app.plan, app.today, todaySleep, bucket * 600_000)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [app.cal, app.plan, app.today, JSON.stringify(todaySleep), bucket, simulated],
  )
  const last = useRef<string>('')

  useEffect(() => {
    if (!cloud || simulated || !pushSupported()) return
    const key = JSON.stringify(reminders)
    if (key === last.current) return
    let cancelled = false
    void (async () => {
      // Nur hochladen, wenn dieses Gerät Erinnerungen abonniert hat
      if (!(await currentSubscription()) || cancelled) return
      try {
        await uploadReminders(cloud.client, reminders)
        last.current = key
      } catch (e) {
        console.warn('Erinnerungen nicht hochgeladen', e)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [cloud, reminders, simulated])

  return null
}

