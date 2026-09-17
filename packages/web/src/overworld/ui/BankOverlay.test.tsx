import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BankOverlay } from "./BankOverlay.js";
import type { BankLedgerRow } from "../types.js";
import type { FinanceSummary } from "../../api/finance.js";

vi.mock("../../api/finance.js", () => ({
  getFinanceSummary: vi.fn(),
  setBalance: vi.fn().mockResolvedValue({ cents: 1000 }),
  addIncome: vi.fn().mockResolvedValue({ income: { id: 1 }, duplicate: false }),
  addExpense: vi.fn().mockResolvedValue({ expense: { id: 1 }, duplicate: false }),
  listBills: vi.fn().mockResolvedValue([]),
  createBill: vi.fn().mockResolvedValue({ id: 1 }),
  deleteBill: vi.fn().mockResolvedValue({ ok: true }),
  markOccurrencePaid: vi.fn().mockResolvedValue({ ok: true }),
  listIncome: vi.fn().mockResolvedValue([]),
  listExpense: vi.fn().mockResolvedValue([]),
  editIncome: vi.fn().mockResolvedValue({ ok: true }),
  deleteIncome: vi.fn().mockResolvedValue({ ok: true }),
  editExpense: vi.fn().mockResolvedValue({ ok: true }),
  deleteExpense: vi.fn().mockResolvedValue({ ok: true }),
  getAfford: vi.fn().mockResolvedValue({ weeks: 3 }),
}));

vi.mock("../data/npcJobs.js", () => ({ recordBuildingWork: vi.fn() }));

function makeSummary(overrides: Partial<FinanceSummary["budget"]> = {}): FinanceSummary {
  return {
    budget: {
      safeToSpendCents: 4250,
      shortfallCents: 0,
      nextIncomeDate: "2026-09-20",
      weekEarnedCents: 12000,
      balanceCents: 50000,
      reservedCents: 8000,
      reserved: [],
      ...overrides,
    } as FinanceSummary["budget"],
    account: {} as FinanceSummary["account"],
    upcoming: [],
  };
}

function makeRow(overrides: Partial<BankLedgerRow> = {}): BankLedgerRow {
  return {
    id: 1,
    kind: "bill",
    label: "Rent",
    amountCents: 120000,
    state: "overdue",
    icon: "⚠️",
    isUrgent: true,
    ...overrides,
  };
}

