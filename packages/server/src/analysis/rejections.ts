import type { AppContext } from "../context.js";

/**
 * Rejected connections. When the user tells Soumaya two bodies DON'T relate, we
 * record the pair (canonical order a<b) and never re-link or re-ask about it — so
 * her intelligence LEARNS from a correction instead of stubbornly re-suggesting it.
 */

function pair(a: number, b: number): [number, number] {
  return a <= b ? [a, b] : [b, a];
}

/** Mark two nodes as unrelated (idempotent). */
export function recordRejection(ctx: AppContext, spaceId: string, a: number, b: number): void {
  const [x, y] = pair(a, b);
  ctx.handle.sqlite
    .prepare(`INSERT OR IGNORE INTO link_rejections (space_id, a, b) VALUES (?, ?, ?)`)
    .run(spaceId, x, y);
}

/** True if the user has said these two don't relate. */
export function isRejected(ctx: AppContext, spaceId: string, a: number, b: number): boolean {
  const [x, y] = pair(a, b);
  return (
    ctx.handle.sqlite
      .prepare(`SELECT 1 FROM link_rejections WHERE space_id = ? AND a = ? AND b = ?`)
      .get(spaceId, x, y) != null
  );
}
