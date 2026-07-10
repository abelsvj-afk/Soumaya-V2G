import type { AppContext } from "../context.js";
import { NodesRepo } from "../repositories/nodes.repo.js";

/**
 * Endowed-progress seed (feature #1c). A brand-new brain shouldn't open on a stark,
 * empty void — motivation research says people persist far more from a non-zero start.
 * So the very first star is already lit: one warm, Soumaya-voiced welcome memory with
 * enough importance to render as a visible body. Idempotent and only ever fires on a
 * genuinely empty space, so the legacy-claiming first account (which inherits real
 * memories) is never touched. Offline-safe — uses whatever embedding provider is set.
 */
export async function seedWelcomeStar(ctx: AppContext, spaceId: string, name: string): Promise<boolean> {
  const s = ctx.handle.sqlite;
  const existing = s.prepare(`SELECT 1 FROM nodes WHERE space_id = ? AND deleted_at IS NULL LIMIT 1`).get(spaceId);
  if (existing) return false; // never overwrite a brain that already has stars

  const who = name.trim() || "you";
  const content =
    `This is where ${who}'s galaxy begins — the first light. Everything you tell me becomes a ` +
    `star here, and I'll quietly draw the lines between them as your constellations grow. ` +
    `Add a thought whenever one lands; I'll be right here, watching it take shape.`;

  const vec = await ctx.embeddings.embed(content);
  new NodesRepo(ctx.handle, spaceId).create(
    { label: "The first light", type: "daily", content, importance: 0.72, origin: "agent" } as never,
    vec,
  );
  return true;
}
