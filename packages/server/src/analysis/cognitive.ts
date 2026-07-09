import { COGNITIVE_META, COGNITIVE_KINDS, type CognitiveKind } from "@brain/shared";
import type { AppContext } from "../context.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { EdgesRepo } from "../repositories/edges.repo.js";
import { knn, getEmbedding, upsertEmbedding } from "../db/vec.js";
import { ftsUpsert } from "../db/fts.js";
import { isRejected, recordRejection } from "./rejections.js";

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

/**
 * Cosine floor for the SEMANTIC pass. Raised from 0.55 (too loose — it linked a
 * person to any vaguely-similar note) to 0.75, matching the strict bar real
 * memories link at. Better to miss a subtle link than to invent a false one.
 */
const GRAVITY_THRESHOLD = 0.75;
/** Max new supports edges per anchor per run, split by match type. */
const MAX_SEMANTIC = 3;
const MAX_KEYWORD = 8;
/** Hard ceiling on how many memories a single anchor may auto-gather in total, so a
 *  common name can't slowly accrete dozens of links across many autonomy runs. */
const MAX_ANCHOR_LINKS = 12;

/**
 * Words too common to be a reliable NAME/keyword match. A person called "Will",
 * "Mark", "May", "Grace", "Hope" must NOT link to every memory containing that
 * everyday word — that's what produced 20-30 bogus connections to a person. We drop
 * these as single-word match tokens (multi-word names like "Will Smith" still match as
 * a phrase). Better to miss a link on a common-word name than invent dozens.
 */
const COMMON_WORDS = new Set<string>([
  // articles / pronouns / conjunctions / prepositions
  "the", "and", "for", "with", "that", "this", "there", "here", "they", "them", "their",
  "your", "yours", "mine", "ours", "from", "into", "onto", "over", "under", "about",
  "after", "before", "then", "than", "when", "what", "which", "were", "was", "have",
  "has", "had", "been", "being", "does", "did", "done", "will", "would", "shall",
  "should", "could", "cant", "wont", "dont", "just", "like", "some", "more", "most",
  "much", "many", "very", "also", "still", "even", "back", "down", "out", "off",
  // common verbs / everyday words that double as names
  "make", "made", "take", "took", "give", "gave", "come", "came", "want", "need",
  "feel", "felt", "know", "knew", "think", "thought", "good", "great", "best", "well",
  "time", "day", "days", "week", "year", "today", "tomorrow", "morning", "night",
  "mark", "grace", "hope", "faith", "joy", "rose", "dawn", "may", "june", "april",
  "art", "bill", "will", "sunny", "summer", "autumn", "kim", "guy", "chase", "hunter",
]);

/**
 * Kinds that must link by NAME only — never by "vibe". A person or an identity is
 * about a specific entity; a memory that merely *feels* similar is NOT a real
 * connection (this is what wrongly tied a girlfriend to unrelated memories). Goals,
 * skills, motivations etc. legitimately gather thematically-related memories, so
 * they keep the (now stricter) semantic pass.
 */
export const NAME_ONLY_KINDS = new Set<string>(["person_entity", "identity"]);

/** True if `kind` is one of the cognitive kinds (an anchor, not a plain memory). */
function isCognitiveKind(kind: string | null | undefined): kind is CognitiveKind {
  return kind != null && kind in COGNITIVE_META;
}

/** Significant match tokens from a label: distinctive words (≥4 chars) + the full phrase. */
export function labelTokens(label: string): string[] {
  const toks = new Set<string>();
  for (const w of label.toLowerCase().split(/[^a-z0-9]+/)) {
    if (w.length >= 4) toks.add(w);
  }
  const full = label.trim().toLowerCase();
  if (full.length >= 4) toks.add(full);
  return [...toks];
}

/** Normalize a raw alias list: trim, dedupe, drop empties, cap. */
function cleanAliases(aliases?: string[]): string[] | undefined {
  if (!aliases) return undefined;
  const out = [...new Set(aliases.map((a) => a.trim()).filter((a) => a.length >= 2))].slice(0, 12);
  return out.length > 0 ? out : undefined;
}

/**
 * Match tokens for an anchor = its label tokens PLUS every alias (each alias kept as
 * a whole phrase AND its distinctive words). So a person "the person" with aliases
 * ["girlfriend", "my girl"] matches memories that say "girlfriend", "my girl", OR
 * "the person" — letting VAGUE memories connect without the exact name.
 */
