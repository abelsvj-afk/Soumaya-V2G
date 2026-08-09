import type { GraphEdge, GraphNode } from "@brain/shared";
import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import type { EmbeddingProvider } from "../embeddings/adapter.js";
import type { LlmProvider } from "../llm/adapter.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { EdgesRepo } from "../repositories/edges.repo.js";
import { linkCognitiveAnchor } from "../analysis/cognitive.js";
import { suggestPeople } from "../analysis/people.js"; // This might not be quite right, I need to scan text for mentions of EXISTING people.

// Need to detect mentions of existing person entities
function getMentionedPeople(s: any, spaceId: string, text: string): string[] {
  const people = s
    .prepare(`SELECT label, aliases FROM nodes WHERE space_id = ? AND deleted_at IS NULL AND kind = 'person_entity'`)
    .all(spaceId) as { label: string; aliases: string | null }[];
    
  const mentioned: string[] = [];
  for (const p of people) {
    const tokens = [p.label.toLowerCase()];
    if (p.aliases) {
        try {
            tokens.push(...(JSON.parse(p.aliases) as string[]).map(a => a.toLowerCase()));
        } catch {}
    }
    
    if (tokens.some(t => text.toLowerCase().includes(t))) {
        mentioned.push(p.label);
    }
  }
  return mentioned;
}

export interface IngestResult {
  nodes: GraphNode[];
  /** Edges explicitly extracted by the LLM within this input. */
  extractedEdges: GraphEdge[];
  /** Edges auto-discovered against existing memory (associative linking). */
  associativeEdges: GraphEdge[];
  /** Proactive suggestions for tagging */
  suggestedTags?: string[];
}

export async function ingest(
  h: DbHandle,
  deps: IngestDeps,
  ctx: any,
  rawText: string,
  spaceId: string = DEFAULT_SPACE,
  meta?: IngestMeta,
): Promise<IngestResult> {
  const nodesRepo = new NodesRepo(h, spaceId);
  const edgesRepo = new EdgesRepo(h, spaceId);

  // 1. Extract typed nodes + edges, grounded in recent context.
  const context = nodesRepo.recent(deps.contextSize ?? 20).map((n) => ({
    id: n.id,
    label: n.label,
    type: n.type,
    content: n.content,
  }));
  const extraction = await deps.llm.extract(rawText, context);

  // Proactive Tagging
  const suggestedTags = getMentionedPeople(h.sqlite, spaceId, rawText);

  // 2 + 3. Embed each new node and store it (relational + vector).
  const contents = extraction.nodes.map((n) => n.content);
  const vectors = await deps.embeddings.embedBatch(contents);
  const createdNodes: GraphNode[] = [];
  const labelToId = new Map<string, number>();
  for (let i = 0; i < extraction.nodes.length; i++) {
    const n = extraction.nodes[i]!;
    // Stamp the user's event date / reminder / tags on each node from this dump.
    const node = nodesRepo.create(
      { ...n, occurredAt: meta?.occurredAt, remindAt: meta?.remindAt, tags: meta?.tags },
      vectors[i]!,
    );
    createdNodes.push(node);
    labelToId.set(n.label, node.id);
    
    // Immediate cognitive linking
    linkCognitiveAnchor(ctx, spaceId, node.id, node.label, vectors[i]!);
  }

  // 4a. Persist the edges the LLM extracted within this input (label -> id).
  const extractedEdges: GraphEdge[] = [];
  for (const e of extraction.edges) {
    const source = labelToId.get(e.sourceLabel);
    const target = labelToId.get(e.targetLabel);
    if (source === undefined || target === undefined || source === target) continue;
    if (edgesRepo.exists(source, target)) continue;
    extractedEdges.push(edgesRepo.create({ source, target, relationship: e.relationship }));
  }

  // 4b. Autonomous associative linking against existing memory.
  const associativeEdges: GraphEdge[] = [];
  for (let i = 0; i < createdNodes.length; i++) {
    const links = await associativeLink(
      h,
      { nodes: nodesRepo, edges: edgesRepo, llm: deps.llm },
      createdNodes[i]!,
      vectors[i]!,
      deps.linkOptions ?? DEFAULT_LINK_OPTIONS,
      spaceId,
    );
    associativeEdges.push(...links);
  }

  return { nodes: createdNodes, extractedEdges, associativeEdges, suggestedTags };
}
