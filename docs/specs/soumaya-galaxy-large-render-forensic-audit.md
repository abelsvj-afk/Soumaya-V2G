# Soumaya Galaxy — Large-View Render Forensic Audit

> **AUDIT ONLY (original scope).** No production source was modified in the original audit
> pass. Date: 2026-09-09. Supersedes the *hypotheses* (not the measurements) of
> `soumaya-galaxy-gpu-fillrate-forensic-audit.md`,
> `soumaya-galaxy-root-cause-reconciliation-audit.md`, and
> `soumaya-galaxy-link-resolution-decoupling-audit.md`.
>
> **Update (same day, mobile-first rendering recovery program):** the two fixes this audit
> recommended (§22 #1, #2) have since been implemented, tested, and pushed — see §27 below.
> The architecture direction they feed into is `docs/specs/soumaya-galaxy-rendering-contract.md`.

---

## 27. Post-Fix Status (implementation, same day)

Both top-ranked bottlenecks from §22 have been fixed, gated, and pushed to
`claude/soumaya-second-brain-v1-m4z4hc`. **Real-device validation is still pending** — this
sandbox cannot deploy or render a frame, so the qualitative on-device test described in §24
is still the next required step. Recorded here so this document reflects current reality
rather than only the pre-fix state.

**Fix #1 — Sun transmission (commit `34e1502`).** `sun.ts`'s existing per-material traverse
(previously only zeroing `envMapIntensity`) now also zeroes `transmission` on any material
that has it, via a new exported `neutralizeSunMaterial()`. Unit-tested directly against
three.js's own classification predicate (`material.transmission > 0`) — `sun.test.ts` asserts
the post-fix value make three.js's own render-list check fail, not just that a field changed.
The sun's emissive appearance, corona sprite, and point light are untouched.

**Fix #2 — Node early-Z restoration (commit `5affdf6`).** The hover-highlight effect at
`Graph3D.tsx` no longer forces `transparent = true` on every node child unconditionally.
Body meshes (`nodeObject.ts`'s star/planet/moon/asteroid/action-core/macro-LOD sphere — none
of which set `transparent: true` themselves) are now tagged `userData.isBody = true` at
construction. A new pure helper, `highlightMaterialState(isBodyMaterial, lit)`
(`graph3dHelpers.ts`), restores a lit body to `transparent:false, opacity:1` instead of
leaving it in three.js's back-to-front transparent queue for no reason; a dimmed body still
gets real alpha blending, exactly as before. Non-body children (labels, glow/corona sprites,
rings, asteroid belts) are untouched — same transparent-by-construction behavior as always.

**Validation status:** typecheck clean, full test suite green (server 1039/1039, web
428/428 including 11 new tests across `sun.test.ts`, `graph3dHelpers.test.ts`, and
`nodeObject.test.ts`), production build clean. **Not yet confirmed on the real Android
device** — that confirmation, and the qualitative protocol for it, is unchanged from §24.

**What this does and does not resolve, per §20's own compounding-cost model:** Fix #1
removes a large, resolution-dependent, distance-independent fixed cost present in *every*
frame of *every* view (Small and Large alike). Fix #2 removes the term that scaled ×26.7
between Small and Large (§20). Per §20's own conclusion — "the most likely truth is
*compounding*" — removing both is expected to help materially, but the exact resulting
frame time on the baseline device is unmeasured until the device test runs. Treat any
number quoted before that test as a prediction, not a measurement.

## 28. Render-Path Re-Confirmation (Phase 4 of the recovery program)

Re-verified directly against installed source (not re-derived) — no discrepancy found
against §16/§18's original findings; recorded here as an explicit confirmation pass rather
than a new investigation:

- **MSAA sample count**, `three.module.js:13951`: `samples: attributes.antialias ? 4 : 0`.
  `three-render-objects.mjs:581` constructs the renderer with `antialias: true` — so
  `capabilities.samples === 4`, feeding both the main canvas's implicit MSAA and the
  transmission target's `samples: capabilities.samples` (`three.module.js:17476`, §5.3).
  **Fix #1 eliminates the transmission target's 4x MSAA entirely** (no transmissive object
  left in the scene); the main canvas's own 4x MSAA is unrelated to Fix #1 and untouched
  by either fix in this pass — it is a separate, much smaller, standard-and-expected cost.
- **Renderer pixel ratio** — reconfirmed exactly as §18 established: `Math.min(2,
  window.devicePixelRatio)` at init (`three-render-objects.mjs:585`), then overridden by
  `graphicsConfig.ts`'s tier/rung/Battery-Saver logic via `Graph3D.tsx:817` and the
  adaptive-rung call sites. **Never 2.8125.** The HUD's `dpr` field remains
  `window.devicePixelRatio` (`PerfHUD.tsx:150`) — a pre-existing, separate, and still-open
  discrepancy from the renderer's actual ratio, addressed architecturally in
  `soumaya-galaxy-rendering-contract.md` (its render-resolution budget requires the HUD to
  report `renderer.getPixelRatio()`, not `window.devicePixelRatio`) rather than patched here,
  since it's a diagnostics-accuracy issue, not a performance one.
- **Render target / canvas dimensions**: sized from the container element via
  `three-render-objects.mjs:630,651` (`r.setSize(state.width, state.height)`), i.e. the
  actual CSS layout size of the Galaxy canvas, not a hardcoded or assumed value. No
  additional off-screen render targets exist beyond the (now-eliminated) transmission
  target and the two composer targets already noted in §4 (allocated but not used, since
  a single `RenderPass` renders straight to screen).
- **Draw-call / triangle counts post-fix**: not yet re-measured on-device (blocked on
  deploy, same as everything else). Expected, from source: with Fix #1, `info` should no
  longer sum two passes (§6), so draw calls and triangles should roughly **halve** for the
  portion that was opaque-model duplication. With Fix #2, node bodies leave the transparent
  list and re-enter the opaque list, which changes render *order* (opaque bodies now draw
  before non-body transparent objects, front-to-back with early-Z, instead of being sorted
  into the same back-to-front pass as everything else) but does not by itself change the
  *count* of draw calls — the win is fragment work skipped via depth-test rejection, which
  `renderer.info` does not report at all (three.js does not expose fragments-shaded or
  early-Z-rejected counts). **This is a real instrumentation gap**, carried into the
  Rendering Contract's budget-tracking requirements rather than solved here.

