import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HeuristicOcrProvider } from "../ocr/heuristic.js";
import { categorize } from "../finance/categorize.js";
import { ingestPaste, confirmIngest } from "../finance/ingest.js";
import { FinAccountRepo } from "../repositories/finAccount.repo.js";
import { FinIncomeRepo } from "../repositories/finIncome.repo.js";
import { FinExpenseRepo } from "../repositories/finExpense.repo.js";
import { FinCategoryOverrideRepo } from "../repositories/finCategoryOverride.repo.js";
import { FinSourceRepo } from "../repositories/finSource.repo.js";

/** Stage 1b — the heuristic parser, categorizer, and the paste→confirm ingestion pipeline. */

describe("heuristic paste parser", () => {
  const p = new HeuristicOcrProvider();

  it("reads income lines (received / +amount / from)", async () => {
    const r = await p.extract({ kind: "paste", text: "Received $44.30 from GoPuff\n+$25.00 DoorDash payout" });
    expect(r.incomes).toHaveLength(2);
    expect(r.expenses).toHaveLength(0);
    expect(r.incomes[0]!.netCents).toBe(4430);
    expect(r.incomes[0]!.platform).toMatch(/GoPuff/i);
  });

  it("reads expense lines (payment / -amount / to)", async () => {
    const r = await p.extract({ kind: "paste", text: "-$12.00 Starbucks\nPayment to Landlord $600.00" });
    expect(r.expenses).toHaveLength(2);
    expect(r.expenses[0]!.amountCents).toBe(1200);
    expect(r.expenses[1]!.amountCents).toBe(60000);
    expect(r.expenses.every((e) => e.direction === "out")).toBe(true);
  });

  it("parses dates (ISO + US) and handles thousands separators", async () => {
    const r = await p.extract({ kind: "paste", text: "2026-01-09 Payroll +$1,234.00\n01/05 -45.00 Kroger" });
    expect(r.incomes[0]!.date).toBe("2026-01-09");
    expect(r.incomes[0]!.netCents).toBe(123400);
    expect(r.expenses[0]!.date).toBe("2026-01-05");
  });

  it("flags an ambiguous line as low-confidence (defaults to expense)", async () => {
    const r = await p.extract({ kind: "paste", text: "$8.50 Corner Shop" });
    expect(r.expenses).toHaveLength(1);
    expect(r.expenses[0]!.confidence).toBeLessThan(0.5);
  });

  it("ignores lines with no amount", async () => {
    const r = await p.extract({ kind: "paste", text: "Transactions\n----\nBalance" });
    expect(r.incomes).toHaveLength(0);
    expect(r.expenses).toHaveLength(0);
  });
});

describe("categorize", () => {
  it("maps by keyword and honors a learned override", () => {
    expect(categorize("Starbucks")).toBe("food");
    expect(categorize("GEICO auto insurance")).toBe("insurance");
    expect(categorize("Rent - Landlord")).toBe("housing");
    expect(categorize("Mystery LLC")).toBe("misc");
    expect(categorize("Mystery LLC", "subscriptions")).toBe("subscriptions"); // override wins
  });
});

describe("paste → confirm pipeline", () => {
  let handle: DbHandle;
  beforeEach(() => { handle = createDb(":memory:"); });
  afterEach(() => { handle.sqlite.close(); });

  it("retains the source, drafts candidates, and commits nothing until confirm", async () => {
    const { sourceId, result } = await ingestPaste(handle, "s1", "Received $44.30 from GoPuff\n-$12.00 Starbucks");
    expect(result.incomes).toHaveLength(1);
    expect(result.expenses[0]!.category).toBe("food"); // categorized
    // Source retained as pending; nothing committed yet.
    expect(new FinSourceRepo(handle, "s1").get(sourceId)!.status).toBe("pending");
    expect(new FinIncomeRepo(handle, "s1").list()).toHaveLength(0);
    expect(new FinExpenseRepo(handle, "s1").list()).toHaveLength(0);
  });

  it("confirm commits chosen rows, adjusts balance, learns the category, marks source confirmed", () => {
    new FinAccountRepo(handle, "s1").setBalance(10000);
    // Pretend a prior paste produced sourceId; create it directly for the confirm test.
    const src = new FinSourceRepo(handle, "s1").create({ kind: "paste", extractionJson: "{}" });
    const out = confirmIngest(handle, "s1", {
      sourceId: src.id,
      incomes: [{ date: "2026-01-10", netCents: 4430, platform: "GoPuff" }],
      expenses: [{ date: "2026-01-10", amountCents: 1200, merchant: "Nook Cafe", category: "food", direction: "out" }],
    })!;
    expect(out.committed).toBe(2);
    // Balance: 10000 + 4430 − 1200 = 13230.
    expect(out.budget.balanceCents).toBe(13230);
    // Rows persisted + linked to the source.
    expect(new FinIncomeRepo(handle, "s1").list()).toHaveLength(1);
    expect(new FinExpenseRepo(handle, "s1").list()[0]!.sourceId).toBe(src.id);
    // The user's category choice is remembered for that merchant.
    expect(new FinCategoryOverrideRepo(handle, "s1").get("Nook Cafe")).toBe("food");
    // Source is consumed; a second confirm on it is refused.
    expect(new FinSourceRepo(handle, "s1").get(src.id)!.status).toBe("confirmed");
    expect(confirmIngest(handle, "s1", { sourceId: src.id, incomes: [], expenses: [] })).toBeNull();
  });

  it("flags a duplicate against already-recorded income", async () => {
    new FinIncomeRepo(handle, "s1").create({ date: "2026-01-10", netCents: 4430, platform: "GoPuff" });
    const { result } = await ingestPaste(handle, "s1", "2026-01-10 Received $44.30 from GoPuff");
    expect(result.incomes[0]!.duplicate).toBe(true);
  });
});
