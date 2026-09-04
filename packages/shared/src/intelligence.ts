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
 * happened. `confidence` (0..1, on `IntelligenceClaim`) is a SEPARATE concept from this status —
 * a `"hypothesis"` can be low- or high-confidence; the status says what KIND of claim it is, the
 * confidence says how strongly the evidence supports it.
 *
 *  - `fact` — directly supported by authoritative domain data (a stored transaction, a stated
 *    target date, a memory's own text).
 *  - `observation` — a pattern directly visible from multiple facts (two memories that can't
 *    both be true; a theme recurring across several dated memories).
 *  - `inference` — a reasonable conclusion derived from evidence, not itself directly stated.
 *  - `hypothesis` — a possible explanation for an observation, explicitly not established.
 *  - `possible` — a weaker cousin of `hypothesis`: a plausible downstream consequence or
 *    correlated change (docs/specs/maya-intelligence-architecture.md's causal reasoning), never
 *    asserted as the actual cause.
 *  - `unknown` — insufficient evidence exists to say anything at all; a legitimate, first-class
 *    answer, not an error.
 *  - `confirmed` — a previously uncertain claim was explicitly resolved by the user's own words.
 *  - `outdated` — a claim/fact that was once current but a newer, later-dated fact has since
 *    superseded it; the OLD claim itself is never deleted or rewritten, only re-labeled.
 *  - `contradicted` — a claim two pieces of evidence directly conflict on, prior to resolution
 *    (distinct from `"observation"`, which is used for the raw "these can't both be true"
 *    detection — `"contradicted"` is for a claim that has been identified as the LOSING/disputed
 *    side once a newer fact or user confirmation makes the conflict's direction clear).
 */
export type EpistemicStatus =
  | "fact"
  | "observation"
  | "inference"
  | "hypothesis"
  | "possible"
  | "unknown"
  | "confirmed"
  | "outdated"
  | "contradicted";

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

/**
 * Causal reasoning (docs/specs/maya-intelligence-architecture.md, Part I1). A `CausalLink`
 * NEVER asserts proven causation — `status` is always one of `"possible"`/`"hypothesis"` unless
 * a user has explicitly confirmed the relationship (in which case it would be represented as a
 * `"confirmed"` `IntelligenceClaim`, not a stronger `CausalLink`). `temporalOrder` is always
 * derived from real stored dates (`lib/time.ts`'s classifiers), never assumed.
 */
export interface CausalLink {
  id: string;
  /** The event/claim this link originates from. */
  cause: ProvenanceRef;
  /** A plain-language description of the possible downstream effect — not itself a stored
   *  entity (the evidence pointing at what actually changed IS a real record, in `evidence`). */
  effectDescription: string;
  effectDomain: ProvenanceRef["domain"];
  status: Extract<EpistemicStatus, "possible" | "hypothesis" | "confirmed">;
  confidence: number;
  temporalOrder: "before" | "after" | "concurrent" | "unknown";
  evidence: ProvenanceRef[];
  createdAt: string;
}

/**
 * Clarification lifecycle state (docs/specs/maya-intelligence-architecture.md, Part I2).
 * Mirrors the `intelligence_clarifications` table row shape 1:1 — this is the one piece of
 * intelligence-originated persistence this pass introduces, explicitly justified by the brief:
 * without SOME durable state, "Maya remembers she asked and remembers the answer" is
 * impossible. It tracks the QUESTION lifecycle only — the actual confirmed knowledge, once
 * resolved, is a real memory node (see the architecture doc), not duplicated here.
 */
export type ClarificationStatus = "pending" | "confirmed" | "dismissed";

export interface ClarificationRecord {
  id: number;
  claimId: string;
  domain: ProvenanceRef["domain"];
  question: string;
  evidence: ProvenanceRef[];
  status: ClarificationStatus;
  answerText?: string | null;
  confirmedStatement?: string | null;
  /** The real memory node created once this clarification resolves — the actual usable
   *  knowledge lives there (embedded, retrievable, linked via a "resolves" edge), never here. */
  confirmedNodeId?: number | null;
  createdAt: string;
  resolvedAt?: string | null;
}

/**
 * Verdict from judging whether a new chat message answers a PENDING clarification question
 * (docs/specs/maya-intelligence-architecture.md, Part I2). Deliberately narrow — this is a
 * single yes/no-plus-extraction judgment, not a conversational state machine: the caller
 * (`analysis/clarificationResolution.ts`) still owns deciding WHICH pending clarification (if
 * any) to check a message against, and whether/how to persist the result.
 */
export interface ClarificationInterpretation {
  /** True when the message genuinely addresses the pending question (not an unrelated new
   *  topic). Conservative by design — a provider should prefer `false` when unsure. */
  answers: boolean;
  /** The resolved fact, phrased as a plain declarative statement suitable to store as a new
   *  memory ("The 2016 Honda was totaled in an accident."). Empty when `answers` is false. */
  confirmedStatement: string;
  /** 0..1 confidence in this judgment/extraction — independent of any `EpistemicStatus`. */
  confidence: number;
}

/**
 * Galaxy Entity Intelligence (docs/specs/maya-intelligence-architecture.md, Part I3). The
 * kinds a Galaxy click/query can resolve — matches what each Three.js body's own `userData`
 * already carries client-side (a memory/MOC body's node id; a Journey hub's `journeyId`; a
 * Money-sky star's `moneyId` + `moneyKind`, which is only ever `"bill"` or `"goal"` today).
 */
export type GalaxyEntityKind = "node" | "journey" | "bill" | "goal";

/**
 * A stable, human-meaningful identity for ANY Galaxy body Maya can be asked about ("what's
 * that star?") or navigate to. Deliberately built on `ProvenanceRef` rather than a parallel
 * id/label shape — `ref` IS the existing pointer-to-the-real-row vocabulary, so a descriptor
 * is never a second source of truth, just a resolved, presentable view of one. `state` is
 * always computed from EXISTING deterministic logic (the same money-sky/journey-progress
 * math already driving how the body looks), never invented or LLM-authored.
 */
export interface GalaxyEntityDescriptor {
  ref: ProvenanceRef;
  /** Human-readable current state, e.g. "Overdue by 3 days — $120" or "62% funded ($3,400 of
   *  $5,500)" or "Active journey — 4 linked memories" or "Memory from 3 weeks ago". */
  state: string;
  /** A meaningfully-ordered date when this entity has one (a bill's next due date, a goal's
   *  target date, a memory's occurredAt) — omitted when not applicable (e.g. an open-ended
   *  goal with no target date). Never fabricated. */
  temporal?: string;
  /** Whether navigating the Galaxy camera to this body is meaningful right now. Always true
   *  for a resolvable entity today — kept explicit so a future resolvable-but-not-flyable
   *  kind can't silently break a navigation caller that assumes "resolved implies flyable". */
  navigable: boolean;
}

/**
 * A bounded reason to move the Galaxy camera (docs/specs/maya-intelligence-architecture.md,
 * Part I3's explicit rule: "if Maya navigates to something, she must have a reason — no
 * random navigation, no decorative movement"). `reason` is always derived from something
 * ALREADY known (a resolved entity's own `state`, a causal/clarification claim's statement)
 * — never invented — so a navigation trigger can always answer "why did you go there?".
 */
export interface NavigationIntent {
  target: ProvenanceRef;
  reason: string;
}

/**
 * Maya Chat → Galaxy Navigation. Non-memory Galaxy kinds a chat-driven navigation candidate may
 * target — `"node"` is deliberately excluded: memory navigation already has a complete, working
 * mechanism (citations + citation chips), so this stays additive rather than becoming a second,
 * overlapping path to the same capability.
 */
export type GalaxyNavigationKind = Exclude<GalaxyEntityKind, "node">;

/**
 * An UNTRUSTED, LLM-proposed navigation suggestion — the model may propose one of these while
 * answering, but it is NEVER authoritative. Deliberately weaker than `NavigationIntent`: no
 * `reason`, no `domain`, nothing the model could use to manufacture its own authority. The
 * server independently resolves it (`resolveGalaxyEntity`, space-scoped) before it can become a
 * real `NavigationIntent` — an id the model invents that doesn't resolve is simply dropped, the
 * exact discipline already applied to `AnswerResult.citations`.
 */
export interface GalaxyNavigationCandidate {
  kind: GalaxyNavigationKind;
  id: number;
}

/**
 * Maya Longitudinal Intelligence, Phase H (docs/specs/maya-longitudinal-intelligence.md,
 * Section 14) — an UNTRUSTED, LLM-proposed signal that the user's message ITSELF explicitly
 * stated a durable communication preference ("always be more direct", "stop over-explaining") —
 * never a one-off request about just this reply. Deliberately generic: `signal` names WHAT KIND
 * of preference this is (e.g. "verbosity", "directness") and `value` what they want, with no
 * fixed enum, so this never hard-codes a specific taxonomy of preferences. Like
 * `GalaxyNavigationCandidate`, this is NEVER trusted directly — the server only uses it as ONE
 * piece of evidence toward a deterministically-accumulated, confidence-scored preference (see
 * `analysis/interactionPreferences.ts`); a single mention never rewrites how Maya behaves in
 * future conversations on its own.
 */
export interface InteractionPreferenceSignal {
  signal: string;
  value: string;
}
