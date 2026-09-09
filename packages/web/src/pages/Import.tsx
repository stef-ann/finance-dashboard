import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AccountType, CsvColumnMapping, CsvField, CsvImportResult, CsvPreview } from "../types.ts";
import { api } from "../api.ts";
import { useImportedAccounts } from "../queries.ts";
import { Button, Card, CardTitle, Spinner } from "../components/ui.tsx";
import { money, dateLabel } from "../lib/format.ts";
import { categoryColor } from "../types.ts";

const FIELD_LABELS: Record<CsvField, string> = {
  date: "Date",
  description: "Description",
  amount: "Amount (signed)",
  amountOut: "Amount out / debit",
  amountIn: "Amount in / credit",
  category: "Category",
  balance: "Running balance",
  ignore: "— ignore —",
};
const FIELD_OPTIONS = Object.keys(FIELD_LABELS) as CsvField[];
const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: "checking", label: "Checking" },
  { value: "savings", label: "Savings" },
  { value: "credit_card", label: "Credit card" },
  { value: "other", label: "Other" },
];

function ImportedAccounts() {
  const accounts = useImportedAccounts();
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: (id: string) => api.deleteAccount(id),
    onSuccess: () => qc.invalidateQueries(),
  });
  if (!accounts.data || accounts.data.length === 0) return null;
  return (
    <Card>
      <CardTitle>Imported accounts</CardTitle>
      <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
        {accounts.data.map((a) => (
          <li key={a.id} className="flex items-center justify-between py-2 text-sm">
            <span>
              <span className="font-medium">{a.name}</span>{" "}
              <span style={{ color: "var(--muted)" }}>
                · {a.type.replace("_", " ")} · {money(a.currentBalanceCents)}
              </span>
            </span>
            <button
              onClick={() => del.mutate(a.id)}
              className="text-xs"
              style={{ color: "var(--negative)" }}
              title="Delete account and its transactions"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function ImportPage() {
  const qc = useQueryClient();
  const accounts = useImportedAccounts();
  const fileRef = useRef<HTMLInputElement>(null);
  const csvRef = useRef<string>("");

  const [fileName, setFileName] = useState<string>("");
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [mapping, setMapping] = useState<CsvColumnMapping>({});
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CsvImportResult | null>(null);

  const [target, setTarget] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<AccountType>("checking");

  const runPreview = useMutation({
    mutationFn: (m?: CsvColumnMapping) => api.importPreview(csvRef.current, m),
    onSuccess: (p) => {
      setPreview(p);
      setMapping(p.mapping);
      setError(null);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Could not read that file."),
  });

  const commit = useMutation({
    mutationFn: async () => {
      let accountId = target;
      if (target === "__new__") {
        const acct = await api.createAccount({ name: newName.trim() || "Imported account", type: newType });
        accountId = acct.id;
      }
      return api.importCommit(csvRef.current, accountId, mapping);
    },
    onSuccess: async (r) => {
      setResult(r);
      setPreview(null);
      csvRef.current = "";
      setFileName("");
      setTarget("");
      await qc.invalidateQueries();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Import failed."),
  });

  const onFile = useCallback((file: File) => {
    setResult(null);
    setError(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      csvRef.current = String(reader.result ?? "");
      runPreview.mutate(undefined);
    };
    reader.onerror = () => setError("Could not read that file.");
    reader.readAsText(file);
  }, [runPreview]);

  const changeMapping = (col: string, field: CsvField) => {
    const next = { ...mapping, [col]: field };
    setMapping(next);
    runPreview.mutate(next);
  };

  const canCommit = !!preview && preview.validRows > 0 && target.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardTitle>Import transactions from CSV</CardTitle>
        <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>
          Download a CSV from Chase (Activity → the download icon → “Spreadsheet (CSV)”) for a checking, savings, or
          credit‑card account, then drop it here. Re‑importing the same file is safe — duplicates are skipped.
        </p>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) onFile(f);
          }}
          onClick={() => fileRef.current?.click()}
          className="cursor-pointer rounded-xl border border-dashed p-6 text-center text-sm"
          style={{ borderColor: "var(--border)", color: "var(--muted)" }}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
          {fileName ? <span style={{ color: "var(--text)" }}>{fileName}</span> : "Drop a .csv file here, or click to choose"}
        </div>

        {runPreview.isPending && <div className="mt-3"><Spinner label="Reading…" /></div>}
        {error && <p className="mt-3 text-sm" style={{ color: "var(--negative)" }}>{error}</p>}
      </Card>

      {result && (
        <Card>
          <div className="text-sm">
            <span className="font-semibold" style={{ color: "var(--positive)" }}>
              Imported {result.added} transaction{result.added === 1 ? "" : "s"}
            </span>{" "}
            into <b>{result.accountName}</b>.
            {result.skippedDuplicates > 0 && ` ${result.skippedDuplicates} duplicate(s) skipped.`}
            {result.skippedInvalid > 0 && ` ${result.skippedInvalid} unreadable row(s) skipped.`}
          </div>
          <div className="mt-2">
            <Link to="/" className="text-sm font-medium" style={{ color: "var(--accent)" }}>
              View dashboard →
            </Link>
          </div>
        </Card>
      )}

      {preview && (
        <>
          <Card>
            <CardTitle>2 · Check the columns</CardTitle>
            <div className="mb-3 text-xs" style={{ color: "var(--muted)" }}>
              Detected: <b>{preview.detectedFormat}</b> · {preview.validRows}/{preview.totalRows} rows readable
              {preview.dateRange && ` · ${dateLabel(preview.dateRange.from)} – ${dateLabel(preview.dateRange.to)}`}
              {preview.hasRunningBalance && " · running balance found"}
            </div>
            <div className="flex flex-wrap gap-2">
              {preview.headers.map((h) => (
                <label key={h} className="text-xs">
                  <span className="mb-1 block" style={{ color: "var(--muted)" }}>{h}</span>
                  <select
                    value={mapping[h] ?? "ignore"}
                    onChange={(e) => changeMapping(h, e.target.value as CsvField)}
                    className="rounded-md border bg-transparent px-1.5 py-1"
                    style={{ borderColor: "var(--border)" }}
                  >
                    {FIELD_OPTIONS.map((f) => (
                      <option key={f} value={f}>{FIELD_LABELS[f]}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase" style={{ color: "var(--muted)" }}>
                    <th className="py-1 pr-3">Date</th>
                    <th className="py-1 pr-3">Description</th>
                    <th className="py-1 pr-3">Category</th>
                    <th className="py-1 pl-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 15).map((r, i) => (
                    <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="py-1 pr-3 tnum" style={{ color: r.problem ? "var(--negative)" : "var(--muted)" }}>
                        {r.postedAt ?? "—"}
                      </td>
                      <td className="py-1 pr-3">{r.description || "—"}</td>
                      <td className="py-1 pr-3">
                        <span style={{ color: categoryColor(r.category) }}>{r.category}</span>
                      </td>
                      <td className="py-1 pl-3 text-right tnum">
                        {r.amountCents == null ? (
                          <span style={{ color: "var(--negative)" }}>{r.problem}</span>
                        ) : (
                          money(r.amountCents, { sign: true })
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.totalRows > 15 && (
                <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                  …and {preview.totalRows - 15} more rows.
                </p>
              )}
            </div>
          </Card>

          <Card>
            <CardTitle>3 · Import into</CardTitle>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm">
                <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Account</span>
                <select
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  className="rounded-md border bg-transparent px-2 py-1.5"
                  style={{ borderColor: "var(--border)" }}
                >
                  <option value="">Choose…</option>
                  {(accounts.data ?? []).map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                  <option value="__new__">＋ New account…</option>
                </select>
              </label>

              {target === "__new__" && (
                <>
                  <label className="text-sm">
                    <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Name</span>
                    <input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Chase Checking"
                      className="rounded-md border bg-transparent px-2 py-1.5"
                      style={{ borderColor: "var(--border)" }}
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Type</span>
                    <select
                      value={newType}
                      onChange={(e) => setNewType(e.target.value as AccountType)}
                      className="rounded-md border bg-transparent px-2 py-1.5"
                      style={{ borderColor: "var(--border)" }}
                    >
                      {ACCOUNT_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}

              <Button onClick={() => commit.mutate()} disabled={!canCommit || commit.isPending}>
                {commit.isPending ? "Importing…" : `Import ${preview.validRows} transactions`}
              </Button>
            </div>
            <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
              Importing switches the app to <b>Live</b> mode so your real data shows on the dashboard.
            </p>
          </Card>
        </>
      )}

      <ImportedAccounts />
    </div>
  );
}
