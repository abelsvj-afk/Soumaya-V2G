import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";

export interface VisitEvent {
  nodeId: number;
  type: string;
}

export interface VisitedMemory {
  nodeId: number;
  label: string;
  type: string; // memory's NodeType
  visits: number;
  visitorTypes: string[];
  lastAt: string;
}

/**
 * Aggregated visitor activity per memory (which craft visited what, how often,
 * last seen). Space-scoped. Counts are upserted so the table stays bounded.
 */
export class VisitorsRepo {
  constructor(
    private readonly h: DbHandle,
    private readonly spaceId: string = DEFAULT_SPACE,
  ) {}

  /** Record a batch of visits (one increment each). */
  record(events: VisitEvent[]): void {
    if (events.length === 0) return;
    const stmt = this.h.sqlite.prepare(
      `INSERT INTO visitor_stats (space_id, node_id, visitor_type, visits, last_at)
       VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
       ON CONFLICT(space_id, node_id, visitor_type)
       DO UPDATE SET visits = visits + 1, last_at = CURRENT_TIMESTAMP`,
    );
    this.h.sqlite.transaction(() => {
      for (const e of events) {
        if (Number.isFinite(e.nodeId) && e.type) stmt.run(this.spaceId, e.nodeId, e.type);
      }
    })();
  }

  /** Most-visited living memories (joined with labels), newest-activity tie-break. */
  top(limit = 20): VisitedMemory[] {
    const rows = this.h.sqlite
      .prepare(
        `SELECT v.node_id AS nodeId, n.label AS label, n.type AS type,
                SUM(v.visits) AS visits, MAX(v.last_at) AS lastAt,
                GROUP_CONCAT(v.visitor_type) AS types
         FROM visitor_stats v
         JOIN nodes n ON n.id = v.node_id
         WHERE v.space_id = ? AND n.deleted_at IS NULL
         GROUP BY v.node_id
         ORDER BY visits DESC, lastAt DESC
         LIMIT ?`,
      )
      .all(this.spaceId, limit) as {
      nodeId: number;
      label: string;
      type: string;
      visits: number;
      lastAt: string;
      types: string;
    }[];
    return rows.map((r) => ({
      nodeId: r.nodeId,
      label: r.label,
      type: r.type,
      visits: r.visits,
      lastAt: r.lastAt,
      visitorTypes: [...new Set((r.types ?? "").split(",").filter(Boolean))],
    }));
  }
}
