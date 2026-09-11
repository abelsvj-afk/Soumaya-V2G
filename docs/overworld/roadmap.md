# Overworld — Roadmap (Phase 6/7)

> Stage 1 is this design package's scope and what gets built immediately after sign-off. Stages
> 2+ are named for continuity/planning only — each gets re-checked against this package (and a
> short addendum if anything material changed) before it starts, per Rule #1 applied per-stage.

## Stage 1 — Vertical slice (this package's scope)

1. Engine shell: `Phaser.Game` bootstrap, scene manager, keyboard + touch input event bus,
   grid-snapped player movement + collision, camera follow. **No API calls yet** — provable with
   a static test map.
2. Adapter layer + unit tests: `nodeToCreature`, `moneyStarToBankObject`, `journeyToRegionMeta`,
   deterministic placement — proven against real API response fixtures before any scene wiring.
3. Money region exterior scene wired to real `getGraph()`/`finance.*` calls (loading/empty/error
   states from ux-design.md).
4. Bank interior scene + menu overlay.
5. Capture flow (tall-grass trigger → `CaptureMenu` → `ingestText` → reveal).
6. Greet/revisit loop (dim-state rendering from real `entropy` → interact → `tendNode` →
   reconcile) — **the loop to build and prove first**, per the brief's own priority, even though
   it's listed last here for narrative completeness; implementation order should front-load this.
7. Accessibility pass (`prefers-reduced-motion`, non-color state pairing) verified alongside each
   piece above, not as a separate end-of-stage pass.
8. Gate + adapter/threshold/placement/collision tests green; log in `GEMINI_CHANGES.md`; commit to
   the designated branch.

**Suggested first PR**: items 1–2 only (engine shell + adapter layer, fully unit-tested, no scene
wiring yet) — the smallest slice that's independently reviewable and reversible.

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
