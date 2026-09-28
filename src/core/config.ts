// =============================================================================
// Zentrale Konfiguration der Trainingslogik
// =============================================================================
// Alle Schwellenwerte, Gewichte, Zeiten und Umfangskurven stehen hier, damit sie
// ohne Codeänderung nachjustiert werden können. Die Logik in src/core enthält
// keine eigenen „magischen Zahlen“.
//
// Zeiten sind Minuten seit Mitternacht (Europe/Berlin), z. B. 7 * 60 = 07:00.
// Werte ab 1440 liegen am Folgetag.
// =============================================================================

import type { LocalDate, Minutes, Phase, Profile, SessionType } from './types'

const h = (hours: number, minutes = 0): Minutes => hours * 60 + minutes

export const CONFIG = {
  // ---------------------------------------------------------------------------
  // Rennen (SPEC 2)
  // ---------------------------------------------------------------------------
  race: {
    name: 'Ehrwald Trail (Zugspitz Ultra Trail by UTMB)',
    date: '2027-06-18' as LocalDate,
    startMin: h(23),
    cutoffHours: 22,
    distanceKm: 86,
    elevationGainM: 4295,
    /** Urlaub mindestens für diese Tage (Start, Zielschluss, Folgenacht). */
    vacationRequired: ['2027-06-18', '2027-06-19', '2027-06-20'] as LocalDate[],
    /** Empfohlener Urlaub für ausgeruhten Taper und Anreise. */
    vacationRecommendedFrom: '2027-06-14' as LocalDate,
    vacationRecommendedTo: '2027-06-20' as LocalDate,
    /** Termine, ab denen erneut an den Urlaubsantrag erinnert wird (solange kein Urlaub eingetragen ist). */
    vacationReminderDates: ['2026-10-02', '2026-11-01', '2026-12-01', '2027-01-15', '2027-03-01', '2027-04-15', '2027-05-15'] as LocalDate[],
  },

  // ---------------------------------------------------------------------------
  // Planzeitraum
  // ---------------------------------------------------------------------------
  plan: {
    /** Planstart = Ankerdatum (Entscheidung Phase 1). */
    startDate: '2026-10-02' as LocalDate,
    endDate: '2027-06-18' as LocalDate,
    microLengthDays: 5,
    microsPerMeso: 7,
    totalMicros: 52,
    /** Phase je Mesozyklus 1–8 (Entscheidung Phase 1: 2/3/2 + Taper). */
    phaseByMeso: ['base', 'base', 'build', 'build', 'build', 'specific', 'specific', 'taper'] as Phase[],
    /** Entlastung = letzter Mikrozyklus in Meso 1–6. Meso 7 ohne Entlastung (Taper folgt). */
    deloadMesos: [1, 2, 3, 4, 5, 6],
    /** Mikrozyklen 50–52 (04.06.–18.06.2027) = Taper. */
    taperMicros: { taper1: 50, taper2: 51, race_week: 52 },
    /** Krafttest: Entlastungs-Mikrozyklus (Meso 1–6) bzw. letzter Mikrozyklus von Meso 7. */
    strengthTestMicros: [7, 14, 21, 28, 35, 42, 49],
    /**
     * Vorlagen der rennspezifischen Phase je Mikrozyklus (Meso 6: 36–41, Meso 7: 43–49).
     * Schlüsselspitzen (Trend-Regel) wechseln sich mit Mikrozyklen auf Grundniveau ab.
     * Bergwochenenden: Mikrozyklus 40 (18./19.04.2027) und 48 (28./29.05.2027, ca. 3 Wochen vor dem Rennen).
     */
    specificTemplates: {
      36: 'specific_b2b',
      37: 'specific_night',
      38: 'specific_long',
      39: 'specific_b2b',
      40: 'specific_mountain',
      41: 'specific_night',
      43: 'specific_b2b',
      44: 'specific_long',
      45: 'specific_night',
      46: 'specific_b2b',
      47: 'specific_night',
      48: 'specific_mountain',
      49: 'specific_final',
    } as Record<number, string>,
    /**
     * Schlüsselspitzen: dürfen bis keyPeakMaxFactor über dem Grundniveau liegen.
     * 31/33: erste lange Läufe über 30 km im Aufbau; 38/44: längster Lauf; 46: B2B-Spitze; 40/48: Berg.
     */
    keyPeakMicros: [31, 33, 38, 40, 44, 46, 48],
    mountainMicros: [40, 48],
    /** Erinnerung an das Bergwochenende so viele Tage vorher. */
    mountainReminderDaysBefore: 28,
  },

  // ---------------------------------------------------------------------------
  // Schichtmodell (SPEC 4)
  // ---------------------------------------------------------------------------
  shift: {
    anchorDate: '2026-10-02' as LocalDate,
    /** Zyklustag 1–5 */
    rhythm: ['T', 'N', 'S', 'F', 'F'] as const,
    times: {
      T: { start: h(7), end: h(19) },
      N: { start: h(19), end: h(24 + 7) },
      V: { start: h(8), end: h(20) },
      /** Standardzeiten Fortbildung, falls keine angegeben sind. */
      FB: { start: h(8), end: h(16) },
    },
    /** Arbeitsbeginn 15 min vor Dienstbeginn. */
    earlyStartMin: 15,
  },

  // ---------------------------------------------------------------------------
  // Trainingsfenster (SPEC 4.3)
  // ---------------------------------------------------------------------------
  windows: {
    /** Tag 2 (vor der Nacht): Start morgens. */
    preNightStart: h(8),
    /** Abstand zwischen Trainingsende und Nap-Beginn (Essen, Duschen, Runterkommen): 15:00 − 90 min = 13:30. */
    preNightGapBeforeNapMin: 90,
    /** Schlaftag: frühestens ab 15:00 (Tagschlaf ca. 08:00–14:00). */
    sleepDayStart: h(15),
    /** Schlaftag: Training endet spätestens 3 h vor der empfohlenen Schlafenszeit. */
    sleepDayEndBeforeBedMin: 180,
    /** Freier Tag. */
    freeStart: h(7),
    freeEnd: h(20),
    /** Nachtlauf (Entscheidung Phase 2: Tag 4 nachts, Folgetag frei). */
    nightRunStart: h(21),
    nightRunEnd: h(24 + 1),
    /** Wechselzeit zwischen zwei Einheiten am selben Tag. */
    transitionMin: 15,
    /** Empfohlener Beginn relativ zum Fensterbeginn. */
    startOffsetMin: 30,
    /** Tag 1: optional höchstens 10 min Mobility am Abend. */
    dayShiftOptionalMobilityMin: 10,
    /** Zweiter Teil eines Back-to-backs nach einem Nachtlauf: nachmittags. */
    afternoonStart: h(15),
  },

  // ---------------------------------------------------------------------------
  // Schlaf (SPEC 4.2, 6.3b)
  // ---------------------------------------------------------------------------
  sleep: {
    /** Standard-Schlafbedarf ohne WHOOP-Daten. */
    defaultNeedMin: 480,
    /** Einschlafdauer. */
    latencyMin: 15,
    /** Aufstehen bis Losfahren (Frühstück, Fertigmachen): 05:45 + 45 = 06:30 Losfahren vor der Tagschicht. */
    morningPrepMin: 45,
    /** Nach dem Nap bis zum Losfahren: spätestens 18:00 aufstehen, 18:30 losfahren. */
    napPrepMin: 30,
    /** Übliche Zubettgehzeit an normalen Abenden. */
    normalBedtime: h(22, 30),
    /** Frühestens empfohlene Zubettgehzeit. */
    earliestBedtime: h(21),
    /** Aufstehen an freien Tagen (gleichbleibend). */
    freeWake: h(7),
    /** Vor Tag 2 darf ausgeschlafen werden, spätestens bis … */
    preNightLatestWake: h(8, 30),
    /** Nap vor der Nachtschicht (SPEC 4.2: ca. 15:00–17:00). */
    napStart: h(15),
    napDefaultMin: 90,
    napMinMin: 20,
    napMaxMin: 120,
    /** Ab diesem Schlafdefizit wird der Nap verlängert. */
    napLongDebtMin: 60,
    /** Tagschlaf nach der Nachtschicht. */
    postNightStart: h(8),
    postNightEnd: h(14),
    /** Extra-Schlafgelegenheit vor Schlüsseleinheiten bzw. nach harten Tagen. */
    extraBeforeKeyMin: 30,
    extraAfterHardDayMin: 30,
    /** Höchstens so viel Defizit wird pro Nacht zusätzlich abgebaut. */
    maxDebtPayoffPerNightMin: 60,
    /** Nachtlauf: nach dem Lauf bis zum Zubettgehen (Duschen, Essen). */
    afterNightRunMin: 60,
    /** Nap vor einem Nachtlauf. */
    nightRunNapStart: h(15),
    nightRunNapMin: 90,
    /** Rennvorbereitung: letzte 14 Tage. */
    racePrepDays: 14,
    raceNightBedtime: h(22),
    raceNapStart: h(15),
    raceNapMin: 120,
    /** Toleranz für „Empfehlung umgesetzt“. */
    adherenceToleranceMin: 30,
  },

  // ---------------------------------------------------------------------------
  // Laufumfang (SPEC 5.3), Trend-Regel mit Schlüsselspitzen (Entscheidung Phase 2)
  // ---------------------------------------------------------------------------
  // BEGRÜNDUNG DER SPITZENWERTE
  // Ziel ist ein Finish in 22 h, also ca. 3,9 km/h im Schnitt mit viel Gehen bergauf.
  // Entscheidend sind Zeit auf den Beinen, Robustheit bergab und Nacht-Erfahrung,
  // nicht Tempo. Verbreitete Empfehlungen für erste 80–100-km-Rennen liegen bei
  // 60–90 km/Woche Spitze. Wir wählen ein Grundniveau von ca. 73 km/Woche
  // (≈ 52 km pro 5-Tage-Mikrozyklus), weil:
  //  - nur drei vollwertige Trainingstage pro 5 Tage zur Verfügung stehen (Tag 2, 4, 5),
  //  - jede Nachtschicht Erholung kostet und V-Schichten Tage streichen,
  //  - der Startumfang bei 20–40 km/Woche liegt und das Verletzungsrisiko bei
  //    schnellerem Aufbau deutlich steigt.
  // Schlüsselspitzen (längster Lauf 50 km, B2B 30 + 20 km, Bergwochenenden mit
  // 6–8 h) liegen bis zu 12 % über dem Grundniveau (≈ 80 km/Woche). Direkt danach
  // folgt ein Mikrozyklus auf Grundniveau. Höhenmeter: ca. 2.800 hm/Woche in der
  // Spitze, überwiegend Laufband mit 10–15 % Steigung, Treppen und die zwei
  // Bergwochenenden. Das reicht, um 4.295 hm im Rennen gehend zu bewältigen.
  volume: {
    /** Max. Steigerung des Grundniveaus pro Mikrozyklus (1,10^(5/7) ≈ 1,07 ≙ 10 %/Woche). */
    maxGrowthPerMicro: 0.07,
    /** Schlüsselspitzen dürfen bis zu 12 % über dem Grundniveau liegen. */
    keyPeakMaxFactor: 1.12,
    /** Entlastung: 35 % weniger (SPEC: 30–40 %). */
    deloadFactor: 0.65,
    /** Taper relativ zum Spitzen-Grundniveau. */
    taperFactors: { taper1: 0.6, taper2: 0.45, race_week: 0.2 },
    /** Höhenmeter im Taper relativ zur Spitze (kein hm-Schwerpunkt mehr). */
    taperElevationFactors: { taper1: 0.15, taper2: 0.05, race_week: 0 },
    /**
     * Anker des Grundniveaus in km/Woche, dazwischen geometrisch interpoliert
     * (nur Nicht-Entlastungs-Mikrozyklen). `start` kommt aus dem Profil.
     */
    levelAnchorsWeekly: [
      { micro: 13, km: 45 }, // Ende Grundlage
      { micro: 34, km: 62 }, // Ende Aufbau
      { micro: 46, km: 73 }, // Spitze rennspezifisch
    ],
    /** Mikrozyklus 49 (15–19 Tage vor dem Rennen) leicht unter Niveau. */
    finalMicroFactor: 0.85,
    /** Höhenmeter-Anker in hm/Woche (Start = Mikrozyklus 1). */
    elevationAnchorsWeekly: [
      { micro: 1, m: 250 },
      { micro: 13, m: 700 },
      { micro: 34, m: 1600 },
      { micro: 46, m: 2800 },
    ],
    /** Langer Lauf (km) je Nicht-Entlastungs-Mikrozyklus, interpoliert. */
    longRunAnchors: [
      { micro: 1, km: 10 },
      { micro: 13, km: 16 },
      { micro: 34, km: 33 },
    ],
    /** Rennspezifisch: Kilometer der Schlüsseleinheiten je Mikrozyklus. */
    specificRuns: {
      36: { b2b: [22, 14] },
      37: { night: 25 },
      38: { long: 40 },
      39: { b2b: [25, 15] },
      40: { mountain: [28, 15] },
      41: { night: 26 },
      43: { b2b: [26, 16] },
      44: { long: 50 },
      45: { night: 28 },
      46: { b2b: [30, 20] },
      47: { night: 26 },
      48: { mountain: [32, 18] },
      49: { long: 22 },
    } as Record<number, { b2b?: [number, number]; night?: number; long?: number; mountain?: [number, number] }>,
    /** Höhenmeter der Bergwochenenden [Tag 1, Tag 2]. */
    mountainElevation: { 40: [1800, 900], 48: [2200, 1000] } as Record<number, [number, number]>,
    /** Mindest- und Höchstumfänge flexibler Einheiten (km), damit Einheiten sinnvoll bleiben. */
    minKm: { easy_run: 5, recovery_run: 4, treadmill_hills: 4 } as Partial<Record<SessionType, number>>,
    maxKm: { easy_run: 16, recovery_run: 8, treadmill_hills: 14 } as Partial<Record<SessionType, number>>,
    /** Nach einem Nachtlauf ist der Lauf am Folgetag höchstens so lang. */
    maxKmAfterNightRun: 10,
    /** Anteil der Rest-Kilometer je Tag für die flexiblen Einheiten der Vorlagen. */
    flexShares: {
      base: { day2: 0.62, day5: 0.38 },
      deload: { day2: 0.6, day5: 0.4 },
      final: { day2: 0.6, day5: 0.4 },
    },
    /** Eine verschobene Einheit wird höchstens auf diesen Anteil gekürzt, sonst gestrichen (kein Nachholen). */
    minMovedShare: 0.6,
    /** Lange Läufe dürfen zur Einhaltung der Obergrenze höchstens auf diesen Anteil gekürzt werden. */
    minLongRunShareOfPlan: 0.7,
    /** Optionaler Regenerationslauf an Tag 3 (zählt nicht zum Soll). */
    optionalRecoveryRunMin: 30,
    /** Langer Lauf im Entlastungs-Mikrozyklus relativ zum letzten langen Lauf. */
    deloadLongRunFactor: 0.65,
    /** Taper: Anteil am Soll-Umfang je Tag (Tag 2 Qualität in kleiner Dosis, Tag 4 längster Lauf). */
    taperShares: {
      taper1: { day2: 0.3, day4: 0.5, day5: 0.2 },
      taper2: { day2: 0.3, day4: 0.45, day5: 0.25 },
      race_week: { day2: 0.6, day4: 0.4 },
    },
  },

  // ---------------------------------------------------------------------------
  // Tempo- und Zeitannahmen für die Dauer der Einheiten
  // ---------------------------------------------------------------------------
  pace: {
    /** Minuten pro km */
    easy: 6.5,
    recovery: 7.0,
    long: 7.0,
    longSpecific: 7.5,
    night: 8.0,
    threshold: 6.0,
    intervals: 6.5,
    /** Laufband mit Steigung (Gehen/Laufen im Wechsel). */
    incline: 12.0,
    /** Berg (Trail): Zeit = km / mountainKmh + hm / mountainHmPerHour (inkl. kurzer Pausen). */
    mountainKmh: 6,
    mountainHmPerHour: 700,
    /** Steigung Laufband (SPEC 5.4: 10–15 %). */
    inclinePctMin: 10,
    inclinePctMax: 15,
    /** Treppe: Höhe pro Stockwerk. */
    stairsMPerFloor: 3,
    /** Steigung Laufband je Phase. */
    inclinePctByPhase: { base: 10, build: 12, specific: 15, taper: 10 } as Record<Phase, number>,
    /** Höchstens dieser Anteil einer Höhenmeter-Einheit liegt auf der Steigung. */
    maxInclineShare: 0.8,
    /** Bergauf-Intervalle: Steigung und Tempo während der Belastung. */
    intervalInclinePct: 8,
    intervalSpeedKmh: 9,
    /**
     * Höhenmeter-Block in langen Läufen (Treppen, Parkhaus, Brücken, Deiche oder
     * Laufband am Ende), höchstens so viele hm je Einheit und Phase.
     */
    longRunHmCap: { base: 0, build: 300, specific: 700, taper: 150 } as Record<Phase, number>,
    /** Lauf-ABC und Steigerungen nach lockeren Läufen (Grundlage/Aufbau). */
    abcMin: 10,
    /** Ein- und Auslaufen bei Qualitätseinheiten. */
    qualityWarmupMin: 15,
    qualityCooldownMin: 10,
  },

  // ---------------------------------------------------------------------------
  // Einheiten: Empfindlichkeit, Schlüsseleinheiten, Priorität, Intensität
  // ---------------------------------------------------------------------------
  sessions: {
    /** SPEC 6.2 */
    sensitivity: {
      easy_run: 'low',
      recovery_run: 'low',
      long_run: 'medium',
      b2b_1: 'medium',
      b2b_2: 'medium',
      night_run: 'medium',
      mountain_day: 'medium',
      intervals_uphill: 'high',
      threshold: 'high',
      treadmill_hills: 'medium',
      calisthenics_main: 'medium',
      calisthenics_maintenance: 'low',
      skill_light: 'low',
      legs_heavy: 'high',
      strength_short: 'low',
      strength_test: 'high',
      mobility: 'low',
      race: 'low',
    } as Record<SessionType, 'high' | 'medium' | 'low'>,
    /** Schlüsseleinheiten (SPEC 4.3: Tag 4/5-Einheiten), werden bei Ausfall einmal verschoben. */
    key: ['long_run', 'b2b_1', 'b2b_2', 'night_run', 'mountain_day', 'intervals_uphill', 'threshold', 'treadmill_hills', 'calisthenics_main', 'legs_heavy', 'strength_test'] as SessionType[],
    /** Nur auf Tag 4/5 (SPEC 5.3, Nachtlauf: Entscheidung Phase 2). */
    day45Only: ['long_run', 'b2b_1', 'b2b_2', 'mountain_day', 'night_run'] as SessionType[],
    /** Priorität beim Verschieben/Verdrängen (höher = wichtiger). */
    priority: {
      mountain_day: 100,
      b2b_1: 90,
      b2b_2: 88,
      long_run: 80,
      night_run: 75,
      strength_test: 70,
      intervals_uphill: 60,
      threshold: 60,
      treadmill_hills: 50,
      calisthenics_main: 45,
      legs_heavy: 40,
      easy_run: 20,
      recovery_run: 15,
      calisthenics_maintenance: 15,
      strength_short: 12,
      skill_light: 10,
      mobility: 5,
      race: 1000,
    } as Record<SessionType, number>,
    /** Wichtigkeit für die Vorausschau 6.3a (0–1). Nicht gelistete Typen lösen keine Vorausschau aus. */
    lookaheadImportance: {
      mountain_day: 1.0,
      b2b_1: 1.0,
      b2b_2: 0.9,
      long_run: 0.8,
      night_run: 0.7,
      intervals_uphill: 0.6,
      threshold: 0.6,
      strength_test: 0.5,
      race: 1.0,
    } as Partial<Record<SessionType, number>>,
    /** Belastungsfaktor je Intensitätsstufe für die Trainingslast (Dauer × Faktor). */
    loadPerMinute: [0, 1, 2, 3, 4, 5],
    /** WHOOP-Strain (0–21) in dieselbe Skala: Strain 14 ≈ 90 min Zone 2–3 (≈ 280 Punkte). */
    strainToLoad: 20,
  },

  // ---------------------------------------------------------------------------
  // Kraft (SPEC 5.5)
  // ---------------------------------------------------------------------------
  strength: {
    /** Aufstieg nach so vielen Sessions in Folge mit erfülltem Kriterium. */
    sessionsToAdvance: 2,
    /** Die ersten n Sessions auf einer neuen Stufe gelten als „neue Stufe“ (hohe Empfindlichkeit). */
    newLevelSessions: 2,
    /** Muscle-Up-Training erst ab 10 sauberen Klimmzügen + 10 Dips. */
    muscleUpPrereq: { pullups: 10, dips: 10 },
    /** Volumenfaktor der Calisthenics nach Phase. */
    phaseVolume: { base: 1.0, build: 1.0, specific: 0.6, taper: 0.4 } as Record<Phase, number>,
    /** Geschätzte Sätze je Einheit (für das Kraftvolumen-Diagramm). */
    setsEstimate: {
      calisthenics_main: 16,
      calisthenics_maintenance: 8,
      skill_light: 6,
      legs_heavy: 15,
      strength_short: 6,
      strength_test: 5,
    } as Partial<Record<SessionType, number>>,
    /** Dauer je Kraft-Einheit (min). */
    durationMin: {
      calisthenics_main: 60,
      calisthenics_maintenance: 35,
      skill_light: 25,
      legs_heavy: 50,
      strength_short: 25,
      strength_test: 45,
      mobility: 20,
    } as Partial<Record<SessionType, number>>,
    /** Technik-Sätze Calisthenics: Wiederholungen/Haltezeit auf diesen Anteil. */
    techniqueIntensity: 0.8,
    /** Nebenübungen entfallen, wenn der Volumenfaktor einer Leiter darunter liegt. */
    minVolumeForAccessories: 0.6,
    /** Taper: kein schweres Beintraining in den letzten n Tagen vor dem Rennen. */
    noHeavyLegsDaysBeforeRace: 10,
  },

  // ---------------------------------------------------------------------------
  // Erholung (SPEC 6)
  // ---------------------------------------------------------------------------
  recovery: {
    /** WHOOP-Ampel (SPEC 6.1). */
    greenMin: 67,
    yellowMin: 34,
    /** Gewichte der Teilwerte für die Bereitschaft (werden auf Summe 1 normiert). In den Einstellungen änderbar. */
    weights: {
      recovery: 0.35,
      hrv: 0.15,
      restingHr: 0.1,
      sleep: 0.15,
      sleepDebt: 0.1,
      load: 0.1,
      shift: 0.05,
    },
    /** HRV: z-Score von ln(HRV) gegen das 30-Tage-Mittel; −2 → 0, +1 → 1. */
    hrvZRange: [-2, 1] as [number, number],
    /** Mindestens so viele Tage Verlauf für Baselines. */
    minBaselineDays: 5,
    /** Ruhepuls: Abweichung in bpm zum 30-Tage-Mittel; +8 → 0, −3 → 1. */
    rhrDeltaRange: [8, -3] as [number, number],
    /** Schlaf: Anteil am Bedarf; 60 % → 0, 100 % → 1. */
    sleepRatioRange: [0.6, 1.0] as [number, number],
    /** Schlafeffizienz: 75 % → 0, 95 % → 1. */
    efficiencyRange: [75, 95] as [number, number],
    sleepSubWeights: { ratio: 0.5, performance: 0.3, efficiency: 0.2 },
    /** Schlafdefizit (Summe 3 Tage): 0 min → 1, 180 min → 0. */
    debtRange: [0, 180] as [number, number],
    debtDays: 3,
    /** Akut/chronisch-Verhältnis der Last: 0,8 → 1, 1,5 → 0. */
    acwrRange: [0.8, 1.5] as [number, number],
    /** Strain Vortag: 10 → 1, 18 → 0. */
    strainRange: [10, 18] as [number, number],
    /** Schichtkontext: Abzüge vom Teilwert 1. */
    shiftPenalty: {
      lastNightWorked: 0.4,
      shiftEndedWithinHours: { hours: 10, penalty: 0.2 },
      nextShiftWithinHours: { hours: 8, penalty: 0.2 },
    },
    /** Manuelle Eingabe: Mapping Qualität/Gefühl 1–5 → 0–1. */
    manualRange: [1, 5] as [number, number],
    /** Gelb: Dauer der harten Einheit −25 % (unten im gelben Bereich) bis −10 % (oben). */
    yellowReduction: { max: 0.25, min: 0.1 },
    /** Rot: höchstens 30 min sehr locker bzw. Mobility. */
    redMaxMin: 30,
    redMobilityMin: 20,
    /** Schlaf unter 5 h: keine Intensität, kein schweres Krafttraining. */
    minSleepForIntensityMin: 300,
    /** Ersatz-Lauf bei gestrichener Intensität (freiwillig). */
    lowSleepEasyRunMaxMin: 40,
    /** Schlaftag: Training nur bei ≥ Gelb und ≥ 5 h Tagschlaf. */
    sleepDayMinSleepMin: 300,
    /** Warnsignal: Ruhepuls ≥ +5 bpm UND HRV ≤ −15 % gegen das 30-Tage-Mittel an 3 Tagen in Folge. */
    warning: { rhrDeltaBpm: 5, hrvDropPct: 0.15, days: 3 },
    /** Schlaf wird in der Begründung erwähnt, wenn er unter diesem Anteil des Bedarfs liegt. */
    sleepMentionBelowNeedShare: 0.85,
    /** Calisthenics-Hauptsession bei unter 5 h Schlaf: Technik-Sätze mit diesem Umfang. */
    lowSleepTechniqueFactor: 0.8,
    /** Sehr gute Recovery für den Nachhol-Vorschlag. */
    catchUpMinScore: 80,
    catchUpLookbackDays: 5,
    /** Vorausschau 6.3a */
    lookahead: {
      horizonDays: 2,
      /** Nähe: morgen 1,0, übermorgen 0,7 */
      proximity: [1.0, 0.7],
      /** Verstärker (werden addiert). */
      boostHrvFalling: 0.15,
      boostDebtGrowing: 0.15,
      boostNightShift: 0.2,
      /** Pro 10 Prozentpunkte erwarteter Recovery-Abfall (gelernte Muster, Phase 6). */
      boostPerExpectedDrop10: 0.05,
      /** Ab dieser Stärke wird umgewandelt (statt nur wie Gelb runtergestuft). */
      convertThreshold: 0.5,
      /** Umwandlung einer Qualitätseinheit: lockerer Lauf mit fester Dauer (SPEC-Beispiel: 45 min). */
      convertedEasyRunMin: 45,
      /** HRV-Trend fallend: 3-Tage-Steigung negativ und letzter Wert ≥ 5 % unter dem 7-Tage-Mittel. */
      hrvTrendDays: 3,
      hrvTrendDropPct: 0.05,
      /** Schlafdefizit wachsend: heute ≥ 30 min mehr als vor 2 Tagen. */
      debtGrowthMin: 30,
    },
    /** Mikrozyklus-Reduktion (SPEC 6.3). */
    microReduction: {
      redStreak: 2,
      redStreakReduction: 0.25,
      yellowRedStreak: 3,
      yellowRedStreakReduction: 0.15,
      debtThresholdMin: 240,
      debtReduction: 0.15,
    },
  },

  // ---------------------------------------------------------------------------
  // WHOOP-Zuordnung (SPEC 8)
  // ---------------------------------------------------------------------------
  whoop: {
    /**
     * Ein Hauptschlaf gilt für einen Trainingstag, wenn er vor dem Fensterbeginn begann und höchstens
     * so viele Stunden vor dem Fensterbeginn endete (sonst ist er veraltet → manuelle Eingabe).
     */
    maxSleepAgeHours: 12,
    /** Hauptschlaf, der in diesem Zeitraum beginnt, gilt als Tagschlaf (nach der Nachtschicht). */
    daySleepStartFrom: h(5),
    daySleepStartTo: h(13),
    /** Workouts vor dieser Uhrzeit gehören zum Nachtlauf des Vortags. */
    nightRunCarryoverUntil: h(4),
    /** Bezugszeit, wenn der Tag kein Trainingsfenster hat. */
    fallbackReferenceMin: h(12),
    /** Sportarten-Zuordnung (WHOOP sport_name, klein geschrieben, Teilstring). */
    runSports: ['running', 'run', 'hiking', 'rucking', 'walking', 'treadmill', 'stairmaster', 'trail', 'ultra', 'stair'],
    strengthSports: ['weightlifting', 'functional', 'calisthenics', 'strength', 'powerlifting', 'crossfit', 'gymnastics'],
    mobilitySports: ['yoga', 'stretching', 'mobility', 'pilates'],
  },
} as const

