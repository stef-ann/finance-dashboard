import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CategorySpend, MonthlyPoint } from "../types.ts";
import { money, monthLabel, shortMoney, dateLabel } from "../lib/format.ts";

const axisStyle = { fontSize: 11, fill: "var(--muted)" } as const;

export function SpendingDonut({ data }: { data: CategorySpend[] }) {
  const top = data.slice(0, 8);
  const total = data.reduce((s, d) => s + d.spentCents, 0);
  if (total === 0) return <Empty>No spending recorded this month yet.</Empty>;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-44 w-44 shrink-0">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={top} dataKey="spentCents" nameKey="category" innerRadius={54} outerRadius={80} paddingAngle={2} strokeWidth={0}>
              {top.map((d) => (
                <Cell key={d.category} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v: number, n: string) => [money(v), n]}
              contentStyle={tooltipStyle}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="text-xs" style={{ color: "var(--muted)" }}>
              Spent
            </div>
            <div className="text-lg font-semibold tnum">{money(total, { cents: false })}</div>
          </div>
        </div>
      </div>
      <ul className="grid w-full grid-cols-1 gap-1.5 text-sm">
        {top.map((d) => (
          <li key={d.category} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 truncate">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
              <span className="truncate">{d.category}</span>
            </span>
            <span className="tnum" style={{ color: "var(--muted)" }}>
              {money(d.spentCents, { cents: false })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TrendChart({ data }: { data: MonthlyPoint[] }) {
  if (data.every((d) => d.incomeCents === 0 && d.spendingCents === 0)) {
    return <Empty>Not enough history yet.</Empty>;
  }
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer>
        <BarChart data={data} barGap={2}>
          <XAxis dataKey="month" tickFormatter={(v: string) => monthLabel(v)} tick={axisStyle} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(v) => shortMoney(v)} tick={axisStyle} axisLine={false} tickLine={false} width={44} />
          <Tooltip
            formatter={(v: number, n: string) => [money(v), n === "incomeCents" ? "Income" : "Spending"]}
            labelFormatter={(l: string) => monthLabel(l)}
            contentStyle={tooltipStyle}
            cursor={{ fill: "var(--border)", opacity: 0.4 }}
          />
          <Bar dataKey="incomeCents" fill="var(--positive)" radius={[3, 3, 0, 0]} maxBarSize={22} />
          <Bar dataKey="spendingCents" fill="var(--negative)" radius={[3, 3, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BalanceArea({ data }: { data: { date: string; balanceCents: number }[] }) {
  if (data.length < 2) return <Empty>Balance history will appear after a sync or two.</Empty>;
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="bal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tickFormatter={dateLabel}
            tick={axisStyle}
            axisLine={false}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis tickFormatter={(v) => shortMoney(v)} tick={axisStyle} axisLine={false} tickLine={false} width={44} />
          <Tooltip
            formatter={(v: number) => [money(v), "Net worth"]}
            labelFormatter={(l: string) => dateLabel(l)}
            contentStyle={tooltipStyle}
          />
          <Area type="monotone" dataKey="balanceCents" stroke="var(--accent)" strokeWidth={2} fill="url(#bal)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const tooltipStyle = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontSize: 12,
  color: "var(--text)",
} as const;

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-40 place-items-center text-center text-sm" style={{ color: "var(--muted)" }}>
      {children}
    </div>
  );
}
