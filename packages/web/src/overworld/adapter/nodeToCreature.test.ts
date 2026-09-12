import { describe, it, expect } from "vitest";
import { COOLING_ENTROPY, type GraphNode } from "@brain/shared";
import { nodeToCreature, spriteKeyForType } from "./nodeToCreature.js";

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: 1,
    label: "Test memory",
    type: "concept",
    content: "some raw content",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("nodeToCreature", () => {
  it("uses the server-computed celestial class as-is, never re-derives it, when present", () => {
    const node = makeNode({ celestial: "star", mass: 0.05 /* deliberately inconsistent */ });
    expect(nodeToCreature(node).celestial).toBe("star");
  });

  it("falls back to classify(mass) only when celestial is missing", () => {
    const node = makeNode({ celestial: undefined, mass: 0.9 });
    expect(nodeToCreature(node).celestial).toBe("supergiant");
  });

  it("treats a node with no mass/celestial as a fresh asteroid, not an error", () => {
    const node = makeNode({ celestial: undefined, mass: undefined });
    expect(nodeToCreature(node).celestial).toBe("asteroid");
  });

  it("dim-state threshold crosses exactly at COOLING_ENTROPY, using >= like the rest of the app", () => {
    const justBelow = nodeToCreature(makeNode({ entropy: COOLING_ENTROPY - 0.001 }));
    const exactly = nodeToCreature(makeNode({ entropy: COOLING_ENTROPY }));
    const justAbove = nodeToCreature(makeNode({ entropy: COOLING_ENTROPY + 0.001 }));
    expect(justBelow.isDue).toBe(false);
    expect(exactly.isDue).toBe(true); // matches App.tsx/objectLore.ts/NodeList.tsx/quests.ts's own >= convention
    expect(justAbove.isDue).toBe(true);
  });

  it("treats missing entropy as fresh (0), never due", () => {
    expect(nodeToCreature(makeNode({ entropy: undefined })).isDue).toBe(false);
  });

  it("falls back to a default sprite for an unmapped NodeType, never a missing-texture crash", () => {
    // "other" and "meeting" are real NodeType values; assert both resolve to *some* key.
    expect(spriteKeyForType("other")).toBe("creature_default");
    expect(spriteKeyForType("person")).not.toBe("creature_default");
  });

  it("marks a node with no Journey link as uncharted, never an error state", () => {
    expect(nodeToCreature(makeNode(), {}).uncharted).toBe(true);
    expect(nodeToCreature(makeNode(), { hasJourney: true }).uncharted).toBe(false);
  });

  it("prefers celestialTitle over label when present", () => {
    const node = makeNode({ label: "raw label", celestialTitle: "Pretty Title" });
    expect(nodeToCreature(node).name).toBe("Pretty Title");
  });

  it("defaults dueForRecall to false and only sets it from the opt (spaced-repetition.md — never derived from entropy)", () => {
    expect(nodeToCreature(makeNode({ entropy: 1 })).dueForRecall).toBe(false);
    expect(nodeToCreature(makeNode({ entropy: 0 }), { dueForRecall: true }).dueForRecall).toBe(true);
  });
});
