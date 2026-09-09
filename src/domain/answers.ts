import type { ISODate, SportKey } from './types.ts';
import type { AppData } from '../data/store.ts';
import type { Indexes } from '../data/derived.ts';
import {
  activeHabits,
  buildCoach,
  buildDayView,
  buildMetrics,
  entriesFor,
  makeDayContextFn,
} from '../data/derived.ts';
import { CATALOGUE as COACH_CATALOGUE } from './coach/catalogue.ts';
import { shapeOf } from './coach/toSession.ts';
import { addDays, dateRange, lastNDays, startOfMonth, startOfWeek } from './date.ts';
import {
  SPORT_META,
  formatDistance,
  formatDuration,
  formatHours,
  formatMetric,
  weekdayLong,
} from './format.ts';
import { average, periodStats, round1 } from './load.ts';
import { buildWeekSummary } from './review.ts';
import { computeStreak, quotaFor } from './habits.ts';
import { goalProgress, goalStatusText } from './goals.ts';
import { describeRecord } from './metrics.ts';

/**
 * The coach answers questions using only what is stored in the app.
 *
 * It is a deterministic intent matcher, not a language model: it runs offline,
 * costs nothing, never invents a number, and can always point at the record its
 * answer came from. When it has no data it says so instead of guessing.
 */

export interface CoachAnswer {
  text: string;
  /** Numbers backing the answer, shown as chips under the reply. */
  facts?: { label: string; value: string }[];
  /** Follow-up questions the user can tap. */
  followUps?: string[];
  /** Set when the app genuinely has nothing to answer with. */
  noData?: boolean;
}

type Intent =
  | 'today'
  | 'last_week'
  | 'run_or_strength'
  | 'volume_month'
  | 'ultra_progress'
  | 'sleep'
  | 'habits'
  | 'records'
  | 'load'
  | 'goals'
  | 'shift'
  | 'help';

const PATTERNS: { intent: Intent; keywords: string[][] }[] = [
  { intent: 'today', keywords: [['heute'], ['jetzt', 'trainieren'], ['today'], ['was', 'soll']] },
  {
    intent: 'last_week',
    keywords: [['letzte', 'woche'], ['vergangene', 'woche'], ['wochenrückblick'], ['last', 'week']],
  },
  {
    intent: 'run_or_strength',
    keywords: [['laufen', 'kraft'], ['lauf', 'oder'], ['kraft', 'oder']],
  },
  {
    intent: 'volume_month',
    keywords: [['monat'], ['umfang'], ['kilometer'], ['km'], ['volumen']],
  },
  {
    intent: 'ultra_progress',
    keywords: [['ultra'], ['100'], ['long', 'run'], ['marathon']],
  },
  { intent: 'sleep', keywords: [['schlaf'], ['sleep'], ['müde'], ['erholung'], ['recovery']] },
  { intent: 'habits', keywords: [['habit'], ['gewohnheit'], ['streak']] },
  { intent: 'records', keywords: [['record'], ['bestleistung'], ['pr'], ['bestzeit'], ['rekord']] },
  { intent: 'load', keywords: [['belastung'], ['load'], ['form'], ['fitness'], ['acwr'], ['überlast']] },
  { intent: 'goals', keywords: [['ziel'], ['goal'], ['ftp'], ['pull'], ['5 km'], ['5km']] },
  { intent: 'shift', keywords: [['schicht'], ['nacht'], ['frei'], ['dienst']] },
];

export const COACH_SUGGESTIONS = [
  'Was soll ich heute trainieren?',
  'Wie sind meine Schichten diese Woche?',
  'Wie war meine letzte Woche?',
  'Wie viel Laufumfang hatte ich diesen Monat?',
  'Wie entwickle ich mich Richtung 100-km-Ultra?',
  'Wie ist meine Belastung gerade?',
  'Wie steht es um meinen Schlaf?',
  'Zeig mir meine Bestleistungen.',
];

