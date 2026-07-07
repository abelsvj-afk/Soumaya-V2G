import { COGNITIVE_META } from "@brain/shared";
import type { AppContext } from "../context.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { knn, getEmbedding } from "../db/vec.js";

/**
 * Ideas lifecycle (Cognitive Layer Phase 3, docs/COGNITIVE_LAYER.md). An `idea` is
 * a potential future — the one cognitive kind that is NOT durable. It has a real
 * arc:
 *
 *   • GROW    — as memories come to support it, its importance (→ mass → size +
 *               brightness) rises. A well-supported idea reads as a hot young star.
 *   • FADE    — if nothing reinforces it, it dims; a fully-ignored, unsupported idea
 *               eventually fades out of the galaxy entirely (it was never permanent).
 *   • MERGE   — two near-identical ideas collapse into the stronger one, its support
 *               redirected, so duplicates don't clutter your mind.
 *   • PROMOTE — a matured idea (enough support) can graduate into a GOAL: a durable,
 *               gravity-exerting anchor with progress. That's you committing to it.
 *
 * All deterministic + offline (no LLM). Runs each autonomy tick via `stepIdeas`;
 * promotion is user-triggered (`promoteIdeaToGoal`). Fading leans on the existing
 * celestial system — ideas aren't entropy-exempt, so lowering importance is all it
 * takes for them to visibly cool and shrink.
 */

const IDEA = COGNITIVE_META.idea;
const GOAL = COGNITIVE_META.goal;
/** Importance gained per supporting edge. */
const GROW_STEP = 0.06;
/** Ceiling so an idea never outshines a real goal without being promoted. */
const GROW_CAP = 0.78;
/** Floor an idea dims toward when ignored. */
const FADE_FLOOR = 0.12;
/** No tending for this long → it starts to dim. */
const FADE_STALE_DAYS = 14;
/** Dim applied per stale run. */
const FADE_STEP = 0.05;
/** Unsupported + untended this long → it fades out of the galaxy entirely. */
const FADE_ARCHIVE_DAYS = 30;
/** Cosine at/above which two ideas are "the same idea" and merge. */
const MERGE_SIM = 0.82;
/** Support count at which an idea is ripe to become a goal. */
export const PROMOTE_SUPPORT = 4;

/** How many memories support an idea (incoming `supports` edges). */
function supportCount(ctx: AppContext, spaceId: string, id: number): number {
  return (ctx.handle.sqlite
    .prepare(
      `SELECT COUNT(*) AS c FROM edges WHERE space_id = ? AND target = ? AND relationship = 'supports'`,
    )
    .get(spaceId, id) as { c: number }).c;
}

/** Days since an idea was last tended (falls back to creation). */
function daysSinceTended(ctx: AppContext, spaceId: string, id: number): number {
  const r = ctx.handle.sqlite
    .prepare(
      `SELECT julianday('now') - julianday(COALESCE(last_tended_at, created_at)) AS d
       FROM nodes WHERE id = ? AND space_id = ?`,
    )
    .get(id, spaceId) as { d: number } | undefined;
  return r ? r.d : 0;
}

export interface IdeasStep {
  grown: number;
  faded: number;
  merged: number;
}

/**
 * Advance every idea one lifecycle step: merge duplicates, grow the supported,
 * dim the stale, and archive the fully-faded. Free + offline. Returns the counts.
 */
