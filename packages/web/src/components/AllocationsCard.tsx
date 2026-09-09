import { Link } from "react-router-dom";
import { useAllocations } from "../queries.ts";
import { money, pct } from "../lib/format.ts";
import { Card, CardTitle, ProgressBar } from "./ui.tsx";

export function AllocationsCard() {
  const plan = useAllocations();
  if (!plan.data || plan.data.allocations.length === 0) return null;
  const p = plan.data;

  return (
    <Card>
      <CardTitle
        action={
          <Link to="/budget" className="text-xs font-medium" style={{ color: "var(--accent)" }}>
            Edit →
          </Link>
        }
      >
        Balance allocation
      </CardTitle>

      <div className="mb-3 text-xs tnum" style={{ color: p.overAllocated ? "var(--negative)" : "var(--muted)" }}>
        {money(p.allocatedCents)} of {money(p.basisBalanceCents)} assigned ·{" "}
        {p.overAllocated ? `${money(-p.unallocatedCents)} over` : `${money(p.unallocatedCents)} free`}
      </div>

      <ul className="flex flex-col gap-2.5">
        {p.allocations.slice(0, 7).map((a) => {
          const over = a.remainingCents < 0;
          return (
            <li key={a.id}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: a.color }} />
                  <span className="truncate">{a.name}</span>
                </span>
                <span className="tnum" style={{ color: over ? "var(--negative)" : "var(--muted)" }}>
                  {a.category ? `${money(a.spentCents)} / ` : ""}
                  {money(a.amountCents)}
                </span>
              </div>
              {a.category && (
                <div className="mt-1">
                  <ProgressBar value={pct(a.spentCents, a.amountCents)} color={over ? "var(--negative)" : a.color} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {p.allocations.length > 7 && (
        <div className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
          +{p.allocations.length - 7} more
        </div>
      )}
    </Card>
  );
}
