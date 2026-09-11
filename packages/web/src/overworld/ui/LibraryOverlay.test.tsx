import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { GraphData } from "@brain/shared";
import { LibraryOverlay } from "./LibraryOverlay.js";

vi.mock("../../api/client.js", () => ({
  search: vi.fn(),
}));

describe("LibraryOverlay", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows real shelves grouped by type, collapsed by default", () => {
    const graph: GraphData = {
      nodes: [
        { id: 1, label: "Alice", type: "person", content: "", createdAt: "2026-01-01T00:00:00.000Z" },
        { id: 2, label: "Rocket idea", type: "concept", content: "", createdAt: "2026-01-01T00:00:00.000Z" },
      ],
      links: [],
    };
    render(<LibraryOverlay graph={graph} onClose={vi.fn()} />);
    expect(screen.getByText(/People \(1\)/)).toBeTruthy();
    expect(screen.queryByText("Alice")).toBeNull(); // not expanded yet
    fireEvent.click(screen.getByText(/People \(1\)/));
    expect(screen.getByText("Alice")).toBeTruthy();
  });

  it("runs a real full-text search across the whole brain, not just the loaded shelf sample", async () => {
    const { search } = await import("../../api/client.js");
    (search as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 9, label: "Distant memory", type: "concept", content: "", createdAt: "2026-01-01T00:00:00.000Z", similarity: 0.9 },
    ]);
    render(<LibraryOverlay graph={{ nodes: [], links: [] }} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Search the library"), { target: { value: "distant" } });
    fireEvent.click(screen.getByText("Search"));
    await waitFor(() => expect(screen.getByText(/Distant memory/)).toBeTruthy());
    expect(search).toHaveBeenCalledWith("distant");
  });

  it("shows an empty-library message rather than a blank screen", () => {
    render(<LibraryOverlay graph={{ nodes: [], links: [] }} onClose={vi.fn()} />);
    expect(screen.getByText(/library is empty/)).toBeTruthy();
  });
});
