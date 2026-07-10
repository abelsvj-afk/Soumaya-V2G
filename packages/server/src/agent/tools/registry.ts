import type { Tool } from "./types.js";
import { reminderTool } from "./reminder.js";
import { taskCreatorTool } from "./taskCreator.js";
import { orphanTool } from "./orphan.js";
import { reviewNudgeTool } from "./reviewNudge.js";
import { checkinTool } from "./checkin.js";
import { webLookupTool } from "./webLookup.js";

/**
 * The tools Soumaya can call on her own (docs/SOUMAYA_TOOLS.md). Add new tools here;
 * the router picks them up automatically. Order is the deterministic execution order.
 */
export const TOOLS: Tool[] = [reminderTool, taskCreatorTool, orphanTool, reviewNudgeTool, checkinTool, webLookupTool];
