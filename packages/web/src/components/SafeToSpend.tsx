import type { Summary } from "../types.ts";
import { money } from "../lib/format.ts";
import { Card, ProgressBar } from "./ui.tsx";

export function SafeToSpend({ summary }: { summary: Summary }) {
  const { safeToSpendCents, checkingBalanceCents, upcomingRecurringCents, budgetRemainingCents, daysLeftInMonth } =
    summary;
  const perDay = daysLeftInMonth > 0 ? Math.max(0, Math.round(safeToSpendCents / daysLeftInMonth)) : safeToSpendCents;
  const tone = safeToSpendCents < 0 ? "var(--negative)" : "var(--positive)";

  const rows: { label: string; value: number }[] = [
    { label: "Checking balance", value: checkingBalanceCents },
    { label: "Recurring & scheduled still due", value: -upcomingRecurringCents },
  ];

  return (
    <Card>
      <div className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>
        Safe to spend · rest of month
      </div>
      <div className="mt-1 text-3xl font-semibold tnum" style={{ color: tone }}>
        {money(safeToSpendCents)}
      </div>
      <div className="mt-1 text-xs tnum" style={{ color: "var(--muted)" }}>
        ≈ {money(perDay)}/day for {daysLeftInMonth} more day{daysLeftInMonth === 1 ? "" : "s"}
      </div>

      <div className="mt-4 space-y-1.5 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between">
            <span style={{ color: "var(--muted)" }}>{r.label}</span>
            <span className="tnum">{money(r.value)}</span>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <div className="mb-1 flex justify-between text-xs" style={{ color: "var(--muted)" }}>
          <span>Budget used this month</span>
          <span className="tnum">
            {money(summary.spendingThisMonthCents, { cents: false })} / {money(summary.monthlyBudgetCents, { cents: false })}
          </span>
        </div>
        <ProgressBar
          value={(summary.spendingThisMonthCents / Math.max(1, summary.monthlyBudgetCents)) * 100}
          color={summary.spendingThisMonthCents > summary.monthlyBudgetCents ? "var(--negative)" : "var(--accent)"}
        />
        <div className="mt-1 text-xs tnum" style={{ color: "var(--muted)" }}>
          {budgetRemainingCents > 0 ? `${money(budgetRemainingCents)} left in budget` : "Budget exceeded"}
        </div>
      </div>
    </Card>
  );
}
