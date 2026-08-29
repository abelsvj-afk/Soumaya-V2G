import type { Tool, ToolContext, ToolInvocation, ToolResult } from "./types.js";

/**
 * Proactive check-ins (SOUMAYA_TOOLS.md tool #3). Beyond the once-a-day digest, she
 * reaches out WHEN something happens — a heavy emotional stretch, or two memories that
 * pull against each other (an unaddressed contradiction). Gentle + rate-limited: at
 * most one check-in per space per day. Deterministic + offline.
 */

const HEAVY_WINDOW_MS = 1000 * 60 * 60 * 24 * 5; // look back 5 days
const HEAVY_MIN_COUNT = 3; // need a few heavy notes, not one bad moment
const HEAVY_MEAN = -0.3; // mean emotional weight below this reads as a hard stretch

function toMs(iso: string): number {
  const s = iso.includes("T") ? iso : iso.replace(" ", "T");
  const z = s.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(s) ? s : s + "Z";
  const t = Date.parse(z);
  return Number.isNaN(t) ? 0 : t;
}

export const checkinTool: Tool = {
  name: "check_in",
  description:
    "Reach out to the user when a signal warrants it — a heavy emotional stretch, or an unaddressed contradiction between two memories. At most one per day.",
  parameters: {
    type: "object",
    properties: { kind: { type: "string", enum: ["heavy", "contradiction"] }, text: { type: "string" } },
    required: ["kind", "text"],
  },

  detect(tc: ToolContext): ToolInvocation[] {
    const today = new Date(tc.now).toISOString().slice(0, 10);
    const didToday = tc.ctx.handle.sqlite
      .prepare(`SELECT 1 FROM agent_logs WHERE space_id = ? AND action = 'tool:check_in' AND substr(created_at,1,10) = ?`)
      .get(tc.spaceId, today);
    if (didToday) return [];

    // Signal 1: a heavy emotional stretch across recent memories.
    const recent = tc.ctx.handle.sqlite
      .prepare(
        `SELECT emotional_weight AS w, created_at FROM nodes
         WHERE space_id = ? AND deleted_at IS NULL AND (kind IS NULL OR kind = 'memory') AND emotional_weight IS NOT NULL`,
      )
      .all(tc.spaceId) as { w: number; created_at: string }[];
    const window = recent.filter((r) => toMs(r.created_at) >= tc.now - HEAVY_WINDOW_MS);
    if (window.length >= HEAVY_MIN_COUNT) {
      const mean = window.reduce((a, r) => a + (r.w ?? 0), 0) / window.length;
      if (mean <= HEAVY_MEAN) {
        return [{ tool: "check_in", args: { kind: "heavy", text: "" }, reason: `mean emotional weight ${mean.toFixed(2)} over ${window.length} recent memories` }];
      }
    }

    // Signal 2: an unaddressed contradiction (most significant recent one).
    const contradiction = tc.ctx.handle.sqlite
      .prepare(`SELECT text FROM insights WHERE space_id = ? AND kind = 'contradiction' ORDER BY score DESC, id DESC LIMIT 1`)
      .get(tc.spaceId) as { text: string } | undefined;
    if (contradiction?.text) {
      return [{ tool: "check_in", args: { kind: "contradiction", text: contradiction.text }, reason: "an unresolved contradiction between two memories" }];
    }
    return [];
  },

  async run(tc: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const kind = String(args.kind);
    const text = String(args.text ?? "");
    const msg =
      kind === "heavy"
        ? "💙 The last little while looks like it's been heavy. I'm here whenever you want to talk it through — no pressure."
        : `🌀 Two of your memories seem to pull against each other: ${text} Want to reconcile them together?`;
    let delivered = false;
    try {
      await tc.notify(msg);
      delivered = true;
    } catch {
      /* router logs it regardless */
    }
    return { ok: true, summary: `checked in (${kind})`, delivered, message: msg };
  },
};
