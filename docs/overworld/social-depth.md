# Cross-building NPC relationships (Stage 2.30, task #59)

> Per Rule #1. Direct answer to the user's repeated ask for NPCs with "actual... interact with
> other npcs... their own lives" beyond just their own building's coworker. Resolves the real
> gap: `npcRelationships.ts`'s `bumpRelationship(spaceId, npcIdA, npcIdB)` was always generic
> over ANY two npcIds — it was never restricted to same-building pairs. The gap was purely in the
> SCENE: nothing ever gave two different buildings' NPCs a real chance to actually meet.

## What already exists that this must reuse, not reinvent

- **`npcRelationships.ts`** — the pairwise relationship counter/tier, already generic over any
  two npcIds. Zero changes needed.
- **`npc-autonomy.md`'s outings** — off-duty NPCs already walk to Park or Market
  (`maybeStartOuting`), alternating per NPC, desynced 25-52 real seconds apart. This is the ONE
  real, already-shipped mechanism that puts two different buildings' NPCs in the same physical
  place at overlapping real times — not a new system, a real coincidence this round starts
  noticing.
- **`triggerNpcInteraction`'s own shape** (speech bubbles + `dialogueFor` + `bumpRelationship`,
  gated on neglect) — mirrored for a cross-building pair, not reinvented.

## Resolved decisions

**1. The encounter trigger: two different NPCs both lingering at the same outing destination at
the same real moment.** Detected at the exact moment an outing's outbound walk completes (already
a real event, `walkPath`'s own `onComplete`) — check whether another NPC is ALREADY lingering at
that same destination. A real, checkable coincidence from data that already exists
(`outingActive`), not an invented dice roll. At most one encounter is triggered per arrival (if a
third NPC arrives while two are already there, it pairs with whichever is found first, not all
three) — a real simplification, not a hidden bug.

**2. Cross-building encounters use job/personal dialogue, never the authored "friend line."**
Read every "friend line" already authored in `npcDialogue.ts` — every one of them was written
assuming the OTHER attendant is the same-building coworker ("X covers the far door when I can't
be two places at once"). Reusing that verbatim for, say, a Bank teller meeting a Library clerk
at the Market would put nonsensical, misdescriptive dialogue in their mouths. Rather than
rewrite 20 hand-authored lines to be building-agnostic (a real content-authoring project, not
this round's job) or invent new ones, cross-building encounters cap the dialogue pool at
"acquaintances" — job + personal lines only, exactly what's already safe to say to anyone. The
REAL relationship count/tier still grows normally underneath and persists honestly (a future
feature can surface "friends across town" once building-agnostic dialogue exists for it).

**3. Relationship growth still pauses if EITHER home building is neglected.** Same "never a dark
pattern, a paused number" rule `triggerNpcInteraction` already applies for same-building
pairs — extended to check both NPCs' own home buildings for a cross-building pair, since neither
building's neglect should be ignored just because the meeting happened somewhere else.

## Data model / wiring

`ExteriorScene.ts` gains one new field, `outingArrivedAt: Map<string, PlaceId>` (npcId →
destination place, present only while genuinely lingering there — added right when an outbound
outing walk completes, removed when the return leg begins or the outing ends any other way), and
two new private methods: `tryCrossBuildingEncounter` (the lookup above) and
`triggerCrossBuildingInteraction` (the encounter itself, mirroring `triggerNpcInteraction`).
`npcDialogue.ts` gains no new export — cross-building calls simply pass a capped tier to the
existing `dialogueFor`, per decision #2.

## Deferred, explicitly

Rewriting every hand-authored friend line to be building-agnostic so cross-building "friends"
dialogue can exist for real (a real content project); a Town-Meeting-based encounter (every NPC
gathers there too, but pairing all 20 meaningfully needs its own design, not squeezed in here);
any UI surfacing WHICH cross-building friendships exist (task #73's HUD territory, if ever).
