import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { spaceOf, rateLimit } from "../middleware.js";
import { FinAccountRepo } from "../../repositories/finAccount.repo.js";
import { FinIncomeRepo } from "../../repositories/finIncome.repo.js";
import { FinExpenseRepo } from "../../repositories/finExpense.repo.js";
import { FinBillRepo } from "../../repositories/finBill.repo.js";
import { getBudgetSummary } from "../../finance/summary.js";
import { ingestPaste, ingestImage, confirmIngest } from "../../finance/ingest.js";
import { editIncome, deleteIncome, editExpense, deleteExpense } from "../../finance/mutations.js";
import { moneySky } from "../../finance/sky.js";
import { weeklyBillLoadCents, weeklySurplusCents, weeksToAfford } from "../../finance/forecast.js";
import { FinBucketRepo } from "../../repositories/finBucket.repo.js";
import { FinGoalRepo } from "../../repositories/finGoal.repo.js";
import { FinAllocationRepo } from "../../repositories/finAllocation.repo.js";
import { getWealthSummary } from "../../finance/wealth.js";

/**
 * Financial OS (Stage 1a) routes. Thin: validate with zod → delegate to space-scoped repos +
 * the pure Budget Engine → json. Money is INTEGER cents everywhere. Deterministic + offline
 * (no OCR/LLM here). See docs/financial-os/.
 */

const cents = z.number().int(); // signed for balances
const posCents = z.number().int().nonnegative();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/, "date must be YYYY-MM-DD");

const BalanceBody = z.object({ cents }).strict();
const BufferBody = z.object({ cents: posCents }).strict();

const BillBody = z
  .object({
    name: z.string().trim().min(1).max(80),
    amountCents: posCents,
    frequency: z.enum(["weekly", "biweekly", "monthly", "custom"]),
    anchorDate: isoDate,
    everyDays: z.number().int().positive().max(3650).optional(),
    autopay: z.boolean().optional(),
    category: z.string().trim().min(1).max(40).optional(),
    graceDays: z.number().int().nonnegative().max(90).optional(),
    lateFeeCents: posCents.optional(),
    payee: z.string().trim().max(80).optional(),
    accountLast4: z.string().regex(/^\d{4}$/).optional(),
  })
  .strict();
const BillPatch = BillBody.partial().extend({ active: z.boolean().optional() });

const IncomeBody = z
  .object({
    date: isoDate,
    netCents: posCents,
    grossCents: posCents.optional(),
    taxCents: posCents.optional(),
    hours: z.number().nonnegative().max(1000).optional(),
    platform: z.string().trim().max(60).optional(),
  })
  .strict();

const ExpenseBody = z
  .object({
    date: isoDate,
    amountCents: posCents,
    category: z.string().trim().min(1).max(40),
    direction: z.enum(["out", "in"]).optional(),
    merchant: z.string().trim().max(80).optional(),
  })
  .strict();

const bad = (res: any, msg: string, issues?: unknown) => res.status(400).json({ error: msg, issues });

