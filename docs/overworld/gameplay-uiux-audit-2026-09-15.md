# Overworld gameplay/UI-UX/asset/engine audit — 2026-09-15

Direct response to the user stepping back and asking for a full judgment of the Overworld against
SimCity/city-builder peers: what's missing, what's broken, and whether we actually have the
assets needed to function — not just how it should function conceptually. The economy critique
(pricing-gauged treasury, construction delay, Hangar previews) shipped earlier the same day
(Stage 2.41) was the first pass; this is the deeper pass the user asked for after that.

Method: four parallel, read-only investigation agents, each scoped to one layer, each required to
cite exact `file:line` for every finding rather than describe from memory. Findings below are
grouped by severity and layer, deduplicated across the four reports. This doc is the fix backlog —
each item below maps to a tracked task; items marked **[FIXED same round]** were addressed in the
implementation that shipped alongside this doc, everything else is tracked for a follow-up round.

## Critical — real bugs, money loss, exploits

1. **Re-arming a Hangar item/home/business forfeits the money already spent, silently, with no
   refund.** `armItem`/`armHomeType`/`armBusinessType` all spend the treasury *at arm time*, then
   simply overwrite the single armed-slot key on a second call — the first purchase's coins are
   gone, nothing was ever placed for them, and nothing in the UI says so. Confirmed the money-loss
   is real and **unverified by any existing test** — each module's "re-arming replaces the first"
   test only asserts the armed id changed, never that a refund happened (because none does).
   `townBuilder.ts` `armItem`, `housing.ts:115-125`, `business.ts:147-157`.

2. **Zoning has zero awareness of already-built structures — a real cross-type overlap exploit.**
   `zoning.ts`'s `isTileZonable` only checks static geometry, never `placedHomes()`/
   `placedBusinesses()`. `isFootprintFreeForHome`/`isFootprintFreeForBusiness` each only check
   their OWN category's placed list, never the other's. Concrete repro: zone residential → build a
   Cottage → re-zone the same tile commercial (nothing stops this) → build a Bakery on the same
   tile. This directly falsifies `business.ts`'s own doc comment ("a business can never legally
   overlap a home — the zoning gate alone prevents that"). Zero test exercises this path.

3. **Creature placement, roaming, and NPC pathfinding are all blind to placed homes/businesses —
   in both directions.** `loadWorldSnapshot.ts`'s `isBlocked` predicate checks town-builder decor
   but never imports `housing.ts`/`business.ts`, so a creature can be freshly, deterministically
   placed directly onto a tile inside an *already-built* home/business on every graph reconciliation
   (after every greet/capture). The reverse is also true: `isFootprintFreeForHome`/`...Business`
   never check a creature's tile — only the ONE interact press that places it. `buildRoamCage` and
   `isNpcPathPassable` (`regionLayout.ts`) have the identical gap, so creatures keep roaming onto,
   and NPCs/Soumaya path straight across, tiles a building now occupies. Compounded by **no
   explicit depth/y-sort** between creature containers (depth 0 default), attendants (depth 1), and
   placed buildings (also depth 1, insertion-order tie-break) — a trapped creature can render
   invisible behind a building while remaining hit-testable (greetable) at that tile, and NPC walks
   visibly clip through/behind player-built structures.

4. **Armed placement modes silently eat every interact press, with a HUD indicator for only 1 of
   4 modes.** `handleInteract`'s check order is: armed town-builder item → armed zone → armed home
   → armed business → *then* creature-greet/Soumaya/object. Any armed mode returns early — a
   forgotten arm silently swallows a press meant for a creature, with zero feedback whether the
   tile was blocked or something else ate the press. `TownHud.tsx` only shows a persistent
   chip+Stop button for the **zoning** arm state. An armed town-builder item, home type, or
   business type (checked FIRST in the priority chain, so the most likely to be silently active)
   has no equivalent indicator anywhere — a player who arms a Cottage and walks away has no way to
   tell why greeting stopped working short of returning to the Hangar.

5. **Zero destructive-action confirmations anywhere in the app.** Deleting a Journey, deleting a
   user-written Timeline chapter, deleting a saved Lens, and "Turn in" on a Bulletin Board quest
   (which is a real `deleteNode`) all fire immediately on one tap, no confirm, no undo. Consistent
   (nothing anywhere uses a confirm pattern) but every one is a single-mis-tap-away permanent loss.

