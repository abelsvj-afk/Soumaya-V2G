import { desc, eq, inArray } from "drizzle-orm";
import type { GraphNode, NodeType } from "@brain/shared";
import type { DbHandle } from "../db/client.js";
import { nodes, type NodeRow } from "../db/schema.js";
import { upsertEmbedding, deleteEmbedding } from "../db/vec.js";

export interface NewNode {
  label: string;
  type: NodeType;
  content: string;
  emotionalWeight?: number;
  importance?: number;
}

function toGraphNode(row: NodeRow): GraphNode {
  return {
    id: row.id,
    label: row.label,
    type: row.type as NodeType,
    content: row.content,
    emotionalWeight: row.emotionalWeight ?? undefined,
    importance: row.importance ?? undefined,
    createdAt: row.createdAt,
  };
}

/**
 * Persistence for nodes + their embeddings. Kept behind this class so a libsql
 * swap (native vectors) only touches the repo + db/vec.ts, not callers.
 */
export class NodesRepo {
  constructor(private readonly h: DbHandle) {}

  /** Insert a node and (atomically) store its embedding. */
  create(input: NewNode, embedding: Float32Array): GraphNode {
    const tx = this.h.sqlite.transaction(() => {
      const row = this.h.db
        .insert(nodes)
        .values({
          label: input.label,
          type: input.type,
          content: input.content,
          emotionalWeight: input.emotionalWeight ?? null,
          importance: input.importance ?? null,
        })
        .returning()
        .get();
      upsertEmbedding(this.h.sqlite, row.id, embedding);
      return row;
    });
    return toGraphNode(tx());
  }

  getById(id: number): GraphNode | undefined {
    const row = this.h.db.select().from(nodes).where(eq(nodes.id, id)).get();
    return row ? toGraphNode(row) : undefined;
  }

  /** Manually override (or, with null, clear) a node's importance weight. */
  updateImportance(id: number, importance: number | null): GraphNode | undefined {
    const row = this.h.db
      .update(nodes)
      .set({ importance })
      .where(eq(nodes.id, id))
      .returning()
      .get();
    return row ? toGraphNode(row) : undefined;
  }

  /** Delete a node, its embedding, and every edge touching it. Returns true if removed. */
  delete(id: number): boolean {
    const tx = this.h.sqlite.transaction(() => {
      this.h.sqlite.prepare(`DELETE FROM edges WHERE source = ? OR target = ?`).run(id, id);
      this.h.sqlite.prepare(`DELETE FROM insights WHERE node_a = ? OR node_b = ?`).run(id, id);
      deleteEmbedding(this.h.sqlite, id);
      const info = this.h.sqlite.prepare(`DELETE FROM nodes WHERE id = ?`).run(id);
      return info.changes > 0;
    });
    return tx();
  }

  findByLabel(label: string): GraphNode | undefined {
    const row = this.h.db.select().from(nodes).where(eq(nodes.label, label)).get();
    return row ? toGraphNode(row) : undefined;
  }

  /** Most recent nodes, for grounding LLM extraction context. */
  recent(limit = 20): GraphNode[] {
    return this.h.db
      .select()
      .from(nodes)
      .orderBy(desc(nodes.id))
      .limit(limit)
      .all()
      .map(toGraphNode);
  }

  all(): GraphNode[] {
    return this.h.db.select().from(nodes).all().map(toGraphNode);
  }

  byIds(ids: number[]): GraphNode[] {
    if (ids.length === 0) return [];
    return this.h.db.select().from(nodes).where(inArray(nodes.id, ids)).all().map(toGraphNode);
  }

  count(): number {
    const r = this.h.sqlite.prepare(`SELECT COUNT(*) AS c FROM nodes`).get() as { c: number };
    return r.c;
  }
}
