/**
 * Maya Intelligence — the unified epistemic vocabulary (docs/specs/maya-intelligence-architecture.md).
 * Types only, matching this repo's convention: `@brain/shared` carries the vocabulary; the
 * deterministic logic that produces values in it lives in
 * `packages/server/src/analysis/intelligence.ts`. This is deliberately a SMALL, additive first
 * layer on top of infrastructure that mostly already exists (contradiction detection via
 * `synthesis/contradictions.ts` + the `insights` table, provenance via `nodes.origin`, thought
 * continuity via `analysis/temporalChains.ts`, temporal state via `analysis/temporal*.ts`) — see
 * the architecture doc for what this pass intentionally defers (Galaxy click-resolution for
 * non-memory bodies, ML-assisted pattern detection, a persisted provenance graph, thought-
 * evolution edge materialization).
 */

/**
 * How certain a claim is, from directly-verifiable to explicitly unknown. Never silently
 * promoted upward — an `"inference"` must never become a `"fact"` without new authoritative
 * evidence, and only an explicit user answer can produce `"confirmed"`. This is the hard rule
 * the whole architecture doc calls out: intelligence interprets, it never rewrites what actually
 * happened.
 *
 *  - `fact` — directly supported by authoritative domain data (a stored transaction, a stated
 *    target date, a memory's own text).
 *  - `observation` — a pattern directly visible from multiple facts (two memories that can't
 *    both be true; a theme recurring across several dated memories).
 *  - `inference` — a reasonable conclusion derived from evidence, not itself directly stated.
 *  - `hypothesis` — a possible explanation for an observation, explicitly not established.
 *  - `unknown` — insufficient evidence exists to say anything at all; a legitimate, first-class
 *    answer, not an error.
 *  - `confirmed` — a previously uncertain claim was explicitly resolved by the user's own words.
 */
export type EpistemicStatus = "fact" | "observation" | "inference" | "hypothesis" | "unknown" | "confirmed";

/**
 * A lightweight pointer back to the real, authoritative row a claim is built from — never a copy
 * of the data itself, and never a new source of truth. Every `IntelligenceClaim.evidence` entry
 * is one of these, so a claim can always be explained ("why did you think that?") by re-fetching
 * its sources through the owning domain's own repository.
 */
export interface ProvenanceRef {
  /** Which existing domain owns this row. */
  domain: "money" | "wealth" | "life_vision" | "journey" | "mind" | "people" | "memory";
  /** A short machine-readable kind within the domain, e.g. "node", "insight", "fin_income". */
  kind: string;
  id: number;
  label?: string;
}

/**
 * One claim Maya's reasoning layer has formed. `confidence` (0..1) is kept as its OWN field,
 * deliberately never blended into another number — a repo-audit finding was that
 * `analysis/dreamCycle.ts`'s belief consolidation folds its LLM confidence into `importance` and
 * loses the raw value; this type exists so a new claim's confidence stays legible on its own.
 */
export interface IntelligenceClaim {
  id: string;
  status: EpistemicStatus;
  statement: string;
  confidence: number;
  domain: ProvenanceRef["domain"];
  evidence: ProvenanceRef[];
  createdAt: string;
}

/** A candidate worth asking the user about (the Clarification Engine,
 *  docs/specs/maya-intelligence-architecture.md). Not every uncertainty deserves a question —
 *  `priority` is what `analysis/intelligence.ts`'s deterministic gate ranks candidates by. */
export interface ClarificationCandidate {
  claim: IntelligenceClaim;
  question: string;
  /** 0..1 — how much asking would actually change behavior/understanding. */
  priority: number;
  reason: string;
}
