import { db, id } from "../db.ts";
import { Rng } from "../lib/rng.ts";
import { addDays, daysBetween, monthOf, todayISO } from "../lib/dates.ts";
import { categorize } from "./categorize.ts";

/**
 * Offline simulation mode. Produces a believable set of Chase-style accounts and
 * ~6 months of transactions so the whole dashboard is usable with no bank link.
 * Everything is deterministic given the stored seed, so the history can be
 * regenerated incrementally as days pass.
 */

const HISTORY_DAYS = 185;
const CREDIT_LIMIT_CENTS = 500_000;

type AcctKey = "checking" | "savings" | "card";

interface SimAccount {
  key: AcctKey;
  externalId: string;
  name: string;
  type: "checking" | "savings" | "credit_card";
  lastFour: string;
  startBalanceCents: number;
}

const SIM_ACCOUNTS: SimAccount[] = [
  { key: "checking", externalId: "sim-checking", name: "Chase Total Checking", type: "checking", lastFour: "4821", startBalanceCents: 4_213_00 },
  { key: "savings", externalId: "sim-savings", name: "Chase Premier Savings", type: "savings", lastFour: "9077", startBalanceCents: 8_640_00 },
  { key: "card", externalId: "sim-card", name: "Chase Freedom Unlimited", type: "credit_card", lastFour: "3345", startBalanceCents: -540_00 },
];

interface Draft {
  acct: AcctKey;
  amountCents: number;
  description: string;
  merchant: string | null;
  recurringGroup: string | null;
}

const GROCERS = ["WHOLE FOODS MARKET", "TRADER JOE'S", "SAFEWAY", "KROGER"];
const RESTAURANTS = ["THE COPPER SKILLET", "PHO 79", "NAPOLI PIZZERIA", "GREEN LEAF CAFE", "BURGER REPUBLIC"];
const GAS = ["SHELL OIL", "CHEVRON", "EXXONMOBIL"];
const COFFEE = ["STARBUCKS", "BLUE BOTTLE COFFEE", "PEET'S COFFEE"];

function dayRng(seed: number, dayIndex: number): Rng {
  return new Rng((seed ^ Math.imul(dayIndex + 1, 2654435761)) >>> 0);
}

function monthRng(seed: number, monthIndex: number): Rng {
  return new Rng((seed ^ Math.imul(monthIndex + 7, 40503)) >>> 0);
}

