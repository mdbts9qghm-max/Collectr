import { create } from 'zustand';
import type {
  AppSettings,
  DailyCheckIn,
  Exercise,
  Goal,
  Habit,
  HabitEntry,
  ISODate,
  PersonalRecord,
  ShiftAssignment,
  ShiftType,
  Task,
  TrainingPlan,
  TrainingSession,
  WeeklyReview,
} from '../domain/types.ts';
import { nowTimestamp, today } from '../domain/date.ts';
import { makeId } from '../domain/ids.ts';
import { currentMetrics, detectRecords } from '../domain/metrics.ts';
import { completeTask as completeTaskRule } from '../domain/tasks.ts';
import * as db from './db.ts';
import {
  defaultExercises,
  defaultGoals,
  defaultHabits,
  defaultSettings,
  defaultShiftTypes,
  defaultTrainingPlan,
} from './defaults.ts';

export interface Toast {
  id: string;
  text: string;
  tone: 'default' | 'good' | 'bad';
}

export interface AppData {
  settings: AppSettings;
  shiftTypes: ShiftType[];
  shifts: Record<ISODate, ShiftAssignment>;
  sessions: TrainingSession[];
  exercises: Exercise[];
  habits: Habit[];
  habitEntries: HabitEntry[];
  tasks: Task[];
  goals: Goal[];
  records: PersonalRecord[];
  checkIns: Record<ISODate, DailyCheckIn>;
  reviews: Record<ISODate, WeeklyReview>;
  plans: TrainingPlan[];
}

interface AppStore extends AppData {
  ready: boolean;
  persistent: boolean;
  storageError: string | null;
  toasts: Toast[];

  init: () => Promise<void>;
  toast: (text: string, tone?: Toast['tone']) => void;
  dismissToast: (id: string) => void;

  updateSettings: (patch: Partial<AppSettings>) => void;
  saveShiftType: (type: ShiftType) => void;
  deleteShiftType: (id: string) => void;
  setShift: (date: ISODate, shiftTypeId: string | null) => void;
  setShifts: (assignments: ShiftAssignment[]) => void;

  saveSession: (session: TrainingSession) => PersonalRecord[];
  deleteSession: (id: string) => void;
  /** One-tap completion: planned values become the actual ones. */
  toggleSessionDone: (id: string) => PersonalRecord[];

  saveExercise: (exercise: Exercise) => void;

  saveHabit: (habit: Habit) => void;
  deleteHabit: (id: string) => void;
  logHabit: (habitId: string, date: ISODate, value: number) => void;

  saveTask: (task: Task) => void;
  deleteTask: (id: string) => void;
  toggleTask: (id: string) => void;

  saveGoal: (goal: Goal) => void;
  deleteGoal: (id: string) => void;

  saveCheckIn: (checkIn: DailyCheckIn) => void;
  saveReview: (review: WeeklyReview) => void;
  savePlan: (plan: TrainingPlan) => void;

  replaceAll: (data: Partial<AppData>) => Promise<void>;
  resetAll: () => Promise<void>;
}

const emptyData: AppData = {
  settings: defaultSettings(),
  shiftTypes: [],
  shifts: {},
  sessions: [],
  exercises: [],
  habits: [],
  habitEntries: [],
  tasks: [],
  goals: [],
  records: [],
  checkIns: {},
  reviews: {},
  plans: [],
};

/** Fire-and-forget write; failures surface as a toast instead of a crash. */
function persist(promise: Promise<unknown>, onError: (message: string) => void): void {
  promise.catch((err: unknown) => {
    onError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
  });
}

