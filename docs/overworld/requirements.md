# Overworld — Requirements (Phase 3)

> Staged: **Stage 1 = the MVP vertical slice** (Bank region + capture/greet loop + shell). Later
> stages (full dock parity, associative paths, region travel) are named here for completeness but
> detailed only when their turn comes in [roadmap.md](./roadmap.md), per "no code until design is
> complete" applied per-stage, not just once for the whole project.

## Functional requirements — Stage 1 (MVP vertical slice)

**Shell**
- FR1. Render a tile-based world at 16×16 or 32×32 grid resolution, camera follows the player
  avatar, snapped to grid (no free-scroll drift).
- FR2. Player moves in 4 directions via keyboard (arrow/WASD) on desktop and an on-screen D-pad +
  A/B buttons on touch, one tile per input, blocked by the passability layer (no walking through
  buildings/obstacles).
- FR3. Entering a building's door tile warps to that building's fixed interior map; leaving via
  the interior's exit warp returns to the exact exterior tile the player entered from.
- FR4. A bottom-of-screen pixel-font dialogue box + portrait pattern is available for any
  NPC/creature interaction and for Soumaya's chat, reusable across all future areas (built once
  in Stage 1, not per-building).

**Bank region (Money)**
- FR5. The Bank building interior lists real `FinBill`/`FinIncome`/`FinExpense`/`MoneyStar` data
  for the authenticated space via the existing finance API — no mock data.
- FR6. A "what can I afford" shop-counter view greys out anything above `safeToSpendCents` from
  `BudgetSummary`.
- FR7. Bills/goals with an urgent `MoneyStarState` (`overdue`, `approaching`) render with a
  non-color cue (icon/shape/label) in addition to any color tint, per the accessibility
  non-negotiable.

**Capture loop**
- FR8. Walking into a designated "tall grass" free-thought zone tile opens a capture menu (text
  entry, matching today's raw-thought ingest).
- FR9. Submitting shows an "identifying species..." extraction-in-progress state, then reveals the
  resulting creature's name/type/rarity — using the real ingest pipeline
  (`ingestText`/extraction), including its offline/heuristic fallback path with zero API keys.

**Greet/revisit loop (the mechanic to prove first, per the brief)**
- FR10. Every existing memory placed in the region renders as a creature whose visible
  dim/vividness state is a direct function of the real `entropy` value already returned by the
  graph API (no client-invented decay math) — dimmer sprite/palette **plus** a non-color cue
  (e.g., a fading outline or a small "?" idle marker) above `COOLING_ENTROPY`.
- FR11. Walking up to and interacting with ("greeting") a creature calls the real
  `tendNode(id)` endpoint and the creature visibly, immediately brightens/restores in response to
  the resulting entropy change on next graph refresh — this is the loop to build and test first.
- FR12. The greet interaction is a light, no-pressure prompt in Soumaya's voice (reuses/adapts
  existing lore/copy conventions from `graph/lore.ts`/`objectLore.ts`), never a quiz, never framed
  as a failure if skipped.

**Cross-cutting**
- FR13. Everything in Stage 1 works with zero network/LLM calls beyond the existing API (the
  overworld itself introduces no new cloud dependency); the capture flow's extraction step
  degrades to the heuristic extractor exactly as it does today.
- FR14. The world/session is scoped to the authenticated space exactly like today — the overworld
  reuses the existing space-auth flow and sends the same `x-space-id` header via the existing
  `api/client.ts`/`http.ts`; no new auth path.

## Non-functional requirements

- **Performance**: playable at 60fps target on a mid-range mobile device for a region with
  realistic node counts (tens to low hundreds); Phaser's sprite batching plus only rendering
  the visible tile viewport (no whole-graph render every frame, unlike the current always-visible
  galaxy — an actual budget improvement).
- **Accessibility**: `prefers-reduced-motion` disables/shortens camera pans and any idle-sprite
  bob/shake; every state that currently could be color-only in the galaxy (urgency, rarity) gets a
  paired shape/icon/label in the overworld from the first commit, not retrofitted.
- **Security/privacy**: unchanged — space-scoped, no new data leaves the existing API boundary.
- **Reliability**: a failed/slow API call shows a loading/error state in-world (e.g., the Bank
  door doesn't open onto a blank interior) rather than a blank screen — mirrors the existing
  "preserve last known graph on error" pattern in `App.tsx`.
- **Offline-first**: confirmed by construction (FR13); explicitly tested, not just assumed.

## Constraints

- No new npm workspace (D6); Phaser 3 (D5); must not modify `packages/shared` types/schemas or
  `packages/server` route contracts as part of Stage 1 (D8/D9 confirm no new endpoints are needed
  for the slice).
- Must not touch `graph/orbits.ts`, `web/src/api/client.ts`'s existing exports, or any Red Zone
  file listed in `CLAUDE.md`/`GEMINI_CHANGES.md` — the overworld is additive, imported by `App.tsx`
  only at the mount point (D1 staging).
- Bundle size: Phaser + assets must stay behind the same lazy-loading discipline the galaxy
  already uses (`Graph3D` is `lazy()`-loaded so three.js isn't in the initial bundle) — the
  overworld scene should be lazy-loaded the same way once both coexist.
