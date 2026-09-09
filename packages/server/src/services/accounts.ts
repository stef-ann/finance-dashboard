import { db, id } from "../db.ts";
import type { Account, AccountType, DataSource } from "../shared.ts";
import { scopeClause } from "./scope.ts";

interface AccountRow {
  id: string;
  source: string;
  name: string;
  type: string;
  institution_name: string;
  last_four: string | null;
  currency: string;
  current_balance_cents: number;
  available_balance_cents: number;
  synced_at: string | null;
}

function toAccount(r: AccountRow): Account {
  return {
    id: r.id,
    source: r.source as DataSource,
    name: r.name,
    type: r.type as Account["type"],
    institutionName: r.institution_name,
    lastFour: r.last_four,
    currency: r.currency,
    currentBalanceCents: r.current_balance_cents,
    availableBalanceCents: r.available_balance_cents,
    syncedAt: r.synced_at,
  };
}

export function listAccounts(): Account[] {
  const scope = scopeClause("source");
  const rows = db
    .prepare(
      `SELECT * FROM accounts WHERE ${scope.sql} AND is_active = 1
        ORDER BY CASE type WHEN 'checking' THEN 0 WHEN 'savings' THEN 1 WHEN 'credit_card' THEN 2 ELSE 3 END, name`,
    )
    .all(...scope.params) as AccountRow[];
  return rows.map(toAccount);
}

/** Every CSV-imported account, regardless of the current mode (for the import UI). */
export function listImportedAccounts(): Account[] {
  const rows = db
    .prepare("SELECT * FROM accounts WHERE source = 'csv' AND is_active = 1 ORDER BY name")
    .all() as AccountRow[];
  return rows.map(toAccount);
}

export function createManualAccount(input: { name: string; type: AccountType; institutionName?: string }): Account {
  const rowId = id();
  db.prepare(
    `INSERT INTO accounts (id, source, external_id, name, type, institution_name, currency, current_balance_cents, available_balance_cents)
     VALUES (?, 'csv', ?, ?, ?, ?, 'USD', 0, 0)`,
  ).run(rowId, `csv-${rowId}`, input.name.trim(), input.type, (input.institutionName ?? "Imported").trim());
  return toAccount(db.prepare("SELECT * FROM accounts WHERE id = ?").get(rowId) as AccountRow);
}

export function deleteAccount(accountId: string): boolean {
  const row = db.prepare("SELECT source FROM accounts WHERE id = ?").get(accountId) as { source: string } | undefined;
  if (!row || row.source === "sim") return false; // sim accounts are managed by the generator
  const res = db.prepare("DELETE FROM accounts WHERE id = ?").run(accountId); // cascades to txns + snapshots
  return res.changes > 0;
}

export function balanceHistory(days = 90): { date: string; balanceCents: number }[] {
  // Net worth over time: sum of every account's end-of-day snapshot, carried forward.
  const scope = scopeClause("a.source");
  const rows = db
    .prepare(
      `SELECT s.date AS date, s.account_id AS account_id, s.balance_cents AS balance_cents
         FROM balance_snapshots s JOIN accounts a ON a.id = s.account_id
        WHERE ${scope.sql}
        ORDER BY s.date ASC`,
    )
    .all(...scope.params) as { date: string; account_id: string; balance_cents: number }[];
  if (rows.length === 0) return [];

  const dates = [...new Set(rows.map((r) => r.date))].sort();
  const accounts = [...new Set(rows.map((r) => r.account_id))];
  const byDate = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, new Map());
    byDate.get(r.date)!.set(r.account_id, r.balance_cents);
  }

  // Seed each account with its earliest known balance so the series doesn't
  // ramp up from zero as accounts "appear" on their first transaction day.
  const latestByAcct = new Map<string, number>();
  for (const acct of accounts) {
    const first = rows.find((r) => r.account_id === acct);
    if (first) latestByAcct.set(acct, first.balance_cents);
  }

  const series: { date: string; balanceCents: number }[] = [];
  for (const date of dates) {
    const updates = byDate.get(date)!;
    for (const [acct, bal] of updates) latestByAcct.set(acct, bal);
    let total = 0;
    for (const acct of accounts) total += latestByAcct.get(acct) ?? 0;
    series.push({ date, balanceCents: total });
  }
  return series.slice(-days);
}
