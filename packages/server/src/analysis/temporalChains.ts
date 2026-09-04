import type { EvolutionLink, GraphNode } from "@brain/shared";
import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import { knn, getEmbedding } from "../db/vec.js";
import { NodesRepo } from "../repositories/nodes.repo.js";

/**
 * Cross-memory temporal linking (research-agent add-on #8). Surfaces how a thread of
 * thinking *evolved*: two memories on the SAME theme (high cosine) recorded far apart
 * in TIME become an evolution link, older → newer, with a strength band, the temporal
 * distance, and any mood drift between them. Read-only + offline (no LLM, no graph
 * mutation — materializing these as `evolves_into` edges is a noted follow-up).
 */
export interface TemporalOptions {
  /** Cosine floor for two memories to count as the same theme. */
  threshold: number;
  /** Minimum days apart to count as an *evolution* (not just two same-day notes). */
  minGapDays: number;
  /** Nearest neighbours to inspect per node. */
  k: number;
  /** Cap on links returned. */
  maxLinks: number;
}

export const DEFAULT_TEMPORAL: TemporalOptions = {
  threshold: 0.84,
  minGapDays: 14,
  k: 6,
  maxLinks: 10,
};

/** Band a cosine similarity into a display strength. */
export function linkStrength(sim: number): EvolutionLink["strength"] {
  if (sim >= 0.92) return "strong";
  if (sim >= 0.87) return "medium";
  return "weak";
}

const timeOf = (n: GraphNode): number => Date.parse(n.occurredAt ?? n.createdAt);
const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

function moodDrift(from: GraphNode, to: GraphNode): string {
  const a = from.emotionalWeight;
  const b = to.emotionalWeight;
  if (typeof a !== "number" || typeof b !== "number") return "";
  const delta = b - a;
  if (Math.abs(delta) < 0.3) return " · mood held steady";
  const word = (v: number) => (v <= -0.3 ? "heavy" : v >= 0.3 ? "bright" : "neutral");
  return ` · mood moved ${word(a)} → ${word(b)}`;
}

function gapPhrase(days: number): string {
  if (days >= 365) return `${Math.round(days / 365)}y apart`;
  if (days >= 60) return `${Math.round(days / 30)}mo apart`;
  return `${days}d apart`;
}

/**
 * The shared core, factored out so the two exported entry points below differ ONLY in which
 * nodes seed the OUTER loop — everything else (the per-node KNN lookup, the theme/gap/strength
 * math) is identical, so the bounded path can never silently diverge in behavior from the
 * full-space one. `subjects` are the OUTER-loop candidates (bounded or not); `resolveOther`
 * looks up whatever a KNN hit actually points at, which is deliberately NOT restricted to
 * `subjects` — the counterpart of a bounded, currently-relevant memory can be ANY memory in the
 * space (that's the whole point of "what did this theme evolve from"), so narrowing the lookup
 * to only the bounded set would silently drop real links instead of just skipping irrelevant
 * outer-loop work.
 */
function evolutionLinksFor(
  h: DbHandle,
  spaceId: string,
  subjects: GraphNode[],
  resolveOther: (id: number) => GraphNode | undefined,
  opts: TemporalOptions,
): EvolutionLink[] {
  const seen = new Set<string>();
  const links: (EvolutionLink & { rank: number })[] = [];

  for (const node of subjects) {
    if (node.kind === "action" || node.kind === "moc") continue;
    const emb = getEmbedding(h.sqlite, node.id);
    if (!emb) continue;
    const hits = knn(h.sqlite, emb, opts.k + 1, spaceId).filter(
      (hit) => hit.nodeId !== node.id && hit.similarity >= opts.threshold,
    );
    for (const hit of hits) {
      const other = resolveOther(hit.nodeId);
      if (!other || other.kind === "action" || other.kind === "moc") continue;
      const key = pairKey(node.id, hit.nodeId);
      if (seen.has(key)) continue;

      const ta = timeOf(node);
      const tb = timeOf(other);
      if (Number.isNaN(ta) || Number.isNaN(tb)) continue;
      const days = Math.floor(Math.abs(ta - tb) / 86_400_000);
      if (days < opts.minGapDays) continue;
      seen.add(key);

      const older = ta <= tb ? node : other;
      const newer = ta <= tb ? other : node;
      links.push({
        fromId: older.id,
        fromLabel: older.label,
        toId: newer.id,
        toLabel: newer.label,
        strength: linkStrength(hit.similarity),
        temporalDistanceDays: days,
        reason: `Same theme, ${gapPhrase(days)}${moodDrift(older, newer)}`,
        rank: hit.similarity * Math.log10(days + 10),
      });
    }
  }

  return links
    .sort((a, b) => b.rank - a.rank)
    .slice(0, opts.maxLinks)
    .map(({ rank: _rank, ...link }) => link);
}

/**
 * The original, UNCHANGED full-space entry point — every memory in the space seeds the outer
 * loop. Correct and intentional for its one real caller (`GET /api/digest/evolution`, an
 * on-demand Digest-panel view the user explicitly opens to see their whole memory graph's
 * continuity), matching the same "full scans are fine in a batch/on-demand route, never on the
 * chat hot path" precedent `synthesis/contradictions.ts`'s `runContradictionScan` already
 * established. Behavior is byte-for-byte identical to before this pass — `subjects` is still
 * every node in the space, and `resolveOther` is still an O(1) Map lookup into that same set.
 */
export function buildEvolutionLinks(
  h: DbHandle,
  spaceId: string = DEFAULT_SPACE,
  opts: TemporalOptions = DEFAULT_TEMPORAL,
): EvolutionLink[] {
  const all = new NodesRepo(h, spaceId).all();
  const byId = new Map<number, GraphNode>(all.map((n) => [n.id, n]));
  return evolutionLinksFor(h, spaceId, all, (id) => byId.get(id), opts);
}

/**
 * Maya Longitudinal Intelligence, Phase A (docs/specs/maya-longitudinal-intelligence.md) — the
 * bounded entry point for the chat hot path. `relevantIds` is the SAME small, already-computed
 * GraphRAG context set `chat/graphrag.ts` builds for every message (hybrid KNN+keyword seeds
 * plus a shallow multi-hop expansion — typically a few dozen ids regardless of how many
 * thousand memories the space holds), not a new retrieval mechanism. Only these nodes seed the
 * outer loop, so the per-message cost is O(|relevantIds|) instead of O(every memory in the
 * space); each outer node still gets ONE indexed `knn()` query (already a bounded, single
 * `vec_nodes` lookup, never a scan) that can find a counterpart ANYWHERE in the space — a
 * bounded outer loop does not mean a bounded answer, only bounded WORK. `resolveOther` falls
 * back to a single `getById()` for any KNN hit outside `relevantIds`, exactly the same shape of
 * lookup `chat/graphrag.ts` already does for citation validation elsewhere.
 */
export function buildEvolutionLinksAmong(
  h: DbHandle,
  spaceId: string = DEFAULT_SPACE,
  relevantIds: number[],
  opts: TemporalOptions = DEFAULT_TEMPORAL,
): EvolutionLink[] {
  if (relevantIds.length === 0) return [];
  const repo = new NodesRepo(h, spaceId);
  const subjects = repo.byIds(relevantIds);
  const cache = new Map<number, GraphNode | undefined>(subjects.map((n) => [n.id, n]));
  const resolveOther = (id: number): GraphNode | undefined => {
    if (!cache.has(id)) cache.set(id, repo.getById(id));
    return cache.get(id);
  };
  return evolutionLinksFor(h, spaceId, subjects, resolveOther, opts);
}
