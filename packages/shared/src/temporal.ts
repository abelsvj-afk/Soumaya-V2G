/**
 * Temporal/Contextual Reasoning (docs/specs/temporal-contextual-reasoning.md) — the shared type
 * model for Soumaya's temporal reasoning layer. Types only, matching this repo's own convention
 * (domain types live in `@brain/shared`; the deterministic logic that produces them lives in
 * `packages/server/src/analysis/temporal*.ts`).
 *
 * FACTS VS REASONING: a `TemporalFact` always wraps an authoritative date/value already stored
 * in Money/Wealth/Life Vision/Journeys/Mind/People — this module never invents one. `state` and
 * `ChangeResult` are DERIVED conclusions from those facts; they are read-only reasoning output,
 * never written back as a new financial/domain fact anywhere in this codebase.
 */

/** The six temporal states Soumaya's reasoning can assign to a fact. Exactly one applies per
 *  fact — `state` is not a set of tags, it's the single most useful framing for that fact type
 *  (a deadline is classified upcoming/current/overdue; a freshness signal is classified
 *  stale/recently_changed/current; see analysis/temporal.ts for which classifier produces which
 *  subset of these for a given `kind`). */
export type TemporalState = "past" | "current" | "upcoming" | "overdue" | "stale" | "recently_changed";

export type TemporalDomain = "money" | "wealth" | "life_vision" | "journey" | "mind" | "people";

/** One authoritative fact, reframed with its derived temporal state. `date` is always a real
 *  stored value (a bill's due date, a goal's target date, an income row's business date, a
 *  journey's `updatedAt`, a person's last-interaction date, etc.) — never a fabricated or
 *  estimated timestamp. */
export interface TemporalFact {
  domain: TemporalDomain;
  /** A short machine-readable kind within the domain, e.g. "bill_due", "goal_target",
   *  "vision_target", "income_freshness", "journey_activity", "person_interaction". */
  kind: string;
  label: string;
  /** ISO date or timestamp this fact is anchored to — the authoritative value it was derived
   *  from, always traceable back to a real row. */
  date: string;
  state: TemporalState;
  /** Optional human-readable elaboration ("$120 due in 2 days"), never a substitute for `date`. */
  detail?: string;
}

/** A bounded, time-aware cross-domain snapshot for chat/reasoning context (never persisted —
 *  computed fresh from authoritative data on every read). Every array is capped small
 *  (analysis/temporalContext.ts documents the exact caps) so context stays bounded and
 *  explainable rather than dumping the whole graph. */
export interface TemporalContext {
  /** ISO timestamp this snapshot was computed against — the single explicit "now" every fact
   *  and classification below was derived relative to. */
  now: string;
  recentFacts: TemporalFact[];
  upcomingFacts: TemporalFact[];
  overdueFacts: TemporalFact[];
  staleFacts: TemporalFact[];
  recentChanges: ChangeResult[];
}

/** The result of comparing two periods of the same measurable quantity. `"insufficient_history"`
 *  is a real, distinct outcome — deliberately NOT a fabricated "unchanged"/"steady" default —
 *  for when there isn't yet a second period to compare against (docs/specs
 *  /temporal-contextual-reasoning.md "Change detection" — a repo-audit finding was that at
 *  least one existing trend function, analysis/emotional.ts's `buildEmotionalTrajectory`,
 *  silently defaults to a fabricated "steady" trend with zero data; this type exists so this
 *  new reasoning layer never repeats that shape). */
export type ChangeResult =
  | {
      status: "compared";
      domain: TemporalDomain;
      kind: string;
      label: string;
      currentCents: number;
      previousCents: number;
      deltaCents: number;
      direction: "increased" | "decreased" | "unchanged";
      /** Signed percent change vs. the previous period; `null` when `previousCents` is 0 (a
       *  percent change from zero is undefined, not 0% or 100%). */
      percent: number | null;
    }
  | {
      status: "insufficient_history";
      domain: TemporalDomain;
      kind: string;
      label: string;
      reason: string;
    };
