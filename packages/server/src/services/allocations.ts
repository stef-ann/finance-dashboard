import { db, id } from "../db.ts";
import { currentMonth, lastMonths, monthRange } from "../lib/dates.ts";
import { categoryColor } from "../shared.ts";
import type { Allocation, AllocationBasis, AllocationPlan } from "../shared.ts";
import { scopeClause } from "./scope.ts";
import { getSettings } from "./settings.ts";
import { totalBalances } from "./summary.ts";

interface AllocationRow {
  id: string;
  name: string;
  category: string | null;
  amount_cents: number;
  sort_order: number;
  created_at: string;
}

const BASIS_LABELS: Record<AllocationBasis, string> = {
  checking: "Checking balance",
  spendable: "Spendable (checking + savings)",
  total: "Total balance",
  budget: "Monthly budget",
};

function basisBalanceCents(basis: AllocationBasis): number {
  if (basis === "budget") return getSettings().monthlyBudgetCents;
  const { total, spendable, checking } = totalBalances();
  if (basis === "checking") return checking;
  if (basis === "total") return total;
  return spendable;
}

/** Spend per category for the current month, respecting the active data mode. */
function monthCategorySpend(): Map<string, number> {
  const { start, end } = monthRange(currentMonth());
  const scope = scopeClause("a.source");
  const rows = db
    .prepare(
      `SELECT t.category AS category, SUM(-t.amount_cents) AS spent
         FROM transactions t JOIN accounts a ON a.id = t.account_id
        WHERE ${scope.sql} AND t.amount_cents < 0 AND t.category NOT IN ('Transfer')
          AND t.posted_at BETWEEN ? AND ?
        GROUP BY t.category`,
    )
    .all(...scope.params, start, end) as { category: string; spent: number }[];
  return new Map(rows.map((r) => [r.category, r.spent]));
}

function hydrate(row: AllocationRow, spendByCat: Map<string, number>): Allocation {
  const spentCents = row.category ? spendByCat.get(row.category) ?? 0 : 0;
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    color: row.category ? categoryColor(row.category) : "#94a3b8",
    amountCents: row.amount_cents,
    spentCents,
    remainingCents: row.amount_cents - spentCents,
    sortOrder: row.sort_order,
  };
}

export function getPlan(): AllocationPlan {
  const basis = getSettings().allocationBasis;
  const spendByCat = monthCategorySpend();
  const rows = db
    .prepare("SELECT * FROM allocations ORDER BY sort_order ASC, created_at ASC")
    .all() as AllocationRow[];
  const allocations = rows.map((r) => hydrate(r, spendByCat));

  const basisBalance = basisBalanceCents(basis);
  const allocatedCents = allocations.reduce((s, a) => s + a.amountCents, 0);
  const totalSpentCents = allocations.reduce((s, a) => s + a.spentCents, 0);

  return {
    basis,
    basisLabel: BASIS_LABELS[basis],
    basisBalanceCents: basisBalance,
    allocatedCents,
    unallocatedCents: basisBalance - allocatedCents,
    overAllocated: allocatedCents > basisBalance,
    totalSpentCents,
    allocations,
  };
}

function nextSortOrder(): number {
  const row = db.prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM allocations").get() as { m: number };
  return row.m + 1;
}

export function createAllocation(input: { name: string; category?: string | null; amountCents: number }): Allocation {
  const rowId = id();
  db.prepare(
    "INSERT INTO allocations (id, name, category, amount_cents, sort_order) VALUES (?, ?, ?, ?, ?)",
  ).run(rowId, input.name.trim(), input.category ?? null, Math.max(0, Math.round(input.amountCents)), nextSortOrder());
  return hydrate(db.prepare("SELECT * FROM allocations WHERE id = ?").get(rowId) as AllocationRow, monthCategorySpend());
}

export function updateAllocation(
  allocId: string,
  patch: Partial<{ name: string; category: string | null; amountCents: number; sortOrder: number }>,
): Allocation | null {
  const existing = db.prepare("SELECT * FROM allocations WHERE id = ?").get(allocId) as AllocationRow | undefined;
  if (!existing) return null;
  db.prepare(
    "UPDATE allocations SET name = ?, category = ?, amount_cents = ?, sort_order = ? WHERE id = ?",
  ).run(
    patch.name?.trim() ?? existing.name,
    patch.category !== undefined ? patch.category : existing.category,
    patch.amountCents !== undefined ? Math.max(0, Math.round(patch.amountCents)) : existing.amount_cents,
    patch.sortOrder ?? existing.sort_order,
    allocId,
  );
  return hydrate(db.prepare("SELECT * FROM allocations WHERE id = ?").get(allocId) as AllocationRow, monthCategorySpend());
}

export function deleteAllocation(allocId: string): boolean {
  return db.prepare("DELETE FROM allocations WHERE id = ?").run(allocId).changes > 0;
}

export function clearAllocations(): void {
  db.prepare("DELETE FROM allocations").run();
}

/**
 * Replace the plan with one bucket per category, each set to that category's
 * average monthly spend over the last `months` complete months.
 */
export function autoAllocateFromHistory(months = 3): AllocationPlan {
  const monthsList = lastMonths(currentMonth(), months + 1).slice(0, months); // exclude the current partial month
  const scope = scopeClause("a.source");
  const totals = new Map<string, number>();
  for (const m of monthsList) {
    const { start, end } = monthRange(m);
    const rows = db
      .prepare(
        `SELECT t.category AS category, SUM(-t.amount_cents) AS spent
           FROM transactions t JOIN accounts a ON a.id = t.account_id
          WHERE ${scope.sql} AND t.amount_cents < 0 AND t.category NOT IN ('Transfer', 'Income')
            AND t.posted_at BETWEEN ? AND ?
          GROUP BY t.category`,
      )
      .all(...scope.params, start, end) as { category: string; spent: number }[];
    for (const r of rows) totals.set(r.category, (totals.get(r.category) ?? 0) + r.spent);
  }

  const tx = db.transaction(() => {
    db.prepare("DELETE FROM allocations").run();
    const insert = db.prepare(
      "INSERT INTO allocations (id, name, category, amount_cents, sort_order) VALUES (?, ?, ?, ?, ?)",
    );
    [...totals.entries()]
      .map(([category, sum]) => ({ category, avg: Math.round(sum / monthsList.length) }))
      .filter((e) => e.avg > 0)
      .sort((a, b) => b.avg - a.avg)
      .forEach((e, i) => insert.run(id(), e.category, e.category, e.avg, i));
  });
  tx();

  return getPlan();
}

export function distributeEvenly(): AllocationPlan {
  const rows = db.prepare("SELECT id FROM allocations").all() as { id: string }[];
  if (rows.length === 0) return getPlan();
  const basis = basisBalanceCents(getSettings().allocationBasis);
  const each = Math.floor(basis / rows.length / 100) * 100;
  const update = db.prepare("UPDATE allocations SET amount_cents = ? WHERE id = ?");
  const tx = db.transaction(() => {
    for (const r of rows) update.run(Math.max(0, each), r.id);
  });
  tx();
  return getPlan();
}
