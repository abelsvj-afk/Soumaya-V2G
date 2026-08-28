import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { FinAccountRepo } from "../repositories/finAccount.repo.js";
import { FinIncomeRepo } from "../repositories/finIncome.repo.js";
import { FinExpenseRepo } from "../repositories/finExpense.repo.js";
import { FinBillRepo } from "../repositories/finBill.repo.js";
import { editIncome, deleteIncome, editExpense, deleteExpense } from "../finance/mutations.js";
import { financialSnapshotText } from "../finance/snapshot.js";
import { getBudgetSummary } from "../finance/summary.js";
import { billWeeklyCents, weeklyBillLoadCents, weeklySurplusCents, weeksToAfford } from "../finance/forecast.js";

/** Stage 2/3 — balance-aware edit/delete, the chat snapshot, and the forecast helpers. */

let handle: DbHandle;
beforeEach(() => { handle = createDb(":memory:"); });
afterEach(() => { handle.sqlite.close(); });

describe("balance-aware edit / delete (D3)", () => {
  it("editing income applies the signed delta to the balance", () => {
    new FinAccountRepo(handle, "s").setBalance(10000);
    const inc = new FinIncomeRepo(handle, "s").create({ date: "2026-01-10", netCents: 5000 });
    new FinAccountRepo(handle, "s").adjustBalance(5000); // simulate the add-time adjust (11500... 15000)
    const budget = editIncome(handle, "s", inc.id, { netCents: 8000 })!; // +3000 delta
    expect(budget.balanceCents).toBe(18000);
  });

  it("deleting income undoes its balance effect", () => {
    new FinAccountRepo(handle, "s").setBalance(10000);
    const inc = new FinIncomeRepo(handle, "s").create({ date: "2026-01-10", netCents: 5000 });
    new FinAccountRepo(handle, "s").adjustBalance(5000); // balance now 15000
    const budget = deleteIncome(handle, "s", inc.id)!;
    expect(budget.balanceCents).toBe(10000);
    expect(new FinIncomeRepo(handle, "s").list()).toHaveLength(0);
  });

  it("editing/deleting expenses adjusts the balance the other way", () => {
    new FinAccountRepo(handle, "s").setBalance(10000);
    const exp = new FinExpenseRepo(handle, "s").create({ date: "2026-01-10", amountCents: 2000, category: "food" });
    new FinAccountRepo(handle, "s").adjustBalance(-2000); // balance now 8000
    const afterEdit = editExpense(handle, "s", exp.id, { amountCents: 3000 })!; // −1000 more
    expect(afterEdit.balanceCents).toBe(7000);
    const afterDelete = deleteExpense(handle, "s", exp.id)!;
    expect(afterDelete.balanceCents).toBe(10000);
  });

  it("returns null for a missing row", () => {
    expect(deleteIncome(handle, "s", 999)).toBeNull();
    expect(editExpense(handle, "s", 999, { amountCents: 1 })).toBeNull();
  });
});

describe("financial snapshot (Stage 2)", () => {
  it("is null when the module is empty", () => {
    expect(financialSnapshotText(handle, "s", new Date("2026-01-10T00:00:00Z"))).toBeNull();
  });
  it("summarizes balance, reserved, safe-to-spend, and weekly surplus", () => {
    new FinAccountRepo(handle, "s").setBalance(114000);
    const inc = new FinIncomeRepo(handle, "s");
    inc.create({ date: "2026-01-03", netCents: 30000 });
    inc.create({ date: "2026-01-10", netCents: 44300 });
    new FinBillRepo(handle, "s").create({ name: "Rent", amountCents: 60000, frequency: "monthly", anchorDate: "2026-01-20" });
    const text = financialSnapshotText(handle, "s", new Date("2026-01-10T00:00:00Z"))!;
    expect(text).toContain("Balance: $1140.00");
    expect(text).toContain("Weekly bill load");
    expect(text).toMatch(/Safe to spend/);
  });
});

describe("getBudgetSummary — avgWeeklyIncomeCents (computed once, shared by snapshot + /afford)", () => {
  it("matches a hand-computed 4-week trailing average", () => {
    const now = new Date("2026-01-29T00:00:00Z"); // so all 4 income rows sit inside the window
    new FinAccountRepo(handle, "s").setBalance(0);
    const inc = new FinIncomeRepo(handle, "s");
    inc.create({ date: "2026-01-05", netCents: 10000 });
    inc.create({ date: "2026-01-12", netCents: 20000 });
    inc.create({ date: "2026-01-19", netCents: 30000 });
    inc.create({ date: "2026-01-26", netCents: 40000 });
    const budget = getBudgetSummary(handle, "s", now);
    expect(budget.avgWeeklyIncomeCents).toBe(Math.round((10000 + 20000 + 30000 + 40000) / 4));
  });

  it("is 0 (not NaN/undefined) with no income", () => {
    const budget = getBudgetSummary(handle, "s2", new Date("2026-01-29T00:00:00Z"));
    expect(budget.avgWeeklyIncomeCents).toBe(0);
  });
});

describe("forecast helpers (Stage 3)", () => {
  it("normalizes bill frequencies to a weekly load", () => {
    expect(billWeeklyCents({ amountCents: 700, frequency: "weekly" })).toBe(700);
    expect(billWeeklyCents({ amountCents: 700, frequency: "biweekly" })).toBe(350);
    expect(Math.round(billWeeklyCents({ amountCents: 5200, frequency: "monthly" }))).toBe(1200); // 5200*12/52
    expect(weeklyBillLoadCents([
      { amountCents: 700, frequency: "weekly", active: true },
      { amountCents: 700, frequency: "weekly", active: false }, // inactive excluded
    ])).toBe(700);
  });
  it("computes surplus + weeks-to-afford, incl. extra shifts", () => {
    expect(weeklySurplusCents(50000, 30000)).toBe(20000);
    expect(weeksToAfford(60000, 20000)).toBe(3); // 60000 / 20000
    expect(weeksToAfford(60000, 0)).toBe(Infinity); // no surplus → unreachable
    expect(weeksToAfford(60000, 10000, 10000)).toBe(3); // extra shifts double the rate
  });
});
