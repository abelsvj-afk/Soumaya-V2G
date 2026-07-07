import { COGNITIVE_META, COGNITIVE_KINDS, type CognitiveKind } from "@brain/shared";
import type { AppContext } from "../context.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { EdgesRepo } from "../repositories/edges.repo.js";
import { knn, getEmbedding, upsertEmbedding } from "../db/vec.js";
import { ftsUpsert } from "../db/fts.js";

/**
 * The cognitive layer (docs/COGNITIVE_LAYER.md). Cognitive objects are `nodes`
 * rows with a CognitiveKind — the same proven pattern as `moc`/`belief`. Their
 * colour/label/size/durability come from the single-source COGNITIVE_META map so
 * the galaxy render, the Legend, and the Mind panel can never drift.
 *
 * The signature dynamic — "memories drift toward the goal they support" — needs
 * NO orbit rewrite: the orbit system already parents each body to its heaviest
 * connected neighbour, so a HEAVY cognitive anchor (high importance) + `supports`
 * edges makes its memories orbit it. `linkCognitiveAnchor` grows those edges by
 * BOTH a literal name/keyword match (reliable for people + named things — a bare
 * name embeds too weakly for pure vector search to catch) AND a semantic knn pass
 * (for related-but-not-named memories). Linking runs IMMEDIATELY on create/edit so
 * connections appear at once, and again periodically via `applyCognitiveGravity`.
 */

/** Cosine floor for the SEMANTIC pass to pull a memory toward a cognitive anchor. */
const GRAVITY_THRESHOLD = 0.55;
/** Max new supports edges per anchor per run, split by match type. */
const MAX_SEMANTIC = 3;
const MAX_KEYWORD = 8;

/** True if `kind` is one of the cognitive kinds (an anchor, not a plain memory). */
function isCognitiveKind(kind: string | null | undefined): kind is CognitiveKind {
  return kind != null && kind in COGNITIVE_META;
}

/** Significant match tokens from a label: distinctive words (≥4 chars) + the full phrase. */
function labelTokens(label: string): string[] {
  const toks = new Set<string>();
  for (const w of label.toLowerCase().split(/[^a-z0-9]+/)) {
    if (w.length >= 4) toks.add(w);
  }
  const full = label.trim().toLowerCase();
  if (full.length >= 4) toks.add(full);
  return [...toks];
}

/** Whole-word / phrase match (case-insensitive) so "Danny" doesn't hit "Dannyson". */
function mentions(haystack: string, token: string): boolean {
  const esc = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, "i").test(haystack);
}

/** Create a cognitive object (offline-safe) and immediately link its memories. */
export async function createCognitive(
  ctx: AppContext,
  spaceId: string,
  kind: CognitiveKind,
  label: string,
  content: string,
): Promise<number> {
  const meta = COGNITIVE_META[kind];
  const repo = new NodesRepo(ctx.handle, spaceId);
  const emb = await ctx.embeddings.embed(`${label}. ${content}`);
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
    emb,
  );
  // Link right away so related memories appear under it the moment it's created.
  try {
    linkCognitiveAnchor(ctx, spaceId, node.id, node.label, emb);
  } catch {
    /* best-effort; the autonomy sweep will retry */
  }
  return node.id;
}