export function financeRoutes(ctx: AppContext): Router {
  const r = Router();

  // ---- Live budget summary (the home view + AI snapshot source) ----
  r.get("/summary", (_req, res) => {
    const spaceId = spaceOf(res);
    const account = new FinAccountRepo(ctx.handle, spaceId).getOrCreate();
    const budget = getBudgetSummary(ctx.handle, spaceId);
    const upcoming = new FinBillRepo(ctx.handle, spaceId).upcoming(20);
    res.json({ budget, account, upcoming });
  });

  // ---- Money-sky: bills as stars with a state (Stage 4) ----
  r.get("/sky", (_req, res) => res.json(moneySky(ctx.handle, spaceOf(res))));

  // ---- Forecast (Stage 3): "how many weeks to afford $X at my current pace" ----
  // Zero-AI — pure math already covered by finance/forecast.ts's own unit tests; this
  // route just wires it up. `weeks: null` (not Infinity — JSON can't carry that) means
  // the current pace never gets there.
  const AffordQuery = z.object({
    targetCents: z.coerce.number().int().positive(),
    extraPerWeekCents: z.coerce.number().int().nonnegative().optional(),
  });
  r.get("/afford", (req, res) => {
    const p = AffordQuery.safeParse(req.query);
    if (!p.success) return bad(res, "Query must include a positive integer targetCents", p.error.issues);
    const spaceId = spaceOf(res);
    const budget = getBudgetSummary(ctx.handle, spaceId);
    const bills = new FinBillRepo(ctx.handle, spaceId).list();
    const weeklyBillLoad = weeklyBillLoadCents(bills);
    const surplusCents = weeklySurplusCents(budget.avgWeeklyIncomeCents, weeklyBillLoad);
    const weeks = weeksToAfford(p.data.targetCents, surplusCents, p.data.extraPerWeekCents ?? 0);
    res.json({ weeks: Number.isFinite(weeks) ? weeks : null, surplusCents, weeklyBillLoadCents: weeklyBillLoad });
  });

  // ---- Account (balance / buffer / meta) ----
  r.get("/account", (_req, res) => res.json(new FinAccountRepo(ctx.handle, spaceOf(res)).getOrCreate()));
  r.put("/account/balance", (req, res) => {
    const p = BalanceBody.safeParse(req.body);
    if (!p.success) return bad(res, "Body must be { cents }", p.error.issues);
    res.json(new FinAccountRepo(ctx.handle, spaceOf(res)).setBalance(p.data.cents));
  });
  r.put("/account/buffer", (req, res) => {
    const p = BufferBody.safeParse(req.body);
    if (!p.success) return bad(res, "Body must be { cents }", p.error.issues);
    res.json(new FinAccountRepo(ctx.handle, spaceOf(res)).setBuffer(p.data.cents));
  });

  // ---- Bills ----
  r.get("/bills", (_req, res) => res.json(new FinBillRepo(ctx.handle, spaceOf(res)).list()));
  r.post("/bills", (req, res) => {
    const p = BillBody.safeParse(req.body);
    if (!p.success) return bad(res, "Invalid bill", p.error.issues);
    res.json(new FinBillRepo(ctx.handle, spaceOf(res)).create(p.data));
  });
  r.patch("/bills/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return bad(res, "Invalid id");
    const p = BillPatch.safeParse(req.body);
    if (!p.success) return bad(res, "Invalid patch", p.error.issues);
    const bill = new FinBillRepo(ctx.handle, spaceOf(res)).update(id, p.data);
    return bill ? res.json(bill) : res.status(404).json({ error: "Not found" });
  });
  r.delete("/bills/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return bad(res, "Invalid id");
    return new FinBillRepo(ctx.handle, spaceOf(res)).deactivate(id)
      ? res.json({ ok: true })
      : res.status(404).json({ error: "Not found" });
  });
  r.post("/bills/occurrence/:id/paid", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return bad(res, "Invalid id");
    const spaceId = spaceOf(res);
    const bills = new FinBillRepo(ctx.handle, spaceId);
    if (!bills.markPaid(id)) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true, budget: getBudgetSummary(ctx.handle, spaceId) });
  });

  // ---- Manual income / expense (adjusts the balance going forward, per D3) ----
  r.post("/income", (req, res) => {
    const p = IncomeBody.safeParse(req.body);
    if (!p.success) return bad(res, "Invalid income", p.error.issues);
    const spaceId = spaceOf(res);
    const inc = new FinIncomeRepo(ctx.handle, spaceId);
    const duplicate = inc.findDuplicate(p.data.date, p.data.netCents);
    const income = inc.create(p.data);
    new FinAccountRepo(ctx.handle, spaceId).adjustBalance(p.data.netCents);
    res.json({ income, duplicate: !!duplicate, budget: getBudgetSummary(ctx.handle, spaceId) });
  });
  r.post("/expense", (req, res) => {
    const p = ExpenseBody.safeParse(req.body);
    if (!p.success) return bad(res, "Invalid expense", p.error.issues);
    const spaceId = spaceOf(res);
    const exp = new FinExpenseRepo(ctx.handle, spaceId);
    const dir = p.data.direction ?? "out";
    const duplicate = exp.findDuplicate(p.data.date, p.data.amountCents, p.data.merchant ?? null);
    const expense = exp.create(p.data);
    new FinAccountRepo(ctx.handle, spaceId).adjustBalance(dir === "out" ? -p.data.amountCents : p.data.amountCents);
    res.json({ expense, duplicate: !!duplicate, budget: getBudgetSummary(ctx.handle, spaceId) });
  });
  r.get("/income", (_req, res) => res.json(new FinIncomeRepo(ctx.handle, spaceOf(res)).list()));
  r.get("/expense", (_req, res) => res.json(new FinExpenseRepo(ctx.handle, spaceOf(res)).list()));

  // ---- Edit / delete recorded transactions (balance-aware, per D3) ----
  const IncomePatch = z.object({ date: isoDate.optional(), netCents: posCents.optional(), platform: z.string().trim().max(60).nullable().optional() }).strict();
  const ExpensePatch = z.object({
    date: isoDate.optional(), amountCents: posCents.optional(), merchant: z.string().trim().max(80).nullable().optional(),
    category: z.string().trim().min(1).max(40).optional(), direction: z.enum(["out", "in"]).optional(),
  }).strict();

  r.patch("/income/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return bad(res, "Invalid id");
    const p = IncomePatch.safeParse(req.body);
    if (!p.success) return bad(res, "Invalid patch", p.error.issues);
    const budget = editIncome(ctx.handle, spaceOf(res), id, p.data);
    return budget ? res.json({ ok: true, budget }) : res.status(404).json({ error: "Not found" });
  });
  r.delete("/income/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return bad(res, "Invalid id");
    const budget = deleteIncome(ctx.handle, spaceOf(res), id);
    return budget ? res.json({ ok: true, budget }) : res.status(404).json({ error: "Not found" });
  });
  r.patch("/expense/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return bad(res, "Invalid id");
    const p = ExpensePatch.safeParse(req.body);
    if (!p.success) return bad(res, "Invalid patch", p.error.issues);
    const budget = editExpense(ctx.handle, spaceOf(res), id, p.data);
    return budget ? res.json({ ok: true, budget }) : res.status(404).json({ error: "Not found" });
  });
  r.delete("/expense/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return bad(res, "Invalid id");
    const budget = deleteExpense(ctx.handle, spaceOf(res), id);
    return budget ? res.json({ ok: true, budget }) : res.status(404).json({ error: "Not found" });
  });

  // ---- Ingestion (Stage 1b): paste → drafts → confirm. Offline, no key. ----
  const PasteBody = z.object({ text: z.string().min(1).max(20000) }).strict();
  r.post("/ingest/paste", async (req, res) => {
    const p = PasteBody.safeParse(req.body);
    if (!p.success) return bad(res, "Body must be { text }", p.error.issues);
    const out = await ingestPaste(ctx.handle, spaceOf(res), p.data.text);
    res.json(out); // { sourceId, result } — nothing committed yet
  });

  // Snap a screenshot/PDF (Stage 1c). Vision auto-extracts when a key is configured; with no
  // key (or on failure) it returns an empty result + readable:false so the UI drops to manual.
  const ImageBody = z
    // Cap under the global 1mb JSON body limit; the client downsizes before upload.
    .object({ dataUrl: z.string().min(16).startsWith("data:").max(950_000), mime: z.string().max(60) })
    .strict();
  // Unlike /ingest/paste (purely the offline HeuristicOcrProvider, no cloud call),
  // this is the one route in this file that actually calls the vision LLM — give it
  // a tighter ceiling than the generic /api limit.
  const llmLimiter = rateLimit({ max: Number(process.env.LLM_RATE_LIMIT_MAX ?? 20) });
  r.post("/ingest/image", llmLimiter, async (req, res) => {
    const p = ImageBody.safeParse(req.body);
    if (!p.success) return bad(res, "Body must be { dataUrl, mime }", p.error.issues);
    const out = await ingestImage(ctx.handle, ctx.llm, spaceOf(res), { dataUrl: p.data.dataUrl, mime: p.data.mime });
    res.json(out);
  });

  const ConfirmBody = z
    .object({
      sourceId: z.number().int().positive(),
      incomes: z
        .array(z.object({ date: isoDate.optional(), netCents: posCents, platform: z.string().trim().max(60).optional() }))
        .max(200)
        .default([]),
      expenses: z
        .array(
          z.object({
            date: isoDate.optional(),
            amountCents: posCents,
            merchant: z.string().trim().max(80).optional(),
            category: z.string().trim().min(1).max(40),
            direction: z.enum(["out", "in"]).optional(),
          }),
        )
        .max(200)
        .default([]),
    })
    .strict();
  r.post("/ingest/confirm", (req, res) => {
    const p = ConfirmBody.safeParse(req.body);
    if (!p.success) return bad(res, "Invalid confirmation", p.error.issues);
    const out = confirmIngest(ctx.handle, spaceOf(res), p.data);
    return out ? res.json(out) : res.status(404).json({ error: "Source not found or already handled" });
  });

  // ---- Wealth (docs/specs/wealth-goals-allocation.md): intention layered on Money's reality.
  // Deployable/Reconciliation are computed fresh on every read, never stored. Allocations are
  // ledger records of intent, never real transfers — nothing here moves money or touches
  // fin_account; the point-of-action warning (spec §3/§9) is a client-side UI courtesy, not a
  // server-enforced block, so the route always succeeds an allocate. The one write-time guard
  // is FinAllocationRepo.create() rejecting a withdrawal that would take a goal below zero.
  const BucketBody = z.object({ name: z.string().trim().min(1).max(80), category: z.string().trim().min(1).max(40).optional() }).strict();
  const BucketPatch = BucketBody.partial();

  r.get("/wealth/summary", (_req, res) => {
    const spaceId = spaceOf(res);
    const budget = getBudgetSummary(ctx.handle, spaceId);
    res.json(getWealthSummary(ctx.handle, spaceId, budget));
  });

  r.get("/wealth/buckets", (_req, res) => res.json(new FinBucketRepo(ctx.handle, spaceOf(res)).list()));
  r.post("/wealth/buckets", (req, res) => {
    const p = BucketBody.safeParse(req.body);
    if (!p.success) return bad(res, "Invalid bucket", p.error.issues);
    res.json(new FinBucketRepo(ctx.handle, spaceOf(res)).create(p.data));
  });
  r.patch("/wealth/buckets/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return bad(res, "Invalid id");
    const p = BucketPatch.safeParse(req.body);
    if (!p.success) return bad(res, "Invalid patch", p.error.issues);
    const bucket = new FinBucketRepo(ctx.handle, spaceOf(res)).update(id, p.data);
    return bucket ? res.json(bucket) : res.status(404).json({ error: "Not found" });
  });
  r.delete("/wealth/buckets/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return bad(res, "Invalid id");
    return new FinBucketRepo(ctx.handle, spaceOf(res)).archive(id)
      ? res.json({ ok: true })
      : res.status(404).json({ error: "Not found" });
  });

  const GoalBody = z
    .object({
      bucketId: z.number().int().positive(),
      name: z.string().trim().min(1).max(120),
      targetCents: posCents.nullable().optional(),
      targetDate: isoDate.nullable().optional(),
    })
    .strict();
  const GoalPatch = z
    .object({
      name: z.string().trim().min(1).max(120).optional(),
      targetCents: posCents.nullable().optional(),
      targetDate: isoDate.nullable().optional(),
    })
    .strict();

  r.get("/wealth/goals", (req, res) => {
    const bucketId = req.query.bucketId != null ? Number(req.query.bucketId) : undefined;
    if (bucketId != null && !Number.isInteger(bucketId)) return bad(res, "Invalid bucketId");
    res.json(new FinGoalRepo(ctx.handle, spaceOf(res)).list({ bucketId }));
  });
  r.post("/wealth/goals", (req, res) => {
    const p = GoalBody.safeParse(req.body);
    if (!p.success) return bad(res, "Invalid goal", p.error.issues);
    const spaceId = spaceOf(res);
    if (!new FinBucketRepo(ctx.handle, spaceId).get(p.data.bucketId)) return bad(res, "Bucket not found in this space");
    res.json(new FinGoalRepo(ctx.handle, spaceId).create(p.data));
  });
  r.patch("/wealth/goals/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return bad(res, "Invalid id");
    const p = GoalPatch.safeParse(req.body);
    if (!p.success) return bad(res, "Invalid patch", p.error.issues);
    const goal = new FinGoalRepo(ctx.handle, spaceOf(res)).update(id, p.data);
    return goal ? res.json(goal) : res.status(404).json({ error: "Not found" });
  });
  r.delete("/wealth/goals/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return bad(res, "Invalid id");
    return new FinGoalRepo(ctx.handle, spaceOf(res)).archive(id)
      ? res.json({ ok: true })
      : res.status(404).json({ error: "Not found" });
  });

  // ---- Allocations: the entire allocate/de-allocate model is one signed ledger write.
  // Positive amountCents = allocate, negative = withdraw. Zero is meaningless — rejected.
  const AllocationBody = z
    .object({ amountCents: cents.refine((n) => n !== 0, "amountCents cannot be zero"), note: z.string().trim().max(200).optional() })
    .strict();

  r.get("/wealth/goals/:id/allocations", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return bad(res, "Invalid id");
    res.json(new FinAllocationRepo(ctx.handle, spaceOf(res)).list(id));
  });
  r.post("/wealth/goals/:id/allocations", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return bad(res, "Invalid id");
    const p = AllocationBody.safeParse(req.body);
    if (!p.success) return bad(res, "Invalid allocation", p.error.issues);
    const spaceId = spaceOf(res);
    if (!new FinGoalRepo(ctx.handle, spaceId).get(id)) return res.status(404).json({ error: "Goal not found" });
    const allocation = new FinAllocationRepo(ctx.handle, spaceId).create({ goalId: id, amountCents: p.data.amountCents, note: p.data.note ?? null });
    if (!allocation) return bad(res, "That withdrawal would take this goal's total below zero");
    res.json({ allocation, wealth: getWealthSummary(ctx.handle, spaceId, getBudgetSummary(ctx.handle, spaceId)) });
  });

  return r;
}
