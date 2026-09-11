import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ObservatoryOverlay } from "./ObservatoryOverlay.js";

vi.mock("../../api/client.js", () => ({
  getDigest: vi.fn(),
  resolveInsight: vi.fn().mockResolvedValue(true),
}));

function makeInsight(overrides = {}) {
  return { id: 1, text: "Your rent and your job stress are linked", score: 0.8, createdAt: "", nodes: [{ id: 1, label: "Rent", type: "concept" }], ...overrides };
}

describe("ObservatoryOverlay", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a loading state, then real digest insights", async () => {
    const { getDigest } = await import("../../api/client.js");
    (getDigest as ReturnType<typeof vi.fn>).mockResolvedValue([makeInsight()]);
    render(<ObservatoryOverlay onClose={vi.fn()} />);
    expect(screen.getByText(/Charting the sky/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/rent and your job stress/)).toBeTruthy());
  });

  it("shows an empty-sky message rather than a blank screen", async () => {
    const { getDigest } = await import("../../api/client.js");
    (getDigest as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<ObservatoryOverlay onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/No new connections/)).toBeTruthy());
  });

  it("marking an insight seen calls resolveInsight and removes it from the list", async () => {
    const { getDigest, resolveInsight } = await import("../../api/client.js");
    (getDigest as ReturnType<typeof vi.fn>).mockResolvedValue([makeInsight()]);
    render(<ObservatoryOverlay onClose={vi.fn()} />);
    await waitFor(() => screen.getByText("Mark seen"));
    fireEvent.click(screen.getByText("Mark seen"));
    await waitFor(() => expect(resolveInsight).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.queryByText(/rent and your job stress/)).toBeNull());
  });
});
