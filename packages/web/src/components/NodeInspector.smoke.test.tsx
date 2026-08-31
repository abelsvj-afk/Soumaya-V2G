import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, waitFor } from "@testing-library/react";
import type { GraphData, GraphNode } from "@brain/shared";

vi.mock("../api/client.js", () => ({
  deleteNode: vi.fn(),
  archiveNode: vi.fn(),
  setImportance: vi.fn(),
  synthesizeNode: vi.fn(),
  answerResearch: vi.fn(),
  requestMaintenance: vi.fn(),
  ingestText: vi.fn(),
}));
const playSfx = vi.fn();
vi.mock("../graph/sfx.js", () => ({ playSfx: (...a: unknown[]) => playSfx(...a) }));
const pushToast = vi.fn();
vi.mock("./Toasts.js", () => ({ pushToast: (...a: unknown[]) => pushToast(...a) }));
vi.mock("./MarkdownView.js", () => ({ MarkdownView: () => null }));
vi.mock("./Chronicle.js", () => ({ Chronicle: () => null }));
vi.mock("./MemoryAttachments.js", () => ({ MemoryAttachments: () => null }));
vi.mock("./JourneyChips.js", () => ({ JourneyChips: () => null }));

import { NodeInspector } from "./NodeInspector.js";
import { synthesizeNode, ingestText } from "../api/client.js";

function node(over: Partial<GraphNode>): GraphNode {
  return {
    id: 1,
    label: "A memory",
    type: "concept",
    content: "",
    kind: "memory",
    celestial: "moon",
    createdAt: "2026-01-01 00:00:00",
    ...over,
  } as GraphNode;
}

function graph(nodes: GraphNode[]): GraphData {
  return { nodes, links: [] } as unknown as GraphData;
}

beforeEach(() => vi.resetAllMocks());
afterEach(() => cleanup());

describe("NodeInspector — a memory leveling up into a new tier is celebrated", () => {
  it("does not celebrate the tier a memory already has on first view", async () => {
    const n = node({ id: 1, label: "Growing idea", celestial: "moon" });
    render(<NodeInspector node={n} graph={graph([n])} onFocus={() => {}} />);
    await screen.findByText("Growing idea");
    expect(playSfx).not.toHaveBeenCalled();
  });

  it("plays a milestone sound when the SAME memory is later seen in a higher tier", async () => {
    const moon = node({ id: 1, label: "Growing idea", celestial: "moon" });
    const { rerender } = render(<NodeInspector node={moon} graph={graph([moon])} onFocus={() => {}} />);
    await screen.findByText("Growing idea");
    expect(playSfx).not.toHaveBeenCalled();

    const planet = node({ id: 1, label: "Growing idea", celestial: "planet" });
    rerender(<NodeInspector node={planet} graph={graph([planet])} onFocus={() => {}} />);
    expect(playSfx).toHaveBeenCalledWith("milestone");
    expect(pushToast).toHaveBeenCalledWith(expect.stringContaining("Growing idea"), "✨", expect.any(Number));
  });

  it("does not celebrate a memory that drops back down a tier", async () => {
    const planet = node({ id: 1, label: "Cooling idea", celestial: "planet" });
    const { rerender } = render(<NodeInspector node={planet} graph={graph([planet])} onFocus={() => {}} />);
    await screen.findByText("Cooling idea");

    const moon = node({ id: 1, label: "Cooling idea", celestial: "moon" });
    rerender(<NodeInspector node={moon} graph={graph([moon])} onFocus={() => {}} />);
    expect(playSfx).not.toHaveBeenCalled();
  });
});

describe("NodeInspector — a synthesis insight is no longer a dead end", () => {
  it("offers to save the insight as a memory, then disables once saved", async () => {
    vi.mocked(synthesizeNode).mockResolvedValue({ text: "This connects to your goal of X.", connected: 2 });
    vi.mocked(ingestText).mockResolvedValue({ nodes: [{ id: 9 }] } as never);
    const n = node({ id: 1, label: "An idea" });
    render(<NodeInspector node={n} graph={graph([n])} onFocus={() => {}} />);
    const connectBtn = await screen.findByText("✨ Connect the dots");
    await act(async () => { connectBtn.click(); });
    await screen.findByText("This connects to your goal of X.");

    const saveBtn = screen.getByText("★ Save as memory");
    await act(async () => { saveBtn.click(); });
    await waitFor(() => expect(ingestText).toHaveBeenCalledTimes(1));
    expect(ingestText).toHaveBeenCalledWith(expect.stringContaining("This connects to your goal of X."));
    const savedBtn = await screen.findByText("✓ Saved");
    expect(savedBtn.getAttribute("disabled")).not.toBeNull();
  });
});
