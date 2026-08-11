import { create } from 'zustand'
import type { PickedFile } from '../lib/ipc'

export const ONBOARDING_STEPS = [
  'Profile',
  'Bank Accounts',
  'Credit Cards',
  'Cash',
  'Investments',
  'Summary'
] as const

export type OnboardingStepName = (typeof ONBOARDING_STEPS)[number]

interface OnboardingState {
  stepIndex: number
  /** Statement files attached during onboarding, keyed by "account:<id>" / "card:<id>". Parsed in Phase D. */
  pendingFiles: Record<string, PickedFile[]>
  next: () => void
  back: () => void
  goTo: (index: number) => void
  setPendingFiles: (key: string, files: PickedFile[]) => void
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  stepIndex: 0,
  pendingFiles: {},
  next: () => set((s) => ({ stepIndex: Math.min(s.stepIndex + 1, ONBOARDING_STEPS.length - 1) })),
  back: () => set((s) => ({ stepIndex: Math.max(s.stepIndex - 1, 0) })),
  goTo: (index) => set({ stepIndex: Math.max(0, Math.min(index, ONBOARDING_STEPS.length - 1)) }),
  setPendingFiles: (key, files) => set((s) => ({ pendingFiles: { ...s.pendingFiles, [key]: files } }))
}))
