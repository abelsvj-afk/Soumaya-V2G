# Soumaya Galaxy — Render-Stall Forensic Trace (2026-09-10)

> **FORENSIC ONLY.** No production rendering behavior was changed in this pass — only
> read-only, pull-based instrumentation was added (see §E). Requested after real-device
> evidence (Samsung Xclipse 530 / Chrome 152 / Android, ANGLE-Vulkan/OpenGL ES 3.2)
> showed `render` p50 1426ms / p95 2897ms with only 1,034 draw calls, 530K triangles, 31
> programs, and tick p50 2.6ms — decisively ruling out ordinary scene-complexity
> reduction (draw calls, link budget, macro LOD, D3 simulation) as the driver, since
> every one of those had already been cut without moving `render` time. GPU timer
> queries (`EXT_disjoint_timer_query_webgl2`) are **unsupported on this exact
> device/browser combination** — a real, confirmed negative result that closes off the
> most direct CPU-vs-GPU instrument for this specific device (may still work on other
> Android/Chrome/GPU combinations).

## A. Exact render lifecycle (traced from source, not assumed)

The originally-documented "two independent RAF loops" model is **correct**, but the
inner one is more specific than previously described. Two genuinely separate,
uncoordinated `requestAnimationFrame` loops run concurrently on the same thread:

**Loop 1 — `3d-force-graph`'s own loop** (`node_modules/3d-force-graph/dist/3d-force-graph.mjs:261-270`),
uncapped, drives the actual render:

```
requestAnimationFrame(_animationCycle)
  -> _animationCycle(state):
       state.forceGraph.tickFrame()   // three-forcegraph: bounded D3 tick (cooldownTicks=30) + node/link position sync
       state.renderObjs.tick()        // three-render-objects — see below
       state.animationFrameRequestId = requestAnimationFrame(_animationCycle)
```

`renderObjs.tick()` (`node_modules/three-render-objects/dist/three-render-objects.mjs:262-296`):

```
tick(state):
  state.controls.update(dt)                                    // OrbitControls/FlyControls damping
  state.postProcessingComposer
    ? state.postProcessingComposer.render()                     // ALWAYS this branch — see §B
    : state.renderer.render(state.scene, state.camera)
  state.extraRenderers.forEach(r => r.render(scene, camera))    // empty array in this app — confirmed, §C.6
  // throttled raycaster hover check (pointerRaycasterThrottleMs)
  state.tweenGroup.update()                                      // camera-flight tweens
```

`postProcessingComposer.render()` (`node_modules/three/examples/jsm/postprocessing/EffectComposer.js:214-276`)
with exactly one enabled pass (`RenderPass`, bloom currently off per the resolved rung):

```
composer.render():
  for each enabled pass (here: just RenderPass):
    pass.renderToScreen = true        // it's both first AND last enabled pass
    pass.render(renderer, writeBuffer, readBuffer, dt, maskActive)
  renderer.setRenderTarget(currentRenderTarget)   // restore, a no-op here (already null)
```

`RenderPass.render()` (`node_modules/three/examples/jsm/postprocessing/RenderPass.js:121-189`):

```
renderer.setRenderTarget(null)   // renderToScreen === true -> straight to the default framebuffer
renderer.clear(...)
renderer.render(this.scene, this.camera)   // <- the exact call perfStats.attachRenderer patches
```

**Loop 2 — Graph3D.tsx's own loop** (`packages/web/src/graph/Graph3D.tsx:1368-1369`), FPS-capped,
completely independent scheduling:

```
tick = () => {
  raf = requestAnimationFrame(tick)     // re-registers every call, even on a capped/skipped frame
  if (nowMs - lastFrameMs < 1000/cap - 1.5) return   // FPS-cap gate
  beginTick()
  /* labels, LOD swap, orbits.update(), spatial grid, star-light pool reassignment, sector titles */
  endTick()
}
```

These two loops are **not chained** — Graph3D never registers an `onEngineTick`
callback (confirmed: zero matches in the file), so its own scene-mutation work and
`3d-force-graph`'s render call are scheduled by two separate, self-re-registering
`requestAnimationFrame` calls that happen to run on the same event loop. Their
relative order within a given vsync is whichever called `requestAnimationFrame` first
the previous frame — not fixed by any code in this app.

## B. Answers to the 12 specific questions

1. **`renderer.render()` calls per visual frame: exactly ONE**, with bloom off (the
   current resolved rung/tier) — traced end-to-end above, single call site inside
   `RenderPass.render()`.
