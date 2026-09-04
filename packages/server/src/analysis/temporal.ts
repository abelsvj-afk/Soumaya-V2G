import type { TemporalState } from "@brain/shared";
import { daysSince, daysUntil } from "../lib/time.js";
import { INCOME_STALE_DAYS, ASSET_STALE_DAYS } from "../agent/tools/financeFreshness.js";
import { SOON_DAYS as BILL_SOON_DAYS } from "../finance/sky.js";
import { DORMANT_DAYS } from "./dormant.js";

/**
 * Deterministic temporal classification (docs/specs/temporal-contextual-reasoning.md). Pure
 * functions only — no DB, no LLM. Each classifier takes the SAME authoritative date the rest of
 * the app already reads (a bill's due date, a goal's target date, an income row's business
 * date, ...) plus an explicit `nowMs`, and returns one of the six `TemporalState`s. Nothing here
 * ever reads `Date.now()`/`new Date()` internally — see `lib/time.ts`'s module doc for why an
 * injectable clock matters for testability.
 *
 * THRESHOLDS — reused where an existing one already exists, smallest-new-explicit-number where
 * it doesn't (audited first; see the repo-wide audit this feature's implementation report cites):
 *
 *  - `INCOME_STALE_DAYS` (20) / `ASSET_STALE_DAYS` (30) — reused verbatim from
 *    `agent/tools/financeFreshness.ts`, which already owns these numbers for Money/Wealth
 *    freshness nudges. This module does NOT redefine them.
 *  - `BILL_SOON_DAYS` (7) — reused verbatim from `finance/sky.ts`'s `SOON_DAYS`, the existing
 *    "due soon" horizon the Money-sky galaxy view already uses for bills.
 *  - `GOAL_ALLOCATION_STALE_DAYS` (90) — NEW. No existing Wealth-side staleness threshold
 *    covered "a goal hasn't been allocated to in a while" before this feature.
 *  - `VISION_APPROACHING_DAYS` (14) — NEW. No existing Life-Vision temporal threshold existed.
 *  - `JOURNEY_INACTIVE_DAYS` (30) — NEW, but mirrors `analysis/dormant.ts`'s `DORMANT_DAYS`
 *    (imported directly, not redefined) — the closest existing "N days untouched is notable"
 *    precedent in the repo, applied to Journeys (which have no threshold of their own; Journeys
 *    carry no date-range fields at all, only `updatedAt` — confirmed by this feature's audit).
 *  - `RECENT_WINDOW_DAYS` (7) — NEW. A generic "this just happened" framing for facts with no
 *    domain-specific recency constant of their own (e.g. a person interaction) — chosen to match
 *    `BILL_SOON_DAYS`'s existing week-based cadence rather than inventing an unrelated number.
 */

export { INCOME_STALE_DAYS, ASSET_STALE_DAYS, BILL_SOON_DAYS, DORMANT_DAYS as JOURNEY_INACTIVE_DAYS };
export const GOAL_ALLOCATION_STALE_DAYS = 90;
export const VISION_APPROACHING_DAYS = 14;
export const RECENT_WINDOW_DAYS = 7;

/**
 * A fact with a due/target date: a bill's `dueDate`, a Wealth goal's `targetDate`, a Life
 * Vision's target date. `overdue` once the date has passed with nothing resolving it (this
 * module has no notion of "paid"/"done" — a caller that already knows a bill was paid should
 * simply not call this for it); `current` the day of; `upcoming` within `withinDays`; `null`
 * when it's further out than `withinDays` — i.e. a real future date that isn't yet notable
 * enough to surface, NOT an error.
 */
export function classifyDeadline(dateIso: string, nowMs: number, withinDays: number): TemporalState | null {
  const days = daysUntil(dateIso, nowMs);
  if (days == null) return null;
  if (days < 0) return "overdue";
  if (days === 0) return "current";
  if (days <= withinDays) return "upcoming";
  return null;
}

/**
 * A "how current is this data" fact: last income date, last asset snapshot, last journey
 * activity. `null` last date (never happened at all) is always `stale` — matching
 * `financeFreshness.ts`'s own rule that an asset with zero snapshots ever is stale, not merely
 * "unknown". Otherwise: `recently_changed` inside `recentWithinDays`, `stale` beyond
 * `staleAfterDays`, `current` in between (fresh, but not brand-new).
 */
export function classifyFreshness(
  lastDateIso: string | null | undefined,
  nowMs: number,
  staleAfterDays: number,
  recentWithinDays: number = RECENT_WINDOW_DAYS,
): TemporalState {
  const days = daysSince(lastDateIso, nowMs);
  if (days == null) return "stale";
  if (days > staleAfterDays) return "stale";
  if (days <= recentWithinDays) return "recently_changed";
  return "current";
}

/**
 * A plain recorded-event date with no deadline/freshness semantics (an income row's business
 * date, an expense's transaction date, an asset snapshot's `as_of`) — just where it sits
 * relative to now. `null` when unparseable.
 */
export function classifyEventDate(dateIso: string | null | undefined, nowMs: number): TemporalState | null {
  const days = daysUntil(dateIso, nowMs);
  if (days == null) return null;
  if (days < 0) return "past";
  if (days === 0) return "current";
  return "upcoming";
}
