import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, waitFor, fireEvent } from "@testing-library/react";
import type { WealthSummary, FinBucket, FinGoal, FinAllocation } from "@brain/shared";

const getWealthSummary = vi.fn();
const createBucket = vi.fn();
const patchBucket = vi.fn();
const archiveBucket = vi.fn();
const createGoal = vi.fn();
const archiveGoal = vi.fn();
const listAllocations = vi.fn();
const allocate = vi.fn();
vi.mock("../api/finance.js", () => ({
  getWealthSummary: (...a: unknown[]) => getWealthSummary(...a),
  createBucket: (...a: unknown[]) => createBucket(...a),
  patchBucket: (...a: unknown[]) => patchBucket(...a),
  archiveBucket: (...a: unknown[]) => archiveBucket(...a),
  createGoal: (...a: unknown[]) => createGoal(...a),
  archiveGoal: (...a: unknown[]) => archiveGoal(...a),
  listAllocations: (...a: unknown[]) => listAllocations(...a),
  allocate: (...a: unknown[]) => allocate(...a),
}));
vi.mock("../api/journeys.js", () => ({
  getJourneys: vi.fn().mockResolvedValue([]),
  journeysFor: vi.fn().mockResolvedValue([]),
  suggestJourneys: vi.fn().mockResolvedValue({ autoLink: [], suggested: [] }),
  linkToJourney: vi.fn(), unlinkFromJourney: vi.fn(),
}));
vi.mock("./Toasts.js", () => ({ pushToast: vi.fn() }));

import { WealthPanel } from "./WealthPanel.js";

function bucket(over: Partial<FinBucket>): FinBucket {
  return { id: 1, name: "Trucking", category: "business", archived: false, createdAt: "2026-01-01", ...over };
}
function goal(over: Partial<FinGoal & { totalCents: number; fillPct: number | null; state: "goal_filling" | "goal_reached" }>): any {
  return {
    id: 1, bucketId: 1, name: "First Truck", targetCents: 100000, targetDate: null, archived: false,
    createdAt: "2026-01-01", totalCents: 0, fillPct: 0, state: "goal_filling", ...over,
  };
}
function summary(over: Partial<WealthSummary>): WealthSummary {
  return { buckets: [], goals: [], allocatedCents: 0, deployableCents: 0, reconciliation: "ok", ...over };
}

beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(() => cleanup());

describe("WealthPanel — Galaxy entity detail focus (Phase O)", () => {
  it("auto-expands the goal's bucket and scrolls to its card when focusGoal targets it", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const g = goal({ id: 7, bucketId: 2, name: "House down payment" });
    getWealthSummary.mockResolvedValue(
      summary({ buckets: [bucket({ id: 1, name: "Trucking" }), bucket({ id: 2, name: "House" })], goals: [g] }),
    );

    render(<WealthPanel focusGoal={{ id: 7, nonce: 1 }} />);

    // The bucket the goal lives in ("House") should auto-expand without a click —
    // the goal card becomes visible on its own.
    await screen.findByText("House down payment");
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it("re-fires on a repeat click on the same goal (nonce bump), even with the bucket already open", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const g = goal({ id: 7, bucketId: 1, name: "First Truck" });
    getWealthSummary.mockResolvedValue(summary({ buckets: [bucket({ id: 1 })], goals: [g] }));

    const { rerender } = render(<WealthPanel focusGoal={{ id: 7, nonce: 1 }} />);
    await screen.findByText("First Truck");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    rerender(<WealthPanel focusGoal={{ id: 7, nonce: 2 }} />);
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(2));
  });
});

describe("WealthPanel — empty state", () => {
  it("shows a nudge to start a bucket when there are none", async () => {
    getWealthSummary.mockResolvedValue(summary({}));
    render(<WealthPanel />);
    await screen.findByText(/No buckets yet/);
  });
});

describe("WealthPanel — creating a bucket", () => {
  it("calls createBucket with the typed name and refreshes", async () => {
    getWealthSummary.mockResolvedValue(summary({}));
    createBucket.mockResolvedValue(bucket({}));
    render(<WealthPanel />);
    await screen.findByText(/No buckets yet/);

    const input = screen.getByPlaceholderText(/New bucket name/);
    fireEvent.change(input, { target: { value: "Trucking" } });
    const btn = screen.getByText("➕ New bucket");
    await act(async () => { btn.click(); });
    expect(createBucket).toHaveBeenCalledWith({ name: "Trucking" });
    expect(getWealthSummary).toHaveBeenCalledTimes(2); // initial + post-create refresh
  });
});

