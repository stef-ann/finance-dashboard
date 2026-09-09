export function money(cents: number, opts: { sign?: boolean; cents?: boolean } = {}): string {
  const value = cents / 100;
  const str = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: opts.cents === false ? 0 : 2,
    maximumFractionDigits: opts.cents === false ? 0 : 2,
  }).format(Math.abs(value));
  if (opts.sign && cents > 0) return `+${str}`;
  if (value < 0) return `-${str}`;
  return str;
}

export function shortMoney(cents: number): string {
  const v = Math.abs(cents / 100);
  const sign = cents < 0 ? "-" : "";
  if (v >= 1000) return `${sign}$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
  return `${sign}$${v.toFixed(0)}`;
}

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y || 1970, m || 1, d || 1];
}

export function monthLabel(month: string, withYear = false): string {
  const [y, m] = parts(month);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

export function dateLabel(iso: string): string {
  const [y, m, d] = parts(iso);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function relativeDay(iso: string): string {
  const today = new Date();
  const [y, m, d] = parts(iso);
  const then = new Date(y, m - 1, d);
  const days = Math.round((then.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days < 0) return `${-days}d ago`;
  return `in ${days}d`;
}

export function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.min(100, Math.round((part / whole) * 100));
}

export function currentMonthISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
