# Soumaya · Second Brain — Asset Credits

## Overworld pixel art

**`overworld/tiles.png`** — a hand-curated 25-frame atlas (16x16 tiles) assembled from two
Kenney (kenney.nl) asset packs, both released under **CC0 1.0 (public domain)** — no attribution
legally required, credited here anyway as good practice:
- "Tiny Town" — ground (grass/path), building walls, doors, signpost.
- "Tiny Dungeon" — the player character and the per-NodeType creature sprites.

Sourced via the community mirror https://github.com/shorepine/kenney (same CC0 assets,
reorganized for programmatic access) — **not** from any of the Pokémon reference repos named in
docs/overworld/pokemon-reference.md, whose tile/sprite graphics are Nintendo's copyrighted
assets and were consulted for architecture only, never for art.

## Overworld music

**`ambient-loop.mp3`** — reused, at the user's explicit direction, as the Overworld's background
music (`lib/music.ts` plays it looped). This file predates the Overworld and has **no
license/attribution documentation anywhere in this repo or its history** — its original source
is unknown. An earlier pass generated a procedurally-synthesized replacement specifically to
avoid that gap, but the user asked for a genuine pre-made track instead (a from-scratch synth
loop "didn't sound like game music" — fair) and, since this session's sandboxed network egress
blocks every reachable free-asset site (kenney.nl, opengameart.org, itch.io, freesound.org) it
could otherwise source one from, pointed at this pre-existing file as the fallback. **Verify/
retain this file's actual source and license before relying on this for public/commercial
distribution** — same caution as `ship-engine-start.mp3` below. `interstellar.mp3` and
`slow-tide.mp3` are still unreferenced/undocumented and unused.

## 3D models

**The Singularity (black hole figurine)** — `blackhole.glb`
This work is based on "Black Hole"
(https://sketchfab.com/3d-models/black-hole-e410da98b1e5445eae2acafaaa53587d)
by NestaEric (https://sketchfab.com/Nestaeric) licensed under CC-BY-4.0
(http://creativecommons.org/licenses/by/4.0/).
Converted from glTF (specular-glossiness) to metallic-roughness + Draco for web use.

## Audio

**Ship engine start** — `ship-engine-start.mp3`
"Propulsion jet engine" (id 67151) from the Freesound community (https://freesound.org).
Please verify/retain the specific sound's Creative Commons license and author attribution from its
Freesound page before public distribution.

**Ship engine loop** — `ship-engine-loop.wav`
Sustained engine loop supplied by the project owner; retain its original source license.

