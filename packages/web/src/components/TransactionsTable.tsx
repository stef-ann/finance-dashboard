import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Account, Transaction } from "../types.ts";
import { api } from "../api.ts";
import { CATEGORIES, categoryColor } from "../types.ts";
import { money, dateLabel } from "../lib/format.ts";
import { Pill } from "./ui.tsx";

export function TransactionsTable({
  transactions,
  accounts,
  compact = false,
}: {
  transactions: Transaction[];
  accounts: Account[];
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const acctName = new Map(accounts.map((a) => [a.id, a.name]));

  const recategorize = useMutation({
    mutationFn: ({ id, category }: { id: string; category: string }) => api.updateTransaction(id, { category }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["goals"] });
    },
  });

  if (transactions.length === 0) {
    return (
      <p className="py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
        No transactions match.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            <th className="py-2 pr-3 font-medium">Date</th>
            <th className="py-2 pr-3 font-medium">Description</th>
            {!compact && <th className="py-2 pr-3 font-medium">Account</th>}
            <th className="py-2 pr-3 font-medium">Category</th>
            <th className="py-2 pl-3 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr key={t.id} className="border-t" style={{ borderColor: "var(--border)" }}>
              <td className="whitespace-nowrap py-2 pr-3 tnum" style={{ color: "var(--muted)" }}>
                {dateLabel(t.postedAt)}
              </td>
              <td className="py-2 pr-3">
                <div className="flex items-center gap-2">
                  <span className="max-w-[22ch] truncate sm:max-w-none">{t.merchant ?? t.description}</span>
                  {t.pending && <Pill>pending</Pill>}
                  {t.recurringGroup && <Pill color="var(--accent)">recurring</Pill>}
                </div>
              </td>
              {!compact && (
                <td className="whitespace-nowrap py-2 pr-3 text-xs" style={{ color: "var(--muted)" }}>
                  {acctName.get(t.accountId) ?? "—"}
                </td>
              )}
              <td className="py-2 pr-3">
                <select
                  value={t.category}
                  onChange={(e) => recategorize.mutate({ id: t.id, category: e.target.value })}
                  className="rounded-md border bg-transparent px-1.5 py-1 text-xs"
                  style={{ borderColor: "var(--border)", color: categoryColor(t.category) }}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.name} value={c.name} style={{ color: "var(--text)" }}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </td>
              <td
                className="py-2 pl-3 text-right font-medium tnum"
                style={{ color: t.amountCents > 0 ? "var(--positive)" : "var(--text)" }}
              >
                {money(t.amountCents, { sign: true })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
