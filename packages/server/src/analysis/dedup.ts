import type { AppContext } from "../context.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { upsertEmbedding, getEmbedding, knn } from "../db/vec.js";
import { ftsUpsert } from "../db/fts.js";

/**
 * Memory de-duplication. Two halves:
 *   • mergeMemories() — a TRUE merge that forgets nothing: combined text, every edge,
 *     photo/attachment, insight, and the memory's earned age/emotional charge all move
 *     to the survivor; the other is soft-deleted (recoverable, points at the survivor).
 *   • sweepDuplicates() — a FREE, always-on finder (no LLM, runs each autonomy tick)
 *     that catches near-duplicate memories the old detector missed (it only ran with
 *     Research Mode on, needed 96% similarity, and scanned 50 recent). This keeps the
 *     galaxy from sprawling with redundant copies of the same thought.
 */

/** Combine two memory bodies losslessly: keep the superset, else merge unique lines. */
export function combineContent(a: string, b: string): string {
  const an = (a ?? "").trim();
  const bn = (b ?? "").trim();
  if (!bn || an.includes(bn)) return an;
  if (!an || bn.includes(an)) return bn;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of [...an.split("\n"), ...bn.split("\n")]) {
    const key = line.trim().toLowerCase();
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(line);
  }
  return out.join("\n");
}

/**
 * True-merge `dropId` INTO `keepId` with the given combined content. Returns false if
 * either id is missing / identical. Everything the dropped memory held is preserved.
 */
export async function mergeMemories(
  ctx: AppContext,
  spaceId: string,
  keepId: number,
  dropId: number,
  content: string,
): Promise<boolean> {
  if (keepId === dropId) return false;
  const s = ctx.handle.sqlite;
  const repo = new NodesRepo(ctx.handle, spaceId);
  const keep = repo.getById(keepId);
  const drop = repo.getById(dropId);
  if (!keep || !drop) return false;

  // Combine metadata so nothing about EITHER memory is lost:
  const importance = Math.min(1, Math.max(keep.importance ?? 0, drop.importance ?? 0) + 0.05);
  // The stronger emotional charge survives (magnitude wins).
  const ew =
    Math.abs(drop.emotionalWeight ?? 0) > Math.abs(keep.emotionalWeight ?? 0)
      ? drop.emotionalWeight ?? null
      : keep.emotionalWeight ?? null;
  // Keep the EARLIER creation date so the merged memory keeps its earned age → mass.
  const createdAt =
    drop.createdAt && keep.createdAt && drop.createdAt < keep.createdAt ? drop.createdAt : keep.createdAt;

  s.prepare(
    `UPDATE nodes SET content = ?, importance = ?, emotional_weight = ?, created_at = ?, last_tended_at = datetime('now')
     WHERE id = ? AND space_id = ?`,
  ).run(content.slice(0, 8000), importance, ew, createdAt, keepId, spaceId);

  upsertEmbedding(s, keepId, await ctx.embeddings.embed(`${keep.label}. ${content}`));
  ftsUpsert(s, keepId, keep.label, content);

  // Photos / files move to the survivor — never orphaned.
  s.prepare(`UPDATE attachments SET node_id = ? WHERE space_id = ? AND node_id = ?`).run(keepId, spaceId, dropId);

  // Reroute edges: drop the direct keep–drop links, repoint the rest, then dedupe + kill self-loops.
  s.prepare(
    `DELETE FROM edges WHERE space_id = ? AND ((source = ? AND target = ?) OR (source = ? AND target = ?))`,
  ).run(spaceId, keepId, dropId, dropId, keepId);
  s.prepare(`UPDATE edges SET source = ? WHERE space_id = ? AND source = ?`).run(keepId, spaceId, dropId);
  s.prepare(`UPDATE edges SET target = ? WHERE space_id = ? AND target = ?`).run(keepId, spaceId, dropId);
  s.prepare(`DELETE FROM edges WHERE space_id = ? AND source = target`).run(spaceId);
  s.prepare(
    `DELETE FROM edges WHERE space_id = ? AND id NOT IN (SELECT MIN(id) FROM edges WHERE space_id = ? GROUP BY source, target)`,
  ).run(spaceId, spaceId);

  // Insights that referenced the fused-away memory follow it to the survivor.
  s.prepare(`UPDATE OR IGNORE insights SET node_a = ? WHERE space_id = ? AND node_a = ?`).run(keepId, spaceId, dropId);
  s.prepare(`UPDATE OR IGNORE insights SET node_b = ? WHERE space_id = ? AND node_b = ?`).run(keepId, spaceId, dropId);
  s.prepare(`DELETE FROM insights WHERE space_id = ? AND node_a = node_b`).run(spaceId);

  repo.softDelete(dropId, keepId); // recoverable; points at the survivor
  return true;
}

export interface DedupOptions {
  /** Cosine similarity to treat two memories as redundant. Lower = more aggressive. */
  threshold?: number;
  /** Merges per run (gradual + observable). */
  maxPerRun?: number;
  /** How many recent memories to scan. */
  scan?: number;
}

/**
 * Free, offline duplicate sweep. Finds near-identical memories and true-merges them.
 * Bounded per run so it's gradual. Runs every autonomy tick regardless of Research Mode.
 */
export async function sweepDuplicates(ctx: AppContext, spaceId: string, opts: DedupOptions = {}): Promise<number> {
  const threshold = opts.threshold ?? 0.92;
  const maxPerRun = opts.maxPerRun ?? 3;
  const scan = opts.scan ?? 400;
  const s = ctx.handle.sqlite;
  const repo = new NodesRepo(ctx.handle, spaceId);

  const rows = s
    .prepare(
      `SELECT id FROM nodes WHERE space_id = ? AND deleted_at IS NULL AND (kind IS NULL OR kind = 'memory')
       ORDER BY id DESC LIMIT ?`,
    )
    .all(spaceId, scan) as { id: number }[];
  const alive = new Set(rows.map((r) => r.id));
  let merged = 0;

  for (const { id } of rows) {
    if (merged >= maxPerRun) break;
    if (!alive.has(id)) continue; // merged away earlier this run
    const emb = getEmbedding(s, id);
    if (!emb) continue;
    const dup = knn(s, emb, 4, spaceId).find((h) => h.nodeId !== id && alive.has(h.nodeId) && h.similarity >= threshold);
    if (!dup) continue;
    // Survivor = the older memory (lower id) so age/mass + original wording are kept.
    const keepId = Math.min(id, dup.nodeId);
    const dropId = Math.max(id, dup.nodeId);
    const keep = repo.getById(keepId);
    const drop = repo.getById(dropId);
    if (!keep || !drop) continue;
    if (await mergeMemories(ctx, spaceId, keepId, dropId, combineContent(keep.content, drop.content))) {
      alive.delete(dropId);
      merged++;
      try {
        s.prepare(`INSERT INTO agent_logs (space_id, action, description, targets) VALUES (?, 'merging', ?, ?)`).run(
          spaceId,
          `Merged near-duplicate "${drop.label}" into "${keep.label}" — kept everything.`,
          JSON.stringify([keepId, dropId]),
        );
      } catch {
        /* best-effort */
      }
    }
  }
  return merged;
}
