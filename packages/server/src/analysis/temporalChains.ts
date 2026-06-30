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

export function buildEvolutionLinks(
  h: DbHandle,
  spaceId: string = DEFAULT_SPACE,
  opts: TemporalOptions = DEFAULT_TEMPORAL,
): EvolutionLink[] {
  const repo = new NodesRepo(h, spaceId);
  const byId = new Map<number, GraphNode>(repo.all().map((n) => [n.id, n]));
  const seen = new Set<string>();
  const links: (EvolutionLink & { rank: number })[] = [];

  for (const node of byId.values()) {
    if (node.kind === "action" || node.kind === "moc") continue;
    const emb = getEmbedding(h.sqlite, node.id);
    if (!emb) continue;
    const hits = knn(h.sqlite, emb, opts.k + 1, spaceId).filter(
      (hit) => hit.nodeId !== node.id && hit.similarity >= opts.threshold,
    );
    for (const hit of hits) {
      const other = byId.get(hit.nodeId);
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
