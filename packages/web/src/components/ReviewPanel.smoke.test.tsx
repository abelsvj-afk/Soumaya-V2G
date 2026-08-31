import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, act } from "@testing-library/react";

// Mock the API module so the component's fetch-on-mount is deterministic. This is the
// pattern for testing any data-driven component (the majority) under the new harness.
const getDueReviews = vi.fn();
const gradeReview = vi.fn();
vi.mock("../api/client.js", () => ({
  getDueReviews: (...a: unknown[]) => getDueReviews(...a),
  gradeReview: (...a: unknown[]) => gradeReview(...a),
}));
const pushToast = vi.fn();
vi.mock("./Toasts.js", () => ({ pushToast: (...a: unknown[]) => pushToast(...a) }));

import { ReviewPanel } from "./ReviewPanel.js";

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  getDueReviews.mockResolvedValue([{ id: 1, label: "the studio lease", strength: 0.1, reviewCount: 0 }]);
  gradeReview.mockResolvedValue(true);
});

afterEach(cleanup);

describe("ReviewPanel (recall session)", () => {
  it("loads a due memory, reveals on request, and grades the recall", async () => {
    render(<ReviewPanel onClose={vi.fn()} />);
    // The due memory's label appears once loaded.
    expect(await screen.findByText("the studio lease")).toBeTruthy();
    // Retrieval-first: the answer buttons only appear after you choose to reveal.
    expect(screen.queryByText("I remembered")).toBeNull();
    fireEvent.click(screen.getByText("Reveal & rate my recall"));
    fireEvent.click(screen.getByText("I remembered"));
    await waitFor(() => expect(gradeReview).toHaveBeenCalledWith(1, true));
  });
});

describe("ReviewPanel — grading is guarded against rapid double-taps", () => {
  it("only submits one grade even if the button is clicked twice before it resolves", async () => {
    let resolveGrade!: (v: boolean) => void;
    gradeReview.mockReturnValue(new Promise((r) => { resolveGrade = r; }));
    render(<ReviewPanel onClose={vi.fn()} />);
    await screen.findByText("the studio lease");
    fireEvent.click(screen.getByText("Reveal & rate my recall"));
    const btn = screen.getByText("I remembered");
    fireEvent.click(btn);
    fireEvent.click(btn); // rapid second tap while the first is still in flight
    await act(async () => { resolveGrade(true); });
    expect(gradeReview).toHaveBeenCalledTimes(1);
  });
});

describe("ReviewPanel — a failed grade doesn't vanish silently", () => {
  it("toasts and leaves the card revealed so the user can retry", async () => {
    gradeReview.mockRejectedValue(new Error("network down"));
    render(<ReviewPanel onClose={vi.fn()} />);
    await screen.findByText("the studio lease");
    fireEvent.click(screen.getByText("Reveal & rate my recall"));
    await act(async () => { fireEvent.click(screen.getByText("I remembered")); });
    expect(pushToast).toHaveBeenCalledWith(expect.stringContaining("Couldn't save"), "⚠️", expect.any(Number));
    // Still on the same card, still revealed — nothing silently advanced.
    expect(screen.getByText("the studio lease")).toBeTruthy();
    expect(screen.getByText("I remembered")).toBeTruthy();
  });
});

describe("ReviewPanel — stale doneToday keys don't accumulate forever", () => {
  it("removes an old day's key on mount, keeping only today's", async () => {
    localStorage.setItem("review.doneToday.2020-01-01", "3");
    render(<ReviewPanel onClose={vi.fn()} />);
    await screen.findByText("the studio lease");
    expect(localStorage.getItem("review.doneToday.2020-01-01")).toBeNull();
  });
});
