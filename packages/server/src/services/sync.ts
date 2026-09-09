import { todayISO } from "../lib/dates.ts";
import type { SyncResult } from "../shared.ts";
import { getSettings } from "./settings.ts";
import { advanceSimulation, isSimSeeded, seedSimulation } from "./simulation.ts";
import { isTellerConnected, syncFromTeller } from "./teller.ts";

export async function runSync(): Promise<SyncResult> {
  const settings = getSettings();
  const ranAt = new Date().toISOString();

  if (settings.mode === "live") {
    if (!isTellerConnected()) {
      return {
        mode: "live",
        accountsUpserted: 0,
        transactionsAdded: 0,
        ranAt,
        message: settings.hasLiveData
          ? "Nothing to auto-sync — CSV data updates when you import a new file. Connect Chase to pull live."
          : "Live mode is on but no data source is set up. Connect Chase or import a CSV from Settings.",
      };
    }
    const r = await syncFromTeller();
    return {
      mode: "live",
      accountsUpserted: r.accountsUpserted,
      transactionsAdded: r.transactionsAdded,
      ranAt,
      message: `Synced ${r.accountsUpserted} account(s) from ${r.institution ?? "your bank"}.`,
    };
  }

  // Simulation mode
  if (!isSimSeeded()) {
    const r = seedSimulation({ reset: true });
    return {
      mode: "simulation",
      accountsUpserted: r.accounts,
      transactionsAdded: r.transactions,
      ranAt,
      message: `Simulation ready: ${r.accounts} accounts, ${r.transactions} transactions through ${todayISO()}.`,
    };
  }
  const r = advanceSimulation();
  return {
    mode: "simulation",
    accountsUpserted: 3,
    transactionsAdded: r.transactionsAdded,
    ranAt,
    message:
      r.transactionsAdded > 0
        ? `Simulation advanced to ${todayISO()} (+${r.transactionsAdded} transactions).`
        : `Simulation already up to date (${todayISO()}).`,
  };
}