6. **`CaptureMenu`'s "submitting" phase is a genuine dead end if the request stalls.** No Cancel/
   Close button, no Escape-key handling anywhere in the Overworld. If the network `ingestText` call
   hangs, the only way out is reloading the page — unlike the sibling `"error"` phase, which
   correctly offers "Try again"/"Close".

7. **Persistent top-right buttons (TownHud, Settings/track/mute) paint over and stay clickable
   through every overlay, including the Settings overlay itself** — a real CSS stacking bug.
   TownHud and the button row both set `zIndex: 1`; no overlay (`OverlayShell.tsx`,
   `CaptureMenu.tsx`, `CreatureSummaryOverlay.tsx`) ever sets a zIndex (default `auto`), and
   explicit positive z-index always paints above `auto` regardless of DOM order. The button row at
   `top:44/right:8` lands inside `OverlayShell`'s own header band on typical phone widths — visually
   overlapping every overlay's icon+title and remaining tappable through the modal's dark scrim.
   This is the same class of bug CLAUDE.md's own history already recorded once (AuthGate logout
   button vs. TownHud) — a fresh instance was introduced when TownHud/the button row were given
   z-index without ever giving the overlay layer a higher one.

## High — dead content, perf risk

8. **6 achievements, and the Hangar cosmetics they gate, are permanently unwinnable.**
   `stat.beacons_deployed`, `stat.travel_hops`, `stat.memories_tended`, `stat.commissions`,
   `stat.types_seen`, `stat.lenses_made` are read by `achievements.ts` but have **zero writers**
   anywhere in the current codebase — their write sites lived in the deleted 3D galaxy code and
   nothing in the Overworld replaced them. This locks 3 of 4 non-default ship hulls (Holographic
   Sentinel, Fusion Core Destroyer) and 2 of 3 non-default trail colors (Void Purple) in the Hangar
   catalog behind achievements no current gameplay action can ever satisfy. Not a design gap — a
   provable regression from the galaxy deletion.

9. **Full destroy-and-recreate of every rendered creature's Phaser objects on every `refresh()`,
   uncapped.** `renderCreatures`/`paintCreature` kills tweens, destroys all children, and rebuilds
   the sprite + a new infinite idle-bob tween + up to two marker texts per creature — for EVERY
   creature already on screen, not just changed ones — on every single greet/capture. With
   real placement capacity around 850-1100 tiles, this is a believable real-device slowdown path as
   node count grows, with no cap independent of `prefersReducedMotion()`.

## Assets — what we actually have vs. what the game presents

No broken/404 asset reference exists anywhere in the Overworld — every sprite, tile, and music
path in code resolves to a real file. The "feels unfinished" read is real, but its cause is
**aggressive reuse, not breakage**:

- **5 building illustrations cover 17 place/type slots.** All 4 home types share 1 PNG (COTTAGE),
  all 3 business types share 1 PNG (ARCHED_HALL), and Mayor's Hall/Gym/Town Hall all reuse
  FLAG_TOWER with zero new art (Mayor's Hall's own doc comment admits it "reads as biggest via
  footprint only, not silhouette"). Park has no building art at all (falls to the COTTAGE default,
  gets only 5 small 16px decor tiles).
- **Creature art never varies by rarity**, only by NodeType (9 sprites total) — all 7 rarity tiers
  of a given type render the identical sprite, differentiated only by a text/glyph badge, never a
  distinct illustration. Task #74 ("source real assets") never actually delivered rarity-distinct
  creature art, only the building/decor pass.
- **3 buildings' NPC attendants have no dedicated sprite** (Market, Park, Mayor's Hall) and fall
  back to literally the player's own character sprite — an NPC that looks identical to Soumaya's
  ward is a real, confusing visual bug, not just a style gap.
- **Orphaned Hangar figurine options** (`star_center_figurine`, `dyson_sphere_figurine` in
  `hangarOptions.ts`) reference `.glb` model files that no Overworld code path ever loads — already
  self-flagged in-repo ("Ship hull/figurine choices still have no visual effect") but worth
  re-confirming as still true.
