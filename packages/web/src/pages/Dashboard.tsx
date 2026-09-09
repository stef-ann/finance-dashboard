import { Link } from "react-router-dom";
import { useAccounts, useBalanceHistory, useSummary, useTransactions } from "../queries.ts";
import { money } from "../lib/format.ts";
import { Card, CardTitle, StatTile, Spinner } from "../components/ui.tsx";
import { AccountsStrip } from "../components/AccountsStrip.tsx";
import { SafeToSpend } from "../components/SafeToSpend.tsx";
import { BalanceArea, SpendingDonut, TrendChart } from "../components/charts.tsx";
import { RecurringList } from "../components/RecurringList.tsx";
import { TransactionsTable } from "../components/TransactionsTable.tsx";
import { ConnectNudge } from "../components/ConnectNudge.tsx";
import { AllocationsCard } from "../components/AllocationsCard.tsx";

export function Dashboard() {
  const summary = useSummary();
  const accounts = useAccounts();
  const history = useBalanceHistory(120);
  const recent = useTransactions({ limit: 8 });

  if (summary.isLoading || accounts.isLoading) {
    return <Spinner label="Loading your dashboard…" />;
  }
  if (summary.isError || !summary.data) {
    return <p className="text-sm" style={{ color: "var(--negative)" }}>Couldn’t load the dashboard. Is the API running?</p>;
  }

  const s = summary.data;
  const net = s.netThisMonthCents;

  return (
    <div className="flex flex-col gap-6">
      <ConnectNudge />
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Total balance"
          value={money(s.totalBalanceCents)}
          sub={`${accounts.data?.length ?? 0} account${(accounts.data?.length ?? 0) === 1 ? "" : "s"}`}
        />
        <StatTile
          label="Income this month"
          value={money(s.incomeThisMonthCents)}
          tone="positive"
        />
        <StatTile
          label="Spending this month"
          value={money(s.spendingThisMonthCents)}
          tone="negative"
          sub={`${money(s.monthlyBudgetCents, { cents: false })} budget`}
        />
        <StatTile
          label="Net this month"
          value={money(net, { sign: true })}
          tone={net >= 0 ? "positive" : "negative"}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <SafeToSpend summary={s} />
        </div>
        <Card className="lg:col-span-2">
          <CardTitle>Net worth trend</CardTitle>
          {history.isLoading ? <Spinner /> : <BalanceArea data={history.data ?? []} />}
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold" style={{ color: "var(--muted)" }}>
          Accounts
        </h2>
        <AccountsStrip accounts={accounts.data ?? []} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>Spending by category</CardTitle>
          <SpendingDonut data={s.byCategory} />
        </Card>
        <Card>
          <CardTitle>Income vs spending</CardTitle>
          <TrendChart data={s.trend} />
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <AllocationsCard />
        <Card>
          <CardTitle>Recurring & scheduled</CardTitle>
          <RecurringList items={s.recurring} />
        </Card>
      </section>

      <section>
        <Card>
          <CardTitle
            action={
              <Link to="/transactions" className="text-xs font-medium" style={{ color: "var(--accent)" }}>
                View all →
              </Link>
            }
          >
            Recent transactions
          </CardTitle>
          {recent.isLoading ? (
            <Spinner />
          ) : (
            <TransactionsTable transactions={recent.data?.transactions ?? []} accounts={accounts.data ?? []} compact />
          )}
        </Card>
      </section>
    </div>
  );
}
