# Overworld — NPC Society (v1 vertical slice — decided, in progress)

> Per CLAUDE.md Rule #1 ("no code until the design is complete") this went through a full
> proposal + sign-off round before any code was written. Read alongside
> [decisions.md](./decisions.md) — D3 (no combat, ever) constrains everything here: "governance"
> and "conflict" must stay non-adversarial, no exceptions.

## Decisions (user, 2026-09-11)

Answered against the three open questions below:

1. **Dialogue content: Hybrid.** Hand-authored pools ship in v1 (matches the recommendation —
   free, instant, offline-safe); the data shape (`npcDialogue.ts`'s `NpcProfile`) is built so a
   later stage can route a line through the LLM adapter for extra flavor without a rework —
   not built now, just not architected shut.
2. **Scope: small vertical slice first.** Not all 8 attendants — **two NPCs only** for v1, both
   at Town Hall (the two attendants `attendantPosts()` already places there): **Mira** (the
   Mayor) and **Dez** (the Clerk). Chosen specifically because their posts are already right
   next to each other, so the "NPCs interact" mechanic doesn't need any new pathfinding across
   the map — the proximity the proposal assumed is already true by construction. The other 6
   buildings' 12 attendants are explicitly **unchanged** (still pace + flash a work icon, no
   schedule/dialogue/relationship) until a later stage rolls the same system out to them.
3. **Priorities: seed in relationships AND governance-with-real-teeth, not deferred** — the user
   selected both non-goals as things they actually want, alongside confirming the base proposal's
   shape is otherwise right. So v1, unlike the original draft's "explicit non-goals," ships:
   - A real (if minimal) **relationship counter** between Mira and Dez — not anonymous
     interchangeable encounters.
   - A **town meeting with an actual mechanical effect** — not flavor-only. See mechanic 4 below.

## What v1 actually builds (concrete, not aspirational)

- **Schedule**: a shared in-game clock (`npcSchedule.ts`, tick-based, no wall-clock/Math.random)
  drives Mira and Dez each through Working → Break → Home, offset from each other so they're not
  always in the same state at once.
- **Interaction**: when a tick lands with *both* on Break, they step toward each other, a speech
  bubble shows a real dialogue line for each (`npcDialogue.ts`), and their relationship counter
  bumps once for that break window (`npcRelationships.ts`) — not once per tick.
- **Growth**: each has a small hand-authored line pool — job-flavor lines (always available),
  personal lines that unlock on real achievement ids they already have (`components/
  achievements.ts` — no invented threshold), and one "friend" line each that only unlocks once
  their relationship counter crosses a real tier.
- **Governance**: a Town Meeting is called the first time a **new** Synthesis Digest insight
  becomes available (`getDigest()`) — not on a timer, not invented. Its one concrete effect: a
  plain-language summary is posted to the **Bulletin Board as a real quest**
  (`ingestText(text, { kind: "action" })` — the same mechanism the Bulletin Board itself uses),
  and Mira/Dez flash a 📢 above themselves. This never re-announces the same insight twice
  (persisted "last announced" id) and never blocks or gates anything the player needs to do.

## Deferred out of v1 (flagged, to widen later, not silently dropped)

- Rolling the schedule/dialogue/relationship system out to the other 6 buildings' 12 attendants.
- LLM-generated dialogue variation (the data shape supports it; not wired up).
- Actual town-hall gathering (all attendants physically walking to Town Hall) — v1's "meeting" is
  the real Bulletin Board post + a cosmetic icon on the two Town Hall NPCs, not a town-wide walk.
- Relationship tiers beyond 3 (strangers/acquaintances/friends) and any effect beyond unlocking
  one extra dialogue line.

---

## Original proposal (context for the decisions above)

## The core idea: NPCs reflect *your real activity*, not an invented simulation

The brief's non-negotiable (idea.md) is that this whole app never invents data — every creature,
every building, every number on screen already comes from the real graph/finance/journey APIs.
The same rule should govern the NPCs' "lives": their schedules, conversations, and meetings
should be driven by **real signals already in the app** (streaks, digests, journeys, memory
counts), not a freestanding Sims-style economy running for its own sake. That's also the direct
answer to "we'd need reasons for all of it" — the reason is always "something real happened."

## Proposed mechanics

