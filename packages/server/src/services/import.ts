import { createHash } from "node:crypto";
import { db, id } from "../db.ts";
import { CATEGORY_NAMES } from "../shared.ts";
import type { CsvColumnMapping, CsvImportResult, CsvPreview, CsvPreviewRow } from "../shared.ts";
import { detectFormat, detectMapping, parseAmountToCents, parseCsv, parseDateToISO } from "./csv.ts";
import { categorize } from "./categorize.ts";
import { updateSettings } from "./settings.ts";

const CHASE_CATEGORY_MAP: Record<string, string> = {
  gas: "Transportation",
  automotive: "Transportation",
  groceries: "Groceries",
  "food & drink": "Dining",
  shopping: "Shopping",
  "bills & utilities": "Utilities",
  travel: "Travel",
  entertainment: "Entertainment",
  "health & wellness": "Health",
  home: "Housing",
  "fees & adjustments": "Fees & Interest",
  "gifts & donations": "Other",
  personal: "Other",
  education: "Other",
  "professional services": "Other",
};

function mapExternalCategory(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (CATEGORY_NAMES.map((c) => c.toLowerCase()).includes(v)) {
    return CATEGORY_NAMES.find((c) => c.toLowerCase() === v)!;
  }
  return CHASE_CATEGORY_MAP[v] ?? null;
}

interface BuiltRow extends CsvPreviewRow {
  externalCategory: string | null;
}

function columnKey(headers: string[], idx: number): string {
  const h = headers[idx];
  return h && h.trim() !== "" ? h.trim() : `col ${idx + 1}`;
}

function buildRows(
  csv: string,
  mappingOverride?: CsvColumnMapping,
): { headers: string[]; format: string; mapping: CsvColumnMapping; rows: BuiltRow[]; hasRunningBalance: boolean } {
  const table = parseCsv(csv);
  if (table.length === 0) return { headers: [], format: "Empty", mapping: {}, rows: [], hasRunningBalance: false };

  const headers = table[0]!;
  const format = detectFormat(headers);
  const mapping = mappingOverride && Object.keys(mappingOverride).length ? mappingOverride : detectMapping(headers);

  const roleToIdx = new Map<string, number>();
  headers.forEach((_, idx) => {
    const role = mapping[columnKey(headers, idx)];
    if (role && role !== "ignore" && !roleToIdx.has(role)) roleToIdx.set(role, idx);
  });

  const at = (cells: string[], role: string): string => {
    const idx = roleToIdx.get(role);
    return idx === undefined ? "" : (cells[idx] ?? "");
  };

  const hasRunningBalance = roleToIdx.has("balance");
  const rows: BuiltRow[] = [];

  for (const cells of table.slice(1)) {
    const postedAt = parseDateToISO(at(cells, "date"));
    const description = (at(cells, "description") || at(cells, "category") || "Transaction").trim();

    let amountCents: number | null = null;
    if (roleToIdx.has("amount")) {
      amountCents = parseAmountToCents(at(cells, "amount"));
    } else {
      const out = parseAmountToCents(at(cells, "amountOut"));
      const inc = parseAmountToCents(at(cells, "amountIn"));
      if (out != null && out !== 0) amountCents = -Math.abs(out);
      else if (inc != null && inc !== 0) amountCents = Math.abs(inc);
      else if (out === 0 || inc === 0) amountCents = 0;
    }

    const balanceCents = hasRunningBalance ? parseAmountToCents(at(cells, "balance")) : null;
    const externalCategory = mapExternalCategory(at(cells, "category"));

    let problem: string | null = null;
    if (!postedAt) problem = "unrecognized date";
    else if (amountCents === null) problem = "unrecognized amount";

    const rule = categorize(`${description}`, amountCents ?? -1);
    const category = rule.matched ? rule.category : externalCategory ?? rule.category;

    rows.push({
      postedAt,
      amountCents,
      description,
      category,
      balanceCents,
      raw: cells,
      problem,
      externalCategory,
    });
  }

  return { headers, format, mapping, rows, hasRunningBalance };
}

export function previewImport(csv: string, mappingOverride?: CsvColumnMapping): CsvPreview {
  const { headers, format, mapping, rows, hasRunningBalance } = buildRows(csv, mappingOverride);
  const valid = rows.filter((r) => !r.problem);
  const dates = valid.map((r) => r.postedAt!).sort();

  return {
    detectedFormat: format,
    headers: headers.map((h, i) => (h.trim() !== "" ? h.trim() : `col ${i + 1}`)),
    mapping,
    rows: rows.slice(0, 60).map(({ externalCategory: _e, ...r }) => r),
    totalRows: rows.length,
    validRows: valid.length,
    dateRange: dates.length ? { from: dates[0]!, to: dates[dates.length - 1]! } : null,
    hasRunningBalance,
  };
}

