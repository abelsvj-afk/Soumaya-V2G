# Population growth — task #118 (Wave 3's deferred item)

## Investigated first — the standing plan's own premise doesn't hold

`wave4-full-vision.md` §D already made a decision on this, but it rested on a claim I checked
directly before writing any code: "`attendantPosts()` already generates more posts than are
currently filled at several buildings — confirmed as the real, already-existing slack to use."

Measured, not assumed: a throwaway script called the real `attendantPosts()` and
`allSocietyNpcIds()`. Every one of the 12 door-buildings generates exactly 2 attendant posts
(`ATTENDANTS_PER_BUILDING = 2`, unconditional on footprint width — confirmed by reading
`attendantPostsFor`), for 24 posts total, and `npcDialogue.ts`'s `PROFILE_LIST` already has
exactly 24 hand-authored profiles, one per post, with zero gaps. There is no unfilled attendant
slack anywhere today. The premise was stale — written before Theater/Mayor's Hall's own additions
(or simply a planning error) — so §D's mechanism ("assign new NPCs as second attendants to
under-filled buildings") has nothing to attach to. This doc replaces §D's mechanism with one that
matches the real code, while keeping §D's other two decisions (hand-author, not LLM-generate; gate
on read-time housing capacity, never a timer) exactly as resolved.

## The corrected decision

Population growth doesn't need to touch the attendant/dialogue/relationship/schedule system at
all — that machinery is real, tested, and deliberately kept separate from housing already
(confirmed: `ExteriorScene.ts` has zero references to `residentsOfHome`/`homeForNpc`/
`assignResidents` — a home-resident today is purely a data-layer/stat concept surfaced in Mayor's
Hall, never a second rendered sprite or dialogue partner). So a new NPC can grow the town's real
population by becoming a **Resident** — a new, smaller, hand-authored roster with just a name (no
job, no attendant post, no in-world sprite, no dialogue) — without risking any of the existing
attendant machinery.

- **New file `data/residents.ts`**: a small hand-authored `RESIDENT_LIST` (4 names — "a small wave
  reads as real growth," per §D's own reasoning, sized modestly rather than doubling the roster in
  one round), `allResidentNpcIds()`, and `residentName(id)`.
- **`housing.ts`'s `assignResidents`/`housingSummary`** walk a combined roster —
  `[...allSocietyNpcIds(), ...allResidentNpcIds()]`, society NPCs first in their existing stable
  order — instead of `allSocietyNpcIds()` alone. This is the ENTIRE gate: since the walk already
  stops once real built capacity runs out, a Resident only gets a real home once every one of the
  24 society NPCs already has one AND capacity remains — read-time-computed on every call, never
  a timer, exactly matching §D's own "Gate" decision. Zero new gating code needed; it falls
  straight out of the existing pack-to-capacity loop once the roster is longer.
- **`MayorsHallOverlay.tsx`'s resident list** (`residentsOfHome(...).map(id => npcProfile(id).name)`)
  would crash on a Resident id, since `npcProfile()` throws for anything outside the attendant
  `PROFILES` table. Fixed with one new shared lookup, `npcDisplayName(id)` (`residents.ts`), that
  tries the real society profile first and falls back to the real resident name — the one call
  site that needed to change.
- **Nothing else changes.** `npcDialogue.ts`, `regionLayout.ts`, `ExteriorScene.ts`'s attendant/
  schedule code, and every existing test asserting the fixed 24-society-NPC roster are untouched.

## Deliberately not built

- Residents get no in-world sprite, dialogue, or relationship tracking this round — they are a
  real headcount and a real name in Mayor's Hall's resident list, honestly nothing more. Giving
  them a job/attendant post would require growing `ATTENDANTS_PER_BUILDING` or adding new
  buildings, a bigger, riskier change with no real request behind it yet.
- No LLM-generated residents (§D's own resolved reasoning: a visibly different quality tier next
  to 24 hand-authored profiles).

## Verification plan

New `residents.test.ts`: `allResidentNpcIds()` returns exactly the 4 real ids, `residentName`
resolves each and returns `null` for an unknown id, `npcDisplayName` resolves both a real society
id and a real resident id and never throws for either. Updated `housing.test.ts`: a fresh town's
`assignResidents`/`housingSummary` are unchanged while capacity is at/under 24 (no Resident has
moved in yet); once capacity is built past 24, the next Resident(s) in roster order get real
homes; `housingSummary().total` now reflects the combined roster length. Updated
`MayorsHallOverlay.test.tsx`: a home whose resident is a Resident (not a society NPC) renders that
Resident's real name instead of crashing. Full gate before commit.
