# Overworld — Roadmap (Phase 6/7)

> Stage 1 is this design package's scope and what gets built immediately after sign-off. Stages
> 2+ are named for continuity/planning only — each gets re-checked against this package (and a
> short addendum if anything material changed) before it starts, per Rule #1 applied per-stage.

## Stage 1 — Vertical slice (this package's scope) — SHIPPED 2026-09-11

1. [x] Engine shell: `Phaser.Game` bootstrap, scene manager, keyboard + touch input event bus,
   grid-snapped player movement + collision, camera follow. Shipped as `ProofScene.ts` against a
   static test map (no API calls) — the suggested first PR, committed separately.
2. [x] Adapter layer + unit tests: `nodeToCreature`, `moneyStarToBankRow`, `journeyToRegionTheme`,
   deterministic placement — proven against real API response fixtures before any scene wiring.
3. [x] Money region exterior scene (`ExteriorScene.ts`) wired to real `getGraph()`/
   `getMoneySky()`/`getFinanceSummary()` via `data/loadWorldSnapshot.ts` (loading/empty/error
   states — a failed refresh preserves the last-known world, never wipes it).
4. [x] Bank interior overlay (`BankOverlay.tsx`) — real ledger rows + safe-to-spend.
5. [x] Capture flow (`CaptureMenu.tsx`): tall-grass trigger → text entry → `ingestText` →
   "identifying species..." → reveal, with a real never-dead-end error/retry state.
6. [x] Greet/revisit loop (`DialogueBox.tsx` + `greetCreature`): dim-state rendering from real
   `entropy` → interact → `tendNode` → refetch-and-reconcile (never a client-side "instant reset"
   — see architecture.md's note on why that would have re-derived the decay math ourselves).
7. [x] Accessibility: `prefers-reduced-motion` (instant camera snap + no tween) and non-color
   state pairing (dim "?" marker, rarity badges, Bank state icons) verified alongside each piece.
8. [x] Gate green (typecheck × 3 workspaces, 1051 server + 644 web tests incl. 63 new overworld
   tests, production build); logged in `GEMINI_CHANGES.md`; committed to the designated branch.

Known Stage-1 simplifications, intentionally deferred rather than blocking the slice: no
per-node Journey lookup yet (every creature renders `uncharted: true` — harmless per idea.md's
"the world must tolerate unsorted gracefully," revisit once Stage 2 needs real region theming);
the exterior grid is small and fixed (60-node sample, `placeCreaturesOnGrid` silently drops
whatever doesn't fit rather than erroring — Library-style full browsing is Stage 2); placeholder
programmer-art sprites (real pixel art is an asset-production task, not an architecture one).
**Still needs on-device/browser confirmation** — this sandbox has no live browser, so the Phaser
scene itself (movement feel, camera follow, visual layout) is verified only via its underlying
pure-logic tests (movement/collision/placement/input), consistent with every other "Needs
on-device re-confirmation" item already tracked in root `CLAUDE.md`.

## Stage 2 — Dock parity (one building at a time, order TBD by what's cheapest given Stage 1's
now-proven patterns)

Library (Browse), Sanctuary (Mind), Bulletin Board (Agenda), Observatory (Insights), Post Office
(Inbox), Gym/Trainer Card (Progress), region map screen (Journeys), Hangar (ship customization,
carried over ~1:1). Soumaya-as-partner-NPC + chat dialogue box (reuses the DialogueBox component
built in Stage 1).

## Stage 3 — Associative paths + region travel

Glowing footpath rendering between related creatures (edge data → path tiles); literal
flying/sailing transition between Journey regions using the Hangar-customized vehicle (D4);
chat-citation "fly to" camera pan (2D equivalent of the galaxy's existing chat-navigation
feature).

## Stage 4 — Day/night + weather tied to brain mood/entropy; full parity audit

Only after Stage 2 gives every current tab a real in-world home: a full parity checklist against
today's `DockTab` list, then — and only then — the separate, explicitly-scoped deletion of
`graph/*` and `RightDock`/panel components per D1's staged replacement.

## Explicitly not scheduled

Any battle/combat mechanic (D3, permanent). Multiplayer/shared worlds (permanent, privacy
non-negotiable). A hand-authored Tiled-binary map pipeline (Porymap-equivalent tooling) unless
Stage 2+ proves hand-authoring at scale is actually needed over data-driven layout.