function detectIntent(question: string): Intent {
  const q = question.toLowerCase();
  let best: { intent: Intent; score: number } = { intent: 'help', score: 0 };
  for (const p of PATTERNS) {
    for (const group of p.keywords) {
      if (group.every((k) => q.includes(k))) {
        const score = group.join('').length;
        if (score > best.score) best = { intent: p.intent, score };
      }
    }
  }
  return best.intent;
}

export function askCoach(
  question: string,
  data: AppData,
  idx: Indexes,
  today: ISODate,
): CoachAnswer {
  switch (detectIntent(question)) {
    case 'today':
      return answerToday(data, idx, today);
    case 'last_week':
      return answerLastWeek(data, idx, today);
    case 'run_or_strength':
      return answerRunOrStrength(data, idx, today);
    case 'volume_month':
      return answerVolume(data, today);
    case 'ultra_progress':
      return answerUltra(data, today);
    case 'sleep':
      return answerSleep(data, idx, today);
    case 'habits':
      return answerHabits(data, idx, today);
    case 'records':
      return answerRecords(data);
    case 'load':
      return answerLoad(data, idx, today);
    case 'goals':
      return answerGoals(data, today);
    case 'shift':
      return answerShift(idx, today);
    default:
      return {
        text:
          'Ich arbeite ausschließlich mit deinen gespeicherten Daten — Training, Schichten, Schlaf, Habits, Aufgaben und Zielen. Frag mich zum Beispiel eines davon:',
        followUps: COACH_SUGGESTIONS.slice(0, 5),
      };
  }
}

/* ------------------------------------------------------------------ *
 * Answers
 * ------------------------------------------------------------------ */

/**
 * Was heute ansteht — aus dem Coach, nicht aus einer zweiten Rechnung.
 *
 * Diese Antwort muss Wort für Wort zu dem passen, was im Coach-Tab und auf dem
 * Tagesbildschirm steht. Eine Frage anders zu beantworten als der Plan sie
 * beantwortet, ist genau der Fehler, der einen Plan unbrauchbar macht: man weiß
 * dann nicht mehr, welchem der beiden Bildschirme man glauben soll.
 */
function answerToday(data: AppData, idx: Indexes, today: ISODate): CoachAnswer {
  const view = buildDayView(data, idx, today);
  const plan = buildCoach(data, idx, today);
  const decision = plan.today;

  const reasonLines = decision.reasons
    .slice(0, 3)
    .map((r) => `• ${r.title}: ${r.detail}`)
    .join('\n');

  if (decision.kind === 'ruhe') {
    return {
      text:
        `${decision.headline}\n\nWarum:\n${reasonLines || '• Dieser Schichttag hat kein Trainingsfenster.'}`,
      facts: [
        { label: 'Schicht', value: view.shift.type?.label ?? 'nicht gesetzt' },
        { label: 'Phase', value: `${plan.target.phase.id} — ${plan.target.phase.label}` },
      ],
      followUps: ['Wie ist meine Belastung gerade?', 'Wie war meine letzte Woche?'],
    };
  }

  const strength = decision.strength?.kind
    ? `\n\nDazu ${COACH_CATALOGUE[decision.strength.kind].label}: ${formatDuration(
        decision.strength.minutes,
      )}, RPE ${decision.strength.rpe}.`
    : '';

  return {
    text:
      `${SPORT_META[shapeOf(decision.kind).sport].icon} ${decision.headline}` +
      (decision.zoneLabel ? `\n${decision.zoneLabel} bpm` : '') +
      strength +
      `\n\nWarum:\n${reasonLines}` +
      (decision.stepsDown > 0
        ? `\n\nGeplant war ${COACH_CATALOGUE[decision.plannedKind].label} — die Erholung trägt das heute nicht.`
        : ''),
    facts: [
      { label: 'Schicht', value: view.shift.type?.label ?? 'nicht gesetzt' },
      { label: 'Dauer', value: formatDuration(decision.minutes) },
      { label: 'Phase', value: `${plan.target.phase.id}, ${plan.target.runMinutes} min / 10 Tage` },
      { label: 'Bahnstufe', value: plan.stage.stage.label },
    ],
    followUps: ['Wie ist meine Belastung gerade?', 'Wie war meine letzte Woche?'],
  };
}

