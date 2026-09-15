import { describe, it, expect } from "vitest";
import type { CelestialClass } from "@brain/shared";
import { MAX_SHOWINGS, selectShowings } from "./theater.js";
import type { CreatureEntity } from "../types.js";

function makeCreature(nodeId: number, celestial: CelestialClass): CreatureEntity {
  return {
    nodeId,
    name: `Node ${nodeId}`,
    type: "concept",
    celestial,
    rarity: { tier: "rare", label: "Rare", badge: "◆" },
    entropy: 0.1,
    degree: 1,
    isDue: false,
    dueForRecall: false,
    spriteKey: "creature_default",
    uncharted: true,
  };
}

describe("theater (backlog #81 — real showings, never invented)", () => {
  it("picks the highest celestial tier first", () => {
    const creatures = [makeCreature(1, "asteroid"), makeCreature(2, "supergiant"), makeCreature(3, "moon")];
    const showings = selectShowings(creatures);
    expect(showings[0]!.nodeId).toBe(2);
  });

  it("caps at MAX_SHOWINGS even with a large real collection", () => {
    const creatures = Array.from({ length: 20 }, (_, i) => makeCreature(i, "planet"));
    expect(selectShowings(creatures).length).toBe(MAX_SHOWINGS);
  });

  it("never invents a showing when the player has no memories at all", () => {
    expect(selectShowings([])).toEqual([]);
  });

  it("breaks ties deterministically by nodeId, never Math.random", () => {
    const creatures = [makeCreature(5, "planet"), makeCreature(2, "planet"), makeCreature(9, "planet")];
    const a = selectShowings(creatures).map((c) => c.nodeId);
    const b = selectShowings(creatures).map((c) => c.nodeId);
    expect(a).toEqual(b);
    expect(a).toEqual([2, 5, 9]);
  });

  it("real full ordering across all 7 celestial tiers", () => {
    const order: CelestialClass[] = ["star", "asteroid", "gas_giant", "supergiant", "moon", "giant", "planet"];
    const creatures = order.map((c, i) => makeCreature(i, c));
    const showings = selectShowings(creatures);
    expect(showings.map((c) => c.celestial)).toEqual(["supergiant", "star", "giant", "gas_giant"]);
  });
});
