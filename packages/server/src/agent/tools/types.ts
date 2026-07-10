import type { AppContext } from "../../context.js";

/**
 * The tool-router seam (docs/SOUMAYA_TOOLS.md). Each Tool is something Soumaya can
 * call on her own. The router runs `detect()` (deterministic, offline-safe) to find
 * opportunities and `run()` to act; an LLM function-calling layer can later choose
 * invocations instead of running every detector. Every tool stays free + offline
 * unless it explicitly guards on Research Mode / budget / Fuel.
 */

/** What the tool needs to act + how it reaches the user. */
export interface ToolContext {
  ctx: AppContext;
  spaceId: string;
  /** "Now" in ms — injected so tests are deterministic. */
  now: number;
  /** Deliver a message to the user's real channel (Telegram today). Best-effort. */
  notify: (text: string) => Promise<void>;
}

/** One concrete call the router will execute: which tool, with what args, and why. */
export interface ToolInvocation {
  tool: string;
  args: Record<string, unknown>;
  /** Deterministic diagnosis — the signal that triggered it (explainable offline). */
  reason: string;
}

export interface ToolResult {
  ok: boolean;
  /** One line for agent_logs / the console. */
  summary: string;
  /** True if it reached the user's external channel (not just logged). */
  delivered?: boolean;
}

export interface Tool {
  name: string;
  /** For the future LLM router — a crisp description of when to use it. */
  description: string;
  /** JSON-schema-ish parameter shape (for function-calling later). */
  parameters: Record<string, unknown>;
  /** Is this tool allowed to run at all right now? (budget/fuel/Research Mode/rate-limit) */
  guard?: (tc: ToolContext) => boolean;
  /** Deterministic opportunity detection — proposes invocations without any LLM. */
  detect: (tc: ToolContext) => ToolInvocation[];
  /** Execute a single invocation. */
  run: (tc: ToolContext, args: Record<string, unknown>) => Promise<ToolResult>;
}
