// JSON-Backup (SPEC 9.9): Schema-Prüfung beim Import, damit kaputte Dateien nichts überschreiben.

import { z } from 'zod'
import type { BackupData } from './types'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const rating = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])
const ladderRecord = z.object({
  pull: z.number(),
  push: z.number(),
  front_lever: z.number(),
  back_lever: z.number(),
  core: z.number(),
  legs: z.number(),
})

const profile = z.object({
  weeklyKmStart: z.number().min(5).max(200),
  longestRunKm: z.number().min(0),
  injuries: z.string(),
  hasGym: z.boolean(),
  hasTreadmillIncline: z.boolean(),
  hasCalisthenicsPark: z.boolean(),
  calisthenicsLevel: z.enum(['beginner', 'intermediate', 'advanced']),
  calisthenicsGoals: z.array(z.string()),
  commuteMin: z.number().min(0).max(180),
  wearable: z.enum(['whoop', 'none']),
})

const strengthTest = z.object({
  date,
  maxPullups: z.number().min(0),
  maxDips: z.number().min(0),
  hollowHoldSec: z.number().min(0),
  frontLever: z.object({ stage: z.number(), holdSec: z.number() }),
  backLever: z.object({ stage: z.number(), holdSec: z.number() }),
  deadHangSec: z.number().optional(),
  maxPushups: z.number().optional(),
  maxAustralianRows: z.number().optional(),
})

export const backupSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  settings: z.object({
    onboarded: z.boolean(),
    profile,
    anchorDate: date,
    recoveryWeights: z.record(z.string(), z.number()),
    demoMode: z.boolean(),
    usePatterns: z.boolean().optional(),
    simulatedDate: date.nullable(),
    vacationReminderAck: date.optional(),
  }),
  overrides: z.array(
    z.object({
      date,
      kind: z.enum(['V', 'URLAUB', 'KRANK', 'TAUSCH', 'UEBERSTUNDEN', 'FORTBILDUNG']),
      swapTo: z.enum(['T', 'N', 'S', 'F', 'V']).optional(),
      start: z.number().optional(),
      end: z.number().optional(),
      note: z.string().optional(),
      source: z.enum(['manual', 'ics']).optional(),
    }),
  ),
  logs: z.array(
    z
      .object({
        sessionId: z.string(),
        date,
        status: z.enum(['done', 'skipped']),
      })
      .passthrough(),
  ),
  manual: z.array(z.object({ date, sleepMin: z.number().min(0), quality: rating, feeling: rating })),
  strengthTests: z.array(strengthTest),
  strengthState: z
    .object({ levels: ladderRecord, streak: ladderRecord, sessionsAtLevel: ladderRecord, lastTest: strengthTest.optional() })
    .nullable(),
  checklist: z.record(z.string(), z.boolean()),
  decisions: z.array(z.object({ sessionId: z.string(), date, rejected: z.boolean(), decidedAt: z.string() })),
  assignments: z.array(z.object({ workoutId: z.string(), sessionId: z.string().nullable(), decidedAt: z.string() })).optional(),
})

export function parseBackup(json: string): { ok: true; data: BackupData } | { ok: false; error: string } {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return { ok: false, error: 'Die Datei ist kein gültiges JSON.' }
  }
  const r = backupSchema.safeParse(raw)
  if (!r.success) return { ok: false, error: `Die Datei ist kein gültiges Backup (${r.error.issues[0]?.path.join('.') ?? 'unbekannt'}).` }
  return { ok: true, data: r.data as BackupData }
}
