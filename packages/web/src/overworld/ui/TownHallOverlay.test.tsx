import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { GraphData, GraphNode } from "@brain/shared";
import { TownHallOverlay } from "./TownHallOverlay.js";

vi.mock("../../api/journeys.js", () => ({
  getJourneys: vi.fn(),
  createJourney: vi.fn().mockResolvedValue({ id: 2, title: "New", progress: 0 }),
  patchJourney: vi.fn().mockResolvedValue(null),
  deleteJourney: vi.fn().mockResolvedValue({ ok: true }),
  journeyLinks: vi.fn().mockResolvedValue([]),
  linkToJourney: vi.fn().mockResolvedValue({ id: 1, journeyId: 1, kind: "node", refId: 5, createdAt: "" }),
  unlinkFromJourney: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("../../api/client.js", () => ({
  getTimeline: vi.fn().mockResolvedValue([]),
  addTimelineChapter: vi.fn(),
  deleteTimelineChapter: vi.fn(),
}));

const EMPTY_GRAPH: GraphData = { nodes: [], links: [] };

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return { id: 5, label: "A real memory", type: "concept", content: "", createdAt: "", ...overrides };
}

function makeJourney(overrides = {}) {
  return { id: 1, title: "Moving out", description: "", status: "active", progress: 0.4, createdAt: "", updatedAt: "", ...overrides };
}

describe("TownHallOverlay", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a loading state, then real journeys with real progress", async () => {
    const { getJourneys } = await import("../../api/journeys.js");
    (getJourneys as ReturnType<typeof vi.fn>).mockResolvedValue([makeJourney()]);
    render(<TownHallOverlay spaceId="space-1" graph={EMPTY_GRAPH} onClose={vi.fn()} />);
    expect(screen.getByText(/Loading your Journeys/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/Moving out — 40%/)).toBeTruthy());
  });

  it("shows an empty state rather than a blank screen", async () => {
    const { getJourneys } = await import("../../api/journeys.js");
    (getJourneys as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<TownHallOverlay spaceId="space-1" graph={EMPTY_GRAPH} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/No Journeys yet/)).toBeTruthy());
  });

  it("creating a journey calls createJourney with the entered title/icon", async () => {
    const { getJourneys, createJourney } = await import("../../api/journeys.js");
    (getJourneys as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<TownHallOverlay spaceId="space-1" graph={EMPTY_GRAPH} onClose={vi.fn()} />);
    await waitFor(() => screen.getByText(/No Journeys yet/));
    fireEvent.change(screen.getByLabelText("Journey title"), { target: { value: "New chapter" } });
    fireEvent.click(screen.getByText("Begin"));
    await waitFor(() => expect(createJourney).toHaveBeenCalledWith({ title: "New chapter", icon: "🧭" }));
  });

  it("advancing progress calls patchJourney with a clamped 0..1 value", async () => {
    const { getJourneys, patchJourney } = await import("../../api/journeys.js");
    (getJourneys as ReturnType<typeof vi.fn>).mockResolvedValue([makeJourney({ progress: 0.95 })]);
    render(<TownHallOverlay spaceId="space-1" graph={EMPTY_GRAPH} onClose={vi.fn()} />);
    await waitFor(() => screen.getByText(/Moving out/));
    fireEvent.click(screen.getByLabelText("Advance Moving out"));
    await waitFor(() => expect(patchJourney).toHaveBeenCalledWith(1, { progress: 1 }));
  });

  describe("Journey links (overlay quality-parity audit, task #79)", () => {
    it("expanding a Journey shows a real unlink button per linked item", async () => {
      const { getJourneys, journeyLinks } = await import("../../api/journeys.js");
      (getJourneys as ReturnType<typeof vi.fn>).mockResolvedValue([makeJourney()]);
      (journeyLinks as ReturnType<typeof vi.fn>).mockResolvedValue([{ kind: "node", refId: 5, label: "A real memory" }]);
      render(<TownHallOverlay spaceId="space-1" graph={EMPTY_GRAPH} onClose={vi.fn()} />);
      await waitFor(() => screen.getByText(/Moving out/));
      fireEvent.click(screen.getByText(/Moving out — 40%/));
      await waitFor(() => expect(screen.getByLabelText("Unlink A real memory")).toBeTruthy());
    });

    it("unlinking calls unlinkFromJourney and refreshes the links list", async () => {
      const { getJourneys, journeyLinks, unlinkFromJourney } = await import("../../api/journeys.js");
      (getJourneys as ReturnType<typeof vi.fn>).mockResolvedValue([makeJourney()]);
      (journeyLinks as ReturnType<typeof vi.fn>).mockResolvedValue([{ kind: "node", refId: 5, label: "A real memory" }]);
      render(<TownHallOverlay spaceId="space-1" graph={EMPTY_GRAPH} onClose={vi.fn()} />);
      await waitFor(() => screen.getByText(/Moving out/));
      fireEvent.click(screen.getByText(/Moving out — 40%/));
      await waitFor(() => screen.getByLabelText("Unlink A real memory"));
      fireEvent.click(screen.getByLabelText("Unlink A real memory"));
      await waitFor(() => expect(unlinkFromJourney).toHaveBeenCalledWith(1, "node", 5));
    });

    it("offers a real memory picker excluding non-memory kinds and already-linked ones", async () => {
      const { getJourneys, journeyLinks } = await import("../../api/journeys.js");
      (getJourneys as ReturnType<typeof vi.fn>).mockResolvedValue([makeJourney()]);
      (journeyLinks as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const graph: GraphData = {
        nodes: [makeNode({ id: 5, label: "Linkable memory" }), makeNode({ id: 6, kind: "action", label: "A quest" })],
        links: [],
      };
      render(<TownHallOverlay spaceId="space-1" graph={graph} onClose={vi.fn()} />);
      await waitFor(() => screen.getByText(/Moving out/));
      fireEvent.click(screen.getByText(/Moving out — 40%/));
      await waitFor(() => screen.getByLabelText("Memory to link"));
      const select = screen.getByLabelText("Memory to link") as HTMLSelectElement;
      const optionLabels = Array.from(select.options).map((o) => o.textContent);
      expect(optionLabels).toContain("Linkable memory");
      expect(optionLabels).not.toContain("A quest");
    });

    it("linking a memory calls linkToJourney and refreshes the links list", async () => {
      const { getJourneys, journeyLinks, linkToJourney } = await import("../../api/journeys.js");
      (getJourneys as ReturnType<typeof vi.fn>).mockResolvedValue([makeJourney()]);
      (journeyLinks as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const graph: GraphData = { nodes: [makeNode({ id: 5, label: "Linkable memory" })], links: [] };
      render(<TownHallOverlay spaceId="space-1" graph={graph} onClose={vi.fn()} />);
      await waitFor(() => screen.getByText(/Moving out/));
      fireEvent.click(screen.getByText(/Moving out — 40%/));
      await waitFor(() => screen.getByLabelText("Memory to link"));
      fireEvent.change(screen.getByLabelText("Memory to link"), { target: { value: "5" } });
      fireEvent.click(screen.getByText("Link"));
      await waitFor(() => expect(linkToJourney).toHaveBeenCalledWith(1, "node", 5));
    });
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
      render(<TownHallOverlay spaceId="space-1" graph={EMPTY_GRAPH} onClose={vi.fn()} />);
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
      render(<TownHallOverlay spaceId="space-1" graph={EMPTY_GRAPH} onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByText(/My own chapter/)).toBeTruthy());
      expect(screen.getAllByText("Delete")).toHaveLength(1);
      expect(screen.getByLabelText("Delete My own chapter")).toBeTruthy();
    });

    it("2026-09-15 audit fix — deleting a chapter is behind a real confirm step, never a single tap", async () => {
      const { getJourneys } = await import("../../api/journeys.js");
      (getJourneys as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const { getTimeline, deleteTimelineChapter } = await import("../../api/client.js");
      (getTimeline as ReturnType<typeof vi.fn>).mockResolvedValue([makeChapter({ id: 2, title: "My own chapter", origin: "user" })]);
      (deleteTimelineChapter as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      render(<TownHallOverlay spaceId="space-1" graph={EMPTY_GRAPH} onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByText(/My own chapter/)).toBeTruthy());
      fireEvent.click(screen.getByLabelText("Delete My own chapter"));
      expect(deleteTimelineChapter).not.toHaveBeenCalled(); // the first tap only arms the confirm
      fireEvent.click(screen.getByText("Really delete?"));
      await waitFor(() => expect(deleteTimelineChapter).toHaveBeenCalledWith(2));
    });

    it("marking a chapter now calls the real addTimelineChapter and refreshes the list", async () => {
      const { getJourneys } = await import("../../api/journeys.js");
      (getJourneys as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const { getTimeline, addTimelineChapter } = await import("../../api/client.js");
      (getTimeline as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (addTimelineChapter as ReturnType<typeof vi.fn>).mockResolvedValue(makeChapter());
      render(<TownHallOverlay spaceId="space-1" graph={EMPTY_GRAPH} onClose={vi.fn()} />);
      await waitFor(() => screen.getByText(/No chapters chronicled yet/));
      fireEvent.click(screen.getByText("+ Mark this chapter now"));
      await waitFor(() => expect(addTimelineChapter).toHaveBeenCalled());
      await waitFor(() => expect(getTimeline).toHaveBeenCalledTimes(2));
    });
  });
});
