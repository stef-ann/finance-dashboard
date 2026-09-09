import type { Account } from "../types.ts";
import { money } from "../lib/format.ts";
import { Card } from "./ui.tsx";

const typeLabel: Record<Account["type"], string> = {
  checking: "Checking",
  savings: "Savings",
  credit_card: "Credit card",
  other: "Account",
};

export function AccountsStrip({ accounts }: { accounts: Account[] }) {
  if (accounts.length === 0) {
    return (
      <Card>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No accounts yet. Run a sync, connect your bank, or import a CSV from Settings.
        </p>
      </Card>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {accounts.map((a) => {
        const isCard = a.type === "credit_card";
        const owed = isCard && a.currentBalanceCents < 0;
        const hasLimitInfo = a.availableBalanceCents !== a.currentBalanceCents;
        return (
          <Card key={a.id}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-semibold">{a.name}</div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>
                  {typeLabel[a.type]} {a.lastFour ? `· ····${a.lastFour}` : ""}
                </div>
              </div>
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                {a.institutionName}
              </span>
            </div>
            <div className="mt-3 text-xl font-semibold tnum" style={{ color: owed ? "var(--negative)" : "var(--text)" }}>
              {money(a.currentBalanceCents)}
            </div>
            <div className="mt-0.5 text-xs tnum" style={{ color: "var(--muted)", minHeight: "1rem" }}>
              {isCard
                ? hasLimitInfo
                  ? `${money(a.availableBalanceCents)} available credit`
                  : ""
                : `${money(a.availableBalanceCents)} available`}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
