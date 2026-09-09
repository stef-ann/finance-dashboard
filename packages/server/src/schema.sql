PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  id                   INTEGER PRIMARY KEY CHECK (id = 1),
  mode                 TEXT NOT NULL DEFAULT 'simulation',
  currency             TEXT NOT NULL DEFAULT 'USD',
  monthly_budget_cents INTEGER NOT NULL DEFAULT 300000,
  allocation_basis     TEXT NOT NULL DEFAULT 'spendable',
  teller_environment   TEXT NOT NULL DEFAULT 'sandbox',
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS teller_enrollments (
  id                     TEXT PRIMARY KEY,
  access_token_encrypted TEXT NOT NULL,
  enrollment_id          TEXT,
  institution_name       TEXT,
  user_id                TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id                      TEXT PRIMARY KEY,
  source                  TEXT NOT NULL,
  external_id             TEXT,
  name                    TEXT NOT NULL,
  type                    TEXT NOT NULL,
  institution_name        TEXT NOT NULL DEFAULT 'Chase',
  last_four               TEXT,
  currency                TEXT NOT NULL DEFAULT 'USD',
  current_balance_cents   INTEGER NOT NULL DEFAULT 0,
  available_balance_cents INTEGER NOT NULL DEFAULT 0,
  is_active               INTEGER NOT NULL DEFAULT 1,
  synced_at               TEXT,
  UNIQUE (source, external_id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id               TEXT PRIMARY KEY,
  account_id       TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  source           TEXT NOT NULL,
  external_id      TEXT,
  posted_at        TEXT NOT NULL,
  amount_cents     INTEGER NOT NULL,
  description      TEXT NOT NULL,
  merchant         TEXT,
  category         TEXT NOT NULL DEFAULT 'Other',
  category_source  TEXT NOT NULL DEFAULT 'rule',
  pending          INTEGER NOT NULL DEFAULT 0,
  notes            TEXT,
  recurring_group  TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_txn_account_date ON transactions(account_id, posted_at);
CREATE INDEX IF NOT EXISTS idx_txn_date ON transactions(posted_at);
CREATE INDEX IF NOT EXISTS idx_txn_category ON transactions(category);

CREATE TABLE IF NOT EXISTS category_rules (
  id         TEXT PRIMARY KEY,
  pattern    TEXT NOT NULL UNIQUE,
  category   TEXT NOT NULL,
  priority   INTEGER NOT NULL DEFAULT 50,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS goals (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  name         TEXT NOT NULL,
  category     TEXT,
  account_id   TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  target_cents INTEGER NOT NULL,
  -- Savings balance at the moment the goal was created; progress is measured
  -- from here so a new goal starts at 0% instead of inheriting the balance.
  start_cents  INTEGER NOT NULL DEFAULT 0,
  target_date  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS balance_snapshots (
  id           TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date         TEXT NOT NULL,
  balance_cents INTEGER NOT NULL,
  UNIQUE (account_id, date)
);

-- User-defined recurring payments / income on a custom interval.
CREATE TABLE IF NOT EXISTS scheduled_payments (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  amount_cents       INTEGER NOT NULL,          -- signed: negative = out, positive = in
  category           TEXT NOT NULL DEFAULT 'Other',
  interval_count     INTEGER NOT NULL DEFAULT 1,
  interval_unit      TEXT NOT NULL DEFAULT 'month',   -- day | week | month | year
  start_date         TEXT NOT NULL,
  end_date           TEXT,
  autopay_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  notes              TEXT,
  active             INTEGER NOT NULL DEFAULT 1,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Envelope-style split of the current balance across expense buckets.
CREATE TABLE IF NOT EXISTS allocations (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  category    TEXT,                        -- optional link for spent-vs-allocated tracking
  amount_cents INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sim_state (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  seed        INTEGER NOT NULL,
  started_on  TEXT NOT NULL,
  last_run_on TEXT NOT NULL
);
