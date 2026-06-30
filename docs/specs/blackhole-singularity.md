# Spec — The Singularity (black-hole asset integration)

Status: **design / awaiting placement decision** · Branch: `claude/soumaya-second-brain-v1-m4z4hc`

## 1. What we have

A donated **Black Hole** glTF (Sketchfab, NestaEric, **CC-BY-4.0 — attribution required**):
a multi-layer glowing accretion model — `blackoutside` shells, three emissive `light`
layers (the bright disk), a `distortion` lens, a `center` void, and four `ring` meshes —
plus an unrelated far-offset `Planet` node. Materials are authored as
`KHR_materials_pbrSpecularGlossiness`.

### Asset blocker (resolved, measured)
three.js **r182** (our installed version) **dropped** the `pbrSpecularGlossiness`
extension, so loading the raw asset would render flat/broken materials and **lose the
glowing disk** — the whole point of the model. Verified by inspecting the shipped
`GLTFLoader.js` (no specGloss handler present).

### Conversion pipeline (proven end-to-end in scratchpad)
```
scene.gltf (specGloss, 31MB)
  → gltf-transform metalrough   # specGloss → metallic-roughness (r182-compatible)
  → gltf-transform resize 1024  # cap textures at 1024²
  → gltf-transform draco        # mesh compression (our gltfLoader already wires DRACOLoader)
  = blackhole.glb  →  14.3 MB
```
14.3MB is **under** our existing budget (dyson-sphere 25MB, station 22MB, nebula 18MB).
Draco is already handled by `gltf.ts::gltfLoader()`, so no new runtime dependency. The
converted file is staged at `scratchpad/bh/blackhole.glb`; on a chosen direction it gets
copied to `packages/web/public/blackhole.glb`.

## 2. Where it fits the project

The **background-figurine system** is the natural home and already solves the user's hard
constraint ("regardless, I still want to see it myself"):

- Figurines mount **far out in the deep-space back** — `(8000,3000,-9500)` /
  `(-9000,-2000,-9500)` (`Graph3D.tsx` ~644), beyond the camera's ~6200 zoom-out ceiling,
  exactly the "put it far out in the back" idea.
- `updateFigurine()` (`Graph3D.tsx` ~150-285) maps a type-key → `.glb` modelPath +
  `targetSize` + a procedural fallback, normalizes scale by bounding box, and swaps the
  fallback for the real model on load. Adding a `"blackhole"` case is a few lines.
- Each figurine already gets a **HUD camera-focus button** (`HangarPanel` "Show camera
  focus button on HUD" + the `focusFig1/2` handle toggles in `Graph3D`), so the user can
  **fly out and view it directly on demand** — the "see it myself" guarantee, already built.
- Cosmetics gate through `achievements.ts` (predicate → unlock id) + `HangarPanel` (the
  `isXUnlocked` checks), with a **demo bypass** that unlocks everything for preview.

So integration is low-risk and offline-safe regardless of the acquisition model chosen.

## 3. Placement / acquisition options (the open decision)

All three keep the CC-BY credit and a guaranteed "see-it-now" path.

### A. Prestige unlock — "The Singularity" figurine  ⟵ RECOMMENDED
A new equippable figurine, gated behind a **prestige achievement** (the hardest tier —
e.g. **365 memories, "A Year of Memories,"** or 500). Mount it far in the back; equip it in
a Hangar figurine slot; fly to it via the HUD focus button.
- **Pro:** highest fit with the existing gamification system (reuses figurine + focus +
  Hangar + achievement machinery), feels *earned* — appropriate for so dramatic an object,
  becomes the ultimate trophy. Lowest risk; fully offline-safe.
- **"See it regardless":** Hangar demo-bypass + an owner "Preview" affordance + the HUD
  focus button guarantee the user can always view it even before the unlock fires.

### B. Always-on galactic landmark
Mount it permanently in the back as scenery (like the galaxies/nebulae/constellations), no
unlock — always present from first load.
- **Pro:** simplest; immediately visible; atmospheric.
- **Con:** not gamified; loses the "reward" payoff the user floated.

### C. The galactic core (poetic, larger change)
Place the black hole at/near the galaxy's gravitational center — "the heart everything
orbits / where supergiant memories collapse."
- **Pro:** most dramatic, ties into the celestial-mass metaphor.
- **Con:** the **Sun already occupies center** and `orbits.ts` centers systems on it —
  this touches core scene/physics (Red-Zone-adjacent), a bigger, riskier change. Best as a
  later phase, not the first integration.

## 4. Implementation outline (independent of A/B/C)

1. **Asset:** copy `blackhole.glb` → `packages/web/public/`. Add the CC-BY credit to a
   shipped attributions file (e.g. `packages/web/public/CREDITS.md` / existing credits
   surface) and `GEMINI_CHANGES.md`.
2. **Render:** add a `"blackhole"` branch to `updateFigurine()` — `modelPath =
   "/blackhole.glb"`, a fitting `targetSize` (~1600–2000 so it reads big in the back), and a
   procedural fallback (dark sphere + emissive accretion torus, reusing the `quantum_core`
   pattern) for the pre-load / load-fail path. Give it a slow self-rotation in the existing
   background-figurine rotate loop (~line 1038).
3. **Acquisition (only if A):** add a `singularity` achievement to `achievements.ts`
   (prestige predicate) + an `isSingularityUnlocked` gate and a `blackhole` `<option>` in
   both Hangar figurine `<select>`s, mirroring the existing locked-option pattern.
4. **Verify:** gate green (`typecheck · test · build -w @brain/web`); confirm the model
   loads (not the fallback) and the HUD focus button frames it; offline heuristic path
   unaffected. Then `agy`/user does live pixel QA (we can't render from here).

## 5. Attribution (mandatory, CC-BY-4.0)
Ship verbatim wherever the model is used/shared:
> This work is based on "Black Hole"
> (https://sketchfab.com/3d-models/black-hole-e410da98b1e5445eae2acafaaa53587d) by
> NestaEric (https://sketchfab.com/Nestaeric) licensed under CC-BY-4.0
> (http://creativecommons.org/licenses/by/4.0/)
