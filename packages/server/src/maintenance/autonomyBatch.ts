/**
 * Bounded, rotating per-tick space batch for the server-side autonomy loop
 * (index.ts). Every AUTONOMY_MS tick previously iterated ALL spaces serially in
 * one pass — fine for a handful of brains, but with no upper bound: a deployment
 * with many spaces (or one unusually slow one) could see a single tick run long
 * enough that later spaces in `SELECT id FROM spaces`'s row order effectively never
 * get serviced (the same early rows always win, every tick, while later ones
 * starve), and the loop's own re-entrancy guard means an overrunning tick doesn't
 * queue or delay — it silently skips the next tick's work entirely.
 *
 * `nextAutonomyBatch` is the pure slicing logic: given the full, stably-ordered
 * list of space ids, a rotating cursor, and a per-tick cap, it returns a bounded
 * batch plus the cursor position for the NEXT tick. With `allSpaceIds.length <=
 * maxPerTick` (the common case today), every tick still returns every space —
 * zero behavior change. Once the tenant count grows past the cap, the cursor
 * wraps around the list over successive ticks, so every space's turn eventually
 * comes around instead of the same subset winning forever.
 *
 * Deliberately in-memory only (the caller keeps `cursor` in a closure, not the
 * database) — a server restart resetting the cursor to 0 is harmless self-healing
 * (every space is still serviced within `ceil(spaceCount / maxPerTick)` ticks
 * either way), and persisting it would mean a schema migration for a purely
 * cosmetic ordering detail that doesn't affect correctness.
 */
export interface AutonomyBatch {
  batch: string[];
  nextCursor: number;
}

export function nextAutonomyBatch(allSpaceIds: readonly string[], cursor: number, maxPerTick: number): AutonomyBatch {
  if (allSpaceIds.length === 0) return { batch: [], nextCursor: 0 };
  // A non-finite/non-positive cap (a misconfigured env var) must never permanently
  // wedge the rotating cursor into NaN forever — fall back to "no cap" (process
  // every space, the pre-fix behavior) rather than silently disabling autonomy.
  const cap = Number.isFinite(maxPerTick) && maxPerTick > 0 ? maxPerTick : allSpaceIds.length;
  const batchSize = Math.min(cap, allSpaceIds.length);
  // Normalize an out-of-range cursor (a shrunk space list since the last tick,
  // a negative value, or NaN from before this guard existed) into a valid index.
  const safeCursor = Number.isFinite(cursor) ? cursor : 0;
  const start = ((safeCursor % allSpaceIds.length) + allSpaceIds.length) % allSpaceIds.length;
  const batch: string[] = [];
  for (let i = 0; i < batchSize; i++) {
    batch.push(allSpaceIds[(start + i) % allSpaceIds.length]!);
  }
  const nextCursor = (start + batchSize) % allSpaceIds.length;
  return { batch, nextCursor };
}
