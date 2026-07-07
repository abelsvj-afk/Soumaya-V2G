import type { GraphNode, Fuel, Streak } from "@brain/shared";
import { buildCodex, codexProgress } from "./codex.js";

/** Codex completion % from an achievement context (the one meta-badge hook). */
function codexPctFrom(c: { memories: GraphNode[]; links: number }): number {
  const codex = buildCodex({
    memories: c.memories.filter((n) => n.kind !== "moc" && n.kind !== "action"),
    constellations: c.memories.filter((n) => n.kind === "moc"),
    links: c.links,
  });
  return codexProgress(codex).pct;
}

/**
 * Achievements = FEATS — things you actively did (kept deliberately disjoint from
 * the Codex, which covers discoveries: see a thing once → entry + lore + fuel).
 * No predicate may exist in both systems, and Pilot Rank is the single
 * memory-count ladder (rank-up is the only count celebration; the Hangar gates
 * its count-based cosmetics on raw counts directly).
 * Pure client-side + offline-safe: each is a predicate over the current
 * galaxy/fuel state. Unlocks are detected in App, persisted per-brain in
 * localStorage, and announced with a toast.
 */
export interface AchievementCtx {
  memories: GraphNode[]; // non-action nodes
  links: number; // edge count
  fuel: Fuel | null;
  linkObjects?: any[]; // full link array for pathfinding
  /** Server-side daily-tending streak (device-independent when available). */
  streak?: Streak | null;
}

/**
 * The active brain id used for per-brain localStorage stats. Mirrors api/client's
 * `brain.spaceId` (set synchronously at login, and the same id the writer in
 * Graph3D keys its `stat.*` counters by), so stat-based achievements always read
 * the bucket the stats were written to. Reading the effect-written `current_space_id`
 * instead caused a startup race + a "demo-space" fallback that never matched the
 * writer — so those achievements could never unlock from real play.
 */
