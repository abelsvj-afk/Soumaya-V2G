import type { Tool, ToolContext, ToolInvocation, ToolResult } from "./types.js";

/**
 * Firing reminders — the first tool Soumaya calls on her own. `remind_at` used to be
 * stored and only shown passively; now she DELIVERS it at the time (Telegram if
 * linked, always logged), exactly once. Deterministic, free, offline.
 */

const MAX_PER_TICK = 5; // don't blast a backlog all at once
const GRACE_MS = 1000 * 60 * 60 * 24 * 3; // a reminder more than 3 days overdue is quietly retired, not spammed

interface DueRow {
  id: number;
  label: string;
  remind_at: string;
}

/** SQLite/ISO timestamp → ms (tolerant of "YYYY-MM-DD HH:MM:SS" and full ISO). */
function toMs(iso: string): number {
  const s = iso.includes("T") ? iso : iso.replace(" ", "T");
  const z = s.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(s) ? s : s + "Z";
  const t = Date.parse(z);
  return Number.isNaN(t) ? 0 : t;
}

export const reminderTool: Tool = {
  name: "fire_reminder",
  description:
    "Deliver a reminder to the user at the moment it comes due. Use for any memory that carries a future remind time that has now arrived.",
  parameters: {
    type: "object",
    properties: { nodeId: { type: "number", description: "The memory whose reminder is due" } },
    required: ["nodeId"],
  },

  detect(tc: ToolContext): ToolInvocation[] {
    const rows = tc.ctx.handle.sqlite
      .prepare(
        `SELECT id, label, remind_at FROM nodes
         WHERE space_id = ? AND deleted_at IS NULL
           AND remind_at IS NOT NULL AND reminder_fired_at IS NULL
           AND (kind IS NULL OR kind != 'life_vision')`,
      )
      .all(tc.spaceId) as DueRow[];
    return rows
      .filter((r) => {
        const at = toMs(r.remind_at);
        return at > 0 && at <= tc.now;
      })
      .sort((a, b) => toMs(a.remind_at) - toMs(b.remind_at))
      .slice(0, MAX_PER_TICK)
      .map((r) => ({ tool: "fire_reminder", args: { nodeId: r.id }, reason: `reminder for "${r.label}" came due` }));
  },

  async run(tc: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const nodeId = Number(args.nodeId);
    const s = tc.ctx.handle.sqlite;
    const row = s
      .prepare(`SELECT id, label, remind_at, reminder_fired_at FROM nodes WHERE id = ? AND space_id = ? AND deleted_at IS NULL`)
      .get(nodeId, tc.spaceId) as (DueRow & { reminder_fired_at: string | null }) | undefined;
    if (!row || row.reminder_fired_at) return { ok: false, summary: `reminder ${nodeId} already fired or gone` };

    const firedIso = new Date(tc.now).toISOString();
    // Mark fired FIRST so a delivery error can never cause a re-fire loop.
    s.prepare(`UPDATE nodes SET reminder_fired_at = ? WHERE id = ? AND space_id = ?`).run(firedIso, nodeId, tc.spaceId);

    // Too-stale reminders are retired silently (marked fired, not delivered) so a long
    // downtime doesn't dump a week of overdue pings on the user.
    const overdueMs = tc.now - toMs(row.remind_at);
    if (overdueMs > GRACE_MS) {
      return { ok: true, summary: `retired stale reminder "${row.label}" (${Math.round(overdueMs / 86_400_000)}d overdue)` };
    }

    const msg = `⏰ Reminder: "${row.label}"`;
    let delivered = false;
    try {
      await tc.notify(msg);
      delivered = true;
    } catch {
      /* logged below regardless; the in-app bar still surfaces it */
    }
    return { ok: true, summary: `fired reminder "${row.label}"`, delivered, message: msg };
  },
};
