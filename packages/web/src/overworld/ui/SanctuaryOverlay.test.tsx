import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SanctuaryOverlay } from "./SanctuaryOverlay.js";

vi.mock("../../api/mind.js", () => ({
  getThoughts: vi.fn(),
  getCognitive: vi.fn(),
  addThought: vi.fn().mockResolvedValue({ id: 9 }),
  reinforceThought: vi.fn().mockResolvedValue({ promotedNodeId: null }),
  promoteThought: vi.fn().mockResolvedValue({ nodeId: 1 }),
  dismissThought: vi.fn().mockResolvedValue(true),
  createCognitive: vi.fn().mockResolvedValue({ id: 5 }),
  setCognitiveProgress: vi.fn().mockResolvedValue(true),
}));

describe("SanctuaryOverlay", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows real working-memory motes and real cognitive items", async () => {
    const { getThoughts, getCognitive } = await import("../../api/mind.js");
    (getThoughts as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 1, text: "maybe move to Denver", source: "manual", strength: 0.8, reinforceCount: 0, createdAt: "" }]);
    (getCognitive as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 2, kind: "goal", label: "Get promoted", content: "", progress: 0.3, completedAt: null, degree: 0, aliases: [], createdAt: "", remindAt: null }]);
    render(<SanctuaryOverlay spaceId="space-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("maybe move to Denver")).toBeTruthy());
    expect(screen.getByText(/Get promoted/)).toBeTruthy();
    expect(screen.getByText(/30%/)).toBeTruthy();
  });

  it("dropping a new thought calls addThought", async () => {
    const { getThoughts, getCognitive, addThought } = await import("../../api/mind.js");
    (getThoughts as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (getCognitive as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<SanctuaryOverlay spaceId="space-1" onClose={vi.fn()} />);
    await waitFor(() => screen.getByText("Nothing drifting right now."));
    fireEvent.change(screen.getByLabelText("New thought"), { target: { value: "a stray idea" } });
    fireEvent.click(screen.getByText("Drop a thought"));
    await waitFor(() => expect(addThought).toHaveBeenCalledWith("a stray idea", "manual"));
  });

  it("saving a mote (★ Save) calls promoteThought", async () => {
    const { getThoughts, getCognitive, promoteThought } = await import("../../api/mind.js");
    (getThoughts as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 1, text: "x", source: "manual", strength: 0.5, reinforceCount: 0, createdAt: "" }]);
    (getCognitive as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<SanctuaryOverlay spaceId="space-1" onClose={vi.fn()} />);
    await waitFor(() => screen.getByText("x"));
    fireEvent.click(screen.getByText("★ Save"));
    await waitFor(() => expect(promoteThought).toHaveBeenCalledWith(1));
  });
});
