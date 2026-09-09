import { db } from "../db.ts";
import { getSettings } from "./settings.ts";

/**
 * SQL predicate + params selecting the account data sources visible in the
 * current mode:
 *   - simulation -> only the generated 'sim' data
 *   - live       -> everything real: Teller ('teller') and CSV imports ('csv')
 *
 * Usage: `WHERE ${scopeClause("a.source").sql} AND ...` with
 * `.all(...scopeClause("a.source").params, otherParams)`.
 */
export function scopeClause(column = "source"): { sql: string; params: string[] } {
  return getSettings().mode === "live"
    ? { sql: `${column} <> ?`, params: ["sim"] }
    : { sql: `${column} = ?`, params: ["sim"] };
}

export function countImportedAccounts(): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM accounts WHERE source = 'csv'").get() as { n: number }).n;
}

export function hasLiveData(): boolean {
  const row = db.prepare("SELECT COUNT(*) AS n FROM accounts WHERE source IN ('teller','csv')").get() as { n: number };
  return row.n > 0;
}
