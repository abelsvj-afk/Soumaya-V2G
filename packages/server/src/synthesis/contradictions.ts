import type { Insight, NodeRef } from "@brain/shared";
import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import { knn, getEmbedding } from "../db/vec.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { InsightsRepo } from "../repositories/insights.repo.js";
import type { LlmProvider } from "../llm/adapter.js";

/**
 * Contradiction detection (Research-Agent add-on #3). Where synthesis hunts for
 * *latent connections* (semantically near but graph-distant), this hunts for
 * *conflicts*: two memories about the SAME topic (high cosine) that pull in
 * opposite directions — a changed belief, a reversed goal, a shifting identity
 * statement. Candidates are same-topic pairs; the LLM (or offline heuristic) makes
 * the final call and writes a reconciliation hypothesis. Bounded + offline-safe.
 */
export interface ContradictionOptions {
  /** Cosine floor for two memories to count as "about the same topic". */
  threshold: number;
  /** Nearest neighbours to inspect per node. */
  k: number;
  /** Cap on candidate pairs per run (bounds LLM cost). */
  maxCandidates: number;
}

export const DEFAULT_CONTRADICTION: ContradictionOptions = {
  threshold: 0.86, // same-topic is a higher bar than "merely related"
  k: 6,
  maxCandidates: 10,
};

interface Pair {
  a: number;
  b: number;
  similarity: number;
}

const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/** Same-topic candidate pairs (high cosine), capped. Unlike synthesis we do NOT
 *  require graph distance — contradictions often sit on directly-linked memories. */
export function findContradictionCandidates(
  h: DbHandle,
  opts: ContradictionOptions = DEFAULT_CONTRADICTION,
  spaceId: string = DEFAULT_SPACE,
): Pair[] {
  const nodes = new NodesRepo(h, spaceId).all();
  const seen = new Set<string>();
  const out: Pair[] = [];

  for (const node of nodes) {
    const emb = getEmbedding(h.sqlite, node.id);
    if (!emb) continue;
    const hits = knn(h.sqlite, emb, opts.k + 1, spaceId).filter(
      (hit) => hit.nodeId !== node.id && hit.similarity >= opts.threshold,
    );
    for (const hit of hits) {
      const key = pairKey(node.id, hit.nodeId);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ a: node.id, b: hit.nodeId, similarity: hit.similarity });
      if (out.length >= opts.maxCandidates) return out;
    }
  }
  return out;
}

const refOf = (n: { id: number; label: string; type: NodeRef["type"] }): NodeRef => ({
  id: n.id,
  label: n.label,
  type: n.type,
});

/**
 * Scan same-topic pairs for contradictions and persist the confirmed ones as
 * `kind:"contradiction"` insights. Skips pairs that already carry a contradiction
 * insight. Returns the newly-created conflict insights (for the digest UI).
 */
export async function runContradictionScan(
  h: DbHandle,
  llm: LlmProvider,
  opts: ContradictionOptions = DEFAULT_CONTRADICTION,
  spaceId: string = DEFAULT_SPACE,
): Promise<Insight[]> {
  const nodesRepo = new NodesRepo(h, spaceId);
  const insightsRepo = new InsightsRepo(h, spaceId);
  const created: Insight[] = [];

  for (const c of findContradictionCandidates(h, opts, spaceId)) {
    if (insightsRepo.existsPair(c.a, c.b, "contradiction")) continue;
    const a = nodesRepo.getById(c.a);
    const b = nodesRepo.getById(c.b);
    if (!a || !b) continue;
    const verdict = await llm.detectContradiction(
      { label: a.label, content: a.content },
      { label: b.label, content: b.content },
      c.similarity,
    );
    if (!verdict.conflict) continue;
    const row = insightsRepo.create(c.a, c.b, verdict.text, verdict.score, "contradiction");
    created.push({
      id: row.id,
      text: verdict.text,
      score: verdict.score,
      createdAt: row.createdAt,
      kind: "contradiction",
      nodes: [refOf(a), refOf(b)],
    });
  }
  return created;
}
