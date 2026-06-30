import type { AppContext } from "../context.js";

/**
 * Scored research decision (research-agent add-on #2). The old rule picked the
 * single highest-`importance` under-connected memory. This scores each candidate by
 * research-WORTHINESS — emotional intensity, being caught in a contradiction, an
 * identity/goal statement, a recurring theme — minus noise (low-signal factual,
 * isolated one-offs). Soumaya then researches the most consequential blind spot, and
 * skips entirely when nothing clears the floor (the "no research zone"). Fully
 * heuristic + offline; bounded to a small candidate pool.
 */

interface CandidateRow {
  id: number;
  importance: number;
  content: string;
  type: string;
  emotionalWeight: number | null;
  tags: string | null;
  deg: number;
}

export interface ResearchPick {
  id: number;
  score: number;
  /** Human-readable signals that drove the score (shown in the job description). */
  factors: string[];
}

const IDENTITY_RE = /\b(i am|i'm a|i'm an|who i am|my identity|i identify|defines? me|i value|i believe|i stand for)\b/i;
const GOAL_RE = /\b(goal|i want to|i plan to|someday|long[- ]term|dream of|aspire|aiming to|five years|my future|i hope to)\b/i;

/** Pool of under-connected, important, not-yet-researched memories to score. */
function candidates(ctx: AppContext, spaceId: string): CandidateRow[] {
  return ctx.handle.sqlite
    .prepare(
      `SELECT n.id, n.importance AS importance, n.content AS content, n.type AS type,
              n.emotional_weight AS emotionalWeight, n.tags AS tags, COALESCE(d.deg, 0) AS deg
       FROM nodes n
       LEFT JOIN (
         SELECT node_id, COUNT(*) as deg FROM (
           SELECT source as node_id FROM edges WHERE space_id = ?
           UNION ALL SELECT target as node_id FROM edges WHERE space_id = ?
         ) GROUP BY node_id
       ) d ON d.node_id = n.id
       WHERE n.space_id = ? AND n.deleted_at IS NULL
       AND n.content NOT LIKE '%--- Research Deep Dive ---%'
       AND n.importance >= 0.45 AND COALESCE(d.deg, 0) <= 1
       ORDER BY n.importance DESC LIMIT 12`,
    )
    .all(spaceId, spaceId, spaceId) as CandidateRow[];
}

/** Node ids currently caught in a contradiction insight (a strong research signal). */
function contradictionNodeIds(ctx: AppContext, spaceId: string): Set<number> {
  const rows = ctx.handle.sqlite
    .prepare(`SELECT node_a, node_b FROM insights WHERE space_id = ? AND kind = 'contradiction'`)
    .all(spaceId) as { node_a: number; node_b: number }[];
  const s = new Set<number>();
  for (const r of rows) {
    s.add(r.node_a);
    s.add(r.node_b);
  }
  return s;
}

/** Count of memories per type, so a "recurring theme" can add weight. */
function typeCounts(ctx: AppContext, spaceId: string): Map<string, number> {
  const rows = ctx.handle.sqlite
    .prepare(`SELECT type, COUNT(*) c FROM nodes WHERE space_id = ? AND deleted_at IS NULL GROUP BY type`)
    .all(spaceId) as { type: string; c: number }[];
  return new Map(rows.map((r) => [r.type, r.c]));
}

/** Score a single candidate's research-worthiness; returns the score + its factors. */
export function scoreCandidate(
  row: CandidateRow,
  contradictions: Set<number>,
  typeCount: Map<string, number>,
): { score: number; factors: string[] } {
  const factors: string[] = [];
  let score = 1; // base: it already cleared the importance gate
  if (row.importance >= 0.65) score += 1;

  const ew = Math.abs(row.emotionalWeight ?? 0);
  if (ew >= 0.7) {
    score += 3;
    factors.push("strong emotion");
  }
  if (contradictions.has(row.id)) {
    score += 3;
    factors.push("in a contradiction");
  }
  if (IDENTITY_RE.test(row.content)) {
    score += 2;
    factors.push("identity-shaping");
  }
  if (GOAL_RE.test(row.content)) {
    score += 1;
    factors.push("long-term goal");
  }
  if ((typeCount.get(row.type) ?? 0) >= 4) {
    score += 2;
    factors.push("recurring theme");
  }
  // Penalties — noise that isn't worth a paid deep-dive.
  const factual = (row.type === "knowledge" || row.type === "other") && ew < 0.2 && row.content.length < 120;
  if (factual) {
    score -= 3;
    factors.push("low-signal factual");
  }
  if (row.deg === 0 && row.importance < 0.5) {
    score -= 2;
    factors.push("isolated one-off");
  }
  return { score, factors };
}

/** Floor a candidate must clear to be worth a paid research deep-dive. */
export const RESEARCH_SCORE_FLOOR = 1;

/**
 * Pick the highest-scoring research target, or null when nothing clears the floor
 * (the "no research zone" — Soumaya does no research rather than burn budget on noise).
 */
export function pickResearchTarget(ctx: AppContext, spaceId: string): ResearchPick | null {
  const pool = candidates(ctx, spaceId);
  if (pool.length === 0) return null;
  const contradictions = contradictionNodeIds(ctx, spaceId);
  const typeCount = typeCounts(ctx, spaceId);

  let best: ResearchPick | null = null;
  for (const row of pool) {
    const { score, factors } = scoreCandidate(row, contradictions, typeCount);
    if (score < RESEARCH_SCORE_FLOOR) continue;
    // Higher score wins; importance (pool is importance-desc) breaks ties via order.
    if (!best || score > best.score) best = { id: row.id, score, factors };
  }
  return best;
}
