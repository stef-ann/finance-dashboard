import { readFileSync } from "node:fs";
import { Agent, fetch } from "undici";
import { db, id } from "../db.ts";
import { decrypt, encrypt } from "../crypto.ts";
import { getTellerConfig } from "../config.ts";
import { categorize } from "./categorize.ts";
import type { AccountType } from "../shared.ts";

const TELLER_API = "https://api.teller.io";

// ---------------------------------------------------------------------------
// Enrollment storage
// ---------------------------------------------------------------------------

export interface StoredEnrollment {
  id: string;
  accessToken: string;
  enrollmentId: string | null;
  institutionName: string | null;
  userId: string | null;
  createdAt: string;
}

export function getStoredEnrollment(): StoredEnrollment | null {
  const row = db.prepare("SELECT * FROM teller_enrollments ORDER BY created_at DESC LIMIT 1").get() as
    | { id: string; access_token_encrypted: string; enrollment_id: string | null; institution_name: string | null; user_id: string | null; created_at: string }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    accessToken: decrypt(row.access_token_encrypted),
    enrollmentId: row.enrollment_id,
    institutionName: row.institution_name,
    userId: row.user_id,
    createdAt: row.created_at,
  };
}

export function isTellerConnected(): boolean {
  const row = db.prepare("SELECT COUNT(*) AS n FROM teller_enrollments").get() as { n: number };
  return row.n > 0;
}

export function deleteEnrollment(): void {
  db.prepare("DELETE FROM teller_enrollments").run();
  db.prepare("DELETE FROM transactions WHERE source = 'teller'").run();
  db.prepare("DELETE FROM balance_snapshots WHERE account_id IN (SELECT id FROM accounts WHERE source = 'teller')").run();
  db.prepare("DELETE FROM accounts WHERE source = 'teller'").run();
}

/**
 * Persist the enrollment returned by Teller Connect. `accessToken` is encrypted
 * at rest; the raw Chase credentials never reach this app.
 */
export async function storeEnrollment(input: {
  accessToken: string;
  enrollmentId?: string | null;
  userId?: string | null;
  institutionName?: string | null;
}): Promise<StoredEnrollment> {
  let institution = input.institutionName ?? null;
  if (!institution) {
    try {
      const accounts = await fetchAccounts(input.accessToken);
      institution = accounts[0]?.institution?.name ?? null;
    } catch {
      /* leave null; sync will fill it in */
    }
  }

  db.prepare("DELETE FROM teller_enrollments").run();
  const rowId = id();
  db.prepare(
    `INSERT INTO teller_enrollments (id, access_token_encrypted, enrollment_id, institution_name, user_id)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(rowId, encrypt(input.accessToken), input.enrollmentId ?? null, institution, input.userId ?? null);

  return getStoredEnrollment()!;
}

// ---------------------------------------------------------------------------
// Teller HTTP
// ---------------------------------------------------------------------------

let cachedAgent: Agent | undefined;

function dispatcher(): Agent | undefined {
  const cfg = getTellerConfig();
  if (!cfg.certPath || !cfg.keyPath) return undefined; // sandbox needs no client cert
  if (!cachedAgent) {
    cachedAgent = new Agent({
      connect: {
        cert: readFileSync(cfg.certPath, "utf8"),
        key: readFileSync(cfg.keyPath, "utf8"),
      },
    });
  }
  return cachedAgent;
}

async function tellerGet<T>(path: string, accessToken: string): Promise<T> {
  const auth = Buffer.from(`${accessToken}:`).toString("base64");
  const res = await fetch(`${TELLER_API}${path}`, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
    dispatcher: dispatcher(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Teller ${path} -> ${res.status} ${res.statusText} ${body}`.trim());
  }
  return (await res.json()) as T;
}

interface TellerAccount {
  id: string;
  name: string;
  type: string; // depository | credit
  subtype: string; // checking | savings | credit_card | ...
  last_four: string;
  currency: string;
  institution?: { name: string; id: string };
}

interface TellerBalance {
  account_id: string;
  ledger: string;
  available: string;
}

interface TellerTransaction {
  id: string;
  account_id: string;
  date: string;
  amount: string;
  description: string;
  status: "posted" | "pending";
  details?: { category?: string | null; counterparty?: { name?: string | null } | null };
}

export function fetchAccounts(token: string): Promise<TellerAccount[]> {
  return tellerGet<TellerAccount[]>("/accounts", token);
}

function toCents(decimal: string): number {
  return Math.round(parseFloat(decimal) * 100);
}

