import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, waitFor, fireEvent } from "@testing-library/react";
import type { BudgetSummary, WealthSummary } from "@brain/shared";

const getFinanceSummary = vi.fn();
const getWealthSummary = vi.fn();
vi.mock("../api/finance.js", () => ({
  getFinanceSummary: (...a: unknown[]) => getFinanceSummary(...a),
  getWealthSummary: (...a: unknown[]) => getWealthSummary(...a),
  setBalance: vi.fn(), addIncome: vi.fn(), addExpense: vi.fn(), createBill: vi.fn(), deleteBill: vi.fn(),
  markOccurrencePaid: vi.fn(), ingestPaste: vi.fn(), ingestImage: vi.fn(), confirmIngest: vi.fn(),
  listIncome: vi.fn().mockResolvedValue([]), listExpense: vi.fn().mockResolvedValue([]),
  editIncome: vi.fn(), deleteIncome: vi.fn(), editExpense: vi.fn(), deleteExpense: vi.fn(),
  getAfford: vi.fn(),
  createBucket: vi.fn(), patchBucket: vi.fn(), archiveBucket: vi.fn(),
  createGoal: vi.fn(), archiveGoal: vi.fn(), listAllocations: vi.fn(), allocate: vi.fn(),
}));
vi.mock("../api/journeys.js", () => ({
  getJourneys: vi.fn().mockResolvedValue([]),
  journeysFor: vi.fn().mockResolvedValue([]),
  suggestJourneys: vi.fn().mockResolvedValue({ autoLink: [], suggested: [] }),
  linkToJourney: vi.fn(), unlinkFromJourney: vi.fn(),
}));
vi.mock("./Toasts.js", () => ({ pushToast: vi.fn() }));

import { FinancePanel } from "./FinancePanel.js";

function budget(over: Partial<BudgetSummary>): BudgetSummary {
  return {
    balanceCents: 100000, bufferCents: 0, reservedCents: 0, reserved: [], safeToSpendCents: 100000,
    shortfallCents: 0, weekEarnedCents: 0, nextIncomeDate: "2026-01-15", avgWeeklyIncomeCents: 0, ...over,
  };
}
function wealth(over: Partial<WealthSummary>): WealthSummary {
  return { buckets: [], goals: [], allocatedCents: 0, deployableCents: 0, reconciliation: "ok", ...over };
}

beforeEach(() => {
  vi.resetAllMocks();
  getFinanceSummary.mockResolvedValue({ budget: budget({}), account: { id: 1, name: "Cash", currency: "USD", balanceCents: 100000, bufferCents: 0, updatedAt: "x" }, upcoming: [] });
  getWealthSummary.mockResolvedValue(wealth({}));
});
afterEach(() => cleanup());

describe("FinancePanel — the earmarked hint is a separate question from Safe-to-Spend", () => {
  it("hides the hint when nothing is earmarked", async () => {
    render(<FinancePanel />);
    await screen.findByText("Safe to Spend");
    await waitFor(() => expect(getWealthSummary).toHaveBeenCalled());
    expect(screen.queryByText(/earmarked toward goals/)).toBeNull();
  });

  it("shows the hint with the real earmarked figure once Wealth has allocations, and opens Wealth on click", async () => {
    getWealthSummary.mockResolvedValue(wealth({ allocatedCents: 15000 }));
    render(<FinancePanel />);
    const hint = await screen.findByText(/earmarked toward goals/);
    expect(hint.textContent).toContain("150.00");

    expect(screen.queryByText(/No buckets yet/)).toBeNull();
    fireEvent.click(hint);
    await screen.findByText(/No buckets yet/); // WealthPanel is now expanded and rendered
  });
});

describe("FinancePanel — Wealth section is collapsed by default", () => {
  it("only mounts WealthPanel once the '🧭 Wealth' header is opened", async () => {
    render(<FinancePanel />);
    await screen.findByText("Safe to Spend");
    expect(screen.queryByText(/No buckets yet/)).toBeNull();

    fireEvent.click(screen.getByText("🧭 Wealth"));
    await screen.findByText(/No buckets yet/);
  });
});