No production source was touched in writing this section (Phase 4 is inspection/
documentation only, per the task's own instruction). The only file changed by this update
is this document.

---

## 1. Executive Summary

The previous audits were all looking in the wrong layer. They asked *"which of our objects is
too expensive?"* The new real-device numbers say the question is wrong, because **the JavaScript
we wrote is not the problem at all** — our per-frame scene mutation costs 2.7 ms while a single
`WebGLRenderer.render()` call costs **1009 ms**. 99.7% of the frame is inside one function call
in three.js that our code does not run and has never been instrumented.

Tracing what happens *inside* that call produced a finding that no previous audit considered,
and that no previous experiment could have detected:

> **`packages/web/public/sun.glb` declares `KHR_materials_transmission` with
> `transmissionFactor: 1`.** `GLTFLoader` maps that to `MeshPhysicalMaterial.transmission = 1.0`
> (`GLTFLoader.js:1205-1207`). In three.js r182, **any** object with `material.transmission > 0`
> puts the renderer into a completely different, far more expensive rendering mode: every frame,
> inside `renderer.render()`, it allocates/binds a **full-resolution multisampled half-float
> render target**, clears it, **re-renders the scene background into it**, **re-renders every
> opaque object in the scene into it**, **MSAA-resolves it**, and **generates its complete mipmap
> chain** — before the normal frame is drawn at all
> (`three.module.js:7997`, `:17250`, `:17458-17580`).

The sun is added to the scene **unconditionally**, in every session, in every view, at every
graphics tier (`Graph3D.tsx:1004-1007`). There is no setting, no tier, no diagnostic switch, and
no experiment run so far that turns it off. It is not gated by bloom, by `heavyScenery`, by the
adaptive rung, by Performance mode, by the link budget, or by `galaxyDiag`.

This single fact explains the shape of the entire investigation: **every experiment we ran was
inside the part of the frame that costs 2.7 ms, while the 1009 ms sat untouched in a code path
we never knew was executing.** That is why disabling pointer interaction did nothing, why
cutting 941 links to 200 did nothing, and why turning bloom off did nothing.

A second, independent finding compounds it: **`Graph3D.tsx:2338-2349` unconditionally sets
`mat.transparent = true` on every material of every child of every node**, on mount and on every
selection change, *including when nothing is selected*. That moves all ~240 procedural-noise
bodies out of the opaque queue and into the back-to-front transparent queue, which **eliminates
early-Z rejection entirely** — every occluded body still runs its full 48–96-hash-per-pixel
fragment shader.

Neither finding is a theory about what is "probably expensive". Both are mechanical
consequences of code that is provably executing, both are inside `renderer.render()` where the
time demonstrably is, and both were invisible to every instrument and every experiment used so
far.

**Top-ranked bottleneck: the always-on transmission pass triggered by `sun.glb`.**
**Recommended next experiment: one line in `sun.ts` that zeroes the sun's `transmission`.**

---

## 2. New Real-Device Evidence

| Metric | Reading 1 | Reading 2 | What it constrains |
|---|---|---|---|
| `tick` p50 / p95 / p99 | 2.7 / 5.5 / 8.7 ms | 2.7 / 5.5 / 8.7 ms | Our own JS is **not** the bottleneck |
| `render` p50 / p95 | **1009.3 / 2249.2 ms** | **1009.3 / 2249.2 ms** | One `renderer.render()` call |
| `present` p50 / p95 | 1144.4 / 2315.1 ms | 1144.4 / 2292.8 ms | True frame cadence → **1 fps** |
| `gap` | 65.9 ms | 43.6 ms | See §1 caveat below |
| dropped | 98.7% | 98.6% | — |
| draw calls | 721 | 706 | Sum across **all** passes in the call |
| triangles | 903,636 | 729,268 | Swing of 174,368 (≈ 2 × 87,184) |
| lines / points | 0 / 5,910 | 0 / 5,910 | Links are **meshes**, not `Line`s |
| geometries / textures | 327 / 256 | 314 / 248 | Runtime churn present |
| programs | 45 | 45 | **Stable** — no shader-recompile storm |
| heap | +1.81 MB/s | +0.00 MB/s | GC is not the story |
| tracked / visible | 240 nodes, 941 links | same | — |
| detailed links | 200 / budget 200, bounded ON | same | Budget **is** active |
| labels / lights | 3 / 3 | — | Label cap and light pool both working |
| dpr (reported) | 2.8125 | — | **This is `window.devicePixelRatio`, not the renderer's** (§16) |

Qualitative evidence, treated as primary (the user cannot operate the HUD during a freeze):

- Large View still freezes badly with `enablePointerInteraction={false}`.
- Actions take a very long time to respond.
- The scene advances roughly one frame at a time.
- **Node bodies appear to flicker each time a new frame finally appears.**

---

## 3. What The Numbers Actually Prove (Part 1)

### 3.1 The one inference that is airtight

`perfStats.ts:182-197` wraps `renderer.render` and measures `t1 - t0` around the *original*
call. So `render p50 = 1009 ms` means: **a single synchronous JavaScript call to
`WebGLRenderer.render()` did not return for one second.** `present p50 = 1144 ms` is the gap
between successive such calls. Therefore **1009 / 1144 ≈ 88% of every frame is spent inside one
function**, and the remaining ~135 ms covers our `tick` (2.7 ms), three-forcegraph's simulation
tick, controls, rAF and browser overhead.

Everything the previous audits optimised lives in that ~135 ms slice. Even reducing it to zero
would take the app from 1.0 fps to 1.13 fps.

### 3.2 The distinction the previous audits collapsed

`renderer.render()` is **not** a GPU operation. It is CPU-side command submission. Five
distinct things can make it block, and they have very different fixes:

| Category | What it is | Can it cost ~1000 ms? | Evidence here |
|---|---|---|---|
| **JS / main thread** | Scene-graph matrix updates, render-list build + sort, frustum culling | No — ~1,400 objects is a few ms | `tick` 2.7 ms shows our JS is fast; render-list work is comparable |
| **WebGL command submission** | `gl.drawElements` etc., driver validation | Unlikely — 721 calls ≈ 5–20 ms of overhead | 721 calls is not a pathological count |
| **GPU execution** | Actual raster/fragment work | Yes, *indirectly* — via back-pressure | Leading contributor |
| **GPU/driver synchronisation** | Command-buffer back-pressure: the renderer process outruns the GPU process and the next GL call blocks until queue space frees | **Yes — this is the classic signature** | `render ≈ present` is exactly what back-pressure looks like |
| **Renderer-internal extra passes** | Shadow maps, **transmission pass**, PMREM, render-target resolve/mipmap — all *inside* `render()` | **Yes** | **Confirmed present — §5** |
| **Compositor delay** | Browser presenting the canvas | Would appear in `present − render`, not in `render` | `gap` is only 44–66 ms |

### 3.3 A critical instrumentation caveat (this corrects `perfStats.ts`'s own doc comment)

`perfStats.ts:28-31` documents `gapMs = present.p95 − render.p95` as the CPU-vs-GPU
discriminator: *"If draw submission (render) is cheap but frames still arrive far apart, the GPU
is what's slow."*

**That reasoning inverts under back-pressure and is actively misleading here.** When the GPU is
saturated, the driver blocks *inside* `render()`, so GPU cost is **absorbed into the `render`
number instead of appearing as `gap`**. A small `gap` (44–66 ms) alongside a huge `render`
therefore does **not** mean "submission-bound, not GPU-bound" — it is precisely what a
GPU-bound-with-back-pressure frame looks like. Any future reading of these fields must account
for this; the HUD's built-in "healthy / CPU bound / GPU-fill-rate bound" verdict is not
trustworthy in this regime.

### 3.4 What can and cannot be inferred

**Can be inferred:**
- Our JS is not the bottleneck (2.7 ms, directly measured).
- The cost is inside `renderer.render()` (directly measured).
- Shader recompilation is not the story (`programs` stable at 45).
- Geometry volume alone is not the story (~900k triangles is ~2–9 ms of vertex work on any modern mobile GPU).
- Draw-call count alone is not the story (721 is unremarkable).
- Links are drawn as **meshes**, not `Line`s (`lines: 0`).

**Cannot be inferred from these numbers alone:**
- The split between "GPU fragment work" and "renderer-internal extra passes" — both live inside `render()` and neither is separately instrumented.
- Whether the reported `dpr 2.8125` has any effect on the renderer (it does not — §16).
- Whether the flicker is object churn or low-FPS presentation (§13).

---

## 4. Render Call Path (Part 2)

```
Graph3D.tsx  <ForceGraph3D …>
  └─ react-force-graph-3d
      └─ 3d-force-graph            _animationCycle()  (its own uncapped rAF loop)
          ├─ three-forcegraph      tickFrame()        ← simulation + photons (NOT in `tick`)
          └─ three-render-objects  renderObjs.tick()  ← three-render-objects.mjs:262-290
              ├─ controls.update()
              ├─ state.postProcessingComposer.render()      ← :266-267, ALWAYS taken
              │   └─ RenderPass.render()
              │       └─ renderer.render(scene, camera)     ← THE 1009 ms  [perfStats patch here]
              │           ├─ info.reset()                        three.module.js:17209
              │           ├─ renderTransmissionPass(…)           :17250  ← **FOUND**
              │           │   ├─ setRenderTarget(full-res MSAA RGBA16F)
              │           │   ├─ clear()
              │           │   ├─ background.render(scene)        ← cubemap re-rendered
              │           │   ├─ renderObjects(opaqueObjects)    ← **whole opaque scene, again**
              │           │   ├─ updateMultisampleRenderTarget() ← MSAA resolve
              │           │   └─ updateRenderTargetMipmap()      ← **full mip chain, every frame**
              │           └─ renderObjects(opaque → transmissive → transparent)  :17436-17445
              └─ raycaster hover check                       ← disabled by the last experiment
```

**Answers to the Part 2 questions:**

1. **How many renderer passes per frame?** One `renderer.render()` call, but that call
   internally contains **two full scene traversals** (transmission pass + main pass) plus a
   background render, an MSAA resolve and a mipmap-chain generation.
2. **Is EffectComposer still active?** **Yes, always.** `three-render-objects.mjs:599-600`
   constructs `EffectComposer` + `RenderPass` **unconditionally at init**, and `:266-267` routes
   every frame through it. It cannot be turned off from the app.
3. **Is bloom actually disabled in Performance mode?** **Yes.** `Graph3D.tsx:1037-1038` only
   calls `addBloom()` when `gfx.bloom` is true, and `adaptiveController.ts:40-45` has
   `bloom: false` for rungs 0–5. **Independently confirmed by the data:** `info` is reset once
   per `render()` (`:17209`); if a bloom composite were the last pass, `draw calls` would read
   ~1 (a fullscreen quad). It reads 706–721, i.e. the main scene. **Bloom is off.** This audit
   does not resurrect it.
4. **Other postprocessing passes?** None. With a single `RenderPass` that is also the last
   enabled pass, it renders straight to screen (`renderToScreen = true`), so no extra blit.
   Note the composer still **allocates two full-resolution `HalfFloatType` render targets** that
   are never used — VRAM waste, not per-frame cost.
5. **What does the HUD's `render` capture?** Exactly **one inner `renderer.render(scene, camera)`
   call — including the entire transmission pass**, and excluding `EffectComposer`'s own
   surrounding work. This is the single most important interpretive fact in this document: the
   transmission pass is *inside* the measured number, which is why it can be 1009 ms.

---

## 5. The Primary Finding — an always-on transmission pass

### 5.1 The asset

```
packages/web/public/sun.glb  →  extensionsUsed: [ … "KHR_materials_transmission" … ]
material_1: {
  "alphaMode": "BLEND",
  "extensions": { "KHR_materials_transmission": { "transmissionFactor": 1, … } }
}
```

`GLTFLoader.js:1205-1207` → `materialParams.transmission = 1.0`, and the material is promoted to
`MeshPhysicalMaterial`.

### 5.2 The trigger

`three.module.js:7993-7999` — render-list classification:

```js
if ( material.transmission > 0.0 ) { transmissive.push( renderItem ); }
else if ( material.transparent === true ) { transparent.push( renderItem ); }
else { opaque.push( renderItem ); }
```

`three.module.js:17250`:

```js
if ( transmissiveObjects.length > 0 ) renderTransmissionPass( opaqueObjects, transmissiveObjects, scene, camera );
```

**One transmissive object in the scene is enough.** There is exactly one, and it is the sun.

### 5.3 What the pass does, every frame (`three.module.js:17458-17580`)

| Step | Line | Cost character |
|---|---|---|
| Create target: `generateMipmaps: true`, `HalfFloatType`, `samples: capabilities.samples`, `minFilter: LinearMipmapLinearFilter` | :17472-17482 | One-time alloc; **4× MSAA RGBA16F at full res** (`antialias: true` at three-render-objects.mjs:581 → `samples: 4`, three.module.js:13951) |
| `setSize(viewport.z × transmissionResolutionScale, …)` — **scale defaults to `1.0`** (`:15810`), never changed by this app | :17498 | **Full resolution**, not reduced |
| `setRenderTarget` + `clear()` | :17506-17516 | Full-res clear |
| `background.render( scene )` | :17518 | **Baked cubemap background rendered a second time** |
| `renderObjects( opaqueObjects, scene, camera )` | :17537 | **Entire opaque scene rendered a second time** |
| `textures.updateMultisampleRenderTarget(...)` | :17539 | **Full-res 4×MSAA → single-sample resolve blit** |
| `textures.updateRenderTargetMipmap(...)` | :17540 | **Complete mipmap chain generated on a full-res half-float texture, every frame** |

For a ~1160 × 2570 drawing buffer this is roughly a 12 MB RGBA16F surface with ~48 MB of MSAA
sample storage, resolved and then fully mip-reduced **on every single frame**, on a mid-range
mobile GPU — on top of, and before, the frame the user actually sees. Mobile GPUs are
bandwidth-limited and tile-based; a full-res half-float resolve plus mipmap generation is close
to a worst-case workload for that architecture.

### 5.4 Why it is always on

`Graph3D.tsx:1004-1007`:

```js
const sun = makeSun();
sunRef.current = sun;
sun.userData.setBrainScale?.(dataRef.current.nodes.length);
scene.add(sun);
```

Unconditional. `sun.ts:66-93` loads `/sun.glb` and `group.add(model)`. The existing traverse at
`sun.ts:89-91` already reaches this exact material (it sets `envMapIntensity = 0` on it) but
never touches `transmission`. No tier, preset, rung, Battery Saver, Performance mode, bloom
setting, link budget or `galaxyDiag` flag disables it.

### 5.5 Why every previous experiment missed it

| Experiment | Why it could not have found this |
|---|---|
| Charge-force removal | Simulation layer — outside `render()` entirely |
| Camera `refresh()` removal | Outside `render()` |
| Journey/Money throttling | Outside `render()` |
| TubeGeometry reuse | Reduces work in the *main* pass only; transmission pass unaffected |
| Detailed-link budget 941 → 200 | Link tubes are **transparent** → **not in `opaqueObjects`** → **not re-rendered by the transmission pass at all**. Cutting them cannot touch it. |
| Bloom / graphics mode | Bloom is a *composer pass*; the transmission pass is *inside* `renderer.render()` and is independent of it |
| `enablePointerInteraction={false}` | Raycaster runs *after* `render()` returns (three-render-objects.mjs:270-290) |
| PerfHUD fields | No field decomposes the interior of `render()` |

---

## 6. Draw-Call Accounting (Part 3)

**Methodological note:** `info.reset()` runs **once** per `render()` (`three.module.js:17209`),
*before* the transmission pass. Therefore **`draw calls: 721` and `triangles: 903,636` are the
SUM of the transmission pass and the main pass**, not the main pass alone. This has never been
accounted for in previous audits.

Source-grounded model for Large View (240 nodes, 200 detailed links):

| Category | Count | Basis |
|---|---|---|
| Node body (full-detail **or** macro-LOD sibling — mutually exclusive per node) | ~240 | `nodeObject.ts:531-538`, macro swap at `Graph3D.tsx:1175`, `:1812-1815` |
| Node glow sprite (additive) | ~240 | `nodeObject.ts:136-141`, added for star/planet/action |
| Link tubes | 200 | budget active; `lines: 0` proves mesh path |
| Labels | 3 | `MAX_VISIBLE_LABELS` cap — HUD confirms `labels 3` |
| Asteroid belts (`Points`) | 7 | §9 arithmetic |
| Background points systems (starfield, milky-way haze + dust, deep-space dust) | 4 | §9 |
| Journey hubs / Money sky | 2 / 8 | HUD reports these directly |
| Planet rings | a few | `nodeObject.ts:560-569`, subset of gas giants |
| glTF models + background + misc (sun 2 meshes, station, ship, dyson, star-center, satellites, sub-agents, visitors) | ~10–20 | one draw call per mesh |
| **Subtotal (main pass)** | **≈ 705–730** | |
| Transmission pass (opaque objects only) | **small** — see below | |
| **Modelled total** | **≈ 710–730** | **Observed: 706–721 ✅** |

**Why the transmission pass adds few draw calls but large cost:** because
`Graph3D.tsx:2338-2349` forces `transparent = true` on every node material (§8), almost nothing
node-related is in `opaqueObjects`. The transmission pass therefore re-renders only the *opaque*
residue — chiefly the glTF models — so it contributes few *calls* while still paying the full
fixed cost of a full-res MSAA target clear + background render + resolve + mipmap chain.

**Triangle reconciliation (inference, not proof):**
Bodies ≈ 240 × ~720 (planet 24×16 sphere = 720 tris; star 32×24 = 1,472; macro 14×14 = 364) ≈ 173k.
Links = 200 × 360 = 72k (`linkTube.ts:64,69` → 30 tubular × 6 radial × 2). Subtotal ≈ 245k.
The remaining ~660k is glTF model geometry — **and opaque model geometry is counted twice**,
once per pass. ~330k of models rendered twice = ~660k. This also explains the otherwise odd
903,636 → 729,268 swing: a difference of 174,368 ≈ **2 × 87,184**, i.e. one opaque model entering
or leaving the frustum and being counted in *both* passes. The doubling is consistent with the
data; treat it as a strong indication, confirmable only on-device.

---

## 7. Node Construction Decomposition (Part 4)

One logical node → one `THREE.Group` (`nodeObject.ts`), containing:

| Child | Type | Always? |
|---|---|---|
| Full-detail body mesh | `Mesh` + custom `ShaderMaterial` (star/planet) or `MeshStandardMaterial` | yes |
| Macro-LOD sphere (14×14) | `Mesh` + cached `MeshStandardMaterial` + canvas texture | yes (`userData.isMacro`) |
| Glow sprite | `Sprite`, additive, `depthWrite:false` | star/planet/action |
| Label sprite | `Sprite`, `depthWrite:false` **and `depthTest:false`**, `renderOrder 999` | yes |
| Sector-title label | `Sprite` (×2.5 scale) | hub bodies (mass ≥ ~0.44) |
| Ring | `Mesh`, `RingGeometry(48)`, `DoubleSide`, transparent | some gas giants; all actions |
| Asteroid belt | `Points` (360 pts) | star-class only |
| Point light | **none** — replaced by the Stage 4 fixed pool | — |

**Per node:** ~4–5 `Object3D`s typical, up to ~7 for a star-class hub.
**At 240 nodes:** ≈ **1,000–1,400 `Object3D`s**, ~240 unique `ShaderMaterial` instances (one per
node — *not* shared), ~500+ geometries/textures.

This is the scene-graph size that `renderer.render()` must traverse, frustum-cull, sort and
submit — twice, once per pass.

---

## 8. Node Material Analysis (Part 5) — the second finding

### 8.1 The shaders are pure-ALU expensive

`shaders.ts`:
- `hash()` (`:34`) — a `sin`-based hash: one transcendental each.
- `vnoise()` (`:35-41`) — **8 `hash()` + 7 `mix()`**.
- `fbm()` (`:42-46`) — one `vnoise()` per octave.
- Octaves (`:27-28`): star `{perf 3, bal 4, qual 5}`, planet `{perf 2, bal 3, qual 4}`.
- **Planet fragment (`:126-137`) calls `fbm()` three times** → perf **6 vnoise = 48 hashes/pixel**; quality **12 vnoise = 96 hashes/pixel**.
- **Star fragment (`:85-95`) calls `fbm()` twice** → perf **6 vnoise = 48 hashes**; quality **10 vnoise = 80 hashes**.
- **Zero texture fetches** — the cost is 100% ALU, so it scales exactly with covered pixels.
- Planet material is `precision mediump` (`:144`); star material is left at default (effectively `highp`).

### 8.2 …and early-Z has been disabled for all of them

`Graph3D.tsx:2334-2349`:

```js
useEffect(() => {
  fg.scene().traverse((o) => {
    const id = o.userData?.nodeId;
    if (id == null) return;
    const lit = isLit(id);
    o.traverse((child) => {
      const mat = child.material;
      if (!mat) return;
      mat.transparent = true;            // ← unconditional
      mat.opacity = lit ? 1 : 0.12;
      …
    });
  });
}, [activeId, adjacency]);
```

This runs **on mount and on every `activeId`/`adjacency` change, including when `activeId === null`**
(nothing selected — the default state). It sets `transparent = true` on **every material of every
child of every node**: bodies, macro spheres, rings, belts.

Consequences, all of them bad:
1. All ~240 bodies move from the **opaque** queue to the **transparent** queue
   (`three.module.js:7999-8001`).
2. The transparent queue is drawn **back-to-front after** the opaque pass. **There is no early-Z
   rejection between them** — a body completely hidden behind another still executes its full
   48–96-hash fragment shader for every covered pixel.
3. Because they are no longer opaque, they are **excluded from `opaqueObjects`** and therefore
   *not* re-rendered by the transmission pass — which is why the link-budget experiment could
   never have moved the transmission cost.
4. The transparent list is re-sorted every frame by depth
   (`three.module.js:8036`) — cheap, but its **order changes between frames**, which is
   relevant to the flicker (§13).

This is almost certainly unintentional: the effect exists to *dim* non-neighbours during hover
highlighting, and dimming genuinely requires transparency — but only for the dimmed ones, and
only while something is actually selected.

### 8.3 Other material families

| Material | Where | Notes |
|---|---|---|
| `MeshPhysicalMaterial` (transmission = 1) | sun.glb | **§5 — the primary finding** |
| `MeshStandardMaterial` (PBR) | macro bodies, glTF models, satellites, sub-agents, visitors, station | PBR + **`scene.environment` IBL set at `Graph3D.tsx:779`** → every one does env sampling |
| custom `ShaderMaterial` | node bodies | §8.1 |
| `SpriteMaterial` additive, `depthWrite:false` | glows, sun corona, journey halos, money sky, station aura, engine glow | zero early-Z |
| `MeshLambertMaterial` | link tubes (three-forcegraph.mjs:1284-1287) | `transparent`, `depthWrite:false` |

**`scene.environment` is set** (`Graph3D.tsx:770-784`, PMREM from `RoomEnvironment`). Every
`MeshStandard/PhysicalMaterial` in the scene therefore samples a prefiltered environment cubemap
per pixel. `sun.ts:90` zeroes only `envMapIntensity`, which suppresses the *contribution*, not
the *sampling cost* or the shader permutation.

---

## 9. Geometry / Triangle Analysis (Part 6)

| Source | Per-unit triangles | Count | Total |
|---|---|---|---|
| Star body (`SphereGeometry(r, 32, 24)`) | 1,472 | subset of 240 | — |
| Planet/giant body (`24, 16`) | 720 | majority of 240 | ~173k combined |
| Macro-LOD sphere (`14, 14`) | 364 | 1 per node (mutually exclusive with body) | included above |
| Link tube (`linkTube.ts:64,69` — 30 × 6) | **360** | 200 detailed | **72,000** |
| Ring (`RingGeometry`, 48 seg, DoubleSide) | 96 | subset | small |
| Sprites (glow/label/corona) | 2 | ~500 | ~1,000 |
| glTF models | large | ~8 models | **~330k, counted twice (§6)** |

**Answer to "is 0.7–0.9M triangles enough to explain 1 fps?"** — **No, not on its own.** A
mid-range mobile GPU processes 100–500M triangles/s; 900k triangles is ~2–9 ms of vertex work.
Geometry volume is a **red herring**. Its real significance is diagnostic: the doubling is
evidence of the second scene traversal (§6), and the *fragment* work those triangles generate is
what matters — not their count.

---

## 10. Transparency / Overdraw Analysis (Part 7)

Ordered by (screen coverage × instance count × shader cost):

| # | Layer | Blending / depth | Instances | Size |
|---|---|---|---|---|
| 1 | **Node bodies (procedural fbm)** | **transparent forced (§8.2)**, depthWrite true | **~240** | r 2.2–16 |
| 2 | Sun corona sprite (`sun.ts:38-47`) | **additive, depthWrite:false** | 1 | **~1,290–1,680 world units** — huge coverage |
| 3 | Node glow sprites (`nodeObject.ts:136-141`) | **additive, depthWrite:false** | ~240 | 1.35–3.0 × body |
| 4 | Link tubes (three-forcegraph.mjs:1284-1287) | transparent, **depthWrite:false** | 200 | thin but long |
| 5 | Labels (`nodeObject.ts:63-68`) | **depthWrite:false AND depthTest:false**, `renderOrder 999` | 3 visible | ~52×8 |
| 6 | Rings (`nodeObject.ts:560-569`) | transparent, **DoubleSide** | subset | 1.6–2.4 × body |
| 7 | Journey halos / money sky / station aura / engine plume | **additive, depthWrite:false** | 2 / 8 / 1 / 40 | up to 700 |
| 8 | Points systems (starfield, milky way, dust, belts) | additive, depthWrite:false | 5,910 points | small each |
| 9 | Deep-space nebula + distant galaxies | — | **0 live — baked to cubemap (Stage 3)** | n/a |

**Verdict:** overdraw is real and substantial — every one of layers 2, 3, 7, 8 has **zero
early-Z rejection by construction**, and layer 1 has had its early-Z **removed by a bug**. But
the *dominant* term is layer 1 × the §8.2 bug: ~240 bodies each running 48–96 transcendental
hashes per covered pixel, none of which can be depth-rejected. Note the previously-suspected
worst offenders (nebula clouds, distant galaxies at 2,200–5,400 units) were **already eliminated**
by the Stage 3 bake and are correctly not live.

---

## 11. Lighting Analysis (Part 8)

`lights 3` is the **Galaxy star-light pool size** reported by
`registerGalaxyCounts` (`perfStats.ts:96-97`), i.e. `lightPoolSize` — **not** the total scene
light count. Actual scene lights = the fixed pool (3 at performance tier) **plus** the sun's own
`PointLight` (`sun.ts:51`) **plus** any ambient/hemisphere lights.

Findings:
- The Stage 4 fixed pool is **working as designed**: unused slots get `intensity = 0` rather than
  `visible = false`, so `NUM_POINT_LIGHTS` never changes and no shader recompile is triggered.
  `programs: 45` staying flat across both readings **confirms this empirically**.
- No shadow maps anywhere (no `castShadow` / `receiveShadow` / `shadowMap.enabled` in app source).
- Lighting is **not** a bottleneck and is **not** implicated. This is one of the few subsystems
  the previous stages genuinely fixed and it should be left alone.
- The real lighting-adjacent cost is not the lights but **`scene.environment`** (§8.3).

---

## 12. Point / Particle Analysis (Part 9)

`points: 5,910` decomposes **exactly**:

```
starfield            1,200   starfield.ts:82   (STAR.low, gfx.starCount)
milky-way haze         240   starfield.ts:178-181
milky-way dust       1,600   starfield.ts:178-181
deep-space dust        350   deepSpace.ts:157
asteroid belts       2,520   nodeObject.ts:207,218 → 7 star-class nodes × 360
                     -----
                     5,910   ✅ exact
```

Spiral galaxies (2 × 1,400) and constellations (24) were frustum-culled at that camera pose.

**Only the 2,520 belt points scale with node count** (7 star-class nodes inside `MACRO_DIST`);
the other 3,390 are fixed backdrop and are identical in Small View. All use `depthWrite:false`;
most are additive; none use a texture. Each system is one draw call.

**Verdict:** ~5,900 points is a trivial GPU load and is **not** a bottleneck. It is useful only as
a differential signal (§18).

---

## 13. Backdrop / Environment Analysis (Part 10)

Two *distinct* things, previously conflated:

**`scene.background`** — the Stage 3 baked cubemap (`backdropBake.ts:63`). Cheap in the normal
pass (one background draw). **But it is rendered a second time inside the transmission pass**
(`three.module.js:17518`), at full resolution, into the MSAA half-float target.

**`scene.environment`** — set at `Graph3D.tsx:779` via `PMREMGenerator.fromScene(new
RoomEnvironment(), 0.6)`. This is a **scene-wide IBL** that every `MeshStandard`/`MeshPhysical`
material samples per pixel, and it changes the shader permutation for all of them. `sun.ts:90`
zeroes `envMapIntensity` on the sun only (a visual fix for a reported "square block of light"),
which does not remove the sampling. `graph3dHelpers.ts:269` additionally assigns `o.material.envMap
= env` per glTF material.

Confirmed **not** live: the nebula clouds (2,200–5,400 units) and distant galaxy glows
(1,400–3,200 units) — baked and disposed. Stage 3 did what it claimed.

---

## 14. Link Rendering Analysis (Part 11)

**Why did 941 → 200 detailed links fail to help?** Four independent reasons, all source-verified:

1. **Link tubes are transparent** (`three-forcegraph.mjs:1284-1287`: `transparent: opacity < 1`,
   `depthWrite: opacity >= 1` → **false**, driven by `Graph3D.tsx` rgba alphas). Transparent
   objects are **not in `opaqueObjects`**, so the transmission pass — the dominant cost — never
   touched them. **Cutting them cannot reduce the 1009 ms.** This is the decisive answer.
2. **The 741 excluded links still exist as `Object3D`s.** `linkVisibility` returning false sets
   `object.visible = false`; the objects, their geometry and their material remain allocated and
   remain in the scene graph, so `renderer.render()` still traverses and tests them.
3. **Their geometry is still allocated.** 941 × 217 vertices of position/normal/uv/index buffers
   stay resident in VRAM regardless of the budget.
4. **Photons are independent of the budget.** `linkDirectionalParticles`
   (`Graph3D.tsx:3287-3292`) returns 1–2 particles for links with activity > 0.45, evaluated per
   link, and `three-forcegraph`'s `updatePhotons()` iterates **all** `graphData.links` every frame
   — the detailed-link budget does not gate it.

**Per-link cost when detailed:** 360 triangles (30 tubular × 6 radial × 2), 217 vertices.
**Per-frame CPU/upload cost:** `linkTube.ts:225-255` recomputes Frenet frames, rewrites position
and normal attributes, sets `needsUpdate = true` on both, and calls `computeBoundingSphere()` —
**≈ 5.2 KB of `bufferSubData` per link per frame**, ~1.04 MB/frame at 200 links, uploaded inside
`render()`. Real, but an order of magnitude too small to explain 1009 ms.

**A separate latent bug worth recording** (not the cause of this freeze):
`three-forcegraph.mjs:1261-1269` guards with `if (!obj.geometry.type.match(/^Cylinder(Buffer)?Geometry$/) …) { obj.geometry.dispose(); … }`.
`linkTube.ts:143` assigns a plain `new THREE.BufferGeometry()` whose `.type` is
`"BufferGeometry"`, so **the regex never matches and every link tube's geometry is disposed on
every digest pass**, then reassigned at `linkTube.ts:191`. This forces full VBO reallocation for
every curved link on each React re-render and is a plausible contributor to the observed
geometry-count churn (327 ↔ 314). It is digest-frequency, not per-frame.

---

## 15. LOD / Flicker Analysis (Part 12 + Part 18)

The user's report — *"every time another frame finally appears, the bodies seem to flicker"* — is
treated as valid evidence. Mechanisms that could produce it, ranked:

| # | Mechanism | Consistent? | Confidence |
|---|---|---|---|
| 1 | **Low-FPS presentation of continuous motion.** `orbits.ts` banks skipped time in `pendingDt` and advances by the **full real elapsed time** on the next eligible frame (Stage 5, by design). At 1 fps every body jumps ~1 second of orbital travel between visible frames. | **Yes — strongly** | **High** |
| 2 | **Transparent-queue re-sort.** All bodies are in the transparent queue (§8.2), re-sorted back-to-front every frame (`three.module.js:8036`). With ~1s of motion between frames, draw order — and therefore additive/blended appearance — reshuffles visibly. | **Yes** | **High** |
| 3 | **Macro-LOD swap churn.** `Graph3D.tsx:1175`, `:1812-1815` toggle body vs macro sphere at `MACRO_DIST` (2600) with hysteresis. Camera drift across the band flips representations. | Partially — hysteresis exists | Medium |
| 4 | **Label cap membership.** Nearest-N label selection with a 15% stickiness bias; only 3 labels visible, so churn is limited. | Weak | Low |
| 5 | **Node-object cache rebuilds.** `nodeVisualCacheKey` (`nodeObject.ts:376`) includes `importance` and `degree`; server refreshes change `degree`, disposing and rebuilding the whole node object (`Graph3D.tsx:3101-3128`). Also invalidated wholesale when `obj.parent === null` (`graph3dHelpers.ts:45-50`). Best explains the texture churn 256 ↔ 248. | Yes, but event-driven (seconds) | Medium |
| 6 | Material recompile storm | **No** — `programs` stable at 45 | Ruled out |

**Conclusion:** the flicker is most likely **not a separate bug**. It is what a correctly-behaving
scene looks like when only ~1 frame per second reaches the screen while motion continues to
advance in real time — amplified by the transparent-sort reshuffle that §8.2 causes. The user is
describing the symptom accurately; it is a *consequence* of the 1 fps, not an additional cause.
**If the frame rate is fixed, the flicker should disappear on its own.** That is itself a useful
confirmation signal for the next experiment.

---

## 16. GPU Synchronisation Analysis (Part 13)

Searched app source **and** `three`, `three-forcegraph`, `three-render-objects`, `3d-force-graph`
for: `readPixels`, `readRenderTargetPixels`, `gl.finish`, `gl.flush`, `getParameter`, queries,
`copyFramebufferToTexture`, `compile()`, `initTexture`, `getContext`.

- **No explicit CPU/GPU sync primitive exists in application code.** Every `getContext(` hit is a
  2D canvas used for texture authoring at construction time.
- `perfStats.ts:184-197` is an honest `performance.now()` bracket — the instrument itself
  introduces no sync.
- `checkShaderErrors` defaults to `true` (`three.module.js:15703`) and calls
  `gl.getProgramParameter(program, gl.LINK_STATUS)` — a genuine synchronous stall, but only when
  a program is compiled. **`programs: 45` stable across both readings rules this out** as the
  per-frame cost.
- **The only mechanism found that blocks inside `render()` is the transmission pass (§5)** —
  specifically `updateMultisampleRenderTarget` and `updateRenderTargetMipmap`, which are driver
  operations on a full-resolution multisampled half-float texture, plus general command-buffer
  back-pressure from the doubled scene submission.

---

## 17. Mobile GPU Pressure Analysis (Part 14)

Device context: Android 10, Chrome 152, `window.devicePixelRatio` 2.8125. **Exact GPU not known
and deliberately not assumed.**

Workload classes that are disproportionately dangerous on mobile tile-based GPUs, mapped to this scene:

| Class | Present here? | Where |
|---|---|---|
| **Full-res multisampled render targets** | **Yes — every frame** | §5.3 transmission target, 4× MSAA RGBA16F |
| **Per-frame mipmap generation on a large float texture** | **Yes — every frame** | `three.module.js:17540` |
| **MSAA resolve of a full-res half-float target** | **Yes — every frame** | `:17539` |
| **Rendering the scene more than once per frame** | **Yes** | `:17537` |
| High overdraw with no early-Z | **Yes** | §10 |
| Fragment-heavy procedural shaders | **Yes** — 48–96 transcendentals/pixel | §8.1 |
| PBR + environment IBL | **Yes** | §13 |
| High DPR | Capped ≤ 2.0 (§18) | — |
| Many draw calls | No (721 is fine) | — |
| Large point sprites | No | §12 |
| Postprocessing (bloom) | **No** — off | §4 |

Tile-based deferred renderers are especially punished by (a) render-target switches, (b)
resolves, and (c) anything that forces the tile buffer to be flushed to main memory. The
transmission pass does all three, every frame, at full resolution.

---

## 18. DPR Reality Check (Part 15)

**The HUD's `dpr 2.8125` is `window.devicePixelRatio` read directly in the copy string**
(`PerfHUD.tsx:150`). **It is not, and never was, the renderer's pixel ratio.** No previous audit
established this.

The renderer's actual ratio is set in two places:

1. `three-render-objects.mjs:585` — at init: `state.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))` → **clamped to 2.0**.
2. `Graph3D.tsx:817` (and `:1454-1457`, `:2321-2324` for adaptive changes) — `fg.renderer().setPixelRatio(gfx.pixelRatio)`, where `graphicsConfig.ts:180-198` computes:
   - `renderQuality: "low"` → **1.0**; `"medium"` → min(1.5, dpr); `"high"` → min(2, dpr);
   - `"auto"` → `min(dpr, tierCap)` with `tierCap` = 1.0 (performance) / 1.5 (balanced) / 2.0 (quality), or the adaptive rung's `pixelRatioCap` (`adaptiveController.ts:40-47`, max 2.0);
   - Battery Saver clamps to 1.0.

**Conclusion: the renderer never renders at 2.8125.** The true value is between **1.0 and 2.0**,
depending on the persisted adaptive rung in this device's `localStorage` — which cannot be
determined from source. `App.tsx:1604` already displays the truth in Settings as
`dpr: 2.8125 → render <actual>`; **that readout, not the HUD's, is the one to trust.**

The `EffectComposer` render targets and the transmission target are all sized from the renderer's
real ratio, so they inherit whatever that value is. **DPR is a genuine multiplier on the
transmission pass's cost**, but the previous suspicion that the app was rendering at 2.8125 is
**false** and should be retired.

---

## 19. Screen-Space Coverage Analysis (Part 16)

**Can ~900k triangles and ~700 draw calls still be catastrophically slow? Yes — trivially, if the
fragment workload is large enough.** Triangle and draw-call counts bound *vertex* and *submission*
cost; neither is the constraint here (§9, §6). Fragment cost is bounded by
**covered pixels × overdraw × per-pixel shader cost × passes**, and every one of those four terms
is inflated here:

- **covered pixels** — full framebuffer at renderer ratio up to 2.0.
- **overdraw** — additive `depthWrite:false` glows/corona/halos, plus §8.2 removing early-Z from all 240 bodies.
- **per-pixel cost** — 48–96 `sin`-based hashes per body pixel, plus PBR + IBL on every macro sphere and model.
- **passes** — **×2 for opaque geometry**, plus a full-res clear, background render, MSAA resolve and mipmap chain (§5.3).

A note on the user's own framing: they described Large View as a *distant* view. That is
important and works **against** a pure-overdraw explanation — at distance, bodies cover few
pixels each. It works **for** the transmission-pass explanation, whose dominant cost
(target clear, background render, resolve, mipmap chain) is **resolution-dependent but
scene-distance-independent**: it costs the same whether the galaxy is filling the screen or
sitting far away. **This is a meaningful discriminator between the two leading candidates and is
directly testable** (§22).

---

## 20. Large-vs-Small Differential (Part 17)

Small View ≈ 9 nodes / 7 links; Large View ≈ 240 nodes / 941 links (200 detailed).

| Workload | Small | Large | Scaling | Inside `render()`? | Significance |
|---|---|---|---|---|---|
| **Transmission pass — fixed portion** (clear, background render, MSAA resolve, mipmap chain) | **same** | **same** | **×1 (constant)** | **Yes** | **Very high — and identical in both views** |
| **Transmission pass — opaque re-render** | few models | same models + more opaque residue | ~×1–2 | **Yes** | High |
| Node bodies (fbm, forced transparent) | 9 | 240 | **×26.7** | Yes | **Very high** |
| Node child objects | ~40 | ~1,000–1,400 | ×26–35 | Yes | High (traversal + sort) |
| Link tubes (transparent) | 7 | 200 | ×28.6 | Yes | Medium (falsified as *sole* cause) |
| Points | 3,390 + 0 belts | 3,390 + 2,520 belts | ×1.74 | Yes | Low |
| Labels | ≤3 | 3 (capped) | ×1 | Yes | Negligible |
| Lights | 3 pool | 3 pool | ×1 | Yes | Negligible |
| Transparent sprites (glow/corona) | ~10 | ~250 | ×25 | Yes | High (zero early-Z) |
| Postprocessing | RenderPass only | RenderPass only | ×1 | Partially | None (bloom off) |
| Draw calls | ~40–60 (inferred) | 706–721 (measured) | ~×13 | Yes | Medium |
| Triangles | not measured | 729k–904k | — | Yes | Low (§9) |
| Screen coverage | low | low-ish (distant view) | — | Yes | Uncertain |

**The honest reading:** two things are true at once, and the audit must not collapse them.

- The **transmission pass** is a large cost that is **present in both views**. It alone cannot
  explain why Large is catastrophically worse than Small — but it can explain why the *floor* is
  so high, and it multiplies everything else.
- The **240 forced-transparent fbm bodies + ~250 additive sprites** are what actually scale
  ×25–27 between the two views.

The most likely truth is **compounding**: a very expensive fixed per-frame overhead
(transmission pass) that leaves almost no budget, plus a ×26 scaling term (bodies with early-Z
removed) that pushes it over a cliff. This also explains why *every individual* experiment failed
— each removed one contributor while the other, larger one remained.

---

## 21. Previous Experiment Reconciliation (Part 19)

**Proven improvement — charge-force removal.** Genuine. It removed a full octree rebuild per
tick from `d3-force-3d`, which runs forever because `cooldownTicks`/`cooldownTime` are
`9999999` (`Graph3D.tsx:3182-3183`) and `d3AlphaMin` is never set. But that work lives in the
**simulation tick, outside `renderer.render()`** — i.e. inside the 135 ms slice, not the 1009 ms
one. It made a real dent in a small budget. It could never have addressed the render cost, and
its success misled the investigation into believing the problem was CPU-side.

**Falsified / no meaningful effect** — all now explained:

| Experiment | Why it did nothing |
|---|---|
| Camera `refresh()` removal | Outside `render()` |
| Journey/Money throttling | Outside `render()`; 10 objects total |
| TubeGeometry reuse | Main-pass only; transmission pass untouched |
| **Detailed-link budget 941 → 200** | Link tubes are transparent → excluded from `opaqueObjects` → **structurally incapable** of affecting the transmission pass (§14) |
| **Bloom / graphics mode** | Bloom was already off; the transmission pass is inside `renderer.render()` and independent of the composer (§4) |
| **Pointer interaction disabled** | The raycaster runs **after** `render()` returns (three-render-objects.mjs:270-290) — it was never inside the measured 1009 ms |

**Known regression — complete link-force removal** (`e7bc375`): `forceLink.initialize()` is the
sole mechanism that resolves `link.source`/`link.target` from ids to node objects. Removing it
broke the galaxy. Documented in `soumaya-galaxy-force-removal-regression.md`. **Not repeated.**

**Instrumentation limitations — updated:**
- `tick` does **not** cover three-forcegraph's `tickFrame()` (simulation + photons) or
  `renderObjs.tick()` (controls + raycaster). Still true.
- `render` covers **one inner `renderer.render()` call including the entire transmission pass**.
  This is the key correction — the metric is more inclusive than previously assumed.
- `draw calls` / `triangles` are **summed across all passes inside that call** (`info.reset()`
  runs once, at `three.module.js:17209`). Previously unaccounted for; it is why the numbers
  appear roughly doubled.
- `gapMs` **cannot** distinguish GPU-bound from CPU-bound under back-pressure (§3.3). The HUD's
  own verdict line is unreliable in this regime.
- `dpr` in the HUD is `window.devicePixelRatio`, **not** the renderer's ratio (§18).

**How the 1-second `render` changes our understanding:** it relocates the entire investigation.
Every prior hypothesis concerned work *outside* `renderer.render()`. The measurement says ~88% of
each frame is *inside* it. Tracing what happens inside it — which no previous audit did —
immediately surfaced a scene-wide, always-on, doubled-rendering mode that nothing we control
was gating.

---

## 22. Ranked Render Bottlenecks (Part 20)

### #1 — Always-on transmission pass triggered by `sun.glb` — **Confidence: HIGH**

| | |
|---|---|
| **Evidence FOR** | `sun.glb` has `KHR_materials_transmission`, `transmissionFactor: 1` (verified in the binary). `GLTFLoader.js:1205-1207` maps it to `material.transmission = 1`. `three.module.js:7997` routes it to `transmissive`; `:17250` unconditionally invokes `renderTransmissionPass`. The pass (`:17458-17580`) does a full-res MSAA half-float target clear + background render + **whole-opaque-scene re-render** + **MSAA resolve** + **full mipmap-chain generation**, all **inside `renderer.render()`** — exactly where the 1009 ms is. Sun added unconditionally (`Graph3D.tsx:1004-1007`). `transmissionResolutionScale` is `1.0` (full res) and never changed. Explains the doubled triangle count and its 2×87,184 swing (§6). Explains why **every** prior experiment failed (§21). Resolution-dependent but distance-independent — matches a *distant* view still being slow (§19). |
| **Evidence AGAINST** | It is present in Small View too, so it cannot by itself explain the Large-vs-Small *ratio*. Adds few draw calls (most objects are transparent), so it is a fixed+multiplier cost rather than a per-object one. Exact millisecond cost cannot be derived from source. |
| **Would prove/falsify it** | Set the sun material's `transmission = 0` and observe whether Large View becomes dramatically smoother. Binary, one line, no visual redesign. |

### #2 — Early-Z destroyed on all 240 node bodies (`Graph3D.tsx:2345`) — **Confidence: HIGH**

| | |
|---|---|
| **Evidence FOR** | `mat.transparent = true` set unconditionally on every material of every node child, on mount and whenever `activeId`/`adjacency` change — *including with nothing selected*. Moves ~240 bodies into the back-to-front transparent queue (`three.module.js:7999`), so occluded bodies still run 48–96 `sin`-based hashes per covered pixel (`shaders.ts:34-46, 85-95, 126-137`). This is the term that scales ×26.7 between Small and Large. Also explains the transparent-sort reshuffle behind the flicker (§15). |
| **Evidence AGAINST** | At a *distant* camera each body covers few pixels, capping total fragment work. Does not by itself explain a 1-second `render`. |
| **Would prove/falsify it** | `?galaxyDiag=1&bodies=0` — an **existing** switch that removes bodies and macro spheres entirely. |

### #3 — Compounding additive-sprite overdraw with no early-Z — **Confidence: MEDIUM**

Sun corona (~1,290–1,680 world units, additive, `depthWrite:false`), ~240 node glow sprites,
journey halos, money sky, station aura. **Falsifiable via the existing `?galaxyDiag=1&glow=0`.**
Against: previous bloom/graphics experiments moved fill-rate knobs without effect.

### #4 — `scene.environment` PBR/IBL sampling on every Standard/Physical material — **Confidence: LOW-MEDIUM**

`Graph3D.tsx:779`. Adds per-pixel env sampling and a shader permutation to every macro sphere and
glTF model. Real but secondary; no existing switch isolates it.

### #5 — Per-frame link attribute re-upload — **Confidence: LOW**

`linkTube.ts:225-255`, ~1.04 MB/frame of `bufferSubData` inside `render()`. Plus the latent
geometry-dispose bug (§14). Real inefficiencies; ~2 orders of magnitude too small to be the cause.
Retained as cleanup, not as a suspect.

### Explicitly ruled out
Bloom (off, §4) · shader recompilation (`programs` stable) · lights (pool works) · points (§12) ·
triangle volume (§9) · draw-call count (§6) · GC (heap flat in reading 2) · our `tick` (2.7 ms) ·
raycaster (falsified on-device) · link budget (falsified on-device, now *explained*, §14) ·
DPR 2.8125 (never reaches the renderer, §18) · baked nebula/galaxy sprites (not live, §13).

---

## 23. Confirmed / High-Confidence / Unknown / Falsified (Part 21)

**Confirmed by source inspection (not inference):**
- `sun.glb` carries `KHR_materials_transmission`, `transmissionFactor: 1`.
- three.js r182 runs a full transmission pass whenever any material has `transmission > 0`.
- The sun is added to the scene unconditionally, in every view and tier.
- `EffectComposer` is created unconditionally and every frame routes through it.
- Bloom is off at rungs 0–5 and the draw-call reading independently confirms it.
- `Graph3D.tsx:2345` sets `transparent = true` on every node material unconditionally.
- Node fragment shaders execute 48–96 `sin`-based hashes per pixel.
- Link tubes are meshes (360 tris each), transparent, `depthWrite:false`.
- `info` is reset once per `render()`, so counters sum across both passes.
- The HUD's `dpr` is `window.devicePixelRatio`, not the renderer's ratio.
- `points: 5,910` decomposes exactly (§12).
- The star-light pool and the Stage 3 backdrop bake both work as designed.

**High confidence (strong inference, needs device confirmation):**
- The transmission pass is the single largest contributor to the 1009 ms.
- Opaque glTF geometry is being rendered twice (the 2×87,184 triangle swing).
- The flicker is low-FPS presentation + transparent-sort reshuffle, not a separate bug.
- The freeze is compounding: fixed transmission overhead × ×26 body scaling.

**Unknown / not determinable from source:**
- The exact millisecond split between the transmission pass and body fragment cost.
- The device's actual renderer pixel ratio (depends on persisted `localStorage` rung).
- The exact GPU model and its fill rate.
- Whether `WEBGL_multisampled_render_to_texture` is available (changes the transmission path).
- Actual per-model triangle counts in the glTF assets.

**Falsified:**
- "Pointer-interaction raycaster is the cause" — tested on-device, no effect; now *explained* (runs after `render()` returns).
- "Detailed-link count is the cause" — tested on-device, no effect; now *explained* (transparent → outside `opaqueObjects`).
- "Bloom/postprocessing is the cause" — bloom is off.
- "The app renders at DPR 2.8125" — clamped to ≤ 2.0 in two independent places.
- "Our JavaScript tick is the cause" — 2.7 ms, measured.

---

## 24. Single Recommended Next Experiment (Parts 21 + 22)

### Why not an existing switch

`perfDiag.ts` provides `?galaxyDiag=1` with `links`, `bodies`, `labels`, `glow`, `aux` — plus its
own on-screen fps overlay that is **independent of PerfHUD** (`mountGalaxyDiagOverlay`), which is
ideal here. **But none of these can disable the sun**: `shouldHideNodeChild` only classifies
children of *node* groups, and the sun is added directly to the scene at `Graph3D.tsx:1007`.
**No existing switch can isolate the #1 candidate.** Per instruction, a temporary diagnostic is
described but **NOT implemented**.

### The recommended change (one line — do not implement yet)

In `sun.ts`, inside the **already-existing** `model.traverse(...)` at lines 89-91 — the same
traverse that already sets `envMapIntensity = 0` on this exact material — additionally zero the
transmission:

```ts
if ("transmission" in mat) (mat as any).transmission = 0;
```

Why this is the right experiment:
- **One line, inside code that already runs and already mutates this material.** No new traversal, no new state, no new render path.
- **Completely binary.** `transmissive.length` becomes 0, so `three.module.js:17250` never calls `renderTransmissionPass`. The entire second scene render, MSAA resolve and mipmap chain vanish.
- **Trivially reversible.**
- **Minimal visual risk.** The sun remains fully emissive (`emissiveFactor` + emissive texture), keeps its additive corona sprite (`sun.ts:38-47`) and its `PointLight` (`:51`). Losing `transmission` removes a glassy refraction the user is unlikely to be able to identify — and the experiment's purpose is diagnosis, not shipping.
- **Isolates the one candidate no prior experiment could touch.**

Optionally it could be wired to a new `?galaxyDiag=1&sun=0` flag to match the existing convention,
but that is more code for the same signal; the one-liner is preferred for a clean A/B.

### Fallback, only if #1 comes back falsified

`?galaxyDiag=1&bodies=0` — an **existing, already-supported** switch that removes node bodies and
macro spheres, isolating candidate #2. Requires no code change at all.

### The user-facing protocol (qualitative first, no timing required)

> **What I changed:** one line that turns off a hidden "glass" effect on the sun. It should look
> almost exactly the same.
>
> **Test A — the main one.** Open Large View. Let it finish loading. **Don't touch it.** Just
> watch for ten or fifteen seconds. Then tell me which of these it is:
> - still freezing just as badly
> - a little better
> - noticeably smoother
> - dramatically smoother
> - basically smooth
>
> **Test B — only if it's actually usable.** Drag to spin the view around for a few seconds. Is it
> worse, the same, better, or dramatically better?
>
> **Optional.** If the Perf HUD is easy to open and copy at any point, send it. If it's fiddly or
> frozen, skip it — Test A is what matters.
>
> Also worth noting either way: **does the flickering stop?** If the freeze is fixed, the flicker
> should go away by itself.

**No precise timing. No capturing a moment during a freeze. No requirement to press Copy
immediately after an action.** Qualitative observation while the scene sits untouched is the
primary evidence, exactly as established for the previous experiment.

### Interpretation rules, agreed in advance

- **Noticeably / dramatically smoother while untouched → strong confirmation of #1.** Proceed to a
  permanent fix (which will be a considered decision about the sun's material, not this one-liner).
- **Essentially still frozen while untouched → strong falsification of #1.** Move to
  `?galaxyDiag=1&bodies=0` for candidate #2. This audit's §22 ranking survives either result.
- **Can't reliably tell → inconclusive.** Do not force a conclusion, and do not read a verdict out
  of noisy HUD numbers. Run the `bodies=0` test next regardless.

### A note on the user's own instinct (recorded deliberately)

The user described wanting the galaxy to work "like a game" — near things detailed, distant things
cheaper, clusters shown as names and shapes from far away. **That architecture is already largely
built**: the macro-LOD body swap at `MACRO_DIST`, the `MAX_VISIBLE_LABELS` cap with sector titles
taking over at distance, the orbit-update LOD banding (Stage 5), and the bounded detailed-link
model (Phase 2.1). **The instinct was right and the work was done.** What this audit found is
*why it isn't paying off*: a fixed, always-on, full-resolution second render pass that no LOD
system can reduce, sitting underneath all of it — plus a one-line bug that removes early-Z from
every body regardless of how far away it is. **Both are fixable without removing any of that
work, and without making the galaxy look cheaper.** That matters, because the stated requirement
has always been that better phones should look *better*, not that every phone should look worse.

---

## 25. Files Inspected

**Application source (read only):**
`packages/web/src/graph/perfStats.ts` · `perfDiag.ts` · `graphicsConfig.ts` · `adaptiveController.ts` ·
`bloom.ts` · `shaders.ts` · `nodeObject.ts` · `sun.ts` · `linkTube.ts` · `starfield.ts` ·
`deepSpace.ts` · `backdropBake.ts` · `skybox.ts` · `moneySky.ts` · `journeyHubs.ts` ·
`satellites.ts` · `visitors.ts` · `subAgents.ts` · `soumaya.ts` · `soumayaHelpers.ts` ·
`spaceStation.ts` · `effects.ts` · `orbits.ts` · `graph3dHelpers.ts` · `renderModel.ts` ·
`Graph3D.tsx` · `packages/web/src/components/PerfHUD.tsx` · `packages/web/src/App.tsx`

**Dependency source (read only):**
`node_modules/three/build/three.module.js` (r0.182.0) — render list classification `:7942-8064`,
`render()` `:17209`, transmission dispatch `:17250`, `renderTransmissionPass` `:17458-17580`,
`renderObjects` `:17436-17445`, `transmissionResolutionScale` `:15810`, MSAA `:13951`,
`checkShaderErrors` `:15703`, `info.autoReset` `:4336` ·
`node_modules/three/examples/jsm/loaders/GLTFLoader.js` `:611, :1165-1207` ·
`node_modules/three-render-objects/dist/three-render-objects.mjs` `:262-290, :578-640` ·
`node_modules/three-forcegraph/dist/three-forcegraph.mjs` `:1258-1292`

**Assets (binary header inspection only, not modified):**
all 9 `packages/web/public/*.glb` — `extensionsUsed` and material JSON.

---

## 26. Explicit Non-Changes

**No production source file was created, modified or deleted.** Specifically **not** changed:
audit logic · the raycaster · PerfHUD · graphics settings · link budgets · forces · geometry · LOD ·
materials · shaders · DPR · renderer settings · postprocessing · node construction · pointer
interaction. **No permanent instrumentation added. No refactoring. No optimisation.**

**Nothing committed. Nothing pushed. Nothing deployed.**

The only file created by this audit is this document,
`docs/specs/soumaya-galaxy-large-render-forensic-audit.md`.

The `enablePointerInteraction={false}` experiment from commit `a8d0c52` remains in the working
tree and on the branch, **deliberately not reverted** — reverting it is a separate decision, and
it should be bundled with whatever change follows this audit rather than churning the branch now.
