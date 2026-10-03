import { CasImporter, BrokerImporter } from '../../components/InvestmentImporters'
import { StatementImport } from '../../components/StatementImport'
import { SettingsSectionShell } from './SettingsSectionShell'

/**
 * Post-onboarding import hub for investments and cash. Bank/card statements are
 * imported from the Transactions screen or the Bank Accounts settings tab
 * (targeted at a specific account).
 */
export function DataImportSettings() {
  return (
    <SettingsSectionShell
      title="Import data"
      description="Add mutual-fund, stock, and cash records anytime — statements are de-duplicated automatically."
    >
      <CasImporter />
      <BrokerImporter />

      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">Cash — tracker CSV</p>
        <StatementImport target={{ kind: 'cash' }} />
      </div>
    </SettingsSectionShell>
  )
}
