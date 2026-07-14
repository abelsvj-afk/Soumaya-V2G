import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { spaceOf } from "../middleware.js";
import { FinAccountRepo } from "../../repositories/finAccount.repo.js";
import { FinIncomeRepo } from "../../repositories/finIncome.repo.js";
import { FinExpenseRepo } from "../../repositories/finExpense.repo.js";
import { FinBillRepo } from "../../repositories/finBill.repo.js";
import { getBudgetSummary } from "../../finance/summary.js";
import { ingestPaste, ingestImage, confirmIngest } from "../../finance/ingest.js";
import { editIncome, deleteIncome, editExpense, deleteExpense } from "../../finance/mutations.js";
import { moneySky } from "../../finance/sky.js";

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
  r.post("/ingest/image", async (req, res) => {
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

  return r;
}