export function commitImport(input: { csv: string; accountId: string; mapping?: CsvColumnMapping }): CsvImportResult {
  const account = db.prepare("SELECT id, name, type, source FROM accounts WHERE id = ?").get(input.accountId) as
    | { id: string; name: string; type: string; source: string }
    | undefined;
  if (!account) throw new Error("Account not found.");
  if (account.source !== "csv") throw new Error("CSV data can only be imported into an imported account.");

  const { rows, hasRunningBalance } = buildRows(input.csv, input.mapping);

  const insert = db.prepare(
    `INSERT OR IGNORE INTO transactions
       (id, account_id, source, external_id, posted_at, amount_cents, description, merchant, category, category_source, pending, notes, recurring_group)
     VALUES (@id, @accountId, 'csv', @externalId, @postedAt, @amount, @description, NULL, @category, @categorySource, 0, NULL, NULL)`,
  );

  let added = 0;
  let skippedDuplicates = 0;
  let skippedInvalid = 0;

  const tx = db.transaction(() => {
    for (const r of rows) {
      if (r.problem || r.postedAt === null || r.amountCents === null) {
        skippedInvalid++;
        continue;
      }
      const fingerprint = createHash("sha1")
        .update(`${input.accountId}|${r.postedAt}|${r.amountCents}|${r.description.toLowerCase().replace(/\s+/g, " ").trim()}`)
        .digest("hex");
      const res = insert.run({
        id: id(),
        accountId: input.accountId,
        externalId: fingerprint,
        postedAt: r.postedAt,
        amount: r.amountCents,
        description: r.description,
        category: r.category,
        categorySource: r.externalCategory && r.category === r.externalCategory ? "csv" : "rule",
      });
      if (res.changes > 0) added++;
      else skippedDuplicates++;
    }
  });
  tx();

  rebuildImportedAccountBalances(input.accountId, account.type, hasRunningBalance ? lastBalanceByDate(rows) : null);

  if (added > 0) updateSettings({ mode: "live" });

  return {
    accountId: account.id,
    accountName: account.name,
    added,
    skippedDuplicates,
    skippedInvalid,
  };
}

/** Most recent running-balance value per day, from the CSV rows. */
function lastBalanceByDate(rows: BuiltRow[]): Map<string, number> {
  const byDate = new Map<string, number>();
  const ordered = rows
    .filter((r) => r.postedAt && r.balanceCents !== null)
    .sort((a, b) => (a.postedAt! < b.postedAt! ? -1 : 1));
  for (const r of ordered) byDate.set(r.postedAt!, r.balanceCents!);
  return byDate;
}

function rebuildImportedAccountBalances(
  accountId: string,
  accountType: string,
  runningBalanceByDate: Map<string, number> | null,
): void {
  const txns = db
    .prepare("SELECT posted_at, amount_cents FROM transactions WHERE account_id = ? ORDER BY posted_at ASC, created_at ASC")
    .all(accountId) as { posted_at: string; amount_cents: number }[];
  if (txns.length === 0) return;

  db.prepare("DELETE FROM balance_snapshots WHERE account_id = ?").run(accountId);
  const insSnap = db.prepare(
    "INSERT OR REPLACE INTO balance_snapshots (id, account_id, date, balance_cents) VALUES (?, ?, ?, ?)",
  );

  let current = 0;
  const snap = db.transaction(() => {
    if (runningBalanceByDate && runningBalanceByDate.size > 0) {
      // Trust the statement's running balance; carry forward on gap days.
      const dates = [...new Set(txns.map((t) => t.posted_at))].sort();
      let last = 0;
      for (const d of dates) {
        if (runningBalanceByDate.has(d)) last = runningBalanceByDate.get(d)!;
        insSnap.run(id(), accountId, d, last);
      }
      current = last;
    } else {
      // No balance column: assume the account started at 0 before the first row.
      let bal = 0;
      const byDay = new Map<string, number>();
      for (const t of txns) {
        bal += t.amount_cents;
        byDay.set(t.posted_at, bal);
      }
      for (const [d, b] of byDay) insSnap.run(id(), accountId, d, b);
      current = bal;
    }
  });
  snap();

  const available = accountType === "credit_card" ? current : Math.max(current, 0);
  db.prepare(
    "UPDATE accounts SET current_balance_cents = ?, available_balance_cents = ?, synced_at = datetime('now') WHERE id = ?",
  ).run(current, available, accountId);
}
