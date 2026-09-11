import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TouchControls } from "./TouchControls.js";

describe("TouchControls", () => {
  it("emits a move event for each D-pad direction", () => {
    const onEvent = vi.fn();
    render(<TouchControls onEvent={onEvent} />);
    fireEvent.pointerDown(screen.getByLabelText("up"));
    expect(onEvent).toHaveBeenCalledWith({ type: "move", direction: "up" });
  });

  it("emits an interact event for A", () => {
    const onEvent = vi.fn();
    render(<TouchControls onEvent={onEvent} />);
    fireEvent.pointerDown(screen.getByLabelText("A / Interact"));
    expect(onEvent).toHaveBeenCalledWith({ type: "interact" });
  });

  it("B is present but inert (no combat/menu system exists yet)", () => {
    render(<TouchControls onEvent={vi.fn()} />);
    expect((screen.getByLabelText("B") as HTMLButtonElement).disabled).toBe(true);
  });
});
