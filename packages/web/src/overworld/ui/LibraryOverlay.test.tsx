import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { GraphData } from "@brain/shared";
import { LibraryOverlay } from "./LibraryOverlay.js";

vi.mock("../../api/client.js", () => ({
  search: vi.fn(),
  getLenses: vi.fn().mockResolvedValue([]),
  createLens: vi.fn(),
  deleteLens: vi.fn(),
  lensNodes: vi.fn(),
}));

describe("LibraryOverlay", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows real shelves grouped by type, collapsed by default", async () => {
    const { getLenses } = await import("../../api/client.js");
    (getLenses as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const graph: GraphData = {
      nodes: [
        { id: 1, label: "Alice", type: "person", content: "", createdAt: "2026-01-01T00:00:00.000Z" },
        { id: 2, label: "Rocket idea", type: "concept", content: "", createdAt: "2026-01-01T00:00:00.000Z" },
      ],
      links: [],
    };
    render(<LibraryOverlay graph={graph} spaceId="space-1" onClose={vi.fn()} />);
    expect(screen.getByText(/People \(1\)/)).toBeTruthy();
    expect(screen.queryByText("Alice")).toBeNull(); // not expanded yet
    fireEvent.click(screen.getByText(/People \(1\)/));
    expect(screen.getByText("Alice")).toBeTruthy();
  });

  it("runs a real full-text search across the whole brain, not just the loaded shelf sample", async () => {
    const { search, getLenses } = await import("../../api/client.js");
    (getLenses as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (search as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 9, label: "Distant memory", type: "concept", content: "", createdAt: "2026-01-01T00:00:00.000Z", similarity: 0.9 },
    ]);
    render(<LibraryOverlay graph={{ nodes: [], links: [] }} spaceId="space-1" onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Search the library"), { target: { value: "distant" } });
    fireEvent.click(screen.getByText("Search"));
    await waitFor(() => expect(screen.getByText(/Distant memory/)).toBeTruthy());
    expect(search).toHaveBeenCalledWith("distant");
  });

  it("shows an empty-library message rather than a blank screen", async () => {
    const { getLenses } = await import("../../api/client.js");
    (getLenses as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<LibraryOverlay graph={{ nodes: [], links: [] }} spaceId="space-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/library is empty/)).toBeTruthy());
  });

  describe("Lenses (lenses-revival.md, task #72)", () => {
    it("loads and lists the real saved lenses on open", async () => {
      const { getLenses } = await import("../../api/client.js");
      (getLenses as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 1, name: "old ideas", query: { text: "idea" }, pinned: false, count: 3 }]);
      render(<LibraryOverlay graph={{ nodes: [], links: [] }} spaceId="space-1" onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByText(/old ideas/)).toBeTruthy());
      expect(screen.getByText(/\(3\)/)).toBeTruthy();
    });

    it("offers to save a real search as a lens once results come back", async () => {
      const { search, getLenses, createLens } = await import("../../api/client.js");
      (getLenses as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (search as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 5, label: "Match", type: "concept", content: "", createdAt: "" }]);
      (createLens as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 2, name: "distant", query: { text: "distant" }, pinned: false });
      render(<LibraryOverlay graph={{ nodes: [], links: [] }} spaceId="space-1" onClose={vi.fn()} />);
      await waitFor(() => expect(getLenses).toHaveBeenCalled());
      fireEvent.change(screen.getByLabelText("Search the library"), { target: { value: "distant" } });
      fireEvent.click(screen.getByText("Search"));
      await waitFor(() => expect(screen.getByText(/Save this search as a Lens/)).toBeTruthy());
      fireEvent.click(screen.getByText(/Save this search as a Lens/));
      await waitFor(() => expect(createLens).toHaveBeenCalledWith("distant", { text: "distant" }));
    });

    it("viewing a lens filters the shelf to its real matching node ids", async () => {
      const { getLenses, lensNodes } = await import("../../api/client.js");
      (getLenses as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 1, name: "rockets", query: { text: "rocket" }, pinned: false }]);
      (lensNodes as ReturnType<typeof vi.fn>).mockResolvedValue([2]);
      const graph: GraphData = {
        nodes: [
          { id: 1, label: "Alice", type: "person", content: "", createdAt: "" },
          { id: 2, label: "Rocket idea", type: "concept", content: "", createdAt: "" },
        ],
        links: [],
      };
      render(<LibraryOverlay graph={graph} spaceId="space-1" onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByText(/rockets/)).toBeTruthy());
      fireEvent.click(screen.getByText("View"));
      await waitFor(() => expect(screen.getByText("Rocket idea")).toBeTruthy());
      expect(screen.queryByText("Alice")).toBeNull();
    });

    it("deleting a lens removes it from the real list, behind a real confirm step (2026-09-15 audit fix)", async () => {
      const { getLenses, deleteLens } = await import("../../api/client.js");
      (getLenses as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 1, name: "rockets", query: { text: "rocket" }, pinned: false }]);
      (deleteLens as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      render(<LibraryOverlay graph={{ nodes: [], links: [] }} spaceId="space-1" onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByText(/rockets/)).toBeTruthy());
      fireEvent.click(screen.getByText("Delete"));
      expect(deleteLens).not.toHaveBeenCalled(); // the first tap only arms the confirm, never deletes
      fireEvent.click(screen.getByText("Really delete?"));
      await waitFor(() => expect(screen.queryByText(/rockets/)).toBeNull());
      expect(deleteLens).toHaveBeenCalledWith(1);
    });
  });
});
