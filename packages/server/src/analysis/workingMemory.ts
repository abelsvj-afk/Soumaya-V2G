import type { AppContext } from "../context.js";
import { NodesRepo } from "../repositories/nodes.repo.js";

/**
 * Working Memory (Cognitive Layer Phase 2, docs/COGNITIVE_LAYER.md) — the ephemeral
 * "mind space": what you're thinking NOW. Each thought is a mote with a 0..1
 * strength that DECAYS with elapsed time unless reinforced. Motes that keep coming
 * back (reinforced enough) are CONSOLIDATED into the permanent galaxy as real nodes
 * (short-term → long-term memory); the rest quietly evaporate.
 *
 * Deliberately offline + deterministic: adding/decaying/reinforcing never touches the
 * LLM. Only promotion embeds (to place the new node in the galaxy). Decay is computed
 * in SQL via julianday() so it's DB-consistent and testable by backdating timestamps.
 */

/** Charge lost per hour since a thought was last reinforced. ~0.6 → 0 in ~7.5h. */
const DECAY_PER_HOUR = 0.08;
/** Reinforcing tops the thought back up by this much (capped at 1). */
const REINFORCE_BUMP = 0.3;
/** Reinforced this many times → it clearly matters → auto-consolidate to a memory. */
const PROMOTE_COUNT = 3;
/** Soft cap on live motes per brain; the weakest beyond this are trimmed on add. */
const MAX_MOTES = 30;

/** Initial charge by source — a deliberate thought holds longer than a stray one. */
const SOURCE_STRENGTH: Record<string, number> = {
  manual: 0.62,
  chat: 0.5,
  goal: 0.72,
  priority: 0.72,
  emotion: 0.55,
};

/** The live decay expression (effective strength right now), clamped at 0. */
const EFFECTIVE = `max(0.0, strength - ${DECAY_PER_HOUR} * (julianday('now') - julianday(reinforced_at)) * 24)`;

export interface Thought {
  id: number;
  text: string;
  source: string;
  strength: number; // effective (decayed) strength, 0..1
  reinforceCount: number;
  createdAt: string;
}

/** Add a thought to the mind space (offline; no embedding until promotion). */
export function addThought(
  ctx: AppContext,
  spaceId: string,
  text: string,
  source = "manual",
): number {
  const s = ctx.handle.sqlite;
  const strength = SOURCE_STRENGTH[source] ?? 0.6;
  const id = Number(
    s
      .prepare(
        `INSERT INTO working_memory (space_id, text, source, strength) VALUES (?, ?, ?, ?)`,
      )
      .run(spaceId, text.slice(0, 500), source, strength).lastInsertRowid,
  );
  // Keep the mind space bounded: if we're over the cap, drop the weakest motes.
  const count = (s.prepare(`SELECT COUNT(*) AS c FROM working_memory WHERE space_id = ?`).get(spaceId) as { c: number }).c;
  if (count > MAX_MOTES) {
    s.prepare(
      `DELETE FROM working_memory WHERE id IN (
         SELECT id FROM working_memory WHERE space_id = ? ORDER BY ${EFFECTIVE} ASC, id ASC LIMIT ?
       )`,
    ).run(spaceId, count - MAX_MOTES);
  }
  return id;
}

/** List live thoughts (decayed strength, strongest first). Evaporated ones omitted. */
export function listThoughts(ctx: AppContext, spaceId: string): Thought[] {
  const rows = ctx.handle.sqlite
    .prepare(
      `SELECT id, text, source, ${EFFECTIVE} AS eff, reinforce_count AS reinforceCount, created_at AS createdAt
       FROM working_memory WHERE space_id = ? AND ${EFFECTIVE} > 0
       ORDER BY eff DESC, id DESC LIMIT ${MAX_MOTES}`,
    )
    .all(spaceId) as (Omit<Thought, "strength"> & { eff: number })[];
  return rows.map(({ eff, ...r }) => ({ ...r, strength: eff }));
}

/**
 * Reinforce a thought (you returned to it): top its charge back up, bump its count,
 * reset the decay clock. If it crosses the promotion threshold it consolidates into
 * the galaxy right away. Returns the new node id if it was promoted, else null (and
 * false if the id doesn't exist).
 */
