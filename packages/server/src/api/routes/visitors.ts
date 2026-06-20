import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { spaceOf } from "../middleware.js";
import { VisitorsRepo } from "../../repositories/visitors.repo.js";

const LogBody = z.object({
  events: z
    .array(z.object({ nodeId: z.number().int(), type: z.string().min(1).max(40) }))
    .max(100),
});

/** Visitor activity: the client reports craft arrivals; we aggregate + expose them. */
export function visitorRoutes(ctx: AppContext): Router {
  const r = Router();

  // Most-visited memories for this brain.
  r.get("/", (req, res) => {
    res.json(new VisitorsRepo(ctx.handle, spaceOf(res)).top(20));
  });

  // Batched arrival report from the 3D scene (fire-and-forget on the client).
  r.post("/log", (req, res) => {
    const parsed = LogBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Body must be { events: [{nodeId, type}] }" });
      return;
    }
    new VisitorsRepo(ctx.handle, spaceOf(res)).record(parsed.data.events);
    res.json({ ok: true, recorded: parsed.data.events.length });
  });

  return r;
}