function anchorMatchTokens(label: string, aliasesJson: string | null): string[] {
  const toks = new Set(labelTokens(label));
  if (aliasesJson) {
    try {
      const arr = JSON.parse(aliasesJson) as string[];
      for (const a of arr) {
        const phrase = a.trim().toLowerCase();
        if (phrase.length >= 2) toks.add(phrase); // whole alias ("my girl")
        for (const w of phrase.split(/[^a-z0-9]+/)) if (w.length >= 4) toks.add(w);
      }
    } catch {
      /* ignore malformed */
    }
  }
  // Drop single everyday words (a name like "Will"/"May" must not match every memory
  // using that word). Multi-word phrases ("will smith", "my girl") are distinctive → kept.
  return [...toks].filter((t) => t.includes(" ") || !COMMON_WORDS.has(t));
}

/** Whole-word / phrase match (case-insensitive) so "Danny" doesn't hit "Dannyson". */
export function mentions(haystack: string, token: string): boolean {
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
  opts: { date?: string; aliases?: string[] } = {},
): Promise<number> {
  const meta = COGNITIVE_META[kind];
  const repo = new NodesRepo(ctx.handle, spaceId);
  const emb = await ctx.embeddings.embed(`${label}. ${content}`);
  // Cognitive objects use `type:"concept"` (abstract) but a cognitive `kind`.
  // A future_event carries its date in `remind_at` (drives the timeline + roll-past).
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
      aliases: cleanAliases(opts.aliases),
      remindAt: kind === "future_event" ? opts.date : undefined,
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
  patch: { label?: string; content?: string; aliases?: string[] },
): Promise<boolean> {
  const s = ctx.handle.sqlite;
  const row = s
    .prepare(`SELECT label, content, kind FROM nodes WHERE id = ? AND space_id = ? AND deleted_at IS NULL`)
    .get(id, spaceId) as { label: string; content: string; kind: string | null } | undefined;
  if (!row || !isCognitiveKind(row.kind)) return false; // only cognitive nodes are editable here
  const label = (patch.label ?? row.label).slice(0, 200);
  const content = (patch.content ?? row.content).slice(0, 4000) || label;
  if (patch.aliases !== undefined) {
    s.prepare(`UPDATE nodes SET aliases = ? WHERE id = ? AND space_id = ?`).run(
      cleanAliases(patch.aliases) ? JSON.stringify(cleanAliases(patch.aliases)) : null,
      id,
      spaceId,
    );
  }
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
  aliases: string[];
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
      `SELECT n.id, n.kind, n.label, n.content, n.progress, n.aliases, n.created_at AS createdAt,
         (SELECT COUNT(*) FROM edges e WHERE e.space_id = n.space_id AND (e.source = n.id OR e.target = n.id)) AS degree
       FROM nodes n
       WHERE n.space_id = ? AND n.deleted_at IS NULL AND n.kind IN (${placeholders})
       ORDER BY n.id DESC LIMIT 100`,
    )
    .all(spaceId, ...kinds) as (Omit<CognitiveItem, "kind" | "aliases"> & { kind: string; aliases: string | null })[];
  return rows.map((r) => {
    let aliases: string[] = [];
    try {
      if (r.aliases) aliases = JSON.parse(r.aliases);
    } catch {
      /* ignore */
    }
    return { ...r, kind: r.kind as CognitiveKind, aliases };
  });
}

/**
 * Sever one memory's link to a cognitive anchor and remember it as unrelated, so
 * gravity never re-draws it. (The per-chip "×" in the Mind tab.)
 */
export function unlinkMemory(ctx: AppContext, spaceId: string, anchorId: number, memoryId: number): boolean {
  const s = ctx.handle.sqlite;
  const changed = s
    .prepare(
      `DELETE FROM edges WHERE space_id = ? AND ((source = ? AND target = ?) OR (source = ? AND target = ?))`,
    )
    .run(spaceId, memoryId, anchorId, anchorId, memoryId).changes;
  recordRejection(ctx, spaceId, memoryId, anchorId);
  return changed > 0;
}

/**
 * Bulk cleanup: sever every supporting memory of an anchor that does NOT actually
 * name it (or one of its aliases) — i.e. the loose "vibe" links from the old model.
 * Each pruned pair is remembered as unrelated. Returns how many were pruned.
 */
