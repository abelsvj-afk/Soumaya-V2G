import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CreatureSummaryOverlay } from "./CreatureSummaryOverlay.js";
import type { CreatureEntity } from "../types.js";

vi.mock("../../api/journeys.js", () => ({
  journeysFor: vi.fn(),
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
});
