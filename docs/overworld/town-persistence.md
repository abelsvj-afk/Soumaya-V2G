# Does the town run whether or not the player is present? (Stage 2.28, task #68)

> Per Rule #1. The task's own framing ("town runs whether or not the player is present") is an
> architecture QUESTION as much as a build — this doc answers it honestly from what's actually
> true in the current codebase (checked by reading the real code, not assumed), then scopes the
> one real, safe fix this round actually ships.

## What's actually true today (verified by reading the real code, not assumed)

**Already runs independent of the player being present, with zero changes needed:**
`buildingNeglect.ts`'s `daysSinceWorked`/`neglectFor` and every civic-concern/Town-Health/
Business-Neglect readout built on it are ALL computed from a real stored timestamp
(`markWorked`'s `nowMs`) compared against `Date.now()` at read time. Close the app for 3 real
days, reopen it, and every neglect readout is instantly correct for those 3 real days — this
already "runs" without the player, because it was never tick-based to begin with.

**Does NOT run independent of the player, and here's exactly why:** `ExteriorScene.tickSociety()`
(the NPC Working/Break/Home schedule) is driven by `societyTickCount`, a private field
incremented by `+= 1` inside a `this.time.addEvent({ delay: 1500, loop: true, ... })` Phaser
timer. That timer only exists, and only fires, while the scene is mounted and running — closing
the tab stops it outright, and reopening starts a brand-new scene with `societyTickCount` back
at `0`. So today, every NPC always resumes exactly at the START of a fresh Working phase on
reload, no matter how much real time actually passed. This is a real, measurable gap — not a
guess — confirmed by reading `init()`: nothing persists or restores `societyTickCount`.

**Cannot run independent of the player, as a genuine architecture boundary, not a cop-out:**
Every visual consequence of that schedule — an attendant's walk-to-door tween, an outing's
round-trip walk to Park/Market, the Town Meeting gathering choreography — is Phaser tween state
that only exists on a live, rendered canvas. This app has no server-side job/worker, no
background sync, and no simulation loop outside the browser tab (confirmed: the server's own
`api/`/`services/` layers have no cron/queue infrastructure, and every Overworld data module is
localStorage-only, client-side). Actually animating an NPC's walk while nobody has a browser
tab open would require standing up a genuinely new piece of infrastructure — a server-side town
simulation that persists and advances state independent of any client, replacing the current
"everything lives in this browser's localStorage" model. That is a MUCH bigger project than this
round's scope, and is explicitly, plainly deferred below rather than attempted partially.

## Resolved decision

**The one real, safe fix this round: make the NPC schedule's own PHASE (not its animation)
wall-clock-derived instead of session-tick-derived.** `npcSchedule.ts`'s `scheduleStateAt(npcId,
tick)` is already a pure function of a `tick` number — it does not care where that number comes
from. Today's caller derives `tick` by counting timer fires since scene mount (session-bound,
resets on reload); this round changes the caller to derive `tick` from `Math.floor(Date.now() /
SOCIETY_TICK_MS)` instead — a real, continuous function of wall-clock time. `scheduleStateAt`
itself needs ZERO changes (verified: it already just does `(tick + hashOffset) % CYCLE_TICKS`,
which works identically for a small session counter or a large wall-clock-derived number).

The practical effect: close the game for any length of time and reopen it, and every NPC's
Working/Break/Home phase is immediately whatever a continuous, always-running clock would show —
never frozen at "just started Working," matching how neglect/treasury already behave. The 60
real-second Working/Break/Home cycle length itself is UNCHANGED (this is deliberately still an
arcade-paced cycle, not a real day/night length — a much bigger, separate design decision this
doc does not attempt to make).

## Deferred, explicitly

A real server-side town simulation that keeps NPCs walking/gathering/relationship-bumping while
no browser tab is open — the actual "architecture" the task's own title names, genuinely a new
infrastructure investment (persistent server-side town state + a scheduler), not a client-side
tweak. Nothing in this round pretends otherwise or half-builds toward it. Task #69 (deepening the
player-action feedback loop) does not need this to proceed — it only needs the schedule-phase fix
above (a consistent "is this building's NPC currently on duty right now" answer) plus the wages/
neglect systems that already work correctly without it.
