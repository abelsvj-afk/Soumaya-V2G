import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import { FinGoalRepo } from "../repositories/finGoal.repo.js";
import { FinBillRepo } from "../repositories/finBill.repo.js";
import { goalAllocationChange } from "./temporalChange.js";
import { getBudgetSummary } from "../finance/summary.js";
import { parseDay } from "../finance/bills.js";

/**
 * Proactive → Chat context handoff (Phase Y, docs/specs/soumaya-proactive-chat-handoff.md;
 * Phase Z, docs/specs/soumaya-bill-risk-proactive-source.md). When the user opens Chat from
 * a proactive toast (Phase X's `goal_trend` pilot, Phase Z's `bill_risk` pilot), Chat must
 * know WHY the conversation exists without the user re-explaining it, and without a second
 * copy of the intelligence that triggered it.
 *
 * This module deliberately does NOT recompute a different trigger algorithm for either
 * source — `goal_trend` calls the SAME `goalAllocationChange()` Phase X's `detect()` uses;
 * `bill_risk` calls the SAME `getBudgetSummary()` bill_risk's own `detect()` uses — fresh, at
 * the moment Chat asks (exactly like `analysis/causal.ts` already re-derives
 * `incomeChange`/`netWorthChange`/`goalAllocationChange` fresh on every chat turn — the SAME
 * established pattern, not a new one). If the target no longer exists (wrong space, deleted,
 * or a stale/forged id) or the underlying evidence no longer holds, this returns `null` —
 * Chat proceeds completely normally with no proactive framing, never a broken turn.
 *
 * Ephemeral by construction: nothing here is ever written to `nodes`, `agent_logs`,
 * or any other table — it's a pure read, computed fresh per call, never persisted.
 *
 * Phase Z confirms `{source, targetId}` generalizes cleanly: both sources reduce to "a
 * space-scoped integer id on a table with its own `get(id)` repo method." Only the dispatch
 * below and the route's zod literal needed to grow — no new payload shape, no framework.
 */

export type ProactiveContextSource = "goal_trend" | "bill_risk";

export interface ProactiveContextInput {
  source: ProactiveContextSource;
  targetId: number;
}

/**
 * Returns a short, clearly-labeled `systemExtra` block naming WHY this conversation
 * was proactively initiated, or `null` when the context can't be honestly asserted
 * (unknown source, wrong space, deleted target, or the underlying signal no longer holds).
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
  if (input.source === "bill_risk") return billRiskContextText(handle, spaceId, input.targetId, now);
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

const DAY_MS = 86_400_000;
const dollars = (cents: number): string => `$${Math.round(cents / 100)}`;

/**
 * Re-derives whether THIS SPECIFIC bill is still the reason bill_risk fired — using the
 * exact same authoritative read (`getBudgetSummary`) and the exact same "tight" condition
 * `agent/tools/billRisk.ts`'s own `detect()` uses, just targeted at one bill instead of
 * scanning for "the earliest at-risk one." This is a parameterization of the same evidence,
 * not a second risk algorithm — mirrors `goalTrendContextText` re-deriving one specific
 * goal's comparison rather than re-running goal_trend's own candidate-selection loop.
 *
 * `billRiskTool.detect()` itself is NOT called here: its own once-a-day gate would return
 * `[]` on the very day it just fired (the day Chat is most likely to be asked "why?"), which
 * would make this always report "not at risk" right when it matters most. Re-deriving the
 * risk condition directly avoids that false negative while still asserting nothing beyond
 * what the same underlying numbers show right now.
 */
function billRiskContextText(handle: DbHandle, spaceId: string, billId: number, now: Date): string | null {
  const bill = new FinBillRepo(handle, spaceId).get(billId);
  if (!bill) return null;
  if (bill.autopay) return null; // autopay bills are never the risk target (detect()'s own rule)

  const budget = getBudgetSummary(handle, spaceId, now);
  const reserved = budget.reserved.find((r) => r.billId === billId);
  if (!reserved) return null; // no longer reserved/relevant — don't assert stale info

  const tight = budget.shortfallCents > 0 || budget.safeToSpendCents <= reserved.amountCents;
  if (!tight) return null; // the cushion is no longer thin — the risk that triggered this has resolved

  if (budget.shortfallCents > 0) {
    return `PROACTIVE CONTEXT (why this conversation was initiated): You reached out to the user first this conversation because their budget is currently ${dollars(budget.shortfallCents)} short to cover "${bill.name}" (due ${reserved.dueDate}) — a real cushion shortfall, not a guess. This is why you're speaking with them right now. Explain naturally in your own words if they ask; don't force the topic if they've clearly come to talk about something else.`;
  }
  const today = now.toISOString().slice(0, 10);
  const days = Math.max(1, Math.round((parseDay(reserved.dueDate).getTime() - parseDay(today).getTime()) / DAY_MS));
  const perDay = Math.floor(budget.safeToSpendCents / days);
  return `PROACTIVE CONTEXT (why this conversation was initiated): You reached out to the user first this conversation because their spending pace needs to stay under ${dollars(perDay)}/day to keep "${bill.name}" (due ${reserved.dueDate}) covered — the cushion is genuinely thin right now, not a guess. This is why you're speaking with them right now. Explain naturally in your own words if they ask; don't force the topic if they've clearly come to talk about something else.`;
}
