import type {
  Account,
  AccountType,
  AllocationBasis,
  AllocationPlan,
  Category,
  CategoryRule,
  CsvColumnMapping,
  CsvImportResult,
  CsvPreview,
  Goal,
  GoalType,
  ScheduledPayment,
  ScheduleUnit,
  Settings,
  Summary,
  SyncResult,
  Transaction,
} from "./types.ts";

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

function errorText(err: unknown): string | null {
  if (!err) return null;
  if (typeof err === "string") return err;
  // Zod flatten shape: { formErrors: [], fieldErrors: { field: [msg] } }
  if (typeof err === "object") {
    const e = err as { formErrors?: string[]; fieldErrors?: Record<string, string[]> };
    const parts = [
      ...(e.formErrors ?? []),
      ...Object.entries(e.fieldErrors ?? {}).map(([k, v]) => `${k}: ${v.join(", ")}`),
    ];
    if (parts.length) return parts.join("; ");
  }
  return null;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: unknown };
    throw new Error(errorText(body.error) ?? `${res.status} ${res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface TellerConfig {
  applicationId: string | null;
  environment: "sandbox" | "development" | "production";
  configured: boolean;
  needsClientCert: boolean;
  connected: boolean;
  institution: string | null;
}

export const api = {
  settings: () => req<Settings>("/settings"),
  updateSettings: (patch: Partial<Pick<Settings, "mode" | "currency" | "monthlyBudgetCents" | "allocationBasis">>) =>
    req<Settings>("/settings", { method: "PUT", body: JSON.stringify(patch) }),

  categories: () => req<Category[]>("/categories"),
  accounts: () => req<Account[]>("/accounts"),
  importedAccounts: () => req<Account[]>("/accounts/imported"),
  balanceHistory: (days = 90) => req<{ date: string; balanceCents: number }[]>(`/accounts/history?days=${days}`),
  createAccount: (input: { name: string; type: AccountType; institutionName?: string }) =>
    req<Account>("/accounts", { method: "POST", body: JSON.stringify(input) }),
  deleteAccount: (id: string) => req<{ ok: true }>(`/accounts/${id}`, { method: "DELETE" }),

  importPreview: (csv: string, mapping?: CsvColumnMapping) =>
    req<CsvPreview>("/import/preview", { method: "POST", body: JSON.stringify({ csv, mapping }) }),
  importCommit: (csv: string, accountId: string, mapping?: CsvColumnMapping) =>
    req<CsvImportResult>("/import/commit", { method: "POST", body: JSON.stringify({ csv, accountId, mapping }) }),

  summary: (month?: string) => req<Summary>(`/summary${month ? `?month=${month}` : ""}`),

  transactions: (params: Record<string, string | number | undefined> = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== "") as [string, string][],
    ).toString();
    return req<{ transactions: Transaction[]; total: number }>(`/transactions${qs ? `?${qs}` : ""}`);
  },
  updateTransaction: (id: string, patch: { category?: string; notes?: string | null }) =>
    req<Transaction>(`/transactions/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  goals: () => req<Goal[]>("/goals"),
  createGoal: (input: {
    type: GoalType;
    name: string;
    targetCents: number;
    category?: string | null;
    accountId?: string | null;
    targetDate?: string | null;
  }) => req<Goal>("/goals", { method: "POST", body: JSON.stringify(input) }),
  updateGoal: (id: string, patch: Record<string, unknown>) =>
    req<Goal>(`/goals/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteGoal: (id: string) => req<{ ok: true }>(`/goals/${id}`, { method: "DELETE" }),

  allocations: () => req<AllocationPlan>("/allocations"),
  createAllocation: (input: { name: string; category?: string | null; amountCents: number }) =>
    req<AllocationPlan>("/allocations", { method: "POST", body: JSON.stringify(input) }),
  updateAllocation: (id: string, patch: { name?: string; category?: string | null; amountCents?: number }) =>
    req<AllocationPlan>(`/allocations/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteAllocation: (id: string) => req<AllocationPlan>(`/allocations/${id}`, { method: "DELETE" }),
  clearAllocations: () => req<AllocationPlan>("/allocations", { method: "DELETE" }),
  autoAllocate: () => req<AllocationPlan>("/allocations/auto", { method: "POST" }),
  distributeEvenly: () => req<AllocationPlan>("/allocations/distribute-evenly", { method: "POST" }),
  setAllocationBasis: (allocationBasis: AllocationBasis) =>
    req<Settings>("/settings", { method: "PUT", body: JSON.stringify({ allocationBasis }) }),

  scheduled: () => req<ScheduledPayment[]>("/scheduled"),
  createScheduled: (input: ScheduledInput) =>
    req<ScheduledPayment>("/scheduled", { method: "POST", body: JSON.stringify(input) }),
  updateScheduled: (id: string, patch: Partial<ScheduledInput>) =>
    req<ScheduledPayment>(`/scheduled/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteScheduled: (id: string) => req<{ ok: true }>(`/scheduled/${id}`, { method: "DELETE" }),

  rules: () => req<CategoryRule[]>("/rules"),
  createRule: (input: { pattern: string; category: string; priority?: number }) =>
    req<{ ok: true; recategorized: number }>("/rules", { method: "POST", body: JSON.stringify(input) }),
  deleteRule: (id: string) => req<{ ok: true }>(`/rules/${id}`, { method: "DELETE" }),

  sync: () => req<SyncResult>("/sync", { method: "POST" }),
  resetSimulation: () => req<{ ok: true }>("/simulation/reset", { method: "POST" }),

  tellerConfig: () => req<TellerConfig>("/teller/config"),
  connectTeller: (input: { accessToken: string; enrollmentId?: string | null; userId?: string | null; institutionName?: string | null }) =>
    req<{ ok: true; institution: string | null; synced: { accounts: number; transactions: number } | null }>(
      "/teller/enrollment",
      { method: "POST", body: JSON.stringify(input) },
    ),
  disconnectTeller: () => req<{ ok: true }>("/teller/enrollment", { method: "DELETE" }),
};
