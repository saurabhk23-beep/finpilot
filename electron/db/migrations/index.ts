import m001 from './001_initial_schema.sql?raw'
import m002 from './002_onboarding_flag.sql?raw'
import m003 from './003_cash_account_type.sql?raw'
import m004 from './004_transaction_mcc.sql?raw'

export interface Migration {
  name: string
  sql: string
}

/** Ordered list, bundled as raw text so migrations survive packaging without extra file resources. */
export const migrations: Migration[] = [
  { name: '001_initial_schema.sql', sql: m001 },
  { name: '002_onboarding_flag.sql', sql: m002 },
  { name: '003_cash_account_type.sql', sql: m003 },
  { name: '004_transaction_mcc.sql', sql: m004 }
]
