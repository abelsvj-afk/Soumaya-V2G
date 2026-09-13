import { describe, it, expect } from "vitest";
import { heuristicNpcLines } from "../analysis/npcLines.js";
import type { NpcLineRequest, NpcTownState } from "../llm/adapter.js";

const NPCS: NpcLineRequest[] = [
  { npcId: "bank-0", name: "Priya", jobFlavor: "Counting the day's ledger." },
  { npcId: "bank-1", name: "Otis", jobFlavor: "Reconciling the books." },
];

const TOWN_STATE: NpcTownState = {
  treasuryCents: 4200,
  neglectedBuildings: ["Observatory"],
  nodeCount: 87,
  npcCount: 20,
};

describe("heuristicNpcLines (npc-llm-dialogue.md)", () => {
  it("returns one line per NPC, in the same order", () => {
    const lines = heuristicNpcLines(NPCS, TOWN_STATE);
    expect(lines).toHaveLength(2);
  });

  it("is deterministic — same input, same output, never Math.random", () => {
    expect(heuristicNpcLines(NPCS, TOWN_STATE)).toEqual(heuristicNpcLines(NPCS, TOWN_STATE));
  });

  it("grounds each line in the NPC's own real job flavor", () => {
    const lines = heuristicNpcLines(NPCS, TOWN_STATE);
    expect(lines[0]).toContain("Counting the day's ledger");
    expect(lines[1]).toContain("Reconciling the books");
  });

  it("references a real town-state fact, never an invented one", () => {
    const lines = heuristicNpcLines(NPCS, TOWN_STATE);
    const joined = lines.join(" ");
    expect(joined).toMatch(/\$42\.00|Observatory|87 memories/);
  });

  it("never mentions a neglected building when none exist", () => {
    const lines = heuristicNpcLines(NPCS, { ...TOWN_STATE, neglectedBuildings: [] });
    expect(lines.join(" ")).not.toContain("could use a visit");
  });

  it("returns an empty array for an empty NPC list", () => {
    expect(heuristicNpcLines([], TOWN_STATE)).toEqual([]);
  });
});
