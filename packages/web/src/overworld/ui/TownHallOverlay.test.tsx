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
vi.mock("../../api/client.js", () => ({
  getTimeline: vi.fn().mockResolvedValue([]),
  addTimelineChapter: vi.fn(),
  deleteTimelineChapter: vi.fn(),
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

  describe("Timeline (storytelling-revival.md, task #71)", () => {
    function makeChapter(overrides = {}) {
      return {
        id: 1,
        title: "A quiet season",
        summary: "Not much changed.",
        theme: "steady",
        trend: "neutral" as const,
        score: 0.1,
        periodStart: "",
        periodEnd: "",
        memoryIds: [],
        photoIds: [],
        threads: [],
        origin: "auto" as const,
        createdAt: "",
        ...overrides,
      };
    }

    it("shows real chapters with a real, non-color trend badge", async () => {
      const { getJourneys } = await import("../../api/journeys.js");
      (getJourneys as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const { getTimeline } = await import("../../api/client.js");
      (getTimeline as ReturnType<typeof vi.fn>).mockResolvedValue([makeChapter({ trend: "growth" })]);
      render(<TownHallOverlay spaceId="space-1" onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByText(/A quiet season/)).toBeTruthy());
      expect(screen.getByText(/📈 growth/)).toBeTruthy();
    });

    it("only offers Delete for chapters the player wrote (origin === user)", async () => {
      const { getJourneys } = await import("../../api/journeys.js");
      (getJourneys as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const { getTimeline } = await import("../../api/client.js");
      (getTimeline as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeChapter({ id: 1, title: "Soumaya's chapter", origin: "auto" }),
        makeChapter({ id: 2, title: "My own chapter", origin: "user" }),
      ]);
      render(<TownHallOverlay spaceId="space-1" onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByText(/My own chapter/)).toBeTruthy());
      expect(screen.getAllByText("Delete")).toHaveLength(1);
      expect(screen.getByLabelText("Delete My own chapter")).toBeTruthy();
    });

    it("marking a chapter now calls the real addTimelineChapter and refreshes the list", async () => {
      const { getJourneys } = await import("../../api/journeys.js");
      (getJourneys as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const { getTimeline, addTimelineChapter } = await import("../../api/client.js");
      (getTimeline as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (addTimelineChapter as ReturnType<typeof vi.fn>).mockResolvedValue(makeChapter());
      render(<TownHallOverlay spaceId="space-1" onClose={vi.fn()} />);
      await waitFor(() => screen.getByText(/No chapters chronicled yet/));
      fireEvent.click(screen.getByText("+ Mark this chapter now"));
      await waitFor(() => expect(addTimelineChapter).toHaveBeenCalled());
      await waitFor(() => expect(getTimeline).toHaveBeenCalledTimes(2));
    });
  });
});
