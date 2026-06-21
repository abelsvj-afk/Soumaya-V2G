import type { GraphNode, Fuel } from "@brain/shared";

/**
 * Gamification Wave 2 — achievements. Pure client-side + offline-safe: each is a
 * predicate over the current galaxy/fuel state. Unlocks are detected in App,
 * persisted per-brain in localStorage, and announced with a toast. Qualitative
 * feats (not raw counts) so they don't double-fire with the count milestones.
 * The Awards tab (AchievementsPanel) renders the full set — unlocked + locked
 * with a progress hint — so there's a place to actually go and *see* them.
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
  /** Optional numeric progress toward the unlock, for the locked-card hint. */
  progress?: (c: AchievementCtx) => { cur: number; target: number };
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first_light",
    name: "First Light",
    icon: "🌱",
    desc: "Logged your first memory",
    test: (c) => c.memories.length >= 1,
    progress: (c) => ({ cur: Math.min(c.memories.length, 1), target: 1 }),
  },
  {
    id: "synapse",
    name: "Synapse",
    icon: "🔗",
    desc: "Your first connection formed",
    test: (c) => c.links >= 1,
    progress: (c) => ({ cur: Math.min(c.links, 1), target: 1 }),
  },
  {
    id: "connector",
    name: "Connector",
    icon: "🕸️",
    desc: "25 connections across your brain",
    test: (c) => c.links >= 25,
    progress: (c) => ({ cur: Math.min(c.links, 25), target: 25 }),
  },
  {
    id: "nexus",
    name: "Nexus",
    icon: "🧠",
    desc: "A memory grew to 8+ connections",
    test: (c) => c.memories.some((n) => (n.degree ?? 0) >= 8),
    progress: (c) => ({
      cur: Math.min(c.memories.reduce((m, n) => Math.max(m, n.degree ?? 0), 0), 8),
      target: 8,
    }),
  },
  {
    id: "star_born",
    name: "Star Born",
    icon: "⭐",
    desc: "A memory reached star class",
    test: (c) => c.memories.some((n) => n.celestial === "star" || n.celestial === "supergiant"),
  },
  {
    id: "star_center_figurine",
    name: "Solar Monument",
    icon: "🌟",
    desc: "Star in Center Figurine. Unlocked at 100 memories.",
    test: (c) => c.memories.length >= 100,
    progress: (c) => ({ cur: Math.min(c.memories.length, 100), target: 100 }),
  },
  {
    id: "organic_ship_skin",
    name: "Organic Specimen",
    icon: "🛸",
    desc: "Biomechanical Ship Skin. Unlocked at 150 memories.",
    test: (c) => c.memories.length >= 150,
    progress: (c) => ({ cur: Math.min(c.memories.length, 150), target: 150 }),
  },
  {
    id: "fleet_commander",
    name: "Fleet Commander",
    icon: "🚀",
    desc: "Achieved command tier. Unlocked at 200 memories.",
    test: (c) => c.memories.length >= 200,
    progress: (c) => ({ cur: Math.min(c.memories.length, 200), target: 200 }),
  },
  {
    id: "dyson_sphere_figurine",
    name: "Dyson Megastructure",
    icon: "🪐",
    desc: "Dyson Sphere Figurine. Unlocked at 250 memories.",
    test: (c) => c.memories.length >= 250,
    progress: (c) => ({ cur: Math.min(c.memories.length, 250), target: 250 }),
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
    progress: (c) =>
      c.fuel ? { cur: Math.round(c.fuel.fuel), target: c.fuel.capacity } : { cur: 0, target: 1 },
  },
];

/** Memory-count milestones (shared by the App toast + the Awards tracker). */
export const MEMORY_MILESTONES = [10, 25, 50, 100, 250, 365, 500, 1000];

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

/** localStorage key holding the set of achievement ids a brain has earned. */
export function achvKey(spaceId: string): string {
  return `brain.achv.${spaceId}`;
}

/** Read the persisted set of earned achievement ids for a brain. */
export function loadUnlocked(spaceId: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(achvKey(spaceId)) || "[]"));
  } catch {
    return new Set();
  }
}
