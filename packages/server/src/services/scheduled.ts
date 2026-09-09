import { db, id } from "../db.ts";
import { addDays, addMonths, daysBetween, todayISO } from "../lib/dates.ts";
import { categoryColor } from "../shared.ts";
import type { ScheduledOccurrence, ScheduledPayment, ScheduleUnit } from "../shared.ts";

interface ScheduledRow {
  id: string;
  name: string;
  amount_cents: number;
  category: string;
  interval_count: number;
  interval_unit: string;
  start_date: string;
  end_date: string | null;
  autopay_account_id: string | null;
  notes: string | null;
  active: number;
  created_at: string;
}

const UNITS: ScheduleUnit[] = ["day", "week", "month", "year"];

function stepDate(date: string, count: number, unit: ScheduleUnit): string {
  switch (unit) {
    case "day":
      return addDays(date, count);
    case "week":
      return addDays(date, count * 7);
    case "month":
      return addMonths(date, count);
    case "year":
      return addMonths(date, count * 12);
  }
}

function intervalLabel(count: number, unit: ScheduleUnit): string {
  if (count === 1) {
    return { day: "daily", week: "weekly", month: "monthly", year: "yearly" }[unit];
  }
  return `every ${count} ${unit}s`;
}

function monthlyEquivalentCents(amountCents: number, count: number, unit: ScheduleUnit): number {
  const perOccurrencePerMonth =
    unit === "day" ? 30 / count : unit === "week" ? 30 / 7 / count : unit === "month" ? 1 / count : 1 / (12 * count);
  return Math.round(amountCents * perOccurrencePerMonth);
}

/** All occurrence dates of `sp` in the inclusive window [from, to]. */
export function occurrencesBetween(sp: ScheduledRow, from: string, to: string): string[] {
  if (!sp.active) return [];
  const count = Math.max(1, sp.interval_count);
  const unit = (UNITS.includes(sp.interval_unit as ScheduleUnit) ? sp.interval_unit : "month") as ScheduleUnit;

  let d = sp.start_date;
  if (d < from && (unit === "day" || unit === "week")) {
    const stepDays = count * (unit === "week" ? 7 : 1);
    const jumps = Math.floor(daysBetween(d, from) / stepDays);
    if (jumps > 0) d = addDays(d, jumps * stepDays);
  }
  let guard = 0;
  while (d < from && guard++ < 10_000) d = stepDate(d, count, unit);

  const out: string[] = [];
  guard = 0;
  while (d <= to && guard++ < 10_000) {
    if (sp.end_date && d > sp.end_date) break;
    out.push(d);
    d = stepDate(d, count, unit);
  }
  return out;
}

function nextOccurrence(sp: ScheduledRow): string | null {
  if (!sp.active) return null;
  const today = todayISO();
  const count = Math.max(1, sp.interval_count);
  const unit = (UNITS.includes(sp.interval_unit as ScheduleUnit) ? sp.interval_unit : "month") as ScheduleUnit;

  let d = sp.start_date;
  if (d < today && (unit === "day" || unit === "week")) {
    const stepDays = count * (unit === "week" ? 7 : 1);
    const jumps = Math.floor(daysBetween(d, today) / stepDays);
    if (jumps > 0) d = addDays(d, jumps * stepDays);
  }
  let guard = 0;
  while (d < today && guard++ < 10_000) d = stepDate(d, count, unit);
  if (sp.end_date && d > sp.end_date) return null;
  return d;
}

function hydrate(row: ScheduledRow): ScheduledPayment {
  const unit = (UNITS.includes(row.interval_unit as ScheduleUnit) ? row.interval_unit : "month") as ScheduleUnit;
  const count = Math.max(1, row.interval_count);
  return {
    id: row.id,
    name: row.name,
    amountCents: row.amount_cents,
    category: row.category,
    intervalCount: count,
    intervalUnit: unit,
    startDate: row.start_date,
    endDate: row.end_date,
    autopayAccountId: row.autopay_account_id,
    notes: row.notes,
    active: row.active === 1,
    createdAt: row.created_at,
    color: categoryColor(row.category),
    nextOccurrence: nextOccurrence(row),
    monthlyEquivalentCents: monthlyEquivalentCents(row.amount_cents, count, unit),
    intervalLabel: intervalLabel(count, unit),
  };
}

function allRows(): ScheduledRow[] {
  return db.prepare("SELECT * FROM scheduled_payments ORDER BY active DESC, name ASC").all() as ScheduledRow[];
}

