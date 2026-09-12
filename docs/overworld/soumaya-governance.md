# Soumaya's governance, autonomy, and the town's "real government" — reconciliation + Stage 2.17

> Per Rule #1: this single request bundled seven-plus interconnected asks, several of which
> conflict with what's already shipped or with hard constraints (D3). This doc resolves each
> ambiguity plainly, states what ships in Stage 2.17 (this round) vs. what's deliberately
> deferred and why, and gives the deferred items a real home in the tracked task list rather
> than getting lost. Nothing here invents new data sources — every mechanic below is either
> already real (townLedger, buildingNeglect, npcSchedule, the BFS pathfinder) or explicitly
> flagged as needing its own future spec before any code.

## The request, condensed

Soumaya should be autonomous and mobile, "communicate with everyone," and be "the Mayor" who
holds Town Meetings; there should be a real (non-combat) crime/policing signal tied to the
economy; NPCs should stop fading away when off duty and should have visible lives outside work;
NPC dialogue should eventually be LLM-generated, batched for token cost, and staggered per-NPC;
not every interaction needs full narrated text; political "divisions" should emerge as NPC count
grows; and a real bug (Soumaya's chat overlay flashing open-closed) needed fixing. Soumaya should
also get her own "mayor building" and "her security."

## Resolved decisions

**1. Soumaya vs. Mira — "the Mayor" conflict.** `npc-society.md` §4 already framed Mira's "Mayor"
label as **"a role, not a superior... just who calls the meeting"** — a flavor title with zero
mechanical weight, chosen only because her post happened to be one of the two already at Town
Hall. That makes this an easy, non-destructive reconciliation: Soumaya becomes the town's real
governing figure (she's the one the player actually talks to, already has chat/GraphRAG, and is
the one who'll convene meetings — see #2), and Mira's title softens to **Deputy Mayor** in her
one flavor comment. Nothing else about Mira changes — same schedule, same dialogue, same
relationship with Dez. This is a one-line rename, not a rebuild.

**2. Soumaya becomes a real autonomous, movable companion (Stage 2.17, shipped this round).** She
was a static ground-layer image at a fixed tile — the literal cause of "she doesn't move around."
Converted to a real sprite (container + body, the same split `CreatureSprite` already uses so her
wander tween and idle bob never fight) that tours the town's real buildings in a deterministic
loop (cycling `allPlaces()`'s door list — never `Math.random()`, matching this scene's own
desync convention), reusing the exact BFS pathfinder + `walkPath`-style tile-by-tile tweening
already built for NPC outings (`npc-autonomy.md`). This restores, in the Overworld's own terms,
the role she had in the deleted 3D galaxy ("flew around to all the memories and things") — she now
visibly does her rounds instead of standing still. Measured before shipping (not assumed): a
script ran her real tour against the real 46x24 map, `findPath` succeeding for all 10 buildings
across 2 full laps, ~18 tiles/leg average, comfortably inside her 7s wander period.
`handleInteract()` now checks her live `currentTile` (like a creature's own "check current
position, not placement anchor" rule) before falling back to the Bulletin Board's still-static
`objectPlaceAt` lookup.

**3. "Communicates with everyone."** Interpreted narrowly for this round: she's now physically
present near every building on her rounds, which is the precondition for any future NPC-to-NPC
interaction. Actually wiring a visible Soumaya↔NPC exchange (dialogue or silent) is real new
surface area that belongs with the cross-building relationship work already tracked as **task
#59** — folding it in there rather than building a second, parallel relationship system just for
Soumaya.

**4. "Soumaya holds the meetings."** `announceTownMeeting()` already exists and has real teeth
(a Bulletin Board post from a genuine new Synthesis Digest insight). Making her the one who
personally leads the walk-to-Town-Hall gathering — arriving at a distinguished slot, the 📢 cue
anchored to her instead of ambient — is a natural follow-on to #2 now that she's a real mobile
sprite, but is deferred out of this round to keep the diff reviewable; tracked as a follow-up
against **task #59** alongside her NPC interactions.

**5. Her own "mayor building" + "her security."** Deferred, not built this round. Reasoning: the
town's building-generation algorithm (`regionLayout.ts`) supports adding an 11th door-place
cheaply, but a new building drags in real per-building wiring across `npcDialogue.ts` (attendant
profiles for "her security"), `npcJobs.ts`/`townLedger.ts` (does a Mayor's Hall earn wages the
same way, or is it exempt?), and `buildingNeglect.ts` — real design questions, not mechanical
copy-paste, and the interaction (what does *walking into* a Mayor's Hall actually show you?) needs
its own answer before code. "Her security" is read as: a couple of attendant NPCs posted outside
it, identical to every other building's existing attendant pattern — stated here as the working
interpretation rather than a blocking question, but flagged since it's a plausible reading, not a
certainty. Tracked as a new follow-up task rather than folded into an existing one, since it's
genuinely new surface area (a new building), not an extension of NPC society mechanics.

**6. Political "divisions" as NPC count grows.** Deferred — there are 20 NPCs across 10 buildings
today; "divisions representing groups" describes a scale this town hasn't reached and has no real
data to hang off yet (no faction/district concept exists anywhere in the domain model). Revisit
once/if the NPC count actually grows meaningfully past today's 20, rather than building a grouping
mechanic with nothing real to group.

**7. Crime/policing, reframed for D3.** `decisions.md` D3 is explicit and permanent: **"no battle
mechanic, ever."** A literal crime/police NPC system with any adversarial mechanic is out,
full stop — not a judgment call. The real, compliant version of what's being asked (an economy
that can "mess up" and a reason to intervene) **already exists**: `buildingNeglect.ts`'s
entropy-shaped decay is exactly a civic-health signal already tied to the real economy (hours
worked, wages, town treasury). What doesn't exist yet is a townwide AGGREGATE view and a real
consequence when neglect is widespread rather than per-building — that's real, scoped, buildable
work (a Town Meeting variant triggered by townwide neglect crossing a threshold, surfaced as a
Bulletin Board civic concern, same non-violent mechanism the digest-triggered meeting already
uses). Deferred to its own follow-up task so it gets a proper look at the real neglect data first
rather than being bolted onto this round.

**8. NPCs no longer fade away when off duty (Stage 2.17, shipped this round).** Real, direct
reversal: `applySocietyState`'s Home branch used to fade the sprite to alpha 0 then hide it —
literally "left for the day." Home now behaves like Break: visible, resting at the attendant's own
post, neglect-visual included. What actually gives them "a life outside just a job" is the outing
system already built in `npc-autonomy.md` (periodic real walks to Park/Market while Home) — that
mechanism didn't change; only the bug where they were invisible *between* outings did. All three
"resume Home's own hidden state" call sites (the outing return leg, its unreachable-fallback path,
and `restingTileFor`) were updated consistently; `restingTileFor`'s return type is now
non-nullable, since Working/Break/Home is an exhaustively-handled 3-value union and the old `null`
case ("Home means hidden") no longer exists.

**9. LLM-generated dialogue, token-cost batching, and variable-detail interactions.** All three
are properties of a system that doesn't exist yet — today's NPC dialogue (`npcDialogue.ts`) is
100% hand-authored pools with milestone/relationship gating, never an LLM call. This request is
correctly understood as requirements for **task #61** ("LLM-flavored NPC dialogue + a proper
Mall") rather than a gap in something already built. Recorded here so #61's eventual spec is
required to address: (a) batching many NPCs' generation into fewer LLM calls, (b) staggering
DISPLAY per NPC on its own already-existing desync timer rather than firing on every API
response, and (c) NOT every interaction needing full narrated text — sometimes a visible
walk/gesture with no text is enough, which is also the cheapest possible interaction. These are
now permanent requirements of #61's spec, not optional flourishes.

**10. Dialogue reflecting real, evolving town state (economy/health/growth).** Also folded into
task #61 rather than built ahead of it — meaningful LLM-flavored dialogue needs the LLM pipeline
from #9 to say anything not already coverable by the existing hand-authored pools. Real data to
ground it in already exists (`townLedger.ts` treasury/wages = economy, `buildingNeglect.ts` =
health, node/NPC counts over time = growth); "food" has no real backing data anywhere in the
domain model and is explicitly NOT invented — omitted rather than faked.

## What actually shipped this round (Stage 2.17)

1. Soumaya: static image → real autonomous, pathfinding-driven companion touring every building.
2. NPCs: no longer fade to invisible when off duty (Home renders like Break, resting at post).
3. Mira: title softened to Deputy Mayor (flavor-only; her name/dialogue/schedule are unchanged).

## What's deferred, and where it lives

- Soumaya↔NPC visible interactions + her personally leading Town Meetings → task #59.
- A Mayor's Hall building + attendants ("her security") → new follow-up task (not yet created;
  needs its own short design pass on what walking in actually shows, per Rule #1).
- Townwide-neglect civic-concern signal (the D3-compliant "crime/economy" reframe) → new
  follow-up task, grounded in the real `buildingNeglect.ts` data.
- Political divisions scaling with NPC count → explicitly not started; revisit if/when NPC count
  actually grows past 20.
- LLM-generated + token-batched + variable-detail dialogue, and town-state-aware conversation
  content → folded into task #61's eventual spec as hard requirements, not follow-ups to it.
