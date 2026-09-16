# Build queue + worker dispatch (task #123)

> Per Rule #1. Direct quote from the request this answers: "we need a proper way thats not to slow
> for building roads and all the various stuff like in city builders. Even queue hangar employees
> to dispatch and do the building." Deliberately deferred out of the same round that fixed the
> other 3 complaints in that message (interior walk-in agency, NPC teleport, population income —
> see `simcity-realism-pass.md`) because it has real open design decisions this doc resolves.

## Investigated first, not guessed

Read every placement system that currently exists before designing anything new:

- **Zoning (`zoning.ts`) already has an Area mode** (`zoning-rework.md`, task #77): two interact
  presses (an anchor, then a commit) zones an entire rectangle in one action, and arming now
  persists across paints. So the "one tile, one Hangar trip" friction is already fixed for
  zoning specifically — this is real prior work, not a gap to re-solve.
- **What's still genuinely missing, confirmed by reading every arm-then-place flow
  (`zoning.ts`, `townBuilder.ts`, `housing.ts`, `business.ts`)**: every single one of them requires
  the PLAYER'S OWN AVATAR to be physically standing at (or adjacent to) the target tile and press
  interact themselves — there is zero mechanism anywhere in the codebase for work to happen
  without the player's literal real-time presence. Area-mode zoning still needs the player to walk
  to both corners in person. A road that runs the length of the town still needs the player to
  physically walk that whole line at least once. This is the real, still-open gap the user's
  message is naming — not tile-by-tile friction (already fixed), but **personal-presence-for-
  everything** friction.
- **The exact machinery a dispatch system needs already exists and is proven**: NPC outings
  (`ExteriorScene.ts`'s `maybeStartOuting`) already do a real BFS-pathed (`engine/pathfinding.ts`'s
  `findPath`), tile-by-tile tweened (`walkPath`) round trip to a destination and back, with a
  `Set<npcId>` busy-flag (`outingActive`) and correct interruption handling if a schedule
  transition reclaims the sprite mid-walk (the exact bug this session just fixed in
  `simcity-realism-pass.md`). Dispatch reuses this verbatim — no new movement primitive needed.

## Decisions

1. **Who are "Hangar employees"?** The Hangar's own 2 real, already-hand-authored attendant NPCs
   (`ATTENDANTS_PER_BUILDING = 2`, same as every other building) — never invented characters. This
   matches the user's own words ("hangar employees") and the session's standing convention of
   reusing real existing NPCs rather than adding new ones for a new mechanic (the Mall reused the
   existing business shape, Theater reused existing showings data, etc.).
2. **What does dispatch animate?** A new schedule-state override, `"dispatched"`, layered on top
   of the existing Working/Break/Home cycle exactly the way an outing or a Town Meeting already
   overrides it without touching the underlying clock. A dispatched attendant is invisible at their
   own post (matches "Working" rendering — they're doing real work, just elsewhere) and instead
   walks (BFS + tile-by-tile tween, same as an outing) to the queued order's target tile, "works"
   there for a fixed real duration, then proceeds to the next queued order or walks home to the
   Hangar once the queue is empty. No teleporting anywhere in this flow — this directly answers the
   same "no coming out of a building... teleporting... fast" complaint this round already fixed for
   outings, applied consistently to the new system.
3. **Replace or supplement manual placement?** Supplement, never replace. Walking up and placing
   something yourself stays exactly as fast as it already is (especially zoning's Area mode, which
   is already a 2-press whole-rectangle action) for a player who wants the immediate, hands-on
   loop. The queue is for when the player would rather keep exploring/socializing while the town
   builds itself in the background — the real "city builder" feel the request is asking for.
4. **Treasury interaction.** Unchanged cost model. Zoning stays free (per `zoning.ts`'s own
   decision #3); a queued decor item still spends its real price from the Town Treasury the moment
   it's queued (same "afford → spend → arm" convention `armItem` already uses) — dispatch changes
   WHO executes the order and HOW LONG it visibly takes, never what anything costs.
5. **A real tradeoff, not a free lunch.** While dispatched, an attendant is unavailable for their
   own normal Break-time interaction/dialogue and Hangar-specific duties — visibly absent from
   their post, same as genuinely Working. Dispatching your workforce to build costs you their usual
   presence for a while, a real and honest cost.
6. **Both attendants are dispatchable, working the queue in parallel** (the user's own message says
   "employees," plural) — each free attendant claims the front of the queue independently, so two
   orders can be in progress at once, not serialized through one worker.

## Scope for this slice (v1) vs. deferred

**This slice covers exactly the two cases the request names**: zoning orders (single tile or an
already-defined rectangle) and town-builder decor items (`townBuilder.ts`'s `PLACEABLE_ITEMS`) —
both are strictly 1x1-target operations with an existing "is this tile free" predicate, so a queued
order is a direct, low-risk generalization of the exact same arm-then-place shape they already use.

**Deferred, explicitly**: dispatching a home or business placement. Both are multi-tile footprints
whose "is this free" check spans several tiles and can change while a worker is en route (another
order or the player could occupy part of the footprint first) — real new validation-at-completion-
time logic that deserves its own follow-up pass once this slice's simpler 1-tile case is proven, not
guessed into this round.

## Data model

`data/buildQueue.ts` (new, pure, localStorage-backed — same convention as `zoning.ts`/
`townBuilder.ts`):

```ts
export type WorkOrderKind = "zone-tile" | "zone-rect" | "item";

export interface WorkOrder {
  id: string;
  kind: WorkOrderKind;
  // zone-tile: one {x,y}. zone-rect: the rectangle's own two corners. item: one {x,y} + itemId.
  x0: number; y0: number; x1: number; y1: number;
  zoneType?: ZoneType;   // set for zone-tile / zone-rect
  itemId?: string;       // set for item
}

export function queuedOrders(spaceId): WorkOrder[];
export function enqueueZoneTile(spaceId, x, y, type): WorkOrder | null;      // validates isTileZonable
export function enqueueZoneRect(spaceId, x0, y0, x1, y1, type): WorkOrder | null; // at least one zonable tile
export function enqueueItem(spaceId, x, y, itemId): WorkOrder | null;        // spends treasury like armItem
export function cancelOrder(spaceId, orderId): boolean;                     // refunds item price if applicable
export function claimNextOrder(spaceId, workerId): WorkOrder | null;        // pops FIFO, marks claimed by workerId
export function completeOrder(spaceId, orderId): void;                      // applies the real effect, removes it
export function dispatchedWorkerIds(spaceId): string[];                     // which Hangar attendants are out
```

`completeOrder` is where the real effect actually lands — it calls straight into the existing,
unmodified `zoneTileAt`/`zoneRectangle`/`placeArmedItem`-equivalent logic (re-validating the target
is still free at completion time, since time has passed since the order was queued; a target that's
no longer free is silently dropped and refunded if it cost anything — same no-dark-patterns
tolerance every other placement miss already uses).

## NPC schedule integration

`npcSchedule.ts`'s `ScheduleState` gains `"dispatched"` as a 4th state, but — like outings and Town
Meetings before it — this is applied as an ExteriorScene-level override on top of the existing
Working/Break/Home tick output, never a change to `scheduleStateAt`'s own pure math (which stays
exactly as it is; a dispatched attendant simply isn't asked to render whatever the clock says while
the override is active, the same precedent `applySocietyState`'s outing-interrupt branch already
established this round).

## Interaction model

**Queueing** (from the Hangar, where the catalog/zoning-type picker already lives): a new "Send a
crew" option next to each catalog item and zoning type — instead of arming it for the player to
place personally, it enqueues a work order. For zoning, the player still designates WHERE by the
existing tile/area targeting (an anchor + commit, but queued instead of painted immediately). For a
decor item, the player designates where the same way `placeArmedItem` already does — arm, walk to a
tile, interact — except the new option queues it there instead of placing instantly.

**Dispatch loop** (`ExteriorScene.ts`, a new tick on the same cadence as the society clock): for
each of the Hangar's 2 attendants, if idle (not already dispatched, not on an outing, not at a Town
Meeting) and the queue is non-empty, claim the next order, `findPath` to its target, `walkPath`
there, hold for a fixed `WORK_DURATION_MS` (same real-seconds-visible convention `CONSTRUCTION_MS`
already established for a placed home/business), call `completeOrder`, then repeat for the next
order or `findPath` home to the Hangar and resume the normal schedule once the queue is empty.

## Accessibility / motion

No new primitive — reuses `walkPath`'s existing `prefers-reduced-motion` handling (an instant snap
instead of a tween) verbatim, same as every other NPC movement in this codebase.

## Verification plan

- Pure logic (`buildQueue.ts`): enqueue/claim/complete/cancel semantics, FIFO order, treasury
  spend/refund on item orders, re-validation at completion time for a target that's gone stale.
- `npcSchedule.ts`: the new `"dispatched"` state is additive only — every existing test for
  `scheduleStateAt`/`countWorkingTicks` must stay green unmodified (proves this is a pure add, not a
  behavior change to the existing 3-state cycle).
- Full gate (typecheck + server + web tests + build) before commit, same as every other round.
