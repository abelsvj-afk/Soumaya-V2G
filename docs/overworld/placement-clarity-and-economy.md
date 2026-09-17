# Placement you can actually do, an economy that actually runs (task #128)

> Per Rule #1. Direct response to real on-device feedback, paraphrased from the user's own words:
> "I armed a $3 Cottage, went outside, walked over a tile zoned for housing, and there's no way to
> place it... zoning should highlight once you're armed to show where it can fit... there's no clear
> indication on how to do anything in this game, you'd have to already know it... money is not being
> made, we already have NPCs, I should already see money running up... the interior of buildings is
> literally just the ground from the outside and the tile doesn't line up... when I said I need real
> interiors, I didn't tell you to make one up."
>
> Every claim below was reproduced or measured first. The user is right on all of them.

## 1. You genuinely could not place a Cottage — reproduced

Reproduced against the real map, real zoning, real `isFootprintFreeForHome`. Zoned a real 2x2
residential block at (4,5)-(5,6), armed a real Cottage (2x2, 300c), then stood on each side of it
facing in — the four natural things a player does:

```
below the block, facing up     front=(4,6) footprint=(4,6)-(5,7) zonedOK=false coversPlayer=true  => SILENTLY FAILS
right of block, facing left    front=(5,5) footprint=(5,5)-(6,6) zonedOK=false coversPlayer=true  => SILENTLY FAILS
above the block, facing down   front=(4,5) footprint=(4,5)-(5,6) zonedOK=true  coversPlayer=false => PLACES
left of block, facing right    front=(4,5) footprint=(4,5)-(5,6) zonedOK=true  coversPlayer=false => PLACES
```

**Two of the four natural approaches silently do nothing.** Root cause: the footprint always anchors
its TOP-LEFT corner at the faced tile and extends right/down, regardless of which way you are facing.
Approach from below or from the right and the building tries to grow *backwards through you* and off
the zoned area. Nothing tells you why. A 50/50 coin flip with no feedback reads exactly as "there is
no way to place it."

Compounding it: task #126's own `footprintBlockedByActor` guard (added hours earlier, correctly, to
stop you building on top of yourself) now hard-blocks those same two directions. That fix was right
about the symptom and made the real disease more total — before it, facing up/left put a building on
your head; after it, nothing happens at all.

## 2. Money genuinely is not being made — root-caused

All three passive income streams pay exactly **zero** on a real new town:

- **Structure rent** (`passiveIncome.ts`) needs a placed home/business — blocked by §1.
- **Resident income** (`passiveResidentIncome.ts`) needs built housing — blocked by §1.
- **NPC tax** (`passiveNpcIncome.ts`) skips any NPC whose building `isNeglected`. And
  `daysSinceWorked` returns `Infinity` for a building with no work event, so `neglectFor` returns
  1 — maximally neglected. Every building starts that way. There is an existing test that asserts
  exactly this ("never worked = maximally neglected... credits nothing").

So a new town is structurally incapable of earning anything until the player both fixes §1 *and*
walks a full circuit of all 12 buildings. The user's "we already have NPCs, I should see money
running up" is the correct expectation and the code contradicts it.

## 3. The interior floor tile is wrong — measured, and it was my error

`TileFrame.path` (atlas frame 3) is **not** a floor tile. Measured its 256 pixels: 99 of them
(38.7%) are grass green, in a border around a central dirt patch. It is an isolated-patch
dirt-through-grass tile. Tiled across a floor it produces a grid of separated dirt squares with
green gutters — rendered a 3x3 tiling and confirmed by eye. Exactly what the user described. This
should have been caught by looking at the tile before using it, which is the repo's own standing
rule.

## Decisions

1. **The footprint extends away from you, in the direction you face.** New pure helper
   `footprintForFacing(playerPos, facing, width, height)`: facing down/right keeps today's
   top-left-at-the-faced-tile behavior (unchanged); facing up anchors the footprint's BOTTOM edge at
   the faced tile, facing left anchors its RIGHT edge. The building always grows into the space you
   are looking at, never back through you. This makes all four approaches work and, as a free
   consequence, the footprint can never cover the player — so #126's guard stays as a safety net for
   creatures/Soumaya rather than a blocker.

2. **A live ghost preview, the user's explicit ask.** While a home/business is armed, the exact
   would-be footprint renders in-world as a translucent ghost that follows the player's position and
   facing every step, with a non-color-only validity marker (✓ / ✗ glyph plus tint, never colour
   alone per the repo's a11y rule). Every tile currently zoned for the armed category also gets a
   low-alpha highlight, so "where can this go" is answerable at a glance instead of by memory.

3. **Tell the player why a placement failed.** A refused interact currently returns in silence. It
   now emits a short reason ("needs a 2x2 residential zone", "something's in the way", "not enough
   in the treasury") through the existing toast/HUD path, so a failure teaches instead of confusing.

4. **Neglect starts when the town is founded, not at the epoch.** New per-space `foundedAt` stamp,
   written once on first load. `daysSinceWorked` measures an un-worked building from `foundedAt`
   rather than returning `Infinity`. A brand-new town is therefore NOT in crisis on day one, NPC tax
   flows immediately, and money visibly runs up from the start. `neglectFor` itself is unchanged.
   Knock-on, deliberate and an improvement: `civicConcern` no longer fires a town meeting the
   instant a fresh save loads (its old behaviour was documented as deliberate but reads as a bug).

5. **Real interior art, sourced not invented.** Pulled Kenney's **RPG Urban Pack** (CC0, 576 real
   16x16 tiles — the same tile size and the same author as the Tiny Town/Tiny Dungeon art already in
   this game) from the same CC0 mirror the Park-decor round already proved reachable. Reviewed a
   rendered contact sheet by eye, not by filename: it carries genuinely seamless wood-plank and
   stone floors, real shop counters, and shelving. The interior room's floor becomes a real seamless
   floor tile and the counter tile becomes a real counter. Per-building-type interior fit-out
   (bookshelves in the Library, a teller counter in the Bank, etc.) and NPCs occupying interiors is
   named here as the immediate next round — genuinely more work than a tile swap, and the user's own
   instruction was to do it properly rather than fake it again.

## Deliberately NOT in this round, and why

- **Dispatch a crew for ANY build job** (currently 1-tile zoning/decor only). The user wants to queue
  the two Hangar builders for homes/businesses too, optionally letting them choose the spot. That is
  a real feature on top of `buildQueue.ts`, not a tweak, and it needs the §1 placement geometry to be
  correct underneath it first. Next round.
- **Road building discoverability.** Roads exist today only as the `transit` zone type buried in the
  Hangar, which is why the user cannot find them. Fixing this properly means a first-class build
  menu, not another hidden toggle — it belongs with the same UX pass as dispatch.
- **NPC autonomy review.** The user asked to revisit how deep it goes. That deserves reading the
  shipped behaviour and reporting honestly, not a rushed change.

## Verification plan

- The §1 reproduction re-run after the fix: all four approaches must place.
- New `footprintForFacing` unit tests (all 4 facings, all real home/business sizes, never covers the
  player).
- New neglect tests: a fresh town earns real NPC income; an old un-worked building still neglects.
- A pixel measurement of the chosen floor tile proving it is seamless (no grass border) before it is
  wired, plus a rendered tiling check.
- Full gate.
