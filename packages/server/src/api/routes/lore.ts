import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { spaceOf } from "../middleware.js";
import { LoreRepo, evolveLore, getOrCreateLore } from "../../lore/engine.js";

const SUBJECTS = ["memory", "ship", "station", "beacon"] as const;
const Params = z.object({
  subjectType: z.enum(SUBJECTS),
  subjectId: z.string().min(1).max(64),
});

/**
 * Lore: an object's evolving, versioned story. Reading creates the genesis chapter
 * on first view; evolving appends the next chapter. Fully space-scoped.
 */
export function loreRoutes(ctx: AppContext): Router {
  const r = Router();

  // GET /api/lore/:subjectType/:subjectId — full history (oldest → newest).
  r.get("/:subjectType/:subjectId", (req, res) => {
    const p = Params.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: "Bad lore subject" });
      return;
    }
    const history = getOrCreateLore(ctx.handle, spaceOf(res), p.data.subjectType, p.data.subjectId);
    res.json(history);
  });

  // POST /api/lore/:subjectType/:subjectId/evolve — append the next chapter.
  r.post("/:subjectType/:subjectId/evolve", async (req, res) => {
    const p = Params.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: "Bad lore subject" });
      return;
    }
    const spaceId = spaceOf(res);
    const repo = new LoreRepo(ctx.handle, spaceId);
    const entry = evolveLore(ctx.handle, spaceId, p.data.subjectType, p.data.subjectId, "manual");
    if (!entry) {
      res.status(404).json({ error: "Subject not found" });
      return;
    }
    // Best-effort upgrade: if a cloud LLM is available, rewrite this chapter as
    // richer prose, building on the prior chapter. Heuristic chronicler stays as
    // the always-present base, so this never breaks the offline path.
    if (ctx.llm.chronicle) {
      try {
        const prior = repo.history(p.data.subjectType, p.data.subjectId);
        const priorText = prior.length > 1 ? prior[prior.length - 2]!.text : "(this is the first chapter)";
        const richer = await ctx.llm.chronicle(
          `${p.data.subjectType} "${p.data.subjectId}"`,
          `Current heuristic chapter: ${entry.text}\nPrior chapter: ${priorText}`,
        );
        if (richer && richer.trim()) {
          repo.updateText(entry.id, richer.trim());
          entry.text = richer.trim();
        }
      } catch {
        /* keep the heuristic chapter — offline-safe */
      }
    }
    res.json({ entry, history: repo.history(p.data.subjectType, p.data.subjectId) });
  });

  return r;
}
