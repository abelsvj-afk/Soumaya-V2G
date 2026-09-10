import { describe, it, expect } from "vitest";
import type { GraphNode } from "@brain/shared";
import { focusItemStyle, songDotStyle, getFigurineIcon, getFigurineLabel, mergeGraphNodes, mergeGraphData } from "./App.helpers.js";

/** Locks the pure presentational helpers extracted from App.tsx (D4), so a future
 *  refactor that touches them fails loudly instead of silently. */
describe("App.helpers", () => {
  it("labels + icons every known figurine, and falls back for unknowns", () => {
    expect(getFigurineLabel("blackhole")).toBe("The Singularity");
    expect(getFigurineIcon("station")).toBe("🌐");
    expect(getFigurineLabel("station")).toBe("Waystation Figurine");
    // Unknown → label echoes the type, icon uses the stone default.
    expect(getFigurineLabel("mystery")).toBe("mystery");
    expect(getFigurineIcon("mystery")).toBe("🗿");
  });

  it("stacks focus-cluster items upward when open, collapsed when closed", () => {
    const closed = focusItemStyle(2, false);
    const open = focusItemStyle(2, true);
    expect(closed).toBeTruthy();
    expect(open).toBeTruthy();
    // Opening changes the style (it animates outward) — exact geometry may evolve, but
    // the two states must differ.
    expect(JSON.stringify(open)).not.toBe(JSON.stringify(closed));
  });

  it("spreads song dots around the ring (each index a distinct position)", () => {
    const a = songDotStyle(0, 3);
    const b = songDotStyle(1, 3);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
});

/** Galaxy render-stall root-cause fix (2026-09-10): three-forcegraph's node object cache
 *  keys nodes by raw object identity, not `.id` — a freshly-fetched node array must reuse
 *  existing object references by id or every node's Object3D gets disposed/rebuilt on
 *  every refresh. See mergeGraphNodes's doc comment for the full confirmed mechanism. */
describe("mergeGraphNodes / mergeGraphData", () => {
  const node = (overrides: Partial<GraphNode>): GraphNode => ({
    id: 1,
    label: "n",
    type: "memory" as GraphNode["type"],
    content: "",
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  });

  it("reuses the SAME object reference for an id that already exists", () => {
    const existing = node({ id: 1, label: "old" }) as GraphNode & { x?: number; y?: number };
    // Position fields are client-only (never present on a fresh server payload) —
    // simulate orbits.ts having already placed this node.
    existing.x = 42;
    existing.y = 7;
    const fresh = node({ id: 1, label: "new", importance: 0.9 });

    const merged = mergeGraphNodes([existing], [fresh])[0]!;

    expect(merged).toBe(existing); // same reference — the entire point of the fix
    expect(merged.label).toBe("new"); // server fields DID update
    expect(merged.importance).toBe(0.9);
    expect((merged as any).x).toBe(42); // client-only position field survived untouched
    expect((merged as any).y).toBe(7);
  });

  it("gives a genuinely new id a fresh object, not a stale reference", () => {
    const existing = node({ id: 1 });
    const freshExisting = node({ id: 1 });
    const freshNew = node({ id: 2, label: "brand new" });

    const merged = mergeGraphNodes([existing], [freshExisting, freshNew]);

    expect(merged).toHaveLength(2);
    expect(merged[0]).toBe(existing);
    expect(merged[1]).toBe(freshNew); // no prior object for id 2 — the fresh one is used as-is
  });

  it("drops a node no longer present in the fresh payload (deletion)", () => {
    const merged = mergeGraphNodes([node({ id: 1 }), node({ id: 2 })], [node({ id: 1 })]);
    expect(merged.map((n) => n.id)).toEqual([1]);
  });

  it("mergeGraphData merges nodes but passes links through untouched by reference", () => {
    const prevLink = { id: 1, source: 1, target: 2, relationship: "relates_to" as const, weight: 0.5, createdAt: "" };
    const freshLinks = [{ id: 2, source: 1, target: 2, relationship: "relates_to" as const, weight: 0.7, createdAt: "" }];
    const prevNode = node({ id: 1 });
    const merged = mergeGraphData({ nodes: [prevNode], links: [prevLink] }, { nodes: [node({ id: 1, label: "x" })], links: freshLinks });

    expect(merged.nodes[0]).toBe(prevNode);
    expect(merged.links).toBe(freshLinks); // links are NOT merged/mutated — passed through as-is
  });
});
