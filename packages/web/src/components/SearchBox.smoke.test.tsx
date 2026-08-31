import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

const searchDetailed = vi.fn();
vi.mock("../api/client.js", () => ({
  searchDetailed: (...a: unknown[]) => searchDetailed(...a),
}));

import { SearchBox } from "./SearchBox.js";

beforeEach(() => vi.resetAllMocks());
afterEach(() => cleanup());

function submit(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
  fireEvent.submit(input.closest("form")!);
}

describe("SearchBox — a real failure reads differently from zero matches", () => {
  it("shows the error message instead of a bare 'No matches'", async () => {
    searchDetailed.mockResolvedValue({ hits: [], error: "Couldn't reach the server." });
    render(<SearchBox onFocus={() => {}} />);
    const input = screen.getByPlaceholderText("Search your mind…");
    await act(async () => { submit(input, "hello"); });
    await screen.findByText(/Couldn't reach the server/);
    expect(screen.queryByText("No matches.")).toBeNull();
  });

  it("shows 'No matches' for a genuinely empty, successful result", async () => {
    searchDetailed.mockResolvedValue({ hits: [] });
    render(<SearchBox onFocus={() => {}} />);
    const input = screen.getByPlaceholderText("Search your mind…");
    await act(async () => { submit(input, "hello"); });
    await screen.findByText("No matches.");
  });
});

describe("SearchBox — a stale response can't clobber a newer one", () => {
  it("ignores the first (slow) search's result once a second search has already resolved", async () => {
    let resolveFirst!: (v: unknown) => void;
    searchDetailed
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }))
      .mockResolvedValueOnce({ hits: [{ id: 2, label: "Second result", type: "concept", similarity: 0.9 }] });

    render(<SearchBox onFocus={() => {}} />);
    const input = screen.getByPlaceholderText("Search your mind…");
    act(() => { submit(input, "first"); });
    await act(async () => { submit(input, "second"); await Promise.resolve(); });
    await screen.findByText("Second result");

    await act(async () => {
      resolveFirst({ hits: [{ id: 1, label: "First result", type: "concept", similarity: 0.5 }] });
    });
    expect(screen.queryByText("First result")).toBeNull();
    expect(screen.getByText("Second result")).toBeTruthy();
  });
});

describe("SearchBox — a hit with no similarity score doesn't render 'NaN%'", () => {
  it("renders an empty badge instead of NaN%", async () => {
    searchDetailed.mockResolvedValue({ hits: [{ id: 1, label: "No score", type: "concept" }] });
    render(<SearchBox onFocus={() => {}} />);
    const input = screen.getByPlaceholderText("Search your mind…");
    await act(async () => { submit(input, "hello"); });
    await screen.findByText("No score");
    expect(screen.queryByText(/NaN/)).toBeNull();
  });
});

describe("SearchBox — Escape closes it", () => {
  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(<SearchBox onFocus={() => {}} onClose={onClose} />);
    const input = screen.getByPlaceholderText("Search your mind…");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
