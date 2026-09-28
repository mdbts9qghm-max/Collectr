// Gemeinsame Domänentypen der Kernlogik. Keine Logik, keine Abhängigkeiten.

/** Kalendertag in Europe/Berlin im Format YYYY-MM-DD. */
export type LocalDate = string

/**
 * Uhrzeit als Minuten seit Mitternacht des Bezugstags (Europe/Berlin).
 * Werte ab 1440 liegen am Folgetag (z. B. Ende der Nachtschicht 07:00 = 1860).
 */
export type Minutes = number

/** Zeitpunkt als Kalendertag + Minuten (normalisiert auf 0–1439). */
export interface LocalDateTime {
  date: LocalDate
  minutes: Minutes
}

// ---------------------------------------------------------------------------
// Schicht
// ---------------------------------------------------------------------------

/** Grundrhythmus: Tagschicht, Nachtschicht, Schlaftag, Frei. */
export type BaseShift = 'T' | 'N' | 'S' | 'F'

/** Tatsächliche Schicht nach Overrides. U = Urlaub, K = krank, FB = Fortbildung. */
export type ShiftCode = 'T' | 'N' | 'S' | 'F' | 'V' | 'U' | 'K' | 'FB'

export type CycleDay = 1 | 2 | 3 | 4 | 5

export type OverrideKind = 'V' | 'URLAUB' | 'KRANK' | 'TAUSCH' | 'UEBERSTUNDEN' | 'FORTBILDUNG'

export interface ShiftOverride {
  date: LocalDate
  kind: OverrideKind
  /** Bei TAUSCH: welche Schicht stattdessen gilt. */
  swapTo?: 'T' | 'N' | 'S' | 'F' | 'V'
  /** Bei FORTBILDUNG: Dienstzeit. Bei UEBERSTUNDEN: neues Dienstende (Minuten, ggf. > 1440). */
  start?: Minutes
  end?: Minutes
  note?: string
  source?: 'manual' | 'ics'
}

export interface ShiftTimes {
  /** Dienstbeginn laut Plan. */
  start: Minutes
  /** Dienstende (bei Nacht > 1440). */
  end: Minutes
}

export interface WorkTimes extends ShiftTimes {
  /** Tatsächlicher Arbeitsbeginn (15 min vor Dienstbeginn). */
  actualStart: Minutes
  /** Losfahren = tatsächlicher Arbeitsbeginn − Arbeitsweg. */
  departure: Minutes
  /** Ankunft zu Hause nach Dienstende. */
  homeArrival: Minutes
}

/**
 * Planungskategorie eines Tages, abgeleitet aus der tatsächlichen Schicht und der Vortagsschicht.
 * - work: Tagdienst (T, V, Fortbildung) → kein Training
 * - pre_night: Nachtschicht am Abend → Training vormittags vor dem Nap
 * - night_to_night: Nachtschicht nach Nachtschicht → kein Training
 * - sleep_day: frei nach einer Nachtschicht → Training erst nachmittags und nur locker
 * - free: frei/Urlaub → ganztägig
 * - sick: krank → kein Training
 */
export type DayKind = 'work' | 'pre_night' | 'night_to_night' | 'sleep_day' | 'free' | 'sick'

export interface EffectiveShift {
  date: LocalDate
  cycleDay: CycleDay
  base: BaseShift
  code: ShiftCode
  isWork: boolean
  work?: WorkTimes
  /** Die Nacht vor diesem Tag war eine Arbeitsnacht (Vortag = N). */
  postNight: boolean
  dayKind: DayKind
  override?: ShiftOverride
}

export interface TrainingWindow {
  start: Minutes
  end: Minutes
  /** Nur lockere Einheiten (Schlaftag). */
  easyOnly: boolean
  /** Nachtlauf erlaubt (freier Tag, Folgetag ebenfalls frei). */
  nightRunAllowed: boolean
}

// ---------------------------------------------------------------------------
// Profil
// ---------------------------------------------------------------------------

