-- FinPilot initial schema (Phase B)
-- Every table has user_id except User, MFNav, StockPrice (shared/public cache data).

BEGIN TRANSACTION;

-- name/monthly_salary/employer_name are nullable: the row is seeded blank at
-- first launch (before onboarding exists to fill it in) purely so other
-- tables have a user_id to reference. Onboarding fills them via UPDATE.
CREATE TABLE user (
  id INTEGER PRIMARY KEY,
  name TEXT,
  monthly_salary REAL,
  employer_name TEXT,
  fy_start_month INTEGER NOT NULL DEFAULT 4,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE account (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES user(id),
  bank TEXT NOT NULL,
  nickname TEXT NOT NULL,
  last4 TEXT,
  type TEXT NOT NULL CHECK (type IN ('savings', 'current', 'salary')),
  opening_balance REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_account_user ON account(user_id);

CREATE TABLE credit_card (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES user(id),
  issuer TEXT NOT NULL,
  nickname TEXT NOT NULL,
  last4 TEXT,
  credit_limit REAL NOT NULL,
  bill_date INTEGER,
  linked_account_id INTEGER REFERENCES account(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_credit_card_user ON credit_card(user_id);

CREATE TABLE category (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES user(id),
  name TEXT NOT NULL,
  parent_id INTEGER REFERENCES category(id),
  icon TEXT,
  is_system INTEGER NOT NULL DEFAULT 0,
  is_hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_category_user ON category(user_id);
CREATE INDEX idx_category_parent ON category(parent_id);

CREATE TABLE category_rule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES user(id),
  rule_type TEXT NOT NULL CHECK (rule_type IN ('keyword', 'mcc', 'vpa', 'amount')),
  pattern TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES category(id),
  priority INTEGER NOT NULL DEFAULT 0,
  is_user_created INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_category_rule_user ON category_rule(user_id);
CREATE INDEX idx_category_rule_type ON category_rule(user_id, rule_type, priority);

-- "Transaction" entity; table named `transactions` to avoid the SQL TRANSACTION keyword.
CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES user(id),
  account_id INTEGER REFERENCES account(id),
  card_id INTEGER REFERENCES credit_card(id),
  date TEXT NOT NULL,
  amount REAL NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
  narration TEXT NOT NULL,
  raw_text TEXT,
  category_id INTEGER REFERENCES category(id),
  sub_category_id INTEGER REFERENCES category(id),
  is_transfer INTEGER NOT NULL DEFAULT 0,
  is_cc_payment INTEGER NOT NULL DEFAULT 0,
  is_excluded INTEGER NOT NULL DEFAULT 0,
  remarks TEXT,
  source_file TEXT,
  matched_transfer_id INTEGER REFERENCES transactions(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (account_id IS NOT NULL OR card_id IS NOT NULL)
);
CREATE INDEX idx_transactions_user_date ON transactions(user_id, date);
CREATE INDEX idx_transactions_account ON transactions(account_id, date);
CREATE INDEX idx_transactions_card ON transactions(card_id, date);
CREATE INDEX idx_transactions_category ON transactions(user_id, category_id);

CREATE TABLE mf_scheme (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES user(id),
  scheme_code TEXT NOT NULL,
  scheme_name TEXT NOT NULL,
  folio TEXT NOT NULL,
  amc_name TEXT
);
CREATE INDEX idx_mf_scheme_user ON mf_scheme(user_id);

CREATE TABLE mf_transaction (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES user(id),
  scheme_id INTEGER NOT NULL REFERENCES mf_scheme(id),
  date TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('sip', 'lumpsum', 'redemption', 'switch_in', 'switch_out')),
  amount REAL NOT NULL,
  units REAL NOT NULL,
  nav REAL NOT NULL
);
CREATE INDEX idx_mf_transaction_user ON mf_transaction(user_id);
CREATE INDEX idx_mf_transaction_scheme ON mf_transaction(scheme_id, date);

-- Shared cache, no user_id: NAV data is public AMFI data, not user-specific.
CREATE TABLE mf_nav (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scheme_code TEXT NOT NULL,
  date TEXT NOT NULL,
  nav REAL NOT NULL,
  UNIQUE (scheme_code, date)
);
CREATE INDEX idx_mf_nav_scheme_date ON mf_nav(scheme_code, date);

CREATE TABLE stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES user(id),
  symbol TEXT NOT NULL,
  name TEXT,
  exchange TEXT CHECK (exchange IN ('NSE', 'BSE')),
  sector TEXT
);
CREATE INDEX idx_stock_user ON stock(user_id);

CREATE TABLE stock_transaction (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES user(id),
  stock_id INTEGER NOT NULL REFERENCES stock(id),
  date TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('buy', 'sell')),
  qty REAL NOT NULL,
  price REAL NOT NULL,
  charges REAL NOT NULL DEFAULT 0
);
CREATE INDEX idx_stock_transaction_user ON stock_transaction(user_id);
CREATE INDEX idx_stock_transaction_stock ON stock_transaction(stock_id, date);

-- Shared cache, no user_id: daily close prices are public market data.
CREATE TABLE stock_price (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  date TEXT NOT NULL,
  close_price REAL NOT NULL,
  UNIQUE (symbol, date)
);
CREATE INDEX idx_stock_price_symbol_date ON stock_price(symbol, date);

CREATE TABLE import_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES user(id),
  file_name TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  account_id INTEGER REFERENCES account(id),
  import_date TEXT NOT NULL DEFAULT (datetime('now')),
  txn_count INTEGER NOT NULL DEFAULT 0,
  date_range_start TEXT,
  date_range_end TEXT,
  status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed'))
);
CREATE INDEX idx_import_log_user ON import_log(user_id);
CREATE UNIQUE INDEX idx_import_log_user_hash ON import_log(user_id, file_hash);

COMMIT;