/** Card autopay pulls last calendar month's card spend from checking. */
function priorMonthCardSpendCents(dateISO: string): number {
  const d = new Date(dateISO);
  const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const month = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(-amount_cents), 0) AS spent
         FROM transactions t JOIN accounts a ON a.id = t.account_id
        WHERE a.source = 'sim' AND a.type = 'credit_card'
          AND t.amount_cents < 0 AND substr(t.posted_at, 1, 7) = ?`,
    )
    .get(month) as { spent: number };
  return row.spent;
}

function generateDay(seed: number, startedOn: string, dateISO: string): Draft[] {
  const dayIndex = daysBetween(startedOn, dateISO);
  const rng = dayRng(seed, dayIndex);
  const dom = new Date(dateISO).getDate();
  const monthIndex = Number(monthOf(dateISO).replace("-", ""));
  const drafts: Draft[] = [];

  const spendAcct = (): AcctKey => (rng.chance(0.6) ? "card" : "checking");

  // ---- Income: biweekly payroll (anchor 3 days after start) ----
  if (daysBetween(addDays(startedOn, 3), dateISO) % 14 === 0 && dateISO >= addDays(startedOn, 3)) {
    drafts.push({
      acct: "checking",
      amountCents: 2_380_00 + monthRng(seed, monthIndex).int(-40, 60) * 100,
      description: "EMPLOYER INC PAYROLL DIRECT DEP",
      merchant: "Employer Inc",
      recurringGroup: "payroll",
    });
  }

  // ---- Monthly recurring bills ----
  const bill = (day: number, amountCents: number, description: string, merchant: string, group: string, acct: AcctKey = "checking") => {
    if (dom === day) drafts.push({ acct, amountCents: -Math.abs(amountCents), description, merchant, recurringGroup: group });
  };
  bill(1, 1_850_00, "RENT PAYMENT WESTGATE PROPERTY MGMT", "Westgate Property Mgmt", "rent");
  bill(2, 300_00, "ONLINE TRANSFER TO SAVINGS ...9077", "Internal Transfer", "auto-save");
  if (dom === 2) drafts.push({ acct: "savings", amountCents: 300_00, description: "ONLINE TRANSFER FROM CHECKING ...4821", merchant: "Internal Transfer", recurringGroup: "auto-save" });
  bill(5, 39_99, "CRUNCH FITNESS MEMBERSHIP", "Crunch Fitness", "gym");
  bill(8, 11_99, "SPOTIFY USA", "Spotify", "spotify");
  bill(12, monthRng(seed, monthIndex).int(78_00, 121_00), "PG&E ELECTRIC UTILITY", "PG&E", "electric");
  bill(15, 69_99, "COMCAST XFINITY INTERNET", "Comcast Xfinity", "internet");
  bill(18, 132_00, "GEICO AUTO INSURANCE PREMIUM", "GEICO", "car-insurance");
  bill(20, 75_00, "T-MOBILE WIRELESS PAYMENT", "T-Mobile", "phone");
  bill(22, 15_49, "NETFLIX.COM", "Netflix", "netflix");
  bill(25, 2_99, "APPLE ICLOUD STORAGE", "Apple", "icloud");

  // ---- Credit card autopay from checking (day 16) ----
  if (dom === 16) {
    const owed = priorMonthCardSpendCents(dateISO);
    if (owed > 0) {
      drafts.push({ acct: "checking", amountCents: -owed, description: "CHASE CREDIT CRD AUTOPAY ...3345", merchant: "Chase Card Services", recurringGroup: "card-autopay" });
      drafts.push({ acct: "card", amountCents: owed, description: "AUTOMATIC PAYMENT - THANK YOU", merchant: "Chase Card Services", recurringGroup: "card-autopay" });
    }
  }

  // ---- Variable spending ----
  if (rng.chance(2 / 7)) {
    const grocer = rng.pick(GROCERS);
    drafts.push({ acct: spendAcct(), amountCents: -rng.int(28_00, 116_00), description: `${grocer} #${rng.int(100, 999)}`, merchant: grocer, recurringGroup: null });
  }
  if (rng.chance(3 / 7)) {
    if (rng.chance(0.5)) {
      const shop = rng.pick(COFFEE);
      drafts.push({ acct: spendAcct(), amountCents: -rng.int(4_00, 9_00), description: shop, merchant: shop, recurringGroup: null });
    } else if (rng.chance(0.5)) {
      drafts.push({ acct: spendAcct(), amountCents: -rng.int(18_00, 46_00), description: "DOORDASH*ORDER", merchant: "DoorDash", recurringGroup: null });
    } else {
      const spot = rng.pick(RESTAURANTS);
      drafts.push({ acct: spendAcct(), amountCents: -rng.int(16_00, 72_00), description: spot, merchant: spot, recurringGroup: null });
    }
  }
  if (rng.chance(1 / 7)) {
    const station = rng.pick(GAS);
    drafts.push({ acct: spendAcct(), amountCents: -rng.int(32_00, 58_00), description: `${station} FUEL`, merchant: station, recurringGroup: null });
  }
  if (rng.chance(1 / 9)) {
    drafts.push({ acct: rng.chance(0.7) ? "card" : "checking", amountCents: -rng.int(9_00, 84_00), description: "AMAZON.COM*MKTPLACE", merchant: "Amazon", recurringGroup: null });
  }
  if (rng.chance(1 / 12)) {
    drafts.push({ acct: spendAcct(), amountCents: -rng.int(18_00, 96_00), description: `TARGET T-${rng.int(1000, 9999)}`, merchant: "Target", recurringGroup: null });
  }
  if (rng.chance(1 / 14)) {
    drafts.push({ acct: spendAcct(), amountCents: -rng.int(8_00, 34_00), description: "CVS/PHARMACY #4471", merchant: "CVS Pharmacy", recurringGroup: null });
  }
  if (rng.chance(1 / 15)) {
    const ent = rng.chance(0.5)
      ? { d: "AMC THEATRES ONLINE", m: "AMC Theatres" }
      : { d: "STEAM GAMES", m: "Steam" };
    drafts.push({ acct: spendAcct(), amountCents: -rng.int(12_00, 38_00), description: ent.d, merchant: ent.m, recurringGroup: null });
  }
  if (rng.chance(1 / 10)) {
    drafts.push({ acct: "checking", amountCents: -rng.pick([40_00, 60_00, 100_00]), description: "ATM WITHDRAWAL", merchant: null, recurringGroup: null });
    if (rng.chance(0.25)) drafts.push({ acct: "checking", amountCents: -3_00, description: "NON-CHASE ATM FEE", merchant: null, recurringGroup: null });
  }
  if (rng.chance(1 / 25)) {
    const trip = rng.pick([
      { d: "DELTA AIR LINES", m: "Delta Air Lines" },
      { d: "AIRBNB * STAY", m: "Airbnb" },
      { d: "MARRIOTT HOTELS", m: "Marriott" },
    ]);
    drafts.push({ acct: "card", amountCents: -rng.int(60_00, 320_00), description: trip.d, merchant: trip.m, recurringGroup: null });
  }

  return drafts;
}

