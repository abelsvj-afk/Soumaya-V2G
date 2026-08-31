import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import type { GraphData, GraphNode } from "@brain/shared";

const getArchivedNodes = vi.fn();
const archiveNode = vi.fn();
vi.mock("../api/client.js", () => ({
  getArchivedNodes: (...a: unknown[]) => getArchivedNodes(...a),
  archiveNode: (...a: unknown[]) => archiveNode(...a),
}));
const pushToast = vi.fn();
vi.mock("./Toasts.js", () => ({ pushToast: (...a: unknown[]) => pushToast(...a) }));

import { LibraryPanel } from "./LibraryPanel.js";

function node(over: Partial<GraphNode>): GraphNode {
  return { id: 1, label: "A memory", type: "concept", kind: "node", createdAt: "2026-01-01", ...over } as GraphNode;
}

function graph(nodes: GraphNode[]): GraphData {
  return { nodes, links: [] } as unknown as GraphData;
}

beforeEach(() => {
  vi.resetAllMocks();
  getArchivedNodes.mockResolvedValue([]);
});

afterEach(() => cleanup());

describe("LibraryPanel — export failure surfaces a toast instead of doing nothing", () => {
  it("toasts when the browser blocks the 'Export all' download", async () => {
    // download() catches internally on any thrown step and returns false — reproduce
    // that by making URL.createObjectURL throw, the way a restricted context would.
    const orig = URL.createObjectURL;
    URL.createObjectURL = vi.fn(() => { throw new Error("blocked"); }) as unknown as typeof URL.createObjectURL;
    try {
      render(<LibraryPanel graph={graph([node({ id: 1 })])} onFocus={() => {}} />);
      const btn = await screen.findByTitle("Download every memory as Markdown");
      act(() => btn.click());
      expect(pushToast).toHaveBeenCalledWith(expect.stringContaining("Couldn't export"), "⚠️", expect.any(Number));
    } finally {
      URL.createObjectURL = orig;
    }
  });

  it("does not toast when the download succeeds", async () => {
    URL.createObjectURL = vi.fn(() => "blob:ok") as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    render(<LibraryPanel graph={graph([node({ id: 1 })])} onFocus={() => {}} />);
    const btn = await screen.findByTitle("Download every memory as Markdown");
    act(() => btn.click());
    expect(pushToast).not.toHaveBeenCalled();
  });
});

describe("LibraryPanel — restore failure surfaces a toast instead of doing nothing", () => {
  it("toasts when archiveNode(id, false) fails during a restore", async () => {
    getArchivedNodes.mockResolvedValue([node({ id: 9, label: "Resting memory" })]);
    archiveNode.mockResolvedValue(false);
    render(<LibraryPanel graph={graph([node({ id: 1 })])} onFocus={() => {}} />);

    const archivedHeader = await screen.findByText("📥 Archived");
    act(() => archivedHeader.click());
    const restoreBtn = await screen.findByText("↩ Restore");
    await act(async () => { restoreBtn.click(); await Promise.resolve(); });

    expect(pushToast).toHaveBeenCalledWith(expect.stringContaining("Couldn't restore"), "⚠️", expect.any(Number));
  });
});
