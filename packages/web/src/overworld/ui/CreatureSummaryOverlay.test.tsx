import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CreatureSummaryOverlay } from "./CreatureSummaryOverlay.js";
import type { CreatureEntity } from "../types.js";

vi.mock("../../api/journeys.js", () => ({
  journeysFor: vi.fn(),
}));
vi.mock("../../api/client.js", () => ({
  gradeReview: vi.fn(),
  getLore: vi.fn().mockResolvedValue([]),
  evolveLore: vi.fn(),
}));

function makeCreature(overrides: Partial<CreatureEntity> = {}): CreatureEntity {
  return {
    nodeId: 1,
    name: "Rent",
    type: "concept",
    celestial: "planet",
    rarity: { tier: "rare", label: "Rare", badge: "◆" },
    entropy: 0.1,
    degree: 3,
    isDue: false,
    dueForRecall: false,
    spriteKey: "creature_default",
    uncharted: true,
    ...overrides,
  };
}

describe("CreatureSummaryOverlay (Details tab equivalent)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows real stats — rarity, type, connection count", async () => {
    const { journeysFor } = await import("../../api/journeys.js");
    (journeysFor as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<CreatureSummaryOverlay creature={makeCreature()} onGreet={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/Rare/)).toBeTruthy();
    expect(screen.getByText(/Connections: 3/)).toBeTruthy();
  });

  it("2026-09-15 audit fix — out-ranks the persistent TownHud/button-row's zIndex:1", async () => {
    const { journeysFor } = await import("../../api/journeys.js");
    (journeysFor as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<CreatureSummaryOverlay creature={makeCreature()} onGreet={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("dialog").style.zIndex).toBe("10");
  });

  it("shows 'Uncharted' rather than an error when the node belongs to no Journey", async () => {
    const { journeysFor } = await import("../../api/journeys.js");
    (journeysFor as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<CreatureSummaryOverlay creature={makeCreature()} onGreet={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Uncharted/)).toBeTruthy());
  });

  it("shows the real Journey title when the node IS linked to one", async () => {
    const { journeysFor } = await import("../../api/journeys.js");
    (journeysFor as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 1, title: "Moving out", description: "", status: "active", progress: 0.2, createdAt: "", updatedAt: "" }]);
    render(<CreatureSummaryOverlay creature={makeCreature()} onGreet={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Journey: Moving out/)).toBeTruthy());
  });

  it("greeting and closing both call their handlers", async () => {
    const { journeysFor } = await import("../../api/journeys.js");
    (journeysFor as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const onGreet = vi.fn();
    const onClose = vi.fn();
    render(<CreatureSummaryOverlay creature={makeCreature()} onGreet={onGreet} onClose={onClose} />);
    fireEvent.click(screen.getByText("Greet"));
    expect(onGreet).toHaveBeenCalled();
    fireEvent.click(screen.getByText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("hides no recall check when the node isn't dueForRecall", async () => {
    const { journeysFor } = await import("../../api/journeys.js");
    (journeysFor as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<CreatureSummaryOverlay creature={makeCreature()} onGreet={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByText(/recall check/)).toBeNull();
  });

  it("a recall check hides content until revealed, then grades a real attempt and closes", async () => {
    const { journeysFor } = await import("../../api/journeys.js");
    (journeysFor as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const { gradeReview } = await import("../../api/client.js");
    (gradeReview as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const onClose = vi.fn();
    const onGraded = vi.fn();
    render(
      <CreatureSummaryOverlay
        creature={makeCreature({ dueForRecall: true })}
        onGreet={vi.fn()}
        onClose={onClose}
        onGraded={onGraded}
      />,
    );
    expect(screen.queryByText("I remembered")).toBeNull();
    fireEvent.click(screen.getByText("Try to recall it first"));
    fireEvent.click(screen.getByText("I remembered"));
    await waitFor(() => expect(gradeReview).toHaveBeenCalledWith(1, true));
    await waitFor(() => expect(onGraded).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  describe("Lore (storytelling-revival.md, task #71)", () => {
    it("shows the real latest chapter once its lore loads", async () => {
      const { journeysFor } = await import("../../api/journeys.js");
      (journeysFor as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const { getLore } = await import("../../api/client.js");
      (getLore as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 1, subjectType: "memory", subjectId: "1", version: 1, text: "It began quietly.", trigger: "genesis", createdAt: "" },
        { id: 2, subjectType: "memory", subjectId: "1", version: 2, text: "It grew, connected to others.", trigger: "evolved", createdAt: "" },
      ]);
      render(<CreatureSummaryOverlay creature={makeCreature()} onGreet={vi.fn()} onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByText("It grew, connected to others.")).toBeTruthy());
      expect(screen.getByText("Chapter 2")).toBeTruthy();
      expect(getLore).toHaveBeenCalledWith("memory", "1");
    });

    it("shows a never-chronicled message rather than a blank Lore section", async () => {
      const { journeysFor } = await import("../../api/journeys.js");
      (journeysFor as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const { getLore } = await import("../../api/client.js");
      (getLore as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      render(<CreatureSummaryOverlay creature={makeCreature()} onGreet={vi.fn()} onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByText(/No story chronicled yet/)).toBeTruthy());
    });

    it("evolving writes and shows the real next chapter", async () => {
      const { journeysFor } = await import("../../api/journeys.js");
      (journeysFor as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const { getLore, evolveLore } = await import("../../api/client.js");
      (getLore as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 1, subjectType: "memory", subjectId: "1", version: 1, text: "It began quietly.", trigger: "genesis", createdAt: "" },
      ]);
      (evolveLore as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 1, subjectType: "memory", subjectId: "1", version: 1, text: "It began quietly.", trigger: "genesis", createdAt: "" },
        { id: 2, subjectType: "memory", subjectId: "1", version: 2, text: "Something new happened.", trigger: "manual", createdAt: "" },
      ]);
      render(<CreatureSummaryOverlay creature={makeCreature()} onGreet={vi.fn()} onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByText("It began quietly.")).toBeTruthy());
      fireEvent.click(screen.getByText("✦ Evolve"));
      await waitFor(() => expect(evolveLore).toHaveBeenCalledWith("memory", "1"));
      await waitFor(() => expect(screen.getByText("Something new happened.")).toBeTruthy());
    });
  });
});
