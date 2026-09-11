# Soumaya · Second Brain — Asset Credits

## Overworld pixel art

**`overworld/tiles.png`** — a hand-curated 25-frame atlas (16x16 tiles) assembled from two
Kenney (kenney.nl) asset packs, both released under **CC0 1.0 (public domain)** — no attribution
legally required, credited here anyway as good practice:
- "Tiny Town" — ground (grass/path), building walls, doors, signpost.
- "Tiny Dungeon" — the player character, the per-NodeType creature sprites, and (added in a
  later pass) one attendant NPC sprite per building — no new sourcing needed, the pack already
  had enough distinct humanoid characters to give every building its own look.

Sourced via the community mirror https://github.com/shorepine/kenney (same CC0 assets,
reorganized for programmatic access) — **not** from any of the Pokémon reference repos named in
docs/overworld/pokemon-reference.md, whose tile/sprite graphics are Nintendo's copyrighted
assets and were consulted for architecture only, never for art.

## Overworld music

**`ambient-loop.mp3`, `interstellar.mp3`, `slow-tide.mp3`** — the same 3 tracks the old 3D
galaxy let a pilot switch between, reused as the Overworld's background music at the user's
explicit direction (`lib/music.ts`'s `MUSIC_TRACKS`, switchable via the ⏭️ button on the
canvas). These files predate the Overworld and have **no license/attribution documentation
anywhere in this repo or its history** — their original source is unknown. An earlier pass
generated a procedurally-synthesized replacement specifically to avoid that gap, but the user
asked for genuine pre-made tracks instead (a from-scratch synth loop "didn't sound like game
music" — fair) and, since this session's sandboxed network egress blocks every reachable
free-asset site (kenney.nl, opengameart.org, itch.io, freesound.org) it could otherwise source
from, pointed at these pre-existing files as the fallback. **Verify/retain their actual source
and license before relying on this for public/commercial distribution** — same caution as
`ship-engine-start.mp3` below.

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

