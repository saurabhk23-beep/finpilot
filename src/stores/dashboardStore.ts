import { create } from 'zustand'
import type { Scope } from '../types'
import { resolveRange, type DateRange, type TimeRangePreset } from '../utils/dateRange'

export type DashboardSection = 'dashboard' | 'transactions' | 'investments' | 'settings'

export type SettingsSection =
  | 'profile'
  | 'accounts'
  | 'cards'
  | 'categories'
  | 'rules'
  | 'data'
  | 'import'
  | 'review'
  | 'security'
  | 'advanced'

interface DashboardState {
  section: DashboardSection
  settingsSection: SettingsSection
  scope: Scope
  preset: TimeRangePreset
  customRange: DateRange | null
  setSection: (section: DashboardSection) => void
  setSettingsSection: (s: SettingsSection) => void
  /** Jump straight to a Settings sub-page (e.g. the dashboard "Review" link → uncategorized). */
  goToSettings: (s: SettingsSection) => void
  setScope: (scope: Scope) => void
  setPreset: (preset: TimeRangePreset) => void
  setCustomRange: (range: DateRange) => void
  /** The concrete {dateFrom, dateTo} for the current preset (or custom). */
  range: () => DateRange
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  section: 'dashboard',
  settingsSection: 'profile',
  scope: { kind: 'all' },
  preset: 'thisMonth',
  customRange: null,

  setSection: (section) => set({ section }),
  setSettingsSection: (settingsSection) => set({ settingsSection }),
  goToSettings: (settingsSection) => set({ section: 'settings', settingsSection }),
  setScope: (scope) => set({ scope }),
  setPreset: (preset) => set({ preset }),
  setCustomRange: (customRange) => set({ customRange, preset: 'custom' }),

  range: () => {
    const { preset, customRange } = get()
    if (preset === 'custom' && customRange) return customRange
    return resolveRange(preset)
  }
}))
