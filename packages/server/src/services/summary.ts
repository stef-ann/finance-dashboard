import { db } from "../db.ts";
import { currentMonth, daysInMonthRemaining, lastMonths, monthRange, todayISO } from "../lib/dates.ts";
import { categoryColor } from "../shared.ts";
import type { CategorySpend, MonthlyPoint, Summary } from "../shared.ts";
import { detectRecurring, upcomingRecurringThisMonth } from "./recurring.ts";
import { getSettings } from "./settings.ts";
import { scopeClause } from "./scope.ts";
import { scheduledForecast } from "./scheduled.ts";

export function totalBalances(): { total: number; spendable: number; checking: number } {
  const scope = scopeClause("source");
  const rows = db
    .prepare(
      `SELECT type, current_balance_cents, available_balance_cents
         FROM accounts WHERE ${scope.sql} AND is_active = 1`,
    )
    .all(...scope.params) as { type: string; current_balance_cents: number; available_balance_cents: number }[];
  let total = 0;
  let spendable = 0;
  let checking = 0;
  for (const r of rows) {
    total += r.current_balance_cents;
    if (r.type === "checking" || r.type === "savings" || r.type === "other") {
      spendable += Math.max(0, r.available_balance_cents);
    }
    if (r.type === "checking" || r.type === "other") {
      checking += Math.max(0, r.available_balance_cents);
    }
  }
  return { total, spendable, checking };
}

export function categorySpend(start: string, end: string): CategorySpend[] {
  const scope = scopeClause("a.source");
  const rows = db
    .prepare(
      `SELECT category, SUM(-amount_cents) AS spent, COUNT(*) AS n
         FROM transactions t JOIN accounts a ON a.id = t.account_id
        WHERE ${scope.sql} AND t.amount_cents < 0
          AND t.category NOT IN ('Transfer')
          AND t.posted_at BETWEEN ? AND ?
        GROUP BY category
        ORDER BY spent DESC`,
    )
    .all(...scope.params, start, end) as { category: string; spent: number; n: number }[];
  return rows.map((r) => ({
    category: r.category,
    color: categoryColor(r.category),
    spentCents: r.spent,
    txnCount: r.n,
  }));
}

export function monthlyTrend(month: string, months: number): MonthlyPoint[] {
  const scope = scopeClause("a.source");
  return lastMonths(month, months).map((m) => {
    const { start, end } = monthRange(m);
    const row = db
      .prepare(
        `SELECT
            COALESCE(SUM(CASE WHEN amount_cents > 0 AND category = 'Income' THEN amount_cents END), 0) AS income,
            COALESCE(SUM(CASE WHEN amount_cents < 0 AND category NOT IN ('Transfer') THEN -amount_cents END), 0) AS spending
          FROM transactions t JOIN accounts a ON a.id = t.account_id
         WHERE ${scope.sql} AND t.posted_at BETWEEN ? AND ?`,
      )
      .get(...scope.params, start, end) as { income: number; spending: number };
    return {
      month: m,
      incomeCents: row.income,
      spendingCents: row.spending,
      netCents: row.income - row.spending,
    };
  });
}

export function buildSummary(month = currentMonth()): Summary {
  const settings = getSettings();
  const { start, end } = monthRange(month);

  const { total, spendable, checking } = totalBalances();
  const byCategory = categorySpend(start, end);
  const trend = monthlyTrend(month, 6);
  const thisMonth = trend.find((t) => t.month === month) ?? { incomeCents: 0, spendingCents: 0, netCents: 0, month };

  const budget = settings.monthlyBudgetCents;
  const budgetRemaining = Math.max(0, budget - thisMonth.spendingCents);

  const isCurrent = month === currentMonth();
  const from = isCurrent ? todayISO() : `${month}-01`;
  const upcomingRecurring = isCurrent ? upcomingRecurringThisMonth(month, from) : 0;
  const daysLeft = daysInMonthRemaining(month, from);

  // Safe to spend over the rest of the month: checking cash on hand, minus the
  // recurring bills still due before month end.
  const safeToSpend = isCurrent ? checking - upcomingRecurring : checking;

  return {
    month,
    daysLeftInMonth: daysLeft,
    totalBalanceCents: total,
    spendableBalanceCents: spendable,
    checkingBalanceCents: checking,
    incomeThisMonthCents: thisMonth.incomeCents,
    spendingThisMonthCents: thisMonth.spendingCents,
    netThisMonthCents: thisMonth.netCents,
    monthlyBudgetCents: budget,
    budgetRemainingCents: budgetRemaining,
    safeToSpendCents: safeToSpend,
    upcomingRecurringCents: upcomingRecurring,
    byCategory,
    trend,
    recurring: isCurrent ? detectRecurring() : [],
    scheduled: isCurrent ? scheduledForecast(35) : [],
  };
}
