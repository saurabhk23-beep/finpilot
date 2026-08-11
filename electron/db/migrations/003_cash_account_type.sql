-- Cash tracking (PRD 4.1.4) needs a container for transactions that don't
-- belong to a real bank account or card. Modeling it as an Account with
-- type='cash' (rather than allowing account_id/card_id to both be NULL)
-- keeps it a first-class peer of real accounts in the account selector.
-- SQLite can't alter a CHECK constraint in place, so the table is rebuilt.
--
-- PRAGMA foreign_keys can only be toggled outside an open transaction, so
-- this migration deliberately does NOT wrap itself in BEGIN/COMMIT the way
-- 001 does — it follows SQLite's documented 12-step ALTER TABLE recipe.

PRAGMA foreign_keys = OFF;

CREATE TABLE account_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES user(id),
  bank TEXT NOT NULL,
  nickname TEXT NOT NULL,
  last4 TEXT,
  type TEXT NOT NULL CHECK (type IN ('savings', 'current', 'salary', 'cash')),
  opening_balance REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO account_new SELECT * FROM account;

DROP TABLE account;
ALTER TABLE account_new RENAME TO account;

CREATE INDEX idx_account_user ON account(user_id);

PRAGMA foreign_keys = ON;