export async function reinforceThought(
  ctx: AppContext,
  spaceId: string,
  id: number,
): Promise<{ ok: boolean; promotedNodeId: number | null }> {
  const s = ctx.handle.sqlite;
  const changed = s
    .prepare(
      `UPDATE working_memory
         SET strength = min(1.0, ${EFFECTIVE} + ${REINFORCE_BUMP}),
             reinforce_count = reinforce_count + 1,
             reinforced_at = CURRENT_TIMESTAMP
       WHERE id = ? AND space_id = ?`,
    )
    .run(id, spaceId).changes;
  if (changed === 0) return { ok: false, promotedNodeId: null };
  const row = s
    .prepare(`SELECT reinforce_count AS c FROM working_memory WHERE id = ? AND space_id = ?`)
    .get(id, spaceId) as { c: number } | undefined;
  if (row && row.c >= PROMOTE_COUNT) {
    const nodeId = await promoteThought(ctx, spaceId, id);
    return { ok: true, promotedNodeId: nodeId };
  }
  return { ok: true, promotedNodeId: null };
}

/** Edit a thought's text (keeps its strength + decay clock). Returns true if it exists. */
export function editThought(ctx: AppContext, spaceId: string, id: number, text: string): boolean {
  return (
    ctx.handle.sqlite
      .prepare(`UPDATE working_memory SET text = ? WHERE id = ? AND space_id = ?`)
      .run(text.slice(0, 500), id, spaceId).changes > 0
  );
}

/** Dismiss a thought (let it go). Returns true if one was removed. */
export function dismissThought(ctx: AppContext, spaceId: string, id: number): boolean {
  return (
    ctx.handle.sqlite
      .prepare(`DELETE FROM working_memory WHERE id = ? AND space_id = ?`)
      .run(id, spaceId).changes > 0
  );
}

/**
 * Consolidate a thought into the permanent galaxy: create a real memory node
 * (embedded, so it links + gains gravity normally), remove the mote, and log it.
 * Returns the new node id, or null if the thought no longer exists.
 */
export async function promoteThought(
  ctx: AppContext,
  spaceId: string,
  id: number,
): Promise<number | null> {
  const s = ctx.handle.sqlite;
  const row = s
    .prepare(`SELECT text FROM working_memory WHERE id = ? AND space_id = ?`)
    .get(id, spaceId) as { text: string } | undefined;
  if (!row) return null;
  const label = row.text.length > 60 ? row.text.slice(0, 57).trimEnd() + "…" : row.text;
  const node = new NodesRepo(ctx.handle, spaceId).create(
    { label, type: "daily", kind: "memory", content: row.text, origin: "user" },
    await ctx.embeddings.embed(row.text),
  );
  s.prepare(`DELETE FROM working_memory WHERE id = ? AND space_id = ?`).run(id, spaceId);
  try {
    s.prepare(
      `INSERT INTO agent_logs (space_id, action, description, targets) VALUES (?, 'consolidated', ?, ?)`,
    ).run(spaceId, `A recurring thought settled into memory: "${label}"`, JSON.stringify([node.id]));
  } catch {
    /* logging is best-effort */
  }
  return node.id;
}

/**
 * The mind-space sweep (free, offline autonomy step): evaporate fully-decayed motes,
 * then consolidate any that have been reinforced enough to have earned a place in
 * long-term memory. Returns { evaporated, promoted } counts.
 */
export async function sweepWorkingMemory(
  ctx: AppContext,
  spaceId: string,
): Promise<{ evaporated: number; promoted: number }> {
  const s = ctx.handle.sqlite;
  const evaporated = s
    .prepare(`DELETE FROM working_memory WHERE space_id = ? AND ${EFFECTIVE} <= 0`)
    .run(spaceId).changes;
  // Auto-consolidate survivors that kept coming back.
  const ready = s
    .prepare(
      `SELECT id FROM working_memory WHERE space_id = ? AND reinforce_count >= ? ORDER BY id ASC`,
    )
    .all(spaceId, PROMOTE_COUNT) as { id: number }[];
  let promoted = 0;
  for (const r of ready) {
    const nodeId = await promoteThought(ctx, spaceId, r.id);
    if (nodeId != null) promoted++;
  }
  return { evaporated, promoted };
}
