import { type GraphData, type GraphNode, deriveMass, classify, entropyFrom } from "@brain/shared";
import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import { heuristicImportance } from "../llm/heuristic.js";
import type { EmbeddingProvider } from "../embeddings/adapter.js";
import { knn } from "../db/vec.js";
import { multiHopNeighbors } from "./traversal.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { EdgesRepo } from "../repositories/edges.repo.js";

export interface SearchHit extends GraphNode {
  similarity: number;
}

/**
 * Read-side graph queries. Designed for heavy dumping: the default view is
 * BOUNDED (never ships all N nodes), and deeper exploration pulls neighborhoods
 * on demand.
 */
export class GraphService {
  private readonly nodes: NodesRepo;
  private readonly edges: EdgesRepo;
  constructor(
    private readonly h: DbHandle,
    private readonly spaceId: string = DEFAULT_SPACE,
  ) {
    this.nodes = new NodesRepo(h, spaceId);
    this.edges = new EdgesRepo(h, spaceId);
  }

  /**
   * Attach celestial physics to nodes: global connection degree, derived mass,
   * a size hint (`val`), and a body class. Done on read so it always reflects
   * the current edge set without denormalizing into the nodes table.
   */
  private enrich(nodes: GraphNode[]): GraphNode[] {
    if (nodes.length === 0) return nodes;
    const ids = nodes.map((n) => n.id);
    const placeholders = ids.map(() => "?").join(",");
    const rows = this.h.sqlite
      .prepare(
        `SELECT node_id, COUNT(*) AS deg FROM (
           SELECT source AS node_id FROM edges
           UNION ALL
           SELECT target AS node_id FROM edges
         ) WHERE node_id IN (${placeholders})
         GROUP BY node_id`,
      )
      .all(...ids) as { node_id: number; deg: number }[];
    const degreeById = new Map(rows.map((r) => [r.node_id, r.deg]));

    // Reinforcement: how many latent insights each memory appears in. This is the
    // signal that "feeds" a memory's slow growth over time — the AI surfacing a
    // hidden connection makes the memory matter more. (node ids are space-unique
    // and insights are space-scoped, so this never crosses brains.)
    const insightRows = this.h.sqlite
      .prepare(
        `SELECT node_id, COUNT(*) AS cnt FROM (
           SELECT node_a AS node_id FROM insights WHERE space_id = ?
           UNION ALL
           SELECT node_b AS node_id FROM insights WHERE space_id = ?
         ) WHERE node_id IN (${placeholders})
         GROUP BY node_id`,
      )
      .all(this.spaceId, this.spaceId, ...ids) as { node_id: number; cnt: number }[];
    const insightById = new Map(insightRows.map((r) => [r.node_id, r.cnt]));

    const now = Date.now();
    const daysSince = (ts?: string): number => {
      const ms = Date.parse(ts?.includes("T") ? ts : `${(ts ?? "").replace(" ", "T")}Z`);
      return Number.isNaN(ms) ? 0 : Math.max(0, (now - ms) / 86_400_000);
    };
    return nodes.map((n) => {
      const degree = degreeById.get(n.id) ?? 0;
      const reinforcement = insightById.get(n.id) ?? 0;
      const ageDays = daysSince(n.createdAt);
      const mass = deriveMass({
        importance: n.importance,
        degree,
        emotionalWeight: n.emotionalWeight,
        ageDays,
        reinforcement,
      });
      // Entropy: days since last tended (fall back to creation), resisted by degree.
      // Action items and constellation hubs never "cool".
      const days = daysSince(n.lastTendedAt ?? n.createdAt);
      const entropy = n.kind === "action" || n.kind === "moc" ? 0 : entropyFrom(days, degree);
      // A constellation hub's degree IS its member count (every edge is a member).
      const memberCount = n.kind === "moc" ? degree : undefined;
      return { ...n, degree, mass, val: mass, celestial: classify(mass), entropy, memberCount };
    });
  }

  /** Whole graph — fine for small datasets, used as a fast path. */
  full(): GraphData {
    return { nodes: this.enrich(this.nodes.all()), links: this.edges.all() };
  }

  /**
   * Bounded overview: the `limit` highest-degree hubs (ties broken by recency),
   * plus all edges among them. Keeps the galaxy legible as the brain grows.
   */
  overview(limit = 300): GraphData {
    if (this.nodes.count() <= limit) return this.full();
    const rows = this.h.sqlite
      .prepare(
        `SELECT n.id AS id
         FROM nodes n
         LEFT JOIN (
           SELECT node_id, COUNT(*) AS deg FROM (
             SELECT source AS node_id FROM edges
             UNION ALL
             SELECT target AS node_id FROM edges
           ) GROUP BY node_id
         ) d ON d.node_id = n.id
         WHERE n.space_id = ? AND n.deleted_at IS NULL
         ORDER BY COALESCE(d.deg, 0) DESC, n.id DESC
         LIMIT ?`,
      )
      .all(this.spaceId, limit) as { id: number }[];
    const ids = rows.map((r) => r.id);
    return { nodes: this.enrich(this.nodes.byIds(ids)), links: this.edges.within(ids) };
  }

  /** Multi-hop neighborhood subgraph around a node (lazy expansion). */
  neighborhood(startId: number, depth = 2): GraphData {
    // Only traverse from a node this space actually owns (edges never cross
    // spaces, but this guards a forged start id from peeking elsewhere).
    if (!this.nodes.getById(startId)) return { nodes: [], links: [] };
    const hops = multiHopNeighbors(this.h.sqlite, startId, depth);
    const ids = Array.from(new Set([startId, ...hops.map((hp) => hp.nodeId)]));
    return { nodes: this.enrich(this.nodes.byIds(ids)), links: this.edges.within(ids) };
  }

  /** Semantic search: embed query -> KNN -> nodes with similarity scores. */
  async search(embeddings: EmbeddingProvider, query: string, k = 10): Promise<SearchHit[]> {
    const vec = await embeddings.embed(query);
    const hits = knn(this.h.sqlite, vec, k, this.spaceId);
    const byId = new Map(this.nodes.byIds(hits.map((hp) => hp.nodeId)).map((n) => [n.id, n]));
    return hits
      .map((hit) => {
        const node = byId.get(hit.nodeId);
        return node ? { ...node, similarity: hit.similarity } : undefined;
      })
      .filter((x): x is SearchHit => x !== undefined);
  }

  getNode(id: number): GraphNode | undefined {
    const n = this.nodes.getById(id);
    return n ? this.enrich([n])[0] : undefined;
  }

  /**
   * Set a node's importance manually (0..1), or pass null to recompute it
   * offline from the content via the heuristic ("reset to auto" — no API needed).
   * Returns the enriched node so the caller sees the new mass/celestial class.
   */
  setImportance(id: number, importance: number | null): GraphNode | undefined {
    let value = importance;
    if (value === null) {
      const existing = this.nodes.getById(id);
      if (!existing) return undefined;
      value = heuristicImportance(existing.content);
    }
    const updated = this.nodes.updateImportance(id, value);
    return updated ? this.enrich([updated])[0] : undefined;
  }

  /** Permanently delete a memory (node + embedding + edges + insights). */
  deleteNode(id: number): boolean {
    return this.nodes.delete(id);
  }
}
