import { COGNITIVE_META, type CognitiveKind } from "@brain/shared";
import type { AppContext } from "../context.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { EdgesRepo } from "../repositories/edges.repo.js";
import { knn, getEmbedding } from "../db/vec.js";

/**
 * The cognitive layer (docs/COGNITIVE_LAYER.md). Cognitive objects are `nodes`
 * rows with a CognitiveKind — the same proven pattern as `moc`/`belief`. Their
 * colour/label/size/durability come from the single-source COGNITIVE_META map so
 * the galaxy render, the Legend, and the Mind panel can never drift.
 *
 * The signature dynamic — "memories drift toward the goal they support" — needs
 * NO orbit rewrite: the orbit system already parents each body to its heaviest
 * connected neighbour, so a HEAVY cognitive anchor (high importance) + `supports`
 * edges makes its memories orbit it. `applyCognitiveGravity` grows those edges
 * over time by knn-matching each anchor to strongly-similar unlinked memories.
 */

/** Anchors that exert gravity on supporting memories (durable + weighty). */
const GRAVITY_KINDS: CognitiveKind[] = ["goal", "identity", "skill", "person_entity", "motivation"];
/** Cosine floor for a memory to be pulled toward a cognitive anchor. */
const GRAVITY_THRESHOLD = 0.55;
/** Max new supports edges created per anchor per run (gradual + visible). */
const MAX_PER_ANCHOR = 3;

/** Create a cognitive object (offline-safe; embedding drives its later gravity). */
export async function createCognitive(
  ctx: AppContext,
  spaceId: string,
  kind: CognitiveKind,
  label: string,
  content: string,
): Promise<number> {
  const meta = COGNITIVE_META[kind];
  const repo = new NodesRepo(ctx.handle, spaceId);
  // Cognitive objects use `type:"concept"` (abstract) but a cognitive `kind`.
  const node = repo.create(
    {
      label: label.slice(0, 200),
      type: "concept",
      kind,
      content: content.slice(0, 4000) || label,
      importance: meta.importance,
      color: meta.color,
      origin: "user",
      progress: meta.hasProgress ? 0 : undefined,
    },
    await ctx.embeddings.embed(`${label}. ${content}`),
  );
  return node.id;
}

export interface CognitiveItem {
  id: number;
  kind: CognitiveKind;
  label: string;
  content: string;
  progress: number | null;
  degree: number;
  createdAt: string;
}

/** List cognitive objects, optionally filtered by kind (newest first). */
export function listCognitive(
  ctx: AppContext,
  spaceId: string,
  kind?: CognitiveKind,
): CognitiveItem[] {
  const kinds = kind ? [kind] : (Object.keys(COGNITIVE_META) as CognitiveKind[]);
  const placeholders = kinds.map(() => "?").join(",");
  const rows = ctx.handle.sqlite
    .prepare(
      `SELECT n.id, n.kind, n.label, n.content, n.progress, n.created_at AS createdAt,
         (SELECT COUNT(*) FROM edges e WHERE e.space_id = n.space_id AND (e.source = n.id OR e.target = n.id)) AS degree
       FROM nodes n
       WHERE n.space_id = ? AND n.deleted_at IS NULL AND n.kind IN (${placeholders})
       ORDER BY n.id DESC LIMIT 100`,
    )
    .all(spaceId, ...kinds) as (Omit<CognitiveItem, "kind"> & { kind: string })[];
  return rows.map((r) => ({ ...r, kind: r.kind as CognitiveKind }));
}

/** Set a cognitive object's 0..1 progress (goal completion / skill level). */
export function setCognitiveProgress(
  ctx: AppContext,
  spaceId: string,
  id: number,
  value: number,
): boolean {
  const v = Math.max(0, Math.min(1, value));
  const changed = ctx.handle.sqlite
    .prepare(`UPDATE nodes SET progress = ? WHERE id = ? AND space_id = ? AND deleted_at IS NULL`)
    .run(v, id, spaceId).changes;
  if (changed > 0) new NodesRepo(ctx.handle, spaceId).tend(id);
  return changed > 0;
}

/**
 * Cognitive gravity (free, offline, autonomy step): for each weighty anchor, pull
 * strongly-similar unlinked memories into its orbit with a visible `supports`
 * edge — so your memories drift toward the goals/identity/skills they serve over
 * time. Returns how many new supports edges were formed this run.
 */
export function applyCognitiveGravity(ctx: AppContext, spaceId: string): number {
  const s = ctx.handle.sqlite;
  const anchors = s
    .prepare(
      `SELECT id FROM nodes
       WHERE space_id = ? AND deleted_at IS NULL AND kind IN (${GRAVITY_KINDS.map(() => "?").join(",")})`,
    )
    .all(spaceId, ...GRAVITY_KINDS) as { id: number }[];
  if (anchors.length === 0) return 0;

  const edges = new EdgesRepo(ctx.handle, spaceId);
  let formed = 0;
  for (const a of anchors) {
    const emb = getEmbedding(ctx.handle.sqlite, a.id);
    if (!emb) continue;
    const hits = knn(ctx.handle.sqlite, emb, 12, spaceId).filter((h) => h.nodeId !== a.id && h.similarity >= GRAVITY_THRESHOLD);
    let made = 0;
    for (const h of hits) {
      if (made >= MAX_PER_ANCHOR) break;
      // Only pull in REAL memories (not other cognitive anchors / hubs / actions).
      const target = s
        .prepare(
          `SELECT 1 FROM nodes WHERE id = ? AND space_id = ? AND deleted_at IS NULL
             AND (kind IS NULL OR kind IN ('memory'))`,
        )
        .get(h.nodeId, spaceId);
      if (!target) continue;
      if (edges.exists(h.nodeId, a.id) || edges.exists(a.id, h.nodeId)) continue;
      // memory --supports--> anchor (the anchor is the heavier orbital parent).
      edges.create({ source: h.nodeId, target: a.id, relationship: "supports", weight: 0.7 });
      made++;
      formed++;
    }
  }
  return formed;
}
