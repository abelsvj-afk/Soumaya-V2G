import type { GraphNode, ProvenanceRef, CognitiveKind } from "@brain/shared";
import { DURABLE_COGNITIVE_KINDS, COOLING_ENTROPY, entropyFrom } from "@brain/shared";
import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { getEmbedding } from "../db/vec.js";
import { daysSince } from "../lib/time.js";
import type { EntityStateEvent } from "./entityTimeline.js";

/**
 * Maya Longitudinal Intelligence, Phase D (docs/specs/maya-longitudinal-intelligence.md,
 * Section 13) — the relevance combiner. Answers a DIFFERENT question than epistemic status or
 * supersession ever have: not "is this true?" (that's `EpistemicStatus`) and not "is this still
 * current?" (that's Phase B/C), but **"should this evidence meaningfully participate in
 * reasoning about the user's CURRENT situation, right now?"** Old ≠ irrelevant (a durable Life
 * Vision), recent ≠ important, relevant ≠ true, outdated ≠ useless — this module keeps those
 * four distinctions structurally separate rather than folding them into one number.
 *
 * Built entirely from signals this codebase already computes or stores — no new persistence, no
 * ML, no second supersession/causal pass:
 *  - **Durability**: `@brain/shared`'s existing `DURABLE_COGNITIVE_KINDS` (a Life Vision/Goal/
 *    Identity/etc. is durable — "entropy-exempt" in the galaxy's own words — precisely the
 *    "doesn't decay merely because it hasn't been mentioned recently" property Phase D needs).
 *  - **Reinforcement**: the same "how many latent insights this memory appears in" signal
 *    `graph/service.ts`'s own `enrich()` already computes and calls "reinforcement" verbatim —
 *    mirrored here as its own small, bounded query (that method is private to `GraphService`,
 *    so this is the same shape of query, not a shared call, kept to exactly what's needed: a
 *    count, not the full mass/celestial enrichment).
 *  - **Recency/cooling**: `@brain/shared`'s own `entropyFrom`/`COOLING_ENTROPY` — the exact
 *    constant that already means "cooling" everywhere else in this app (the ❄️ badge, the
 *    Browse filter) — reused verbatim, not re-derived.
 *  - **Supersession**: Phase C's `EntityStateEvent[]` (which already carries Phase B's resolved
 *    `"outdated"`/`"contradicted"` status per event) — reused as-is; this module never calls
 *    `resolveSupersession` itself.
 *  - **Causal connection**: an externally-supplied id set — this module never calls
 *    `analysis/causal.ts` itself either. The caller (who already has an `IntelligenceClaim` to
 *    hand `possibleDownstreamEffects`) passes in which ids are already known to be causally tied
 *    to something current. Phase D adds no causal reasoning of its own.
 *  - **Context match**: cosine similarity (a plain dot product — `db/vec.ts`'s own bootstrap
 *    comment: "we store already-L2-normalized vectors") between a candidate's stored embedding
 *    and an optional current-topic anchor's — the same embedding infrastructure `knn()` already
 *    uses, just compared directly for two specific vectors instead of an indexed search.
 */

/** A small, named classification — never a fabricated weighted-sum score. This codebase's own
 *  standing rule (`IntelligenceClaim.confidence` never folding into another number,
 *  `dreamCycle.ts`'s `Math.max(CONFIDENCE_IMPORTANCE, confidence)` cited repeatedly as the
 *  mistake never to repeat) argues against inventing a precise-looking 0..1 relevance score this
 *  module has no principled way to justify to that precision. Three tiers, each backed by an
 *  explicit, auditable reason list, says exactly as much as the underlying signals actually
 *  support. */
export type RelevanceTier = "high" | "moderate" | "low";

export interface RelevanceResult {
  ref: ProvenanceRef;
  tier: RelevanceTier;
  /** Which signals actually applied — auditable, not shown to the user verbatim. Always
   *  present even when empty-ish, so a caller/test can see WHY a tier was assigned rather than
   *  trusting a black box. */
  reasons: string[];
}

export interface RelevanceContext {
  /** Phase C's reconstructed history for the relevant entity, if the caller already has one —
   *  reused ONLY to read which candidate ids are already labeled `"outdated"`/`"contradicted"`.
   *  Never recomputed here. */
  timeline?: EntityStateEvent[];
  /** ids already known — via an EXISTING `CausalLink` the caller already computed
   *  (`analysis/causal.ts`'s `possibleDownstreamEffects`) — to be causally connected to a
   *  current change. Phase D never forms a new causal link itself. */
  causallyConnectedIds?: Iterable<number>;
  /** The current focus, as a real, existing memory node — similarity against this is the
   *  "does this candidate match what's being reasoned about right now" signal. Omit for a
   *  topic-agnostic pass (e.g. general context bounding with no single active subject); every
   *  candidate then skips the context-match rule entirely rather than being guessed at. */
  topic?: ProvenanceRef;
}

const REINFORCEMENT_MIN = 2; // "at least 2 to count as a pattern" — same bar emotional.ts's own dominantTrigger() already uses for pattern membership
/** "Same topic" bar — analysis/contradictions.ts's own DEFAULT_CONTRADICTION.threshold (0.75),
 *  reused verbatim rather than a new invented number for the same underlying claim. */
const HIGH_SIMILARITY = 0.75;
/** "Not related" bar — chat/graphrag.ts's own KNOWLEDGE_THRESHOLD (0.3), the existing line this
 *  app already draws for "too unrelated to inject into context." */
