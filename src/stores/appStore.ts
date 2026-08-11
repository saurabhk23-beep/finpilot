import { create } from 'zustand'
import { ipc } from '../lib/ipc'

export type Screen = 'loading' | 'password' | 'onboarding' | 'dashboard'

interface AppState {
  screen: Screen
  /** True on first run (no DB file yet) → password screen shows "create" mode. */
  isFirstRun: boolean
  /** Decides the initial screen by asking the main process whether a DB exists. */
  init: () => Promise<void>
  /** Called after a successful unlock; routes to onboarding or dashboard. */
  completeUnlock: (onboardingCompleted: boolean) => void
  goToDashboard: () => void
}

export const useAppStore = create<AppState>((set) => ({
  screen: 'loading',
  isFirstRun: false,

  init: async () => {
    const status = await ipc.auth.status()
    set({ isFirstRun: !status.dbExists, screen: 'password' })
  },

  completeUnlock: (onboardingCompleted) => {
    set({ screen: onboardingCompleted ? 'dashboard' : 'onboarding' })
  },

  goToDashboard: () => set({ screen: 'dashboard' })
}))
