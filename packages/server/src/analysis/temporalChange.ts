import type { ChangeResult, TemporalDomain } from "@brain/shared";
import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import { incomeSeries } from "../finance/incomeTrend.js";
import { netWorthSeries } from "../finance/netWorthTrend.js";
import { FinAllocationRepo } from "../repositories/finAllocation.repo.js";
import { FinAssetSnapshotRepo } from "../repositories/finAssetSnapshot.repo.js";
import { parseTolerantMs } from "../lib/time.js";

/**
 * Period-over-period change detection (docs/specs/temporal-contextual-reasoning.md). This
 * repo's audit found NO existing function that compares two periods and gracefully returns
 * "not enough data" — the closest precedent, `analysis/emotional.ts`'s `buildEmotionalTrajectory`,
 * silently fabricates a `"steady"` trend from zero/one data points (mitigated only by a
 * separate `sampleSize` field a caller must remember to check). This module deliberately does
 * the opposite: `ChangeResult`'s `"insufficient_history"` variant is a first-class, impossible-
 * to-ignore outcome (TypeScript forces a `status` check before reading `deltaCents`), used
 * whenever there genuinely isn't a second period to compare against.
 *
 * Scope: Income and Net Worth already have ready-made monthly time series (`incomeSeries`/
 * `netWorthSeries`) to compare adjacent points from. Goal allocation velocity reuses the
 * existing dated `fin_allocation` ledger. Journey/Life-Vision progress change detection would
 * need a point-in-time progress LOG that doesn't exist today (only the current value is
 * stored) — adding one is a new persistence feature, out of scope for this reasoning-layer
 * pass; noted as a V1 limitation rather than guessed at.
 */

function insufficientHistory(domain: TemporalDomain, kind: string, label: string, reason: string): ChangeResult {
  return { status: "insufficient_history", domain, kind, label, reason };
}

/** Pure comparison of two already-decided period totals — always succeeds. Whether a genuine
 *  second period exists at all is the caller's job (the domain-specific functions below), not
 *  this function's; it exists standalone so it's directly unit-testable against boundary values
 *  (e.g. `previousCents === 0`) without needing real domain data. */
export function compareTwoPeriods(
  domain: TemporalDomain,
  kind: string,
  label: string,
  currentCents: number,
  previousCents: number,
): ChangeResult {
  const deltaCents = currentCents - previousCents;
  const direction = deltaCents > 0 ? "increased" : deltaCents < 0 ? "decreased" : "unchanged";
  const percent = previousCents !== 0 ? (deltaCents / Math.abs(previousCents)) * 100 : null;
  return { status: "compared", domain, kind, label, currentCents, previousCents, deltaCents, direction, percent };
}

/** Income month-over-month, from the last two POPULATED months (nonzero total) in the existing
 *  `incomeSeries`. A brand-new space's leading all-zero months must never be compared as if
 *  they were two real data points — that would report "increased by $X" (from $0) on day one. */
export function incomeChange(handle: DbHandle, spaceId: string = DEFAULT_SPACE, now: Date = new Date()): ChangeResult {
  const series = incomeSeries(handle, spaceId, 12, now);
  const populated = series.filter((p) => p.totalCents !== 0);
  if (populated.length < 2) {
    return insufficientHistory("money", "income_trend", "Income", "fewer than two months with recorded income");
  }
  const [previous, current] = populated.slice(-2);
  return compareTwoPeriods("money", "income_trend", "Income", current!.totalCents, previous!.totalCents);
}

/** Net worth month-over-month. `netWorthSeries` always returns a full, continuous run of
 *  months (never "missing" ones) even with zero data — every point's cash component is today's
 *  real balance, flat-projected backward (see `netWorthTrend.ts`'s `cashIsProjected`), so two
 *  such months would always show an identical, meaningless $0 "change" if nothing else were
 *  checked. The one genuine historical signal is `fin_asset_snapshot` — if not even one
 *  snapshot has EVER been logged, there is no real net-worth history at all yet, regardless of
 *  what the flat-projected numbers happen to say. */
export function netWorthChange(handle: DbHandle, spaceId: string = DEFAULT_SPACE, now: Date = new Date()): ChangeResult {
  const everSnapshotted = new FinAssetSnapshotRepo(handle, spaceId).mostRecentAny();
  if (!everSnapshotted) {
    return insufficientHistory("wealth", "net_worth_trend", "Net worth", "no account balance has ever been logged");
  }
  const series = netWorthSeries(handle, spaceId, 12, now);
  if (series.length < 2) {
    return insufficientHistory("wealth", "net_worth_trend", "Net worth", "fewer than two months available");
  }
  const [previous, current] = series.slice(-2);
  return compareTwoPeriods("wealth", "net_worth_trend", "Net worth", current!.totalCents, previous!.totalCents);
}

const DAY_MS = 86_400_000;
const ALLOCATION_WINDOW_DAYS = 30;

/** A Wealth goal's funding velocity: trailing 30 days of allocations vs. the 30 days before
 *  that, from the existing dated `fin_allocation` ledger (no new persistence needed — every
 *  allocation already carries its own `createdAt`). Insufficient when the goal's very first
 *  allocation falls inside the CURRENT 30-day window — there is then no genuine "previous"
 *  window to compare against, only one period's worth of history. */
export function goalAllocationChange(
  handle: DbHandle,
  spaceId: string = DEFAULT_SPACE,
  goal: { id: number; name: string },
  now: Date = new Date(),
): ChangeResult {
  const allocations = new FinAllocationRepo(handle, spaceId).list(goal.id, 500);
  if (allocations.length === 0) {
    return insufficientHistory("wealth", "goal_allocation_trend", goal.name, "no allocations recorded yet");
  }
  const nowMs = now.getTime();
  const currentWindowStart = nowMs - ALLOCATION_WINDOW_DAYS * DAY_MS;
  const previousWindowStart = nowMs - 2 * ALLOCATION_WINDOW_DAYS * DAY_MS;

  let currentSum = 0;
  let previousSum = 0;
  let oldestMs = Infinity;
  for (const a of allocations) {
    const ms = parseTolerantMs(a.createdAt);
    if (!Number.isFinite(ms)) continue;
    if (ms < oldestMs) oldestMs = ms;
    if (ms >= currentWindowStart) currentSum += a.amountCents;
    else if (ms >= previousWindowStart) previousSum += a.amountCents;
  }
  if (!Number.isFinite(oldestMs) || oldestMs >= currentWindowStart) {
    return insufficientHistory("wealth", "goal_allocation_trend", goal.name, "all activity is within the last 30 days — no prior period yet");
  }
  return compareTwoPeriods("wealth", "goal_allocation_trend", goal.name, currentSum, previousSum);
}
