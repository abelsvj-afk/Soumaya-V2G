import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { agentLogs, settings, dailyLogs } from "../../db/schema.js";
import { desc } from "drizzle-orm";

const CompleteJobSchema = z.object({
  type: z.enum(["synthesis", "calibration", "patrol", "pruning", "harmonization", "research", "merging", "sector_vibe", "daily_log"]),
  targets: z.array(z.number()),
});

export function maintenanceRoutes(ctx: AppContext): Router {
  const r = Router();

  /**
   * GET /api/maintenance/next-job
   * Returns the next "meaningful" task for the Soumaya agent.
   */
  r.get("/next-job", async (req, res) => {
    try {
      const job = await ctx.maintenance.getNextJob();
      if (job) {
        res.json(job);
      } else {
        res.status(404).json({ error: "No nodes available for maintenance." });
      }
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
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

    const { type, targets } = parsed.data;

    try {
      const detail = await ctx.maintenance.completeJob(type as any, targets);
      res.json({ ok: true, detail });
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
