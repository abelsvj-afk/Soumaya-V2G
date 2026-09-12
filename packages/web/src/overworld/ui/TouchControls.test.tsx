import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TouchControls } from "./TouchControls.js";

describe("TouchControls", () => {
  it("emits a move event for each D-pad direction", () => {
    const onEvent = vi.fn();
    render(<TouchControls onEvent={onEvent} onHoldChange={vi.fn()} />);
    fireEvent.pointerDown(screen.getByLabelText("up"));
    expect(onEvent).toHaveBeenCalledWith({ type: "move", direction: "up" });
  });

  it("emits an interact event for A", () => {
    const onEvent = vi.fn();
    render(<TouchControls onEvent={onEvent} onHoldChange={vi.fn()} />);
    fireEvent.pointerDown(screen.getByLabelText("A / Interact"));
    expect(onEvent).toHaveBeenCalledWith({ type: "interact" });
  });

  it("A's pointerdown suppresses the browser's synthetic click (real bug: the overlay it opens has a" +
    " Leave button that lands at this same screen position, and a lingering compatibility click was closing it)", () => {
    render(<TouchControls onEvent={vi.fn()} onHoldChange={vi.fn()} />);
    const event = fireEvent.pointerDown(screen.getByLabelText("A / Interact"));
    expect(event).toBe(false); // fireEvent returns false when preventDefault() was called
  });

  it("B is present but inert (no combat/menu system exists yet)", () => {
    render(<TouchControls onEvent={vi.fn()} onHoldChange={vi.fn()} />);
    expect((screen.getByLabelText("B") as HTMLButtonElement).disabled).toBe(true);
  });

  describe("hold-to-move", () => {
    it("reports the held direction on pointerdown", () => {
      const onHoldChange = vi.fn();
      render(<TouchControls onEvent={vi.fn()} onHoldChange={onHoldChange} />);
      fireEvent.pointerDown(screen.getByLabelText("right"));
      expect(onHoldChange).toHaveBeenCalledWith("right");
    });

    it("clears the held direction on pointerup", () => {
      const onHoldChange = vi.fn();
      render(<TouchControls onEvent={vi.fn()} onHoldChange={onHoldChange} />);
      fireEvent.pointerDown(screen.getByLabelText("down"));
      fireEvent.pointerUp(screen.getByLabelText("down"));
      expect(onHoldChange).toHaveBeenLastCalledWith(null);
    });

    it("clears the held direction if the finger slides off the button", () => {
      const onHoldChange = vi.fn();
      render(<TouchControls onEvent={vi.fn()} onHoldChange={onHoldChange} />);
      fireEvent.pointerDown(screen.getByLabelText("left"));
      fireEvent.pointerLeave(screen.getByLabelText("left"));
      expect(onHoldChange).toHaveBeenLastCalledWith(null);
    });

    it("clears the held direction if the touch is cancelled", () => {
      const onHoldChange = vi.fn();
      render(<TouchControls onEvent={vi.fn()} onHoldChange={onHoldChange} />);
      fireEvent.pointerDown(screen.getByLabelText("up"));
      fireEvent.pointerCancel(screen.getByLabelText("up"));
      expect(onHoldChange).toHaveBeenLastCalledWith(null);
    });
  });
});
