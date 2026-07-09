import { Router } from "express";
import { z } from "zod";
import { EXTRACTABLE_NODE_TYPES, CELESTIAL_CLASSES } from "@brain/shared";
import type { AppContext } from "../../context.js";
import { EconomyRepo, EARN_CODEX_DISCOVERY } from "../../economy.js";
import { StreakRepo } from "../../streak.js";
import { agentLogs, dailyLogs } from "../../db/schema.js";
import { spaceOf } from "../middleware.js";
import { eq, desc } from "drizzle-orm";
import { selectJob, executeJob, researchEnabled, setResearchEnabled } from "../../maintenance/agent.js";
import { activeUndertaking } from "../../analysis/undertakings.js";

const CompleteJobSchema = z.object({
  type: z.enum(["synthesis", "calibration", "patrol", "pruning", "harmonization", "research", "merging", "sector_vibe", "daily_log"]),
  targets: z.array(z.number()),
});

// Only an explicit allow-list of user-facing keys may be written through this public
// route (the raw `settings` table also holds the deployment's budget/usage counters).
// `research_enabled` is the one settable flag, and it's stored PER SPACE.
const SettingsWriteSchema = z.object({
  key: z.enum(["research_enabled"]),
  value: z.string().max(64),
});

// The rewardable Codex catalog, mirrored from the web client's entry ids
// (packages/web/src/components/codex.ts — keep in sync when adding entries).
// Everything static is enumerable here; constellation entries are dynamic and
// verified against the space's real MOC hubs instead.
const CODEX_STATIC_KEYS = new Set<string>([
  ...EXTRACTABLE_NODE_TYPES.map((t) => `sector-${t}`),
  ...CELESTIAL_CLASSES.map((c) => `body-${c}`),
  "body-singularity",
  "fleet-soumaya",
  "fleet-station",
  "fleet-beacon",
  ...["firstlink", "star", "deep", "ancient", "cooling", "tender"].map((p) => `phenom-${p}`),
]);

function isClaimableCodexKey(ctx: AppContext, spaceId: string, key: string): boolean {
  if (CODEX_STATIC_KEYS.has(key)) return true;
  const m = /^constellation-(\d+)$/.exec(key);
  if (!m) return false;
  const hub = ctx.handle.sqlite
    .prepare(`SELECT 1 FROM nodes WHERE id = ? AND space_id = ? AND kind = 'moc' AND deleted_at IS NULL`)
    .get(Number(m[1]), spaceId);
  return hub != null;
}

export function maintenanceRoutes(ctx: AppContext): Router {
  const r = Router();

  /**
   * GET /api/maintenance/next-job
   * Returns the next "meaningful" task for the Soumaya agent. The selection
   * ladder + all token/fuel gating live in maintenance/agent.ts so the browser
   * loop and the server-side 24/7 loop choose jobs identically.
   */
  r.get("/next-job", async (req, res) => {
    const job = await selectJob(ctx, spaceOf(res));
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
      console.error("[maintenance] complete-job failed:", err);
      res.status(500).json({ error: "Job execution failed." });
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
   * POST /api/maintenance/fuel/burn { amount } -> spend Fuel her fast flight used.
   * Amount is clamped to a small ceiling so a crafted request can't drain the tank.
   */
  r.post("/fuel/burn", (req, res) => {
    const amount = Number((req.body as { amount?: unknown })?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: "amount must be a positive number" });
      return;
    }
    const econ = new EconomyRepo(ctx.handle, spaceOf(res));
    econ.spend(Math.min(amount, 5)); // per-call cap; ignores overspend (never negative)
    res.json(econ.toFuel());
  });

  /**
   * POST /api/maintenance/codex-claim { key } -> grant a one-time fuel reward for
   * discovering a Codex entry. Idempotent per (space, key) AND validated against
   * the real Codex catalog — client-invented keys would otherwise mint fuel and
   * bloat codex_claims forever.
   */
  r.post("/codex-claim", (req, res) => {
    const key = String(req.body?.key ?? "").slice(0, 80);
    const spaceId = spaceOf(res);
    if (!key || !isClaimableCodexKey(ctx, spaceId, key)) {
      res.status(400).json({ error: "Unknown codex entry." });
      return;
    }
    const existed = ctx.handle.sqlite
      .prepare(`SELECT 1 FROM codex_claims WHERE space_id = ? AND reward_key = ?`)
      .get(spaceId, key);
    if (existed) {
      res.json({ awarded: false, fuel: new EconomyRepo(ctx.handle, spaceId).get() });
      return;
    }
    ctx.handle.sqlite
      .prepare(`INSERT OR IGNORE INTO codex_claims (space_id, reward_key) VALUES (?, ?)`)
      .run(spaceId, key);
    const fuel = new EconomyRepo(ctx.handle, spaceId).add(EARN_CODEX_DISCOVERY);
    res.json({ awarded: true, fuel });
  });

  /**
   * GET /api/maintenance/undertaking -> her current multi-day arc (or null).
   */
  r.get("/undertaking", (_req, res) => {
    res.json(activeUndertaking(ctx, spaceOf(res)));
  });

  /**
   * GET /api/maintenance/streak -> this brain's daily-tending streak.
   */
  r.get("/streak", (_req, res) => {
    res.json(new StreakRepo(ctx.handle, spaceOf(res)).get());
  });

  /**
   * GET /api/maintenance/settings — only the user-facing flags, resolved for THIS
   * space. (The raw settings table also holds deployment counters/budget rows that
   * must not leak to tenants.)
   */
  r.get("/settings", (_req, res) => {
    res.json({ research_enabled: String(researchEnabled(ctx, spaceOf(res))) });
  });

  /**
   * POST /api/maintenance/settings — Research Mode is per-space now, so one brain
   * flipping it can't switch paid autonomous work on/off for every tenant.
   */
  r.post("/settings", (req, res) => {
    const parsed = SettingsWriteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Unsupported setting.", issues: parsed.error.issues });
      return;
    }
    setResearchEnabled(ctx, spaceOf(res), parsed.data.value === "true");
    res.json({ ok: true });
  });

  return r;
}
