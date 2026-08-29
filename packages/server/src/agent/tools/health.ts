import type { DbHandle } from "../../db/client.js";
import { TOOLS } from "./registry.js";

export interface ToolHealth {
  tool: string;
  /** ISO timestamp of the tool's last logged run, or null if it's never fired. */
  lastRanAt: string | null;
}

/**
 * Last-fired timestamp for every registered autonomous tool, read straight from
 * `agent_logs` (one aggregate query, not one query per tool). Makes a silently-dormant
 * tool ("hasn't run in 3 days") a visible fact in the Soumaya tab's diagnostics box
 * instead of a surprise a user has to notice on their own
 * (docs/OPTIMIZATION_ROADMAP.md, Problem 2). Reads the roster from `TOOLS` itself so a
 * newly-added tool shows up here automatically, never needing a second list kept in sync.
 */
export function toolHealthSummary(handle: DbHandle, spaceId: string): ToolHealth[] {
  const rows = handle.sqlite
    .prepare(
      `SELECT action, MAX(created_at) AS lastAt FROM agent_logs
       WHERE space_id = ? AND action LIKE 'tool:%' GROUP BY action`,
    )
    .all(spaceId) as { action: string; lastAt: string }[];
  const byAction = new Map(rows.map((r) => [r.action, r.lastAt]));
  return TOOLS.map((t) => ({ tool: t.name, lastRanAt: byAction.get(`tool:${t.name}`) ?? null }));
}
