# Post-MVP Hardening — Cycle 2 (2026-07-10)

Second hardening pass, run at the cutover `CLAUDE.md` names: the tool-router fleet
(7 tools) **and** the neuro-aligned features are complete, and both north-star gap docs
(`SECOND_BRAIN_ALIGNMENT.md`, `NEURO_ALIGNMENT.md`) are fully green. Per the standing
policy — *re-freeze and re-run the post-MVP phases before the next major expansion* —
this cycle audits everything added since Cycle 1 before the next frontier is built.

## Phase 1 — Freeze + scope

**Frozen** for the duration of this cycle (no new features). Surface added since Cycle 1:

- **Runway #1–#5** (this session): node status (archive/restore), editable per-space soul,
  auto-proposed constellation hubs, distant-star inquiry + link-forming flourish + welcome
  seed, colorblind palette + reduced-motion, deep-space focus mode, weekly_review tool.
- **Tool-router fleet**: reminder, taskCreator, orphan, reviewNudge, checkin, webLookup,
  weeklyReview.
- **SRS / active recall** (`analysis/review.ts`), the **Chronicle** timeline, and the
  **cognitive layer** already covered by Cycle 1's later phases.

## Phase 2 — Bug / quality / debt

Swept the new surface for correctness, multi-tenancy, offline-fallback, and dead code.
**Verdict: clean.** Two quality/cost improvements applied (no correctness bugs found):

- **Q1 — link-forming spark was unbounded.** The #1b comet fired once per new link in the
  data diff; a bulk sync (e.g. many-link import) could fire hundreds even though the pool
  only shows a few. Bounded it to `PULSE_VISIT_CAP`, matching the pulse queue. *(Graph3D.tsx)*
- **Q2 — weekly_review LLM prompt was unbounded.** `generateDailyLog` received every
  memory in the week → unbounded token cost on a heavy week. Capped to the 12 most
  significant. *(weeklyReview.ts)*

## Phase 3 — AI validation (memory / retrieval / prompt / hallucination / cost)

- **Offline path proven.** weekly_review falls back to a deterministic heuristic digest
  when no cloud LLM is present (asserted in `tools.test.ts`). Hub summaries
  (`promoteConstellation`) fall back to a heuristic line on any `summarizeSector` failure.
- **No hallucination surface added.** distant-link + hub suggestions are *deterministic*
  detections; the LLM only ever phrases already-grounded content, never invents relations.
- **Cost bounded.** weekly_review prompt now capped (Q2); the LLM `route()` curation stays
  gated on Research Mode + budget; distant-link's O(n²) scan is bounded to 40 stars and
  rate-limited to ~once/week.

## Phase 4 — Security + performance

- **Multi-tenancy: clean.** Every query across the 7 tools + the new analysis modules and
  routes is `space_id`-scoped (grep-verified). No cross-brain leak.
- **Route validation: clean.** New routes validate with zod / integer id checks
  (`persona/soul` ≤ 8000 chars, `constellations/promote`, `inquiries/:id/confirm`,
  `nodes/:id/archive`). No secrets added.
- **Per-frame cost: clean.** Reduced-motion is a single multiply on `dt`; the palette swap
  is event-driven (not per-frame); link-forming is a fixed 6-stream pool created once with
  no per-frame allocation (and now capped at fire time). Event listeners are cleaned up on
  unmount.

## Outcome

Gate green — **typecheck · 295 server + 27 web tests · web build**. No correctness or
security defects; two cost/quality bounds tightened. **Freeze lifted** — the base is clean
for the next frontier (self-updating "smart lens" views).
