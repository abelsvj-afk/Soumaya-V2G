import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { GraphData, GraphNode } from "@brain/shared";

const playSfx = vi.fn();
vi.mock("../graph/sfx.js", () => ({ playSfx: (...a: unknown[]) => playSfx(...a) }));
const pushToast = vi.fn();
vi.mock("./Toasts.js", () => ({ pushToast: (...a: unknown[]) => pushToast(...a) }));

import { SectorView } from "./SectorView.js";

function node(over: Partial<GraphNode>): GraphNode {
  return { id: 1, label: "Hub", type: "concept", content: "", mass: 0.9, ...over } as GraphNode;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SectorView — a transient action never forms a sector", () => {
  it("excludes a heavy action-kind node from the sector list", () => {
    const graph: GraphData = {
      nodes: [node({ id: 1, label: "Real hub", mass: 0.9 }), node({ id: 2, label: "Busy action", mass: 0.95, kind: "action" })],
      links: [],
    } as unknown as GraphData;
    render(<SectorView graph={graph} onFocus={() => {}} onIsolate={() => {}} />);
    expect(screen.getByText("Real hub")).toBeTruthy();
    expect(screen.queryByText("Busy action")).toBeNull();
  });
});

describe("SectorView — orbiting count prefers the server's own degree", () => {
  it("uses node.degree instead of undercounting when a linked neighbor isn't in graph.nodes", () => {
    const graph: GraphData = {
      nodes: [node({ id: 1, label: "Hub", mass: 0.9, degree: 5 })], // 5 real edges server-side
      // No links array entry for the hub at all client-side (e.g. neighbors filtered out).
      links: [],
    } as unknown as GraphData;
    render(<SectorView graph={graph} onFocus={() => {}} onIsolate={() => {}} />);
    expect(screen.getByText("5 memories orbiting")).toBeTruthy();
  });
});

describe("SectorView — a newly-formed sector is celebrated, not silently listed", () => {
  it("plays a sound and toasts only on the real transition, never on initial mount", () => {
    const before: GraphData = { nodes: [node({ id: 1, label: "Old hub", mass: 0.9 })], links: [] } as unknown as GraphData;
    const { rerender } = render(<SectorView graph={before} onFocus={() => {}} onIsolate={() => {}} />);
    expect(playSfx).not.toHaveBeenCalled(); // mount alone must not celebrate the existing hub

    const after: GraphData = {
      nodes: [node({ id: 1, label: "Old hub", mass: 0.9 }), node({ id: 2, label: "Fresh hub", mass: 0.85 })],
      links: [],
    } as unknown as GraphData;
    rerender(<SectorView graph={after} onFocus={() => {}} onIsolate={() => {}} />);
    expect(playSfx).toHaveBeenCalledWith("milestone");
    expect(pushToast).toHaveBeenCalledWith(expect.stringContaining("Fresh hub"), "🌌", expect.any(Number));
  });
});
