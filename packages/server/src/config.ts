import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = resolve(here, "..");
export const REPO_ROOT = resolve(SERVER_ROOT, "..", "..");

dotenv.config({ path: resolve(SERVER_ROOT, ".env") });

export const DATA_DIR = resolve(SERVER_ROOT, "data");
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

export const DB_PATH = resolve(DATA_DIR, "finance.db");
export const WEB_DIST = resolve(REPO_ROOT, "packages", "web", "dist");

export const PORT = Number(process.env.PORT ?? 4000);
export const IS_PROD = process.env.NODE_ENV === "production";

/**
 * Encryption key for Teller tokens at rest. Prefer APP_SECRET from the env;
 * otherwise generate a random key once and persist it beside the server.
 */
export function getAppSecret(): string {
  const fromEnv = process.env.APP_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 16) return fromEnv;

  const secretFile = resolve(SERVER_ROOT, ".secret");
  if (existsSync(secretFile)) return readFileSync(secretFile, "utf8").trim();

  const generated = randomBytes(32).toString("hex");
  writeFileSync(secretFile, generated, { mode: 0o600 });
  return generated;
}

export interface TellerConfig {
  applicationId: string | null;
  environment: "sandbox" | "development" | "production";
  certPath: string | null;
  keyPath: string | null;
}

export function getTellerConfig(): TellerConfig {
  const env = (process.env.TELLER_ENVIRONMENT ?? "sandbox").trim() as TellerConfig["environment"];
  const resolveMaybe = (p?: string) => {
    if (!p || !p.trim()) return null;
    const abs = resolve(SERVER_ROOT, p.trim());
    return existsSync(abs) ? abs : null;
  };
  return {
    applicationId: process.env.TELLER_APPLICATION_ID?.trim() || null,
    environment: ["sandbox", "development", "production"].includes(env) ? env : "sandbox",
    certPath: resolveMaybe(process.env.TELLER_CERT_PATH),
    keyPath: resolveMaybe(process.env.TELLER_KEY_PATH),
  };
}