export function statsSpaceId(): string {
  // "default" matches every other signed-out localStorage bucket (Toasts, Inbox,
  // RightDock) — a "legacy" fallback here filed stats in a bucket nothing read.
  try {
    return localStorage.getItem("brain.spaceId") || "default";
  } catch {
    return "default";
  }
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

/** Best-known distinct-day engagement: server streak first, created-days fallback. */
function consistentDays(c: AchievementCtx): number {
  const fromStreak = Math.max(c.streak?.best ?? 0, c.streak?.current ?? 0);
  if (fromStreak > 0) return fromStreak;
  return new Set(
    c.memories.map((m) => m.createdAt?.split("T")[0] || m.occurredAt?.split(" ")[0]).filter(Boolean),
  ).size;
}

export const ACHIEVEMENTS: Achievement[] = [
  // (First memory / first link / star class / 365 count / all-sectors all live in
  // the CODEX as discoveries now — they were double-rewarded here.)
  {
    id: "galaxy_reader",
    name: "Galaxy Reader",
    icon: "🗺️",
    desc: "Explored memories across 6+ types — you can read your galaxy at a glance.",
    test: () => {
      try {
        const seen = JSON.parse(localStorage.getItem(`stat.types_seen.${statsSpaceId()}`) || "[]");
        return Array.isArray(seen) && seen.length >= 6;
      } catch {
        return false;
      }
    },
    progress: () => {
      try {
        const seen = JSON.parse(localStorage.getItem(`stat.types_seen.${statsSpaceId()}`) || "[]");
        return { cur: Math.min(Array.isArray(seen) ? seen.length : 0, 6), target: 6 };
      } catch {
        return { cur: 0, target: 6 };
      }
    },
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
    // Renamed from "Gardener" — the Codex phenomenon "The Gardener" (tend 10
    // cooling memories) shared the name with a different rule.
    id: "gardener",
    name: "Keeper of the Flame",
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

  // === NEW GAMIFICATION WAVE 3 ACHIEVEMENTS ===
  {
    id: "pathfinder_quest",
    name: "Pathfinder Quest",
    icon: "🧭",
    desc: "Create a path of 5+ connected memories. Unlocks Aegis Shield Spire.",
    test: (c) => {
      if (!c.linkObjects || c.linkObjects.length < 4) return false;
      // Build adjacency list
      const adj = new Map<number, Set<number>>();
      for (const l of c.linkObjects) {
        const s = typeof l.source === "object" && l.source !== null ? l.source.id : l.source;
        const t = typeof l.target === "object" && l.target !== null ? l.target.id : l.target;
        if (s == null || t == null) continue;
        if (!adj.has(s)) adj.set(s, new Set());
        if (!adj.has(t)) adj.set(t, new Set());
        adj.get(s)!.add(t);
        adj.get(t)!.add(s);
      }
      
      const visited = new Set<number>();
      const dfs = (node: number, depth: number): number => {
        visited.add(node);
        let longest = depth;
        const neighbors = adj.get(node) || new Set();
        for (const n of neighbors) {
          if (!visited.has(n)) {
            longest = Math.max(longest, dfs(n, depth + 1));
          }
        }
        visited.delete(node);
        return longest;
      };
      
      for (const start of adj.keys()) {
        if (dfs(start, 1) >= 5) return true;
      }
      return false;
    }
  },
  {
    id: "consistent_pilot",
    name: "Consistent Pilot",
    icon: "📅",
    desc: "Keep a 3-day tending streak. Unlocks Hyperdrive Neon Trail.",
    // The server streak is the source of truth (device-independent); the
    // distinct-created-days set is the offline/legacy fallback.
    test: (c) => consistentDays(c) >= 3,
    progress: (c) => ({ cur: Math.min(consistentDays(c), 3), target: 3 }),
  },
  {
    id: "sector_pioneer",
    name: "Sector Pioneer",
    icon: "🌌",
    desc: "Catalog memories in 4+ distinct type categories. Unlocks Solar Gold Exhaust.",
    test: (c) => {
      const types = new Set(c.memories.map((m) => m.type).filter(Boolean));
      return types.size >= 4;
    },
    progress: (c) => {
      const types = new Set(c.memories.map((m) => m.type).filter(Boolean));
      return { cur: Math.min(types.size, 4), target: 4 };
    }
  },
  {
    id: "sentinel_command",
    name: "Sentinel Command",
    icon: "📡",
    desc: "Deploy 5+ Aura Beacons over cooling memories. Unlocks Holographic Sentinel Hull.",
    test: (c) => {
      // Checked via stats loaded from localStorage in App
      try {
        const spaceId = statsSpaceId();
        const val = parseInt(localStorage.getItem(`stat.beacons_deployed.${spaceId}`) || "0", 10);
        return val >= 5;
      } catch {
        return false;
      }
    },
    progress: (c) => {
      try {
        const spaceId = statsSpaceId();
        const val = parseInt(localStorage.getItem(`stat.beacons_deployed.${spaceId}`) || "0", 10);
        return { cur: Math.min(val, 5), target: 5 };
      } catch {
        return { cur: 0, target: 5 };
      }
    }
  },
  {
    // Renamed from "Deep Cluster" — the Codex phenomenon "Deep Cluster" (a memory
    // with 6+ connections) shared the name with a different rule.
    id: "deep_cluster",
    name: "Sector Dominion",
    icon: "🧲",
    desc: "Grow a single sector category to 6+ memories. Unlocks Quantum Singularity Core.",
    test: (c) => {
      const counts = new Map<string, number>();
      for (const m of c.memories) {
        const t = m.type || "unknown";
        counts.set(t, (counts.get(t) || 0) + 1);
      }
      return Array.from(counts.values()).some((v) => v >= 6);
    },
    progress: (c) => {
      const counts = new Map<string, number>();
      for (const m of c.memories) {
        const t = m.type || "unknown";
        counts.set(t, (counts.get(t) || 0) + 1);
      }
      const maxVal = Array.from(counts.values()).reduce((max, val) => Math.max(max, val), 0);
      return { cur: Math.min(maxVal, 6), target: 6 };
    }
  },
  {
    id: "cosmic_voyager",
    name: "Cosmic Voyager",
    icon: "💫",
    desc: "Soumaya completes 15+ travel hops on maintenance rounds. Unlocks Fusion Core Destroyer.",
    test: (c) => {
      try {
        const spaceId = statsSpaceId();
        const val = parseInt(localStorage.getItem(`stat.travel_hops.${spaceId}`) || "0", 10);
        return val >= 15;
      } catch {
        return false;
      }
    },
    progress: (c) => {
      try {
        const spaceId = statsSpaceId();
        const val = parseInt(localStorage.getItem(`stat.travel_hops.${spaceId}`) || "0", 10);
        return { cur: Math.min(val, 15), target: 15 };
      } catch {
        return { cur: 0, target: 15 };
      }
    }
  },
  {
    id: "galactic_megastructure",
    name: "Megastructure",
    icon: "🏟️",
    desc: "Form 50+ total synapses/connections. Unlocks Synapse Hyper-Array.",
    test: (c) => c.links >= 50,
    progress: (c) => ({ cur: Math.min(c.links, 50), target: 50 }),
  },
  {
    // The one meta-badge bridging the two systems: completing the whole Codex is
    // itself a feat. (Individual codex entries never appear as achievements.)
    id: "galactic_atlas",
    name: "Galactic Atlas",
    icon: "📖",
    desc: "Discover the entire Codex — every sector, body, constellation, phenomenon.",
    test: (c) => codexPctFrom(c) >= 100,
    progress: (c) => ({ cur: codexPctFrom(c), target: 100 }),
  },
  {
    id: "grand_restorer",
    name: "Grand Restorer",
    icon: "🌟",
    desc: "Tend/restore old high-entropy memories 10+ times. Unlocks Void Purple Trail.",
    test: (c) => {
      try {
        const spaceId = statsSpaceId();
        const val = parseInt(localStorage.getItem(`stat.memories_tended.${spaceId}`) || "0", 10);
        return val >= 10;
      } catch {
        return false;
      }
    },
    progress: (c) => {
      try {
        const spaceId = statsSpaceId();
        const val = parseInt(localStorage.getItem(`stat.memories_tended.${spaceId}`) || "0", 10);
        return { cur: Math.min(val, 10), target: 10 };
      } catch {
        return { cur: 0, target: 10 };
      }
    }
  }
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
