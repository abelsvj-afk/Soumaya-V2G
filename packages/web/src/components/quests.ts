import { COOLING_ENTROPY, type GraphNode } from "@brain/shared";

/**
 * Daily quests / tend list (gamification Wave 2). A few concrete, click-through
 * nudges derived live from the brain's state — "feed it today", "warm a cooling
 * memory", "reconnect a drifting one". Pure client-side + offline-safe; each quest
 * either resolves by doing the action (cooling/drifting shrink) or is a simple
 * done flag (fed today).
 */
export interface Quest {
  id: string;
  icon: string;
  text: string;
  done: boolean;
  /** Fly to this memory when tapped. */
  focusId?: number;
  /** Or trigger an app action instead of focusing a node. */
  action?: "capture" | "insights";
}

export function dailyQuests(memories: GraphNode[], fedToday: boolean): Quest[] {
  const quests: Quest[] = [
    {
      id: "log",
      icon: "✍️",
      text: fedToday ? "Fed your brain today" : "Log a memory today",
      done: fedToday,
      action: "capture",
    },
  ];

  const cooling = memories
    .filter((n) => (n.entropy ?? 0) >= COOLING_ENTROPY)
    .sort((a, b) => (b.entropy ?? 0) - (a.entropy ?? 0));
  if (cooling.length > 0) {
    quests.push({
      id: "warm",
      icon: "❄️",
      text: `Warm a cooling memory · ${cooling.length} drifting cold`,
      done: false,
      focusId: cooling[0]!.id,
    });
  }

  const drifting = memories.filter((n) => (n.degree ?? 0) === 0);
  if (drifting.length > 0) {
    quests.push({
      id: "connect",
      icon: "🪐",
      text: `Revisit a drifting memory · ${drifting.length} unlinked`,
      done: false,
      focusId: drifting[0]!.id,
    });
  }

  return quests.slice(0, 3);
}
