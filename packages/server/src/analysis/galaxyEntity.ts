import { NODE_TYPE_LABEL, type GalaxyEntityDescriptor, type GalaxyEntityKind, type NavigationIntent } from "@brain/shared";
import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { JourneysRepo } from "../repositories/journeys.repo.js";
import { FinGoalRepo } from "../repositories/finGoal.repo.js";
import { moneySky } from "../finance/sky.js";
import { toIsoDate, daysSince } from "../lib/time.js";

const CONTENT_PREVIEW_LEN = 140;

/**
 * Galaxy Entity Intelligence (docs/specs/maya-intelligence-architecture.md, Part I3). Resolves
 * ANY meaningful Galaxy body into a stable `GalaxyEntityDescriptor` — closing the confirmed gap
 * that memory/MOC bodies already resolve (via the existing `GET /api/nodes/:id`) while Journey
 * hubs and Money-sky stars carry real ids in Three.js `userData` with nothing server-side able
 * to turn them into a human-meaning description. Deliberately reuses EXISTING deterministic
 * computation rather than re-deriving it: a bill/goal's `state` comes straight from
 * `finance/sky.ts`'s `moneySky()` (the exact same math already driving how the star looks), a
 * journey's from `JourneysRepo`, a memory's from `NodesRepo` — never a second source of truth,
 * never LLM-authored. Pure, synchronous, single-row/bounded-query lookups only (Part IX) — no
 * embeddings, no LLM call, no full-table scan.
 */
export function resolveGalaxyEntity(
  handle: DbHandle,
  spaceId: string = DEFAULT_SPACE,
  kind: GalaxyEntityKind,
  id: number,
  now: Date = new Date(),
): GalaxyEntityDescriptor | null {
  if (kind === "node") return resolveNode(handle, spaceId, id, now);
  if (kind === "journey") return resolveJourney(handle, spaceId, id);
  return resolveMoneyStar(handle, spaceId, kind, id, now);
}

/**
 * The bounded reason a click/query-triggered Galaxy navigation to this body is meaningful
 * (Part I3) — literally the descriptor's own already-computed `state`, never a separate
 * invented sentence. Kept as its own tiny function (rather than folding `reason` directly
 * into the descriptor) so `NavigationIntent` stays a distinct, reusable concept a future
 * Maya-initiated navigation trigger can also construct from other real context (a causal
 * link's `effectDescription`, a clarification's `confirmedStatement`) without depending on
 * a Galaxy body resolution at all.
 */
export function navigationIntentFor(descriptor: GalaxyEntityDescriptor): NavigationIntent {
  return { target: descriptor.ref, reason: descriptor.state };
}

function resolveNode(handle: DbHandle, spaceId: string, id: number, now: Date): GalaxyEntityDescriptor | null {
  const node = new NodesRepo(handle, spaceId).getById(id);
  if (!node) return null;
  const when = node.occurredAt ?? node.createdAt;
  const days = daysSince(when, now.getTime());
  const recency = days == null ? "" : days <= 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;
  const preview = node.content.length > CONTENT_PREVIEW_LEN ? `${node.content.slice(0, CONTENT_PREVIEW_LEN - 3)}...` : node.content;
  const typeLabel = NODE_TYPE_LABEL[node.type] ?? node.type;
  return {
    ref: { domain: "memory", kind: "node", id: node.id, label: node.label },
    state: recency ? `${typeLabel} memory from ${recency} — ${preview}` : `${typeLabel} memory — ${preview}`,
    temporal: when ?? undefined,
    navigable: true,
  };
}

function resolveJourney(handle: DbHandle, spaceId: string, id: number): GalaxyEntityDescriptor | null {
  const repo = new JourneysRepo(handle, spaceId);
  const journey = repo.get(id);
  if (!journey) return null;
  const linkCount = repo.links(id).length;
  const pct = Math.round((journey.progress ?? 0) * 100);
  const linkedNote = linkCount === 0 ? "nothing linked yet" : linkCount === 1 ? "1 linked item" : `${linkCount} linked items`;
  return {
    ref: { domain: "journey", kind: "journey", id: journey.id, label: journey.title },
    state: `${journey.status === "active" ? "Active" : journey.status === "done" ? "Completed" : "Paused"} journey — ${pct}% along, ${linkedNote}`,
    temporal: journey.updatedAt,
    navigable: true,
  };
}

/** Bills and goals are both rendered as Money-sky stars — `moneySky()` already computes their
 *  exact display state (overdue/cooling/approaching/calm, or goal fill %); this reuses that
 *  computation verbatim rather than re-deriving due-date or funding math a second time. */
function resolveMoneyStar(
  handle: DbHandle,
  spaceId: string,
  kind: "bill" | "goal",
  id: number,
  now: Date,
): GalaxyEntityDescriptor | null {
  const star = moneySky(handle, spaceId, now).find((s) => s.kind === kind && s.id === id);
  if (!star) return null;

  const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  let state: string;
  let temporal: string | undefined;
  if (star.kind === "bill") {
    const dueDate = star.dueInDays != null ? toIsoDate(new Date(now.getTime() + star.dueInDays * 86_400_000)) : undefined;
    temporal = dueDate;
    state =
      star.state === "overdue"
        ? `Overdue by ${Math.abs(star.dueInDays ?? 0)} day${Math.abs(star.dueInDays ?? 0) === 1 ? "" : "s"} — ${dollars(star.amountCents)}`
        : star.state === "cooling"
          ? `Due in ${star.dueInDays ?? "?"} days — ${dollars(star.amountCents)}, may not be comfortably covered`
          : star.state === "approaching"
            ? `Due in ${star.dueInDays ?? "?"} days — ${dollars(star.amountCents)}`
            : `Bill — ${dollars(star.amountCents)}, next due in ${star.dueInDays ?? "?"} days`;
  } else {
    // MoneyStar.amountCents for a goal is the SAVED total (finance/wealth.ts's `totalCents`),
    // not the target — the target itself isn't carried on MoneyStar, so it's read directly
    // from `fin_goal` (the authoritative row) rather than back-derived from fillPct, which
    // would just reintroduce rounding error for a number that already exists verbatim.
    const goal = new FinGoalRepo(handle, spaceId).get(id);
    temporal = goal?.targetDate ?? undefined;
    state =
      star.state === "goal_reached"
        ? `Goal reached — ${dollars(star.amountCents)} saved`
        : goal?.targetCents
          ? `${Math.round((star.fillPct ?? 0) * 100)}% funded — ${dollars(star.amountCents)} of ${dollars(goal.targetCents)}`
          : `Open-ended goal — ${dollars(star.amountCents)} saved so far`;
  }

  return {
    ref: { domain: "money", kind: star.kind === "bill" ? "fin_bill" : "fin_goal", id: star.id, label: star.label },
    state,
    temporal,
    navigable: true,
  };
}