export interface Profile {
  weeklyKmStart: number
  longestRunKm: number
  injuries: string
  hasGym: boolean
  hasTreadmillIncline: boolean
  hasCalisthenicsPark: boolean
  calisthenicsLevel: 'beginner' | 'intermediate' | 'advanced'
  calisthenicsGoals: string[]
  commuteMin: number
  wearable: 'whoop' | 'none'
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export type Phase = 'base' | 'build' | 'specific' | 'taper'

export type MicroKind = 'normal' | 'deload' | 'taper1' | 'taper2' | 'race_week'

/** Art des Mikrozyklus-Inhalts (welche Vorlage verwendet wird). */
export type MicroTemplate =
  | 'base'
  | 'build_a'
  | 'build_b'
  | 'specific_b2b'
  | 'specific_night'
  | 'specific_long'
  | 'specific_mountain'
  | 'specific_final'
  | 'deload'
  | 'taper1'
  | 'taper2'
  | 'race_week'

export interface Mesocycle {
  index: number
  start: LocalDate
  end: LocalDate
  phase: Phase
}

export interface Microcycle {
  /** 1–52 */
  index: number
  mesoIndex: number
  /** 1–7 innerhalb des Mesozyklus */
  indexInMeso: number
  start: LocalDate
  end: LocalDate
  phase: Phase
  kind: MicroKind
  template: MicroTemplate
  /** Krafttest in diesem Mikrozyklus. */
  hasStrengthTest: boolean
  /** Schlüssel-Mikrozyklus, darf über dem Grundniveau liegen (Trend-Regel). */
  isKeyPeak: boolean
}

export type SessionType =
  | 'easy_run'
  | 'recovery_run'
  | 'long_run'
  | 'b2b_1'
  | 'b2b_2'
  | 'night_run'
  | 'mountain_day'
  | 'intervals_uphill'
  | 'threshold'
  | 'treadmill_hills'
  | 'calisthenics_main'
  | 'calisthenics_maintenance'
  | 'skill_light'
  | 'legs_heavy'
  | 'strength_short'
  | 'strength_test'
  | 'mobility'
  | 'race'

export type SessionCategory = 'run' | 'strength' | 'mobility' | 'race'

export type Sensitivity = 'high' | 'medium' | 'low'

/** Intensitätsstufe 0–5 für den Vergleich „nie härter als geplant“. */
export type IntensityLevel = 0 | 1 | 2 | 3 | 4 | 5

export interface Intensity {
  level: IntensityLevel
  /** z. B. „Zone 2, locker (RPE 3–4)“ */
  label: string
}

export interface SessionStructure {
  warmup: string
  main: string
  cooldown: string
}

export type Ladder = 'pull' | 'push' | 'front_lever' | 'back_lever' | 'core' | 'legs'

export interface ExercisePrescription {
  ladder?: Ladder
  level?: number
  name: string
  sets: number
  reps?: number
  holdSec?: number
  /** Wiederholungen pro Seite */
  perSide?: boolean
  restSec: number
  note?: string
}

export interface PlannedSession {
  /** Stabil: `${ursprungsdatum}#${slot}` */
  id: string
  date: LocalDate
  microIndex: number
  type: SessionType
  category: SessionCategory
  title: string
  /** Ziel der Einheit in einem Satz. */
  goal: string
  sensitivity: Sensitivity
  isKey: boolean
  optional: boolean
  durationMin: number
  distanceKm?: number
  elevationM?: number
  intensity: Intensity
  structure: SessionStructure
  /** Empfohlene Startzeit (Minuten). */
  startMin?: Minutes
  /** Laufband-Anteil für die hm-Berechnung. */
  treadmill?: { inclinePct: number; inclineKm: number }
  /** Kraft: Übungen (werden beim Materialisieren aus dem Kraftstand gefüllt). */
  exercises?: ExercisePrescription[]
  /** Geschätzte Kraftsätze (für das Kraftvolumen im Gesamtplan). */
  strengthSets?: number
  /** Enthält eine neu erreichte Skill-Stufe (→ hohe Empfindlichkeit). */
  containsNewLevel?: boolean
  /** Technik-Variante (leichtere Sätze). */
  technique?: boolean
  /** Verpflegungstraining (g KH/h protokollieren). */
  fueling?: boolean
  /** Ausrüstungstest (Rucksack, Stöcke, Stirnlampe …). */
  gearTest?: boolean
  origin?: {
    movedFrom?: LocalDate
    convertedFrom?: SessionType
    note?: string
  }
}

export interface RemovedSession {
  session: PlannedSession
  reason: 'no_window' | 'window_too_short' | 'easy_only' | 'replaced' | 'moved' | 'cancelled' | 'missed'
  note: string
}

export interface PlanDay {
  date: LocalDate
  microIndex: number
  shift: EffectiveShift
  window: TrainingWindow | null
  sessions: PlannedSession[]
  removed: RemovedSession[]
  /** Optionaler Hinweis, z. B. 10 min Mobility am Abend der Tagschicht. */
  optionalNote?: string
  isRaceDay: boolean
}

export interface MicrocyclePlan extends Microcycle {
  /** Grundniveau (Trend) in km pro Mikrozyklus. */
  levelKm: number
  targetKm: number
  plannedKm: number
  targetElevationM: number
  plannedElevationM: number
  strengthSets: number
  /** Reduktionsfaktor aus der Erholung (1 = keine Reduktion). */
  modifier: number
  longRunKm: number
}

export interface MountainWeekend {
  microIndex: number
  days: [LocalDate, LocalDate]
  reminderDate: LocalDate
  /** Beide Tage frei? Sonst Ersatz. */
  feasible: boolean
}

export interface Plan {
  mesocycles: Mesocycle[]
  microcycles: MicrocyclePlan[]
  days: PlanDay[]
  mountainWeekends: MountainWeekend[]
}

// ---------------------------------------------------------------------------
// Tracking
// ---------------------------------------------------------------------------

export interface SetResult {
  reps?: number
  holdSec?: number
}

export interface StrengthResult {
  ladder: Ladder
  level: number
  sets: SetResult[]
  /** Anstrengung 1–10 (für die Beine-Leiter) */
  rpe?: number
}

export interface SessionLog {
  sessionId: string
  date: LocalDate
  status: 'done' | 'skipped'
  /** Die Anpassung wurde abgelehnt, das Original wurde ausgeführt. */
  adjustmentRejected?: boolean
  /** Einheit wurde nur reduziert durchgeführt (Anpassung angenommen). */
  reduced?: boolean
  durationMin?: number
  distanceKm?: number
  elevationM?: number
  feeling?: 1 | 2 | 3 | 4 | 5
  note?: string
  carbsPerHour?: number
  fuelingNote?: string
  gearNote?: string
  strength?: StrengthResult[]
  whoopWorkoutId?: string
  strain?: number
}

export interface StrengthTest {
  date: LocalDate
  maxPullups: number
  maxDips: number
  hollowHoldSec: number
  frontLever: { stage: number; holdSec: number }
  backLever: { stage: number; holdSec: number }
  /** optionale Zusatzwerte für die Einstufung */
  deadHangSec?: number
  maxPushups?: number
  maxAustralianRows?: number
}

export interface StrengthState {
  levels: Record<Ladder, number>
  /** Anzahl aufeinanderfolgender Sessions mit erfülltem Kriterium. */
  streak: Record<Ladder, number>
  /** Anzahl Sessions auf der aktuellen Stufe (0–1 → „neue Stufe“). */
  sessionsAtLevel: Record<Ladder, number>
  lastTest?: StrengthTest
}

// ---------------------------------------------------------------------------
// Erholung
// ---------------------------------------------------------------------------

export type TrafficLight = 'green' | 'yellow' | 'red'

export interface SleepData {
  /** Schlafdauer (tatsächlich geschlafen) des Hauptschlafs in Minuten. */
  durationMin: number
  /** Zusätzlicher Nap-Schlaf seit dem Hauptschlaf. */
  napMin?: number
  performancePct?: number
  efficiencyPct?: number
  /** Schlafbedarf laut WHOOP in Minuten. */
  needMin?: number
  /** Schlafdefizit laut WHOOP-Bedarf in Minuten. */
  debtMin?: number
  /** Hauptschlaf war Tagschlaf nach der Nachtschicht. */
  daySleep?: boolean
  start?: LocalDateTime
  end?: LocalDateTime
}

export interface ManualReadiness {
  date: LocalDate
  sleepMin: number
  /** Schlafqualität 1–5 */
  quality: 1 | 2 | 3 | 4 | 5
  /** Gefühl 1–5 */
  feeling: 1 | 2 | 3 | 4 | 5
}

/** Erholungsdaten, einem Trainingstag zugeordnet. */
export interface RecoveryDay {
  date: LocalDate
  source: 'whoop' | 'manual'
  recoveryScore?: number
  hrvMs?: number
  restingHr?: number
  spo2?: number
  sleep?: SleepData
  /** Strain des Vortags (WHOOP 0–21). */
  strainPrevDay?: number
  manual?: ManualReadiness
}

export interface LoadEntry {
  date: LocalDate
  load: number
}

export type AdjustmentAction = 'keep' | 'downgrade' | 'shorten' | 'convert' | 'cancel' | 'needs_input'

export interface SessionAdjustment {
  sessionId: string
  date: LocalDate
  original: PlannedSession
  /** null = gestrichen (Ruhetag) */
  adjusted: PlannedSession | null
  /** Freiwillige Alternative bei Streichung (z. B. 20 min Mobility). */
  alternative?: PlannedSession
  action: AdjustmentAction
  /** Einheiten-Faktor 0–1 (Anteil der geplanten Einheit). */
  unitFactor: number
  traffic?: TrafficLight
  readiness?: number
  /** Begründung in einem Satz. */
  reason: string
  ruleIds: string[]
  healthWarning?: boolean
}

// ---------------------------------------------------------------------------
// Schlaf
// ---------------------------------------------------------------------------

export interface SleepBlock {
  start: LocalDateTime
  end: LocalDateTime
  durationMin: number
}

export interface SleepRecommendation {
  date: LocalDate
  /** Schlaf am Tag nach der Nachtschicht. */
  daySleep?: SleepBlock
  /** Nap vor der Nachtschicht, vor einem Nachtlauf oder vor dem Rennen. */
  nap?: SleepBlock
  /** Nacht beginnend am Abend dieses Tages. */
  night?: SleepBlock
  /** Späteste Losfahrzeit zur Arbeit an diesem Tag. */
  departure?: Minutes
  notes: string[]
  tip?: string
}
