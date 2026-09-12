import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TownHallOverlay } from "./TownHallOverlay.js";

vi.mock("../../api/journeys.js", () => ({
  getJourneys: vi.fn(),
  createJourney: vi.fn().mockResolvedValue({ id: 2, title: "New", progress: 0 }),
  patchJourney: vi.fn().mockResolvedValue(null),
  deleteJourney: vi.fn().mockResolvedValue({ ok: true }),
  journeyLinks: vi.fn().mockResolvedValue([]),
}));

function makeJourney(overrides = {}) {
  return { id: 1, title: "Moving out", description: "", status: "active", progress: 0.4, createdAt: "", updatedAt: "", ...overrides };
}

describe("TownHallOverlay", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a loading state, then real journeys with real progress", async () => {
    const { getJourneys } = await import("../../api/journeys.js");
    (getJourneys as ReturnType<typeof vi.fn>).mockResolvedValue([makeJourney()]);
    render(<TownHallOverlay spaceId="space-1" onClose={vi.fn()} />);
    expect(screen.getByText(/Loading your Journeys/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/Moving out — 40%/)).toBeTruthy());
  });

  it("shows an empty state rather than a blank screen", async () => {
    const { getJourneys } = await import("../../api/journeys.js");
    (getJourneys as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<TownHallOverlay spaceId="space-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/No Journeys yet/)).toBeTruthy());
  });

  it("creating a journey calls createJourney with the entered title/icon", async () => {
    const { getJourneys, createJourney } = await import("../../api/journeys.js");
    (getJourneys as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<TownHallOverlay spaceId="space-1" onClose={vi.fn()} />);
    await waitFor(() => screen.getByText(/No Journeys yet/));
    fireEvent.change(screen.getByLabelText("Journey title"), { target: { value: "New chapter" } });
    fireEvent.click(screen.getByText("Begin"));
    await waitFor(() => expect(createJourney).toHaveBeenCalledWith({ title: "New chapter", icon: "🧭" }));
  });

  it("advancing progress calls patchJourney with a clamped 0..1 value", async () => {
    const { getJourneys, patchJourney } = await import("../../api/journeys.js");
    (getJourneys as ReturnType<typeof vi.fn>).mockResolvedValue([makeJourney({ progress: 0.95 })]);
    render(<TownHallOverlay spaceId="space-1" onClose={vi.fn()} />);
    await waitFor(() => screen.getByText(/Moving out/));
    fireEvent.click(screen.getByLabelText("Advance Moving out"));
    await waitFor(() => expect(patchJourney).toHaveBeenCalledWith(1, { progress: 1 }));
  });
});
