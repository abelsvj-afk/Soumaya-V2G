import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { GraphData } from "@brain/shared";
import { GymOverlay } from "./GymOverlay.js";

vi.mock("../../api/client.js", () => ({
  getCodexDiscoveries: vi.fn().mockResolvedValue([]),
  claimCodexReward: vi.fn(),
}));

describe("GymOverlay", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("brain.spaceId", "space-1");
    vi.clearAllMocks();
  });

  it("shows real streak and fuel numbers, never invented ones", () => {
    const graph: GraphData = { nodes: [], links: [] };
    render(<GymOverlay graph={graph} fuel={{ fuel: 3, capacity: 10, jobCost: 1 }} streak={{ current: 5, best: 9, today: true }} onClose={vi.fn()} />);
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("shows a locked achievement's real progress rather than just a lock icon", () => {
    const graph: GraphData = { nodes: [], links: [] };
    render(<GymOverlay graph={graph} fuel={null} streak={null} onClose={vi.fn()} />);
    expect(screen.getByText(/Progress: 0 \/ 25$/)).toBeTruthy();
  });

  it("shows a persisted-unlocked achievement as earned", () => {
    localStorage.setItem("brain.achv.space-1", JSON.stringify(["connector"]));
    const graph: GraphData = { nodes: [], links: [] };
    render(<GymOverlay graph={graph} fuel={null} streak={null} onClose={vi.fn()} />);
    expect(screen.getByText(/Connector — earned/)).toBeTruthy();
  });

  it("calls onClose when leaving", () => {
    const onClose = vi.fn();
    render(<GymOverlay graph={{ nodes: [], links: [] }} fuel={null} streak={null} onClose={onClose} />);
    fireEvent.click(screen.getByText("Leave"));
    expect(onClose).toHaveBeenCalled();
  });

  describe("Codex (storytelling-revival.md, task #71)", () => {
    it("shows real discoveries once they load", async () => {
      const { getCodexDiscoveries } = await import("../../api/client.js");
      (getCodexDiscoveries as ReturnType<typeof vi.fn>).mockResolvedValue([
        { key: "first-link", title: "A First Connection", lore: "Two ideas met for the first time.", icon: "🔗", focusId: 1, createdAt: "" },
      ]);
      render(<GymOverlay graph={{ nodes: [], links: [] }} fuel={null} streak={null} onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByText("A First Connection")).toBeTruthy());
    });

    it("shows a none-yet message rather than a blank Codex section", async () => {
      const { getCodexDiscoveries } = await import("../../api/client.js");
      (getCodexDiscoveries as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      render(<GymOverlay graph={{ nodes: [], links: [] }} fuel={null} streak={null} onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByText(/No discoveries charted yet/)).toBeTruthy());
    });

    it("claiming shows the real result and disables that button for the session", async () => {
      const { getCodexDiscoveries, claimCodexReward } = await import("../../api/client.js");
      (getCodexDiscoveries as ReturnType<typeof vi.fn>).mockResolvedValue([
        { key: "first-link", title: "A First Connection", lore: "", icon: "🔗", focusId: 1, createdAt: "" },
      ]);
      (claimCodexReward as ReturnType<typeof vi.fn>).mockResolvedValue({ awarded: true, fuel: 5 });
      render(<GymOverlay graph={{ nodes: [], links: [] }} fuel={null} streak={null} onClose={vi.fn()} />);
      await waitFor(() => screen.getByText("A First Connection"));
      fireEvent.click(screen.getByText("Claim"));
      await waitFor(() => expect(screen.getByText("+5 fuel!")).toBeTruthy());
      expect((screen.getByText("+5 fuel!") as HTMLButtonElement).disabled).toBe(true);
    });
  });
});
