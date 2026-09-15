import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TheaterOverlay } from "./TheaterOverlay.js";
import type { CreatureEntity } from "../types.js";

const getLoreMock = vi.fn();
const evolveLoreMock = vi.fn();
vi.mock("../../api/client.js", () => ({
  getLore: (...args: unknown[]) => getLoreMock(...args),
  evolveLore: (...args: unknown[]) => evolveLoreMock(...args),
}));

function makeCreature(nodeId: number, name: string): CreatureEntity {
  return {
    nodeId,
    name,
    type: "concept",
    celestial: "planet",
    rarity: { tier: "rare", label: "Rare", badge: "◆" },
    entropy: 0.1,
    degree: 1,
    isDue: false,
    dueForRecall: false,
    spriteKey: "creature_default",
    uncharted: true,
  };
}

describe("TheaterOverlay (backlog #81)", () => {
  beforeEach(() => {
    localStorage.clear();
    getLoreMock.mockReset().mockResolvedValue([]);
    evolveLoreMock.mockReset();
  });

  it("shows a real empty state when the player has no memories at all", () => {
    render(<TheaterOverlay spaceId="space-1" creatures={[]} onClose={vi.fn()} />);
    expect(screen.getByText(/No showings yet/)).toBeTruthy();
  });

  it("lists real creature names as tonight's showings, never invented ones", () => {
    render(<TheaterOverlay spaceId="space-1" creatures={[makeCreature(1, "Rent"), makeCreature(2, "Birthday")]} onClose={vi.fn()} />);
    expect(screen.getByText(/Rent/)).toBeTruthy();
    expect(screen.getByText(/Birthday/)).toBeTruthy();
  });

  it("shows the real latest lore chapter once it loads", async () => {
    getLoreMock.mockResolvedValue([{ version: 2, text: "A real evolving story.", createdAt: "2026-01-01" }]);
    render(<TheaterOverlay spaceId="space-1" creatures={[makeCreature(1, "Rent")]} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("A real evolving story.")).toBeTruthy());
    expect(screen.getByText(/Chapter 2/)).toBeTruthy();
  });

  it("evolving a showing calls evolveLore and records real building work", async () => {
    evolveLoreMock.mockResolvedValue([{ version: 1, text: "First chapter.", createdAt: "2026-01-01" }]);
    render(<TheaterOverlay spaceId="space-1" creatures={[makeCreature(1, "Rent")]} onClose={vi.fn()} />);
    await waitFor(() => expect(getLoreMock).toHaveBeenCalled());
    fireEvent.click(screen.getByText("✦ Evolve"));
    await waitFor(() => expect(evolveLoreMock).toHaveBeenCalledWith("memory", "1"));
    await waitFor(() => expect(screen.getByText("First chapter.")).toBeTruthy());
  });

  it("calls onClose when leaving", () => {
    const onClose = vi.fn();
    render(<TheaterOverlay spaceId="space-1" creatures={[]} onClose={onClose} />);
    fireEvent.click(screen.getByText("Leave"));
    expect(onClose).toHaveBeenCalled();
  });
});
