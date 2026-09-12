# Deepening the player-action feedback loop (Stage 2.29, task #69)

> Per Rule #1. Task #69's own description: "deepen player-action feedback loop into town growth/
> decline, including content-ingestion crediting building hours more broadly." Found two real,
> concrete gaps by reading the actual wiring (`docs/overworld/npc-economy.md`'s own "which real
> API call feeds which building" table against every real `recordBuildingWork` call site in the
> codebase) rather than assuming — both closed this round, nothing else invented.

## Gap #1: a fresh memory capture credits nothing

`npc-economy.md`'s decision #3 table assigns a real work event to every building EXCEPT the one
action that actually grows the whole town: capturing a brand-new memory (the FR8 tall-grass
flow, `OverworldRoot.tsx`'s `handleCaptureSubmit` → `ingestText(text, { kind: "memory" })`). This
is the single most central real action in the app, and it currently earns zero building any
hours at all — confirmed by reading every real `recordBuildingWork` call site; this one was
missing.

**Resolved: credits the Library.** Not an arbitrary pick — `LibraryOverlay.tsx`'s own real data
source is `graph.nodes` ("shelves"), per Stage 2's original dock-parity table. A freshly captured
memory becomes exactly one more real node in that same `graph.nodes` collection — a new shelf
entry, the same data Library already reads, not an invented association. `handleCaptureSubmit`
now calls `recordBuildingWork(spaceId, "library")` right after a successful ingest, same
one-line pattern every other overlay's own real mutation already uses.

## Gap #2: the Town Meeting / civic-concern Bulletin Board posts credit nothing

`npc-economy.md`'s own table names Bulletin Board's real work event as "a quest posted... —
`ingestText`" — and `BulletinBoardOverlay.tsx`'s own direct posts already credit it correctly.
But `OverworldRoot.tsx`'s TWO other real Bulletin Board posts — the digest-triggered Town Meeting
announcement and the civic-concern announcement (both literally
`ingestText(..., { kind: "action" })`, the exact same real mutation) — never called
`recordBuildingWork`. Same real action, same building, inconsistently credited only because it
happened to be posted from a different call site. Both now credit `"bulletinBoard"` right after
their real `ingestText` call succeeds, closing the inconsistency rather than adding anything new.

## Why "more broadly," not a new mechanic

Both fixes are exactly the pattern already established everywhere else in this app (a real
mutation succeeds → `recordBuildingWork(spaceId, placeId)`) — no new stat, no new UI, no new
concept. "Deepening the feedback loop" here means closing two real gaps in the SAME loop, not
inventing a second one.

## Deferred, explicitly

Whether a fresh capture should ALSO credit a second building (e.g. Sanctuary, for the associative
linking a capture triggers) is a genuinely separate design call with no single obviously-correct
answer from existing data, and is left alone rather than guessed at. Any player-facing "town
growth" visualization beyond the honest counts Mayor's Hall/Park already show is task #59/#73
territory (cross-building depth, a persistent HUD), not this round's job.
