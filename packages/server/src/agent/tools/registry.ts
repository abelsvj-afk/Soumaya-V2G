import type { Tool } from "./types.js";
import { reminderTool } from "./reminder.js";

/**
 * The tools Soumaya can call on her own (docs/SOUMAYA_TOOLS.md). Add new tools here;
 * the router picks them up automatically. Order is the deterministic execution order.
 */
export const TOOLS: Tool[] = [reminderTool];
