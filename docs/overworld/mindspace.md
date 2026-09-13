# MindSpace's ambient floating-thought overlay (Stage 2.38, task #70)

> Per Rule #1. Direct user request, reversing an earlier deprioritization: *"I want you to bring
> back the mind space, mission control."* Found and tracked by the 2026-09-11 parity audit
> (`docs/overworld/roadmap.md`'s Stage 2 gap-closing entry): *"MindSpace... an always-present
> overlay floating your live working-memory thoughts as glowing 'motes', reading the exact
> `getThoughts()` API `SanctuaryOverlay` already uses, just never as an ambient layer; the user's
> own explicit ask, plus a real enhancement idea (NPCs 'aware' of the floating motes, commenting
> on them)."*

## What already exists that this must reuse, not reinvent

- **The data is already fully real and fetched today** — `getThoughts()` (`api/mind.ts`) returns
  the server's live working-memory list (`Thought { id, text, source, strength (0..1, already
  decayed server-side), reinforceCount, createdAt }`). `SanctuaryOverlay.tsx` already lists,
  reinforces, promotes, and dismisses these inside the Sanctuary building. Nothing server-side
  needs to change.
- **The gap is purely presentational**: nowhere in the Overworld are thoughts visible OUTSIDE the
  Sanctuary overlay. The whole point of "mind space" per the user's own framing is that it's
  *ambient* — visible while walking around, not only when you've walked into one specific
  building.

## Resolved decisions

**1. Motes are read-only ambient decoration, not a second management surface.** Reinforcing,
promoting, and dismissing a thought stays exclusively in `SanctuaryOverlay.tsx` — duplicating
that interaction model in the world would be a second, competing UI for the same data (exactly
the kind of drift `OPTIMIZATION_ROADMAP.md` warns against). The ambient overlay only visualizes;
walking into the Sanctuary is still how you act on a thought.

**2. Motes float around the PLAYER, not fixed world tiles.** A thought has no location — unlike a
memory-turned-node (a creature, placed once on the deterministic seeded grid), a working-memory
thought is explicitly ephemeral and un-sorted. Anchoring motes to the player (a small orbiting
ring, like a cloud of fireflies following you) is the honest rendering of "your live working
memory," and avoids inventing a fake position for data that was never spatial.

**3. Capped and prioritized by strength.** Only the top 6 thoughts by `strength` render as motes
— unbounded clutter around the player would compete with everything else on screen (creatures,
NPCs, dialogue). 6 is enough to read as "your mind is active" without becoming visual noise.

**4. Brightness AND size both carry the signal, never alpha alone.** A mote's `strength` sets its
alpha (fainter = closer to decaying away, same convention `addPostMarker` already established for
"this is present but secondary"), and `reinforceCount` sets a small font-size bump — so a
long-reinforced thought reads as literally bigger, not just less transparent. Two independent,
non-color cues for two independent real numbers.

**5. A no-op (static, not orbiting) under `prefersReducedMotion()`** — motes still render (so the
ambient information isn't lost), they just don't drift, matching every other decorative loop in
this scene.

**6. NPC awareness/commentary is deferred, not built this round.** The parity audit's own wording
already separates "the user's own explicit ask" (the ambient overlay, decision above) from "a
real enhancement idea" (NPC awareness) — the ambient overlay is the actual ask; NPC commentary on
it is a nice-to-have that needs real integration with `npcDialogue.ts`'s existing pool-based
system (a new dialogue trigger keyed on "does the player currently have an active thought,"
picking from a new small hand-authored line pool). Worth its own small follow-up once the core
overlay is confirmed working, not bundled into the same round as a first ambient-rendering pass.

## Data model / logic

- `adapter/moteLayout.ts` (new, pure, unit-testable without Phaser): `moteOffset(thoughtId: number,
  timeMs: number): { dx: number; dy: number }` — a deterministic circular drift around the player,
  radius and phase derived from `hash32(thoughtId)` (same no-`Math.random` convention as
  `grassFrameFor`/`idleBobDelayMs`), angle advancing slowly with `timeMs`. Under reduced motion,
  callers pass a frozen `timeMs` (always 0) so the offset never advances.
- `WorldSnapshot` gains a `thoughts: Thought[]` field, fetched via `getThoughts()` in
  `loadWorldSnapshot()` alongside the existing `Promise.all` fetches — one more parallel call,
  same pattern as `dueReviews`.
- `ExteriorScene` gains `setThoughts(thoughts: Thought[])` (mirrors `setCreatures`) — creates/
  destroys mote sprites (a small `Phaser.GameObjects.Text` "💭" each) for the top 6 by strength,
  and `update()` repositions each one every frame from `moteOffset` centered on the player's
  current world position.
- `OverworldRoot.tsx`'s `refresh()` calls `sceneRef.current?.setThoughts(next.thoughts)` alongside
  its existing `setCreatures`/`refreshZoneMarkers`/etc. calls.

## Deferred, explicitly

NPC awareness/commentary (decision #6); any interaction with motes themselves (decision #1);
promoting a thought's mote to a distinct visual once it's about to auto-promote to a real node
(no such signal exists server-side to hook).