function mapType(t: TellerAccount): AccountType {
  if (t.subtype === "checking") return "checking";
  if (t.subtype === "savings") return "savings";
  if (t.type === "credit" || t.subtype === "credit_card") return "credit_card";
  return "other";
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

export async function syncFromTeller(): Promise<{ accountsUpserted: number; transactionsAdded: number; institution: string | null }> {
  const enrollment = getStoredEnrollment();
  if (!enrollment) throw new Error("No Teller enrollment. Connect an account first.");
  const token = enrollment.accessToken;

  const accounts = await fetchAccounts(token);
  let institution = enrollment.institutionName;

  const upsertAccount = db.prepare(
    `INSERT INTO accounts (id, source, external_id, name, type, institution_name, last_four, currency, current_balance_cents, available_balance_cents, synced_at)
     VALUES (@id, 'teller', @externalId, @name, @type, @institution, @lastFour, @currency, @ledger, @available, datetime('now'))
     ON CONFLICT(source, external_id) DO UPDATE SET
       name = excluded.name,
       type = excluded.type,
       institution_name = excluded.institution_name,
       last_four = excluded.last_four,
       current_balance_cents = excluded.current_balance_cents,
       available_balance_cents = excluded.available_balance_cents,
       synced_at = datetime('now')`,
  );
  const findAccount = db.prepare("SELECT id FROM accounts WHERE source = 'teller' AND external_id = ?");
  const insertTxn = db.prepare(
    `INSERT INTO transactions
       (id, account_id, source, external_id, posted_at, amount_cents, description, merchant, category, category_source, pending, notes, recurring_group)
     VALUES (@id, @accountId, 'teller', @externalId, @postedAt, @amount, @description, @merchant, @category, @categorySource, @pending, NULL, NULL)
     ON CONFLICT(source, external_id) DO UPDATE SET
       posted_at = excluded.posted_at,
       amount_cents = excluded.amount_cents,
       pending = excluded.pending`,
  );
  const insSnap = db.prepare(
    "INSERT OR REPLACE INTO balance_snapshots (id, account_id, date, balance_cents) VALUES (?, ?, ?, ?)",
  );

  let accountsUpserted = 0;
  let transactionsAdded = 0;

  for (const acct of accounts) {
    if (!institution && acct.institution?.name) institution = acct.institution.name;
    let balance: TellerBalance | null = null;
    try {
      balance = await tellerGet<TellerBalance>(`/accounts/${acct.id}/balances`, token);
    } catch {
      /* some institutions omit balances; fall back to 0 */
    }
    const ledger = balance ? toCents(balance.ledger) : 0;
    const available = balance ? toCents(balance.available) : ledger;

    upsertAccount.run({
      id: id(),
      externalId: acct.id,
      name: acct.name,
      type: mapType(acct),
      institution: acct.institution?.name ?? institution ?? "Chase",
      lastFour: acct.last_four ?? null,
      currency: acct.currency ?? "USD",
      ledger,
      available,
    });
    accountsUpserted++;
    const localId = (findAccount.get(acct.id) as { id: string }).id;

    const txns = await tellerGet<TellerTransaction[]>(`/accounts/${acct.id}/transactions?count=500`, token);
    const applyTxns = db.transaction(() => {
      for (const t of txns) {
        const cents = toCents(t.amount);
        const merchant = t.details?.counterparty?.name ?? null;
        const rule = categorize(`${t.description} ${merchant ?? ""}`, cents);
        const tellerCat = t.details?.category ? titleCase(t.details.category) : null;
        const category = rule.matched ? rule.category : tellerCat ?? rule.category;
        const res = insertTxn.run({
          id: id(),
          accountId: localId,
          externalId: t.id,
          postedAt: t.date,
          amount: cents,
          description: t.description,
          merchant,
          category,
          categorySource: rule.matched ? "rule" : tellerCat ? "teller" : "rule",
          pending: t.status === "pending" ? 1 : 0,
        });
        transactionsAdded += res.changes;
      }
    });
    applyTxns();

    // Derive daily end-of-day balances by walking backwards from the ledger balance.
    rebuildTellerBalancesForAccount(localId, ledger, insSnap);
  }

  if (institution && institution !== enrollment.institutionName) {
    db.prepare("UPDATE teller_enrollments SET institution_name = ? WHERE id = ?").run(institution, enrollment.id);
  }

  return { accountsUpserted, transactionsAdded, institution };
}

function rebuildTellerBalancesForAccount(
  accountId: string,
  currentLedgerCents: number,
  insSnap: import("better-sqlite3").Statement,
): void {
  const rows = db
    .prepare("SELECT posted_at, amount_cents FROM transactions WHERE account_id = ? ORDER BY posted_at DESC, created_at DESC")
    .all(accountId) as { posted_at: string; amount_cents: number }[];
  db.prepare("DELETE FROM balance_snapshots WHERE account_id = ?").run(accountId);
  let running = currentLedgerCents;
  const seen = new Set<string>();
  const tx = db.transaction(() => {
    for (const r of rows) {
      if (!seen.has(r.posted_at)) {
        insSnap.run(id(), accountId, r.posted_at, running);
        seen.add(r.posted_at);
      }
      running -= r.amount_cents; // walking backwards
    }
  });
  tx();
}

function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
