import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import { knn, getEmbedding } from "../db/vec.js";
import { EdgesRepo } from "../repositories/edges.repo.js";

/**
 * Constellation re-evaluation (background, free, offline). As the brain grows, an old
 * memory can drift into the gravity of a constellation that didn't exist when it was
 * logged. Periodically, for each constellation (MOC hub), find memories that are now
 * strongly similar to it but aren't members yet, and pull them in with a visible
 * `summarizes` line. It only ADDS membership — it never tears a constellation down —
 * and it works a FEW at a time so you actually see the connections form over time.
 */
export interface ReconcileOptions {
  /** Cosine floor for a memory to be pulled into a constellation. */
  threshold: number;
  /** Neighbours to inspect per hub. */
  k: number;
  /** Max new memberships created per run (keeps it gradual + visible). */
  maxPerRun: number;
}

export const DEFAULT_RECONCILE: ReconcileOptions = { threshold: 0.72, k: 12, maxPerRun: 3 };

export function reconcileConstellations(
  h: DbHandle,
  spaceId: string = DEFAULT_SPACE,
  opts: ReconcileOptions = DEFAULT_RECONCILE,
): number {
  const hubs = h.sqlite
    .prepare(`SELECT id FROM nodes WHERE space_id = ? AND kind = 'moc' AND deleted_at IS NULL`)
    .all(spaceId) as { id: number }[];
  if (hubs.length === 0) return 0;

  const edges = new EdgesRepo(h, spaceId);
  let added = 0;

  for (const hub of hubs) {
    if (added >= opts.maxPerRun) break;
    const emb = getEmbedding(h.sqlite, hub.id);
    if (!emb) continue;
    const hits = knn(h.sqlite, emb, opts.k + 1, spaceId).filter((hit) => hit.nodeId !== hub.id && hit.similarity >= opts.threshold);
    for (const hit of hits) {
      if (added >= opts.maxPerRun) break;
      // Only pull in real memories, and only if not already tied to this hub.
      const target = h.sqlite
        .prepare(`SELECT kind FROM nodes WHERE id = ? AND space_id = ? AND deleted_at IS NULL`)
        .get(hit.nodeId, spaceId) as { kind: string | null } | undefined;
      if (!target || target.kind === "moc" || target.kind === "action") continue;
      if (edges.exists(hub.id, hit.nodeId) || edges.exists(hit.nodeId, hub.id)) continue;
      edges.create({ source: hub.id, target: hit.nodeId, relationship: "summarizes", weight: hit.similarity });
      added++;
    }
  }
  return added;
}
