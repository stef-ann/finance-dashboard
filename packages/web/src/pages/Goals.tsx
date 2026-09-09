import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Goal } from "../types.ts";
import { api } from "../api.ts";
import { useAccounts, useCategories, useGoals } from "../queries.ts";
import { money, pct, dateLabel } from "../lib/format.ts";
import { Button, Card, CardTitle, ProgressBar, Spinner } from "../components/ui.tsx";
import { categoryColor } from "../types.ts";

function monthsUntil(dateISO: string | null): number | null {
  if (!dateISO) return null;
  const [y, m] = dateISO.split("-").map(Number);
  const target = new Date(y!, (m ?? 1) - 1, 1);
  const now = new Date();
  return Math.max(0, (target.getFullYear() - now.getFullYear()) * 12 + target.getMonth() - now.getMonth());
}

function GoalRow({ goal }: { goal: Goal }) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: () => api.deleteGoal(goal.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals"] }),
  });

  const isSavings = goal.type === "savings";
  const progress = pct(goal.currentCents, goal.targetCents);
  const remaining = Math.max(0, goal.targetCents - goal.currentCents);
  const months = monthsUntil(goal.targetDate);
  const color = isSavings ? "var(--positive)" : progress >= 100 ? "var(--negative)" : categoryColor(goal.category ?? "Other");

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{goal.name}</div>
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            {isSavings
              ? goal.accountId
                ? "Savings goal · linked account"
                : "Savings goal · growth in savings since created"
              : `Spending cap · ${goal.category}`}
            {goal.targetDate ? ` · by ${dateLabel(goal.targetDate)}` : ""}
          </div>
        </div>
        <button
          onClick={() => del.mutate()}
          className="text-xs"
          style={{ color: "var(--muted)" }}
          title="Delete goal"
        >
          ✕
        </button>
      </div>

      <div className="mt-3 flex items-baseline justify-between text-sm">
        <span className="font-semibold tnum">{money(goal.currentCents)}</span>
        <span className="tnum" style={{ color: "var(--muted)" }}>
          {isSavings ? "of" : "cap"} {money(goal.targetCents)}
        </span>
      </div>
      <div className="mt-1.5">
        <ProgressBar value={progress} color={color} />
      </div>

      <div className="mt-2 text-xs tnum" style={{ color: "var(--muted)" }}>
        {isSavings ? (
          <>
            {money(remaining)} to go
            {months != null && months > 0 && ` · ${money(Math.ceil(remaining / months))}/mo to hit target`}
            {months === 0 && " · target month reached"}
          </>
        ) : progress >= 100 ? (
          <span style={{ color: "var(--negative)" }}>Over by {money(goal.currentCents - goal.targetCents)} this month</span>
        ) : (
          `${money(remaining)} left this month`
        )}
      </div>
    </Card>
  );
}

function NewGoalForm() {
  const qc = useQueryClient();
  const accounts = useAccounts();
  const categories = useCategories();
  const [type, setType] = useState<"savings" | "spending_cap">("savings");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Dining");
  const [accountId, setAccountId] = useState("");
  const [targetDate, setTargetDate] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api.createGoal({
        type,
        name: name.trim() || (type === "savings" ? "Savings goal" : `${category} cap`),
        targetCents: Math.round(parseFloat(amount || "0") * 100),
        category: type === "spending_cap" ? category : null,
        accountId: type === "savings" && accountId ? accountId : null,
        targetDate: type === "savings" && targetDate ? targetDate : null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      setName("");
      setAmount("");
    },
  });

  const expenseCats = (categories.data ?? []).filter((c) => c.kind === "expense");

  return (
    <Card>
      <CardTitle>New goal</CardTitle>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (amount) create.mutate();
        }}
      >
        <label className="text-sm">
          <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
            className="w-full rounded-md border bg-transparent px-2 py-1.5"
            style={{ borderColor: "var(--border)" }}
          >
            <option value="savings">Savings target</option>
            <option value="spending_cap">Monthly spending cap</option>
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={type === "savings" ? "Emergency fund" : "Dining out"}
            className="w-full rounded-md border bg-transparent px-2 py-1.5"
            style={{ borderColor: "var(--border)" }}
          />
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>
            {type === "savings" ? "Target amount ($)" : "Monthly limit ($)"}
          </span>
          <input
            type="number"
            min="0"
            step="10"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            className="w-full rounded-md border bg-transparent px-2 py-1.5 tnum"
            style={{ borderColor: "var(--border)" }}
          />
        </label>

        {type === "spending_cap" ? (
          <label className="text-sm">
            <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Category</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-md border bg-transparent px-2 py-1.5"
              style={{ borderColor: "var(--border)" }}
            >
              {expenseCats.map((c) => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          </label>
        ) : (
          <label className="text-sm">
            <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Track account (optional)</span>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full rounded-md border bg-transparent px-2 py-1.5"
              style={{ borderColor: "var(--border)" }}
            >
              <option value="">All savings accounts</option>
              {(accounts.data ?? [])
                .filter((a) => a.type === "savings")
                .map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
            </select>
          </label>
        )}

        {type === "savings" && (
          <label className="text-sm">
            <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Target date (optional)</span>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="w-full rounded-md border bg-transparent px-2 py-1.5"
              style={{ borderColor: "var(--border)" }}
            />
          </label>
        )}

        <div className="sm:col-span-2">
          <Button type="submit" disabled={create.isPending || !amount}>
            {create.isPending ? "Adding…" : "Add goal"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function GoalsPage() {
  const goals = useGoals();

  if (goals.isLoading) return <Spinner />;

  const savings = (goals.data ?? []).filter((g) => g.type === "savings");
  const caps = (goals.data ?? []).filter((g) => g.type === "spending_cap");

  return (
    <div className="flex flex-col gap-6">
      <NewGoalForm />

      {savings.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold" style={{ color: "var(--muted)" }}>Savings goals</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {savings.map((g) => (
              <GoalRow key={g.id} goal={g} />
            ))}
          </div>
        </section>
      )}

      {caps.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold" style={{ color: "var(--muted)" }}>Spending caps</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {caps.map((g) => (
              <GoalRow key={g.id} goal={g} />
            ))}
          </div>
        </section>
      )}

      {(goals.data ?? []).length === 0 && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No goals yet. Add a savings target or a monthly spending cap above.
        </p>
      )}
    </div>
  );
}
