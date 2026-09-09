// Types shared between the server and the web client.
// Consumed as source by both (tsx on the server, Vite on the web) — no build step.

export type AppMode = "simulation" | "live";

export type AccountType = "checking" | "savings" | "credit_card" | "other";
export type DataSource = "sim" | "teller" | "csv";

export interface Account {
  id: string;
  source: DataSource;
  name: string;
  type: AccountType;
  institutionName: string;
  lastFour: string | null;
  currency: string;
  /** Current balance in cents. Negative for credit cards means money owed. */
  currentBalanceCents: number;
  /** What you can actually spend right now, in cents. */
  availableBalanceCents: number;
  syncedAt: string | null;
}

export type CategorySource = "sim" | "teller" | "csv" | "rule" | "manual";

export interface Transaction {
  id: string;
  accountId: string;
  source: DataSource;
  /** ISO date (YYYY-MM-DD) the transaction posted. */
  postedAt: string;
  /** Signed amount in cents. Negative = money out, positive = money in. */
  amountCents: number;
  description: string;
  merchant: string | null;
  category: string;
  categorySource: CategorySource;
  pending: boolean;
  notes: string | null;
  recurringGroup: string | null;
}

export type CategoryKind = "expense" | "income" | "transfer";

export interface Category {
  name: string;
  kind: CategoryKind;
  color: string;
}

export interface CategoryRule {
  id: string;
  pattern: string;
  category: string;
  priority: number;
  createdAt: string;
}

export type GoalType = "savings" | "spending_cap";

export interface Goal {
  id: string;
  type: GoalType;
  name: string;
  /** For spending caps: the category being capped. For savings: optional tag. */
  category: string | null;
  accountId: string | null;
  targetCents: number;
  /** Cached progress in cents, refreshed on read. */
  currentCents: number;
  targetDate: string | null;
  createdAt: string;
}

export type AllocationBasis = "checking" | "spendable" | "total" | "budget";

export interface Settings {
  mode: AppMode;
  currency: string;
  monthlyBudgetCents: number;
  allocationBasis: AllocationBasis;
  tellerEnvironment: "sandbox" | "development" | "production";
  tellerConnected: boolean;
  tellerInstitution: string | null;
  tellerConfigured: boolean;
  /** Number of accounts populated from CSV imports. */
  importedAccounts: number;
  /** True when live mode has any data to show (Teller and/or CSV). */
  hasLiveData: boolean;
}

export type CsvField = "date" | "description" | "amount" | "amountOut" | "amountIn" | "category" | "balance" | "ignore";

export interface CsvColumnMapping {
  /** Header name (or "col N") -> what that column means. */
  [column: string]: CsvField;
}

export interface CsvPreviewRow {
  postedAt: string | null;
  amountCents: number | null;
  description: string;
  category: string;
  balanceCents: number | null;
  raw: string[];
  problem: string | null;
}

export interface CsvPreview {
  detectedFormat: string;
  headers: string[];
  mapping: CsvColumnMapping;
  rows: CsvPreviewRow[];
  totalRows: number;
  validRows: number;
  dateRange: { from: string; to: string } | null;
  hasRunningBalance: boolean;
}

export interface CsvImportResult {
  accountId: string;
  accountName: string;
  added: number;
  skippedDuplicates: number;
  skippedInvalid: number;
}

export interface CategorySpend {
  category: string;
  color: string;
  spentCents: number;
  txnCount: number;
}

export interface MonthlyPoint {
  month: string; // YYYY-MM
  incomeCents: number;
  spendingCents: number;
  netCents: number;
}

export interface RecurringCharge {
  merchant: string;
  category: string;
  averageCents: number;
  cadenceDays: number;
  lastSeen: string;
  nextEstimated: string;
  occurrences: number;
}

export type ScheduleUnit = "day" | "week" | "month" | "year";

export interface ScheduledPayment {
  id: string;
  name: string;
  /** Signed amount in cents. Negative = money out, positive = money in. */
  amountCents: number;
  category: string;
  /** Repeats every `intervalCount` × `intervalUnit`. */
  intervalCount: number;
  intervalUnit: ScheduleUnit;
  /** Anchor / first occurrence, YYYY-MM-DD. */
  startDate: string;
  /** Optional last date it applies, YYYY-MM-DD. */
  endDate: string | null;
  autopayAccountId: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  // ---- computed ----
  color: string;
  /** First occurrence on/after today (within endDate), or null if finished. */
  nextOccurrence: string | null;
  /** Normalised to a per-month figure for totals/UI. */
  monthlyEquivalentCents: number;
  intervalLabel: string;
}

export interface ScheduledOccurrence {
  scheduledId: string;
  name: string;
  category: string;
  color: string;
  amountCents: number;
  date: string;
  intervalLabel: string;
}

export interface Summary {
  month: string; // YYYY-MM
  daysLeftInMonth: number;
  totalBalanceCents: number;
  /** Checking + savings available balances. */
  spendableBalanceCents: number;
  /** Checking accounts only — the basis for "safe to spend". */
  checkingBalanceCents: number;
  incomeThisMonthCents: number;
  spendingThisMonthCents: number;
  netThisMonthCents: number;
  monthlyBudgetCents: number;
  budgetRemainingCents: number;
  /** spendable - upcoming recurring (rest of month) - budget remaining */
  safeToSpendCents: number;
  /** Recurring charges + user-scheduled payments still due before month end. */
  upcomingRecurringCents: number;
  byCategory: CategorySpend[];
  trend: MonthlyPoint[];
  recurring: RecurringCharge[];
  /** Upcoming user-scheduled payments (next ~35 days). */
  scheduled: ScheduledOccurrence[];
}

export interface Allocation {
  id: string;
  name: string;
  /** Optional linked category — when set, `spentCents` tracks that category this month. */
  category: string | null;
  color: string;
  amountCents: number;
  /** Spend in the linked category so far this month (0 when unlinked). */
  spentCents: number;
  /** amountCents - spentCents (can go negative when over budget). */
  remainingCents: number;
  sortOrder: number;
}

export interface AllocationPlan {
  basis: AllocationBasis;
  basisLabel: string;
  /** The pool being divided up, in cents. */
  basisBalanceCents: number;
  allocatedCents: number;
  /** basisBalanceCents - allocatedCents (negative means over-allocated). */
  unallocatedCents: number;
  overAllocated: boolean;
  totalSpentCents: number;
  allocations: Allocation[];
}

export interface SyncResult {
  mode: AppMode;
  accountsUpserted: number;
  transactionsAdded: number;
  ranAt: string;
  message: string;
}
