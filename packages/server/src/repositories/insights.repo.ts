import { desc, eq } from "drizzle-orm";
import type { Insight, InsightKind, NodeRef } from "@brain/shared";
import type { DbHandle } from "../db/client.js";
import { insights, DEFAULT_SPACE, type InsightRow } from "../db/schema.js";
import { NodesRepo } from "./nodes.repo.js";

export class InsightsRepo {
  private readonly nodes: NodesRepo;
  constructor(
    private readonly h: DbHandle,
    private readonly spaceId: string = DEFAULT_SPACE,
  ) {
    this.nodes = new NodesRepo(h, spaceId);
  }

  create(
    nodeA: number,
    nodeB: number,
    text: string,
    score: number,
    kind: InsightKind = "synthesis",
  ): InsightRow {
    return this.h.db
      .insert(insights)
      .values({ spaceId: this.spaceId, nodeA, nodeB, text, score, kind })
      .returning()
      .get();
  }

  /** True if an insight already exists for this unordered pair (dedupe). When `kind`
   *  is given, scope the check to that kind so a connection and a contradiction can
   *  both exist for the same pair. */
  existsPair(a: number, b: number, kind?: InsightKind): boolean {
    const row = this.h.sqlite
      .prepare(
        `SELECT 1 FROM insights
         WHERE space_id = ? AND ((node_a = ? AND node_b = ?) OR (node_a = ? AND node_b = ?))
         ${kind ? "AND kind = ?" : ""} LIMIT 1`,
      )
      .get(...(kind ? [this.spaceId, a, b, b, a, kind] : [this.spaceId, a, b, b, a]));
    return row !== undefined;
  }

  /** Recent insights hydrated with their node references for display. */
  recent(limit = 30): Insight[] {
    const rows = this.h.db
      .select()
      .from(insights)
      .where(eq(insights.spaceId, this.spaceId))
      .orderBy(desc(insights.id))
      .limit(limit)
      .all();
    const ids = Array.from(new Set(rows.flatMap((r) => [r.nodeA, r.nodeB])));
    const refs = new Map<number, NodeRef>(
      this.nodes.byIds(ids).map((n) => [n.id, { id: n.id, label: n.label, type: n.type }]),
    );
    return rows.map((r) => ({
      id: r.id,
      text: r.text,
      score: r.score,
      createdAt: r.createdAt,
      kind: (r.kind as InsightKind) ?? "synthesis",
      nodes: [refs.get(r.nodeA), refs.get(r.nodeB)].filter((x): x is NodeRef => x !== undefined),
    }));
  }
}
