# Real Park decor from the CC0 asset pack already in use (Stage 2.34, task #74)

> Per Rule #1. Task #74 asked to "source real free/CC0 assets" — the actual asset-sourcing part
> of that task was already done in an earlier round (the whole Overworld tileset is Kenney's
> real CC0 "Tiny Town"/"Tiny Dungeon" packs). What was genuinely still missing, confirmed by
> reading the real credits/atlas before doing anything: only a small hand-picked SUBSET of Tiny
> Town's own tiles were ever pulled into `tiles.png` (ground + retired wall/door/roof tiles) —
> real tree/bench/fence art was never extracted from the same already-approved, already-CC0
> source pack, leaving Park's own real complaint ("a bunch of dirt patches... not a park")
> genuinely unfixable until this round.

## What was verified before writing any code

- The exact same CC0 mirror this atlas already cites (`github.com/shorepine/kenney`) is
  reachable from this sandbox via a shallow, sparse `git clone` (confirmed directly — a real,
  new capability discovery this session; kenney.nl/itch.io direct downloads remain blocked, but
  this mirror is not). `2d/Tiny Town/Tiles/` holds 132 individual real 16x16 PNGs, not a single
  spritesheet — easy to hand-pick from.
- A labeled contact sheet of all 132 real tiles was generated and visually reviewed (not
  guessed) to pick genuinely usable tree/bench/fence/decor art — see the sheet's own tile
  indices 4, 5, 81, 45, 29 (two trees, a bench, a fence post, a mushroom).
- `tiles.png`'s own existing frame indices 5-12 and 33-34 were already confirmed retired and
  unreferenced (a prior round's own comment: "the modular wall/door/roof tile kit... nothing
  references them anymore") — real free space to repaint, not a resize that could break every
  existing frame index every other file already relies on.
- Pixel-verified after patching (`ImageChops.difference` against the real source tiles, not
  eyeballed) that each of the 5 repainted slots is byte-identical to its real source tile.

## Resolved decisions

**1. Repaint 5 of the already-confirmed-unused atlas slots, don't resize the atlas.** Slots 5-9
(previously blank/retired wall-kit pixels) become `treeA`/`treeB`/`bench`/`fence`/`mushroom` —
zero risk to any of the 27 other real frame indices every other file in this codebase already
references by number.

**2. Ship them where the real complaint was: Park's own footprint.** Fixed positions within
Park's real 6x3 footprint (fence flanking the door's own row at the two far corners; two trees
and a bench/mushroom along the bottom row) — never colliding with the real door tile
(`x0+3, y0`, from `regionLayout.ts`'s own `layoutRow` formula, checked directly rather than
guessed). Purely cosmetic depth-2 tiles over the existing path, same convention as every other
decorative ground layer in this scene.

**3. Scope: Park only, this round.** Scattering the same new tiles elsewhere (a tree-lined
plaza border, decorative fences around other buildings) is real, available follow-on work with
this same art — not attempted here, so this round stays a focused, verifiable fix for the one
specific, repeated complaint rather than a broader redecoration pass.

## Deferred, explicitly

The remaining ~6 unused atlas slots (10-12, 33-34) for future decor; the itch.io "2D School
Classroom"/"2D City" CC0 packs identified in earlier research (still blocked — itch.io itself is
unreachable from this sandbox, unlike the GitHub mirror); any housing/business-specific art
(`housing.md`/`business.md` both already documented as deliberately reusing existing building
art this round, unrelated to this fix).
