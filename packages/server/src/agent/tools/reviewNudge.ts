import type { Tool, ToolContext, ToolInvocation, ToolResult } from "./types.js";
import { dueForReview, snoozeReview } from "../../analysis/review.js";

/**
 * Review-nudge (NEURO_ALIGNMENT.md #1) — the active-recall arm of spaced repetition.
 * When a memory's strength has decayed to its review point, Soumaya asks you to RECALL
 * it in her own voice (retrieval practice beats re-reading). Gentle: at most one nudge
 * per space per day, most significant + weakest first. Grading happens via /api/review.
 */

export const reviewNudgeTool: Tool = {
  name: "review_nudge",
  description:
    "When a memory has decayed to its spaced-repetition review point, prompt the user to actively recall it (retrieval practice). At most one per day.",
  parameters: { type: "object", properties: { nodeId: { type: "number" } }, required: ["nodeId"] },

  detect(tc: ToolContext): ToolInvocation[] {
    const today = new Date(tc.now).toISOString().slice(0, 10);
    const didToday = tc.ctx.handle.sqlite
      .prepare(`SELECT 1 FROM agent_logs WHERE space_id = ? AND action = 'tool:review_nudge' AND substr(created_at,1,10) = ?`)
      .get(tc.spaceId, today);
    if (didToday) return [];
    const due = dueForReview(tc.ctx, tc.spaceId, tc.now, 1);
    if (due.length === 0) return [];
    const m = due[0]!;
    return [{ tool: "review_nudge", args: { nodeId: m.id }, reason: `"${m.label}" is due for recall` }];
  },

  async run(tc: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const nodeId = Number(args.nodeId);
    const row = tc.ctx.handle.sqlite
      .prepare(`SELECT label FROM nodes WHERE id = ? AND space_id = ? AND deleted_at IS NULL`)
      .get(nodeId, tc.spaceId) as { label: string } | undefined;
    if (!row) return { ok: false, summary: `review target ${nodeId} gone` };

    // Snooze so an un-graded nudge doesn't re-ask tomorrow (grading via /api/review resets it).
    snoozeReview(tc.ctx, tc.spaceId, nodeId, tc.now);

    let delivered = false;
    try {
      await tc.notify(`🧠 Do you still remember what you noted about "${row.label}"? Take a moment to recall it — then open it to refresh.`);
      delivered = true;
    } catch {
      /* router logs it regardless */
    }
    return { ok: true, summary: `nudged recall of "${row.label}"`, delivered };
  },
};
