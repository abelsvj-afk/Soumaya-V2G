import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { EconomyRepo } from "../../economy.js";
import { agentLogs, settings, dailyLogs } from "../../db/schema.js";
import { spaceOf } from "../middleware.js";
import { eq, desc } from "drizzle-orm";
import { selectJob, executeJob } from "../../maintenance/agent.js";

const CompleteJobSchema = z.object({
  type: z.enum(["synthesis", "calibration", "patrol", "pruning", "harmonization", "research", "merging", "sector_vibe", "daily_log"]),
  targets: z.array(z.number()),
});

export function maintenanceRoutes(ctx: AppContext): Router {
  const r = Router();

  /**
   * GET /api/maintenance/next-job
   * Returns the next "meaningful" task for the Soumaya agent. The selection
   * ladder + all token/fuel gating live in maintenance/agent.ts so the browser
   * loop and the server-side 24/7 loop choose jobs identically.
   */
  r.get("/next-job", (req, res) => {
    const job = selectJob(ctx, spaceOf(res));
    if (!job) {
      res.status(404).json({ error: "No nodes available for maintenance." });
      return;
    }
    res.json(job);
  });

  /**
   * POST /api/maintenance/complete-job
   * Commits the results of a maintenance task to the database.
   */
  r.post("/complete-job", async (req, res) => {
    const parsed = CompleteJobSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid job completion data" });
      return;
    }
    try {
      // Execution + logging + fuel all live in the shared agent service.
      const detail = await executeJob(ctx, spaceOf(res), parsed.data);
      res.json({ ok: detail != null, detail: detail ?? "No-op (target unavailable)." });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  /**
   * GET /api/maintenance/logs
   * Returns recent activity logs.
   */
  r.get("/logs", async (req, res) => {
    const logs = await ctx.handle.db
      .select()
      .from(agentLogs)
      .where(eq(agentLogs.spaceId, spaceOf(res)))
      .orderBy(desc(agentLogs.id))
      .limit(50)
      .all();
    res.json(logs);
  });

  /**
   * GET /api/maintenance/daily-log
   * Returns the most recent Captain's log.
   */
  r.get("/daily-log", async (req, res) => {
    const log = await ctx.handle.db
      .select()
      .from(dailyLogs)
      .where(eq(dailyLogs.spaceId, spaceOf(res)))
      .orderBy(desc(dailyLogs.id))
      .limit(1)
      .get();
    
    if (log) {
      res.json(log);
    } else {
      res.status(404).json({ error: "No daily log found" });
    }
  });

  /**
   * GET /api/maintenance/fuel -> this brain's Celestial Economy fuel.
   */
  r.get("/fuel", (_req, res) => {
    res.json(new EconomyRepo(ctx.handle, spaceOf(res)).toFuel());
  });

  /**
   * GET /api/maintenance/settings
   */
  r.get("/settings", async (req, res) => {
    const all = await ctx.handle.db.select().from(settings).all();
    const map = Object.fromEntries(all.map(s => [s.key, s.value]));
    res.json(map);
  });

  /**
   * POST /api/maintenance/settings
   */
  r.post("/settings", async (req, res) => {
    const { key, value } = req.body;
    await ctx.handle.db.insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } })
      .run();
    res.json({ ok: true });
  });

  return r;
}
