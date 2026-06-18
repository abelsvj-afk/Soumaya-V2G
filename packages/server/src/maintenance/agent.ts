import { and, eq } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { findCandidates } from "../synthesis/engine.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { GraphService } from "../graph/service.js";
import { EconomyRepo, FUEL_JOB_COST } from "../economy.js";
import { insights, agentLogs, settings, nodes, edges, dailyLogs } from "../db/schema.js";
import { upsertEmbedding, getEmbedding, knn } from "../db/vec.js";

/**
 * Soumaya's maintenance brain, extracted from the HTTP route so BOTH the
 * browser-driven loop (api/routes/maintenance.ts) AND the server-side 24/7
 * autonomy loop (index.ts) run the exact same job selection + execution. This is
 * the single source of truth — keep all gating here.
 *
 * Gating (unchanged): Research Mode (global `research_enabled` setting) + the USD
 * budget gate everything LLM-backed; Fuel is a per-brain softer throttle on the
 * discretionary *expansion* jobs (research + sector_vibe) only. Free upkeep
 * (pruning/harmonization/calibration/patrol) always runs.
 */

export type JobType =
  | "synthesis"
  | "calibration"
  | "patrol"
  | "pruning"
  | "harmonization"
  | "research"
  | "merging"
  | "sector_vibe"
  | "daily_log";

export interface AgentJob {
  type: JobType;
  targets: number[];
  description: string;
}

/** Jobs that burn Fuel (discretionary expansion). Everything else is free. */
const FUEL_JOBS = new Set<JobType>(["research", "sector_vibe"]);

/** Global "Research Mode" toggle (settings is deployment-wide, not space-scoped). */
export function researchEnabled(ctx: AppContext): boolean {
  return (
    ctx.handle.db.select().from(settings).where(eq(settings.key, "research_enabled")).get()
      ?.value === "true"
  );
}

/**
 * Choose the next meaningful job for a brain, or null if there's nothing to do.
 * Mirrors the original next-job ladder exactly.
 */
