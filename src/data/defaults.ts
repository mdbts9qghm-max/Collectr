import { CONFIG, DEFAULT_PROFILE } from '../core/config'
import type { AppSettings } from './types'

export function defaultSettings(): AppSettings {
  return {
    onboarded: false,
    profile: { ...DEFAULT_PROFILE, calisthenicsGoals: [...DEFAULT_PROFILE.calisthenicsGoals] },
    anchorDate: CONFIG.shift.anchorDate,
    recoveryWeights: {},
    demoMode: false,
    simulatedDate: null,
  }
}