describe("BankOverlay (task #129 — real rebuild of the Bank)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows real safe-to-spend, week earned, and balance — never invented numbers", async () => {
    const { getFinanceSummary } = await import("../../api/finance.js");
    (getFinanceSummary as ReturnType<typeof vi.fn>).mockResolvedValue(makeSummary());
    render(<BankOverlay spaceId="space-1" rows={[]} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("$43")).toBeTruthy());
    expect(screen.getByText("$120")).toBeTruthy();
    expect(screen.getByText("$500")).toBeTruthy();
  });

  it("shows a shortfall warning when short before next income", async () => {
    const { getFinanceSummary } = await import("../../api/finance.js");
    (getFinanceSummary as ReturnType<typeof vi.fn>).mockResolvedValue(makeSummary({ shortfallCents: 2500 }));
    render(<BankOverlay spaceId="space-1" rows={[]} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(screen.getByText(/Short by/)).toBeTruthy();
  });

  it("shows only GOAL-kind ledger rows, never a bill (already shown under Upcoming bills)", async () => {
    const { getFinanceSummary } = await import("../../api/finance.js");
    (getFinanceSummary as ReturnType<typeof vi.fn>).mockResolvedValue(makeSummary());
    render(
      <BankOverlay
        spaceId="space-1"
        rows={[makeRow({ kind: "bill", label: "Rent" }), makeRow({ id: 2, kind: "goal", label: "Emergency fund", fillPct: 0.4 })]}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText("Emergency fund")).toBeTruthy());
    expect(screen.queryByText("Rent")).toBeNull();
  });

  it("setting balance calls setBalance and credits real Bank work", async () => {
    const { getFinanceSummary, setBalance } = await import("../../api/finance.js");
    const { recordBuildingWork } = await import("../data/npcJobs.js");
    (getFinanceSummary as ReturnType<typeof vi.fn>).mockResolvedValue(makeSummary());
    render(<BankOverlay spaceId="space-1" rows={[]} onClose={vi.fn()} />);
    await waitFor(() => screen.getByText("Set balance"));
    fireEvent.click(screen.getByText("Set balance"));
    fireEvent.change(screen.getByLabelText("Current balance in dollars"), { target: { value: "75.00" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(setBalance).toHaveBeenCalledWith(7500));
    expect(recordBuildingWork).toHaveBeenCalledWith("space-1", "bank");
  });

  it("adding income calls addIncome with the entered amount", async () => {
    const { getFinanceSummary, addIncome } = await import("../../api/finance.js");
    (getFinanceSummary as ReturnType<typeof vi.fn>).mockResolvedValue(makeSummary());
    render(<BankOverlay spaceId="space-1" rows={[]} onClose={vi.fn()} />);
    await waitFor(() => screen.getByText("＋ Income"));
    fireEvent.click(screen.getByText("＋ Income"));
    fireEvent.change(screen.getByLabelText("Amount in dollars"), { target: { value: "40" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(addIncome).toHaveBeenCalledWith(expect.objectContaining({ netCents: 4000 })));
  });

  it("marking a bill paid calls markOccurrencePaid and credits real Bank work", async () => {
    const { getFinanceSummary, markOccurrencePaid } = await import("../../api/finance.js");
    const { recordBuildingWork } = await import("../data/npcJobs.js");
    (getFinanceSummary as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...makeSummary(),
      upcoming: [{ id: 9, name: "Rent", dueDate: "2026-09-20", amountCents: 120000 }],
    });
    render(<BankOverlay spaceId="space-1" rows={[]} onClose={vi.fn()} />);
    await waitFor(() => screen.getByText("Paid"));
    fireEvent.click(screen.getByText("Paid"));
    await waitFor(() => expect(markOccurrencePaid).toHaveBeenCalledWith(9));
    expect(recordBuildingWork).toHaveBeenCalledWith("space-1", "bank");
  });

  it("the afford calculator reports real weeks from getAfford", async () => {
    const { getFinanceSummary, getAfford } = await import("../../api/finance.js");
    (getFinanceSummary as ReturnType<typeof vi.fn>).mockResolvedValue(makeSummary());
    render(<BankOverlay spaceId="space-1" rows={[]} onClose={vi.fn()} />);
    await waitFor(() => screen.getByText("🧮 What can I afford?"));
    fireEvent.click(screen.getByText("🧮 What can I afford?"));
    fireEvent.change(screen.getByLabelText("Target amount in dollars"), { target: { value: "400" } });
    fireEvent.click(screen.getByText("Check"));
    await waitFor(() => expect(getAfford).toHaveBeenCalledWith(40000, 0));
    await waitFor(() => expect(screen.getByText(/~3 weeks/)).toBeTruthy());
  });

  it("shows a loading state, then an offline message when the summary can't be reached", async () => {
    const { getFinanceSummary } = await import("../../api/finance.js");
    (getFinanceSummary as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    render(<BankOverlay spaceId="space-1" rows={[]} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Couldn't reach the budget/)).toBeTruthy());
  });

  it("calls onClose when leaving", async () => {
    const { getFinanceSummary } = await import("../../api/finance.js");
    (getFinanceSummary as ReturnType<typeof vi.fn>).mockResolvedValue(makeSummary());
    const onClose = vi.fn();
    render(<BankOverlay spaceId="space-1" rows={[]} onClose={onClose} />);
    await waitFor(() => screen.getByText("Leave"));
    fireEvent.click(screen.getByText("Leave"));
    expect(onClose).toHaveBeenCalled();
  });
});
