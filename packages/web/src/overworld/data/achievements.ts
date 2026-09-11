import type { Fuel, GraphData, GraphNode, Streak } from "@brain/shared";
import { ACHIEVEMENTS, achvKey, loadUnlocked, unlockedIds, type Achievement } from "../../components/achievements.js";
import { getSpaceId } from "../../api/http.js";

/**
 * Progress (Gym) parity note: achievement UNLOCKING today only happens inside an App.tsx
 * effect (App.tsx ~line 817) that diffs `unlockedIds(ctx)` against the persisted
 * `brain.achv.<spaceId>` set on every graph/fuel/streak refresh. That effect never runs
 * while the Overworld is mounted (App.tsx isn't mounted at all), so without this, real
 * feats achieved during Overworld play would silently never earn their badge. This ports
 * the exact same diff-and-persist logic (same localStorage key, so switching between the
 * galaxy and the Overworld shares one earned set) — it deliberately skips App.tsx's toast
 * announcement (no toast system exists yet here); a freshly-earned badge just shows as
 * "NEW" next time the Gym is opened.
 */
export function syncAchievements(graph: GraphData, fuel: Fuel | null, streak: Streak | null): string[] {
  const spaceId = getSpaceId();
  if (!spaceId) return [];

  const memories: GraphNode[] = graph.nodes.filter((n) => n.kind !== "action");
  const linksCount = graph.links.length;

  try {
    const tk = `stat.types_seen.${spaceId}`;
    const seenTypes = new Set<string>(JSON.parse(localStorage.getItem(tk) || "[]"));
    let changed = false;
    for (const m of memories) {
      if (m.type && !seenTypes.has(m.type)) {
        seenTypes.add(m.type);
        changed = true;
      }
    }
    if (changed) localStorage.setItem(tk, JSON.stringify([...seenTypes]));
  } catch {
    /* storage unavailable */
  }

  const now = unlockedIds({ memories, links: linksCount, fuel, linkObjects: graph.links, streak });
  const key = achvKey(spaceId);
  const seen = loadUnlocked(spaceId);
  const fresh = now.filter((id) => !seen.has(id));
  if (fresh.length === 0) return [];
  try {
    localStorage.setItem(key, JSON.stringify([...seen, ...fresh]));
  } catch {
    /* ignore */
  }
  return fresh;
}

export interface AchievementView {
  achievement: Achievement;
  unlocked: boolean;
  progress?: { cur: number; target: number };
}

/** For the Gym overlay: every achievement, marked earned/locked from the persisted set. */
export function listAchievements(graph: GraphData, fuel: Fuel | null, streak: Streak | null): AchievementView[] {
  const spaceId = getSpaceId();
  const unlocked = spaceId ? loadUnlocked(spaceId) : new Set<string>();
  const memories: GraphNode[] = graph.nodes.filter((n) => n.kind !== "action");
  const ctx = { memories, links: graph.links.length, fuel, linkObjects: graph.links, streak };
  return ACHIEVEMENTS.map((achievement) => ({
    achievement,
    unlocked: unlocked.has(achievement.id),
    progress: achievement.progress?.(ctx),
  }));
}
