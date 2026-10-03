import { useDashboardStore, type SettingsSection } from '../../stores/dashboardStore'
import { ProfileSettings } from './ProfileSettings'
import { AccountsSettings } from './AccountsSettings'
import { CardsSettings } from './CardsSettings'
import { CategoriesSettings } from './CategoriesSettings'
import { RulesSettings } from './RulesSettings'
import { DataRefreshSettings } from './DataRefreshSettings'
import { UncategorizedReview } from './UncategorizedReview'
import { SecuritySettings } from './SecuritySettings'
import { DataImportSettings } from './DataImportSettings'
import { AdvancedSettings } from './AdvancedSettings'

const NAV: { key: SettingsSection; label: string }[] = [
  { key: 'profile', label: 'Profile' },
  { key: 'accounts', label: 'Bank Accounts' },
  { key: 'cards', label: 'Credit Cards' },
  { key: 'categories', label: 'Categories' },
  { key: 'import', label: 'Import Data' },
  { key: 'rules', label: 'Rules' },
  { key: 'data', label: 'Data & Refresh' },
  { key: 'review', label: 'Uncategorized' },
  { key: 'security', label: 'Security' },
  { key: 'advanced', label: 'Advanced' }
]

export function SettingsPage() {
  const active = useDashboardStore((s) => s.settingsSection)
  const setActive = useDashboardStore((s) => s.setSettingsSection)

  return (
    <div className="flex gap-8">
      <nav className="w-48 flex-none">
        <h1 className="mb-3 px-2 text-lg font-semibold">Settings</h1>
        <ul className="space-y-1">
          {NAV.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => setActive(item.key)}
                className={`w-full rounded-md px-3 py-2 text-left text-sm transition ${
                  active === item.key ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0 flex-1">
        {active === 'profile' && <ProfileSettings />}
        {active === 'accounts' && <AccountsSettings />}
        {active === 'cards' && <CardsSettings />}
        {active === 'categories' && <CategoriesSettings />}
        {active === 'rules' && <RulesSettings />}
        {active === 'import' && <DataImportSettings />}
        {active === 'data' && <DataRefreshSettings />}
        {active === 'review' && <UncategorizedReview />}
        {active === 'security' && <SecuritySettings />}
        {active === 'advanced' && <AdvancedSettings />}
      </div>
    </div>
  )
}
