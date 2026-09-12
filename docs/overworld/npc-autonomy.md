# Overworld — NPC Autonomy round: real movement across town (decided, in progress)

> Follow-up to [npc-society.md](./npc-society.md) and [npc-economy.md](./npc-economy.md). Per
> CLAUDE.md Rule #1, the design decisions below are recorded before any code — this is real
> architecture (`overworld/engine/*` is explicitly Claude's own Red Zone, not `agy`'s), not a
> polish pass. D3 (no combat, ever) still applies — moving NPCs are never a threat.

## The ask

"spec it out. add more autonomy as well. more things v they do and moving around" — following
directly from the previous round's answer to "are they autonomous?": their schedule and
break-time interaction already run on their own, but they never actually go anywhere beyond
their own doorstep, and their income is entirely reactive to the player. This round gives them
real movement across the town and more independent things to do while off duty.

## What this unblocks: the previously-deferred "walk to Park" and "gather at Town Hall"

npc-economy.md scaled BOTH of these back explicitly because, with only a straight-line tween and
no real pathfinding, having up to 20 sprites converge on a couple of tiles at once was a real
crowding risk with no way to verify it was safe. **Real pathfinding changes that calculus**: NPCs
now walk the actual grid, at a real per-tile pace, from wherever they actually are — across a
46x24 region, that means genuinely different, spread-out travel times, which staggers arrivals
for free instead of needing an invented queueing system. Both deferred items become safely
buildable this round.

## Decisions (made without a question — stated plainly so they're checkable)

1. **Pathfinding: grid BFS, not A\*.** The region is small (46x24 = 1,104 tiles) and mostly open
   ground — BFS on 4-directional neighbors is exactly correct here (uniform cost, guaranteed
   shortest path) and far simpler to get right and test than A\*'s heuristic tuning would be for
   essentially no benefit at this grid size. Capped at a real visited-node budget (the same
   lesson `achievements.ts`'s own bounded `pathfinder_quest` DFS already taught this codebase —
   an unreachable goal must return `null`, never hang the frame).
2. **A new passability rule for NPC travel, not the player's own `isMovementPassable`.** The
   player's rule blocks every attendant's fixed post tile (so the player can't walk through a
   stationed NPC) — but that would make every real destination (a building's own post tiles)
   permanently "impassable," including to itself. NPCs don't physically collide with each other
   (they're plain sprites, not physics bodies), so a new `isNpcPathPassable` in `regionLayout.ts`
   drops just that one check, keeping every other real rule (walls, objects, bounds) identical.
3. **Outings are decoupled from the schedule's Home window, not squeezed inside it.** Home is
   only ~4 ticks (6 real seconds) — nowhere near enough for a real round trip across a
   46-tile-wide map. Outings run on their own independent, per-NPC-desynced timer; if the
   schedule flips to Working while an NPC is mid-outing, the outing is simply abandoned and the
   normal "walk to door, hide" transition takes over from wherever they currently are (the
   existing tween already animates FROM the sprite's current position — no special interrupt
   handling needed, just don't fight it with a leftover outing tween/timer).
4. **Two outing destinations for now: Park (rest) and Market (a small personal errand) —
   alternating, not exhaustive.** Both already exist as real places; neither invents a new
   building or system. A wider destination list (visiting a friend, an errand tied to their own
   job) is a real next step, not this round's job.
5. **The Town Meeting gathering sends every one of the 20 attendants**, matching the ORIGINAL
   npc-society.md proposal (only ever scaled back for the crowding risk, never because sending
   everyone was wrong). Each paths to one of a few real "meeting slots" around Town Hall's own
   footprint (the same kind of footprint-derived tile generation `attendantPosts()` already
   uses — never hand-typed), shows the 📢 cue, then paths back to wherever their own schedule
   says they should currently be.

## What this round builds

### 1. `engine/pathfinding.ts` — real BFS, pure, budget-capped
`findPath(start, goal, grid, options?)` — same `MovementGrid` shape `engine/movement.ts` already
defines (`{ width, height, isPassable }`), so both consumers share one passability contract.
Returns the full tile-by-tile path (inclusive of start and goal) or `null` if genuinely
unreachable or the search budget runs out. Deterministic (fixed neighbor-check order) — same
start/goal/grid always yields the same path.

### 2. `regionLayout.ts` — `isNpcPathPassable(x, y)`
Everything `isMovementPassable` checks except the attendant-tile block (decision #2). Building
walls, standalone objects, and region bounds still block; a building's own or another building's
post tiles do not.

### 3. Off-duty outings — `ExteriorScene.ts`
Each society NPC gets its own outing timer (real ms, desynced per NPC like every other
decorative timer in this file). On fire: if the NPC is currently in `home` state AND not already
on an outing, pick a destination (Park or Market, alternating per NPC) via `findPath`, become
visible, walk the path, linger briefly, walk back to their own post, then let the normal Home
hidden-state resume. If nothing is currently `home` for that NPC, the timer just tries again
next time (tolerate-gracefully, same convention as every other conditional loop here).

### 4. Real Town Meeting gathering — `ExteriorScene.ts`, `regionLayout.ts`
`announceTownMeeting()` (currently a same-spot icon flash) becomes: every attendant paths to a
real meeting slot near Town Hall, shows 📢 there, then paths back. An `atMeeting` flag per
sprite suspends the normal per-tick schedule-transition rendering for exactly that sprite while
it's away, so the meeting's own tweens are never fought by a Working/Break/Home transition
firing mid-walk; normal rendering resumes the instant the sprite is back.

## Explicit non-goals for this round (flagged, not silently dropped)

- Cross-building relationships / visiting a *specific* friend rather than a fixed destination —
  the relationship model still only tracks a building's own pair (`npcRelationships.ts`).
- A\* / weighted terrain / any pathfinding beyond plain BFS — not needed at this grid size.
- NPCs choosing an outing "personality-driven" beyond the fixed Park/Market alternation.
- Player-visible pathfinding (the player still moves by direct keyboard/D-pad input, unchanged).
