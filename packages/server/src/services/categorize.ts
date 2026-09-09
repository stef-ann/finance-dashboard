import { db } from "../db.ts";
import type { CategoryRule } from "../shared.ts";

interface RuleRow {
  id: string;
  pattern: string;
  category: string;
  priority: number;
  created_at: string;
}

function loadRules(): RuleRow[] {
  return db
    .prepare("SELECT * FROM category_rules ORDER BY priority ASC, length(pattern) DESC")
    .all() as RuleRow[];
}

/**
 * Pick a category from the rule set. `amountCents` is used as a tie-breaker:
 * unmatched inflows default to Income, unmatched outflows to Other.
 */
export function categorize(
  text: string,
  amountCents: number,
  rules: RuleRow[] = loadRules(),
): { category: string; matched: boolean } {
  const haystack = text.toLowerCase();
  for (const r of rules) {
    if (haystack.includes(r.pattern)) return { category: r.category, matched: true };
  }
  return { category: amountCents > 0 ? "Income" : "Other", matched: false };
}

/** Re-run categorization over every transaction that was not set manually. */
export function recategorizeAll(): number {
  const rules = loadRules();
  const rows = db
    .prepare("SELECT id, description, merchant, amount_cents FROM transactions WHERE category_source != 'manual'")
    .all() as { id: string; description: string; merchant: string | null; amount_cents: number }[];
  const update = db.prepare("UPDATE transactions SET category = ?, category_source = 'rule' WHERE id = ?");
  let changed = 0;
  const tx = db.transaction(() => {
    for (const row of rows) {
      const text = `${row.description} ${row.merchant ?? ""}`;
      const { category } = categorize(text, row.amount_cents, rules);
      update.run(category, row.id);
      changed++;
    }
  });
  tx();
  return changed;
}

export function listRules(): CategoryRule[] {
  return loadRules().map((r) => ({
    id: r.id,
    pattern: r.pattern,
    category: r.category,
    priority: r.priority,
    createdAt: r.created_at,
  }));
}