function answerLastWeek(data: AppData, idx: Indexes, today: ISODate): CoachAnswer {
  const lastWeekStart = addDays(startOfWeek(today, data.settings.weekStartsOn), -7);
  const s = buildWeekSummary(data, idx, lastWeekStart);
  if (s.sessions === 0) {
    return {
      text: 'In der letzten Woche sind keine Einheiten erfasst. Sobald du Trainings einträgst, kann ich sie auswerten.',
      noData: true,
    };
  }
  const sportLines = s.bySport
    .map((b) => `• ${SPORT_META[b.sport].label}: ${formatDuration(b.minutes)}${b.distanceKm > 0 ? ` · ${formatDistance(b.distanceKm)}` : ''}`)
    .join('\n');

  return {
    text:
      `Letzte Woche: ${s.sessions} Einheiten, ${formatHours(s.totalMinutes / 60)} gesamt (Ziel ${formatHours(s.targetMinutes / 60)}).\n\n${sportLines}\n\n` +
      `Gut gelaufen: ${s.wentWell[0]}\n` +
      `Verbesserungspunkt: ${s.toImprove[0]}\n` +
      `Für die kommende Woche: ${s.nextWeek[0]}`,
    facts: [
      { label: 'Load', value: String(s.load) },
      { label: 'Schlaf Ø', value: s.avgSleepHours != null ? `${s.avgSleepHours.toFixed(1)} h` : '–' },
      { label: 'Readiness Ø', value: s.avgReadiness != null ? String(s.avgReadiness) : '–' },
      { label: 'Habits', value: s.habitPct != null ? `${s.habitPct} %` : '–' },
    ],
  };
}

function answerRunOrStrength(data: AppData, idx: Indexes, today: ISODate): CoachAnswer {
  const view = buildDayView(data, idx, today);
  const all = [
    ...view.recommendation.recommended,
    ...view.recommendation.alternatives,
    ...view.recommendation.notRecommended,
  ];
  const run = all.find((r) => r.template.sport === 'run');
  const strength = all.find((r) => r.template.sport === 'strength');

  if (!run && !strength) {
    return { text: 'Heute passt weder Laufen noch Krafttraining — beide sind durch Schicht oder Erholung ausgeschlossen.' };
  }
  const better = (run?.score ?? -1) >= (strength?.score ?? -1) ? run : strength;
  const other = better === run ? strength : run;

  const explain = (r: typeof run) =>
    r
      ? r.blockedBy
        ? `${SPORT_META[r.template.sport].label}: blockiert — ${r.blockedBy}.`
        : `${SPORT_META[r.template.sport].label}: ${r.template.title}, Bewertung ${r.score}. ${r.reasons[0]?.text ?? ''}`
      : '';

  return {
    text: `Heute spricht mehr für ${SPORT_META[better!.template.sport].label}.\n\n${explain(better)}\n${explain(other)}`,
    facts: [
      { label: 'Schicht', value: view.shift.type?.label ?? 'nicht gesetzt' },
      { label: 'Readiness', value: view.readiness.score != null ? String(view.readiness.score) : '–' },
    ],
  };
}

