import type { Direction, GridPosition } from "./movement.js";

export interface Footprint {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Task #128 — where a multi-tile building actually lands when you press interact.
 *
 * The footprint grows AWAY from the player, into the space they are facing. This replaces
 * "top-left corner is always the faced tile, extend right/down regardless of facing," which was
 * reproduced as a real, blocking bug: approaching a zoned plot from below or from the right made
 * the building try to grow backwards through the player and off the zone, so it silently refused.
 * Measured on the real map with a real 2x2 residential plot, two of the four natural approaches
 * failed with no feedback — which reads, correctly, as "there is no way to place this."
 *
 * Facing down/right is unchanged (the faced tile is already the near corner). Facing up anchors
 * the footprint's BOTTOM edge at the faced tile; facing left anchors its RIGHT edge. A free and
 * important consequence: the footprint can never contain the player's own tile, so building on
 * top of yourself (task #126) becomes structurally impossible rather than merely refused.
 */
export function footprintForFacing(
  position: GridPosition,
  facing: Direction,
  width: number,
  height: number,
): Footprint {
  const front = tileInFront(position, facing);
  switch (facing) {
    case "down":
      return { x0: front.x, y0: front.y, x1: front.x + width - 1, y1: front.y + height - 1 };
    case "right":
      return { x0: front.x, y0: front.y, x1: front.x + width - 1, y1: front.y + height - 1 };
    case "up":
      return { x0: front.x, y0: front.y - height + 1, x1: front.x + width - 1, y1: front.y };
    case "left":
      return { x0: front.x - width + 1, y0: front.y, x1: front.x, y1: front.y + height - 1 };
  }
}

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