2. **EffectComposer passes: 1** (`RenderPass` only) with bloom off. `addBloom()`
   (`bloom.ts`) is the only thing that would add a second (`UnrealBloomPass`, itself
   internally a chain of ~5 blur sub-render-target passes) — not currently active per
   the resolved rung.
3. **Render targets/framebuffers bound:** with only `RenderPass` enabled and marked
   `renderToScreen` (true because it's both first and last enabled pass),
   `renderer.setRenderTarget(null)` is called — rendering goes **directly to the
   default (screen) framebuffer**, never touching the composer's own buffers at
   runtime. **However** — real finding, not previously documented — `EffectComposer`'s
   constructor (`EffectComposer.js:63-77`) **unconditionally allocates two full-canvas-size
   `HalfFloatType` `WebGLRenderTarget`s at construction**, regardless of whether any
   pass beyond the initial `RenderPass` is ever added. This happens once, at renderer
   init, for every session — bloom on or off. New instrumentation (§E) reads the
   *actual* width/height/pixelRatio/type off this exact device's `renderTarget1` rather
   than assuming it from source.
4. **Is postprocessing executed when "disabled"?** Infrastructure: yes (see #3 — two
   idle HalfFloat buffers always exist). Execution: no extra GPU work per frame — with
   only `RenderPass` enabled, the composer's loop still does exactly the same single
   `renderer.render(scene, camera)` call an unadorned setup would do.
5. **Does any pass render the scene more than once?** No, with bloom off (confirmed by
   the same trace). Bloom, if enabled, would add real repeat/downsample renders —
   not the current configuration and not what these device readings measured.
6. **Does three-render-objects have multiple RAF/render loops interacting?**
   Reframed by this trace: `three-render-objects` itself owns **no** RAF loop — its
   `tick()` is a plain method invoked externally, once per `_animationCycle` call
   (`3d-force-graph`'s own driver). The real answer is Loop 1 vs. Loop 2 in §A: two
   independent, uncoordinated RAF loops exist, but neither is inside
   `three-render-objects` itself. `state.extraRenderers` (a real hook for additional
   overlay renderers, e.g. `CSS2DRenderer`) is confirmed **empty** — this app never
   populates it (`grep -rn "extraRenderers" packages/web/src` → zero matches).
7. **Any renderer synchronization (readPixels/finish/flush/getParameter/framebuffer
   checks) in the render path?** None found in production code. Confirmed by repo-wide
   grep: zero occurrences of `.finish()`/`.flush()` anywhere in `packages/web/src`;
   `getParameter(` appears **only** in `perfStats.ts`'s own diagnostic code
   (`getGpuInfo()` — one-time, cached; the GPU-timer-query poll, which explicitly
   checks `QUERY_RESULT_AVAILABLE` before ever touching `QUERY_RESULT`, never blocking).
   This rules out an **explicit** synchronous readback in our own code as the cause. It
   does **not** rule out an **implicit** driver-level stall (ANGLE's Vulkan backend
   deciding to block the CPU on its own, e.g. for command-buffer/queue-depth reasons)
   — that class of stall is invisible to any JS-level instrumentation and is exactly
   why GPU timer queries were the next step (unavailable on this device, per the report).
8. **Can render-time resource creation/upload/compilation occur?** Two sub-findings:
   - `programs: 31` was a single snapshot; a single reading can't say whether that
     number is stable or churning between polls. New instrumentation (§E) tracks this
     directly (`programsChurnCount`) — a non-zero value on the next real-device read
     will directly confirm or rule out ongoing shader recompilation.
   - The reported reading had **`labels: 0`** (zero visible labels at capture time),
     which rules out label-canvas-texture creation/upload as a contributor to *that
     specific* measurement (no label textures were being built at that moment).
9. **Transparent objects submitted:** not previously measured — `renderer.info`
   doesn't split opaque vs. transparent counts. New instrumentation (§E) adds a
   `transparentObjects` count via the existing pull-based `GalaxyCounts` mechanism.
10. **Program/material switches:** not directly exposed by `renderer.info` (it reports
    the current *total* compiled-program count, not a per-frame switch count, which
    would require patching `WebGLState.useProgram` — a larger, more invasive change
    than this pass's "instrumentation only" scope justifies; flagged as the natural
    follow-up instrument if `programsChurnCount` (item 8) comes back non-zero).
11. **Exact call stack, RAF → `renderer.render()`:** written out in full in §A.
12. **What could cause ANGLE/Vulkan to block synchronously for 1-3s, given #7 rules out
    an explicit call in our own code?** See ranked hypotheses in §C.

## C. Ranked root-cause hypotheses

**#1 — Program/material-state switch cost on a tile-based mobile GPU, not raw
draw-call/triangle volume.** 31 distinct compiled programs is a lot for ~1,034 draw
calls (≈33 draw calls per unique program on average) — meaning the renderer is very
likely interleaving many different shader/material states rather than batching same-
material draws together (no batching/instancing exists in this renderer today, a fact
already established in earlier sessions and confirmed unchanged). On tile-based
mobile GPUs, a program or render-state change can force a tile flush/resolve; cost
scales with the number of *switches*, not the number of draws or triangles — which
would explain, precisely, why cutting link budget/draw calls/geometry counts (which
reduce volume but not necessarily the number of distinct programs in play) produced no
measured improvement. **This is the strongest candidate because it is the only
hypothesis that is simultaneously consistent with every negative result so far**
(low triangle/draw-call counts, no explicit sync call, tick staying fast, GPU-fill-rate-
style fixes not helping).

**#2 — Xclipse 530 / ANGLE-Vulkan driver immaturity for this specific shader/state
mix.** The Xclipse 530 is a comparatively new, RDNA-based mobile GPU with a less
battle-tested Android driver stack than Adreno/Mali. A driver-level implicit
synchronization or pathological code path (e.g. around descriptor-set/pipeline-state
changes under Vulkan) reacting badly to this app's exact program/material diversity is
plausible and would look, from JS, exactly like what's being measured — but it's
unverifiable without vendor-level GPU profiling tools this sandbox doesn't have
access to, and no corroborating public report of this exact symptom was found.

**#3 — The always-allocated idle `EffectComposer` buffers (§B.3) contribute driver-side
memory/bandwidth pressure even though they're never written to per frame.** Lower
confidence than #1/#2 — two extra idle render targets sitting in VRAM is a real,
now-measured cost, but it's a *constant* one-time allocation, not an obvious
mechanism for a *per-frame* multi-second stall. Listed because it's concrete and
directly falsifiable (see §D) rather than because the evidence points at it strongly.

## D. Next surgical experiment (falsifies hypothesis #1)

**Run the already-shipped render-isolation sweep** (Settings → "🌌 Galaxy render
isolation sweep", from the previous pass) and, on the SAME device, additionally read
the new `programs`/`churn` and `transparent` HUD rows during each step, particularly
the **"bodies off"** step. Node/planet/star bodies are the primary source of distinct
procedural shader programs in this scene (star vs. planet vs. moon/asteroid materials,
each independently constructed — `nodeObject.ts`); if hypothesis #1 (program/state-
switch cost) is correct, disabling bodies should cause `render` time to collapse far
more than the already-tried link/label/glow/aux categories did, and `programs` should
drop sharply in the same step. If disabling bodies does **not** collapse `render` time
proportionally more than the other categories, hypothesis #1 is falsified and the
investigation should move to hypothesis #2/#3 (or a GPU-timer-query-capable device, to
finally get a direct CPU-vs-GPU split this exact device can't provide).

Concretely, the next real-device report should include, for the sweep's "bodies off"
step specifically: `render p50`, `programs`, `churn`, and `transparent`, compared
against the same step's baseline — no further code changes needed to gather this;
the sweep and this instrumentation are both already shipped.

## E. Instrumentation added this pass (read-only, no behavior change)

- `perfStats.ts` — `programsChurnCount`: increments once each time `renderer.info.
  programs.length` differs between two consecutive `snapshot()` polls (the existing
  2Hz HUD cadence) since the last `reset()`. Zero added per-frame cost — both reads
  happen only inside `snapshot()`, never either render loop.
- `Graph3D.tsx` (`registerGalaxyCounts` provider) — `transparentObjects`: a
  `scene.traverse()` count of objects with a `transparent: true` material, reusing the
  exact traversal pattern the hover-highlight effect already runs elsewhere in this
  file. Pull-based — only runs when `perfStats.snapshot()` is polled, never per frame.
- `Graph3D.tsx` (same provider) — `composerBuffers`: the ACTUAL width/height/pixelRatio/
  color-type of the EffectComposer's `renderTarget1`, read directly off this device's
  real composer instance rather than assumed from source.
- `PerfHUD.tsx` — surfaces all three (churn count on the existing `programs` row, a new
  `transparent` row, and a composer-buffers line in the copy-to-clipboard text) so the
  next real-device reading carries this data with zero extra steps beyond what's
  already being done (open the HUD, copy).

No rendering behavior, LOD threshold, budget, or material property was changed.
