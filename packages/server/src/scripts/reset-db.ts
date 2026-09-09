import { existsSync, rmSync } from "node:fs";
import { DB_PATH } from "../config.ts";

for (const suffix of ["", "-wal", "-shm"]) {
  const p = `${DB_PATH}${suffix}`;
  if (existsSync(p)) {
    rmSync(p);
    console.log(`removed ${p}`);
  }
}
console.log("Database reset. It will be recreated (and the simulation re-seeded) on next start.");