### 1. Jobs — a real daily schedule, not an infinite identical loop
Each attendant already has a post and a work-icon (Stage 2.9). This adds a simple 3-state cycle
driven by an in-game clock (a simulated day, not wall-clock time — offline-first, no server
dependency): **Working** (at their post, current pacing + icon) → **Break** → **Home** (they
leave their post's screen area entirely for a while, e.g. stand at a bench, then return). Every
NPC's schedule is offset (like the existing desync hash) so the town doesn't move in lockstep.

### 2. NPCs talk to each other — a specific, legible trigger
When two attendants are both in **Break** at the same time AND their posts are within a set
distance, one walks to the other and a speech-bubble icon (💬) shows briefly above both. This is
the "specific thing that causes them to interact" — not random, not constant: it only happens
when the schedule overlap actually occurs, which is itself desynced per NPC, so meetings look
organic rather than scripted.

### 3. Personalities and talking points outside the job, that grow
Interacting with an attendant already shows their work icon; this adds an actual line of dialogue
(a lightweight one-line popup, **not** an LLM chat — see "Open question 1" below) drawn from a
small pool per NPC: a mix of job-flavor lines and a few personal/off-duty lines (a hobby, an
opinion, a running joke). "Grows and changes" = **new lines unlock on real milestones already
tracked by the app** — a streak day, a memory-count threshold, a Journey's progress crossing
25/50/75/100%, an achievement unlock (`components/achievements.ts` already has exactly this kind
of threshold data) — so an NPC's dialogue pool visibly grows as *you* actually do things, not on
a timer. This is the same "reasons for all of it" principle applied to personality growth.

### 4. Governance + town meetings — tied to a real recurring feature, not invented politics
One attendant (Town Hall's) is the **Mayor** — a role, not a superior; D3 still applies, no
authority over anything mechanical, just who calls the meeting. A **Town Meeting** triggers when
a *real* event happens that's worth surfacing to the whole town: the leading candidate is a
**new Synthesis Digest being ready** (`getDigest()` — already the Observatory's real data
source, CLAUDE.md's north-star "surfaces latent connections"). When one's ready, every attendant
walks to Town Hall, gathers, and the "meeting" literally previews the digest's topic in plain
language ("word going around town: your Sanctuary and your Fisherman's Guild projects might be
connected") — a diegetic wrapper around a feature that already exists, not a new one. Attendance
is a locally-controlled cosmetic; a meeting never blocks or gates anything the player needs to do.

## Explicit non-goals for a first version (flagged, not silently dropped)

- No relationship graph between NPCs (friendships/rivalries) — Break-state encounters are
  anonymous/interchangeable for now.
- No personality **traits** shaping tone/dialogue algorithmically — the dialogue pools are
  hand-authored per NPC, not generated.
- No mechanical effect from governance/meetings on real app state — flavor only, reversible,
  never a gate.
- No LLM-generated dialogue in v1 (see Open question 1) — cost/latency/offline-first tension
  with the app's "always works with no API key" guarantee.
- No new backend endpoints — every trigger above reads data the app already exposes.

## Open questions (need your call before any code)

1. **Dialogue content: hand-authored or LLM-generated?** Hand-authored (a small `.ts` data file
   per NPC, like `data/achievements.ts`) is free, instant, fully offline-safe, and matches the
   app's existing no-hard-cloud-dependency rule — but it's static; I write the lines once and
   they don't vary. Routing dialogue through the existing LLM adapter (`llm/adapter.ts`) would
   let lines feel fresher/more varied, but costs real API spend per interaction, adds latency,
   and needs a heuristic-mode fallback (the app's own rule: "never make a feature hard-depend on
   a cloud key"). **Recommend hand-authored for v1**, with LLM-flavor as an explicit later stage
   once the mechanical skeleton (schedules, triggers, unlocks) is proven.
2. **Scope this as its own Stage 3, or fold into the lighter loop like recent fixes?** This is
   bigger than a bug-fix/polish pass (new data model: schedules, dialogue pools, milestone
   hooks) — recommend treating it as a proper staged build (its own vertical slice: 1-2 NPCs
   fully wired, verified, before rolling out to all 8) rather than one big commit.
3. Anything in "explicit non-goals" you actually *do* want in v1 (e.g. you did mention
   relationships/governance fairly specifically) — flag which of those matter most so the first
   slice targets the right one(s) rather than my guessing at priority.
