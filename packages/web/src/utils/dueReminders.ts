import type { GraphNode } from "@brain/shared";

/**
 * The "is this node's reminder due right now" predicate — previously implemented
 * independently in ActionsPanel.tsx and NotificationsBar.tsx (the exact "computed
 * twice and drifting" risk docs/OPTIMIZATION_ROADMAP.md Problem 2 warns about).
 * Naive SQLite timestamps ("YYYY-MM-DD HH:MM:SS", no zone) must be read as UTC —
 * same bug class already fixed for Timeline chapters and elsewhere this session.
 */
export function isReminderDue(n: Pick<GraphNode, "kind" | "remindAt">, nowMs: number = Date.now()): boolean {
  if (n.kind === "action" || !n.remindAt) return false;
  const iso = n.remindAt.includes("Z") || n.remindAt.includes("+") ? n.remindAt : n.remindAt.replace(" ", "T") + "Z";
  return Date.parse(iso) <= nowMs;
}
