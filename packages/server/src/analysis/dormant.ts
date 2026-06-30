import type { DormantItem, GraphNode } from "@brain/shared";
import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import { NodesRepo } from "../repositories/nodes.repo.js";

/**
 * Dormant / latent recovery (research-agent add-on #4). Surfaces skills, goals and
 * projects you once invested in (they mattered, and were active) but haven't touched
 * in a while — with a "why it faded" hypothesis and a reactivation nudge. Fully
 * heuristic + offline; reads `lastTendedAt`/`createdAt` (attention recency, since
 * viewing a memory tends it) so nothing here costs a token.
 */

/** Days of silence before a once-active skill/goal/project counts as dormant. */
export const DORMANT_DAYS = 30;
const MAX_ITEMS = 8;

const GOAL_SKILL_RE =
  /\b(learn|learning|practice|practis|skill|goal|project|build|building|start(ed|ing)?|study|studying|master|training|train|habit|routine|want to|plan to|working on|aspire|side project)\b/i;

/** A "skill/goal/project"-shaped memory by type or by language. */
function isPursuit(n: GraphNode): boolean {
  if (n.type === "project" || n.type === "decision" || n.type === "concept") return true;
  return GOAL_SKILL_RE.test(n.content) || GOAL_SKILL_RE.test(n.label);
}

const daysBetween = (fromIso: string, nowMs: number): number => {
  const t = Date.parse(fromIso);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((nowMs - t) / 86_400_000));
};

function hypothesisFor(n: GraphNode, days: number): string {
  if ((n.emotionalWeight ?? 0) <= -0.4) {
    return `It carried a heavy feeling and then went quiet ${days} days ago — it may have stalled after a setback.`;
  }
  if ((n.importance ?? 0) >= 0.7) {
    return `It clearly mattered, yet nothing has referenced it in ${days} days — you likely moved on before closing it out.`;
  }
  return `Nothing has touched it in ${days} days — it quietly slipped off your radar.`;
}

export function buildDormantList(
  h: DbHandle,
  spaceId: string = DEFAULT_SPACE,
  nowMs: number = Date.now(),
): DormantItem[] {
  const nodes = new NodesRepo(h, spaceId).all();

  const items: (DormantItem & { rank: number })[] = [];
  for (const n of nodes) {
    if (n.kind === "action" || n.kind === "moc") continue;
    if ((n.importance ?? 0) < 0.45) continue; // it has to have mattered once
    if (!isPursuit(n)) continue;
    if (n.content.includes("--- Research Deep Dive ---")) continue; // already revisited

    const last = n.lastTendedAt ?? n.occurredAt ?? n.createdAt;
    const dormantDays = daysBetween(last, nowMs);
    if (dormantDays < DORMANT_DAYS) continue;

    items.push({
      nodeId: n.id,
      label: n.label,
      type: n.type,
      dormantDays,
      hypothesis: hypothesisFor(n, dormantDays),
      prompt: `Revive "${n.label}"? A quick revisit (or a fresh note) brings it back to life.`,
      // Most significant + most-faded first.
      rank: (n.importance ?? 0.5) * dormantDays,
    });
  }

  return items
    .sort((a, b) => b.rank - a.rank)
    .slice(0, MAX_ITEMS)
    .map(({ rank: _rank, ...item }) => item);
}
