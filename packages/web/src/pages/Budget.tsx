import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Allocation, AllocationBasis, AllocationPlan } from "../types.ts";
import { api } from "../api.ts";
import { useAllocations, useCategories } from "../queries.ts";
import { Button, Card, CardTitle, ProgressBar, Spinner } from "../components/ui.tsx";
import { money, pct } from "../lib/format.ts";

const BASIS_OPTIONS: { value: AllocationBasis; label: string }[] = [
  { value: "checking", label: "Checking balance" },
  { value: "spendable", label: "Checking + savings" },
  { value: "total", label: "Total balance" },
  { value: "budget", label: "Monthly budget" },
];

/** Segmented bar: one slice per allocation, plus the unallocated remainder. */
function SplitBar({ plan }: { plan: AllocationPlan }) {
  const pool = Math.max(plan.basisBalanceCents, plan.allocatedCents, 1);
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
      {plan.allocations.map((a) => (
        <div
          key={a.id}
          style={{ width: `${(a.amountCents / pool) * 100}%`, background: a.color }}
          title={`${a.name}: ${money(a.amountCents)}`}
        />
      ))}
      {plan.unallocatedCents > 0 && (
        <div style={{ width: `${(plan.unallocatedCents / pool) * 100}%`, background: "transparent" }} />
      )}
    </div>
  );
}

function AllocationRow({ alloc }: { alloc: Allocation }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState(String(Math.round(alloc.amountCents / 100)));
  useEffect(() => setAmount(String(Math.round(alloc.amountCents / 100))), [alloc.amountCents]);

  const save = useMutation({
    mutationFn: (patch: { amountCents?: number; category?: string | null }) => api.updateAllocation(alloc.id, patch),
    onSuccess: (plan) => qc.setQueryData(["allocations"], plan),
  });
  const del = useMutation({
    mutationFn: () => api.deleteAllocation(alloc.id),
    onSuccess: (plan) => qc.setQueryData(["allocations"], plan),
  });

  const spentPct = pct(alloc.spentCents, alloc.amountCents);
  const over = alloc.remainingCents < 0;

  return (
    <div className="flex flex-col gap-2 border-t py-3 sm:flex-row sm:items-center" style={{ borderColor: "var(--border)" }}>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: alloc.color }} />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{alloc.name}</div>
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            {alloc.category ? (
              alloc.spentCents > 0 || spentPct > 0 ? (
                <span style={{ color: over ? "var(--negative)" : "var(--muted)" }}>
                  {money(alloc.spentCents)} spent · {over ? `${money(-alloc.remainingCents)} over` : `${money(alloc.remainingCents)} left`}
                </span>
              ) : (
                `tracking ${alloc.category}`
              )
            ) : (
              "set-aside (not tracked)"
            )}
          </div>
        </div>
      </div>

      <div className="w-full sm:w-40">
        <ProgressBar value={spentPct} color={over ? "var(--negative)" : alloc.color} />
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-md border px-2" style={{ borderColor: "var(--border)" }}>
          <span className="text-xs" style={{ color: "var(--muted)" }}>$</span>
          <input
            type="number"
            min="0"
            step="10"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onBlur={() => {
              const cents = Math.round(parseFloat(amount || "0") * 100);
              if (cents !== alloc.amountCents) save.mutate({ amountCents: cents });
            }}
            className="w-20 bg-transparent py-1 text-right text-sm tnum outline-none"
          />
        </div>
        <button onClick={() => del.mutate()} className="text-xs" style={{ color: "var(--muted)" }} title="Remove">
          ✕
        </button>
      </div>
    </div>
  );
}

