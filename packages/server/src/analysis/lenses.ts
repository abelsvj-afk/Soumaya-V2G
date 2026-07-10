import type { AppContext } from "../context.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import { keywordSearch } from "../db/fts.js";
import { dueForReview } from "./review.js";
import type { LensQuery } from "@brain/shared";

/**
 * Lens evaluator (Smart Lenses). Turns a saved `LensQuery` into the set of node ids the
 * galaxy should isolate to — a single deterministic, space-scoped SQL SELECT over
 * `nodes` (with small joins for `linkedTo`, `text`, and lifecycle lenses). No LLM. Every
 * predicate is optional and AND-ed; an empty query returns all non-archived bodies.
 */

const EMOTION_THRESHOLD = 0.12; // matches theme.ts emotionKind

/** Emotional charge in that node's mood matches the requested band. */
function emotionClause(band: "positive" | "heavy" | "neutral"): string {
  if (band === "positive") return `AND n.emotional_weight > ${EMOTION_THRESHOLD}`;
  if (band === "heavy") return `AND n.emotional_weight < ${-EMOTION_THRESHOLD}`;
  return `AND n.emotional_weight IS NOT NULL AND n.emotional_weight BETWEEN ${-EMOTION_THRESHOLD} AND ${EMOTION_THRESHOLD}`;
}

export function evalLens(
  ctx: AppContext,
  spaceId: string = DEFAULT_SPACE,
  query: LensQuery = {},
  now: number = Date.now(),
): number[] {
  const s = ctx.handle.sqlite;
  const where: string[] = [`n.space_id = ?`, `n.deleted_at IS NULL`];
  const params: unknown[] = [spaceId];

  // Lifecycle lens (mutually-exclusive states).
  const state = query.state ?? "active";
  if (state === "archived") {
    where.push(`n.status = 'archived'`);
  } else {
    where.push(`n.status != 'archived'`); // active / due / orphan all exclude archived
    if (state === "orphan") {
      where.push(
        `NOT EXISTS (SELECT 1 FROM edges e WHERE e.space_id = n.space_id AND (e.source = n.id OR e.target = n.id))`,
      );
    }
    if (state === "due") {
      const dueIds = dueForReview(ctx, spaceId, now, 500).map((r) => r.id);
      if (dueIds.length === 0) return [];
      where.push(`n.id IN (${dueIds.map(() => "?").join(",")})`);
      params.push(...dueIds);
    }
  }

  // Kind / type filter — matches either the celestial `type` or the cognitive `kind`.
  if (query.kinds && query.kinds.length > 0) {
    const ph = query.kinds.map(() => "?").join(",");
    where.push(`(n.type IN (${ph}) OR n.kind IN (${ph}))`);
    params.push(...query.kinds, ...query.kinds);
  }

  // Tags — any-of (tags is a JSON array string; a LIKE on the quoted token is enough).
  if (query.tags && query.tags.length > 0) {
    const ors = query.tags.map(() => `n.tags LIKE ?`);
    where.push(`(${ors.join(" OR ")})`);
    for (const t of query.tags) params.push(`%"${t}"%`);
  }

  if (query.emotion) where.push(emotionClause(query.emotion).replace(/^AND /, ""));

  if (typeof query.minImportance === "number") {
    where.push(`COALESCE(n.importance, 0) >= ?`);
    params.push(query.minImportance);
  }

  if (typeof query.withinDays === "number") {
    where.push(`julianday('now') - julianday(COALESCE(n.occurred_at, n.created_at)) <= ?`);
    params.push(query.withinDays);
  }

  if (typeof query.linkedTo === "number") {
    where.push(
      `EXISTS (SELECT 1 FROM edges e WHERE e.space_id = n.space_id
        AND ((e.source = ? AND e.target = n.id) OR (e.target = ? AND e.source = n.id)))`,
    );
    params.push(query.linkedTo, query.linkedTo);
  }

  // Full-text keyword — resolve to ids via FTS, then constrain (empty match → empty lens).
  if (query.text && query.text.trim()) {
    const ids = keywordSearch(s, spaceId, query.text.trim(), 500).map((r) => r.nodeId);
    if (ids.length === 0) return [];
    where.push(`n.id IN (${ids.map(() => "?").join(",")})`);
    params.push(...ids);
  }

  const rows = s
    .prepare(`SELECT n.id FROM nodes n WHERE ${where.join(" AND ")} ORDER BY COALESCE(n.importance, 0) DESC, n.id DESC`)
    .all(...params) as { id: number }[];
  return rows.map((r) => r.id);
}
