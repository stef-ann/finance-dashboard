import { Link } from "react-router-dom";
import type { RecurringCharge } from "../types.ts";
import { money, dateLabel, relativeDay } from "../lib/format.ts";
import { categoryColor } from "../types.ts";
import { useScheduled } from "../queries.ts";
import { Pill } from "./ui.tsx";

function cadenceLabel(days: number): string {
  if (days <= 8) return "weekly";
  if (days <= 16) return "every 2 weeks";
  return "monthly";
}

type Line = {
  key: string;
  name: string;
  category: string;
  interval: string;
  amountCents: number; // signed
  nextDate: string;
  scheduled: boolean;
};

export function RecurringList({ items }: { items: RecurringCharge[] }) {
  const scheduled = useScheduled();

  const scheduledLines: Line[] = (scheduled.data ?? [])
    .filter((s) => s.active && s.nextOccurrence)
    .map((s) => ({
      key: `sch-${s.id}`,
      name: s.name,
      category: s.category,
      interval: s.intervalLabel,
      amountCents: s.amountCents,
      nextDate: s.nextOccurrence!,
      scheduled: true,
    }));

  const detectedLines: Line[] = items.map((r) => ({
    key: `det-${r.merchant}`,
    name: r.merchant,
    category: r.category,
    interval: cadenceLabel(r.cadenceDays),
    amountCents: -r.averageCents,
    nextDate: r.nextEstimated,
    scheduled: false,
  }));

  const lines = [...scheduledLines, ...detectedLines].sort((a, b) => (a.nextDate < b.nextDate ? -1 : 1));

  if (lines.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Nothing yet. Detected charges appear once a payee repeats; add your own on the{" "}
        <Link to="/scheduled" style={{ color: "var(--accent)" }}>Scheduled</Link> page.
      </p>
    );
  }

  const monthlyOut =
    (scheduled.data ?? [])
      .filter((s) => s.active && s.amountCents < 0)
      .reduce((s, x) => s + x.monthlyEquivalentCents, 0) +
    items.reduce((s, r) => s - Math.round((r.averageCents * 30) / r.cadenceDays), 0);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2 text-xs" style={{ color: "var(--muted)" }}>
        <span>≈ {money(monthlyOut, { cents: false })}/mo across {lines.length} items</span>
        <Link to="/scheduled" className="font-medium" style={{ color: "var(--accent)" }}>
          Manage →
        </Link>
      </div>
      <ul className="flex flex-col divide-y" style={{ borderColor: "var(--border)" }}>
        {lines.map((l) => (
          <li key={l.key} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{l.name}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs" style={{ color: "var(--muted)" }}>
                <Pill color={categoryColor(l.category)}>{l.category}</Pill>
                <span>{l.interval}</span>
                {l.scheduled ? <Pill color="var(--accent)">scheduled</Pill> : <Pill>detected</Pill>}
              </div>
            </div>
            <div className="text-right">
              <div
                className="text-sm font-semibold tnum"
                style={{ color: l.amountCents > 0 ? "var(--positive)" : "var(--text)" }}
              >
                {money(l.amountCents, { sign: true })}
              </div>
              <div className="text-xs tnum" style={{ color: "var(--muted)" }}>
                next {dateLabel(l.nextDate)} · {relativeDay(l.nextDate)}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