function answerVolume(data: AppData, today: ISODate): CoachAnswer {
  const monthStart = startOfMonth(today);
  const month = periodStats(data.sessions, monthStart, today);
  const week = periodStats(data.sessions, addDays(today, -6), today);
  if (month.total.sessions === 0) {
    return { text: 'Diesen Monat sind noch keine Einheiten erfasst.', noData: true };
  }
  const sports: SportKey[] = ['run', 'bike', 'swim'];
  const lines = sports
    .filter((s) => month.bySport[s].minutes > 0)
    .map(
      (s) =>
        `• ${SPORT_META[s].label}: ${formatDistance(month.bySport[s].distanceKm)} in ${formatDuration(month.bySport[s].minutes)} (${month.bySport[s].sessions} Einheiten)`,
    )
    .join('\n');

  return {
    text:
      `Seit dem ${monthStart.slice(8)}. dieses Monats:\n${lines || '• Noch keine Distanzen erfasst'}\n\n` +
      `Gesamt: ${formatHours(month.total.minutes / 60)} in ${month.total.sessions} Einheiten an ${month.activeDays} Tagen.\n` +
      `Letzte 7 Tage: ${formatHours(week.total.minutes / 60)}.`,
    facts: [
      { label: 'Load Monat', value: String(month.total.load) },
      { label: 'Harte Einheiten', value: String(month.hardSessions) },
      { label: 'Höhenmeter', value: `${month.total.elevationM} m` },
    ],
  };
}

function answerUltra(data: AppData, today: ISODate): CoachAnswer {
  const metrics = buildMetrics(data, today);
  const goal = data.goals.find((g) => g.active && g.metric === 'run_longest_km');
  const longest = metrics.get('run_longest_km');
  const twelveWeeks = periodStats(data.sessions, addDays(today, -83), today);
  const weeklyRunKm = round1(twelveWeeks.bySport.run.distanceKm / 12);

  if (!longest) {
    return {
      text: 'Für die Ultra-Einschätzung fehlen mir Laufeinheiten mit Distanz. Sobald Läufe erfasst sind, kann ich den Weg zur 100 km bewerten.',
      noData: true,
    };
  }

  const p = goal ? goalProgress(goal, metrics, today) : null;
  const status = p ? goalStatusText(p) : null;

  // A widely used rule of thumb: a 100 km finish wants a sustained base of
  // roughly 70–90 km per week with regular long runs beyond 30 km.
  const baseTarget = 70;
  const basePct = Math.min(100, Math.round((weeklyRunKm / baseTarget) * 100));

  return {
    text:
      `Längster Lauf bisher: ${formatDistance(longest.value)}${longest.date ? ` (${longest.date})` : ''}.\n` +
      `Laufumfang im 12-Wochen-Schnitt: ${weeklyRunKm} km/Woche — das sind ${basePct} % der ~${baseTarget} km/Woche, die für einen 100-km-Finish als solide Basis gelten.\n\n` +
      (p?.nextMilestone
        ? `Nächster Meilenstein: ${p.nextMilestone.label} (${formatDistance(p.nextMilestone.value)}).\n`
        : '') +
      (status ? `Status: ${status.text}.\n\n` : '\n') +
      'Der Hebel ist nicht der einzelne Long Run, sondern der Wochenumfang, den du über Monate hältst — bei Schichtdienst heißt das: lieber häufiger und kürzer als selten und lang.',
    facts: [
      { label: 'Längster Lauf', value: formatDistance(longest.value) },
      { label: 'km/Woche Ø', value: `${weeklyRunKm}` },
      { label: 'Long Runs (12 W.)', value: String(twelveWeeks.longSessions) },
    ],
  };
}