describe("WealthPanel — a goal shows progress and can be allocated to", () => {
  it("renders a fill bar reflecting fillPct and updates after an allocation", async () => {
    const g = goal({ totalCents: 25000, fillPct: 0.25 });
    getWealthSummary
      .mockResolvedValueOnce(summary({ buckets: [bucket({})], goals: [g], allocatedCents: 25000, deployableCents: 100000 }))
      .mockResolvedValue(summary({ buckets: [bucket({})], goals: [{ ...g, totalCents: 30000, fillPct: 0.3 }], allocatedCents: 30000, deployableCents: 95000 }));
    allocate.mockResolvedValue({ allocation: { id: 1, goalId: 1, amountCents: 5000, note: null, createdAt: "x" } as FinAllocation, wealth: summary({}) });

    render(<WealthPanel />);
    const bucketHead = await screen.findByText("Trucking");
    fireEvent.click(bucketHead);
    await screen.findByText("First Truck");

    const progressbar = screen.getByRole("progressbar");
    expect(progressbar.getAttribute("aria-valuenow")).toBe("25");

    const amountInput = screen.getByPlaceholderText("Amount $");
    fireEvent.change(amountInput, { target: { value: "50" } });
    const allocateBtn = screen.getByText("+ Allocate");
    await act(async () => { allocateBtn.click(); });
    expect(allocate).toHaveBeenCalledWith(1, 5000);
  });
});

describe("WealthPanel — point-of-action warning", () => {
  it("asks for confirmation before allocating past Deployable, and proceeds only if confirmed", async () => {
    const g = goal({ totalCents: 0, fillPct: 0 });
    getWealthSummary.mockResolvedValue(summary({ buckets: [bucket({})], goals: [g], allocatedCents: 0, deployableCents: 1000 })); // $10 deployable
    allocate.mockResolvedValue({ allocation: {} as FinAllocation, wealth: summary({}) });
    const confirmMock = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    (window as unknown as { confirm: typeof confirmMock }).confirm = confirmMock;

    render(<WealthPanel />);
    fireEvent.click(await screen.findByText("Trucking"));
    await screen.findByText("First Truck");

    fireEvent.change(screen.getByPlaceholderText("Amount $"), { target: { value: "50" } }); // $50 > $10 deployable
    await act(async () => { screen.getByText("+ Allocate").click(); });
    expect(confirmMock).toHaveBeenCalledWith(expect.stringContaining("past what's currently deployable"));
    expect(allocate).not.toHaveBeenCalled(); // declined the warning — write never happens

    await act(async () => { screen.getByText("+ Allocate").click(); });
    expect(allocate).toHaveBeenCalledWith(1, 5000);
  });

  it("never warns for a withdrawal, since withdrawing only increases Deployable", async () => {
    const g = goal({ totalCents: 50000, fillPct: 0.5 });
    getWealthSummary.mockResolvedValue(summary({ buckets: [bucket({})], goals: [g], allocatedCents: 50000, deployableCents: 0 }));
    allocate.mockResolvedValue({ allocation: {} as FinAllocation, wealth: summary({}) });
    const confirmMock = vi.fn().mockReturnValue(true);
    (window as unknown as { confirm: typeof confirmMock }).confirm = confirmMock;

    render(<WealthPanel />);
    fireEvent.click(await screen.findByText("Trucking"));
    await screen.findByText("First Truck");
    fireEvent.change(screen.getByPlaceholderText("Amount $"), { target: { value: "50" } });
    await act(async () => { screen.getByText("− Withdraw").click(); });
    expect(confirmMock).not.toHaveBeenCalled();
    expect(allocate).toHaveBeenCalledWith(1, -5000);
  });
});

describe("WealthPanel — a rejected withdrawal surfaces an error, not a silent no-op", () => {
  it("alerts when allocate() returns null (server rejected an over-withdrawal)", async () => {
    const g = goal({ totalCents: 10000, fillPct: 0.1 });
    getWealthSummary.mockResolvedValue(summary({ buckets: [bucket({})], goals: [g] }));
    allocate.mockResolvedValue(null);
    const alertMock = vi.fn();
    (window as unknown as { alert: typeof alertMock }).alert = alertMock;

    render(<WealthPanel />);
    fireEvent.click(await screen.findByText("Trucking"));
    await screen.findByText("First Truck");
    fireEvent.change(screen.getByPlaceholderText("Amount $"), { target: { value: "500" } });
    await act(async () => { screen.getByText("− Withdraw").click(); });
    expect(alertMock).toHaveBeenCalledWith(expect.stringContaining("below zero"));
  });
});

describe("WealthPanel — reconciliation banner", () => {
  it("shows the over_committed warning with a plain, factual message", async () => {
    getWealthSummary.mockResolvedValue(summary({ deployableCents: -3000, reconciliation: "over_committed" }));
    render(<WealthPanel />);
    await screen.findByText(/Your current financial position is below/);
  });

  it("does not show the warning when reconciliation is ok", async () => {
    getWealthSummary.mockResolvedValue(summary({ deployableCents: 5000, reconciliation: "ok" }));
    render(<WealthPanel />);
    await waitFor(() => expect(getWealthSummary).toHaveBeenCalled());
    expect(screen.queryByText(/Your current financial position is below/)).toBeNull();
  });
});
