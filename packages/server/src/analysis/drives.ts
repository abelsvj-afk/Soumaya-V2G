import { COGNITIVE_META } from "@brain/shared";
import type { AppContext } from "../context.js";
import { NodesRepo } from "../repositories/nodes.repo.js";

/**
 * Drives (Cognitive Layer Phase 7, docs/COGNITIVE_LAYER.md) — the two remaining
 * dynamic kinds:
 *
 *   • INTENTION (🌠, ephemeral comet) — a short-lived plan. If a memory comes to
 *     support it, you ACTED on it → it's fulfilled and settles into memory. If it's
 *     never acted on, it EXPIRES and fades, like a comet passing through.
 *
 *   • MOTIVATION (🔥, gravity well) — a durable drive. It doesn't complete; it
 *     BRIGHTENS as more of your memories align with it, so a strong motivation
 *     becomes a heavy gravity well pulling behavior toward it.
 *
 * Deterministic + offline. Run each autonomy tick.
 */

const MOTIVATION = COGNITIVE_META.motivation;
/** An unreinforced intention fades after this long (a comet's short arc). */
const INTENTION_TTL_DAYS = 10;
/** Importance a motivation gains from fully-aligned support (0.72 → 0.94). */
const MOTIVATION_BRIGHT = 0.22;
/** Aligned memories that make a motivation a full-strength gravity well. */
const MOTIVATION_TARGET = 6;

function supportCount(ctx: AppContext, spaceId: string, id: number): number {
  return (ctx.handle.sqlite
    .prepare(`SELECT COUNT(*) AS c FROM edges WHERE space_id = ? AND target = ? AND relationship = 'supports'`)
    .get(spaceId, id) as { c: number }).c;
}
function ageDays(ctx: AppContext, spaceId: string, id: number): number {
  const r = ctx.handle.sqlite
    .prepare(`SELECT julianday('now') - julianday(created_at) AS d FROM nodes WHERE id = ? AND space_id = ?`)
    .get(id, spaceId) as { d: number } | undefined;
  return r ? r.d : 0;
}

export interface DrivesStep {
  fulfilled: number;
  expired: number;
  brightened: number;
}

/** Advance intentions (fulfill/expire) and brighten motivations. Free/offline. */
export function stepDrives(ctx: AppContext, spaceId: string): DrivesStep {
  const s = ctx.handle.sqlite;
  const repo = new NodesRepo(ctx.handle, spaceId);
  const step: DrivesStep = { fulfilled: 0, expired: 0, brightened: 0 };

  // ── INTENTIONS: fulfilled if acted on, else fade when their arc runs out. ────
  const intentions = s
    .prepare(`SELECT id, label FROM nodes WHERE space_id = ? AND deleted_at IS NULL AND kind = 'intention'`)
    .all(spaceId) as { id: number; label: string }[];
  for (const it of intentions) {
    if (supportCount(ctx, spaceId, it.id) > 0) {
      // You acted on it → it became real. Settle it into memory.
      s.prepare(
        `UPDATE nodes SET kind = 'memory', type = 'daily', last_tended_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?`,
      ).run(it.id, spaceId);
      step.fulfilled++;
      try {
        s.prepare(`INSERT INTO agent_logs (space_id, action, description, targets) VALUES (?, 'intention_fulfilled', ?, ?)`).run(
          spaceId,
          `You followed through on an intention: "${it.label}"`,
          JSON.stringify([it.id]),
        );
      } catch {
        /* best-effort */
      }
    } else if (ageDays(ctx, spaceId, it.id) > INTENTION_TTL_DAYS) {
      repo.delete(it.id);
      step.expired++;
      try {
        s.prepare(`INSERT INTO agent_logs (space_id, action, description, targets) VALUES (?, 'intention_expired', ?, ?)`).run(
          spaceId,
          `An intention passed without action: "${it.label}"`,
          JSON.stringify([it.id]),
        );
      } catch {
        /* best-effort */
      }
    }
  }

  // ── MOTIVATIONS: brighten with aligned memories (a growing gravity well). ────
  const motivations = s
    .prepare(`SELECT id, importance FROM nodes WHERE space_id = ? AND deleted_at IS NULL AND kind = 'motivation'`)
    .all(spaceId) as { id: number; importance: number | null }[];
  for (const m of motivations) {
    const aligned = Math.min(1, supportCount(ctx, spaceId, m.id) / MOTIVATION_TARGET);
    const next = MOTIVATION.importance + aligned * MOTIVATION_BRIGHT;
    if (Math.abs((m.importance ?? MOTIVATION.importance) - next) > 0.001) {
      s.prepare(`UPDATE nodes SET importance = ? WHERE id = ? AND space_id = ?`).run(next, m.id, spaceId);
      step.brightened++;
    }
  }

  return step;
}
