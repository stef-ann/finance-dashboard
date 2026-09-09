import { useState } from "react";
import { Link } from "react-router-dom";
import { useSettings } from "../queries.ts";

const KEY = "fd:hide-connect-nudge";

export function ConnectNudge() {
  const settings = useSettings();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  });

  if (hidden || settings.data?.mode !== "simulation") return null;

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setHidden(true);
  };

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm"
      style={{ borderColor: "var(--accent)", background: "color-mix(in srgb, var(--accent) 8%, transparent)" }}
    >
      <span>
        You’re looking at <b>sample data</b>. Connect Chase or import a CSV to track your real spending.
      </span>
      <span className="flex items-center gap-3">
        <Link to="/import" className="font-medium" style={{ color: "var(--accent)" }}>
          Import CSV →
        </Link>
        <Link to="/settings" className="font-medium" style={{ color: "var(--accent)" }}>
          Connect Chase →
        </Link>
        <button onClick={dismiss} className="text-xs" style={{ color: "var(--muted)" }} title="Dismiss">
          ✕
        </button>
      </span>
    </div>
  );
}
