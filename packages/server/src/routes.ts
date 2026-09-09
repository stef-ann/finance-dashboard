import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, id } from "./db.ts";
import { getTellerConfig } from "./config.ts";
import { CATEGORIES, CATEGORY_NAMES } from "./shared.ts";
import { getSettings, updateSettings } from "./services/settings.ts";
import {
  listAccounts,
  listImportedAccounts,
  balanceHistory,
  createManualAccount,
  deleteAccount,
} from "./services/accounts.ts";
import { listTransactions, updateTransaction } from "./services/transactions.ts";
import { commitImport, previewImport } from "./services/import.ts";
import { buildSummary } from "./services/summary.ts";
import { listGoals, createGoal, updateGoal, deleteGoal } from "./services/goals.ts";
import {
  getPlan,
  createAllocation,
  updateAllocation,
  deleteAllocation,
  clearAllocations,
  autoAllocateFromHistory,
  distributeEvenly,
} from "./services/allocations.ts";
import {
  listScheduled,
  createScheduled,
  updateScheduled,
  deleteScheduled,
} from "./services/scheduled.ts";
import { listRules, recategorizeAll } from "./services/categorize.ts";
import { runSync } from "./services/sync.ts";
import { clearSimulation, seedSimulation } from "./services/simulation.ts";
import { deleteEnrollment, getStoredEnrollment, isTellerConnected, storeEnrollment, syncFromTeller } from "./services/teller.ts";

