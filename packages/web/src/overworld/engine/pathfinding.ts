/**
 * NPC Autonomy round (docs/overworld/npc-autonomy.md) — real grid pathfinding so NPCs can
 * actually walk across town instead of only pacing at a fixed post. Pure/no-Phaser (matches
 * movement.ts's own convention). Plain BFS, not A*: the region is small (46x24 = 1,104 tiles)
 * and uniform-cost, so BFS already gives the real shortest path with far less to get wrong
 * than a heuristic search would buy here.
 */

import type { GridPosition, MovementGrid } from "./movement.js";

const NEIGHBOR_DELTAS: readonly GridPosition[] = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
];

export interface PathOptions {
  /** Hard cap on tiles visited, so a pathological/unreachable goal can never hang a frame —
   *  the same lesson `achievements.ts`'s own bounded `pathfinder_quest` DFS already taught
   *  this codebase. Generous default headroom over the whole region's tile count. */
  maxVisited?: number;
}

function key(p: GridPosition): string {
  return `${p.x},${p.y}`;
}

function inBounds(p: GridPosition, grid: MovementGrid): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < grid.width && p.y < grid.height;
}

/**
 * Shortest walkable path from `start` to `goal`, inclusive of both ends. `grid.isPassable` is
 * checked for every tile, the goal included — so a caller pathing NPCs across town should pass
 * a grid whose passability rule already treats real destinations as walkable (e.g.
 * regionLayout.ts's `isNpcPathPassable`, which is exactly the player's own `isMovementPassable`
 * minus the one check that would otherwise call every attendant's own post "blocked"). Returns
 * null if genuinely unreachable, the goal itself isn't passable, or the search budget runs out
 * first — never throws, never hangs.
 */
export function findPath(
  start: GridPosition,
  goal: GridPosition,
  grid: MovementGrid,
  options: PathOptions = {},
): GridPosition[] | null {
  const maxVisited = options.maxVisited ?? 4000;
  if (!inBounds(start, grid) || !inBounds(goal, grid)) return null;
  if (start.x === goal.x && start.y === goal.y) return [start];
  if (!grid.isPassable(goal.x, goal.y)) return null;

  const startKey = key(start);
  const goalKey = key(goal);
  const visited = new Set<string>([startKey]);
  const cameFrom = new Map<string, GridPosition>();
  const queue: GridPosition[] = [start];
  let queueIndex = 0;

  while (queueIndex < queue.length) {
    if (visited.size > maxVisited) return null;
    const current = queue[queueIndex++]!;
    for (const delta of NEIGHBOR_DELTAS) {
      const next = { x: current.x + delta.x, y: current.y + delta.y };
      const nextKey = key(next);
      if (visited.has(nextKey)) continue;
      if (!inBounds(next, grid)) continue;
      if (!grid.isPassable(next.x, next.y)) continue;
      visited.add(nextKey);
      cameFrom.set(nextKey, current);
      if (nextKey === goalKey) {
        const path: GridPosition[] = [next];
        let walkKey = nextKey;
        while (walkKey !== startKey) {
          const prev = cameFrom.get(walkKey);
          if (!prev) break; // unreachable defensively — cameFrom always has every non-start key
          path.unshift(prev);
          walkKey = key(prev);
        }
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}
