import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../../context.js";

const BudgetBody = z.object({ budget: z.number().min(0).max(100000) });

/** API usage + budget meter (estimated cost from token counts). */
export function usageRoutes(ctx: AppContext): Router {
  const r = Router();

  // GET /api/usage -> current spend estimate + budget status
  r.get("/", (_req, res) => res.json(ctx.usage.summary()));

  // POST /api/usage { budget } -> set the spend budget (USD)
  r.post("/", (req, res) => {
    const parsed = BudgetBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Body must be { budget: number }" });
      return;
    }
    ctx.usage.setBudget(parsed.data.budget);
    res.json(ctx.usage.summary());
  });

  // POST /api/usage/reset -> zero the counters (e.g. after recharging)
  r.post("/reset", (_req, res) => {
    ctx.usage.reset();
    res.json(ctx.usage.summary());
  });

  return r;
}
