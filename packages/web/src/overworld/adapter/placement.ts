import type { CreatureEntity } from "../types.js";

/**
 * Deterministic spawn-point placement. Same set of node ids always lands on the same
 * tiles, regardless of call order or session — required so a creature doesn't "teleport"
 * to a new tile every graph refresh (see docs/overworld/architecture.md test plan #2).
 * No Math.random / Date — a pure integer hash of the node id seeds each placement.
 */

function hash32(n: number): number {
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = x ^ (x >>> 16);
  return x >>> 0;
}

export interface PlacementGrid {
  width: number;
  height: number;
  /** true = this tile can never host a creature (building, door, wall, water, ...). */
  isBlocked: (x: number, y: number) => boolean;
}

/** Deterministically assigns each id a free, unblocked tile. Ids that don't fit (grid full) are omitted. */
export function placeIdsOnGrid(
  ids: readonly number[],
  grid: PlacementGrid,
): Map<number, { x: number; y: number }> {
  const placed = new Map<number, { x: number; y: number }>();
  const occupied = new Set<string>();
  // Sort first so placement is independent of the caller's array order, not just of re-runs.
  const sorted = [...ids].sort((a, b) => a - b);
  const capacity = grid.width * grid.height;

  for (const id of sorted) {
    if (capacity <= 0) break;
    const h = hash32(id);
    const startX = h % grid.width;
    const startY = Math.floor(h / grid.width) % grid.height;
    let x = startX;
    let y = startY;
    let foundKey: string | null = null;

    for (let i = 0; i < capacity; i++) {
      const key = `${x},${y}`;
      if (!occupied.has(key) && !grid.isBlocked(x, y)) {
        foundKey = key;
        break;
      }
      x = (x + 1) % grid.width;
      if (x === 0) y = (y + 1) % grid.height;
    }

    if (foundKey) {
      occupied.add(foundKey);
      const [px, py] = foundKey.split(",").map(Number);
      placed.set(id, { x: px as number, y: py as number });
    }
    // else: grid is at capacity for unblocked tiles — id stays unplaced this pass.
  }

  return placed;
}

/** Combines adapter output (no tile yet) with a placement grid to produce fully placed creatures. */
export function placeCreaturesOnGrid(
  creatures: readonly CreatureEntity[],
  grid: PlacementGrid,
): CreatureEntity[] {
  const tiles = placeIdsOnGrid(
    creatures.map((c) => c.nodeId),
    grid,
  );
  return creatures
    .filter((c) => tiles.has(c.nodeId))
    .map((c) => ({ ...c, tile: tiles.get(c.nodeId) }));
}
