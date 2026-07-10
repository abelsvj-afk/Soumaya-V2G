import type { AppContext } from "../../context.js";
import type { ToolContext, ToolResult } from "./types.js";
import { TOOLS } from "./registry.js";

/**
 * The tool-router (docs/SOUMAYA_TOOLS.md). Each run, it lets every allowed tool
 * DETECT opportunities (deterministic, offline-safe) and executes them, logging each
 * action to `agent_logs` so there's an in-app record regardless of delivery channel.
 *
 * This is the offline spine. The LLM function-calling layer (when Research Mode +
 * budget + a key are present) will later CHOOSE invocations from a state briefing
 * instead of running every detector — it slots in right here without touching tools.
 */

const PER_TOOL_CAP = 8; // safety bound on how much one tool can do per tick

export interface RouterOptions {
  /** Deliver a message to the user (Telegram if linked). Defaults to a no-op. */
  notify?: (spaceId: string, text: string) => Promise<void>;
  /** Injected clock for tests. */
  now?: number;
}

function logAction(ctx: AppContext, spaceId: string, tool: string, reason: string, summary: string, now: number): void {
  try {
    // Stamp with the tick's clock so per-day tool guards (which compare against `now`)
    // stay consistent with the log — and so tests with an injected clock behave.
    ctx.handle.sqlite
      .prepare(`INSERT INTO agent_logs (space_id, action, description, targets, created_at) VALUES (?, ?, ?, '[]', ?)`)
      .run(spaceId, `tool:${tool}`, `${summary} — ${reason}`, new Date(now).toISOString());
  } catch {
    /* best-effort logging */
  }
}

/** Run the router for one space. Returns the results of every tool action taken. */
export async function runToolRouter(ctx: AppContext, spaceId: string, opts: RouterOptions = {}): Promise<ToolResult[]> {
  const now = opts.now ?? Date.now();
  const tc: ToolContext = {
    ctx,
    spaceId,
    now,
    notify: async (text: string) => {
      if (opts.notify) await opts.notify(spaceId, text);
    },
  };

  const results: ToolResult[] = [];
  for (const tool of TOOLS) {
    if (tool.guard && !tool.guard(tc)) continue;
    let invocations;
    try {
      invocations = tool.detect(tc).slice(0, PER_TOOL_CAP);
    } catch (e) {
      console.error(`[tools] ${tool.name} detect failed:`, e);
      continue;
    }
    for (const inv of invocations) {
      try {
        const r = await tool.run(tc, inv.args);
        logAction(ctx, spaceId, tool.name, inv.reason, r.summary, now);
        results.push(r);
      } catch (e) {
        console.error(`[tools] ${tool.name} run failed:`, e);
      }
    }
  }
  return results;
}
