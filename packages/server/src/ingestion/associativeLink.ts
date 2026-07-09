import type { GraphEdge, GraphNode } from "@brain/shared";
import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import { knn } from "../db/vec.js";
import type { LlmProvider } from "../llm/adapter.js";
import type { EdgesRepo } from "../repositories/edges.repo.js";
import type { NodesRepo } from "../repositories/nodes.repo.js";
import { recordCandidate } from "../analysis/candidates.js";

export interface AssociativeLinkOptions {
  /** Cosine similarity floor for a candidate to be considered. */
  threshold: number;
  /** Max nearest neighbours to inspect (caps LLM fan-out). */
  k: number;
  /** Max edges to actually create for one new node (avoids hub over-linking). */
  maxLinks?: number;
}

// threshold lowered from 0.85 (near-duplicate territory) to 0.72 so a new memory links
// to RELATED older ones across time — e.g. "a new fear of repossession" reaches an old
// "repossession" memory even when the wording differs. The LLM/keyword `validateLink`
// gate downstream still filters out superficial matches, and maxLinks caps hub sprawl.
// maxLinks lowered 5 → 3: a higher bar for what Soumaya draws on her own, so the galaxy
// grows FEWER, surer connections per memory instead of over-linking. The neighbours she
// now holds back (over the cap, or that the validate gate wasn't sure about) aren't lost —
// they're routed to the review queue (candidate_links) for YOU to connect or dismiss.
export const DEFAULT_LINK_OPTIONS: AssociativeLinkOptions = { threshold: 0.72, k: 12, maxLinks: 3 };

/**
 * The autonomous "dot-connecting" step: for a freshly stored node, find its
 * nearest semantic neighbours, then ask the LLM to validate each into a typed
 * edge. Emulates associative memory — connecting new thoughts to forgotten ones.
 */
export async function associativeLink(
  h: DbHandle,
  deps: { nodes: NodesRepo; edges: EdgesRepo; llm: LlmProvider },
  newNode: GraphNode,
  embedding: Float32Array,
  options: AssociativeLinkOptions = DEFAULT_LINK_OPTIONS,
  spaceId: string = DEFAULT_SPACE,
): Promise<GraphEdge[]> {
  // k+1 because the node itself is its own nearest neighbour. Strongest matches
  // first so that, when capped, we keep the most meaningful connections. KNN is
  // scoped to this space so we never link across users' brains.
  const hits = knn(h.sqlite, embedding, options.k + 1, spaceId)
    .filter((hit) => hit.nodeId !== newNode.id && hit.similarity >= options.threshold)
    .sort((a, b) => b.similarity - a.similarity);

  const cap = options.maxLinks ?? DEFAULT_LINK_OPTIONS.maxLinks ?? Infinity;
  const created: GraphEdge[] = [];
  let regularLinks = 0; // only peer-to-peer links count toward the cap
  for (const hit of hits) {
    if (deps.edges.exists(newNode.id, hit.nodeId)) continue;
    const target = deps.nodes.getById(hit.nodeId);
    if (!target) continue;

    // Constellation membership: a strong match to an existing MOC hub means this new
    // memory belongs in that constellation — add it directly (a `summarizes` edge), no
    // LLM gate and no cap. This is how a constellation grows with related new memories.
    if (target.kind === "moc") {
      created.push(
        deps.edges.create({
          source: target.id,
          target: newNode.id,
          relationship: "summarizes",
          weight: hit.similarity,
        }),
      );
      continue;
    }

    if (regularLinks >= cap) {
      // Strong enough to consider, but past the per-memory cap → offer it for review
      // rather than either over-linking or silently forgetting it.
      recordCandidate(h, spaceId, newNode.id, hit.nodeId, "A related memory beyond the auto-connect limit", hit.similarity, "withheld");
      continue;
    }
    const decision = await deps.llm.validateLink(
      { label: newNode.label, content: newNode.content },
      { label: target.label, content: target.content },
      hit.similarity,
    );
    if (decision.linked) {
      created.push(
        deps.edges.create({
          source: newNode.id,
          target: hit.nodeId,
          relationship: decision.relationship ?? "relates_to",
          weight: decision.weight ?? hit.similarity,
        }),
      );
      regularLinks++;
    } else {
      // The gate wasn't confident — don't draw it, but surface it so YOU can decide.
      recordCandidate(h, spaceId, newNode.id, hit.nodeId, "Soumaya wasn't sure these connect — your call", hit.similarity, "withheld");
    }
  }
  return created;
}
