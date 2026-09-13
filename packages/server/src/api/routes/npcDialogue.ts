import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { heuristicNpcLines } from "../../analysis/npcLines.js";

const NpcLineRequestSchema = z.object({
  npcId: z.string().min(1).max(64),
  name: z.string().min(1).max(64),
  jobFlavor: z.string().min(1).max(500),
  relationshipHint: z.string().max(500).optional(),
});

const NpcTownStateSchema = z.object({
  treasuryCents: z.number().int().min(0),
  neglectedBuildings: z.array(z.string().max(64)).max(20),
  nodeCount: z.number().int().min(0),
  npcCount: z.number().int().min(0),
});

const Body = z.object({
  npcs: z.array(NpcLineRequestSchema).min(1).max(20),
  townState: NpcTownStateSchema,
});

/**
 * NPC Society dialogue (docs/overworld/npc-llm-dialogue.md, task #61) — one batched call for
 * every Overworld NPC that needs a flavor line this round, never one call per NPC. The
 * deterministic heuristic base (`heuristicNpcLines`) always runs first; a real LLM call only
 * ever REPLACES it when one is available and returns a well-formed, same-length batch — same
 * "heuristic base + optional cloud upgrade" shape `lore.ts`'s evolveLore/chronicle already use.
 * Client-side cooldown (data/npcLlmDialogue.ts) is what actually limits call frequency; this
 * route's own `llmLimiter` (mounted in server.ts) is the same backstop every other LLM-calling
 * route already has.
 */
export function npcDialogueRoutes(ctx: AppContext): Router {
  const r = Router();

  // POST /api/npc-dialogue { npcs, townState } -> { lines: string[] } (same order as npcs)
  r.post("/", async (req, res) => {
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Body must be { npcs: NpcLineRequest[], townState: NpcTownState }" });
      return;
    }
    const { npcs, townState } = parsed.data;
    let lines = heuristicNpcLines(npcs, townState);
    if (ctx.llm.generateNpcLines) {
      try {
        const upgraded = await ctx.llm.generateNpcLines(npcs, townState);
        if (upgraded && upgraded.length === npcs.length) lines = upgraded;
      } catch {
        /* keep the heuristic lines — offline-safe */
      }
    }
    res.json({ lines });
  });

  return r;
}
