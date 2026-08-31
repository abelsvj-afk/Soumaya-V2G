import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, waitFor } from "@testing-library/react";
import type { GraphNode } from "@brain/shared";

const getConstellations = vi.fn();
const getVisitorActivity = vi.fn();
vi.mock("../api/client.js", () => ({
  getConstellations: (...a: unknown[]) => getConstellations(...a),
  getVisitorActivity: (...a: unknown[]) => getVisitorActivity(...a),
  useProcessingNodes: () => new Set<number>(),
}));

import { NodeList } from "./NodeList.js";

function node(over: Partial<GraphNode>): GraphNode {
  return {
    id: 1,
    label: "A memory",
    type: "concept",
    content: "",
    createdAt: "2026-01-01 00:00:00",
    ...over,
  } as GraphNode;
}

beforeEach(() => {
  vi.resetAllMocks();
  getConstellations.mockResolvedValue([]);
  getVisitorActivity.mockResolvedValue([]);
});

afterEach(() => cleanup());

describe("NodeList — the 'reminder incoming' banner shows the SOONEST reminder", () => {
  it("picks the earliest remindAt as [0], not just array order", async () => {
    const soon = new Date(Date.now() + 2 * 3600 * 1000).toISOString(); // in 2h
    const later = new Date(Date.now() + 20 * 3600 * 1000).toISOString(); // in 20h
    const nodes = [
      node({ id: 1, label: "Later one", remindAt: later }),
      node({ id: 2, label: "Sooner one", remindAt: soon }),
    ];
    render(<NodeList nodes={nodes} onFocus={() => {}} />);
    await screen.findByText(/Reminder incoming/);
    expect(screen.getByText(/"Sooner one/)).toBeTruthy();
  });
});

describe("NodeList — constellations refresh when one is newly promoted", () => {
  it("refetches getConstellations() on the brain-constellation-formed event", async () => {
    render(<NodeList nodes={[node({ id: 1 })]} onFocus={() => {}} />);
    await waitFor(() => expect(getConstellations).toHaveBeenCalledTimes(1));
    act(() => window.dispatchEvent(new CustomEvent("brain-constellation-formed", { detail: { id: 99 } })));
    await waitFor(() => expect(getConstellations).toHaveBeenCalledTimes(2));
  });
});
