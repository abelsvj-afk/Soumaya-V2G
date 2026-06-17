import type { DailyDigest, DigestEntry, ExpiredAction, GraphNode, NodeRef } from "@brain/shared";
import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { InsightsRepo } from "../repositories/insights.repo.js";

/** YYYY-MM-DD prefix of a stored timestamp (CURRENT_TIMESTAMP or ISO). */
const day = (ts: string | undefined): string => (ts ?? "").slice(0, 10);

const refOf = (n: GraphNode): NodeRef => ({ id: n.id, label: n.label, type: n.type });

const snippetOf = (content: string): string => {
  const s = content.trim().replace(/\s+/g, " ");
  return s.length > 140 ? `${s.slice(0, 137)}…` : s;
};

/**
 * Soumaya's one-line, in-character read on a memory — free (no LLM). Derived
 * from its emotional charge and weight so her take feels grounded in the body's
 * real gravity.
 */
function takeFor(n: GraphNode): string {
  const e = n.emotionalWeight ?? 0;
  const w = n.importance ?? 0.4;
  const heavy = w >= 0.7;
  const light = w <= 0.3;
  if (e <= -0.4) {
    return heavy
      ? "A dense, dark body — strong pull. I'd keep an orbit on this one; it bends the thoughts around it."
      : "Reads cold from up here. Small for now, but worth a fly-by before it drifts.";
  }
  if (e >= 0.4) {
    return heavy
      ? "Burning bright and massive — a little sun. Other memories will start to circle it."
      : "A warm little spark. Pleasant to pass through.";
  }
  if (heavy) return "Carries real mass. It's anchoring this sector.";
  if (light) return "A faint drifter for now — let's see what it links to.";
  return "Steady signal, holding its lane.";
}

/**
 * Action items that timed out, recovered from the activity log (the bodies
 * themselves are gone). We logged them as `action_expired` with the labels in the
 * description: "Action items timed out: a; b; c".
 */
function expiredActionsToday(h: DbHandle, today: string, spaceId: string): ExpiredAction[] {
  let rows: { description: string; created_at: string }[] = [];
  try {
    rows = h.sqlite
      .prepare(
        `SELECT description, created_at FROM agent_logs
         WHERE space_id = ? AND action = 'action_expired' AND substr(created_at, 1, 10) = ?
         ORDER BY id DESC`,
      )
      .all(spaceId, today) as { description: string; created_at: string }[];
  } catch {
    return [];
  }
  const out: ExpiredAction[] = [];
  for (const r of rows) {
    const after = r.description.split("timed out:")[1] ?? "";
    for (const label of after.split(";")) {
      const l = label.trim();
      if (l) out.push({ label: l, clearedAt: r.created_at });
    }
  }
  return out;
}

/**
 * Assemble Soumaya's daily digest from existing data only — NO LLM call, so it's
 * free and always available even offline. Combines fresh memories (with her
 * take + a link), the latent connections she's surfaced, and the day's expired
 * action items.
 */
export function buildDailyDigest(h: DbHandle, spaceId: string = DEFAULT_SPACE): DailyDigest {
  const today = new Date().toISOString().slice(0, 10);
  const nodesRepo = new NodesRepo(h, spaceId);

  // Fresh, real memories logged today (action items are summarized separately).
  const fresh: DigestEntry[] = nodesRepo
    .recent(60)
    .filter((n) => n.kind !== "action" && day(n.createdAt) === today)
    .slice(0, 8)
    .map((n) => ({ node: refOf(n), snippet: snippetOf(n.content), take: takeFor(n) }));

  const connections = new InsightsRepo(h, spaceId).recent(5);
  const expiredActions = expiredActionsToday(h, today, spaceId);

  const newCount = fresh.length;
  const greeting =
    newCount > 0
      ? `Made my rounds. ${newCount} new ${newCount === 1 ? "body" : "bodies"} lit up in your galaxy today — here's what I logged.`
      : "Quiet pass today — no new bodies on the charts. Here's what's still worth your attention.";

  const bits: string[] = [];
  if (connections.length > 0)
    bits.push(`I also traced ${connections.length} faint link${connections.length === 1 ? "" : "s"} between distant sectors`);
  if (expiredActions.length > 0)
    bits.push(`${expiredActions.length} action item${expiredActions.length === 1 ? "" : "s"} burned up on schedule`);
  const closing =
    bits.length > 0
      ? `${bits.join(" and ")}. Course steady — I'll keep watch from up here.`
      : "All quiet on the charts. I'll keep drifting and let you know what I find.";

  return { date: today, greeting, fresh, connections, expiredActions, closing };
}
