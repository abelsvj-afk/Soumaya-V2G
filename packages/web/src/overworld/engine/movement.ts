/**
 * Pure grid-movement + collision logic (no Phaser import) — matches the repo convention of
 * keeping simulation math testable without a browser/WebGL context (see graph/orbits.ts).
 * FR1/FR2: grid-snapped movement, one tile per input, blocked by a passability layer, no
 * analog drift — `isMoving` locks out new input until the current tween completes.
 */

export type Direction = "up" | "down" | "left" | "right";

export interface GridPosition {
  x: number;
  y: number;
}

export interface MovementGrid {
  width: number;
  height: number;
  /** true = the player may stand on this tile. */
  isPassable: (x: number, y: number) => boolean;
}

const DELTA: Record<Direction, GridPosition> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export interface MovementState {
  position: GridPosition;
  /** True while tweening to the next tile; new move input is ignored until `completeMove`. */
  isMoving: boolean;
  facing: Direction;
}

export function createMovementState(start: GridPosition, facing: Direction = "down"): MovementState {
  return { position: { ...start }, isMoving: false, facing };
}

export interface MoveResult {
  moved: boolean;
  state: MovementState;
}

function inBounds(pos: GridPosition, grid: MovementGrid): boolean {
  return pos.x >= 0 && pos.y >= 0 && pos.x < grid.width && pos.y < grid.height;
}

/**
 * Attempts to move one tile. Pure/immutable: returns a new state, never mutates `state`.
 * A blocked or mid-tween attempt still updates `facing` (so turning in place works) but
 * `moved` is false and `position` is unchanged.
 */
export function tryMove(state: MovementState, direction: Direction, grid: MovementGrid): MoveResult {
  if (state.isMoving) {
    return { moved: false, state: { ...state, facing: direction } };
  }
  const delta = DELTA[direction];
  const next = { x: state.position.x + delta.x, y: state.position.y + delta.y };
  if (!inBounds(next, grid) || !grid.isPassable(next.x, next.y)) {
    return { moved: false, state: { ...state, facing: direction } };
  }
  return {
    moved: true,
    state: { position: next, isMoving: true, facing: direction },
  };
}

/** Call when the tile-tween animation finishes, to unlock the next move. */
export function completeMove(state: MovementState): MovementState {
  return { ...state, isMoving: false };
}
