import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import type { GraphNode } from "@brain/shared";

const createLens = vi.fn().mockResolvedValue({ id: 1, name: "Goals", query: { kinds: ["goal"] }, pinned: false });
// GalaxyViews now renders <LensChips> inside its dropdown (Phase M — see .lens-list's CSS
// comment), which also imports from ../api/lenses.js — getLenses/lensNodes need mocking too.
vi.mock("../api/lenses.js", () => ({
  createLens: (...a: unknown[]) => createLens(...a),
  getLenses: vi.fn().mockResolvedValue([]),
  lensNodes: vi.fn().mockResolvedValue([]),
}));
vi.mock("../api/finance.js", () => ({ getMoneySky: vi.fn().mockResolvedValue([]) }));
vi.mock("../api/journeys.js", () => ({ getJourneys: vi.fn().mockResolvedValue([]) }));
const pushToast = vi.fn();
vi.mock("./Toasts.js", () => ({ pushToast: (...a: unknown[]) => pushToast(...a) }));

import { GalaxyViews } from "./GalaxyViews.js";

afterEach(cleanup);

function goalNode(id: number): GraphNode {
  return { id, label: `goal ${id}`, type: "concept", kind: "goal", content: "", createdAt: "2026-01-01T00:00:00Z" } as GraphNode;
}

describe("GalaxyViews — Save as Lens bridge", () => {
  it("does not show 'Save as Lens' with no active view", () => {
    render(
      <GalaxyViews nodes={[goalNode(1)]} activeView={null} onOpen={vi.fn()} onExit={vi.fn()} />,
    );
    // Open the panel first.
    screen.getByText(/Views/).click();
    expect(screen.queryByText(/Save as Lens/)).toBeNull();
  });

  it("shows 'Save as Lens' for an active category view and creates the matching LensQuery", async () => {
    render(
      <GalaxyViews nodes={[goalNode(1), goalNode(2)]} activeView="🎯 Goals" onOpen={vi.fn()} onExit={vi.fn()} />,
    );
    screen.getByText(/Views/).click();
    const btn = await screen.findByText(/Save as Lens/);
    btn.click();
    await waitFor(() => expect(createLens).toHaveBeenCalledWith("Goals", { kinds: ["goal"] }, false));
    await waitFor(() => expect(pushToast).toHaveBeenCalled());
  });

  it("does not show 'Save as Lens' for an overlay layer (money/journeys), only real categories", () => {
    render(
      <GalaxyViews nodes={[goalNode(1)]} activeView="💵 Money sky" onOpen={vi.fn()} onExit={vi.fn()} onLayer={vi.fn()} />,
    );
    screen.getByText(/Views/).click();
    expect(screen.queryByText(/Save as Lens/)).toBeNull();
  });
});

// Phase M (real on-device screenshot bug report): pinned lenses previously rendered as
// their own independently-floating overlay that could visually collide with this dropdown
// (see .gv-wrap's CSS comment for the confirmed root cause). They now render as a plain
// list INSIDE this dropdown instead of as a second floating element.
describe("GalaxyViews — pinned lenses render inside this dropdown, not a separate overlay", () => {
  it("shows nothing lens-related while the dropdown is collapsed", () => {
    render(<GalaxyViews nodes={[goalNode(1)]} activeView={null} onOpen={vi.fn()} onExit={vi.fn()} />);
    expect(screen.queryByText("📌 Pinned Lenses")).toBeNull();
  });

  it("shows the pinned-lens list once the dropdown is opened", async () => {
    const { getLenses } = await import("../api/lenses.js");
    vi.mocked(getLenses).mockResolvedValue([{ id: 9, name: "Linked to Girlfriend", query: {}, pinned: true, count: 4 }]);
    const { container } = render(<GalaxyViews nodes={[goalNode(1)]} activeView={null} onOpen={vi.fn()} onExit={vi.fn()} />);
    screen.getByText(/Views/).click();
    await screen.findByText("Linked to Girlfriend");
    // Confirms it's a DOM descendant of .gv-wrap (the one dropdown), not a sibling overlay.
    expect(container.querySelector(".gv-wrap .lens-list")).not.toBeNull();
  });
});
