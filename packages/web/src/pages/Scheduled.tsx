import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ScheduledPayment, ScheduleUnit } from "../types.ts";
import { api, type ScheduledInput } from "../api.ts";
import { useAccounts, useCategories, useScheduled } from "../queries.ts";
import { Button, Card, CardTitle, Pill, Spinner } from "../components/ui.tsx";
import { money, dateLabel, relativeDay, todayISO } from "../lib/format.ts";
import { categoryColor } from "../types.ts";

const UNITS: { value: ScheduleUnit; label: string }[] = [
  { value: "day", label: "day(s)" },
  { value: "week", label: "week(s)" },
  { value: "month", label: "month(s)" },
  { value: "year", label: "year(s)" },
];

interface FormState {
  name: string;
  direction: "out" | "in";
  amount: string;
  category: string;
  intervalCount: string;
  intervalUnit: ScheduleUnit;
  startDate: string;
  endDate: string;
  autopayAccountId: string;
}

function blankForm(): FormState {
  return {
    name: "",
    direction: "out",
    amount: "",
    category: "Utilities",
    intervalCount: "1",
    intervalUnit: "month",
    startDate: todayISO(),
    endDate: "",
    autopayAccountId: "",
  };
}

function toInput(f: FormState): ScheduledInput {
  const magnitude = Math.round(parseFloat(f.amount || "0") * 100);
  return {
    name: f.name.trim() || f.category,
    amountCents: f.direction === "out" ? -Math.abs(magnitude) : Math.abs(magnitude),
    category: f.category,
    intervalCount: Math.max(1, parseInt(f.intervalCount || "1", 10)),
    intervalUnit: f.intervalUnit,
    startDate: f.startDate,
    endDate: f.endDate || null,
    autopayAccountId: f.autopayAccountId || null,
  };
}

function ScheduleForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  pending,
}: {
  initial: FormState;
  submitLabel: string;
  onSubmit: (f: FormState) => void;
  onCancel?: () => void;
  pending: boolean;
}) {
  const categories = useCategories();
  const accounts = useAccounts();
  const [f, setF] = useState<FormState>(initial);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((prev) => ({ ...prev, [k]: v }));

  return (
    <form
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (f.amount) onSubmit(f);
      }}
    >
      <label className="text-sm">
        <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Name</span>
        <input
          value={f.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Rent"
          className="w-full rounded-md border bg-transparent px-2 py-1.5"
          style={{ borderColor: "var(--border)" }}
        />
      </label>

      <label className="text-sm">
        <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Direction</span>
        <select
          value={f.direction}
          onChange={(e) => set("direction", e.target.value as "out" | "in")}
          className="w-full rounded-md border bg-transparent px-2 py-1.5"
          style={{ borderColor: "var(--border)" }}
        >
          <option value="out">Payment (money out)</option>
          <option value="in">Income (money in)</option>
        </select>
      </label>

      <label className="text-sm">
        <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Amount ($)</span>
        <input
          type="number"
          min="0"
          step="1"
          value={f.amount}
          onChange={(e) => set("amount", e.target.value)}
          required
          className="w-full rounded-md border bg-transparent px-2 py-1.5 tnum"
          style={{ borderColor: "var(--border)" }}
        />
      </label>

      <label className="text-sm">
        <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Category</span>
        <select
          value={f.category}
          onChange={(e) => set("category", e.target.value)}
          className="w-full rounded-md border bg-transparent px-2 py-1.5"
          style={{ borderColor: "var(--border)" }}
        >
          {(categories.data ?? []).map((c) => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
      </label>

      <div className="text-sm">
        <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Repeats every</span>
        <div className="flex gap-2">
          <input
            type="number"
            min="1"
            max="365"
            value={f.intervalCount}
            onChange={(e) => set("intervalCount", e.target.value)}
            className="w-16 rounded-md border bg-transparent px-2 py-1.5 tnum"
            style={{ borderColor: "var(--border)" }}
          />
          <select
            value={f.intervalUnit}
            onChange={(e) => set("intervalUnit", e.target.value as ScheduleUnit)}
            className="flex-1 rounded-md border bg-transparent px-2 py-1.5"
            style={{ borderColor: "var(--border)" }}
          >
            {UNITS.map((u) => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
          </select>
        </div>
      </div>

      <label className="text-sm">
        <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Starts / next on</span>
        <input
          type="date"
          value={f.startDate}
          onChange={(e) => set("startDate", e.target.value)}
          required
          className="w-full rounded-md border bg-transparent px-2 py-1.5"
          style={{ borderColor: "var(--border)" }}
        />
      </label>

      <label className="text-sm">
        <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Ends (optional)</span>
        <input
          type="date"
          value={f.endDate}
          onChange={(e) => set("endDate", e.target.value)}
          className="w-full rounded-md border bg-transparent px-2 py-1.5"
          style={{ borderColor: "var(--border)" }}
        />
      </label>

      <label className="text-sm">
        <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Autopay from (optional)</span>
        <select
          value={f.autopayAccountId}
          onChange={(e) => set("autopayAccountId", e.target.value)}
          className="w-full rounded-md border bg-transparent px-2 py-1.5"
          style={{ borderColor: "var(--border)" }}
        >
          <option value="">—</option>
          {(accounts.data ?? []).map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </label>

      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
        <Button type="submit" disabled={pending || !f.amount}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

function ScheduledRow({ sp }: { sp: ScheduledPayment }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["scheduled"] });
    qc.invalidateQueries({ queryKey: ["summary"] });
  };
  const patch = useMutation({
    mutationFn: (p: Partial<ScheduledInput>) => api.updateScheduled(sp.id, p),
    onSuccess: () => {
      invalidate();
      setEditing(false);
    },
  });
  const del = useMutation({ mutationFn: () => api.deleteScheduled(sp.id), onSuccess: invalidate });

  const out = sp.amountCents < 0;

  return (
    <div className="border-t py-3" style={{ borderColor: "var(--border)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: sp.color }} />
            <span className="truncate">{sp.name}</span>
            {!sp.active && <Pill>paused</Pill>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs" style={{ color: "var(--muted)" }}>
            <Pill color={categoryColor(sp.category)}>{sp.category}</Pill>
            <span>{sp.intervalLabel}</span>
            {sp.active && sp.nextOccurrence && (
              <span>· next {dateLabel(sp.nextOccurrence)} ({relativeDay(sp.nextOccurrence)})</span>
            )}
            {sp.active && !sp.nextOccurrence && <span>· finished</span>}
            {sp.endDate && <span>· until {dateLabel(sp.endDate)}</span>}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-sm font-semibold tnum" style={{ color: out ? "var(--text)" : "var(--positive)" }}>
              {money(sp.amountCents, { sign: true })}
            </div>
            <div className="text-xs tnum" style={{ color: "var(--muted)" }}>
              ≈ {money(sp.monthlyEquivalentCents, { sign: true })}/mo
            </div>
          </div>
          <div className="flex flex-col gap-1 text-xs">
            <button onClick={() => setEditing((v) => !v)} style={{ color: "var(--accent)" }}>
              {editing ? "Close" : "Edit"}
            </button>
            <button
              onClick={() => patch.mutate({ active: !sp.active })}
              style={{ color: "var(--muted)" }}
            >
              {sp.active ? "Pause" : "Resume"}
            </button>
            <button onClick={() => del.mutate()} style={{ color: "var(--negative)" }}>
              Delete
            </button>
          </div>
        </div>
      </div>

      {editing && (
        <div className="mt-3 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
          <ScheduleForm
            submitLabel="Save changes"
            pending={patch.isPending}
            onCancel={() => setEditing(false)}
            onSubmit={(f) => patch.mutate(toInput(f))}
            initial={{
              name: sp.name,
              direction: out ? "out" : "in",
              amount: String(Math.abs(sp.amountCents) / 100),
              category: sp.category,
              intervalCount: String(sp.intervalCount),
              intervalUnit: sp.intervalUnit,
              startDate: sp.startDate,
              endDate: sp.endDate ?? "",
              autopayAccountId: sp.autopayAccountId ?? "",
            }}
          />
        </div>
      )}
    </div>
  );
}

export function ScheduledPage() {
  const scheduled = useScheduled();
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: (input: ScheduledInput) => api.createScheduled(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scheduled"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    },
  });

  if (scheduled.isLoading) return <Spinner />;
  const items = scheduled.data ?? [];
  const active = items.filter((s) => s.active);
  const outPerMonth = active.filter((s) => s.amountCents < 0).reduce((s, x) => s + x.monthlyEquivalentCents, 0);
  const inPerMonth = active.filter((s) => s.amountCents > 0).reduce((s, x) => s + x.monthlyEquivalentCents, 0);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardTitle>New scheduled payment</CardTitle>
        <ScheduleForm
          initial={blankForm()}
          submitLabel="Add"
          pending={create.isPending}
          onSubmit={(f) => create.mutate(toInput(f))}
        />
      </Card>

      <Card>
        <CardTitle>
          {items.length === 0
            ? "Scheduled payments"
            : `${active.length} active · ≈ ${money(outPerMonth)}/mo out${inPerMonth ? `, ${money(inPerMonth)}/mo in` : ""}`}
        </CardTitle>
        {items.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            None yet. Add rent, subscriptions, a paycheck, or anything that repeats on a fixed interval — it’ll feed the
            dashboard’s upcoming bills and “safe to spend”.
          </p>
        ) : (
          <div>
            {items.map((sp) => (
              <ScheduledRow key={sp.id} sp={sp} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
