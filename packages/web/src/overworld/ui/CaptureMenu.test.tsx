import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CaptureMenu } from "./CaptureMenu.js";
import type { CreatureEntity } from "../types.js";

function makeCreature(): CreatureEntity {
  return {
    nodeId: 1,
    name: "A new thought",
    type: "concept",
    celestial: "asteroid",
    rarity: { tier: "common", label: "Common", badge: "○" },
    entropy: 0,
    degree: 0,
    isDue: false,
    dueForRecall: false,
    spriteKey: "creature_default",
    uncharted: true,
  };
}

describe("CaptureMenu (FR8/FR9)", () => {
  it("goes entry -> submitting -> reveal on a successful capture", async () => {
    const creature = makeCreature();
    const onSubmit = vi.fn().mockResolvedValue(creature);
    render(<CaptureMenu onSubmit={onSubmit} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Thought"), { target: { value: "a new idea" } });
    fireEvent.click(screen.getByText("Capture"));

    expect(await screen.findByText(/identifying species/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/A new thought/)).toBeTruthy());
    expect(onSubmit).toHaveBeenCalledWith("a new idea");
  });

  it("never dead-ends on failure — offers retry", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("offline"));
    render(<CaptureMenu onSubmit={onSubmit} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Thought"), { target: { value: "x" } });
    fireEvent.click(screen.getByText("Capture"));

    await waitFor(() => expect(screen.getByText("offline")).toBeTruthy());
    fireEvent.click(screen.getByText("Try again"));
    expect(screen.getByLabelText("Thought")).toBeTruthy();
  });

  it("disables Capture until there's real text", () => {
    render(<CaptureMenu onSubmit={vi.fn()} onClose={vi.fn()} />);
    expect((screen.getByText("Capture") as HTMLButtonElement).disabled).toBe(true);
  });
});