const LOW_SIMILARITY = 0.3;

function isDurable(kind: GraphNode["kind"]): boolean {
  return kind != null && DURABLE_COGNITIVE_KINDS.has(kind as CognitiveKind);
}

/** Cosine similarity of two already-L2-normalized embeddings is just their dot product — see
 *  db/vec.ts's own bootstrapVec comment. Not a new similarity metric, just applied directly to
 *  two specific vectors instead of through an indexed vec0 search. */
function dot(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += a[i]! * b[i]!;
  return sum;
}

function placeholders(ids: number[]): string {
  return ids.map(() => "?").join(",");
}

/**
 * Score each candidate's relevance to CURRENT reasoning — never their truth, never their
 * epistemic status (both stay exactly as they were; this module reads them, never writes them).
 * `candidates` MUST already be a bounded, server-resolved set (e.g. a GraphRAG retrieval's own
 * id set, or a Phase C timeline's event sources) — never the whole memory universe; this
 * function does not itself search or expand it. Non-memory or cross-space refs are silently
 * dropped, the same "insufficient/invalid evidence -> silently skip" discipline every sibling
 * module in this family already uses.
 */
export function computeRelevance(
  handle: DbHandle,
  spaceId: string = DEFAULT_SPACE,
  candidates: ProvenanceRef[],
  context: RelevanceContext = {},
  now: Date = new Date(),
): RelevanceResult[] {
  const memoryRefs = candidates.filter((c) => c.domain === "memory" && c.kind === "node");
  if (memoryRefs.length === 0) return [];

  const ids = memoryRefs.map((c) => c.id);
  const nodesRepo = new NodesRepo(handle, spaceId);
  const nodes = nodesRepo.byIds(ids); // space-scoped; dangling/cross-space ids silently dropped
  const nodeById = new Map<number, GraphNode>(nodes.map((n) => [n.id, n]));

  // Reinforcement: same "how many insights mention this memory" signal graph/service.ts's own
  // enrich() calls "reinforcement" — a small, bounded query over the ALREADY-bounded id set
  // (never every insight in the space, only ones touching these specific candidates).
  const reinforcementRows =
    ids.length > 0
      ? (handle.sqlite
          .prepare(
            `SELECT node_id, COUNT(*) AS cnt FROM (
               SELECT node_a AS node_id FROM insights WHERE space_id = ?
               UNION ALL
               SELECT node_b AS node_id FROM insights WHERE space_id = ?
             ) WHERE node_id IN (${placeholders(ids)})
             GROUP BY node_id`,
          )
          .all(spaceId, spaceId, ...ids) as { node_id: number; cnt: number }[])
      : [];
  const reinforcementById = new Map(reinforcementRows.map((r) => [r.node_id, r.cnt]));

  const supersededStatus = new Map<number, "outdated" | "contradicted">();
  for (const e of context.timeline ?? []) {
    if (e.status === "outdated" || e.status === "contradicted") supersededStatus.set(e.source.id, e.status);
  }
  const causallyConnected = new Set<number>(context.causallyConnectedIds ?? []);

  const topicNode = context.topic && context.topic.domain === "memory" && context.topic.kind === "node" ? nodesRepo.getById(context.topic.id) : undefined;
  const topicEmbedding = topicNode ? getEmbedding(handle.sqlite, topicNode.id) : undefined;

  const nowMs = now.getTime();

  return memoryRefs
    .filter((ref) => nodeById.has(ref.id))
    .map((ref): RelevanceResult => {
      const node = nodeById.get(ref.id)!;
      const reasons: string[] = [];

      const durable = isDurable(node.kind);
      reasons.push(durable ? "durable knowledge — relevant regardless of age" : "not a durable cognitive kind");

      const superseded = supersededStatus.get(node.id);
      if (superseded) reasons.push(`superseded (${superseded}) per the reconstructed timeline`);

      const causal = causallyConnected.has(node.id);
      if (causal) reasons.push("causally connected to a current change");

      const reinforcementCount = reinforcementById.get(node.id) ?? 0;
      const reinforced = reinforcementCount >= REINFORCEMENT_MIN;
      if (reinforced) reasons.push(`reinforced by ${reinforcementCount} connected insights`);

      let similarity: number | null = null;
      if (topicEmbedding) {
        const emb = getEmbedding(handle.sqlite, node.id);
        if (emb) {
          similarity = dot(emb, topicEmbedding);
          reasons.push(`topic similarity ${similarity.toFixed(2)}`);
        }
      }

      const days = daysSince(node.lastTendedAt ?? node.createdAt, nowMs) ?? 0;
      const cooled = entropyFrom(days, 0) >= COOLING_ENTROPY;
      if (cooled) reasons.push("cooled — not recently tended");

      let tier: RelevanceTier;
      if (durable) {
        tier = "high";
      } else if (superseded && !causal) {
        tier = "low";
      } else if (similarity != null && similarity >= HIGH_SIMILARITY) {
        tier = "high";
      } else if (reinforced || causal) {
        tier = "moderate";
      } else if (similarity != null && similarity < LOW_SIMILARITY) {
        tier = "low";
      } else if (cooled) {
        tier = "low";
      } else {
        tier = "moderate";
      }

      return { ref: { domain: "memory", kind: "node", id: node.id, label: node.label }, tier, reasons };
    });
}
