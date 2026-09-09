import { useState } from "react";
import { useAccounts, useCategories, useTransactions } from "../queries.ts";
import { Card, Spinner, Button } from "../components/ui.tsx";
import { TransactionsTable } from "../components/TransactionsTable.tsx";
import { currentMonthISO, monthLabel, money } from "../lib/format.ts";

function recentMonths(count = 6): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < count; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

export function TransactionsPage() {
  const [month, setMonth] = useState<string>(currentMonthISO());
  const [category, setCategory] = useState("");
  const [accountId, setAccountId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const accounts = useAccounts();
  const categories = useCategories();
  const txns = useTransactions({
    month: month || undefined,
    category: category || undefined,
    accountId: accountId || undefined,
    search: search || undefined,
    limit: pageSize,
    offset: page * pageSize,
  });

  const total = txns.data?.total ?? 0;
  const rows = txns.data?.transactions ?? [];
  const inflow = rows.filter((t) => t.amountCents > 0).reduce((s, t) => s + t.amountCents, 0);
  const outflow = rows.filter((t) => t.amountCents < 0).reduce((s, t) => s + t.amountCents, 0);

  const reset = () => {
    setPage(0);
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm">
            <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Month</span>
            <select
              value={month}
              onChange={(e) => { setMonth(e.target.value); reset(); }}
              className="w-full rounded-md border bg-transparent px-2 py-1.5"
              style={{ borderColor: "var(--border)" }}
            >
              <option value="">All time</option>
              {recentMonths(12).map((m) => (
                <option key={m} value={m}>{monthLabel(m, true)}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Category</span>
            <select
              value={category}
              onChange={(e) => { setCategory(e.target.value); reset(); }}
              className="w-full rounded-md border bg-transparent px-2 py-1.5"
              style={{ borderColor: "var(--border)" }}
            >
              <option value="">All categories</option>
              {(categories.data ?? []).map((c) => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Account</span>
            <select
              value={accountId}
              onChange={(e) => { setAccountId(e.target.value); reset(); }}
              className="w-full rounded-md border bg-transparent px-2 py-1.5"
              style={{ borderColor: "var(--border)" }}
            >
              <option value="">All accounts</option>
              {(accounts.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Search</span>
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); reset(); }}
              placeholder="Merchant or description"
              className="w-full rounded-md border bg-transparent px-2 py-1.5"
              style={{ borderColor: "var(--border)" }}
            />
          </label>
        </div>
      </Card>

      <Card>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs" style={{ color: "var(--muted)" }}>
          <span>
            {total} transaction{total === 1 ? "" : "s"} · showing {rows.length}
          </span>
          <span className="tnum">
            in {money(inflow)} · out {money(outflow)}
          </span>
        </div>
        {txns.isLoading ? (
          <Spinner />
        ) : (
          <TransactionsTable transactions={rows} accounts={accounts.data ?? []} />
        )}
        {total > pageSize && (
          <div className="mt-3 flex items-center justify-between">
            <Button variant="ghost" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              ← Newer
            </Button>
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              Page {page + 1} of {Math.ceil(total / pageSize)}
            </span>
            <Button
              variant="ghost"
              disabled={(page + 1) * pageSize >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Older →
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
