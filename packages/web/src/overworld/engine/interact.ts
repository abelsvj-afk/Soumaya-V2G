import type { Direction, GridPosition } from "./movement.js";

/** The tile immediately in front of the player, used to resolve a button-press "interact". */
export function tileInFront(position: GridPosition, facing: Direction): GridPosition {
  switch (facing) {
    case "up":
      return { x: position.x, y: position.y - 1 };
    case "down":
      return { x: position.x, y: position.y + 1 };
    case "left":
      return { x: position.x - 1, y: position.y };
    case "right":
      return { x: position.x + 1, y: position.y };
  }
}
