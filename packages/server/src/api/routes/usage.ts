import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../../context.js";

const BudgetBody = z.object({ budget: z.number().min(0).max(100000) });

/** API usage + budget meter (estimated cost from token counts). */
export function usageRoutes(ctx: AppContext): Router {
  const r = Router();

  // Mutating the shared budget ALWAYS requires the admin token — fail closed when
  // ADMIN_TOKEN isn't configured, otherwise any logged-in brain could zero the
  // deployment's only spend cap for everyone.
  const requireAdmin = (req: import("express").Request, res: import("express").Response): boolean => {
    const token = process.env.ADMIN_TOKEN;
    if (!token || req.get("x-admin-token") !== token) {
      res.status(403).json({ error: "Budget changes require the admin token (set ADMIN_TOKEN)." });
      return false;
    }
    return true;
  };

  // GET /api/usage -> current spend estimate + budget status
  r.get("/", (_req, res) => res.json(ctx.usage.summary()));

  // POST /api/usage { budget } -> set the spend budget (USD)
  r.post("/", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const parsed = BudgetBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Body must be { budget: number }" });
      return;
    }
    ctx.usage.setBudget(parsed.data.budget);
    res.json(ctx.usage.summary());
  });

  // POST /api/usage/reset -> zero the counters (e.g. after recharging)
  r.post("/reset", (req, res) => {
    if (!requireAdmin(req, res)) return;
    ctx.usage.reset();
    res.json(ctx.usage.summary());
  });

  return r;
}