function ensureSimAccounts(): Map<AcctKey, string> {
  const map = new Map<AcctKey, string>();
  const find = db.prepare("SELECT id FROM accounts WHERE source = 'sim' AND external_id = ?");
  const insert = db.prepare(
    `INSERT INTO accounts (id, source, external_id, name, type, institution_name, last_four, currency, current_balance_cents, available_balance_cents, synced_at)
     VALUES (@id, 'sim', @externalId, @name, @type, 'Chase', @lastFour, 'USD', @start, @start, datetime('now'))`,
  );
  for (const a of SIM_ACCOUNTS) {
    const existing = find.get(a.externalId) as { id: string } | undefined;
    if (existing) {
      map.set(a.key, existing.id);
    } else {
      const newId = id();
      insert.run({ id: newId, externalId: a.externalId, name: a.name, type: a.type, lastFour: a.lastFour, start: a.startBalanceCents });
      map.set(a.key, newId);
    }
  }
  return map;
}

function insertDrafts(dateISO: string, drafts: Draft[], accts: Map<AcctKey, string>): number {
  if (drafts.length === 0) return 0;
  const insert = db.prepare(
    `INSERT OR IGNORE INTO transactions
       (id, account_id, source, external_id, posted_at, amount_cents, description, merchant, category, category_source, pending, notes, recurring_group)
     VALUES (@id, @accountId, 'sim', @externalId, @postedAt, @amount, @description, @merchant, @category, 'sim', 0, NULL, @recurringGroup)`,
  );
  let n = 0;
  drafts.forEach((d, i) => {
    const { category } = categorize(`${d.description} ${d.merchant ?? ""}`, d.amountCents);
    const res = insert.run({
      id: id(),
      accountId: accts.get(d.acct),
      externalId: `${dateISO}:${d.acct}:${i}`,
      postedAt: dateISO,
      amount: d.amountCents,
      description: d.description,
      merchant: d.merchant,
      category: d.recurringGroup === "auto-save" || d.recurringGroup === "card-autopay" ? "Transfer" : category,
      recurringGroup: d.recurringGroup,
    });
    n += res.changes;
  });
  return n;
}

