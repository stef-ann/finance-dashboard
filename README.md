# Finance Dashboard

A local-first personal finance dashboard. View and track spending, set savings
goals and spending caps, and see a "safe to spend" number for the rest of the
month.

It runs in one of two modes, toggled on the **Settings** page:

| Mode | Data | Needs |
| --- | --- | --- |
| **Simulation** (default) | Realistic sample Chase accounts + ~6 months of generated transactions | nothing |
| **Live** | Your real accounts — from **CSV imports** and/or [Teller](https://teller.io) | a CSV download, or a free Teller app + certificate |

Everything stays on your machine: a single SQLite file at
`packages/server/data/finance.db`. CSV import involves **no third party at all**.
The only outbound calls are to Teller's API, and only if you connect Teller.

---

## Requirements

- **Node.js ≥ 20.11** (LTS 24 recommended) — <https://nodejs.org>
- npm 10+ (ships with Node)

## Setup

```bash
npm install
npm run dev
```

- API server: <http://127.0.0.1:4000>
- Dashboard (Vite dev server, proxies `/api`): <http://127.0.0.1:5173>

On first run the simulation is seeded automatically. Open the dashboard and
you'll have accounts, transactions, charts, and recurring-bill detection to
play with immediately.

### Production-style run (single server)

```bash
npm run build     # builds the web app into packages/web/dist
npm start         # serves API + the built dashboard on http://127.0.0.1:4000
```

---

## Importing a CSV (no third party)

The simplest way to get real data in. On chase.com: open an account → **Activity**
→ the download icon → **Spreadsheet (CSV)** → pick a date range.

In the app: **Import** tab → drop the file. It auto‑detects the Chase
checking/savings and credit‑card formats (and most other banks). Check the
column mapping and the preview, choose or create an account, and import.

- Re‑importing an overlapping file is safe — duplicate rows are skipped.
- If the CSV has a running‑balance column (Chase checking/savings does), balance
  history is exact. Credit‑card CSVs have no balance column, so the balance is
  derived from the imported transactions.
- Importing switches the app to **Live** mode. Delete every imported account
  (and disconnect Teller) to go back to simulation.

---

## Connecting your real Chase account (live mode)

Chase has no public API. This app uses **Teller**, which brokers the bank
connection: you log into Chase inside Teller's popup, and the app only ever
receives an access token (stored **encrypted** in the SQLite file). Your Chase
credentials never touch this app.

1. Create a free application at <https://teller.io>.
2. Copy the **Application ID** (`app_…`) into `packages/server/.env`:
   ```
   TELLER_APPLICATION_ID=app_xxxxxxxx
   ```
3. In the Teller dashboard, open **Application → Certificates**, download the
   certificate + private key, and drop them in `certs/` (see `certs/README.md`).
   Teller needs this mTLS cert for **every** environment, sandbox included.
4. Restart the server.
5. In the app: **Settings → Connect Chase with Teller**, complete the popup, then
   flip the mode toggle to **Live**.

`TELLER_ENVIRONMENT` can be `sandbox` (fake bank logins for testing),
`development` (real banks, free, limited enrollments), or `production`.

To go back to sample data, switch the toggle to **Simulation** or hit
**Disconnect** — your Teller data is wiped locally and the simulation returns.

---

## How it works

```
Chase ──▶ Teller ──▶  packages/server  ──▶  SQLite (finance.db)
(live mode)           Fastify + better-sqlite3      │
                                                    ▼
                      packages/web  ◀── /api ──  Fastify
                      React + Vite + Recharts
```

| Path | What |
| --- | --- |
| `shared/` | Types + category list shared by both sides |
| `packages/server/src/services/simulation.ts` | Deterministic sample-data generator |
| `packages/server/src/services/csv.ts` + `import.ts` | CSV parsing, column detection, dedupe, balance rebuild |
| `packages/server/src/services/scope.ts` | Picks which data sources the current mode shows |
| `packages/server/src/services/teller.ts` | Teller API client + enrollment storage (token encrypted with AES-256-GCM) |
| `packages/server/src/services/categorize.ts` | Keyword rule engine (editable in-app) |
| `packages/server/src/services/recurring.ts` | Recurring-charge / subscription detection |
| `packages/server/src/services/summary.ts` | Dashboard aggregates, budget, safe-to-spend |
| `packages/server/src/services/allocations.ts` | Splitting the balance into buckets + spent tracking |
| `packages/web/src/pages/` | Dashboard · Transactions · Budget · Goals · Import · Settings |

**Safe to spend** = checking balance − recurring bills still due before month end.

**Budget (balance allocation)** — split a chosen pool into named buckets.
- Pool is one of: checking balance, checking + savings, total balance, or your
  monthly budget number (picker on the page).
- Each bucket has an amount; the page shows how much of the pool is assigned vs
  still free (and warns if you over-allocate).
- Link a bucket to a category and it tracks that category's spend this month
  against the bucket amount.
- **Auto from last 3 months** seeds one bucket per category at its recent average
  spend.

**Goals**
- *Savings target* — progress tracks a savings account balance; shows the
  monthly contribution needed to hit the target by its date.
- *Spending cap* — a soft alert: this month's spend in a category vs a limit.
  (Overlaps with a category-linked budget bucket — use whichever framing you
  prefer.)

## Common tasks

```bash
npm run typecheck        # type-check server + web
npm run reset-db         # delete the local DB (re-seeds on next start)
```

Re-generate a fresh random simulation history from **Settings → Regenerate
sample data**.

## Troubleshooting

- **`npm install` prints "packages have install scripts not yet covered by
  allowScripts"** — newer npm gates native build scripts. `better-sqlite3` and
  `esbuild` are pre-approved in `package.json`; if the versions drift, run
  `npm install-scripts approve better-sqlite3 esbuild` then `npm install` again.
- **`better-sqlite3` fails to load / `NODE_MODULE_VERSION` mismatch** — you
  switched Node major versions. Run `npm rebuild better-sqlite3` (needs the
  prebuilt binary for your Node version, which exists for all current LTS
  releases; otherwise install the "Desktop development with C++" workload from
  Visual Studio Build Tools).
- **Port already in use** — change `PORT` in `packages/server/.env` (the web dev
  server reads it too).

## Notes / limits

- Single user, no auth — it binds to `127.0.0.1` only. Don't expose it.
- The web bundle is ~650 kB (Recharts). Fine for local use; code-split later if
  it matters.
- `packages/server/.env`, `certs/*`, and `packages/server/data/` are git-ignored.