function AddAllocation() {
  const qc = useQueryClient();
  const categories = useCategories();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api.createAllocation({
        name: name.trim() || category || "Bucket",
        category: category || null,
        amountCents: Math.round(parseFloat(amount || "0") * 100),
      }),
    onSuccess: (plan) => {
      qc.setQueryData(["allocations"], plan);
      setName("");
      setCategory("");
      setAmount("");
    },
  });

  return (
    <form
      className="flex flex-wrap items-end gap-3 border-t pt-4"
      style={{ borderColor: "var(--border)" }}
      onSubmit={(e) => {
        e.preventDefault();
        if (amount) create.mutate();
      }}
    >
      <label className="text-sm">
        <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Rent"
          className="w-36 rounded-md border bg-transparent px-2 py-1.5"
          style={{ borderColor: "var(--border)" }}
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Track category (optional)</span>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-44 rounded-md border bg-transparent px-2 py-1.5"
          style={{ borderColor: "var(--border)" }}
        >
          <option value="">Not tracked</option>
          {(categories.data ?? [])
            .filter((c) => c.kind === "expense")
            .map((c) => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Amount ($)</span>
        <input
          type="number"
          min="0"
          step="10"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          className="w-28 rounded-md border bg-transparent px-2 py-1.5 tnum"
          style={{ borderColor: "var(--border)" }}
        />
      </label>
      <Button type="submit" disabled={create.isPending || !amount}>
        {create.isPending ? "Adding…" : "Add bucket"}
      </Button>
    </form>
  );
}

export function BudgetPage() {
  const plan = useAllocations();
  const qc = useQueryClient();

  const setBasis = useMutation({
    mutationFn: (b: AllocationBasis) => api.setAllocationBasis(b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["allocations"] }),
  });
  const auto = useMutation({
    mutationFn: api.autoAllocate,
    onSuccess: (p) => qc.setQueryData(["allocations"], p),
  });
  const evenly = useMutation({
    mutationFn: api.distributeEvenly,
    onSuccess: (p) => qc.setQueryData(["allocations"], p),
  });
  const clear = useMutation({
    mutationFn: api.clearAllocations,
    onSuccess: (p) => qc.setQueryData(["allocations"], p),
  });

  if (plan.isLoading) return <Spinner />;
  if (plan.isError || !plan.data) {
    return <p className="text-sm" style={{ color: "var(--negative)" }}>Couldn’t load allocations.</p>;
  }

  const p = plan.data;
  const allocatedPct = pct(p.allocatedCents, Math.max(p.basisBalanceCents, 1));

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardTitle
          action={
            <select
              value={p.basis}
              onChange={(e) => setBasis.mutate(e.target.value as AllocationBasis)}
              className="rounded-md border bg-transparent px-2 py-1 text-xs"
              style={{ borderColor: "var(--border)" }}
            >
              {BASIS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          }
        >
          Splitting {p.basisLabel.toLowerCase()}
        </CardTitle>

        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-2xl font-semibold tnum">{money(p.basisBalanceCents)}</div>
          <div className="text-sm tnum" style={{ color: p.overAllocated ? "var(--negative)" : "var(--muted)" }}>
            {money(p.allocatedCents)} allocated ·{" "}
            {p.overAllocated
              ? `${money(-p.unallocatedCents)} over`
              : `${money(p.unallocatedCents)} unallocated`}
          </div>
        </div>

        <div className="mt-3">
          <SplitBar plan={p} />
        </div>
        <div className="mt-1 text-xs tnum" style={{ color: "var(--muted)" }}>
          {allocatedPct}% of the pool assigned · {money(p.totalSpentCents)} spent so far this month
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => auto.mutate()} disabled={auto.isPending}>
            {auto.isPending ? "Working…" : "Auto from last 3 months"}
          </Button>
          <Button variant="ghost" onClick={() => evenly.mutate()} disabled={evenly.isPending || p.allocations.length === 0}>
            Distribute evenly
          </Button>
          {p.allocations.length > 0 && (
            <Button variant="ghost" onClick={() => clear.mutate()} disabled={clear.isPending}>
              Clear all
            </Button>
          )}
        </div>
      </Card>

      <Card>
        <CardTitle>Buckets</CardTitle>
        {p.allocations.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No buckets yet. Add one below, or hit “Auto from last 3 months” to seed them from your spending.
          </p>
        ) : (
          <div>
            {p.allocations.map((a) => (
              <AllocationRow key={a.id} alloc={a} />
            ))}
          </div>
        )}
        <AddAllocation />
      </Card>
    </div>
  );
}