const monthRe = /^\d{4}-\d{2}$/;

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/health", async () => ({ ok: true }));

  app.get("/api/categories", async () => CATEGORIES);

  // ---- Settings -------------------------------------------------------------
  app.get("/api/settings", async () => getSettings());

  app.put("/api/settings", async (req, reply) => {
    const body = z
      .object({
        mode: z.enum(["simulation", "live"]).optional(),
        currency: z.string().min(1).max(8).optional(),
        monthlyBudgetCents: z.number().int().min(0).optional(),
        allocationBasis: z.enum(["checking", "spendable", "total", "budget"]).optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    if (body.data.mode === "live" && !getSettings().hasLiveData) {
      return reply.code(400).send({ error: "Connect Chase or import a CSV before switching to live mode." });
    }
    if (body.data.mode === "simulation") seedSimulation(); // ensure data exists
    return updateSettings(body.data);
  });

  // ---- Accounts -----------------------------------------------------------
  app.get("/api/accounts", async () => listAccounts());

  app.get("/api/accounts/imported", async () => listImportedAccounts());

  app.get("/api/accounts/history", async (req) => {
    const days = Number((req.query as Record<string, string>).days ?? 90);
    return balanceHistory(Number.isFinite(days) ? days : 90);
  });

  app.post("/api/accounts", async (req, reply) => {
    const body = z
      .object({
        name: z.string().min(1).max(60),
        type: z.enum(["checking", "savings", "credit_card", "other"]),
        institutionName: z.string().max(60).optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });
    return createManualAccount(body.data);
  });

  app.delete("/api/accounts/:id", async (req, reply) => {
    const params = req.params as { id: string };
    if (!deleteAccount(params.id)) {
      return reply.code(400).send({ error: "Account not found, or it is managed by simulation mode." });
    }
    if (!getSettings().hasLiveData) updateSettings({ mode: "simulation" });
    return { ok: true };
  });

  // ---- Transactions ------------------------------------------------------
  app.get("/api/transactions", async (req) => {
    const q = req.query as Record<string, string>;
    return listTransactions({
      month: q.month && monthRe.test(q.month) ? q.month : undefined,
      category: q.category || undefined,
      accountId: q.accountId || undefined,
      search: q.search || undefined,
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    });
  });

  app.patch("/api/transactions/:id", async (req, reply) => {
    const params = req.params as { id: string };
    const body = z
      .object({
        category: z.enum(CATEGORY_NAMES as [string, ...string[]]).optional(),
        notes: z.string().max(500).nullable().optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });
    const updated = updateTransaction(params.id, body.data);
    if (!updated) return reply.code(404).send({ error: "Transaction not found" });
    return updated;
  });

  // ---- Summary ----------------------------------------------------------
  app.get("/api/summary", async (req) => {
    const q = req.query as Record<string, string>;
    const month = q.month && monthRe.test(q.month) ? q.month : undefined;
    return buildSummary(month);
  });

  // ---- Goals ----------------------------------------------------------
  app.get("/api/goals", async () => listGoals());

  app.post("/api/goals", async (req, reply) => {
    const body = z
      .object({
        type: z.enum(["savings", "spending_cap"]),
        name: z.string().min(1).max(80),
        targetCents: z.number().int().min(0),
        category: z.string().nullable().optional(),
        accountId: z.string().nullable().optional(),
        targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });
    if (body.data.type === "spending_cap" && !body.data.category) {
      return reply.code(400).send({ error: "Spending caps need a category." });
    }
    return createGoal(body.data);
  });

  app.patch("/api/goals/:id", async (req, reply) => {
    const params = req.params as { id: string };
    const body = z
      .object({
        name: z.string().min(1).max(80).optional(),
        targetCents: z.number().int().min(0).optional(),
        category: z.string().nullable().optional(),
        accountId: z.string().nullable().optional(),
        targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });
    const updated = updateGoal(params.id, body.data);
    if (!updated) return reply.code(404).send({ error: "Goal not found" });
    return updated;
  });

  app.delete("/api/goals/:id", async (req, reply) => {
    const params = req.params as { id: string };
    if (!deleteGoal(params.id)) return reply.code(404).send({ error: "Goal not found" });
    return { ok: true };
  });

  // ---- Allocations (split the balance) --------------------------------
  app.get("/api/allocations", async () => getPlan());

  app.post("/api/allocations", async (req, reply) => {
    const body = z
      .object({
        name: z.string().min(1).max(60),
        category: z.enum(CATEGORY_NAMES as [string, ...string[]]).nullable().optional(),
        amountCents: z.number().int().min(0),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });
    createAllocation(body.data);
    return getPlan();
  });

  app.patch("/api/allocations/:id", async (req, reply) => {
    const params = req.params as { id: string };
    const body = z
      .object({
        name: z.string().min(1).max(60).optional(),
        category: z.enum(CATEGORY_NAMES as [string, ...string[]]).nullable().optional(),
        amountCents: z.number().int().min(0).optional(),
        sortOrder: z.number().int().optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });
    if (!updateAllocation(params.id, body.data)) return reply.code(404).send({ error: "Allocation not found" });
    return getPlan();
  });

  app.delete("/api/allocations/:id", async (req, reply) => {
    const params = req.params as { id: string };
    if (!deleteAllocation(params.id)) return reply.code(404).send({ error: "Allocation not found" });
    return getPlan();
  });

  app.delete("/api/allocations", async () => {
    clearAllocations();
    return getPlan();
  });

  app.post("/api/allocations/auto", async () => autoAllocateFromHistory(3));
  app.post("/api/allocations/distribute-evenly", async () => distributeEvenly());

  // ---- Scheduled payments (user-defined recurring) --------------------
  const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
  const scheduledBody = z.object({
    name: z.string().min(1).max(80),
    amountCents: z.number().int(),
    category: z.enum(CATEGORY_NAMES as [string, ...string[]]),
    intervalCount: z.number().int().min(1).max(365),
    intervalUnit: z.enum(["day", "week", "month", "year"]),
    startDate: isoDate,
    endDate: isoDate.nullable().optional(),
    autopayAccountId: z.string().nullable().optional(),
    notes: z.string().max(300).nullable().optional(),
    active: z.boolean().optional(),
  });

  app.get("/api/scheduled", async () => listScheduled());

  app.post("/api/scheduled", async (req, reply) => {
    const body = scheduledBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });
    if (body.data.amountCents === 0) return reply.code(400).send({ error: "Amount can't be zero." });
    if (body.data.endDate && body.data.endDate < body.data.startDate) {
      return reply.code(400).send({ error: "End date is before the start date." });
    }
    return createScheduled(body.data);
  });

  app.patch("/api/scheduled/:id", async (req, reply) => {
    const params = req.params as { id: string };
    const body = scheduledBody.partial().safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });
    const updated = updateScheduled(params.id, body.data);
    if (!updated) return reply.code(404).send({ error: "Scheduled payment not found" });
    return updated;
  });

  app.delete("/api/scheduled/:id", async (req, reply) => {
    const params = req.params as { id: string };
    if (!deleteScheduled(params.id)) return reply.code(404).send({ error: "Scheduled payment not found" });
    return { ok: true };
  });

  // ---- Category rules --------------------------------------------------
  app.get("/api/rules", async () => listRules());

  app.post("/api/rules", async (req, reply) => {
    const body = z
      .object({
        pattern: z.string().min(2).max(60),
        category: z.enum(CATEGORY_NAMES as [string, ...string[]]),
        priority: z.number().int().min(1).max(100).optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });
    const rowId = id();
    db.prepare("INSERT OR REPLACE INTO category_rules (id, pattern, category, priority) VALUES (?, ?, ?, ?)").run(
      rowId,
      body.data.pattern.toLowerCase().trim(),
      body.data.category,
      body.data.priority ?? 30,
    );
    const changed = recategorizeAll();
    return { ok: true, recategorized: changed };
  });

  app.delete("/api/rules/:id", async (req) => {
    const params = req.params as { id: string };
    db.prepare("DELETE FROM category_rules WHERE id = ?").run(params.id);
    const changed = recategorizeAll();
    return { ok: true, recategorized: changed };
  });

  // ---- CSV import ----------------------------------------------------
  const csvFieldEnum = z.enum([
    "date",
    "description",
    "amount",
    "amountOut",
    "amountIn",
    "category",
    "balance",
    "ignore",
  ]);

  app.post("/api/import/preview", async (req, reply) => {
    const body = z
      .object({ csv: z.string().min(1).max(20_000_000), mapping: z.record(csvFieldEnum).optional() })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });
    return previewImport(body.data.csv, body.data.mapping);
  });

  app.post("/api/import/commit", async (req, reply) => {
    const body = z
      .object({
        csv: z.string().min(1).max(20_000_000),
        accountId: z.string().min(1),
        mapping: z.record(csvFieldEnum).optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });
    try {
      return commitImport(body.data);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Import failed." });
    }
  });

  // ---- Sync -----------------------------------------------------------
  app.post("/api/sync", async () => runSync());

  app.post("/api/simulation/reset", async () => {
    const r = seedSimulation({ reset: true });
    return { ok: true, ...r };
  });

  app.delete("/api/simulation", async () => {
    clearSimulation();
    return { ok: true };
  });

  // ---- Teller -------------------------------------------------------
  app.get("/api/teller/config", async () => {
    const cfg = getTellerConfig();
    return {
      applicationId: cfg.applicationId,
      environment: cfg.environment,
      configured: Boolean(cfg.applicationId),
      // Teller requires an mTLS client certificate for every server-side API
      // call, including sandbox. Only the browser Connect widget skips it.
      needsClientCert: !cfg.certPath || !cfg.keyPath,
      connected: isTellerConnected(),
      institution: getStoredEnrollment()?.institutionName ?? null,
    };
  });

  app.post("/api/teller/enrollment", async (req, reply) => {
    const body = z
      .object({
        accessToken: z.string().min(10),
        enrollmentId: z.string().nullable().optional(),
        userId: z.string().nullable().optional(),
        institutionName: z.string().nullable().optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const enrollment = await storeEnrollment(body.data);
    try {
      const synced = await syncFromTeller();
      updateSettings({ mode: "live" });
      return {
        ok: true,
        institution: synced.institution ?? enrollment.institutionName,
        synced: { accounts: synced.accountsUpserted, transactions: synced.transactionsAdded },
      };
    } catch (err) {
      // Couldn't pull data with this token — roll the connection back so the
      // user isn't stuck "connected" with nothing to show.
      req.log.error({ err }, "initial teller sync failed");
      deleteEnrollment();
      return reply.code(502).send({
        error:
          err instanceof Error
            ? `Connected, but the first sync failed: ${err.message}`
            : "Connected, but the first data sync failed.",
      });
    }
  });

  app.delete("/api/teller/enrollment", async () => {
    deleteEnrollment();
    // Fall back to simulation only if there's no other real data (CSV imports).
    if (!getSettings().hasLiveData) {
      updateSettings({ mode: "simulation" });
      seedSimulation();
    }
    return { ok: true };
  });
}
