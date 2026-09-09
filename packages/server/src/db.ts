import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import { DB_PATH } from "./config.ts";
import { DEFAULT_RULES } from "./shared.ts";

const here = dirname(fileURLToPath(import.meta.url));

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function migrate(): void {
  const schema = readFileSync(resolve(here, "schema.sql"), "utf8");
  db.exec(schema);

  // Lightweight column adds for DBs created before a field existed.
  const goalCols = (db.prepare("PRAGMA table_info(goals)").all() as { name: string }[]).map((c) => c.name);
  if (!goalCols.includes("start_cents")) {
    db.exec("ALTER TABLE goals ADD COLUMN start_cents INTEGER NOT NULL DEFAULT 0");
  }
  const settingsCols = (db.prepare("PRAGMA table_info(settings)").all() as { name: string }[]).map((c) => c.name);
  if (!settingsCols.includes("allocation_basis")) {
    db.exec("ALTER TABLE settings ADD COLUMN allocation_basis TEXT NOT NULL DEFAULT 'spendable'");
  }

  // Singleton settings row.
  db.prepare("INSERT OR IGNORE INTO settings (id) VALUES (1)").run();

  // Seed default categorization rules once.
  const count = db.prepare("SELECT COUNT(*) AS n FROM category_rules").get() as { n: number };
  if (count.n === 0) {
    const insert = db.prepare(
      "INSERT OR IGNORE INTO category_rules (id, pattern, category, priority) VALUES (?, ?, ?, ?)",
    );
    const tx = db.transaction(() => {
      for (const r of DEFAULT_RULES) insert.run(nanoid(), r.pattern, r.category, r.priority);
    });
    tx();
  }
}

export function id(): string {
  return nanoid();
}