export type Config = typeof CONFIG

/** Voreingestelltes Athletenprofil (SPEC 3). In den Einstellungen änderbar. */
export const DEFAULT_PROFILE: Profile = {
  weeklyKmStart: 30,
  longestRunKm: 35,
  injuries: '',
  hasGym: true,
  hasTreadmillIncline: true,
  hasCalisthenicsPark: true,
  calisthenicsLevel: 'beginner',
  calisthenicsGoals: ['Muscle-Up', 'Front Lever', 'Back Lever', 'allgemein stärker werden'],
  commuteMin: 15,
  wearable: 'whoop',
}

export type RecoveryWeights = { -readonly [K in keyof Config['recovery']['weights']]: number }

/** Vom Nutzer überschreibbare Werte (Einstellungen). */
export interface UserConfigOverrides {
  recoveryWeights?: Partial<RecoveryWeights>
}

export interface ResolvedConfig {
  config: Config
  recoveryWeights: RecoveryWeights
}

/**
 * Wendet Nutzer-Overrides an. Nur freigegebene Felder sind änderbar.
 * Gewichte werden auf Summe 1 normiert, negative Werte auf 0 gesetzt.
 */
export function resolveConfig(overrides: UserConfigOverrides = {}): ResolvedConfig {
  const merged: RecoveryWeights = { ...CONFIG.recovery.weights, ...(overrides.recoveryWeights ?? {}) }
  const keys = Object.keys(merged) as (keyof RecoveryWeights)[]
  for (const k of keys) merged[k] = Math.max(0, Number.isFinite(merged[k]) ? merged[k] : 0)
  const sum = keys.reduce((s, k) => s + merged[k], 0)
  const weights = { ...merged }
  if (sum <= 0) {
    Object.assign(weights, CONFIG.recovery.weights)
  } else {
    for (const k of keys) weights[k] = merged[k] / sum
  }
  return { config: CONFIG, recoveryWeights: weights }
}
