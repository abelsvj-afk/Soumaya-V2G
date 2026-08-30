import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import type { GraphNode } from "@brain/shared";

const createLens = vi.fn().mockResolvedValue({ id: 1, name: "Goals", query: { kinds: ["goal"] }, pinned: false });
vi.mock("../api/lenses.js", () => ({
  createLens: (...a: unknown[]) => createLens(...a),
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