export function listScheduled(): ScheduledPayment[] {
  return allRows().map(hydrate);
}

export interface ScheduledInput {
  name: string;
  amountCents: number;
  category: string;
  intervalCount: number;
  intervalUnit: ScheduleUnit;
  startDate: string;
  endDate?: string | null;
  autopayAccountId?: string | null;
  notes?: string | null;
  active?: boolean;
}

export function createScheduled(input: ScheduledInput): ScheduledPayment {
  const rowId = id();
  db.prepare(
    `INSERT INTO scheduled_payments
       (id, name, amount_cents, category, interval_count, interval_unit, start_date, end_date, autopay_account_id, notes, active)
     VALUES (@id, @name, @amount, @category, @count, @unit, @start, @end, @account, @notes, @active)`,
  ).run({
    id: rowId,
    name: input.name.trim(),
    amount: Math.round(input.amountCents),
    category: input.category,
    count: Math.max(1, Math.round(input.intervalCount)),
    unit: UNITS.includes(input.intervalUnit) ? input.intervalUnit : "month",
    start: input.startDate,
    end: input.endDate ?? null,
    account: input.autopayAccountId ?? null,
    notes: input.notes ?? null,
    active: input.active === false ? 0 : 1,
  });
  return hydrate(db.prepare("SELECT * FROM scheduled_payments WHERE id = ?").get(rowId) as ScheduledRow);
}

export function updateScheduled(schedId: string, patch: Partial<ScheduledInput>): ScheduledPayment | null {
  const existing = db.prepare("SELECT * FROM scheduled_payments WHERE id = ?").get(schedId) as ScheduledRow | undefined;
  if (!existing) return null;
  db.prepare(
    `UPDATE scheduled_payments SET
       name = @name, amount_cents = @amount, category = @category,
       interval_count = @count, interval_unit = @unit,
       start_date = @start, end_date = @end, autopay_account_id = @account,
       notes = @notes, active = @active
     WHERE id = @id`,
  ).run({
    id: schedId,
    name: patch.name?.trim() ?? existing.name,
    amount: patch.amountCents !== undefined ? Math.round(patch.amountCents) : existing.amount_cents,
    category: patch.category ?? existing.category,
    count: patch.intervalCount !== undefined ? Math.max(1, Math.round(patch.intervalCount)) : existing.interval_count,
    unit:
      patch.intervalUnit && UNITS.includes(patch.intervalUnit) ? patch.intervalUnit : existing.interval_unit,
    start: patch.startDate ?? existing.start_date,
    end: patch.endDate !== undefined ? patch.endDate : existing.end_date,
    account: patch.autopayAccountId !== undefined ? patch.autopayAccountId : existing.autopay_account_id,
    notes: patch.notes !== undefined ? patch.notes : existing.notes,
    active: patch.active === undefined ? existing.active : patch.active ? 1 : 0,
  });
  return hydrate(db.prepare("SELECT * FROM scheduled_payments WHERE id = ?").get(schedId) as ScheduledRow);
}

export function deleteScheduled(schedId: string): boolean {
  return db.prepare("DELETE FROM scheduled_payments WHERE id = ?").run(schedId).changes > 0;
}

/** Sum of scheduled *outflows* (as a positive number) due in [from, to]. */
export function upcomingScheduledOutflow(from: string, to: string): number {
  let total = 0;
  for (const row of allRows()) {
    if (row.amount_cents >= 0) continue;
    total += occurrencesBetween(row, from, to).length * -row.amount_cents;
  }
  return total;
}

/** Next occurrences within `days` days, oldest first. */
export function scheduledForecast(days = 35): ScheduledOccurrence[] {
  const today = todayISO();
  const to = addDays(today, days);
  const out: ScheduledOccurrence[] = [];
  for (const row of allRows()) {
    for (const date of occurrencesBetween(row, today, to)) {
      out.push({
        scheduledId: row.id,
        name: row.name,
        category: row.category,
        color: categoryColor(row.category),
        amountCents: row.amount_cents,
        date,
        intervalLabel: intervalLabel(
          Math.max(1, row.interval_count),
          (UNITS.includes(row.interval_unit as ScheduleUnit) ? row.interval_unit : "month") as ScheduleUnit,
        ),
      });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Lowercase names of active scheduled payments — used to de-dupe detected recurring. */
export function activeScheduledNames(): string[] {
  return allRows()
    .filter((r) => r.active === 1)
    .map((r) => r.name.toLowerCase().trim());
}
