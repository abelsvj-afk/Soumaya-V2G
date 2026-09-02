import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { WealthSummary } from "@brain/shared";

const getWealthSummary = vi.fn();
vi.mock("../api/finance.js", () => ({
  getWealthSummary: (...a: unknown[]) => getWealthSummary(...a),
  createBucket: vi.fn(), patchBucket: vi.fn(), archiveBucket: vi.fn(),
  createGoal: vi.fn(), archiveGoal: vi.fn(), listAllocations: vi.fn(), allocate: vi.fn(),
}));

import { WealthFullscreen } from "./WealthFullscreen.js";

beforeEach(() => {
  vi.resetAllMocks();
  getWealthSummary.mockResolvedValue({ buckets: [], goals: [], allocatedCents: 0, deployableCents: 0, reconciliation: "ok" } as WealthSummary);
});
afterEach(() => cleanup());

describe("WealthFullscreen — the same WealthPanel, wrapped in an overlay context", () => {
  it("renders as a labeled dialog containing the Wealth content", async () => {
    render(<WealthFullscreen onClose={() => {}} />);
    expect(screen.getByRole("dialog").getAttribute("aria-label")).toBe("Wealth");
    await screen.findByText(/No buckets yet/);
  });

  it("calls onClose when the close button is clicked", async () => {
    const onClose = vi.fn();
    render(<WealthFullscreen onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose on Escape (useDialogA11y)", async () => {
    const onClose = vi.fn();
    render(<WealthFullscreen onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
