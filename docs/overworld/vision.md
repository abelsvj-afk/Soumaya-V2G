# Overworld — Vision (Phase 2)

## Mission

Replace Soumaya's 3D galaxy with a 2D, GBA/SNES-era Pokémon-style overworld that presents the
same knowledge graph as a world you walk through, not a scene you orbit with a dock of tabs
bolted on top. The brain doesn't change; how it's inhabited does.

## Users

Unchanged: existing Soumaya users, on mobile first. This project changes nothing about who the
product serves — it changes how the same person experiences their own data day to day.

## Core features (in scope for the full vision, per the build brief's translation table)

- A tile-based overworld, one region per Journey, with a distinct biome/palette/theme per region.
- Memories as creatures (or placed items/NPCs) with rarity mapped from `CelestialClass`.
- The dimming/greet retrieval loop as the central, always-on mechanic (D8 in
  [decisions.md](./decisions.md)) — not a bolt-on, present from the first commit.
- Associative auto-linking rendered as walkable glowing paths between related creatures.
- Every current dock tab reimagined as a building/place: Library (Browse), Sanctuary (Mind),
  Bulletin Board (Agenda), Observatory (Insights), Post Office (Inbox), Gym/Trainer Card
  (Progress), region map (Journeys), Bank (Money), Hangar (unchanged, ship customization), and
  Soumaya herself as an always-nearby partner NPC who opens the chat dialogue box and can
  "fly you" to a cited memory.
- Mobile touch D-pad + A/B controls from day one.

## Future features (explicitly excluded from this design package's MVP)

- Multiplayer/shared worlds — never; private-by-design is non-negotiable (each save is one
  `space_id`'s world, forever).
- Any literal battle/combat system — never, per D3.
- Procedurally-generated dungeon-style interiors — buildings are small, fixed, hand-authored
  layouts; only exteriors respond to live graph data.
- Full weather/day-night tied to brain-wide entropy — real, staged for after the core loop is
  proven (see [roadmap.md](./roadmap.md)); not required for the vertical slice.

## How this serves the product's own north star

`VISION_2_JOURNEYS.md` asks "what Journey does this help?" instead of "where do I save this?" —
in the overworld that question has a literal spatial answer: you're standing in that Journey's
region. `SECOND_BRAIN_BRIEFING.md`/`NEURO_ALIGNMENT.md`'s core thesis — memory is made by
retrieval — gets its most literal possible expression: a memory that fades is a creature standing
right where you can see it get dimmer, in a place you already pass through.

## Success metrics

- The vertical slice (Bank region + capture/greet loop) is playable against a real space's data
  with zero mocked responses, and the greet action visibly and immediately restores a creature's
  vividness (measured, not eyeballed — see [architecture.md](./architecture.md) test plan).
- Full parity checklist (every current dock tab has a working in-world equivalent) before the
  galaxy code is deleted, per the staged replacement in [decisions.md](./decisions.md) D1.
- No regression in the "offline-first" and "space-scoped privacy" guarantees — both provably true
  by construction, since the overworld only ever calls the existing space-scoped API client.
