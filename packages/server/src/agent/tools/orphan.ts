import type { Tool, ToolContext, ToolInvocation, ToolResult } from "./types.js";

/**
 * Orphan-star surfacing (NEURO_ALIGNMENT.md #4). An unlinked memory is a star adrift —
 * the report says surface them so the user can integrate them. Gently: at most ONE
 * orphan nudged per space per day (guarded by today's own agent_logs entry, so no new
 * column), choosing the most significant long-drifting orphan. Deterministic + offline.
 */

const MIN_AGE_MS = 1000 * 60 * 60 * 24 * 2; // give a memory 2 days to auto-link before calling it an orphan

interface OrphanRow {
  id: number;
  label: string;
}

export const orphanTool: Tool = {
  name: "surface_orphan",
  description:
    "Surface a memory that has drifted with no connections, inviting the user to link it into the graph. At most one per day.",
  parameters: { type: "object", properties: { nodeId: { type: "number" } }, required: ["nodeId"] },

  detect(tc: ToolContext): ToolInvocation[] {
    const today = new Date(tc.now).toISOString().slice(0, 10);
    // Once per day: if we already surfaced an orphan today, hold off.
    const didToday = tc.ctx.handle.sqlite
      .prepare(`SELECT 1 FROM agent_logs WHERE space_id = ? AND action = 'tool:surface_orphan' AND substr(created_at,1,10) = ?`)
      .get(tc.spaceId, today);
    if (didToday) return [];

    const cutoff = new Date(tc.now - MIN_AGE_MS).toISOString();
    const row = tc.ctx.handle.sqlite
      .prepare(
        `SELECT n.id, n.label FROM nodes n
         WHERE n.space_id = ? AND n.deleted_at IS NULL AND (n.kind IS NULL OR n.kind = 'memory')
           AND n.created_at <= ?
           AND NOT EXISTS (SELECT 1 FROM edges e WHERE e.space_id = n.space_id AND (e.source = n.id OR e.target = n.id))
         ORDER BY COALESCE(n.importance, 0) DESC, n.created_at ASC
         LIMIT 1`,
      )
      .get(tc.spaceId, cutoff) as OrphanRow | undefined;
    if (!row) return [];
    return [{ tool: "surface_orphan", args: { nodeId: row.id }, reason: `"${row.label}" is drifting with no connections` }];
  },

  async run(tc: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const nodeId = Number(args.nodeId);
    const row = tc.ctx.handle.sqlite
      .prepare(`SELECT label FROM nodes WHERE id = ? AND space_id = ? AND deleted_at IS NULL`)
      .get(nodeId, tc.spaceId) as { label: string } | undefined;
    if (!row) return { ok: false, summary: `orphan ${nodeId} gone` };
    // Re-check it's still an orphan (a link may have formed since detect()).
    const linked = tc.ctx.handle.sqlite
      .prepare(`SELECT 1 FROM edges WHERE space_id = ? AND (source = ? OR target = ?)`)
      .get(tc.spaceId, nodeId, nodeId);
    if (linked) return { ok: false, summary: `"${row.label}" got linked; skipping` };

    let delivered = false;
    try {
      await tc.notify(`🌟 One memory is drifting unconnected: "${row.label}". Want to link it into your galaxy?`);
      delivered = true;
    } catch {
      /* router logs it regardless */
    }
    return { ok: true, summary: `surfaced orphan "${row.label}"`, delivered };
  },
};