export function pruneAnchorLinks(ctx: AppContext, spaceId: string, anchorId: number): number {
  const s = ctx.handle.sqlite;
  const anchor = s
    .prepare(`SELECT label, aliases, kind FROM nodes WHERE id = ? AND space_id = ? AND deleted_at IS NULL`)
    .get(anchorId, spaceId) as { label: string; aliases: string | null; kind: string | null } | undefined;
  if (!anchor) return 0;
  const tokens = anchorMatchTokens(anchor.label, anchor.aliases);
  const nameOnly = anchor.kind != null && NAME_ONLY_KINDS.has(anchor.kind);
  // A person/identity may ONLY hold memories that literally name it — so also sweep the
  // loose associative (`relates_to`) links similarity dragged in. Goals/skills legitimately
  // gather thematically, so for them we only prune the stricter `supports` mis-links.
  const rels = nameOnly ? "('supports','relates_to')" : "('supports')";
  const edgeRows = s
    .prepare(
      `SELECT id, source, target, relationship FROM edges
       WHERE space_id = ? AND (source = ? OR target = ?) AND relationship IN ${rels}`,
    )
    .all(spaceId, anchorId, anchorId) as { source: number; target: number }[];
  let pruned = 0;
  for (const e of edgeRows) {
    const memId = e.source === anchorId ? e.target : e.source;
    const mem = s
      .prepare(
        `SELECT label, content FROM nodes WHERE id = ? AND space_id = ? AND deleted_at IS NULL
           AND (kind IS NULL OR kind = 'memory')`,
      )
      .get(memId, spaceId) as { label: string; content: string } | undefined;
    if (!mem) continue; // only prune links to real memories (never anchor↔anchor/hubs)
    const hay = `${mem.label}\n${mem.content}`;
    if (tokens.length > 0 && tokens.some((t) => mentions(hay, t))) continue; // genuinely names it → keep
    if (unlinkMemory(ctx, spaceId, anchorId, memId)) pruned++;
  }
  return pruned;
}

/**
 * Trim an over-linked anchor down to `cap` by dropping its WEAKEST memory links (keeps
 * the strongest, most-relevant ones). Unlike pruneAnchorLinks this doesn't reject the
 * pairs — a legitimately thematic goal/skill can re-gather the best ones later; it just
 * shouldn't hold 79 at once. Returns how many links were removed.
 */
export function trimAnchorLinks(
  ctx: AppContext,
  spaceId: string,
  anchorId: number,
  cap: number = MAX_ANCHOR_LINKS,
): number {
  const s = ctx.handle.sqlite;
  const rows = s
    .prepare(
      `SELECT e.id FROM edges e
         JOIN nodes n ON n.id = (CASE WHEN e.source = ? THEN e.target ELSE e.source END)
       WHERE e.space_id = ? AND (e.source = ? OR e.target = ?)
         AND e.relationship IN ('supports','relates_to')
         AND n.deleted_at IS NULL AND (n.kind IS NULL OR n.kind = 'memory')
       ORDER BY e.weight ASC`,
    )
    .all(anchorId, spaceId, anchorId, anchorId) as { id: number }[];
  const excess = rows.length - cap;
  if (excess <= 0) return 0;
  const del = s.prepare(`DELETE FROM edges WHERE id = ? AND space_id = ?`);
  let removed = 0;
  for (let i = 0; i < excess; i++) {
    del.run(rows[i]!.id, spaceId);
    removed++;
  }
  return removed;
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
 *     This is what makes adding a person "Mara" connect the memories about her;
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

  const anchorRow = s
    .prepare(`SELECT kind, aliases FROM nodes WHERE id = ? AND space_id = ?`)
    .get(anchorId, spaceId) as { kind: string | null; aliases: string | null } | undefined;
  const anchorKind = anchorRow?.kind;

  // Total-degree guard: if this anchor already holds MAX_ANCHOR_LINKS supporters, stop
  // auto-gathering. Prevents a slow accretion of dozens of links across autonomy runs.
  const existing = (
    s.prepare(`SELECT COUNT(*) AS n FROM edges WHERE space_id = ? AND target = ? AND relationship = 'supports'`).get(spaceId, anchorId) as { n: number }
  ).n;
  if (existing >= MAX_ANCHOR_LINKS) return 0;
  const remaining = MAX_ANCHOR_LINKS - existing; // total this call may add across both passes

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
    if (isRejected(ctx, spaceId, memId, anchorId)) return false; // user said "not related"
    if (!isRealMemory(memId)) return false;
    edges.create({ source: memId, target: anchorId, relationship: "supports", weight: 0.7 });
    formed++;
    return true;
  };

  // 1) Name / keyword / ALIAS match — so "my girlfriend did X" links to the person
  //    you've told her that alias belongs to, even without her actual name.
  const tokens = anchorMatchTokens(label, anchorRow?.aliases ?? null);
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
      if (made >= MAX_KEYWORD || formed >= remaining) break;
      const hay = `${r.label}\n${r.content}`;
      if (!tokens.some((t) => mentions(hay, t))) continue; // enforce whole-word match
      if (link(r.id)) made++;
    }
  }

  // 2) Semantic match — SKIPPED for people/identities (they link by name only, so a
  // merely-similar memory can't be mistaken for a real connection to a person).
  const embedding = anchorKind && NAME_ONLY_KINDS.has(anchorKind) ? undefined : emb ?? getEmbedding(s, anchorId);
  if (embedding) {
    const hits = knn(s, embedding, 12, spaceId).filter(
      (h) => h.nodeId !== anchorId && h.similarity >= GRAVITY_THRESHOLD,
    );
    let made = 0;
    for (const h of hits) {
      if (made >= MAX_SEMANTIC || formed >= remaining) break;
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