function answerSleep(data: AppData, idx: Indexes, today: ISODate): CoachAnswer {
  const dates = lastNDays(today, 14);
  const sleeps = dates.map((d) => idx.checkIns.get(d)?.sleepHours).filter((v): v is number => v != null);
  if (sleeps.length === 0) {
    return { text: 'Es sind noch keine Schlafdaten erfasst. Trag sie im Tages-Check-in ein.', noData: true };
  }
  const avg = round1(average(sleeps));
  const target = data.settings.recovery.sleepHoursTarget;
  const hit = sleeps.filter((s) => s >= target).length;

  const byShift = new Map<string, number[]>();
  for (const d of dates) {
    const hours = idx.checkIns.get(d)?.sleepHours;
    if (hours == null) continue;
    const shiftId = idx.shiftAssignments.get(d)?.shiftTypeId;
    const label = shiftId ? (idx.shiftTypes.get(shiftId)?.label ?? 'Ohne Schicht') : 'Ohne Schicht';
    byShift.set(label, [...(byShift.get(label) ?? []), hours]);
  }
  const shiftLines = [...byShift.entries()]
    .map(([label, values]) => `• ${label}: ${round1(average(values))} h (${values.length} Tage)`)
    .join('\n');

  return {
    text:
      `Über 14 Tage: ${avg} h im Schnitt bei einem Ziel von ${target} h. An ${hit} von ${sleeps.length} erfassten Tagen hast du das Ziel erreicht.\n\n` +
      `Nach Schicht aufgeschlüsselt:\n${shiftLines}` +
      (avg < target - 0.5
        ? '\n\nBei Schichtdienst ist der wirksamste Hebel meist nicht mehr Zeit im Bett, sondern eine feste Vorschlaf-Routine vor der Nachtschicht.'
        : ''),
    facts: [
      { label: 'Ø 14 Tage', value: `${avg} h` },
      { label: 'Ziel erreicht', value: `${hit}/${sleeps.length}` },
    ],
  };
}

function answerHabits(data: AppData, idx: Indexes, today: ISODate): CoachAnswer {
  const habits = activeHabits(data);
  if (habits.length === 0) return { text: 'Es sind noch keine Habits angelegt.', noData: true };

  const contextFor = makeDayContextFn(idx, today);
  const week = dateRange(startOfWeek(today, data.settings.weekStartsOn), today);

  const rows = habits.map((h) => {
    const entries = entriesFor(idx, h.id);
    const quota = quotaFor(h, entries, contextFor, week);
    const streak = computeStreak(h, entries, contextFor, today);
    return { habit: h, quota, streak };
  });

  const best = rows.slice().sort((a, b) => b.streak.current - a.streak.current)[0];
  const worst = rows.slice().sort((a, b) => a.quota.pct - b.quota.pct)[0];

  const lines = rows
    .map(
      (r) =>
        `• ${r.habit.icon} ${r.habit.name}: ${r.quota.done}/${r.quota.required} diese Woche${r.streak.current > 0 ? ` · Streak ${r.streak.current}` : ''}`,
    )
    .join('\n');

  return {
    text:
      `Diese Woche:\n${lines}\n\n` +
      `Stärkster Streak: ${best.habit.name} mit ${best.streak.current} Tagen.\n` +
      `Schwächster Habit: ${worst.habit.name} mit ${worst.quota.pct} %.`,
    facts: [{ label: 'Habits aktiv', value: String(habits.length) }],
  };
}

function answerRecords(data: AppData): CoachAnswer {
  if (data.records.length === 0) {
    return {
      text: 'Noch keine Bestleistungen erfasst. Sie entstehen automatisch, sobald du Einheiten mit Distanz, Zeit oder Wiederholungen einträgst.',
      noData: true,
    };
  }
  const bestByMetric = new Map<string, (typeof data.records)[number]>();
  for (const r of data.records) {
    const prev = bestByMetric.get(r.metric as string);
    if (!prev || (r.betterIsLower ? r.value < prev.value : r.value > prev.value)) {
      bestByMetric.set(r.metric as string, r);
    }
  }
  const lines = [...bestByMetric.values()]
    .map((r) => `• ${r.label}: ${describeRecord(r)} (${r.date})`)
    .join('\n');
  return { text: `Deine aktuellen Bestleistungen:\n${lines}` };
}