export function stepIdeas(ctx: AppContext, spaceId: string): IdeasStep {
  const s = ctx.handle.sqlite;
  const repo = new NodesRepo(ctx.handle, spaceId);
  const step: IdeasStep = { grown: 0, faded: 0, merged: 0 };

  const ideas = () =>
    s
      .prepare(
        `SELECT id, importance FROM nodes
         WHERE space_id = ? AND deleted_at IS NULL AND kind = 'idea' ORDER BY id ASC`,
      )
      .all(spaceId) as { id: number; importance: number | null }[];

  // ── MERGE near-identical ideas first (fewer ideas to grow/fade after). ──────
  const gone = new Set<number>();
  for (const idea of ideas()) {
    if (gone.has(idea.id)) continue;
    const emb = getEmbedding(s, idea.id);
    if (!emb) continue;
    const twins = knn(s, emb, 6, spaceId).filter((h) => h.nodeId !== idea.id && h.similarity >= MERGE_SIM);
    for (const t of twins) {
      if (gone.has(t.nodeId)) continue;
      const other = s
        .prepare(`SELECT id, kind FROM nodes WHERE id = ? AND space_id = ? AND deleted_at IS NULL`)
        .get(t.nodeId, spaceId) as { id: number; kind: string | null } | undefined;
      if (!other || other.kind !== "idea") continue;
      // Keep the better-supported idea; fold the other into it.
      const keepId = supportCount(ctx, spaceId, idea.id) >= supportCount(ctx, spaceId, other.id) ? idea.id : other.id;
      const dropId = keepId === idea.id ? other.id : idea.id;
      // Redirect the dropped idea's supporting memories onto the survivor.
      const backers = s
        .prepare(`SELECT source FROM edges WHERE space_id = ? AND target = ? AND relationship = 'supports'`)
        .all(spaceId, dropId) as { source: number }[];
      for (const b of backers) {
        const dup = s
          .prepare(`SELECT 1 FROM edges WHERE space_id = ? AND source = ? AND target = ? AND relationship = 'supports'`)
          .get(spaceId, b.source, keepId);
        if (!dup) {
          s.prepare(
            `INSERT INTO edges (space_id, source, target, relationship, weight) VALUES (?, ?, ?, 'supports', 0.7)`,
          ).run(spaceId, b.source, keepId);
        }
      }
      repo.delete(dropId); // removes the dropped idea + its now-redundant edges
      gone.add(dropId);
      step.merged++;
      try {
        s.prepare(
          `INSERT INTO agent_logs (space_id, action, description, targets) VALUES (?, 'idea_merged', ?, ?)`,
        ).run(spaceId, "Two near-identical ideas merged into one.", JSON.stringify([keepId, dropId]));
      } catch {
        /* best-effort */
      }
      if (dropId === idea.id) break; // this idea is gone; stop pairing it
    }
  }

  // ── GROW / FADE / ARCHIVE the survivors. ────────────────────────────────────
  for (const idea of ideas()) {
    if (gone.has(idea.id)) continue;
    const supports = supportCount(ctx, spaceId, idea.id);
    const stale = daysSinceTended(ctx, spaceId, idea.id);

    // Fully ignored + unsupported for a long time → it fades out entirely.
    if (supports === 0 && stale > FADE_ARCHIVE_DAYS) {
      repo.delete(idea.id);
      step.faded++;
      try {
        s.prepare(
          `INSERT INTO agent_logs (space_id, action, description, targets) VALUES (?, 'idea_faded', ?, ?)`,
        ).run(spaceId, "An unreinforced idea faded away.", JSON.stringify([idea.id]));
      } catch {
        /* best-effort */
      }
      continue;
    }

    // Grow with support; dim if it's gone stale. Clamp to the idea band.
    let next = IDEA.importance + supports * GROW_STEP;
    if (stale > FADE_STALE_DAYS) next -= FADE_STEP;
    next = Math.max(FADE_FLOOR, Math.min(GROW_CAP, next));

    const prev = idea.importance ?? IDEA.importance;
    if (Math.abs(next - prev) > 0.001) {
      s.prepare(`UPDATE nodes SET importance = ? WHERE id = ? AND space_id = ?`).run(next, idea.id, spaceId);
      if (next > prev) step.grown++;
      else step.faded++;
    }
  }

  return step;
}

/** Ids of ideas ripe to become goals (enough support), for a nudge / UI hint. */
export function ripeIdeaIds(ctx: AppContext, spaceId: string): number[] {
  const rows = ctx.handle.sqlite
    .prepare(
      `SELECT n.id AS id,
         (SELECT COUNT(*) FROM edges e WHERE e.space_id = n.space_id AND e.target = n.id AND e.relationship = 'supports') AS sup
       FROM nodes n WHERE n.space_id = ? AND n.deleted_at IS NULL AND n.kind = 'idea'`,
    )
    .all(spaceId) as { id: number; sup: number }[];
  return rows.filter((r) => r.sup >= PROMOTE_SUPPORT).map((r) => r.id);
}

/**
 * Promote an idea into a GOAL — committing to it. The node keeps its identity,
 * label, content, edges and supporting memories, but becomes a durable,
 * gravity-exerting anchor with progress. Returns false if the id isn't an idea.
 */
export function promoteIdeaToGoal(ctx: AppContext, spaceId: string, id: number): boolean {
  const s = ctx.handle.sqlite;
  const row = s
    .prepare(`SELECT kind FROM nodes WHERE id = ? AND space_id = ? AND deleted_at IS NULL`)
    .get(id, spaceId) as { kind: string | null } | undefined;
  if (!row || row.kind !== "idea") return false;
  s.prepare(
    `UPDATE nodes SET kind = 'goal', importance = ?, color = ?, progress = 0 WHERE id = ? AND space_id = ?`,
  ).run(GOAL.importance, GOAL.color, id, spaceId);
  new NodesRepo(ctx.handle, spaceId).tend(id);
  try {
    s.prepare(
      `INSERT INTO agent_logs (space_id, action, description, targets) VALUES (?, 'idea_promoted', ?, ?)`,
    ).run(spaceId, "An idea matured into a goal you committed to.", JSON.stringify([id]));
  } catch {
    /* best-effort */
  }
  return true;
}
