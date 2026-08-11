import { useEffect, useState } from 'react'
import { ipc } from '../lib/ipc'
import type { Account, Category, CreditCard, User } from '../types'
import { useDashboardStore, type DashboardSection } from '../stores/dashboardStore'
import { TopBar } from './dashboard/TopBar'
import { SpendDashboard } from './dashboard/SpendDashboard'
import { InvestmentDashboard } from './investments/InvestmentDashboard'
import { SettingsPage } from './settings/SettingsPage'

const NAV: { key: DashboardSection; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'investments', label: 'Investments' },
  { key: 'settings', label: 'Settings' }
]

export default function Dashboard() {
  const section = useDashboardStore((s) => s.section)
  const setSection = useDashboardStore((s) => s.setSection)

  const [user, setUser] = useState<User | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [cards, setCards] = useState<CreditCard[]>([])
  const [categories, setCategories] = useState<Category[]>([])

  useEffect(() => {
    ipc.user.get().then((u) => setUser(u ?? null))
    ipc.accounts.list().then(setAccounts)
    ipc.creditCards.list().then(setCards)
    ipc.categories.list().then(setCategories)
  }, [])

  return (
    <div className="flex h-screen w-screen bg-content text-content-foreground">
      <aside className="flex w-56 flex-none flex-col bg-sidebar text-sidebar-foreground">
        <div className="px-4 py-5 text-lg font-semibold text-white">FinPilot</div>
        <nav className="flex flex-col gap-1 px-2">
          {NAV.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setSection(item.key)}
              className={`rounded-md px-3 py-2 text-left text-sm transition ${
                section === item.key ? 'bg-primary text-white' : 'hover:bg-sidebar-accent'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        {user?.name && (
          <div className="mt-auto px-4 py-4 text-xs text-slate-500">
            Signed in as <span className="text-slate-300">{user.name}</span>
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* The account/time-range top bar applies to the spend dashboard only. */}
        {section === 'dashboard' && <TopBar accounts={accounts} cards={cards} />}
        <main className="flex-1 overflow-y-auto p-8">
          {section === 'dashboard' && <SpendDashboard categories={categories} />}
          {section === 'investments' && <InvestmentDashboard />}
          {section === 'settings' && <SettingsPage />}
          {section === 'transactions' && (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              {NAV.find((n) => n.key === section)?.label} arrives in a later phase.
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
