import { describe, it, expect, vi } from "vitest";
import { InputBus, type InputEvent } from "./input.js";

describe("InputBus", () => {
  it("delivers an emitted event to every subscriber", () => {
    const bus = new InputBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.subscribe(a);
    bus.subscribe(b);
    const event: InputEvent = { type: "move", direction: "up" };
    bus.emit(event);
    expect(a).toHaveBeenCalledWith(event);
    expect(b).toHaveBeenCalledWith(event);
  });

  it("stops delivering events after unsubscribe", () => {
    const bus = new InputBus();
    const listener = vi.fn();
    const unsubscribe = bus.subscribe(listener);
    unsubscribe();
    bus.emit({ type: "interact" });
    expect(listener).not.toHaveBeenCalled();
  });

  it("keyboard and touch sources are indistinguishable to a subscriber", () => {
    const bus = new InputBus();
    const received: InputEvent[] = [];
    bus.subscribe((e) => received.push(e));
    // Simulates a keyboard handler and a TouchControls tap both firing the same event shape.
    bus.emit({ type: "move", direction: "left" });
    bus.emit({ type: "move", direction: "left" });
    expect(received).toEqual([
      { type: "move", direction: "left" },
      { type: "move", direction: "left" },
    ]);
  });

  describe("held direction (hold-to-move for touch)", () => {
    it("starts with nothing held", () => {
      expect(new InputBus().heldDirection).toBeNull();
    });

    it("tracks whichever direction was last set, and clears back to null", () => {
      const bus = new InputBus();
      bus.setHeldDirection("up");
      expect(bus.heldDirection).toBe("up");
      bus.setHeldDirection("right");
      expect(bus.heldDirection).toBe("right");
      bus.setHeldDirection(null);
      expect(bus.heldDirection).toBeNull();
    });
  });
});
