import type { AppContext } from "../context.js";
import type { GraphNode } from "@brain/shared";
import { SPECIAL_COLORS } from "@brain/shared";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { EdgesRepo } from "../repositories/edges.repo.js";
import { GraphService } from "../graph/service.js";
import { findConstellations } from "../ml/cluster.js";

/**
 * Constellations (MOC hubs). `promoteConstellation` turns a set of member memories into
 * a persistent `moc` hub that summarizes + links them (shared by the manual route AND
 * the auto-proposal flow). `suggestHub` finds a dense, un-hubbed cluster worth naming —
 * Soumaya proposes it as a `hub_suggestion` inquiry (feature #5c). Offline-safe.
 */

const MIN_HUB_MEMBERS = 5; // a cluster worth naming a constellation
const MIN_COHESION = 0.5; // must be genuinely tight, not a loose grab-bag

/** Promote member memories into a named constellation hub. Returns the enriched hub. */
export async function promoteConstellation(
  ctx: AppContext,
  spaceId: string,
  name: string,
  memberIds: number[],
): Promise<GraphNode | null> {
  const nodesRepo = new NodesRepo(ctx.handle, spaceId);
  const members = nodesRepo.byIds(memberIds).filter((n) => n.kind !== "action" && n.kind !== "moc");
  if (members.length < 2) return null;

  let summary: string;
  try {
    summary = await ctx.llm.summarizeSector(members.map((m) => ({ label: m.label, content: m.content })));
  } catch {
    summary = `Consolidates ${members.length} memories: ${members.slice(0, 5).map((m) => m.label).join(", ")}.`;
  }

  const vec = await ctx.embeddings.embed(`${name}. ${summary}`);
  const hub = nodesRepo.create(
    {
      label: name,
      type: "moc",
      kind: "moc",
      content: summary,
      importance: 0.7,
      color: SPECIAL_COLORS.constellation,
      origin: "agent",
    } as never,
    vec,
  );

  const edgesRepo = new EdgesRepo(ctx.handle, spaceId);
  for (const m of members) {
    if (!edgesRepo.exists(hub.id, m.id)) {
      edgesRepo.create({ source: hub.id, target: m.id, relationship: "summarizes", weight: 0.9 });
    }
  }
  return new GraphService(ctx.handle, spaceId).getNode(hub.id) ?? null;
}

/**
 * The densest un-hubbed cluster worth proposing as a constellation, or null. A member
 * counts as "already hubbed" if a `moc` summarizes it; a cluster is skipped once most
 * of it is hubbed.
 */
export function suggestHub(ctx: AppContext, spaceId: string): { name: string; memberIds: number[] } | null {
  const clusters = findConstellations(ctx.handle, {}, spaceId);
  if (clusters.length === 0) return null;

  const hubbed = new Set(
    (ctx.handle.sqlite
      .prepare(
        `SELECT e.target AS id FROM edges e JOIN nodes m ON m.id = e.source
         WHERE e.space_id = ? AND e.relationship = 'summarizes' AND m.kind = 'moc' AND m.deleted_at IS NULL`,
      )
      .all(spaceId) as { id: number }[]).map((r) => r.id),
  );

  const eligible = clusters
    .map((c) => ({ name: c.name, ids: c.nodes.map((n) => n.id), cohesion: c.cohesion }))
    .filter((c) => c.ids.length >= MIN_HUB_MEMBERS && c.cohesion >= MIN_COHESION)
    // Skip clusters already mostly under a hub.
    .filter((c) => c.ids.filter((id) => hubbed.has(id)).length < c.ids.length / 2)
    .sort((a, b) => b.ids.length * b.cohesion - a.ids.length * a.cohesion);

  const best = eligible[0];
  return best ? { name: best.name, memberIds: best.ids } : null;
}
