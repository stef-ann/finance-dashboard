import { NavLink, Route, Routes } from "react-router-dom";
import { useSettings, useSync } from "./queries.ts";
import { Button, Spinner } from "./components/ui.tsx";
import { Dashboard } from "./pages/Dashboard.tsx";
import { TransactionsPage } from "./pages/Transactions.tsx";
import { GoalsPage } from "./pages/Goals.tsx";
import { BudgetPage } from "./pages/Budget.tsx";
import { ScheduledPage } from "./pages/Scheduled.tsx";
import { SettingsPage } from "./pages/Settings.tsx";
import { ImportPage } from "./pages/Import.tsx";

const navItems = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/transactions", label: "Transactions" },
  { to: "/budget", label: "Budget" },
  { to: "/scheduled", label: "Scheduled" },
  { to: "/goals", label: "Goals" },
  { to: "/import", label: "Import" },
  { to: "/settings", label: "Settings" },
];

export function App() {
  const settings = useSettings();
  const sync = useSync();

  const mode = settings.data?.mode ?? "simulation";
  const institution = settings.data?.tellerInstitution;

  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col px-4 pb-16 pt-5 sm:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--accent)] text-lg font-bold text-white">
            $
          </div>
          <div>
            <div className="text-base font-semibold leading-tight">Finance Dashboard</div>
            <div className="text-xs" style={{ color: "var(--muted)" }}>
              {mode === "live"
                ? `Live · ${institution ?? "bank connected"}`
                : "Simulation mode · sample data"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {sync.isPending ? (
            <Spinner label="Syncing…" />
          ) : (
            <Button variant="ghost" onClick={() => sync.mutate()}>
              ↻ Sync
            </Button>
          )}
        </div>
      </header>

      {sync.data?.message && (
        <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs" style={{ color: "var(--muted)" }}>
          {sync.data.message}
        </div>
      )}

      <nav className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 text-sm">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `whitespace-nowrap rounded-lg px-3 py-1.5 font-medium transition ${
                isActive ? "bg-[var(--accent)] text-white" : "hover:bg-[var(--bg)]"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/budget" element={<BudgetPage />} />
          <Route path="/scheduled" element={<ScheduledPage />} />
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}
