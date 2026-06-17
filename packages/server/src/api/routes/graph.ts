import { Router } from "express";
import type { AppContext } from "../../context.js";
import { GraphService } from "../../graph/service.js";
import { spaceOf } from "../middleware.js";

export function graphRoutes(ctx: AppContext): Router {
  const r = Router();
  // GET /api/graph?limit=300  -> bounded overview (react-force-graph-3d shape)
  r.get("/", (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 300) || 300, 1), 5000);
    res.json(new GraphService(ctx.handle, spaceOf(res)).overview(limit));
  });
  return r;
}