/** Edit a cognitive object's label/content: re-embed + re-index + re-link. */
export async function updateCognitive(
  ctx: AppContext,
  spaceId: string,
  id: number,
  patch: { label?: string; content?: string },
): Promise<boolean> {
  const s = ctx.handle.sqlite;
  const row = s
    .prepare(`SELECT label, content, kind FROM nodes WHERE id = ? AND space_id = ? AND deleted_at IS NULL`)
    .get(id, spaceId) as { label: string; content: string; kind: string | null } | undefined;
  if (!row || !isCognitiveKind(row.kind)) return false; // only cognitive nodes are editable here
  const label = (patch.label ?? row.label).slice(0, 200);
  const content = (patch.content ?? row.content).slice(0, 4000) || label;
  s.prepare(`UPDATE nodes SET label = ?, content = ? WHERE id = ? AND space_id = ?`).run(label, content, id, spaceId);
  const emb = await ctx.embeddings.embed(`${label}. ${content}`);
  upsertEmbedding(s, id, emb);
  ftsUpsert(s, id, label, content);
  new NodesRepo(ctx.handle, spaceId).tend(id);
  try {
    linkCognitiveAnchor(ctx, spaceId, id, label, emb);
  } catch {
    /* best-effort */
  }
  return true;
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
 * Link one cognitive anchor to the memories it should pull into its orbit, via two
 * complementary passes (both create `supports` edges memory→anchor, so the heavier
 * anchor becomes their orbital parent). Only REAL memories are pulled — never other
 * cognitive anchors, hubs, or actions. Returns how many new edges were formed.
 *
 *  1. NAME / KEYWORD match — the memory literally mentions the anchor (whole-word).
 *     This is what makes adding a person "Shaquavia" connect the memories about her;
 *     a bare name embeds too weakly for vector search alone to catch it.
 *  2. SEMANTIC match — strongly-similar memories that don't name it outright.
 */
export function linkCognitiveAnchor(
  ctx: AppContext,
  spaceId: string,
  anchorId: number,
  label: string,
  emb?: Float32Array,
): number {
  const s = ctx.handle.sqlite;
  const edges = new EdgesRepo(ctx.handle, spaceId);
  let formed = 0;

  const isRealMemory = (id: number) =>
    s
      .prepare(
        `SELECT 1 FROM nodes WHERE id = ? AND space_id = ? AND deleted_at IS NULL
           AND (kind IS NULL OR kind = 'memory')`,
      )
      .get(id, spaceId) != null;

  const link = (memId: number): boolean => {
    if (memId === anchorId) return false;
    if (edges.exists(memId, anchorId) || edges.exists(anchorId, memId)) return false;
    if (!isRealMemory(memId)) return false;
    edges.create({ source: memId, target: anchorId, relationship: "supports", weight: 0.7 });
    formed++;
    return true;
  };

  // 1) Name / keyword match.
  const tokens = labelTokens(label);
  if (tokens.length > 0) {
    const likeClause = tokens.map(() => `lower(content) LIKE ? OR lower(label) LIKE ?`).join(" OR ");
    const params: string[] = [];
    for (const t of tokens) params.push(`%${t}%`, `%${t}%`);
    const rows = s
      .prepare(
        `SELECT id, label, content FROM nodes
         WHERE space_id = ? AND deleted_at IS NULL AND (kind IS NULL OR kind = 'memory') AND (${likeClause})
         ORDER BY id DESC LIMIT 80`,
      )
      .all(spaceId, ...params) as { id: number; label: string; content: string }[];
    let made = 0;
    for (const r of rows) {
      if (made >= MAX_KEYWORD) break;
      const hay = `${r.label}\n${r.content}`;
      if (!tokens.some((t) => mentions(hay, t))) continue; // enforce whole-word match
      if (link(r.id)) made++;
    }
  }

  // 2) Semantic match.
  const embedding = emb ?? getEmbedding(s, anchorId);
  if (embedding) {
    const hits = knn(s, embedding, 12, spaceId).filter(
      (h) => h.nodeId !== anchorId && h.similarity >= GRAVITY_THRESHOLD,
    );
    let made = 0;
    for (const h of hits) {
      if (made >= MAX_SEMANTIC) break;
      if (link(h.nodeId)) made++;
    }
  }

  return formed;
}

/**
 * Cognitive gravity (free, offline, autonomy step): re-run linking for every
 * cognitive anchor so memories keep drifting toward the goals/people/identity/etc.
 * they serve as the brain grows. Returns how many new supports edges were formed.
 */
export function applyCognitiveGravity(ctx: AppContext, spaceId: string): number {
  const anchors = ctx.handle.sqlite
    .prepare(
      `SELECT id, label FROM nodes
       WHERE space_id = ? AND deleted_at IS NULL AND kind IN (${COGNITIVE_KINDS.map(() => "?").join(",")})`,
    )
    .all(spaceId, ...COGNITIVE_KINDS) as { id: number; label: string }[];
  let formed = 0;
  for (const a of anchors) formed += linkCognitiveAnchor(ctx, spaceId, a.id, a.label);
  return formed;
}
