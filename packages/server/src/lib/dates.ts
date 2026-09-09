// All server-side dates are handled as YYYY-MM-DD strings in local time.

export function todayISO(): string {
  return toISO(new Date());
}

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

export function addDays(s: string, n: number): string {
  const d = fromISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86_400_000);
}

/** Add n calendar months, clamping the day to the end of the target month. */
export function addMonths(s: string, n: number): string {
  const d = fromISO(s);
  const targetDay = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(targetDay, lastDay));
  return toISO(d);
}

/** "2026-09-07" -> "2026-09" */
export function monthOf(s: string): string {
  return s.slice(0, 7);
}

export function currentMonth(): string {
  return monthOf(todayISO());
}

export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const end = toISO(new Date(y!, m!, 0)); // day 0 of next month = last day of this month
  return { start, end };
}

/** Last `n` months as YYYY-MM, oldest first, ending with `month`. */
export function lastMonths(month: string, n: number): string[] {
  const [y, m] = month.split("-").map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y!, m! - 1 - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export function daysInMonthRemaining(month: string, from: string): number {
  const { end } = monthRange(month);
  if (from > end) return 0;
  if (from < `${month}-01`) return daysBetween(`${month}-01`, end) + 1;
  return Math.max(0, daysBetween(from, end));
}
