import { db } from "../db.ts";
import { getTellerConfig } from "../config.ts";
import { isTellerConnected, getStoredEnrollment } from "./teller.ts";
import type { AllocationBasis, AppMode, Settings } from "../shared.ts";

const ALLOCATION_BASES: AllocationBasis[] = ["checking", "spendable", "total", "budget"];

function countCsvAccounts(): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM accounts WHERE source = 'csv'").get() as { n: number }).n;
}
function countLiveAccounts(): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM accounts WHERE source IN ('teller','csv')").get() as { n: number }).n;
}

interface SettingsRow {
  id: number;
  mode: string;
  currency: string;
  monthly_budget_cents: number;
  allocation_basis: string;
  teller_environment: string;
  updated_at: string;
}

export function getSettings(): Settings {
  const row = db.prepare("SELECT * FROM settings WHERE id = 1").get() as SettingsRow;
  const cfg = getTellerConfig();
  const enrollment = getStoredEnrollment();
  return {
    mode: row.mode === "live" ? "live" : "simulation",
    currency: row.currency,
    monthlyBudgetCents: row.monthly_budget_cents,
    allocationBasis: (ALLOCATION_BASES.includes(row.allocation_basis as AllocationBasis)
      ? row.allocation_basis
      : "spendable") as AllocationBasis,
    tellerEnvironment: (cfg.environment ?? row.teller_environment) as Settings["tellerEnvironment"],
    tellerConnected: isTellerConnected(),
    tellerInstitution: enrollment?.institutionName ?? null,
    tellerConfigured: Boolean(cfg.applicationId),
    importedAccounts: countCsvAccounts(),
    hasLiveData: countLiveAccounts() > 0,
  };
}

export function updateSettings(
  patch: Partial<{ mode: AppMode; currency: string; monthlyBudgetCents: number; allocationBasis: AllocationBasis }>,
): Settings {
  const current = db.prepare("SELECT * FROM settings WHERE id = 1").get() as SettingsRow;
  const mode = patch.mode ?? (current.mode as AppMode);
  const currency = patch.currency ?? current.currency;
  const budget = patch.monthlyBudgetCents ?? current.monthly_budget_cents;
  const basis =
    patch.allocationBasis && ALLOCATION_BASES.includes(patch.allocationBasis)
      ? patch.allocationBasis
      : current.allocation_basis;
  db.prepare(
    "UPDATE settings SET mode = ?, currency = ?, monthly_budget_cents = ?, allocation_basis = ?, updated_at = datetime('now') WHERE id = 1",
  ).run(mode, currency, Math.max(0, Math.round(budget)), basis);
  return getSettings();
}
