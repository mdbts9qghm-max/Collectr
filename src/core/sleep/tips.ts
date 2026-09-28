// Kurze Schlaf-Tipps (SPEC 6.3b), nach Situation gruppiert. Sie rotieren, damit nicht jeden Tag derselbe kommt.

export type TipTag = 'post_night' | 'pre_night' | 'pre_early' | 'free' | 'night_run' | 'race'

export const SLEEP_TIPS: Record<TipTag, string[]> = {
  post_night: [
    'Auf dem Heimweg Sonnenbrille tragen, damit das Tageslicht dich nicht wach macht.',
    'Schlafzimmer komplett abdunkeln, Ohrstöpsel und Handy auf lautlos.',
    'Vor dem Tagschlaf nur eine kleine Mahlzeit, kein schweres Frühstück.',
    'Nach dem Aufstehen am Nachmittag bewusst raus ins Tageslicht.',
  ],
  pre_night: [
    'Koffein erst nach dem Nap, nicht davor.',
    'Den Nap ruhig mit Wecker planen, 90 min entsprechen etwa einem vollen Schlafzyklus.',
    'Nach dem Training zuerst essen, dann zur Ruhe kommen, erst dann hinlegen.',
  ],
  pre_early: [
    'Kein Koffein mehr nach 14 Uhr, damit du früh einschlafen kannst.',
    'Kleidung und Frühstück schon am Abend vorbereiten, das spart morgens Zeit.',
    'Bildschirme eine Stunde vor dem Schlafen weglegen.',
  ],
  free: [
    'Gleiche Aufstehzeit wie an den anderen freien Tagen, lieber früher ins Bett.',
    'Vor und nach langen Läufen bewusst mehr Schlaf einplanen.',
    'Ein kurzer Spaziergang am Morgen hilft dem Tagesrhythmus nach der Nachtschicht.',
  ],
  night_run: [
    'Vor dem Nachtlauf nachmittags schlafen, danach ausschlafen ohne Wecker.',
    'Nach dem Nachtlauf leicht essen und warm duschen, dann direkt schlafen.',
  ],
  race: [
    'Die Nächte vor dem Rennen zählen mehr als die letzte. Nervosität in der letzten Nacht ist normal.',
    'Am Renntag nachmittags hinlegen, auch Ruhen ohne Schlaf hilft.',
    'Rennausrüstung am Vortag komplett packen, damit der Abend ruhig bleibt.',
  ],
}
