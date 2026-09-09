import { db } from "../db.ts";
import type { Transaction, DataSource, CategorySource } from "../shared.ts";
import { scopeClause } from "./scope.ts";

interface TxnRow {
  id: string;
  account_id: string;
  source: string;
  posted_at: string;
  amount_cents: number;
  description: string;
  merchant: string | null;
  category: string;
  category_source: string;
  pending: number;
  notes: string | null;
  recurring_group: string | null;
}

function toTxn(r: TxnRow): Transaction {
  return {
    id: r.id,
    accountId: r.account_id,
    source: r.source as DataSource,
    postedAt: r.posted_at,
    amountCents: r.amount_cents,
    description: r.description,
    merchant: r.merchant,
    category: r.category,
    categorySource: r.category_source as CategorySource,
    pending: r.pending === 1,
    notes: r.notes,
    recurringGroup: r.recurring_group,
  };
}

export interface TxnQuery {
  month?: string;
  category?: string;
  accountId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export function listTransactions(q: TxnQuery = {}): { transactions: Transaction[]; total: number } {
  const scope = scopeClause("a.source");
  const where: string[] = [scope.sql.replace("?", "@scopeSource")];
  const params: Record<string, unknown> = { scopeSource: scope.params[0] };

  if (q.month) {
    where.push("substr(t.posted_at, 1, 7) = @month");
    params.month = q.month;
  }
  if (q.category) {
    where.push("t.category = @category");
    params.category = q.category;
  }
  if (q.accountId) {
    where.push("t.account_id = @accountId");
    params.accountId = q.accountId;
  }
  if (q.search) {
    where.push("(lower(t.description) LIKE @search OR lower(t.merchant) LIKE @search)");
    params.search = `%${q.search.toLowerCase()}%`;
  }

  const whereSql = where.join(" AND ");
  const total = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM transactions t JOIN accounts a ON a.id = t.account_id WHERE ${whereSql}`)
      .get(params) as { n: number }
  ).n;

  const limit = Math.min(Math.max(q.limit ?? 100, 1), 500);
  const offset = Math.max(q.offset ?? 0, 0);
  const rows = db
    .prepare(
      `SELECT t.* FROM transactions t JOIN accounts a ON a.id = t.account_id
        WHERE ${whereSql}
        ORDER BY t.posted_at DESC, t.created_at DESC
        LIMIT ${limit} OFFSET ${offset}`,
    )
    .all(params) as TxnRow[];

  return { transactions: rows.map(toTxn), total };
}

export function updateTransaction(
  txnId: string,
  patch: Partial<{ category: string; notes: string | null }>,
): Transaction | null {
  const existing = db.prepare("SELECT * FROM transactions WHERE id = ?").get(txnId) as TxnRow | undefined;
  if (!existing) return null;
  const category = patch.category ?? existing.category;
  const categorySource = patch.category && patch.category !== existing.category ? "manual" : existing.category_source;
  const notes = patch.notes !== undefined ? patch.notes : existing.notes;
  db.prepare("UPDATE transactions SET category = ?, category_source = ?, notes = ? WHERE id = ?").run(
    category,
    categorySource,
    notes,
    txnId,
  );
  return toTxn(db.prepare("SELECT * FROM transactions WHERE id = ?").get(txnId) as TxnRow);
}
