import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import { InteractionPreferencesRepo } from "../repositories/interactionPreferences.repo.js";

/**
 * Maya Longitudinal Intelligence, Phase H (docs/specs/maya-longitudinal-intelligence.md,
 * Section 14) — the deterministic accumulation + surfacing logic for LEARNED interaction
 * preferences. Deliberately separate from BOTH factual memory (`analysis/intelligence.ts`'s
 * `EpistemicStatus`/`IntelligenceClaim` vocabulary is about the TRUTH of world-facts — a
 * communication preference isn't a fact about the world at all, so reusing that vocabulary
 * would be a category error, not a reuse) and from `instruction_profiles` (explicit,
 * user-authored — these are OBSERVED from repeated evidence instead).
 *
 * Evidence source: `AnswerResult.interactionPreferenceSignal` — an UNTRUSTED, LLM-proposed
 * signal that the user's OWN message just explicitly stated a durable communication preference
 * (never a one-off "make this one reply short"). This module NEVER trusts a single mention as
 * durable: a first-time signal starts at a low confidence, below the surfacing threshold: it
 * strengthens only when the SAME value is observed again later (repeated evidence), and a
 * CONFLICTING value for the same signal resets to that same low starting point rather than
 * instantly overwriting what was there — the newer claim earns its own repetition before it,
 * too, is trusted. Immediate, THIS-message compliance with an explicit instruction needs no
 * code here at all — the LLM already sees the user's own current message and follows it
 * naturally; this module only governs whether a preference persists into FUTURE conversations.
 */

/** A brand-new or just-conflicting-with-prior-value observation starts here — well below
 *  `SURFACE_CONFIDENCE_THRESHOLD`, so one mention alone never changes future behavior. */
const STARTING_CONFIDENCE = 0.3;
/** Confidence added by another CONSISTENT observation of the same value. */
const CONFIDENCE_BUMP = 0.25;
/** Never reaches 1.0 ("certain") — a learned preference is never treated as fact, no matter how
 *  many times it's repeated. */
const MAX_CONFIDENCE = 0.9;
/** A preference must clear BOTH this confidence bar AND `MIN_EVIDENCE_TO_SURFACE` mentions
 *  before it's surfaced into future chat context — "weak evidence does not create durable
 *  preference" is enforced by these two independent gates, not one. */
export const SURFACE_CONFIDENCE_THRESHOLD = 0.5;
export const MIN_EVIDENCE_TO_SURFACE = 2;

const MAX_SIGNAL_LEN = 40;
const MAX_VALUE_LEN = 80;

/**
 * Record one piece of evidence toward a learned preference. Best-effort by contract (the
 * caller wraps this in try/catch, same as every other post-answer side effect in
 * `chat/graphrag.ts`) — never throws for malformed input, just silently does nothing.
 */
export function recordPreferenceSignal(
  handle: DbHandle,
  spaceId: string = DEFAULT_SPACE,
  signal: string,
  value: string,
  now: Date = new Date(),
): void {
  const key = signal.trim().toLowerCase().slice(0, MAX_SIGNAL_LEN);
  const val = value.trim().slice(0, MAX_VALUE_LEN);
  if (!key || !val) return; // insufficient evidence — silence, never a guess

  const repo = new InteractionPreferencesRepo(handle, spaceId);
  const existing = repo.get(key);
  const nowIso = now.toISOString();

  if (!existing) {
    repo.upsert(key, val, STARTING_CONFIDENCE, 1, nowIso);
    return;
  }
  if (existing.value.toLowerCase() === val.toLowerCase()) {
    // Consistent, repeated evidence — strengthens, capped, never reaching "certain".
    const confidence = Math.min(MAX_CONFIDENCE, existing.confidence + CONFIDENCE_BUMP);
    repo.upsert(key, val, confidence, existing.evidenceCount + 1, nowIso);
  } else {
    // Conflicting evidence for the SAME signal — the new value starts fresh and weak rather
    // than instantly replacing what was durably established; it must earn its own repetition.
    repo.upsert(key, val, STARTING_CONFIDENCE, 1, nowIso);
  }
}

/**
 * Chat-facing renderer — same null-when-empty, best-effort contract as every other snapshot
 * function `chat/graphrag.ts` already calls. Only preferences that have cleared BOTH the
 * confidence and evidence-count bars are surfaced; explicitly framed as additive guidance an
 * explicit instruction in the CURRENT message always outranks, never as a rule or a fact.
 * Bounded by construction: reads only this space's own small preference table (one row per
 * distinct signal ever observed — never more rows than distinct kinds of feedback a user has
 * actually given), no scan of memories/conversation history.
 */
export function interactionPreferenceSnapshotText(handle: DbHandle, spaceId: string = DEFAULT_SPACE): string | null {
  const rows = new InteractionPreferencesRepo(handle, spaceId)
    .list()
    .filter((r) => r.confidence >= SURFACE_CONFIDENCE_THRESHOLD && r.evidenceCount >= MIN_EVIDENCE_TO_SURFACE);
  if (rows.length === 0) return null;

  const lines = [
    "HOW THEY'VE ASKED YOU TO COMMUNICATE (learned from things they've told you directly, more than once — additive guidance, not a rule: an explicit instruction in THIS message always wins over this):",
  ];
  for (const r of rows) lines.push(`- ${r.signal}: ${r.value} (said this ${r.evidenceCount}x)`);
  return lines.join("\n");
}
