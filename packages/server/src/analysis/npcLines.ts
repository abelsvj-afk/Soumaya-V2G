import type { NpcLineRequest, NpcTownState } from "../llm/adapter.js";

/**
 * The offline-safe base for NPC flavor lines (docs/overworld/npc-llm-dialogue.md, task #61) —
 * always runs first; `api/routes/npcDialogue.ts` optionally upgrades to a real LLM-generated
 * batch when one is available, same "heuristic base + optional cloud upgrade" shape
 * `lore/engine.ts`'s evolveLore + chronicle already use.
 *
 * Deterministic (no Math.random): each NPC's own job flavor is combined with ONE real town-state
 * fact, picked by that NPC's position in the list (not randomly) so the same request always
 * produces the same lines, and the fact referenced still genuinely varies as town state changes.
 */
export function heuristicNpcLines(npcs: NpcLineRequest[], townState: NpcTownState): string[] {
  const facts: string[] = [`the treasury's sitting at $${(townState.treasuryCents / 100).toFixed(2)}`];
  if (townState.neglectedBuildings.length > 0) {
    facts.push(`${townState.neglectedBuildings[0]} could use a visit`);
  }
  facts.push(`this town holds ${townState.nodeCount} memories now`);

  return npcs.map((npc, i) => {
    // facts always has at least one entry (pushed unconditionally above), so this index is
    // always in bounds — the modulo just cycles through whichever facts are real this round.
    const fact = facts[i % facts.length]!;
    const base = npc.jobFlavor.trim().replace(/\.$/, "");
    return `${base} — and ${fact}.`;
  });
}
