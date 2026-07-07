import { SPECIAL_COLORS } from "@brain/shared";
import type { AppContext } from "../context.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { EdgesRepo } from "../repositories/edges.repo.js";
import { upsertEmbedding } from "../db/vec.js";
import { ftsUpsert } from "../db/fts.js";
import { evolveLore } from "../lore/engine.js";

/**
 * Dream cycles (Level 2, B2). Like sleep consolidating episodic memory into
 * semantic memory, once per day Soumaya distills the densest cluster of related
 * memories into ONE durable BELIEF about the user — a `kind:"belief"` node that
 * `summarizes` its evidence. Memories stay; UNDERSTANDING compounds, so 500 notes
 * become a worldview she can reason from in chat.
 *
 * Deterministic selection + LLM (or template) consolidation. Budget/Research-Mode
 * gated by the caller. Additive-only — a re-consolidation appends the prior belief
 * as a lore chapter (versioned Chronicle) and never deletes anything.
 */

const BELIEF_COLOR = SPECIAL_COLORS.belief; // heavy indigo — a belief reads distinct in the galaxy
const MIN_CLUSTER = 5; // a belief needs real evidence
const CONFIDENCE_IMPORTANCE = 0.72; // beliefs are weighty → render large

interface Cluster {
  hubId: number;
  memberIds: number[];
  /** An existing belief node already summarizing this hub, if any (→ revise it). */
  existingBeliefId: number | null;
}

/**
 * Pick the cluster most worth consolidating: the highest-degree real memory whose
 * neighborhood (itself + direct neighbors) has ≥ MIN_CLUSTER members and isn't
 * already well-covered by a fresh belief.
 */
function pickCluster(ctx: AppContext, spaceId: string): Cluster | null {
  const s = ctx.handle.sqlite;
  // Candidate hubs: real memories, highest degree first.
  const hubs = s
    .prepare(
      `SELECT n.id,
         (SELECT COUNT(*) FROM edges e WHERE e.space_id = n.space_id AND (e.source = n.id OR e.target = n.id)) AS degree
       FROM nodes n
       WHERE n.space_id = ? AND n.deleted_at IS NULL
         AND (n.kind IS NULL OR n.kind NOT IN ('action','moc','belief'))
       ORDER BY degree DESC LIMIT 20`,
    )
    .all(spaceId) as { id: number; degree: number }[];

  for (const hub of hubs) {
    if (hub.degree < MIN_CLUSTER - 1) break; // sorted desc — nothing dense enough left
    // Members = the hub + its direct neighbor memories (no hubs/actions/beliefs).
    const members = s
      .prepare(
        `SELECT DISTINCT m.id FROM edges e
         JOIN nodes m ON m.id = CASE WHEN e.source = ? THEN e.target ELSE e.source END
         WHERE e.space_id = ? AND (e.source = ? OR e.target = ?)
           AND m.deleted_at IS NULL AND (m.kind IS NULL OR m.kind NOT IN ('action','moc','belief'))`,
      )
      .all(hub.id, spaceId, hub.id, hub.id) as { id: number }[];
    const memberIds = [hub.id, ...members.map((m) => m.id)];
    if (memberIds.length < MIN_CLUSTER) continue;

    // Is a belief already summarizing this hub? (revise rather than duplicate)
    const existing = s
      .prepare(
        `SELECT b.id FROM nodes b
         JOIN edges e ON e.source = b.id AND e.target = ?
         WHERE b.space_id = ? AND b.kind = 'belief' AND b.deleted_at IS NULL
           AND e.relationship = 'summarizes' LIMIT 1`,
      )
      .get(hub.id, spaceId) as { id: number } | undefined;

    // Skip a hub whose belief was refreshed in the last 3 days (don't churn).
    if (existing) {
      const fresh = s
        .prepare(
          `SELECT 1 FROM nodes WHERE id = ? AND last_tended_at > datetime('now','-3 days')`,
        )
        .get(existing.id);
      if (fresh) continue;
    }
    return { hubId: hub.id, memberIds, existingBeliefId: existing?.id ?? null };
  }
  return null;
}

