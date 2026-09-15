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

  it("2026-09-15 audit fix — out-ranks the persistent TownHud/button-row's zIndex:1", () => {
    render(<CaptureMenu onSubmit={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("dialog").style.zIndex).toBe("10");
  });

  it("2026-09-15 audit fix — a stalled submit is never a dead end: Cancel returns to entry without losing the typed text", async () => {
    let resolveSubmit: ((v: CreatureEntity | null) => void) | undefined;
    const onSubmit = vi.fn(() => new Promise<CreatureEntity | null>((resolve) => (resolveSubmit = resolve)));
    render(<CaptureMenu onSubmit={onSubmit} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Thought"), { target: { value: "a stuck idea" } });
    fireEvent.click(screen.getByText("Capture"));
    expect(await screen.findByText(/identifying species/)).toBeTruthy();

    fireEvent.click(screen.getByText("Cancel"));
    expect((screen.getByLabelText("Thought") as HTMLTextAreaElement).value).toBe("a stuck idea"); // text preserved
    expect(screen.queryByText(/identifying species/)).toBeNull();

    // The original request resolving late must not resurrect a screen the player already left.
    resolveSubmit?.(makeCreature());
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText(/A new thought/)).toBeNull();
  });
});
