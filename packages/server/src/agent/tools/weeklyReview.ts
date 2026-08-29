import type { Tool, ToolContext, ToolInvocation, ToolResult } from "./types.js";
import { getGroundedInsight } from "../../identity.js";

/**
 * Weekly review (SOUMAYA_TOOLS.md tool #7). Once a week Soumaya looks back over the
 * past seven days and composes a short, warm reflection — how many moments you logged,
 * the mood that ran through them, and the one that stands out — then delivers it
 * (Telegram + the in-app activity log). Heuristic + offline by default; when a cloud
 * LLM is present she phrases it in her own voice. Gentle + rate-limited: one per week.
 */

const WEEK_MS = 1000 * 60 * 60 * 24 * 7;
const MIN_MEMORIES = 3; // don't reflect on a near-empty week

function toMs(iso: string): number {
  const s = iso.includes("T") ? iso : iso.replace(" ", "T");
  const z = s.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(s) ? s : s + "Z";
  const t = Date.parse(z);
  return Number.isNaN(t) ? 0 : t;
}

interface WeekMem {
  label: string;
  content: string;
  w: number | null;
  importance: number | null;
}

function weekMemories(tc: ToolContext): WeekMem[] {
  const rows = tc.ctx.handle.sqlite
    .prepare(
      `SELECT label, content, emotional_weight AS w, importance, created_at FROM nodes
       WHERE space_id = ? AND deleted_at IS NULL AND (kind IS NULL OR kind = 'memory')`,
    )
    .all(tc.spaceId) as (WeekMem & { created_at: string })[];
  return rows.filter((r) => toMs(r.created_at) >= tc.now - WEEK_MS);
}

/** A gentle mood word from the week's mean emotional charge + its spread. */
function moodPhrase(mems: WeekMem[]): string {
  const ws = mems.map((m) => m.w ?? 0);
  const mean = ws.reduce((a, b) => a + b, 0) / (ws.length || 1);
  const hasHigh = ws.some((w) => w > 0.25);
  const hasLow = ws.some((w) => w < -0.25);
  if (hasHigh && hasLow) return "It held both light and weight — a full, mixed week";
  if (mean > 0.2) return "It read bright — more lift than weight";
  if (mean < -0.2) return "It leaned heavy — you carried a lot";
  return "It felt fairly steady";
}

/** Build the reflection deterministically (always available, offline-safe). */
function heuristicDigest(mems: WeekMem[]): string {
  const n = mems.length;
  const highlight = [...mems].sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))[0];
  const mood = moodPhrase(mems);
  const stand = highlight ? ` The one that stands out to me: "${highlight.label}".` : "";
  return `🗓️ Looking back on your week — ${n} moment${n === 1 ? "" : "s"} you trusted me with. ${mood}.${stand} Anything here you want to carry into the next few days?`;
}

export const weeklyReviewTool: Tool = {
  name: "weekly_review",
  description:
    "Once a week, compose a short reflective digest of the past 7 days (count, mood, a standout memory) and deliver it. At most one per week.",
  parameters: { type: "object", properties: {}, required: [] },

  detect(tc: ToolContext): ToolInvocation[] {
    // Rate-limit: at most one weekly review in any rolling 7-day window.
    const last = tc.ctx.handle.sqlite
      .prepare(
        `SELECT created_at FROM agent_logs WHERE space_id = ? AND action = 'tool:weekly_review' ORDER BY id DESC LIMIT 1`,
      )
      .get(tc.spaceId) as { created_at: string } | undefined;
    if (last && toMs(last.created_at) >= tc.now - WEEK_MS) return [];

    const mems = weekMemories(tc);
    if (mems.length < MIN_MEMORIES) return [];
    return [{ tool: "weekly_review", args: {}, reason: `${mems.length} memories in the past week` }];
  },

  async run(tc: ToolContext, _args: Record<string, unknown>): Promise<ToolResult> {
    const mems = weekMemories(tc);
    if (mems.length === 0) return { ok: false, summary: "nothing to review this week" };

    let digest = heuristicDigest(mems);
    // LLM voice when a cloud provider is present — but the heuristic is the guaranteed
    // fallback on any error, so this never blocks or breaks the offline path.
    if (tc.ctx.llm.available) {
      try {
        // Cap the prompt to the week's most significant moments so a heavy week can't
        // balloon the token cost (the digest reads best from the highlights anyway).
        const forVoice = [...mems]
          .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))
          .slice(0, 12)
          .map((m) => ({ label: m.label, content: m.content }));
        // Honor the chat's grounded-insight toggle here too: when ON, keep the voiced
        // reflection tied to these real moments + open to correction (no vague flattery).
        const actions = ["weekly reflection over the past 7 days"];
        if (getGroundedInsight(tc.ctx.handle.sqlite, tc.spaceId)) {
          actions.push(
            "Keep it specific and grounded in these actual moments; invite me to correct anything that's off; no vague, could-apply-to-anyone flattery.",
          );
        }
        const voiced = await tc.ctx.llm.generateDailyLog(forVoice, actions);
        if (voiced && voiced.trim().length > 0) digest = `🗓️ ${voiced.trim()}`;
      } catch {
        /* keep the heuristic digest */
      }
    }

    let delivered = false;
    try {
      await tc.notify(digest);
      delivered = true;
    } catch {
      /* the router still logs the digest in-app regardless of Telegram */
    }
    // The full digest rides in `message` (logged verbatim, no "— reason" suffix) so it
    // lands in agent_logs (the in-app activity record / Night Replay) exactly as sent,
    // delivering it in-app as well as via Telegram.
    return { ok: true, summary: digest, delivered, message: digest };
  },
};
