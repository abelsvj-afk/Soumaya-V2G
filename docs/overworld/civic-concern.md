# Townwide civic-concern signal — the D3-compliant crime/economy reframe (Stage 2.25, task #64)

> Per Rule #1. Resolves soumaya-governance.md decision #7: `decisions.md` D3 is explicit and
> permanent ("no battle mechanic, ever") — a literal crime/police system is out, full stop. This
> doc specs the real, compliant version of what the request was actually reaching for: a townwide
> consequence when the economy is widely struggling, not per-building.

## What already exists that this must reuse, not reinvent

- **`buildingNeglect.ts`** — real per-building neglect, already computed from real work events.
  `MayorsHallOverlay` (task #63) already shows the honest aggregate ("N of M buildings could use
  a visit") at the town level.
- **`townMeeting.ts` + `announceTownMeeting()`** — the exact real, non-violent governance
  mechanism this town already has: a Bulletin Board post (a real quest, `ingestText({kind:
  "action"})`) plus every NPC walking to a real gathering at Town Hall. Currently triggered by
  exactly one thing (a new Synthesis Digest insight) — this adds a SECOND, independent trigger,
  not a new mechanism.

## Resolved decisions

**1. "Widespread" = a real majority, not one bad building.** More than half of the town's real
door-buildings (excluding Mayor's Hall, which has no work event to be neglected by yet) neglected
at once — never a single struggling building, which `buildingNeglect.ts`/Park/Mayor's Office
already surface individually. A real, checkable number, not an invented "crime rate."

**2. Edge-triggered, not re-announced while it stays true.** A concern announces once on the
transition from NOT-widespread to widespread, and only re-arms once neglect has actually dropped
back below the threshold — matches `townMeeting.ts`'s own "never re-announce the same insight
twice" philosophy, adapted to a level-crossing signal instead of an insight id.

**3. The same real consequence, never a new one.** A civic-concern trigger calls the exact same
`announceTownMeeting()` every digest-triggered meeting already uses — the same Bulletin Board
post shape, the same NPC gathering. Two different reasons to hold a meeting, one real mechanism.

**4. The message names real buildings, never invents a crime narrative.** "Town meeting: N of M
buildings haven't had real work in a while — [actual labels]." No invented tone about decline,
danger, or wrongdoing — just the same honest "could use a visit" language `MayorsHallOverlay`/
`ParkOverlay` already use.

## Data model

`data/civicConcern.ts` (new, pure, localStorage-backed, same shape as `townMeeting.ts`):

```ts
export interface CivicConcernCheck { shouldMeet: boolean; neglectedLabels: string[] }
export function checkCivicConcern(spaceId, neglectedCount, totalCount, neglectedLabels): CivicConcernCheck;
export function markConcernAnnounced(spaceId): void;   // records "currently active" (edge-triggered)
export function concernAnnouncementText(neglectedLabels: string[], total: number): string;
```

`OverworldRoot.tsx`'s existing `checkTownMeetingEffect` gains a second, independent check
alongside the digest one, computed from the real door places' own neglect — not a new fetch,
since `buildingNeglect`/`allPlaces` are already synchronous local reads.

## Deferred, explicitly

Any scaling of the threshold with NPC count (ties to soumaya-governance.md's deferred "political
divisions"); any distinct visual/sound cue beyond the existing 📢 meeting marker.
