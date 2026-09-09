import { db } from "../db.ts";
import { addDays, daysBetween, monthRange, todayISO } from "../lib/dates.ts";
import type { RecurringCharge } from "../shared.ts";
import { scopeClause } from "./scope.ts";
import { activeScheduledNames, upcomingScheduledOutflow } from "./scheduled.ts";

/** True when a detected payee is already covered by a user-scheduled payment. */
function coveredBySchedule(merchant: string, scheduledNames: string[]): boolean {
  const m = merchant.toLowerCase();
  return scheduledNames.some((n) => n.length >= 3 && (m.includes(n) || n.includes(m)));
}

interface TxnRow {
  posted_at: string;
  amount_cents: number;
  description: string;
  merchant: string | null;
  category: string;
  recurring_group: string | null;
}

function normalizeKey(t: TxnRow): string {
  if (t.recurring_group) return `grp:${t.recurring_group}`;
  const base = (t.merchant ?? t.description).toLowerCase();
  return base.replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 3).join(" ");
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * Detect recurring outflows: same payee, 3+ hits, on a roughly fixed cadence
 * (weekly / biweekly / monthly). Excludes transfers and income.
 */
export function detectRecurring(): RecurringCharge[] {
  const scope = scopeClause("a.source");
  const rows = db
    .prepare(
      `SELECT t.posted_at, t.amount_cents, t.description, t.merchant, t.category, t.recurring_group
         FROM transactions t JOIN accounts a ON a.id = t.account_id
        WHERE ${scope.sql} AND t.amount_cents < 0 AND t.category NOT IN ('Transfer', 'Income')
        ORDER BY t.posted_at ASC`,
    )
    .all(...scope.params) as TxnRow[];

  const groups = new Map<string, TxnRow[]>();
  for (const r of rows) {
    const key = normalizeKey(r);
    if (!key) continue;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }

  const today = todayISO();
  const scheduledNames = activeScheduledNames();
  const out: RecurringCharge[] = [];

  for (const items of groups.values()) {
    if (items.length < 3) continue;
    const dates = items.map((i) => i.posted_at);
    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i++) gaps.push(daysBetween(dates[i - 1]!, dates[i]!));
    if (gaps.length === 0) continue;
    const cadence = Math.round(median(gaps));

    const isWeekly = cadence >= 6 && cadence <= 8;
    const isBiweekly = cadence >= 12 && cadence <= 16;
    const isMonthly = cadence >= 26 && cadence <= 35;
    if (!isWeekly && !isBiweekly && !isMonthly) continue;

    const grouped = items[0]!.recurring_group != null;
    // Only surface things that genuinely behave like bills/subscriptions:
    // an explicit recurring group, or a monthly charge in a bill-like category.
    const BILL_CATEGORIES = new Set(["Housing", "Utilities", "Subscriptions", "Health", "Entertainment", "Insurance"]);
    if (!grouped && !(isMonthly && BILL_CATEGORIES.has(items.at(-1)!.category))) continue;

    // Must still be active: last seen within ~1.5 cadences.
    const lastSeen = dates[dates.length - 1]!;
    if (daysBetween(lastSeen, today) > cadence * 1.6) continue;

    // A real bill/subscription has a near-constant amount. Frequent but variable
    // spend (groceries, coffee, shopping) has high variance — exclude it.
    const amounts = items.map((i) => Math.abs(i.amount_cents));
    const avg = Math.round(amounts.reduce((s, a) => s + a, 0) / amounts.length);
    const variance = amounts.reduce((s, a) => s + (a - avg) ** 2, 0) / amounts.length;
    const cv = avg > 0 ? Math.sqrt(variance) / avg : 1;
    const isFixedAmount = cv < 0.15 || (items[0]!.recurring_group != null);
    if (!isFixedAmount) continue;

    const payee = items.at(-1)!.merchant ?? items.at(-1)!.description;
    if (coveredBySchedule(payee, scheduledNames)) continue; // user has scheduled this one explicitly

    let next = addDays(lastSeen, cadence);
    while (next < today) next = addDays(next, cadence);

    out.push({
      merchant: payee,
      category: items.at(-1)!.category,
      averageCents: avg,
      cadenceDays: cadence,
      lastSeen,
      nextEstimated: next,
      occurrences: items.length,
    });
  }

  return out.sort((a, b) => b.averageCents - a.averageCents);
}

/**
 * Sum of money still going out between `from` and the end of `month`:
 * detected recurring charges + user-scheduled payments.
 */
export function upcomingRecurringThisMonth(month: string, from = todayISO()): number {
  const { end } = monthRange(month);
  let total = 0;
  for (const r of detectRecurring()) {
    let due = r.nextEstimated;
    while (due <= end) {
      if (due >= from) total += r.averageCents;
      due = addDays(due, r.cadenceDays);
    }
  }
  total += upcomingScheduledOutflow(from, end);
  return total;
}
