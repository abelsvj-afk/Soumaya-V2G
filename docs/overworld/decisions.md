# Overworld — Decisions (ADR-lite)

> Resolves the build brief's open questions plus engineering choices surfaced while researching
> the codebase (see the Explore survey folded into [architecture.md](./architecture.md)). Read
> after [requirements.md](./requirements.md).

## D1 — Full replacement, not a toggle

**Decided (user, 2026-09-11): full replacement.** The overworld is the only presentation layer
going forward; there is no long-term "switch back to the galaxy" mode.

**Staging, so this doesn't mean a big-bang rewrite:** per the house rule "verify before you build"
and the brief's own suggested build order, the galaxy renderer (`graph/*`, `RightDock.tsx` +
panel components) stays in the tree and buildable until the vertical slice is proven against real
data. The overworld ships first as a new, additively-added entry point inside `packages/web`
(reusing the existing space-auth flow, not a parallel product). Once the vertical slice — and
later, full parity across all 11 areas — is verified, a **separate, explicit later change**
deletes the galaxy code and `RightDock`. This spec covers only the additive phase; the deletion
phase gets its own short spec + sign-off when parity is real, not assumed.

## D2 — Real-time grid movement, not map-select

**Decided (user): real-time free movement.** Classic grid-based walking with a D-pad, camera
follows the player. Bigger build than map-select, chosen because it matches the brief's primary
vision and the product's mobile-first, "world you inhabit" goal.

## D3 — No combat

**Decided (user): walk-up-and-greet, no battle mechanic, ever.** "Wild encounters" only ever
trigger the **capture flow** (new thought → extraction reveal) or the **greet/revisit flow**
(existing memory → tend). This is a hard constraint, not just an MVP simplification — reflects the
brief's own reasoning ("a reflective tool, not a game about conflict") and the product's
no-dark-patterns rule.

## D4 — Literal ship/mount travel between regions

**Decided (user): literal flying/sailing transition**, using the Hangar-customized vehicle,
matching the existing 3D galaxy's ship metaphor. Out of scope for the MVP vertical slice (single
region, no inter-region travel needed yet) — specified fully when region-to-region travel is
built (see [roadmap.md](./roadmap.md) Stage 3).

## D5 — Engine: Phaser 3

**Decided:** Phaser 3, per the brief's own recommendation — built-in Tiled-style tilemap support,
sprite atlases, arcade physics good enough for grid movement, first-class mobile touch input, and
the most mainstream/maintained option for exactly this genre. PixiJS was the brief's suggested
lighter alternative; not chosen because Phaser's batteries-included tilemap/physics/input layer is
worth the extra dependency weight for a real-time movement + collision system we'd otherwise have
to hand-roll (violates "don't add dependencies casually," but the alternative is reinventing tile
collision and input handling by hand, which is a worse trade for a UI-only dependency with no
runtime access to user data).

## D6 — Location in the monorepo: new source tree inside `packages/web`, not a new workspace

**Decided:** `packages/web/src/overworld/` (Phaser scenes, sprites, the API-adapter layer), not a
new npm workspace/sibling package. Reasoning: the overworld needs the exact same
`api/client.ts`, `x-space-id` auth/session flow (`auth`-related state in `App.tsx`), build
tooling, and Vite/PWA setup that already exists — duplicating those into a second package buys
isolation we don't need and costs a second set of config/build/deploy wiring, which conflicts
with "don't add dependencies casually" and the single-container Fly deploy model. `App.tsx` is
changed to mount the overworld root instead of `Graph3D`+`RightDock` once the slice is ready
(D1's staged replacement); until then, both mount conditionally so galaxy behavior is provably
unaffected during the additive phase.

## D7 — Rarity tiers map 1:1 to the actual 7 `CelestialClass` values, not the brief's 6

The brief's translation table lists 6 tiers (asteroid→Common … supergiant→Legendary), but the
real `CelestialClass` in `packages/shared/src/celestial.ts` has **7**: `asteroid, moon, planet,
gas_giant, giant, star, supergiant`. Rather than force a mismatch with the actual mass model,
rarity uses all 7, with `gas_giant` slotted between Rare and Super Rare as its own tier:

| CelestialClass | Rarity label | Badge (never color-only) |
|---|---|---|
| asteroid | Common | plain circle outline |
| moon | Uncommon | filled circle |
| planet | Rare | diamond |
| gas_giant | Rare+ | ringed diamond |
| giant | Super Rare | star-4 |
| star | Epic | star-6 |
| supergiant | Legendary | star-8 + sparkle |

## D8 — The dimming/revisit loop reuses the existing entropy + tend system exactly; no new API

**Confirmed via codebase research, not assumed:** the exact mechanic the brief asks for
("a creature/place is dimming, come say hi") already exists end-to-end server-side and needs no
new backend work for the MVP slice:
- `GraphNode.entropy` (0..1) is computed live on every graph read, from `lastTendedAt` + `degree`,
  via `entropyFrom()` in `packages/shared/src/celestial.ts` (`COOLING_ENTROPY = 0.45` is the
  existing "needs attention" threshold used elsewhere in the app already).
- `POST /api/nodes/:id/tend` (client: `tendNode(id)` in `api/client.ts`) already exists and is
  exactly the "greet" action — resets `last_tended_at`.
This is a case where the domain boundary in `pokemon-reference.md` holds perfectly: the overworld
consumes `entropy`/`classify(mass)`/`tendNode()` as-is and never redefines the math.
**Separate note:** `reviewStrength` (SM-2 spaced repetition, `GET/POST /api/review/*`) is a
*different* existing system (active-recall quiz-adjacent, distinct from ambient dimming) — not
part of the MVP slice; flagged in [roadmap.md](./roadmap.md) as a candidate later loop (e.g. the
Sanctuary/Mind region), not conflated with the greet mechanic.

## D9 — Money/Bank slice reuses `GET /api/finance/sky` (`MoneyStar[]`) almost directly

`MoneyStar { kind: "bill"|"goal", state: calm|approaching|cooling|overdue|paid|goal_filling|
goal_reached, amountCents, glyph, intensity, dueInDays?, fillPct? }` is already the exact
"bills/goals as objects with an urgency state" shape the Bank building needs — it was built for
the galaxy's `moneySky.ts` star rendering and translates directly to Bank-interior objects
(a ledger row + an icon whose state maps to shape, per the color-is-never-alone rule) without any
new endpoint. `GET /api/finance/summary` (`BudgetSummary`, incl. `safeToSpendCents`) backs the
"what can I afford" counter.
