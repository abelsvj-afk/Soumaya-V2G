import type { Direction } from "./movement.js";

/**
 * A small typed event bus so keyboard input and the on-screen TouchControls dispatch the
 * exact same events into whichever scene is listening — scenes never know which input
 * source fired (architecture.md "Touch controls" section).
 */
export type InputEvent = { type: "move"; direction: Direction } | { type: "interact" };

type Listener = (event: InputEvent) => void;

export class InputBus {
  private listeners = new Set<Listener>();

  /**
   * The direction a touch D-pad button is currently being held down, or null. Keyboard
   * movement was always continuous — `ExteriorScene.update()` polls `key.isDown` every frame
   * and re-emits "move" for as long as it's held. TouchControls previously only fired one
   * "move" per tap, so a real touch-screen player had to mash the button to cross the map.
   * `update()` now polls this the same way it polls keyboard state, so holding a D-pad
   * button moves continuously too — see TouchControls.tsx's pointerdown/up/leave/cancel.
   */
  heldDirection: Direction | null = null;

  emit(event: InputEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setHeldDirection(direction: Direction | null): void {
    this.heldDirection = direction;
  }
}
