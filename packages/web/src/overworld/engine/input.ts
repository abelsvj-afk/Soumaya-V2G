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

  emit(event: InputEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
