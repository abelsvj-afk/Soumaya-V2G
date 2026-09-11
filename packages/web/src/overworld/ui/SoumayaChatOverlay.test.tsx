import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SoumayaChatOverlay } from "./SoumayaChatOverlay.js";
import type { CreatureEntity } from "../types.js";

vi.mock("../../api/client.js", () => ({
  askChat: vi.fn(),
}));

function makeCreature(nodeId: number): CreatureEntity {
  return {
    nodeId,
    name: "Rent",
    type: "concept",
    celestial: "asteroid",
    rarity: { tier: "common", label: "Common", badge: "○" },
    entropy: 0,
    degree: 0,
    isDue: false,
    spriteKey: "creature_default",
    uncharted: true,
    tile: { x: 3, y: 3 },
  };
}

describe("SoumayaChatOverlay", () => {
  beforeEach(() => vi.clearAllMocks());

  it("asks a real question and shows the real cited answer", async () => {
    const { askChat } = await import("../../api/client.js");
    (askChat as ReturnType<typeof vi.fn>).mockResolvedValue({
      answer: "Your rent is due Friday.",
      citations: [{ id: 1, label: "Rent", type: "concept" }],
      contextIds: [1],
    });
    render(<SoumayaChatOverlay onClose={vi.fn()} creatures={[]} onFlyToNode={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Ask Soumaya"), { target: { value: "when is rent due" } });
    fireEvent.click(screen.getByText("Ask"));
    await waitFor(() => expect(screen.getByText("Your rent is due Friday.")).toBeTruthy());
    expect(askChat).toHaveBeenCalledWith("when is rent due", []);
  });

  it("offers 'Go there' only for a citation that's actually placed as a creature in this region", async () => {
    const { askChat } = await import("../../api/client.js");
    (askChat as ReturnType<typeof vi.fn>).mockResolvedValue({
      answer: "See Rent.",
      citations: [{ id: 1, label: "Rent", type: "concept" }, { id: 2, label: "Unplaced memory", type: "concept" }],
      contextIds: [1, 2],
    });
    render(<SoumayaChatOverlay onClose={vi.fn()} creatures={[makeCreature(1)]} onFlyToNode={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Ask Soumaya"), { target: { value: "x" } });
    fireEvent.click(screen.getByText("Ask"));
    await waitFor(() => expect(screen.getAllByText(/📍 Go there/)).toHaveLength(1));
  });

  it("clicking Go there pans the camera and closes the dialogue", async () => {
    const { askChat } = await import("../../api/client.js");
    (askChat as ReturnType<typeof vi.fn>).mockResolvedValue({
      answer: "See Rent.",
      citations: [{ id: 1, label: "Rent", type: "concept" }],
      contextIds: [1],
    });
    const onFlyToNode = vi.fn();
    const onClose = vi.fn();
    render(<SoumayaChatOverlay onClose={onClose} creatures={[makeCreature(1)]} onFlyToNode={onFlyToNode} />);
    fireEvent.change(screen.getByLabelText("Ask Soumaya"), { target: { value: "x" } });
    fireEvent.click(screen.getByText("Ask"));
    await waitFor(() => screen.getByText(/📍 Go there/));
    fireEvent.click(screen.getByText(/📍 Go there/));
    expect(onFlyToNode).toHaveBeenCalledWith(1);
    expect(onClose).toHaveBeenCalled();
  });

  it("never dead-ends on a chat failure — shows a message instead of crashing", async () => {
    const { askChat } = await import("../../api/client.js");
    (askChat as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("offline"));
    render(<SoumayaChatOverlay onClose={vi.fn()} creatures={[]} onFlyToNode={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Ask Soumaya"), { target: { value: "x" } });
    fireEvent.click(screen.getByText("Ask"));
    await waitFor(() => expect(screen.getByText("offline")).toBeTruthy());
  });
});
