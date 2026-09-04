import type { IntelligenceClaim, CausalLink } from "@brain/shared";
import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { FinGoalRepo } from "../repositories/finGoal.repo.js";
import { daysSince, parseTolerantMs } from "../lib/time.js";
import { incomeChange, netWorthChange, goalAllocationChange } from "./temporalChange.js";

/**
 * Causal reasoning (docs/specs/maya-intelligence-architecture.md, Part I1). Deliberately NOT a
 * general causal-graph engine — per the brief's own repeated caution ("do not build a giant
 * causal graph engine," "do not attempt unrestricted causal inference," "do not allow the LLM
 * to fabricate causal relationships"), this module does exactly one bounded thing: given an
 * already-formed `IntelligenceClaim` (e.g. a detected contradiction — "I have one vehicle" vs.
 * "vehicle accident"), it checks whether any of the EXISTING, ALREADY-BUILT change-detection
 * functions (`analysis/temporalChange.ts`'s `incomeChange`/`netWorthChange`/
 * `goalAllocationChange`) show a real, dated, deterministic change that is temporally
 * CONSISTENT with having happened after the claim's evidence — and if so, surfaces it as a
 * `CausalLink` with `status: "possible"`, NEVER higher. No LLM call happens here; the only
 * "inference" is the deterministic temporal-consistency check below. Narrating the
 * correlation-not-causation distinction in natural language is the EXISTING chat LLM's job
 * (via `intelligenceSnapshotText`'s injected context), not a new model call.
 */

/** How far after an event a deterministic change is still considered temporally plausible as
 *  a possible downstream effect. NEW — no existing precedent for this exact window; chosen to
 *  comfortably span one missed pay cycle plus the month-boundary bucketing `incomeChange`/
 *  `netWorthChange` already use (their own comparison is month-over-month), so a change
 *  detected in "this month vs. last month" still counts as plausibly-related to an event
 *  anywhere in that same ~2-month span. */
const CAUSAL_WINDOW_DAYS = 65;

const MAX_CAUSAL_LINKS = 3;

/** The earliest real, parseable date among a claim's evidence — the "event" this reasoning is
 *  anchored to. Returns null when no evidence resolves to a real date (never fabricates one). */
function earliestEvidenceDate(handle: DbHandle, spaceId: string, claim: IntelligenceClaim): string | null {
  const nodes = new NodesRepo(handle, spaceId);
  let earliest: string | null = null;
  let earliestMs = Infinity;
  for (const ref of claim.evidence) {
    if (ref.domain !== "memory" || ref.kind !== "node") continue;
    const n = nodes.getById(ref.id);
    if (!n) continue;
    const dateStr = n.occurredAt ?? n.createdAt;
    const ms = parseTolerantMs(dateStr);
    if (Number.isFinite(ms) && ms < earliestMs) {
      earliestMs = ms;
      earliest = dateStr;
    }
  }
  return earliest;
}

function fmtDollars(cents: number): string {
  return `$${(Math.abs(cents) / 100).toFixed(0)}`;
}

/**
 * Bounded downstream-effect detection. Never asserts causation — every link this produces is
 * `status: "possible"` and every `effectDescription` is phrased as coincidence-in-time, not
 * proven cause. Returns `[]` (not a fabricated link) when the event date is unknown or nothing
 * temporally-consistent is found — matching this codebase's "insufficient evidence → silence"
 * discipline established in the temporal-reasoning pass.
 */
export function possibleDownstreamEffects(
  handle: DbHandle,
  spaceId: string = DEFAULT_SPACE,
  claim: IntelligenceClaim,
  now: Date = new Date(),
): CausalLink[] {
  const eventDate = earliestEvidenceDate(handle, spaceId, claim);
  if (!eventDate) return [];
  const nowMs = now.getTime();
  const eventAgeDays = daysSince(eventDate, nowMs);
  // The event itself must be recent enough that "the current vs. previous month" comparison
  // those change-detection functions make could plausibly straddle it.
  if (eventAgeDays == null || eventAgeDays > CAUSAL_WINDOW_DAYS) return [];

  const links: CausalLink[] = [];
  const cause = claim.evidence[0] ?? { domain: claim.domain, kind: "claim", id: 0, label: claim.statement };
  const confidence = 0.35 + Math.max(0, (CAUSAL_WINDOW_DAYS - eventAgeDays) / CAUSAL_WINDOW_DAYS) * 0.2; // 0.35..0.55, closer in time = slightly higher

  const income = incomeChange(handle, spaceId, now);
  if (income.status === "compared" && income.direction !== "unchanged") {
    links.push({
      id: `causal:income:${cause.id}`,
      cause,
      effectDescription: `Around the same time, recorded income ${income.direction} by ${fmtDollars(income.deltaCents)} — the timing coincides, but that alone doesn't prove a connection.`,
      effectDomain: "money",
      status: "possible",
      confidence,
      temporalOrder: "after",
      evidence: claim.evidence,
      createdAt: now.toISOString(),
    });
  }

  const netWorth = netWorthChange(handle, spaceId, now);
  if (netWorth.status === "compared" && netWorth.direction !== "unchanged") {
    links.push({
      id: `causal:networth:${cause.id}`,
      cause,
      effectDescription: `Around the same time, net worth ${netWorth.direction} by ${fmtDollars(netWorth.deltaCents)} — coincidental timing, not confirmed cause.`,
      effectDomain: "wealth",
      status: "possible",
      confidence,
      temporalOrder: "after",
      evidence: claim.evidence,
      createdAt: now.toISOString(),
    });
  }

  if (links.length < MAX_CAUSAL_LINKS) {
    const goals = new FinGoalRepo(handle, spaceId).list();
    for (const g of goals) {
      if (links.length >= MAX_CAUSAL_LINKS) break;
      const change = goalAllocationChange(handle, spaceId, { id: g.id, name: g.name }, now);
      if (change.status === "compared" && change.direction !== "unchanged") {
        links.push({
          id: `causal:goal:${g.id}:${cause.id}`,
          cause,
          effectDescription: `Around the same time, allocation toward "${g.name}" ${change.direction} — worth noting, not a confirmed link.`,
          effectDomain: "wealth",
          status: "possible",
          confidence,
          temporalOrder: "after",
          evidence: claim.evidence,
          createdAt: now.toISOString(),
        });
      }
    }
  }

  return links.slice(0, MAX_CAUSAL_LINKS);
}