export const useStore = create<AppStore>()((set, get) => {
  const fail = (message: string) => {
    set({ storageError: message });
    get().toast(`Speichern fehlgeschlagen: ${message}`, 'bad');
  };
  const write = (p: Promise<unknown>) => persist(p, fail);

  return {
    ...emptyData,
    ready: false,
    persistent: false,
    storageError: null,
    toasts: [],

    async init() {
      if (!db.isPersistenceAvailable()) {
        set({
          ...emptyData,
          shiftTypes: defaultShiftTypes(),
          habits: defaultHabits(),
          exercises: defaultExercises(),
          goals: defaultGoals(),
          plans: [defaultTrainingPlan()],
          ready: true,
          storageError:
            'Dieser Browser stellt keinen dauerhaften Speicher bereit. Daten gehen beim Schließen verloren — bitte exportieren.',
        });
        return;
      }

      try {
        const [
          settings,
          shiftTypes,
          shiftRows,
          sessions,
          exercises,
          habits,
          habitEntries,
          tasks,
          goals,
          records,
          checkInRows,
          reviewRows,
          plans,
        ] = await Promise.all([
          db.getSingleton<AppSettings>('app-settings'),
          db.getAll<ShiftType>(db.STORES.shiftTypes),
          db.getAll<ShiftAssignment>(db.STORES.shifts),
          db.getAll<TrainingSession>(db.STORES.sessions),
          db.getAll<Exercise>(db.STORES.exercises),
          db.getAll<Habit>(db.STORES.habits),
          db.getAll<HabitEntry>(db.STORES.habitEntries),
          db.getAll<Task>(db.STORES.tasks),
          db.getAll<Goal>(db.STORES.goals),
          db.getAll<PersonalRecord>(db.STORES.records),
          db.getAll<DailyCheckIn>(db.STORES.checkIns),
          db.getAll<WeeklyReview>(db.STORES.reviews),
          db.getAll<TrainingPlan>(db.STORES.plans),
        ]);

        const firstRun = !settings;

        // First launch seeds the athlete's configuration, not fake activity.
        // Every seeded row is a setting or a goal the user stated — no invented
        // training history, no placeholder logs.
        const seededShiftTypes = shiftTypes.length ? shiftTypes : defaultShiftTypes();
        const seededHabits = habits.length ? habits : defaultHabits();
        const seededExercises = exercises.length ? exercises : defaultExercises();
        const seededGoals = goals.length || !firstRun ? goals : defaultGoals();
        const seededPlans = plans.length ? plans : [defaultTrainingPlan()];
        const resolvedSettings = settings ?? defaultSettings();

        if (firstRun) {
          await Promise.all([
            db.putSingleton('app-settings', resolvedSettings),
            db.bulkPut(db.STORES.shiftTypes, seededShiftTypes),
            db.bulkPut(db.STORES.habits, seededHabits),
            db.bulkPut(db.STORES.exercises, seededExercises),
            db.bulkPut(db.STORES.goals, seededGoals),
            db.bulkPut(db.STORES.plans, seededPlans),
          ]);
        }

        set({
          settings: resolvedSettings,
          shiftTypes: seededShiftTypes.sort((a, b) => a.order - b.order),
          shifts: Object.fromEntries(shiftRows.map((s) => [s.date, s])),
          sessions,
          exercises: seededExercises,
          habits: seededHabits.sort((a, b) => a.order - b.order),
          habitEntries,
          tasks,
          goals: seededGoals,
          records,
          checkIns: Object.fromEntries(checkInRows.map((c) => [c.date, c])),
          reviews: Object.fromEntries(reviewRows.map((r) => [r.weekStart, r])),
          plans: seededPlans,
          ready: true,
        });

        const persistent = await db.requestPersistentStorage();
        set({ persistent });
      } catch (err) {
        set({
          ...emptyData,
          shiftTypes: defaultShiftTypes(),
          habits: defaultHabits(),
          exercises: defaultExercises(),
          goals: defaultGoals(),
          plans: [defaultTrainingPlan()],
          ready: true,
          storageError: err instanceof Error ? err.message : 'Datenbank nicht verfügbar',
        });
      }
    },

    toast(text, tone = 'default') {
      const id = makeId('toast');
      set((s) => ({ toasts: [...s.toasts, { id, text, tone }] }));
      setTimeout(() => get().dismissToast(id), 3200);
    },

    dismissToast(id) {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    },

    updateSettings(patch) {
      const next: AppSettings = { ...get().settings, ...patch, updatedAt: nowTimestamp() };
      set({ settings: next });
      write(db.putSingleton('app-settings', next));
    },

    saveShiftType(type) {
      const list = get().shiftTypes.filter((t) => t.id !== type.id).concat(type);
      set({ shiftTypes: list.sort((a, b) => a.order - b.order) });
      write(db.put(db.STORES.shiftTypes, type));
    },

    deleteShiftType(id) {
      set((s) => ({ shiftTypes: s.shiftTypes.filter((t) => t.id !== id) }));
      write(db.remove(db.STORES.shiftTypes, id));
    },

    setShift(date, shiftTypeId) {
      if (!shiftTypeId) {
        set((s) => {
          const next = { ...s.shifts };
          delete next[date];
          return { shifts: next };
        });
        write(db.remove(db.STORES.shifts, date));
        return;
      }
      const assignment: ShiftAssignment = { date, shiftTypeId, source: 'manual' };
      set((s) => ({ shifts: { ...s.shifts, [date]: assignment } }));
      write(db.put(db.STORES.shifts, assignment));
    },

    setShifts(assignments) {
      set((s) => {
        const next = { ...s.shifts };
        for (const a of assignments) next[a.date] = a;
        return { shifts: next };
      });
      write(db.bulkPut(db.STORES.shifts, assignments));
    },

    saveSession(session) {
      const stamped: TrainingSession = { ...session, updatedAt: nowTimestamp() };
      const sessions = get().sessions.filter((s) => s.id !== stamped.id).concat(stamped);
      set({ sessions });
      write(db.put(db.STORES.sessions, stamped));

      // Records are re-derived from the full history after every save, so a
      // corrected session can also take a record back.
      const state = get();
      const metrics = currentMetrics(
        sessions,
        Object.values(state.checkIns),
        state.settings,
        today(),
      );
      const fresh = detectRecords(metrics, state.records, today());
      if (fresh.length > 0) {
        // Records accumulate as history — the progression of a PR is itself
        // interesting, and nothing is silently overwritten.
        set({ records: [...state.records, ...fresh] });
        write(db.bulkPut(db.STORES.records, fresh));
      }
      return fresh;
    },

    deleteSession(id) {
      set((s) => ({ sessions: s.sessions.filter((x) => x.id !== id) }));
      write(db.remove(db.STORES.sessions, id));
    },

    toggleSessionDone(id) {
      const session = get().sessions.find((s) => s.id === id);
      if (!session) return [];

      if (session.status === 'completed') {
        // Back to planned. The logged actuals are kept: reopening a session by
        // accident must not silently discard what was already entered.
        return get().saveSession({ ...session, status: 'planned' });
      }

      // Completing without opening the editor assumes the plan was followed.
      // Anything more precise — real duration, distance, RPE — is a tap away in
      // the session sheet, and overwrites these defaults.
      return get().saveSession({
        ...session,
        status: 'completed',
        actualDurationMin: session.actualDurationMin ?? session.plannedDurationMin,
        actualDistanceKm: session.actualDistanceKm ?? session.plannedDistanceKm,
        actualIntensity: session.actualIntensity ?? session.plannedIntensity,
      });
    },

    saveExercise(exercise) {
      set((s) => ({ exercises: s.exercises.filter((e) => e.id !== exercise.id).concat(exercise) }));
      write(db.put(db.STORES.exercises, exercise));
    },

    saveHabit(habit) {
      const habits = get().habits.filter((h) => h.id !== habit.id).concat(habit);
      set({ habits: habits.sort((a, b) => a.order - b.order) });
      write(db.put(db.STORES.habits, habit));
    },

    deleteHabit(id) {
      set((s) => ({
        habits: s.habits.filter((h) => h.id !== id),
        habitEntries: s.habitEntries.filter((e) => e.habitId !== id),
      }));
      write(db.remove(db.STORES.habits, id));
      const stale = get().habitEntries.filter((e) => e.habitId === id);
      for (const e of stale) write(db.remove(db.STORES.habitEntries, e.id));
    },

    logHabit(habitId, date, value) {
      const existing = get().habitEntries.find((e) => e.habitId === habitId && e.date === date);
      const entry: HabitEntry = existing
        ? { ...existing, value, updatedAt: nowTimestamp() }
        : {
            id: makeId('he'),
            habitId,
            date,
            value,
            source: 'manual',
            updatedAt: nowTimestamp(),
          };
      set((s) => ({
        habitEntries: s.habitEntries.filter((e) => e.id !== entry.id).concat(entry),
      }));
      write(db.put(db.STORES.habitEntries, entry));
    },

    saveTask(task) {
      set((s) => ({ tasks: s.tasks.filter((t) => t.id !== task.id).concat(task) }));
      write(db.put(db.STORES.tasks, task));
    },

    deleteTask(id) {
      set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
      write(db.remove(db.STORES.tasks, id));
    },

    toggleTask(id) {
      const state = get();
      const task = state.tasks.find((t) => t.id === id);
      if (!task) return;

      if (task.status === 'done') {
        const reopened: Task = { ...task, status: 'open', completedAt: undefined };
        set({ tasks: state.tasks.map((t) => (t.id === id ? reopened : t)) });
        write(db.put(db.STORES.tasks, reopened));
        return;
      }

      const shifts = new Map(Object.entries(state.shifts));
      const { completed, next } = completeTaskRule(task, shifts);
      const tasks = state.tasks.map((t) => (t.id === id ? completed : t));
      if (next) tasks.push(next);
      set({ tasks });
      write(db.put(db.STORES.tasks, completed));
      if (next) write(db.put(db.STORES.tasks, next));
    },

    saveGoal(goal) {
      set((s) => ({ goals: s.goals.filter((g) => g.id !== goal.id).concat(goal) }));
      write(db.put(db.STORES.goals, goal));
    },

    deleteGoal(id) {
      set((s) => ({ goals: s.goals.filter((g) => g.id !== id) }));
      write(db.remove(db.STORES.goals, id));
    },

    saveCheckIn(checkIn) {
      const stamped: DailyCheckIn = { ...checkIn, updatedAt: nowTimestamp() };
      set((s) => ({ checkIns: { ...s.checkIns, [stamped.date]: stamped } }));
      write(db.put(db.STORES.checkIns, stamped));

      // Habits that mirror a check-in field stay in sync automatically instead
      // of asking for the same number twice.
      const state = get();
      for (const habit of state.habits) {
        if (habit.archived) continue;
        if (habit.autoSource === 'sleep_hours' && stamped.sleepHours != null) {
          state.logHabit(habit.id, stamped.date, stamped.sleepHours);
        }
        if (habit.autoSource === 'steps' && stamped.steps != null) {
          state.logHabit(habit.id, stamped.date, stamped.steps);
        }
      }
    },

    saveReview(review) {
      const stamped: WeeklyReview = { ...review, updatedAt: nowTimestamp() };
      set((s) => ({ reviews: { ...s.reviews, [stamped.weekStart]: stamped } }));
      write(db.put(db.STORES.reviews, stamped));
    },

    savePlan(plan) {
      set((s) => ({ plans: s.plans.filter((p) => p.id !== plan.id).concat(plan) }));
      write(db.put(db.STORES.plans, plan));
    },

    async replaceAll(data) {
      const merged: AppData = { ...emptyData, ...get(), ...data };
      set({ ...merged });
      if (!db.isPersistenceAvailable()) return;
      await db.clearAll();
      await Promise.all([
        db.putSingleton('app-settings', merged.settings),
        db.bulkPut(db.STORES.shiftTypes, merged.shiftTypes),
        db.bulkPut(db.STORES.shifts, Object.values(merged.shifts)),
        db.bulkPut(db.STORES.sessions, merged.sessions),
        db.bulkPut(db.STORES.exercises, merged.exercises),
        db.bulkPut(db.STORES.habits, merged.habits),
        db.bulkPut(db.STORES.habitEntries, merged.habitEntries),
        db.bulkPut(db.STORES.tasks, merged.tasks),
        db.bulkPut(db.STORES.goals, merged.goals),
        db.bulkPut(db.STORES.records, merged.records),
        db.bulkPut(db.STORES.checkIns, Object.values(merged.checkIns)),
        db.bulkPut(db.STORES.reviews, Object.values(merged.reviews)),
        db.bulkPut(db.STORES.plans, merged.plans),
      ]);
    },

    async resetAll() {
      if (db.isPersistenceAvailable()) await db.clearAll();
      set({ ...emptyData, ready: false });
      await get().init();
    },
  };
});

/** Snapshot of everything the pure domain functions need. */
export function snapshot(): AppData {
  const s = useStore.getState();
  return {
    settings: s.settings,
    shiftTypes: s.shiftTypes,
    shifts: s.shifts,
    sessions: s.sessions,
    exercises: s.exercises,
    habits: s.habits,
    habitEntries: s.habitEntries,
    tasks: s.tasks,
    goals: s.goals,
    records: s.records,
    checkIns: s.checkIns,
    reviews: s.reviews,
    plans: s.plans,
  };
}
