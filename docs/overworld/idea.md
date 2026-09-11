# Overworld — Idea (Phase 1)

> Design package for **Soumaya Overworld**: a full replacement of the 3D galaxy presentation
> layer with a 2D, GBA/SNES-era Pokémon-style top-down world. Per
> [`docs/AI_ENGINEERING_WORKFLOW.md`](../AI_ENGINEERING_WORKFLOW.md) Rule #1: no code until this
> package is complete and approved. Read order: idea → [vision](./vision.md) →
> [requirements](./requirements.md) → [user-stories](./user-stories.md) →
> [architecture](./architecture.md) → [decisions](./decisions.md) → [ux-design](./ux-design.md) →
> [roadmap](./roadmap.md). Background: [pokemon-reference.md](./pokemon-reference.md).

## Problem statement

The current UI presents Soumaya's knowledge graph as a 3D galaxy with a dock of ~11 floating
panels (Details, Browse, Mind, Agenda, Insights, Soumaya, Inbox, Progress, Journeys, Money,
Hangar). It is visually striking but tab-driven: navigation is a menu bar over a scene, not a
place you inhabit. The product's own north star (`SECOND_BRAIN_BRIEFING.md`,
`VISION_2_JOURNEYS.md`) is explicitly spatial and narrative — "what Journey does this belong to,"
a Living Galaxy that "reflects life in motion" — but the galaxy's actual interaction model is
still point-click-panel, closer to a dashboard than a place.

Separately, the single highest-leverage mechanic identified in `NEURO_ALIGNMENT.md` — **memory is
made by retrieval, not storage** — currently lives as a subtle glow-dimming cue in a 3D scene the
user isn't necessarily looking at from the right angle to notice. It deserves a presentation where
"this needs a visit" is unmistakable and inviting, not a rendering detail.

## Target user

The existing Soumaya user: someone who dumps raw thoughts into the app and wants them organized,
recalled, and occasionally surfaced back to them — unchanged by this project. This is a
presentation-layer change, not a new audience.

## Why a Pokémon-style overworld (core value proposition)

- **Retrieval becomes literally spatial.** A creature (memory) you haven't visited fades where
  you can see it every time you walk past, in a world you're already moving through for other
  reasons (visiting the Bank, checking the Bulletin Board) — passive re-exposure the 3D galaxy's
  camera-angle-dependent glow can't guarantee.
- **Discovery replaces menu-browsing.** Walking into the Library or the Bank *is* opening that
  tab — no dock, no modal stacked on a scene; every feature has a place, and place is easier to
  remember and revisit habitually than a tab label in a row of eleven.
- **Regions make Journeys instantly legible.** A distinct biome/palette/theme per Journey is a
  stronger "this is a different chapter of my life" signal than a filter dropdown.
- **Familiar, warm interaction language.** GBA-era Pokémon's walk-up-and-interact idiom is
  low-cognitive-load and widely legible, which suits a personal, low-pressure reflection tool
  better than data-dashboard chrome.

## What makes it valuable (vs. just being different)

The value is not "looks like a game." It's that the spatial metaphor makes the two things this
product cares about most — **where does this belong (Journeys)** and **what needs revisiting
(retrieval)** — into things you *see and walk toward* instead of things you have to *remember to
check*. If the overworld doesn't make the dimming/revisit loop more noticeable and inviting than
the galaxy did, the project has failed its own reason for existing, regardless of visual polish.

## MVP — the smallest thing that proves the idea

Per the brief's own suggested build order, the MVP is **one region + one loop**, not all eleven
areas at once:

1. **One region**: the Money/Bank Journey area — walkable exterior with a Bank building whose
   interior menu reproduces today's Money tab functionality (income/expense entries, bills, net
   worth, "what can I afford").
2. **One creature-encounter loop**: capture (walking into a free-thought zone → capture menu →
   extraction reveal) **and** the dimming/revisit ("greet") loop for existing memories placed as
   creatures in that region, wired to real API data for a real Soumaya space.
3. **The overworld shell**: grid movement, camera-follow, mobile touch D-pad/A-B controls, and one
   building-interior menu overlay pattern reusable by every future building.

Everything else in the translation table (Library, Sanctuary, Bulletin Board, Observatory, Post
Office, Gym, region map, Hangar, partner-NPC Soumaya, chat-with-fly-to) is explicitly **out of the
MVP slice** — staged in [roadmap.md](./roadmap.md) after the slice is proven against real data,
per the brief's suggested build order ("prove the retrieval-cue mechanic feels right before
scaling out").

## Non-goals

- Not a new game with its own progression/win-state — there is no combat, no XP grind divorced
  from real memory activity, no monetized loot boxes, no forced daily-streak guilt (explicit
  brief non-negotiables).
- Not a new domain model. `packages/shared` and `packages/server` are unchanged by this project
  except for narrowly-scoped, explicit, additive API needs identified while building the slice
  (see [architecture.md](./architecture.md) open questions) — the brain, not the skin.
- Not a ROM hack or an attempt at GBA technical fidelity (no bytecode scripting VM, no tile-size
  hardware constraints) — see [pokemon-reference.md](./pokemon-reference.md) for what's borrowed
  vs. reinvented.
- Not maintaining two renderers long-term. The user has confirmed **full replacement** of the 3D
  galaxy is the goal (see [decisions.md](./decisions.md)) — but the galaxy stays in place and
  buildable until the overworld slice is proven, per the verify-before-you-build house rule; the
  actual removal of galaxy code is a later, separate step once parity is real, not part of this
  slice.

## Success criteria

- A real Soumaya space's Money data and a sample of real nodes render correctly as a walkable
  region + Bank interior, with zero mock data standing in for API calls.
- The dimming/revisit loop is provably wired to a real recency/decay signal (either an existing
  one in `celestial.ts`/the node record, or an explicitly-requested additive API field — see
  architecture open questions) and is demonstrably *more* noticeable than the galaxy's glow, by
  design (visible sprite/tile-level dimming + an explicit "come say hi" prompt, not just a shader
  parameter).
- The shell works with **zero network/LLM calls** (offline-first non-negotiable): movement,
  rendering, and the capture menu UI all function against the heuristic/offline path.
- `prefers-reduced-motion` is honored from the first commit (no forced camera pans, no screen
  shake), and rarity/urgency are never color-only (shape/icon/label always pairs with color).
- Mobile touch controls (D-pad + A/B) work at phone width, matching the product's mobile-first
  reality.
