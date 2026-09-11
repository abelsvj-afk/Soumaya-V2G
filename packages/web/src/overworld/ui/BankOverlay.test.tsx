import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BankOverlay } from "./BankOverlay.js";
import type { BankLedgerRow } from "../types.js";

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

describe("BankOverlay (FR5-FR7)", () => {
  it("shows real safe-to-spend and ledger rows, never invented numbers", () => {
    render(<BankOverlay rows={[makeRow()]} safeToSpendCents={4250} onClose={vi.fn()} />);
    expect(screen.getByText("$42.50")).toBeTruthy();
    expect(screen.getByText("Rent")).toBeTruthy();
    expect(screen.getByText("$1200.00")).toBeTruthy();
  });

  it("shows an urgent row's non-color label alongside its icon", () => {
    render(<BankOverlay rows={[makeRow()]} safeToSpendCents={0} onClose={vi.fn()} />);
    expect(screen.getByText(/overdue — urgent/)).toBeTruthy();
  });

  it("shows an empty-ledger message rather than a blank/error screen", () => {
    render(<BankOverlay rows={[]} safeToSpendCents={0} onClose={vi.fn()} />);
    expect(screen.getByText("Nothing on the ledger yet.")).toBeTruthy();
  });

  it("calls onClose when leaving", () => {
    const onClose = vi.fn();
    render(<BankOverlay rows={[]} safeToSpendCents={0} onClose={onClose} />);
    fireEvent.click(screen.getByText("Leave"));
    expect(onClose).toHaveBeenCalled();
  });
});
