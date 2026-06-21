import type { GraphNode, Fuel } from "@brain/shared";

/**
 * Gamification Wave 2 — achievements. Pure client-side + offline-safe: each is a
 * predicate over the current galaxy/fuel state. Unlocks are detected in App,
 * persisted per-brain in localStorage, and announced with a toast. Qualitative
 * feats (not raw counts) so they don't double-fire with the count milestones.
 */
export interface AchievementCtx {
  memories: GraphNode[]; // non-action nodes
  links: number; // edge count
  fuel: Fuel | null;
}

export interface Achievement {
  id: string;
  name: string;
  icon: string;
  desc: string;
  test: (c: AchievementCtx) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first_light", name: "First Light", icon: "🌱", desc: "Logged your first memory", test: (c) => c.memories.length >= 1 },
  { id: "synapse", name: "Synapse", icon: "🔗", desc: "Your first connection formed", test: (c) => c.links >= 1 },
  { id: "connector", name: "Connector", icon: "🕸️", desc: "25 connections across your brain", test: (c) => c.links >= 25 },
  {
    id: "nexus",
    name: "Nexus",
    icon: "🧠",
    desc: "A memory grew to 8+ connections",
    test: (c) => c.memories.some((n) => (n.degree ?? 0) >= 8),
  },
  {
    id: "star_born",
    name: "Star Born",
    icon: "⭐",
    desc: "A memory reached star class",
    test: (c) => c.memories.some((n) => n.celestial === "star" || n.celestial === "supergiant"),
  },
  {
    id: "gardener",
    name: "Gardener",
    icon: "🌿",
    desc: "10+ memories and none gone cold",
    test: (c) => c.memories.length >= 10 && c.memories.every((n) => (n.entropy ?? 0) < 0.45),
  },
  {
    id: "full_tank",
    name: "Fully Fueled",
    icon: "⛽",
    desc: "Fuel topped out",
    test: (c) => !!c.fuel && c.fuel.fuel >= c.fuel.capacity,
  },
];

/** Return the ids of every achievement currently satisfied. */
export function unlockedIds(c: AchievementCtx): string[] {
  return ACHIEVEMENTS.filter((a) => {
    try {
      return a.test(c);
    } catch {
      return false;
    }
  }).map((a) => a.id);
}
