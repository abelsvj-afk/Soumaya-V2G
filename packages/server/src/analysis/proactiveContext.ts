import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import { FinGoalRepo } from "../repositories/finGoal.repo.js";
import { goalAllocationChange } from "./temporalChange.js";

/**
 * Proactive → Chat context handoff (Phase Y,
 * docs/specs/soumaya-proactive-chat-handoff.md). When the user opens Chat from a
 * proactive toast (Phase X's `goal_trend` pilot), Chat must know WHY the conversation
 * exists without the user re-explaining it, and without a second copy of the
 * intelligence that triggered it.
 *
 * This module deliberately does NOT recompute a different trigger algorithm — for
 * `source: "goal_trend"` it calls the SAME `goalAllocationChange()` Phase X's
 * `detect()` already uses, fresh, at the moment Chat asks (exactly like
 * `analysis/causal.ts` already re-derives `incomeChange`/`netWorthChange`/
 * `goalAllocationChange` fresh on every chat turn — this is the SAME established
 * pattern, not a new one). If the goal no longer exists (wrong space, deleted, or a
 * stale/forged id) or the underlying evidence no longer holds, this returns `null` —
 * Chat proceeds completely normally with no proactive framing, never a broken turn.
 *
 * Ephemeral by construction: nothing here is ever written to `nodes`, `agent_logs`,
 * or any other table — it's a pure read, computed fresh per call, never persisted.
 */

export type ProactiveContextSource = "goal_trend";

export interface ProactiveContextInput {
  source: ProactiveContextSource;
  targetId: number;
}

/**
 * Returns a short, clearly-labeled `systemExtra` block naming WHY this conversation
 * was proactively initiated, or `null` when the context can't be honestly asserted
 * (unknown source, wrong space, deleted goal, or the trend no longer compares).
 * Never invents a cause beyond what the existing intelligence actually established.
 */
export function proactiveContextSnapshotText(
  handle: DbHandle,
  spaceId: string = DEFAULT_SPACE,
  input: ProactiveContextInput | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!input) return null;
  if (input.source === "goal_trend") return goalTrendContextText(handle, spaceId, input.targetId, now);
  return null; // unknown/future source — silently ignored, never guessed at
}

function goalTrendContextText(handle: DbHandle, spaceId: string, goalId: number, now: Date): string | null {
  // Space-scoped by construction (FinGoalRepo.get only ever reads THIS space's rows) —
  // a cross-space or stale goal id simply resolves to null, same "invalid → silently
  // contributes nothing" contract chat()'s existing journeyId parameter already uses.
  const goal = new FinGoalRepo(handle, spaceId).get(goalId);
  if (!goal) return null;

  // Re-derive the SAME comparison Phase X's detect() used — not a new algorithm, the
  // one that already exists. If it no longer compares (e.g. the goal's history
  // changed since the toast fired), don't assert a claim the intelligence no longer
  // supports.
  const change = goalAllocationChange(handle, spaceId, goal, now);
  if (change.status !== "compared" || change.direction === "unchanged") return null;

  const amt = `$${Math.round(Math.abs(change.deltaCents) / 100)}`;
  return `PROACTIVE CONTEXT (why this conversation was initiated): You reached out to the user first this conversation because "${goal.name}"'s funding allocation ${change.direction} by about ${amt} across two consecutive periods — a real, sustained change, not a one-off. This is why you're speaking with them right now. Explain naturally in your own words if they ask; don't force the topic if they've clearly come to talk about something else.`;
}