/** Offline template belief when no LLM key is present — grounded in the cluster. */
function templateBelief(labels: string[], avgEw: number): string {
  const theme = labels.slice(0, 3).join(", ");
  const tone =
    avgEw <= -0.3 ? "a recurring weight" : avgEw >= 0.3 ? "a source of energy" : "a steady thread";
  return `A cluster of your memories keeps circling ${theme} — ${tone} in how you think.`;
}

/**
 * Run one dream cycle for a space. Returns the belief node id if one was
 * created/revised, else null. LLM-gated by the caller (pass useLlm=false to force
 * the offline template).
 */
export async function runDreamCycle(
  ctx: AppContext,
  spaceId: string,
  useLlm: boolean,
): Promise<number | null> {
  const cluster = pickCluster(ctx, spaceId);
  if (!cluster) return null;

  const nodesRepo = new NodesRepo(ctx.handle, spaceId);
  const members = nodesRepo.byIds(cluster.memberIds);
  if (members.length < MIN_CLUSTER) return null;

  const avgEw =
    members.reduce((acc, m) => acc + (m.emotionalWeight ?? 0), 0) / members.length;

  // Distill the belief (LLM when allowed + available, else offline template).
  let belief = "";
  let confidence = 0.5;
  if (useLlm && ctx.llm.consolidate) {
    try {
      const out = await ctx.llm.consolidate(members.map((m) => ({ label: m.label, content: m.content })));
      belief = out.belief;
      confidence = out.confidence;
    } catch {
      /* degrade to template */
    }
  }
  if (!belief) {
    belief = templateBelief(members.map((m) => m.label), avgEw);
    confidence = 0.4;
  }

  const label = belief.length > 60 ? `${belief.slice(0, 57)}…` : belief;
  const edges = new EdgesRepo(ctx.handle, spaceId);

  if (cluster.existingBeliefId != null) {
    // REVISE: keep the node (its edges/history), append the OLD text as a lore
    // chapter, update content, re-embed + re-index. Nothing is destroyed.
    const prior = nodesRepo.getById(cluster.existingBeliefId);
    ctx.handle.sqlite
      .prepare(`UPDATE nodes SET label = ?, content = ?, importance = ?, last_tended_at = datetime('now') WHERE id = ? AND space_id = ?`)
      .run(label, belief, Math.max(CONFIDENCE_IMPORTANCE, confidence), cluster.existingBeliefId, spaceId);
    upsertEmbedding(ctx.handle.sqlite, cluster.existingBeliefId, await ctx.embeddings.embed(belief));
    ftsUpsert(ctx.handle.sqlite, cluster.existingBeliefId, label, belief);
    if (prior) evolveLore(ctx.handle, spaceId, "memory", String(cluster.existingBeliefId), "revised");
    // Make sure every current member is still linked.
    for (const m of members) {
      if (!edges.exists(cluster.existingBeliefId, m.id)) {
        edges.create({ source: cluster.existingBeliefId, target: m.id, relationship: "summarizes", weight: 0.85 });
      }
    }
    return cluster.existingBeliefId;
  }

  // CREATE a new belief node summarizing the cluster.
  const node = nodesRepo.create(
    {
      label,
      type: "concept",
      kind: "belief",
      content: belief,
      importance: Math.max(CONFIDENCE_IMPORTANCE, confidence),
      color: BELIEF_COLOR,
      origin: "agent",
    },
    await ctx.embeddings.embed(belief),
  );
  for (const m of members) {
    edges.create({ source: node.id, target: m.id, relationship: "summarizes", weight: 0.85 });
  }
  // Genesis lore chapter so the belief has a story from birth — later revisions
  // append to it (versioned history), never overwrite.
  evolveLore(ctx.handle, spaceId, "memory", String(node.id), "genesis");
  return node.id;
}
