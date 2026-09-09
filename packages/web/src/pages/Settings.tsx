import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.ts";
import { useSettings, useTellerConfig, useSync } from "../queries.ts";
import { Button, Card, CardTitle, Spinner } from "../components/ui.tsx";
import { TellerConnectButton } from "../components/TellerConnect.tsx";
import { money } from "../lib/format.ts";

function ModeToggle() {
  const settings = useSettings();
  const sync = useSync();
  const qc = useQueryClient();
  const mode = settings.data?.mode ?? "simulation";

  const setMode = useMutation({
    mutationFn: (m: "simulation" | "live") => api.updateSettings({ mode: m }),
    onSuccess: async () => {
      await qc.invalidateQueries();
      sync.mutate();
    },
  });

  const canGoLive = settings.data?.hasLiveData ?? false;
  const liveSummary = settings.data?.tellerInstitution
    ? `Connected to ${settings.data.tellerInstitution}`
    : `${settings.data?.importedAccounts ?? 0} imported account(s)`;

  return (
    <Card>
      <CardTitle>Data mode</CardTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          onClick={() => setMode.mutate("simulation")}
          className="rounded-xl border p-4 text-left transition"
          style={{
            borderColor: mode === "simulation" ? "var(--accent)" : "var(--border)",
            background: mode === "simulation" ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "transparent",
          }}
        >
          <div className="text-sm font-semibold">Simulation</div>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            Realistic sample accounts and ~6 months of transactions. Nothing leaves your machine. Great for trying things out.
          </p>
        </button>

        <button
          onClick={() => canGoLive && setMode.mutate("live")}
          className="rounded-xl border p-4 text-left transition disabled:opacity-60"
          disabled={!canGoLive}
          style={{
            borderColor: mode === "live" ? "var(--accent)" : "var(--border)",
            background: mode === "live" ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "transparent",
            cursor: canGoLive ? "pointer" : "not-allowed",
          }}
        >
          <div className="text-sm font-semibold">Live · your data</div>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            {canGoLive
              ? `${liveSummary}. Your real balances and transactions.`
              : "Connect Chase below, or import a CSV, to enable live mode."}
          </p>
        </button>
      </div>
      <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
        Two ways to get real data in: connect Chase via Teller below, or{" "}
        <Link to="/import" style={{ color: "var(--accent)" }}>import a CSV</Link> (no third party).
      </p>
      {setMode.isPending && <div className="mt-3"><Spinner label="Switching…" /></div>}
    </Card>
  );
}

function TellerSetup() {
  const teller = useTellerConfig();
  const qc = useQueryClient();
  const disconnect = useMutation({
    mutationFn: api.disconnectTeller,
    onSuccess: () => qc.invalidateQueries(),
  });

  if (teller.isLoading || !teller.data) return <Card><Spinner /></Card>;
  const cfg = teller.data;

  return (
    <Card>
      <CardTitle>Bank connection (Teller)</CardTitle>

      {!cfg.configured ? (
        <div className="text-sm" style={{ color: "var(--muted)" }}>
          <p className="mb-2">
            To link your real Chase account you need a free Teller application ID:
          </p>
          <ol className="ml-4 list-decimal space-y-1">
            <li>Sign up at <span style={{ color: "var(--accent)" }}>teller.io</span> and create an application.</li>
            <li>Copy the <code>application_id</code> (looks like <code>app_xxx</code>).</li>
            <li>
              Put it in <code>packages/server/.env</code> as <code>TELLER_APPLICATION_ID=app_xxx</code>.
            </li>
            <li>
              Download the certificate + private key (Application → Certificates) and set
              <code>TELLER_CERT_PATH</code> / <code>TELLER_KEY_PATH</code> to the <code>.pem</code> files. Teller needs
              this for every environment, sandbox included.
            </li>
            <li>Restart the server.</li>
          </ol>
          <p className="mt-3">Until then, the app stays in simulation mode.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            Environment: <b>{cfg.environment}</b>
            {cfg.needsClientCert && (
              <span style={{ color: "var(--negative)" }}>
                {" "}
                · client certificate not found — set TELLER_CERT_PATH / TELLER_KEY_PATH
              </span>
            )}
          </div>

          {cfg.connected ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm">
                ✓ Connected to <b>{cfg.institution ?? "your bank"}</b>
              </span>
              <Button variant="danger" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
                {disconnect.isPending ? "Disconnecting…" : "Disconnect"}
              </Button>
            </div>
          ) : null}

          <TellerConnectButton config={cfg} />

          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Teller handles the Chase login. This app only ever stores an access token, encrypted on disk — never your
            banking credentials.
          </p>
        </div>
      )}
    </Card>
  );
}

function BudgetSetting() {
  const settings = useSettings();
  const qc = useQueryClient();
  const [value, setValue] = useState("");

  useEffect(() => {
    if (settings.data) setValue(String(Math.round(settings.data.monthlyBudgetCents / 100)));
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () => api.updateSettings({ monthlyBudgetCents: Math.round(parseFloat(value || "0") * 100) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }).then(() => qc.invalidateQueries({ queryKey: ["summary"] })),
  });

  return (
    <Card>
      <CardTitle>Monthly spending budget</CardTitle>
      <form
        className="flex items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <label className="text-sm">
          <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Target ($ / month)</span>
          <input
            type="number"
            min="0"
            step="50"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-40 rounded-md border bg-transparent px-2 py-1.5 tnum"
            style={{ borderColor: "var(--border)" }}
          />
        </label>
        <Button type="submit" disabled={save.isPending}>Save</Button>
        {settings.data && (
          <span className="pb-1.5 text-xs" style={{ color: "var(--muted)" }}>
            currently {money(settings.data.monthlyBudgetCents, { cents: false })}
          </span>
        )}
      </form>
    </Card>
  );
}

function DangerZone() {
  const qc = useQueryClient();
  const reset = useMutation({
    mutationFn: api.resetSimulation,
    onSuccess: () => qc.invalidateQueries(),
  });
  return (
    <Card>
      <CardTitle>Simulation data</CardTitle>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" onClick={() => reset.mutate()} disabled={reset.isPending}>
          {reset.isPending ? "Regenerating…" : "Regenerate sample data"}
        </Button>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          Builds a fresh random 6-month history. Only affects simulation mode.
        </span>
      </div>
    </Card>
  );
}

export function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <ModeToggle />
      <TellerSetup />
      <BudgetSetting />
      <DangerZone />
    </div>
  );
}
