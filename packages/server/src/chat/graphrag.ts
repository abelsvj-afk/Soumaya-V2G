import { type ChatResponse, type NodeRef, toneFrom } from "@brain/shared";
import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import { knn, knnDocs, knnProfiles } from "../db/vec.js";
import { multiHopNeighbors } from "../graph/traversal.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { InstructionProfilesRepo } from "../repositories/instructions.repo.js";
import { KnowledgeRepo, UserPersonaRepo } from "../repositories/knowledge.repo.js";
import type { EmbeddingProvider } from "../embeddings/adapter.js";
import type { LlmProvider } from "../llm/adapter.js";

export interface ChatOptions {
  /** Semantic seed nodes from KNN. */
  k: number;
  /** Hops to expand around each seed (the GraphRAG neighborhood step). */
  depth: number;
  /** Knowledge-document chunks to retrieve (AI Companion RAG). */
  kDocs: number;
}

export const DEFAULT_CHAT: ChatOptions = { k: 6, depth: 1, kDocs: 4 };

/** Min similarity for an 'auto' instruction profile to be intent-routed in. */
const AUTO_PROFILE_THRESHOLD = 0.35;

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

  // --- AI Companion layers (reuse the single question embedding `vec`) ---
  // Knowledge-document RAG.
  const knowledgeRepo = new KnowledgeRepo(h, spaceId);
  const docHits = knnDocs(h.sqlite, vec, opts.kDocs, spaceId);
  const chunks = knowledgeRepo.chunksByIds(docHits.map((d) => d.chunkId));
  const knowledge =
    chunks.length > 0 ? chunks.map((c) => `[${c.docName}] ${c.content}`).join("\n\n") : undefined;

  // Layer 2: blend active instruction profiles. 'always' profiles always apply;
  // 'auto' profiles are intent-routed by semantic similarity to the question.
  const active = new InstructionProfilesRepo(h, spaceId).listActive();
  let routedAuto = new Set<number>();
  if (active.some((p) => p.mode === "auto")) {
    routedAuto = new Set(
      knnProfiles(h.sqlite, vec, 3, spaceId)
        .filter((p) => p.similarity >= AUTO_PROFILE_THRESHOLD)
        .map((p) => p.profileId),
    );
  }
  const chosen = active.filter((p) => p.mode !== "auto" || routedAuto.has(p.id));
  const systemExtra =
    chosen.length > 0
      ? "ACTIVE CUSTOM INSTRUCTIONS (stacked, highest priority first — adopt these as your operating frame):\n" +
        chosen.map((p, i) => `${i + 1}. ${p.name}: ${p.body}`).join("\n\n")
      : undefined;

  // "About Me" awareness (she is aware of who you are, never becomes you).
  const persona = new UserPersonaRepo(h, spaceId).get() ?? undefined;

  const { answer, citations } = await deps.llm.answer(question, context, {
    systemExtra,
    persona,
    knowledge,
  });

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