- **~40MB of orphaned 3D-galaxy assets remain on disk** (`public/*.glb`, `draco/`, `basis/`,
  `milkyway-eso.jpg`, `ship-engine-*`) with zero code references anywhere under `src/` — roughly
  70% of `public/`'s total size, pure dead weight from the 2026-09-11 galaxy deletion that was
  never cleaned up.
- **`CREDITS.md` is honest and complete** for everything actually used — no undisclosed licensing
  gap. It already self-discloses that 3 music tracks + `ship-engine-start.mp3` have no known
  license/attribution — a real open risk for shipped assets, just already flagged, not new.

## Medium — real bugs, lower severity

10. **`checkCivicConcern` isn't actually pure despite its own "Pure:" doc comment** — it calls
    `clearConcern()` (a `localStorage.removeItem`) as a side effect on every non-widespread check.
    The write itself is desired/idempotent; the label is just misleading.
11. **Two independent meeting triggers (`townMeeting.ts` digest-based, `civicConcern.ts`
    neglect-based) share one mechanism with no debounce/sequencing between them** — if both
    conditions become true in the same session, two independent gatherings could plausibly queue
    back-to-back. Needs a check of `OverworldRoot.tsx`'s actual call ordering to confirm whether
    this is reachable in practice.
12. **"20 society NPCs" is wrong everywhere it's stated** — `npcDialogue.ts`'s `PROFILE_LIST`
    actually declares 22 (11 buildings × 2). Functionally harmless (every real consumer uses
    `.length`/modulo dynamically) but the "meeting slots are more generous than any building's
    attendant count" claim is sized against the wrong headcount, and appears wrong in housing.ts,
    business.ts, townLedger.ts, ExteriorScene.ts, regionLayout.ts, and this file's own status log.

## Minor polish

13. `CreatureSummaryOverlay.tsx` doesn't use `OverlayShell` at all — the one interaction surface
    that visibly breaks the "one consistent themed panel" system every other overlay follows.
14. `SanctuaryOverlay.tsx`'s 5-section, button-dense layout likely compresses tap targets under
    standard touch-target guidance on real phone widths (needs on-device confirmation).
15. `TouchControls.tsx` renders a permanently-disabled "B" button with no label explaining why.
16. `GymOverlay.tsx`'s Codex "Claim" state is session-only React state — closing/reopening resets
    already-claimed buttons back to "Claim" even though the server call was idempotent and nothing
    is actually lost; reads as "did that not save?"
17. Mayor's Hall's "Town Health" and Park's neglect list render near-identical content — not a
    bug, a discoverability/redundancy wrinkle.
18. No onboarding of any kind for a brand-new/empty town — the only instructions in the whole app
    are a static "How to Play" list behind a gear icon a first-time player has no reason to find.
19. No way to see which buildings you have/haven't visited, and no map overview, now that the
    camera is a scrolling viewport rather than a fixed picture of the whole map.

## Structural gaps vs. the genre (design work, not bug fixes — tracked separately)

Carried over from the earlier economy critique the same day, restated here for one complete
backlog: no ongoing tax/revenue from built structures (built things are pure sinks forever), no
demand signal (RCI-style), two zone types (`sidewalk`/`transit`) are purely decorative with zero
mechanical effect, no upkeep/maintenance cost, neglect has no real teeth (dims/pauses but never
demolishes/removes value), homes have no neglect concept at all (asymmetric with businesses), no
population growth (fixed 20-22 NPC roster forever), NPCs never actually walk to their assigned
home (bookkeeping with no visible payoff), and no demolish/remove function exists anywhere for a
misplaced item/home/business.

## Fix plan

**Wave 1 (this round, correctness fixes — no design decision needed):** items 1-7 above (critical)
plus the render-churn/depth-ordering pair (9, part of 3). These are bugs, not product decisions.

**Wave 2 (this round if time allows, otherwise immediately next):** item 8 (dead achievements —
needs a content decision on what real Overworld action replaces each dead stat, done here as a
straightforward 1:1 mapping, not a redesign), asset cleanup (orphaned 3D-galaxy files), and the
doc-accuracy fixes (10, 12).

**Wave 3 (follow-up spec rounds, tracked as tasks #99/#101):** passive income from built
structures (the economy fix from the earlier pass today), onboarding/tutorial, a real demolish/
remove mechanic, giving sidewalk/transit zones real function, population growth. Each gets its own
spec doc per Rule #1 before code, same as every prior round this session.
