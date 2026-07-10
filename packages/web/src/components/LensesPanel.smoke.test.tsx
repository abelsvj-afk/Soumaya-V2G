import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { LensesPanel } from "./LensesPanel.js";
import * as api from "../api/lenses.js";

afterEach(cleanup);
beforeEach(() => vi.restoreAllMocks());

describe("LensesPanel", () => {
  it("lists saved lenses with their live counts and opens one (isolate)", async () => {
    vi.spyOn(api, "getLenses").mockResolvedValue([
      { id: 1, name: "Heavy work", query: { emotion: "heavy" }, pinned: true, count: 4 },
    ]);
    vi.spyOn(api, "lensNodes").mockResolvedValue([11, 22, 33]);
    const onOpen = vi.fn();
    const onClose = vi.fn();

    render(<LensesPanel onClose={onClose} onOpen={onOpen} />);
    await waitFor(() => screen.getByText(/Heavy work/));
    expect(screen.getByText("4")).toBeTruthy(); // live count

    fireEvent.click(screen.getByText(/Heavy work/));
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith([11, 22, 33], "Heavy work"));
    expect(onClose).toHaveBeenCalled();
  });

  it("builds and saves a lens from the dropdowns", async () => {
    vi.spyOn(api, "getLenses").mockResolvedValue([]);
    const create = vi.spyOn(api, "createLens").mockResolvedValue({ id: 9, name: "Fresh sparks", query: { withinDays: 7 }, pinned: true, count: 2 });

    render(<LensesPanel onClose={vi.fn()} onOpen={vi.fn()} />);
    await waitFor(() => screen.getByText(/New lens/));
    fireEvent.click(screen.getByText(/New lens/));
    fireEvent.change(screen.getByPlaceholderText(/Lens name/), { target: { value: "Fresh sparks" } });
    fireEvent.click(screen.getByText("Save lens"));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0]![0]).toBe("Fresh sparks");
  });
});
