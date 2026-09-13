import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { GraphData, GraphNode } from "@brain/shared";
import { ObservatoryOverlay } from "./ObservatoryOverlay.js";

vi.mock("../../api/client.js", () => ({
  getDigest: vi.fn().mockResolvedValue([]),
  resolveInsight: vi.fn().mockResolvedValue(true),
  getDailyContact: vi.fn().mockResolvedValue(null),
  answerDailyContact: vi.fn().mockResolvedValue({ nodeIds: [], fuelEarned: 0, streakAdvanced: false }),
}));

vi.mock("../../api/journeys.js", () => ({
  getJourneys: vi.fn().mockResolvedValue([]),
}));

function makeInsight(overrides = {}) {
  return { id: 1, text: "Your rent and your job stress are linked", score: 0.8, createdAt: "", nodes: [{ id: 1, label: "Rent", type: "concept" }], ...overrides };
}

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return { id: 1, label: "n", type: "concept", content: "", createdAt: "2026-01-01T00:00:00.000Z", ...overrides };
}

const EMPTY_GRAPH: GraphData = { nodes: [], links: [] };

describe("ObservatoryOverlay", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a loading state, then real digest insights", async () => {
    const { getDigest } = await import("../../api/client.js");
    (getDigest as ReturnType<typeof vi.fn>).mockResolvedValue([makeInsight()]);
    render(<ObservatoryOverlay spaceId="space-1" graph={EMPTY_GRAPH} safeToSpendCents={0} dueReviews={[]} onClose={vi.fn()} />);
    expect(screen.getByText(/Charting the sky/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/rent and your job stress/)).toBeTruthy());
  });

  it("shows an empty-sky message rather than a blank screen", async () => {
    const { getDigest } = await import("../../api/client.js");
    (getDigest as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<ObservatoryOverlay spaceId="space-1" graph={EMPTY_GRAPH} safeToSpendCents={0} dueReviews={[]} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/No new connections/)).toBeTruthy());
  });

  it("marking an insight seen calls resolveInsight and removes it from the list", async () => {
    const { getDigest, resolveInsight } = await import("../../api/client.js");
    (getDigest as ReturnType<typeof vi.fn>).mockResolvedValue([makeInsight()]);
    render(<ObservatoryOverlay spaceId="space-1" graph={EMPTY_GRAPH} safeToSpendCents={0} dueReviews={[]} onClose={vi.fn()} />);
    await waitFor(() => screen.getByText("Mark seen"));
    fireEvent.click(screen.getByText("Mark seen"));
    await waitFor(() => expect(resolveInsight).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.queryByText(/rent and your job stress/)).toBeNull());
  });

  describe("Mission Control (mission-control.md)", () => {
    it("shows a real open-quest and due-reminder count from the graph", () => {
      const graph: GraphData = {
        nodes: [
          makeNode({ id: 1, kind: "action", label: "Quest 1" }),
          makeNode({ id: 2, kind: "action", label: "Quest 2" }),
          makeNode({ id: 3, label: "Overdue", remindAt: "2020-01-01T00:00:00.000Z" }),
          makeNode({ id: 4, label: "Future", remindAt: "2999-01-01T00:00:00.000Z" }),
        ],
        links: [],
      };
      render(<ObservatoryOverlay spaceId="space-1" graph={graph} safeToSpendCents={0} dueReviews={[]} onClose={vi.fn()} />);
      expect(screen.getByText(/2 open quests · 1 reminder due/)).toBeTruthy();
    });

    it("shows the real safe-to-spend balance", () => {
      render(<ObservatoryOverlay spaceId="space-1" graph={EMPTY_GRAPH} safeToSpendCents={2500} dueReviews={[]} onClose={vi.fn()} />);
      expect(screen.getByText("$25.00")).toBeTruthy();
    });

    it("shows an unanswered Daily Contact question with an answer form", async () => {
      const { getDailyContact } = await import("../../api/client.js");
      (getDailyContact as ReturnType<typeof vi.fn>).mockResolvedValue({
        date: "2026-01-01",
        question: { text: "What's on your mind?", nodeId: null, nodeLabel: null, source: "research" },
        discovery: null,
        foresight: null,
        answered: false,
      });
      render(<ObservatoryOverlay spaceId="space-1" graph={EMPTY_GRAPH} safeToSpendCents={0} dueReviews={[]} onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByText("What's on your mind?")).toBeTruthy());
      expect(screen.getByPlaceholderText("Your answer...")).toBeTruthy();
    });

    it("answering the Daily Contact question calls answerDailyContact and credits the Observatory's own work", async () => {
      const { getDailyContact, answerDailyContact } = await import("../../api/client.js");
      (getDailyContact as ReturnType<typeof vi.fn>).mockResolvedValue({
        date: "2026-01-01",
        question: { text: "What's on your mind?", nodeId: null, nodeLabel: null, source: "research" },
        discovery: null,
        foresight: null,
        answered: false,
      });
      render(<ObservatoryOverlay spaceId="space-1" graph={EMPTY_GRAPH} safeToSpendCents={0} dueReviews={[]} onClose={vi.fn()} />);
      await waitFor(() => screen.getByPlaceholderText("Your answer..."));
      fireEvent.change(screen.getByPlaceholderText("Your answer..."), { target: { value: "Feeling good" } });
      fireEvent.click(screen.getByText("Answer"));
      await waitFor(() => expect(answerDailyContact).toHaveBeenCalledWith("Feeling good"));
      await waitFor(() => expect(screen.getByText(/Answered for today/)).toBeTruthy());
    });

    it("shows the first due-for-recall review as \"worth a moment\"", () => {
      render(
        <ObservatoryOverlay
          spaceId="space-1"
          graph={EMPTY_GRAPH}
          safeToSpendCents={0}
          dueReviews={[{ id: 9, label: "That trip to Denver", strength: 0.2, reviewCount: 1 }]}
          onClose={vi.fn()}
        />,
      );
      expect(screen.getByText(/That trip to Denver/)).toBeTruthy();
    });

    it("shows active Journeys with real progress, capped at 3", async () => {
      const { getJourneys } = await import("../../api/journeys.js");
      (getJourneys as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 1, title: "Learning guitar", status: "active", progress: 0.62, description: "", createdAt: "", updatedAt: "" },
        { id: 2, title: "Paused thing", status: "paused", progress: 0.1, description: "", createdAt: "", updatedAt: "" },
      ]);
      render(<ObservatoryOverlay spaceId="space-1" graph={EMPTY_GRAPH} safeToSpendCents={0} dueReviews={[]} onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByText(/62% — Learning guitar/)).toBeTruthy());
      expect(screen.queryByText(/Paused thing/)).toBeNull();
    });

    it("shows recent activity from the graph, most recent first", () => {
      const graph: GraphData = {
        nodes: [
          makeNode({ id: 1, label: "Older", createdAt: "2026-01-01T00:00:00.000Z" }),
          makeNode({ id: 2, label: "Newer", createdAt: "2026-02-01T00:00:00.000Z" }),
        ],
        links: [],
      };
      render(<ObservatoryOverlay spaceId="space-1" graph={graph} safeToSpendCents={0} dueReviews={[]} onClose={vi.fn()} />);
      const items = screen.getAllByRole("listitem").map((li) => li.textContent);
      expect(items.indexOf("Newer")).toBeLessThan(items.indexOf("Older"));
    });
  });
});