export function rebuildSimBalances(): void {
  const accts = ensureSimAccounts();
  const clearSnap = db.prepare("DELETE FROM balance_snapshots WHERE account_id = ?");
  const insSnap = db.prepare("INSERT OR REPLACE INTO balance_snapshots (id, account_id, date, balance_cents) VALUES (?, ?, ?, ?)");
  const setBal = db.prepare("UPDATE accounts SET current_balance_cents = ?, available_balance_cents = ?, synced_at = datetime('now') WHERE id = ?");

  const tx = db.transaction(() => {
    for (const a of SIM_ACCOUNTS) {
      const accountId = accts.get(a.key)!;
      clearSnap.run(accountId);
      const rows = db
        .prepare("SELECT posted_at, amount_cents FROM transactions WHERE account_id = ? ORDER BY posted_at ASC, created_at ASC")
        .all(accountId) as { posted_at: string; amount_cents: number }[];
      let bal = a.startBalanceCents;
      const byDay = new Map<string, number>();
      for (const r of rows) {
        bal += r.amount_cents;
        byDay.set(r.posted_at, bal);
      }
      for (const [date, b] of byDay) insSnap.run(id(), accountId, date, b);
      const available = a.type === "credit_card" ? CREDIT_LIMIT_CENTS + bal : bal;
      setBal.run(bal, available, accountId);
    }
  });
  tx();
}

function getSimState(): { seed: number; started_on: string; last_run_on: string } | undefined {
  return db.prepare("SELECT seed, started_on, last_run_on FROM sim_state WHERE id = 1").get() as
    | { seed: number; started_on: string; last_run_on: string }
    | undefined;
}

export function isSimSeeded(): boolean {
  const s = getSimState();
  const acct = db.prepare("SELECT COUNT(*) AS n FROM accounts WHERE source = 'sim'").get() as { n: number };
  return !!s && acct.n > 0;
}

/** Wipe and regenerate the whole simulation history. */
export function seedSimulation(opts: { reset?: boolean } = {}): { accounts: number; transactions: number } {
  const existing = getSimState();
  if (existing && !opts.reset) {
    return { accounts: SIM_ACCOUNTS.length, transactions: advanceSimulation().transactionsAdded };
  }

  const today = todayISO();
  const startedOn = addDays(today, -HISTORY_DAYS);
  const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;

  const wipe = db.transaction(() => {
    db.prepare("DELETE FROM transactions WHERE source = 'sim'").run();
    db.prepare("DELETE FROM balance_snapshots WHERE account_id IN (SELECT id FROM accounts WHERE source = 'sim')").run();
    db.prepare("DELETE FROM accounts WHERE source = 'sim'").run();
    db.prepare("INSERT OR REPLACE INTO sim_state (id, seed, started_on, last_run_on) VALUES (1, ?, ?, ?)").run(seed, startedOn, today);
  });
  wipe();

  const accts = ensureSimAccounts();
  let txnCount = 0;
  const gen = db.transaction(() => {
    for (let date = startedOn; date <= today; date = addDays(date, 1)) {
      txnCount += insertDrafts(date, generateDay(seed, startedOn, date), accts);
    }
  });
  gen();

  rebuildSimBalances();
  return { accounts: SIM_ACCOUNTS.length, transactions: txnCount };
}

/** Fill in any days between the last simulated transaction and today. */
export function advanceSimulation(): { transactionsAdded: number } {
  const state = getSimState();
  if (!state) {
    const r = seedSimulation();
    return { transactionsAdded: r.transactions };
  }
  const today = todayISO();
  const lastTxn = db.prepare("SELECT MAX(posted_at) AS d FROM transactions WHERE source = 'sim'").get() as { d: string | null };
  const from = lastTxn.d ? addDays(lastTxn.d, 1) : state.started_on;

  const accts = ensureSimAccounts();
  let added = 0;
  const gen = db.transaction(() => {
    for (let date = from; date <= today; date = addDays(date, 1)) {
      added += insertDrafts(date, generateDay(state.seed, state.started_on, date), accts);
    }
    db.prepare("UPDATE sim_state SET last_run_on = ? WHERE id = 1").run(today);
  });
  gen();

  rebuildSimBalances();
  return { transactionsAdded: added };
}

export function clearSimulation(): void {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM transactions WHERE source = 'sim'").run();
    db.prepare("DELETE FROM balance_snapshots WHERE account_id IN (SELECT id FROM accounts WHERE source = 'sim')").run();
    db.prepare("DELETE FROM accounts WHERE source = 'sim'").run();
    db.prepare("DELETE FROM sim_state WHERE id = 1").run();
  });
  tx();
}