function answerLoad(data: AppData, idx: Indexes, today: ISODate): CoachAnswer {
  const view = buildDayView(data, idx, today);
  const { load } = view;
  if (load.ctl === 0 && load.atl === 0) {
    return { text: 'Es gibt noch keine abgeschlossenen Einheiten, aus denen sich eine Belastung berechnen ließe.', noData: true };
  }

  const formState =
    load.tsb > 10
      ? 'Du bist frisch — der Körper hätte Kapazität für einen Reiz.'
      : load.tsb < -15
        ? 'Du trägst deutliche Ermüdung mit dir. Das ist im Aufbau normal, aber nicht über Wochen.'
        : 'Fitness und Ermüdung sind im Gleichgewicht.';

  const acwrState =
    load.acwr === 0
      ? 'Für das Akut:Chronisch-Verhältnis fehlt noch Historie.'
      : load.acwr > data.settings.recovery.acwrCeiling
        ? `Das Akut:Chronisch-Verhältnis liegt bei ${load.acwr.toFixed(2)} und damit über deinem Limit von ${data.settings.recovery.acwrCeiling} — die letzten 7 Tage waren deutlich härter als die 4 Wochen davor.`
        : `Das Akut:Chronisch-Verhältnis liegt bei ${load.acwr.toFixed(2)} und damit im sicheren Bereich.`;

  return {
    text: `Fitness (chronische Last): ${load.ctl}\nErmüdung (akute Last): ${load.atl}\nForm: ${load.tsb > 0 ? '+' : ''}${load.tsb}\n\n${formState}\n${acwrState}`,
    facts: [
      { label: 'CTL', value: String(load.ctl) },
      { label: 'ATL', value: String(load.atl) },
      { label: 'Form', value: `${load.tsb > 0 ? '+' : ''}${load.tsb}` },
      { label: 'ACWR', value: load.acwr ? load.acwr.toFixed(2) : '–' },
    ],
  };
}

function answerGoals(data: AppData, today: ISODate): CoachAnswer {
  const goals = data.goals.filter((g) => g.active);
  if (goals.length === 0) return { text: 'Es sind noch keine Ziele angelegt.', noData: true };
  const metrics = buildMetrics(data, today);
  const lines = goals
    .map((g) => {
      const p = goalProgress(g, metrics, today);
      const status = goalStatusText(p);
      const current = p.current != null ? formatMetric(g.metric as string, p.current) : 'keine Daten';
      return `• ${g.title}: ${current} → ${formatMetric(g.metric as string, g.targetValue)} · ${Math.round(p.pct)} % · ${status.text}`;
    })
    .join('\n');
  return { text: `Deine Ziele:\n${lines}` };
}

function answerShift(idx: Indexes, today: ISODate): CoachAnswer {
  const upcoming = dateRange(today, addDays(today, 6)).map((d) => {
    const id = idx.shiftAssignments.get(d)?.shiftTypeId;
    const type = id ? idx.shiftTypes.get(id) : null;
    return { date: d, type };
  });
  const missing = upcoming.filter((u) => !u.type).length;
  const lines = upcoming
    .map(
      (u) =>
        `• ${weekdayLong(u.date)}: ${u.type ? `${u.type.icon} ${u.type.label} — ${formatDuration(u.type.training.maxMinutes)} Trainingsfenster` : 'keine Schicht eingetragen'}`,
    )
    .join('\n');
  const green = upcoming.filter((u) => u.type?.training.rating === 'green');

  return {
    text:
      `Die nächsten 7 Tage:\n${lines}\n\n` +
      (green.length > 0
        ? `Beste Trainingstage: ${green.map((g) => weekdayLong(g.date)).join(', ')} — dort gehören lange und harte Einheiten hin.`
        : 'In den nächsten 7 Tagen gibt es keinen vollen freien Tag. Plane kürzere Einheiten ein statt einer großen.') +
      (missing > 0 ? `\n\n${missing} Tage haben noch keine Schicht — trag sie ein, damit die Planung stimmt.` : ''),
    facts: [{ label: 'Freie Tage', value: String(green.length) }],
  };
}
