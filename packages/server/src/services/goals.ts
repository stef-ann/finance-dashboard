import { db, id } from "../db.ts";
import { currentMonth, monthRange } from "../lib/dates.ts";
import type { Goal, GoalType } from "../shared.ts";
import { scopeClause } from "./scope.ts";

interface GoalRow {
  id: string;
  type: string;
  name: string;
  category: string | null;
  account_id: string | null;
  target_cents: number;
  start_cents: number;
  target_date: string | null;
  created_at: string;
}

/** Current savings balance backing a goal: linked account, or all savings accounts in scope. */
function savingsBalanceCents(accountId: string | null): number {
  if (accountId) {
    const row = db.prepare("SELECT current_balance_cents FROM accounts WHERE id = ?").get(accountId) as
      | { current_balance_cents: number }
      | undefined;
    return row?.current_balance_cents ?? 0;
  }
  const scope = scopeClause("source");
  const row = db
    .prepare(`SELECT COALESCE(SUM(current_balance_cents), 0) AS total FROM accounts WHERE ${scope.sql} AND type = 'savings'`)
    .get(...scope.params) as { total: number };
  return row.total;
}

/** Spending-cap progress = amount spent in the category this month. */
function capProgressCents(category: string | null): number {
  if (!category) return 0;
  const { start, end } = monthRange(currentMonth());
  const scope = scopeClause("a.source");
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(-amount_cents), 0) AS spent
         FROM transactions t JOIN accounts a ON a.id = t.account_id
        WHERE ${scope.sql} AND t.category = ? AND t.amount_cents < 0
          AND t.posted_at BETWEEN ? AND ?`,
    )
    .get(...scope.params, category, start, end) as { spent: number };
  return row.spent;
}

function hydrate(row: GoalRow): Goal {
  const type = row.type as GoalType;
  const currentCents =
    type === "savings"
      ? Math.max(0, savingsBalanceCents(row.account_id) - row.start_cents)
      : capProgressCents(row.category);
  return {
    id: row.id,
    type,
    name: row.name,
    category: row.category,
    accountId: row.account_id,
    targetCents: row.target_cents,
    currentCents,
    targetDate: row.target_date,
    createdAt: row.created_at,
  };
}

export function listGoals(): Goal[] {
  const rows = db.prepare("SELECT * FROM goals ORDER BY type, created_at").all() as GoalRow[];
  return rows.map(hydrate);
}

export function createGoal(input: {
  type: GoalType;
  name: string;
  targetCents: number;
  category?: string | null;
  accountId?: string | null;
  targetDate?: string | null;
}): Goal {
  const rowId = id();
  const startCents = input.type === "savings" ? savingsBalanceCents(input.accountId ?? null) : 0;
  db.prepare(
    `INSERT INTO goals (id, type, name, category, account_id, target_cents, start_cents, target_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    rowId,
    input.type,
    input.name,
    input.category ?? null,
    input.accountId ?? null,
    Math.max(0, Math.round(input.targetCents)),
    startCents,
    input.targetDate ?? null,
  );
  return hydrate(db.prepare("SELECT * FROM goals WHERE id = ?").get(rowId) as GoalRow);
}

export function updateGoal(
  goalId: string,
  patch: Partial<{ name: string; targetCents: number; category: string | null; accountId: string | null; targetDate: string | null }>,
): Goal | null {
  const existing = db.prepare("SELECT * FROM goals WHERE id = ?").get(goalId) as GoalRow | undefined;
  if (!existing) return null;
  db.prepare(
    `UPDATE goals SET name = ?, target_cents = ?, category = ?, account_id = ?, target_date = ? WHERE id = ?`,
  ).run(
    patch.name ?? existing.name,
    patch.targetCents !== undefined ? Math.max(0, Math.round(patch.targetCents)) : existing.target_cents,
    patch.category !== undefined ? patch.category : existing.category,
    patch.accountId !== undefined ? patch.accountId : existing.account_id,
    patch.targetDate !== undefined ? patch.targetDate : existing.target_date,
    goalId,
  );
  return hydrate(db.prepare("SELECT * FROM goals WHERE id = ?").get(goalId) as GoalRow);
}

export function deleteGoal(goalId: string): boolean {
  const res = db.prepare("DELETE FROM goals WHERE id = ?").run(goalId);
  return res.changes > 0;
}
