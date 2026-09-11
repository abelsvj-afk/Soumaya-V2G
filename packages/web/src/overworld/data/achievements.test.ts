import { describe, it, expect, beforeEach } from "vitest";
import type { GraphData, GraphNode } from "@brain/shared";
import { syncAchievements, listAchievements } from "./achievements.js";

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return { id: 1, label: "n", type: "concept", content: "", createdAt: "2026-01-01T00:00:00.000Z", ...overrides };
}

describe("syncAchievements (App.tsx parity)", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("brain.spaceId", "space-1");
  });

  it("persists newly-satisfied achievements to the SAME localStorage key App.tsx uses", () => {
    const graph: GraphData = {
      nodes: [],
      links: Array.from({ length: 25 }, (_, i) => ({
        id: i,
        source: 1,
        target: 2,
        relationship: "relates_to",
        weight: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
      })),
    };
    const fresh = syncAchievements(graph, null, null);
    expect(fresh).toContain("connector"); // 25+ links
    expect(JSON.parse(localStorage.getItem("brain.achv.space-1") || "[]")).toContain("connector");
  });

  it("never re-reports an already-persisted achievement as freshly unlocked", () => {
    const graph: GraphData = {
      nodes: [],
      links: Array.from({ length: 25 }, (_, i) => ({
        id: i,
        source: 1,
        target: 2,
        relationship: "relates_to",
        weight: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
      })),
    };
    syncAchievements(graph, null, null);
    const secondPass = syncAchievements(graph, null, null);
    expect(secondPass).not.toContain("connector");
  });

  it("does nothing (never throws) when no space is signed in", () => {
    localStorage.clear();
    expect(() => syncAchievements({ nodes: [], links: [] }, null, null)).not.toThrow();
    expect(syncAchievements({ nodes: [], links: [] }, null, null)).toEqual([]);
  });
});

describe("listAchievements", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("brain.spaceId", "space-1");
  });

  it("marks every achievement locked when nothing has been persisted yet", () => {
    const views = listAchievements({ nodes: [makeNode()], links: [] }, null, null);
    expect(views.length).toBeGreaterThan(0);
    expect(views.every((v) => !v.unlocked)).toBe(true);
  });

  it("reflects a persisted unlock as earned", () => {
    localStorage.setItem("brain.achv.space-1", JSON.stringify(["connector"]));
    const views = listAchievements({ nodes: [], links: [] }, null, null);
    const connector = views.find((v) => v.achievement.id === "connector");
    expect(connector?.unlocked).toBe(true);
  });
});
