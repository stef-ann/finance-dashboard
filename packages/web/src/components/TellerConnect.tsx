import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, type TellerConfig } from "../api.ts";
import { Button } from "./ui.tsx";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    TellerConnect?: {
      setup(opts: {
        applicationId: string;
        environment?: string;
        selectAccount?: "disabled" | "single" | "multiple";
        onSuccess: (enrollment: any) => void;
        onExit?: () => void;
        onFailure?: (err: any) => void;
      }): { open(): void };
    };
  }
}

const SCRIPT_SRC = "https://cdn.teller.io/connect/connect.js";

function useTellerScript(): boolean {
  const [ready, setReady] = useState(() => typeof window !== "undefined" && !!window.TellerConnect);
  useEffect(() => {
    if (window.TellerConnect) {
      setReady(true);
      return;
    }
    let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const onLoad = () => setReady(true);
    if (!script) {
      script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", onLoad);
    return () => script?.removeEventListener("load", onLoad);
  }, []);
  return ready;
}

export function TellerConnectButton({ config }: { config: TellerConfig }) {
  const qc = useQueryClient();
  const ready = useTellerScript();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handleRef = useRef<{ open(): void } | null>(null);

  const open = useCallback(() => {
    setError(null);
    if (!window.TellerConnect || !config.applicationId) return;
    const handle = window.TellerConnect.setup({
      applicationId: config.applicationId,
      environment: config.environment,
      selectAccount: "multiple",
      onSuccess: async (enrollment: any) => {
        setBusy(true);
        try {
          await api.connectTeller({
            accessToken: enrollment.accessToken,
            enrollmentId: enrollment.enrollment?.id ?? null,
            userId: enrollment.user?.id ?? null,
            institutionName: enrollment.enrollment?.institution?.name ?? null,
          });
          await api.updateSettings({ mode: "live" });
          await qc.invalidateQueries();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not save the connection.");
        } finally {
          setBusy(false);
        }
      },
      onFailure: (err: any) => setError(err?.message ?? "Teller Connect failed."),
    });
    handleRef.current = handle;
    handle.open();
  }, [config, qc]);

  return (
    <div>
      <Button onClick={open} disabled={!ready || busy || !config.applicationId}>
        {busy ? "Linking…" : config.connected ? "Reconnect bank" : "Connect Chase with Teller"}
      </Button>
      {!ready && <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>Loading Teller Connect…</p>}
      {error && <p className="mt-2 text-xs" style={{ color: "var(--negative)" }}>{error}</p>}
    </div>
  );
}
