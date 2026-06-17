import { type ChatResponse, type NodeRef, toneFrom } from "@brain/shared";
import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import { knn } from "../db/vec.js";
import { multiHopNeighbors } from "../graph/traversal.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import type { EmbeddingProvider } from "../embeddings/adapter.js";
import type { LlmProvider } from "../llm/adapter.js";

export interface ChatOptions {
  /** Semantic seed nodes from KNN. */
  k: number;
  /** Hops to expand around each seed (the GraphRAG neighborhood step). */
  depth: number;
}

export const DEFAULT_CHAT: ChatOptions = { k: 6, depth: 1 };

/**
 * GraphRAG: embed the question -> KNN seeds -> expand neighborhoods via recursive
 * CTE -> assemble subgraph context -> LLM answers with node citations.
 */
export async function chat(
  h: DbHandle,
  deps: { embeddings: EmbeddingProvider; llm: LlmProvider },
  question: string,
  opts: ChatOptions = DEFAULT_CHAT,
  spaceId: string = DEFAULT_SPACE,
): Promise<ChatResponse> {
  const vec = await deps.embeddings.embed(question);
  const seeds = knn(h.sqlite, vec, opts.k, spaceId);

  const ids = new Set<number>();
  for (const s of seeds) {
    ids.add(s.nodeId);
    for (const hop of multiHopNeighbors(h.sqlite, s.nodeId, opts.depth)) ids.add(hop.nodeId);
  }

  const nodesRepo = new NodesRepo(h, spaceId);
  const ctxNodes = nodesRepo.byIds([...ids]);
  const context = ctxNodes.map((n) => ({
    id: n.id,
    label: n.label,
    type: n.type,
    content: n.content,
  }));

  const { answer, citations } = await deps.llm.answer(question, context);

  const refById = new Map<number, NodeRef>(
    ctxNodes.map((n) => [n.id, { id: n.id, label: n.label, type: n.type }]),
  );
  const validCitations = citations
    .map((id) => refById.get(id))
    .filter((x): x is NodeRef => x !== undefined);

  // Dramatization: the cited memories anchor *what this is about* (their averaged
  // emotional weight), her answer's wording captures *how she's phrasing it* —
  // blended into a delivery tone the client uses to keep her voice from going flat.
  const cited = ctxNodes.filter((n) => citations.includes(n.id));
  const weighted = (cited.length > 0 ? cited : ctxNodes).filter(
    (n) => typeof n.emotionalWeight === "number",
  );
  const avgEw =
    weighted.length > 0
      ? weighted.reduce((s, n) => s + (n.emotionalWeight ?? 0), 0) / weighted.length
      : undefined;
  const tone = toneFrom(answer, avgEw);

  return { answer, citations: validCitations, contextIds: [...ids], tone };
}
