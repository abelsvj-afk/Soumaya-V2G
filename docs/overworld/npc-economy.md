# Overworld — Town Economy & bigger slice (v1, decided, in progress)

> Follow-up to [npc-society.md](./npc-society.md). Per CLAUDE.md Rule #1, the biggest ambiguous
> pieces here got resolved with the user directly (2026-09-12) before code — recorded below —
> rather than guessed. Read alongside [decisions.md](./decisions.md); D3 (no combat, ever) still
> applies to everything here (a shop is a transaction, not a fight).

## The ask (verbatim intent) and what it resolves to

The user asked for, in one message: a bigger NPC rollout, buildings ~3x their current size,
NPCs that visibly enter/exit buildings for Working/Break/Home, NPCs earning a wage paid for real
work, that work being *created by the user's own interactions with the app's areas*, new shops/
stores/recreational places/malls, a Sims-style "real life" for NPCs, behavior that adapts to
"health," and reusing "the old mechanics from the universe."

### Resolved decisions (user, 2026-09-12)

1. **Wages are a purely cosmetic in-game ledger — never the real Bank/finance data.** Confirmed
   explicitly. `data/townLedger.ts` tracks fictional hours/wages, isolated from
   `getMoneySky()`/`getFinanceSummary()` entirely.
2. **"Health" = the old galaxy's own neglect mechanic, extended.** The user's own words: tie it
   to "how memories and things worked in the old galaxy style" — hours are only posted when the
   player actually does something in an area; if they never do, the NPCs there "risk not
   earning," which "strains relationships and other cascading issues." This is `entropyFrom()`'s
   exact shape (`shared/celestial.ts`, `COOLING_ENTROPY`) applied to a new subject (a building's
   real-work history instead of a memory's tend history) — not a new invented stat.
3. **"Old mechanics from the universe" = the real per-building data already wired into every
   Overlay** (Bank/Library/Sanctuary/Bulletin Board/Observatory/Post Office/Gym/Town Hall/
   Hangar), "properly structured for this new style" — not the deleted galaxy's clustering/codex/
   sector systems, which the user did not ask for and which stay deleted. Every "job" below is a
   REAL mutating call one of these Overlays already makes.
4. **Scope: full spec now, one big staged build.** This doc + the tasks below are that build,
   sequenced so each piece is independently tested before the next depends on it.

### One thing resolved without a question (stated so it's checkable, not silent)

**Fuel is NOT the shop currency.** Checked `shared/types.ts`'s `Fuel` before assuming otherwise:
`fuel`/`capacity`/`jobCost` is "cost the agent pays per autonomous LLM job" — a server-side LLM
cost meter, never something the player manually spends in a menu (Hangar's cosmetics are gated
by real achievement ids / memory-count thresholds, not a Fuel purchase — re-checked
`data/hangarOptions.ts` directly, no spend call exists anywhere). Spending real Fuel on cosmetics
would misuse a resource that means something else entirely. Instead, the new Shop/Market spends
the **Town Treasury** (the sum of every NPC's cosmetic wages) — which gives the wage number a
real mechanical effect (this round's "real teeth," same principle as the Town Meeting's Bulletin
Board post) while staying entirely inside the new, clearly-fictional in-game ledger.

## What this round builds

### 1. A generated region layout, not a hand-coded coordinate table
`regionLayout.ts`'s `DOOR_PLACES` was 8 hand-typed footprints. Resizing buildings and adding new
ones by hand risks exactly the kind of silent-overlap bug the region-layout tests already exist
to catch. This round replaces it with a small layout generator: a list of `{ id, label, glyph,
widthTiles, heightTiles }` per row + a fixed gap, producing footprints/doors by construction —
overlap becomes structurally impossible instead of something a test has to discover after the
fact. "3x the current size" is applied as **3x footprint area** (6 tiles → 18: 6 wide x 3 tall),
not 3x every linear dimension (which would make a single building bigger than the entire old
region) — stated plainly here so it's a checkable choice, not a silent guess.

### 2. Two new buildings: Market (shop) and Park (recreation)
Added to the south row alongside Gym/Town Hall/Hangar. Market is the shop — spends the Town
Treasury on cosmetic unlocks (`MarketOverlay.tsx`). Park is a real destination for the NPC
schedule's Break state (see below) and, cosmetically, a place the player can visit too.
**Deferred, flagged, not silently dropped**: a "Mall" as its own multi-stall complex bundling
several shops — v1 ships one Market building; a Mall is a real widening of this, not this
round's job.

### 3. Real wages from real interaction — `data/npcJobs.ts` + `data/townLedger.ts`
Every building's attendants earn cosmetic hours/wages only when a REAL mutating call already
made by that building's own Overlay actually fires — reusing `achievements.ts`'s own
diff-detection pattern (compare old vs. new state, credit only what's genuinely new):

| Building | Real work event | Existing real API |
|---|---|---|
| Bank | a bill paid or a goal reached (state transition in `MoneyStar[]`) | `getMoneySky()` |
| Library | a real search performed | `search()` |
| Sanctuary | a thought logged / cognitive reframe saved | `api/mind.ts` mutations |
| Bulletin Board | a quest posted, turned in, or a reminder acked | `ingestText`/`deleteNode`/`ackReminder` |
| Observatory | an insight resolved | `resolveInsight()` |
| Post Office | a real notification read/acked | `Toasts.ts` |
| Gym | a new achievement or streak gain | `data/achievements.ts` / `getStreak()` |
| Town Hall | a Journey created/updated | `api/journeys.ts` CRUD |
| Hangar | a cosmetic actually changed | `hangarOptions.ts` writes |
| Market | a shop purchase made | new, this round |

No building earns hours on a timer — only on a real, already-existing user action. Skip a
building entirely and it earns nothing that day, which is the whole point of decision #2 above.

### 4. Neglect cascades — `data/buildingNeglect.ts`
Per building, `entropyFrom()`'s real shape applied to "time since this building's last real
work event" (not memory-tend time — a new subject, same math, not a new concept). Above the
existing `COOLING_ENTROPY` threshold: that building's relationship growth between its two
attendants pauses (never decays into negative — matches the "never a dark pattern" rule), its
attendants render with the same non-color dim "?" cue creatures already use, and it earns zero
wage that tick. Never blocks or gates anything the player needs to do — pure flavor + a paused
number, exactly like every other Overworld consequence.

### 5. All 10 buildings get NPCs with real lives, not just Town Hall
`npc-society.md`'s Town-Hall-only slice (Mira/Dez) is generalized to the other 8 buildings' 16
attendants (Market/Park included) — 20 NPCs total, each pair sharing a building the same way
Mira/Dez do: their own schedule, their own break-time interaction + growing dialogue (tied to
that building's own real achievement ids), their own relationship counter.

### 6. NPCs actually enter and exit buildings
Real user feedback: "enter buildings when working, exit for break, and exit when off as well."
Concretely: **Working** — the attendant walks to their building's door tile and is hidden (truly
"gone inside," not just standing at a post); the work-icon cue still flashes from the door tile
on the same timer, so "they're in there working" stays visible without needing a moving sprite.
**Break** — visible again, exits to their own post right outside their own building, where the
building's own two attendants have their interaction (unchanged from npc-society.md v1's proven
pattern, now running independently per building). **Home** — hidden again (unchanged — they've
left for the day).

**Revised while implementing (flagged here rather than silently changed):** the original plan
above had every building's Break-state attendants walk across the map to a shared Park tile.
With 10 buildings' pairs all running the same shared clock, that meant up to 20 sprites
potentially converging on the same couple of tiles at once — a real crowding/positioning risk
with no queueing system to back it up, and nothing this round could actually verify was safe.
Scaled back to the proven-safe version instead: each building's break interaction stays local to
its own doorstep, exactly like Mira/Dez already did in v1. Park is still real (a real building,
its own 2 NPCs, its own nameplate/door) — it just isn't yet the destination for every OTHER
building's break time. A real "walk to Park" system is deferred, not dropped.

## Explicit non-goals for this round (flagged, not silently dropped)

- A Mall as its own multi-building complex (Market is one shop; a Mall widens this later).
- Real pathfinding to the Park — v1 is a direct tween to a fixed Park-adjacent tile, not
  obstacle-aware routing.
- LLM-generated dialogue (still deferred from npc-society.md v1).
- Any real-money/Fuel integration for the shop (Town Treasury only, by design — see above).
- A literal building *interior* scene (Working = hidden, not a walkable room) — the door tile
  is still the only "inside," same as every other building today.