export function selectJob(ctx: AppContext, spaceId: string): AgentJob | null {
  const economy = new EconomyRepo(ctx.handle, spaceId);
  const llmOn = researchEnabled(ctx) && !ctx.usage.overBudget();
  const expansionOn = llmOn && economy.canRunJob();
  const nodesRepo = new NodesRepo(ctx.handle, spaceId);

  // Daily Log — once per day per brain, when there's enough to summarize.
  const today = new Date().toISOString().slice(0, 10);
  const logExists = ctx.handle.db
    .select()
    .from(dailyLogs)
    .where(and(eq(dailyLogs.spaceId, spaceId), eq(dailyLogs.date, today)))
    .get();
  if (llmOn && !logExists && nodesRepo.count() > 5) {
    return { type: "daily_log", targets: [], description: "Captain's Log: Summarizing today's brain evolution." };
  }

  // 0. Merging — near-duplicate memories (similarity > 0.96).
  if (llmOn) {
    for (const node of nodesRepo.all()) {
      const emb = getEmbedding(ctx.handle.sqlite, node.id);
      if (!emb) continue;
      const hits = knn(ctx.handle.sqlite, emb, 2, spaceId);
      const redundant = hits.find((h) => h.nodeId !== node.id && h.similarity > 0.96);
      if (redundant) {
        return {
          type: "merging",
          targets: [node.id, redundant.nodeId],
          description: "Memory Fusion: Detecting and consolidating redundant information nodes.",
        };
      }
    }
  }

  // 1. Research — discretionary deep-dive on a major hub (costs fuel).
  if (expansionOn) {
    const target = ctx.handle.sqlite
      .prepare(
        `SELECT n.id FROM nodes n
         JOIN (
           SELECT node_id, COUNT(*) as deg
           FROM (SELECT source as node_id FROM edges UNION ALL SELECT target as node_id FROM edges)
           GROUP BY node_id
         ) d ON d.node_id = n.id
         WHERE n.space_id = ? AND n.deleted_at IS NULL
         AND n.content NOT LIKE '%--- Research Deep Dive ---%'
         AND d.deg > 1 AND n.importance >= 0.4
         ORDER BY d.deg DESC, n.importance DESC LIMIT 1`,
      )
      .get(spaceId) as { id: number } | undefined;
    if (target) {
      return {
        type: "research",
        targets: [target.id],
        description: "Hub Expansion: Performing analytical research on a major memory center.",
      };
    }
  }

  // 2. Synthesis — latent connection between related-but-distant memories.
  const c0 = findCandidates(ctx.handle, { threshold: 0.85, k: 5, minHops: 3, maxCandidates: 1 }, spaceId)[0];
  if (llmOn && c0) {
    return {
      type: "synthesis",
      targets: [c0.a, c0.b],
      description: "Synthesizing latent connection between semantically related memories.",
    };
  }

  // 3. Pruning — a weak associative link.
  const weakEdge = ctx.handle.sqlite
    .prepare(`SELECT id, source, target FROM edges WHERE space_id = ? AND weight < 0.25 ORDER BY weight ASC LIMIT 1`)
    .get(spaceId) as { id: number; source: number; target: number } | undefined;
  if (weakEdge) {
    return {
      type: "pruning",
      targets: [weakEdge.source, weakEdge.target],
      description: "Pruning weak or redundant associative link to maintain graph clarity.",
    };
  }

  // 4. Harmonization — a node whose emotion deviates from its neighbors'.
  const erraticNode = ctx.handle.sqlite
    .prepare(
      `SELECT n.id FROM nodes n
       JOIN (
         SELECT e.node_id, AVG(nb.emotional_weight) AS cluster_avg
         FROM (
           SELECT source AS node_id, target AS other FROM edges
           UNION ALL SELECT target AS node_id, source AS other FROM edges
         ) e
         JOIN nodes nb ON nb.id = e.other AND nb.emotional_weight IS NOT NULL
         GROUP BY e.node_id
       ) c ON c.node_id = n.id
       WHERE n.space_id = ? AND n.deleted_at IS NULL AND n.emotional_weight IS NOT NULL
         AND ABS(n.emotional_weight - c.cluster_avg) > 0.4 LIMIT 1`,
    )
    .get(spaceId) as { id: number } | undefined;
  if (erraticNode) {
    return {
      type: "harmonization",
      targets: [erraticNode.id],
      description: "Harmonizing emotional resonance across memory cluster.",
    };
  }

  // 5. Sector Vibe — chart a dense cluster (costs fuel).
  const cluster = ctx.handle.sqlite
    .prepare(
      `SELECT n.id FROM nodes n
       JOIN (
         SELECT node_id, COUNT(*) as deg
         FROM (SELECT source as node_id FROM edges UNION ALL SELECT target as node_id FROM edges)
         GROUP BY node_id
       ) d ON d.node_id = n.id
       WHERE n.space_id = ? AND n.deleted_at IS NULL
       AND n.content NOT LIKE '%--- Sector Vibe ---%' AND d.deg >= 3
       ORDER BY RANDOM() LIMIT 1`,
    )
    .get(spaceId) as { id: number } | undefined;
  if (expansionOn && cluster) {
    return {
      type: "sector_vibe",
      targets: [cluster.id],
      description: "Atmospheric scan: Charting the vibe of a local memory sector.",
    };
  }

  // 6. Calibration — recompute mass for an under-weighted hub.
  const hub = ctx.handle.sqlite
    .prepare(
      `SELECT n.id FROM nodes n
       JOIN (
         SELECT node_id, COUNT(*) as deg
         FROM (SELECT source as node_id FROM edges UNION ALL SELECT target as node_id FROM edges)
         GROUP BY node_id
       ) d ON d.node_id = n.id
       WHERE n.space_id = ? AND n.deleted_at IS NULL AND n.importance < 0.5 AND d.deg > 5
       ORDER BY d.deg DESC LIMIT 1`,
    )
    .get(spaceId) as { id: number } | undefined;
  if (hub) {
    return {
      type: "calibration",
      targets: [hub.id],
      description: "Recalibrating gravitational mass for highly-connected memory hub.",
    };
  }

  // 7. Patrol — fallback health check on a random node.
  const all = nodesRepo.all();
  const randomNode = all[Math.floor(Math.random() * all.length)];
  if (randomNode) {
    return { type: "patrol", targets: [randomNode.id], description: "Routine maintenance patrol and health check." };
  }

  return null;
}

/**
 * Execute a job: perform its mutations, log it, and spend Fuel if it's an
 * expansion job. Returns a human description on success, or null for a no-op
 * (e.g. a target went missing). Mirrors the original complete-job branches.
 */
