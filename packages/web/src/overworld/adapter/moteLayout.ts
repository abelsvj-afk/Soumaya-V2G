/**
 * MindSpace (docs/overworld/mindspace.md, task #70) — pure, Phaser-free placement math for the
 * ambient floating-thought motes. A thought has no real location (unlike a memory-turned-node,
 * which gets a stable seeded-grid tile), so motes orbit the PLAYER instead — a small ring that
 * follows you, reading as "your live working memory," never a fake fixed position for data that
 * was never spatial.
 */

/** Deterministic pure hash (no Math.random/Date) — same convention as tileAtlas.ts's own
 *  hash32/idleBobDelayMs, so the same thought id always gets the same radius/phase. */
function hash32(id: number): number {
  let h = (id | 0) * 374761393;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return h >>> 0;
}

export const MOTE_MIN_RADIUS = 18;
export const MOTE_MAX_RADIUS = 30;
/** Full orbit period in ms for the slowest mote — deliberately gentle, ambient motion. */
const ORBIT_PERIOD_MS = 9000;

/**
 * The offset (in px) from the player's own position for one thought's mote at a given moment.
 * `timeMs` should be frozen (always 0) by callers under `prefersReducedMotion()` so the offset
 * never advances — the mote still renders (the ambient information isn't lost), it just holds
 * still, matching every other decorative loop in this scene.
 */
export function moteOffset(thoughtId: number, timeMs: number): { dx: number; dy: number } {
  const h = hash32(thoughtId);
  const radius = MOTE_MIN_RADIUS + (h % (MOTE_MAX_RADIUS - MOTE_MIN_RADIUS + 1));
  const phase = ((h >>> 8) % 360) * (Math.PI / 180);
  // Slightly different speeds per mote (derived from the same hash) so a cluster doesn't all
  // orbit in lockstep — reads as a loose cloud, not one rotating ring.
  const speedScale = 0.7 + ((h >>> 16) % 100) / 200; // 0.7x .. 1.2x
  const angle = phase + (timeMs / ORBIT_PERIOD_MS) * speedScale * Math.PI * 2;
  return {
    dx: Math.cos(angle) * radius,
    // Flattened vertically (0.6x) so the ring reads as floating around the player's head/
    // shoulders rather than a full circle overlapping their feet.
    dy: Math.sin(angle) * radius * 0.6 - 14,
  };
}

/** The top N thoughts by strength, most vivid first — caps ambient clutter (mindspace.md
 *  decision #3) rather than rendering every thought that's ever been logged. */
export function strongestThoughts<T extends { strength: number }>(thoughts: T[], limit = 6): T[] {
  return [...thoughts].sort((a, b) => b.strength - a.strength).slice(0, limit);
}
