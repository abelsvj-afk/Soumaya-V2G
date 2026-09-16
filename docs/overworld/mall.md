# The Mall — backlog #83 (task #116)

## What's being asked

"Build the Mall as a multi-stall shop complex" — deferred three separate times (`npc-economy.md`,
`npc-llm-dialogue.md`, `wave4-full-vision.md`) each time with the same resolved framing, never
contradicted since: **a real widening of Business (task #67), not a new mechanic.**
`wave4-full-vision.md` §5 already resolved the shape:

> a new building, structurally a multi-stall version of Business — 3-4 small shop stalls under
> one roof, each running the EXISTING `BusinessOverlay.tsx` pattern per stall (not a new overlay
> type), zoned/built the same way as any other Business via Hangar, just a bigger footprint with
> multiple door-adjacent stall entries.

This doc resolves the remaining mechanical questions that framing left open, then this round
builds it.

## Investigated first (per "verify before you build")

Read `business.ts` in full. Today's model: one `BusinessType` = one footprint = one door tile
(`x0 + floor(width/2), y1` — always the bottom-row center) = one shared goods catalog
(`type.goods`), one owned-goods set keyed only by `businessId`. Every business type (Bakery,
Tailor, Bookshop) is a single stall by construction. Confirmed the Hangar's Business section
(`HangarOverlay.tsx:417`) already iterates `BUSINESS_TYPES` generically with zero per-type
branching — a new entry in that array needs **zero Hangar changes** to show up, buy, arm, place,
and demolish correctly.

## Design decisions

1. **Data shape**: `BusinessType` gains an optional `stalls?: readonly BusinessStall[]`. A
   `BusinessStall` is `{ id, name, icon, goods: readonly BusinessGood[] }` — literally a smaller
   `BusinessType` minus footprint/price (the building itself carries those once, not per stall).
   Every existing type (Bakery/Tailor/Bookshop) is left with `stalls` absent — they keep behaving
   as exactly one implicit stall, verified by making the door-tile formula below reduce to
   today's exact formula when stall count is 1. Zero risk to existing placed businesses in
   anyone's localStorage: no stored field changes shape, this is purely additive to the type
   catalog (which isn't user data) and a purely-computed door/goods lookup.

2. **Door tiles, not stored, always derived**: rather than storing N door tiles on
   `PlacedBusiness` (a real migration risk for existing single-door businesses already saved to
   localStorage), stall doors are computed on the fly from the footprint + stall count:
   `x = x0 + floor((i + 0.5) * width / n)`, `y = y1` (the bottom row, same convention every other
   business door already uses). For `n = 1` this is exactly `x0 + floor(width/2)` — the existing
   formula, byte-for-byte — so every current single-stall business's real stored `door` field
   stays the single source of truth for itself; the new multi-stall lookup is a strict superset
   that only produces something new when a type actually has `stalls`.

3. **Interaction**: stepping onto ANY stall's door tile opens the SAME `BusinessOverlay.tsx`,
   now told which stall via a `stallIndex` carried on the `enter-business` event and the
   `overlay.kind === "business"` state — never a new overlay component. A stall shows its own
   icon/name/goods; a non-Mall business (no `stalls`) behaves completely unchanged (`stallIndex`
   defaults to 0, and `type.goods` is read directly when `stalls` is absent — matching the exact
   current behavior with zero regression).

4. **Goods/ownership**: `purchaseGoodFromBusiness` gains an optional `stallIndex` — resolves the
   good from `type.stalls[stallIndex].goods` when stalls exist, `type.goods` otherwise. The owned-
   goods set stays keyed by `businessId` alone (not per-stall) — safe because every stall's goods
   use their own distinct id prefix (`mall_toys_*`, `mall_flowers_*`, `mall_candles_*`), so there's
   never a real collision to guard against, and one shared owned-set means a stall's own
   "Owned"/"Buy" state is naturally scoped to just that stall's own goods either way.

5. **Footprint, price, art**: 6x3 (18 tiles — the same footprint every OTHER business/civic
   building already uses at its base size, just wide enough to fit 3 evenly-spaced stall doors
   with real gaps between them, confirmed by the formula above: doors land at x0+1, x0+3, x0+5).
   Price: 1200¢ ($12.00) — deliberately above Bookshop's 800¢, the most expensive existing single
   business, since this is strictly more building for more money, not a cheaper shortcut to 3
   shops. Art: falls through to `businessBuildingSprite()`'s existing `ARCHED_HALL` default for an
   unmapped type id — no new art sourced this round (asset sourcing is its own tracked task,
   #74/#78's own convention of shipping mechanics now, art later when it's real and license-clean).

6. **The 3 stalls**: real distinct flavor, not "Bakery again x3" — a Toy Stall, a Flower Stall, a
   Candle Stall, each with 3 small goods (mirroring the existing 3-goods-per-type convention).
   Chosen as generically "mall-shop" flavor that doesn't duplicate any existing business type's
   own identity.

## Deliberately deferred

- Real distinct Mall building art (falls to the existing ARCHED_HALL default, same as Market).
- A live rectangle preview while placing the 6x3 footprint (town-builder's existing single-tile
  arm-then-place flow already handles arbitrary footprints via `isFootprintFreeForBusiness`;
  no new placement UX this round).
- More than 3 stalls, or letting a placed Mall's stall roster be customized post-build.

## Verification plan

New `business.test.ts` cases: the door-formula reduction proof (n=1 stall-door equals the old
single-door formula, for several widths); Mall's 3 real door tiles are distinct and inside its own
footprint; `businessStallDoorAt` resolves the right stall index for each of the 3 doors and `null`
elsewhere; `purchaseGoodFromBusiness` with a `stallIndex` only ever matches that stall's own goods,
never a different stall's or a different business's. Updated `BusinessOverlay.test.tsx` cases for
the stall-aware render. Full gate before commit.
