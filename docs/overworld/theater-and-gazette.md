# Backlog #81 — Theater + Town Gazette

Implementation-level spec for task #114, resolving `wave4-full-vision.md` §C.3's decision into
concrete data/wiring choices before writing code (Rule #1).

## Theater — a 12th door-building

Added to `regionLayout.ts`'s generated layout (`NORTH_ROW_SPECS`, after Observatory) — the row-
generation algorithm (`layoutRow`) already derives footprint/door/`REGION_WIDTH` from the spec
list, so this is a one-entry addition, not new coordinate math. Gets the same 2 real hand-authored
attendants every other building has (`npcDialogue.ts`): **Marlowe** (usher) and **Odalys**
(programmer) — job lines about seating/programming, personal lines gated on real achievement ids
(`light_bringer` — 15 joyful memories, `enduring_light` — a memory kept 180+ days — both
thematically about a story's own staying power, matching a theater), a friend line once their
relationship tier reaches "friends," same shape as every existing profile. Building sprite reuses
`ARCHED_HALL` (already reused 3x for library/sanctuary/market — a fourth reuse is consistent with
the established "loose thematic fit, no forced new art" convention); work icon 🎭 via
`workIconForPlace`.

## "Showings" — real, not invented

Decision: the Theater lists a small, bounded set of "showings" — the player's own most
significant memories (by `mass`, the same 0..1 significance score `shared/celestial.ts` already
computes and `WorldSnapshot.creatures` already carries per node), capped at 4. For each, the
overlay lazily fetches its real evolving lore (`getLore("memory", nodeId)`, already live since
task #71) on open — the same per-node fetch `CreatureSummaryOverlay.tsx` already does for one
node, just bounded to 4 instead of 1. The latest lore chapter (or a "no story yet" placeholder if
none exists) is the "now showing" blurb; an "✦ Evolve" button reuses `evolveLore` exactly as
`CreatureSummaryOverlay.tsx` already does. Nothing here is fictional programming — every listing
is a real memory the player captured, and every line of "showing" text is either their own
captured content or Soumaya's own real lore-evolution output.

## Town Gazette — folded into the Bulletin Board, not a new building

`BulletinBoardOverlay.tsx` gains a small "📰 Town Gazette" section above its existing quest list:
the single highest-scored real `Insight` from `getDigest()` (the exact same synthesis endpoint
`ObservatoryOverlay.tsx` already calls), shown as a headline. The original decision text
("summarizing new achievements/buildings/population changes") described an aspirational headline
style this app has no dedicated event log to honestly back — rather than fabricate one, the
Gazette headline is the real thing `getDigest()` already surfaces (a genuine latent connection
between two real memories), framed as "today's story." An empty digest shows a plain "No fresh
headlines yet" state — never an invented one.

## Verification

`data/theater.ts`'s showings-selection (top-N by mass, capped, deterministic tie-break) is pure
and unit-tested directly. The new NPC profiles are covered by `npcDialogue.test.ts`'s existing
generic assertions (every profile has 2 job lines, achievement ids that exist, etc. — already
written to iterate `PROFILE_LIST`, not enumerate buildings by name, confirmed by reading it before
adding here). `TheaterOverlay.tsx` and the Bulletin Board's Gazette section get component tests
matching the existing per-overlay convention. `ExteriorScene.ts`'s own Phaser rendering of the new
building is unconfirmed on-device, same as every other building this session.