export async function executeJob(
  ctx: AppContext,
  spaceId: string,
  job: { type: JobType; targets: number[]; description?: string },
): Promise<string | null> {
  const { type, targets } = job;
  const [t0, t1] = targets as [number, number];
  const graph = new GraphService(ctx.handle, spaceId);
  const nodesRepo = new NodesRepo(ctx.handle, spaceId);
  let description: string | null = null;

  if (type === "synthesis" && targets.length === 2) {
    const a = nodesRepo.getById(t0);
    const b = nodesRepo.getById(t1);
    if (a && b) {
      const { text, score } = await ctx.llm.synthesize(
        { label: a.label, content: a.content },
        { label: b.label, content: b.content },
        0.9,
      );
      ctx.handle.db.insert(insights).values({ spaceId, nodeA: t0, nodeB: t1, text, score }).run();
      nodesRepo.tend(t0);
      nodesRepo.tend(t1);
      description = `Synthesized latent connection between "${a.label}" and "${b.label}".`;
    }
  } else if (type === "calibration" && targets.length === 1) {
    graph.setImportance(t0, null);
    description = `Recalibrated importance for "${graph.getNode(t0)?.label || t0}".`;
  } else if (type === "pruning" && targets.length === 2) {
    ctx.handle.sqlite
      .prepare(
        `DELETE FROM edges WHERE space_id = ? AND ((source = ? AND target = ?) OR (source = ? AND target = ?)) AND weight < 0.25`,
      )
      .run(spaceId, t0, t1, t1, t0);
    description = `Pruned weak connection between node ${t0} and ${t1}.`;
  } else if (type === "harmonization" && targets.length === 1) {
    ctx.handle.sqlite
      .prepare(
        `UPDATE nodes SET emotional_weight = (
           SELECT AVG(n2.emotional_weight) FROM nodes n2
           JOIN edges e ON (e.source = n2.id OR e.target = n2.id)
           WHERE (e.source = ? OR e.target = ?)
         ) WHERE id = ? AND space_id = ?`,
      )
      .run(t0, t0, t0, spaceId);
    description = `Harmonized emotional resonance for "${graph.getNode(t0)?.label || t0}".`;
  } else if (type === "research" && targets.length === 1) {
    const original = nodesRepo.getById(t0);
    if (original) {
      const research = await ctx.llm.research({ label: original.label, content: original.content });
      const expandedContent = `${original.content}\n\n--- Research Deep Dive ---\n${research.content}`;
      const newImp = Math.min(1.0, (original.importance ?? 0.5) + 0.2);
      ctx.handle.db
        .update(nodes)
        .set({ content: expandedContent, importance: newImp })
        .where(and(eq(nodes.id, original.id), eq(nodes.spaceId, spaceId)))
        .run();
      upsertEmbedding(ctx.handle.sqlite, original.id, await ctx.embeddings.embed(expandedContent));
      nodesRepo.tend(original.id);
      description = `Expanded memory hub "${original.label}" with deep-dive research. Node mass increased.`;
    }
  } else if (type === "merging" && targets.length === 2) {
    const a = nodesRepo.getById(t0);
    const b = nodesRepo.getById(t1);
    if (a && b) {
      const { text } = await ctx.llm.synthesize(
        { label: a.label, content: a.content },
        { label: b.label, content: b.content },
        1.0,
      );
      const newImp = Math.min(1.0, Math.max(a.importance ?? 0, b.importance ?? 0) + 0.05);
      ctx.handle.db
        .update(nodes)
        .set({ content: text, importance: newImp })
        .where(and(eq(nodes.id, a.id), eq(nodes.spaceId, spaceId)))
        .run();
      upsertEmbedding(ctx.handle.sqlite, a.id, await ctx.embeddings.embed(text));
      ctx.handle.db.update(edges).set({ source: a.id }).where(and(eq(edges.source, b.id), eq(edges.spaceId, spaceId))).run();
      ctx.handle.db.update(edges).set({ target: a.id }).where(and(eq(edges.target, b.id), eq(edges.spaceId, spaceId))).run();
      nodesRepo.softDelete(b.id, a.id);
      description = `Fused redundant memory "${b.label}" into "${a.label}". Connections re-routed.`;
    }
  } else if (type === "sector_vibe" && targets.length === 1) {
    const center = nodesRepo.getById(t0);
    if (center) {
      const neighbors = ctx.handle.sqlite
        .prepare(
          `SELECT n.id, n.label, n.content FROM nodes n
           JOIN edges e ON (e.source = n.id OR e.target = n.id)
           WHERE n.space_id = ? AND (e.source = ? OR e.target = ?) AND n.id != ? LIMIT 5`,
        )
        .all(spaceId, center.id, center.id, center.id) as { id: number; label: string; content: string }[];
      const vibe = await ctx.llm.summarizeSector(
        [center, ...neighbors].map((n) => ({ label: n.label, content: n.content })),
      );
      ctx.handle.db
        .update(nodes)
        .set({ content: `${center.content}\n\n--- Sector Vibe ---\n${vibe}` })
        .where(and(eq(nodes.id, center.id), eq(nodes.spaceId, spaceId)))
        .run();
      nodesRepo.tend(center.id);
      description = `Charted sector vibe around "${center.label}": ${vibe}`;
    }
  } else if (type === "daily_log") {
    const recentNodes = nodesRepo.recent(10);
    const recentLogs = ctx.handle.sqlite
      .prepare(`SELECT action, description FROM agent_logs WHERE space_id = ? ORDER BY id DESC LIMIT 10`)
      .all(spaceId) as { action: string; description: string }[];
    const logText = await ctx.llm.generateDailyLog(
      recentNodes.map((n) => ({ label: n.label, content: n.content })),
      recentLogs.map((l) => l.description),
    );
    ctx.handle.db
      .insert(dailyLogs)
      .values({ spaceId, content: logText, date: new Date().toISOString().slice(0, 10) })
      .run();
    description = `Captain's Log recorded: ${logText.slice(0, 50)}...`;
  } else if (type === "patrol") {
    description = `Performed routine patrol on node ${t0}.`;
  }

  if (description) {
    if (FUEL_JOBS.has(type)) new EconomyRepo(ctx.handle, spaceId).spend(FUEL_JOB_COST);
    ctx.handle.db
      .insert(agentLogs)
      .values({ spaceId, action: type, description, targets: JSON.stringify(targets) })
      .run();
  }
  return description;
}
