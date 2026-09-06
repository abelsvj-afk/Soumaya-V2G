# SOUMAYA GALAXY PERFORMANCE AUDIT — Round 2

> Audit-only. No code changed. Follows the earlier Galaxy Performance Program (Stages 0–8,
> shipped this session: Perf HUD instrument, dead-knob wiring, per-frame allocation cleanup,
> backdrop cubemap bake, star-light pool + shader diet, frustum/orbit LOD, adaptive quality
> controller, label/glow VRAM fix, asset-pipeline compression). This audit's job is to verify
> what that program actually left in place, find what it missed, and investigate the
> still-reported square/rectangular glow artifact. **Per the mission's own instruction and this
> repo's mandatory workflow, this document stops at audit + recommendation — no implementation
> until reviewed.**

## 1. Current rendering architecture

Galaxy is `packages/web/src/graph/Graph3D.tsx` (~3000 lines), wrapping `react-force-graph-3d`
(three.js under the hood) inside one large mount-time `useEffect` (`[]` deps — runs once).
Scene construction, event wiring, and the animation loop all live inside that single effect
closure; imperative refs (`dataRef`, `nodeThreeObjCacheRef`, `starLightPoolRef`,
`spatialGrid`, etc.) bridge React state into the three.js scene without re-running the effect.
Peripheral visual systems (Sun, Waystation, starfield, deep-space backdrop, Journey hubs,
Money-sky, satellites, visitors, sub-agents, the Soumaya ship) are each their own module under
`packages/web/src/graph/`, built once (or rebuilt on a data-change event) and updated centrally
by Graph3D's own tick via a shared `userData.update(now)` convention — not their own
independent render loops, with two confirmed exceptions (`engineAudio.ts` and a transient
volume-fade interval in `audio.ts`, both audio-only, not scene-related).

## 2. Current frame lifecycle

`tick()` (Graph3D.tsx:1184–2044) re-arms via `requestAnimationFrame`, then applies an FPS-cap
gate (1189–1193) — frames that don't pass the cap do zero scene work. Past the gate, in order:
several independently-timed, throttle-gated blocks (task sync ~3Hz, fuel-burn flush ~0.25Hz,
link-style refresh event-driven on camera-delta, idle shimmer, cold-link scan 0.1Hz, visitor-log
flush 0.05Hz, adaptive-controller sample 0.5Hz), then unconditional per-frame work: orbit LOD
update, cinematic/focus/bloom easing, station/ship world-position reads, satellite/visitor/
sub-agent updates, camera-follow tracking, background-scenery `userData.update` dispatch,
frustum/matrix rebuild, spatial-grid visibility (internally throttled), label-cap recompute
(throttled every 6 frames), star-light pool reassignment (throttled every 6 frames), the **main
per-node loop** over `graphGroup.children` (unthrottled, every passing frame), ship/audio
update, follow-camera rig, position sync back to react-force-graph, `controls.update()`,
`endTick()`.

## 3. CPU bottlenecks (confirmed, with evidence)

- **`soumaya.ts` (the ship)** never builds an id→node lookup map, unlike every sibling system
  (`satellites.ts`, `visitors.ts`, `subAgents.ts` all cache a 5Hz-refreshed `Map`). Multiple
  `.find()` calls scan the full node array. Some are confirmed throttle-gated (the `pickTaskT`
  5Hz gate covers lines ~870/885/899; the `taskSyncT` 3Hz gate covers `getTasks()`'s internal
  `.find()`s at ~1412+). **Others (roughly lines 558, 637–638, 653, 692, 928) were not
  cross-verified as throttled by either audit pass** — this needs one targeted follow-up read
  before scoping a fix, flagged honestly rather than asserted. Separately and unambiguously
  confirmed: `soumaya.ts`'s motion-curve branches allocate fresh `THREE.Vector3()`s at dozens
  of call sites, every frame the ship is in motion (which is most of the time) — Graph3D's own
  tick loop deliberately avoids exactly this pattern via hoisted scratch vectors; `soumaya.ts`
  was missed.
- **`journeyHubs.ts` / `moneySky.ts` sprite updates run fully unthrottled and unconditionally
  every frame**, scaling O(n) with Journey/bill count, with **no cap** (unlike `subAgents.ts`'s
  `MAX_TENDERS = 5`), **no distance check**, and **no LOD treatment** from `orbits.ts` (these
  overlay rings never touch `orbits.ts` at all — their positions are set once at construction).
  Worse: the update `forEach` keeps running even when the group has been set `.visible = false`
  by a Lens/View isolate — three.js visibility only gates the draw call, not this manual
  per-frame trig work, so activating a Lens/View saves GPU draw calls for these layers but not
  their CPU cost.
- **`workNodes` filter (Graph3D.tsx:1352–1354)** re-scans the *entire* node array with `.filter()`
  every single frame whenever a cluster/Lens/View isolate is active, feeding the (correctly
  throttled) `satellites`/`subAgents`/`visitors` updates a freshly-rebuilt array every frame
  regardless — their own internal throttling can't help, since the array identity itself churns
  every frame.
- **`subAgents.ts`** does a linear `.find()` every frame per unit (only 2 named units today, so
  O(2n) — small in absolute terms, but a confirmed regression of the exact pattern its siblings
  already solved via id-map caching).
- **Visitor-hazard build (Graph3D.tsx:1377–1386)** allocates a fresh `Vector3` per active
  visitor, every frame, unthrottled (small — visitor count is capped — but real).
- **Follow-camera rig (Graph3D.tsx:1908–2014)** allocates several fresh `Vector3`s per frame
  whenever the user is in any follow mode (ship/station/figurine) — state-gated, not always
  active, but a real allocation source whenever it is.
- **Link color/width (`shouldRenderLink`, Graph3D.tsx:2402–2428)**: the distance/hysteresis skip
  is only reached when a node is actively selected/focused (`activeId !== null`). In ordinary
  browsing with nothing selected, *every* link gets the full emotion-color-blend + activity-flash
  + opacity computation whenever a refresh fires. This isn't a 60Hz cost (refresh itself is
  throttled to camera-delta > 35 units AND ≥250ms), but it means the "skip far links" logic the
  earlier program built essentially never engages in the most common state.

**Confirmed NOT a bottleneck** (i.e., don't re-fix these): `scene.traverse()` is absent from the
hot path entirely (removed by the earlier program); the star-light pool, orbit LOD, label-cap
sticky hysteresis, backdrop-bake per-frame cost (a single rotation increment), and texture
caching are all present, correct, and complete as designed.

## 4. GPU bottlenecks

No new evidence of a GPU-specific bottleneck beyond what the earlier program already targeted
(fill-rate via the cubemap bake, shader complexity via the octave "diet", geometry via
per-tier segment counts). The one credible GPU-adjacent issue found this round is visual, not a
performance cost per se: **PBR environment-map reflections** on the Waystation's near-mirror
fallback material (`metalness: 0.9, roughness: 0.1`) and on equipped figurine models, which
never received the Sun's `envMapIntensity = 0` treatment (see §10). No `InstancedMesh` exists
anywhere in `packages/web/src/graph` — confirmed the earlier decision to decline macro-body/glow
instancing (per-node unique procedural textures + continuously-animated link colors) still
holds; nothing has since silently reintroduced a case for it.

## 5. React bottlenecks (confirmed, concrete, fixable)

- **`App.tsx:690`** — an unconditional `console.log` fires on *every single App.tsx render*,
  allocating a fresh object literal purely for the log call. No dev-flag guard.
- **`App.tsx:2156`** — `memories={(data.nodes as GraphNode[]).filter(n => n.kind !== "action")}`
  passed into `Observatory` recreates a filtered array on every App.tsx render, not memoized
  (unlike the correctly-memoized `loggedToday`/`pilotSpeed` right next to it).
- **`Observatory.tsx`** — `recent` (sort+slice), `dueReminders` (filter), and an inline
  `dailyQuests(...)` call are all unmemoized, re-running on every render — compounding with the
  point above whenever Observatory is mounted.
- **`useCountUp`/`usePolledCount` live inside App.tsx's own state**, not a leaf component (unlike
  `PerfHUD`, which is correctly self-contained). Every 30s/60s/120s poll and every ~600ms
  count-up tween forces a *full App.tsx re-render*.
- **`Graph3D` is not wrapped in `React.memo`.** Since its internal scene-setup effect runs once
  (`[]` deps) and several callback props (`onSoumayaClick`, `onGalaxyEntityClick`) are already
  only ever read from the initial-mount closure (a pre-existing, currently-harmless staleness
  tolerance, since they only call stable setters today), every one of the fast-cadence state
  changes above re-executes `Graph3D`'s full function body and re-creates the
  `<ForceGraph3D>` JSX with fresh inline props — pure reconciliation overhead on every fuel poll,
  suggestion-count poll, and count-up tween frame.

**Confirmed NOT a bottleneck**: `data`/`view` identity is already stable (only changes on a real
graph refetch); `NodeInspector`'s neighbor computation is correctly memoized and benefits from
that stability; labels are three.js `Sprite`/`CanvasTexture` objects, not React/DOM, with
correct text-keyed caching; `PerfHUD` and `GalaxyViews`/`LensesPanel` are both correctly
isolated/memoized already.

## 6. Memory/allocation bottlenecks

Beyond the CPU-bottleneck allocations already listed (`soumaya.ts`'s per-frame `Vector3`s,
visitor-hazard array, follow-camera rig), no new systemic GC pressure was found. The earlier
program's Stage 2/7 work (hoisted scratch vectors in the main tick, refcounted texture caches)
remains intact and effective per this audit's read of the current code.

## 7. Object/material/light counts

Per fully-rendered body (from `nodeObject.ts`'s `makeNodeObject`):

| class | full-detail mesh | ring | glow | belt | macro (hidden) | label |
|---|---|---|---|---|---|---|
| asteroid | icosahedron, 0 detail | – | – | – | 1 | 1 |
| moon | sphere 24×24 | – | – | – | 1 | 1 |
| planet | sphere 24×16 | – | 1 | – | 1 | 1 |
| gas_giant | sphere 24×16 | 0–1 (1/5 odds) | 1 | – | 1 | 1 |
| giant | sphere 24×16 | – | 1 | – | 1 | 1 |
| star/supergiant | sphere 32×24 | – | 1 | 1 | 1 | 1 |

Every body also always carries one macro-LOD sibling mesh (fixed 14×14 segments regardless of
tier or class), visibility-toggled by camera distance. Geometries are deduplicated via a
size-keyed cache, so buffer count scales with distinct mass-derived sizes, not raw node count.
**Star-light pool**: fixed at 3/4/6 real `PointLight`s by `detailTier`, created once, never
added/removed — only intensity-zeroed when unused, confirming `NUM_POINT_LIGHTS` truly never
changes. One unresolved edge case: if the adaptive controller's `detailTier` changes mid-session,
the pool array itself is not evidenced to resize — likely a non-issue since the controller only
live-applies `pixelRatio` today (see §8), but worth a one-line confirmation before assuming.

## 8. Existing optimizations (confirmed intact, do not duplicate)

Star-light pool (Stage 4) · shader-octave + geometry-segment "diet" per tier (Stage 4) ·
backdrop cubemap bake with only a per-frame rotation increment (Stage 3) · earlier
frustum-cull early-return + phase-continuous distance-banded orbit LOD (Stage 5) · adaptive
quality controller sampling `perfStats` every 2s and climbing/descending a rung, live-applying
`pixelRatio` (Stage 6; `detailTier`/bloom changes require a reload — a documented, intentional
limitation, not a bug) · refcounted label/glow texture caching with zero regeneration unless
text actually changes (Stage 7) · node-object whole-body caching keyed by a composite
content hash · `satellites.ts`/`visitors.ts`'s 5Hz id-map caching eliminating per-frame
`.find()` scans · the label-cap's sticky (0.85-factor) hysteresis preventing boundary flicker ·
`perfStats.ts`/`PerfHUD.tsx`, a fully React-isolated, allocation-free instrument.

## 9. What is already working (do not touch)

Everything in §8, plus: `data`/`view` reference stability, `NodeInspector`'s memoized neighbor
computation, `GalaxyViews`/`LensesPanel`'s own memoization, diagnostics logging (properly gated
and bounded, not in the hot path).

## 10. Known visual rendering defects — the square/rectangular glow artifact

**Strong, evidence-based hypothesis, not yet visually confirmed (this sandbox cannot render):**
the artifact is a PBR environment-map reflection, not a sprite/glow-quad edge. All canvas-drawn
glow gradients (node glow, Sun corona, Waystation aura) are single centered radial gradients
that already clamp to transparent at their edge — not the cause. `Graph3D.tsx` builds one
scene-wide blurred `RoomEnvironment` PMREM map for all glTF PBR models; a comment there already
documents that a *sharp* version of this map was the original Sun bug ("reflects panels as
crisp, visible rectangles… the 'square block of light' artifact"), fixed two ways: raising the
global blur sigma, **and** a Sun-specific second fix zeroing `envMapIntensity` on every material
of the Sun's model. **The Waystation never received that second, per-model fix** — and its
fallback material is a near-mirror (`metalness 0.9, roughness 0.1`), making it a strong
candidate to still show the same artifact today, relying only on the weaker global blur. Equipped
figurine models have the identical gap (`envMap` assigned with no `envMapIntensity` override).
This matches the mission's own observation that the artifact may not be Sun-specific this round.
**Do not "fix" this by removing glow or lowering blur further — the fix, if this hypothesis holds
once visually confirmed, is applying the Sun's exact existing `envMapIntensity = 0` pattern to
the Waystation and figurine loaders, which costs nothing and changes no other visual.**

Also flagged, matching the mission's separate concern: nothing in the current code makes an
object "suddenly go dark" purely from crossing a label threshold — label visibility and body
brightness/macro-LOD are governed by separate systems; this is not evidenced as a live defect.

## 11. Benchmark methodology

**No new instrumentation needs to be built.** `perfStats.ts` + `PerfHUD.tsx` (Stage 0) already
provide exactly what's needed: tick/render/present percentiles (p50/p95/p99, nearest-rank),
dropped-frame %, `renderer.info` draw-call/triangle/texture/program counts, a plain-language
CPU/GPU-bound diagnosis, and heap-growth-rate — accessible via `?perf=1` or the Settings toggle,
polling at 2Hz with zero React leakage. The methodology for a real benchmark is: open the HUD,
let it settle, record its percentiles for each of the scenarios below, on each target device
class, before and after any change.

## 12. Baseline measurements

**Not available from this sandbox** — this environment cannot render a WebGL scene or reach a
real device. Per the mission's own instruction, this is stated plainly rather than invented.
The instrument to capture them already exists (§11); what's missing is a **recorded run**, which
must happen on real hardware (the standing constraint already documented elsewhere in this
project: Fly billing hold blocks a fresh deploy, and this sandbox has no GPU/browser). The
scenarios that should be recorded once a deploy is reachable: empty galaxy, light galaxy (~50
nodes), normal galaxy (current typical size), 500 nodes, 1000+ nodes (synthetic if needed),
sustained camera orbit, a zoom sweep, node selection, Observatory↔Galaxy transition, and a Lens/
View toggle (to quantify the `workNodes` per-frame filter cost from §3).

## 13. P0 / P1 / P2 / P3 findings

**P0 — Critical**
- None found. The prior program already closed every architectural-scale bottleneck (whole-scene
  traversal, unbounded light count, unthrottled shader recompiles, full re-blend of the backdrop
  every frame). Nothing at that scale remains.

**P1 — High impact, low/moderate visual risk**
- `journeyHubs.ts`/`moneySky.ts` unthrottled, unconditional, unbounded per-frame sprite updates
  (including while invisible under a Lens/View).
- `workNodes` full-array `.filter()` every frame while any cluster/Lens/View isolate is active.
- `soumaya.ts`'s per-frame `Vector3` allocations in its motion-curve branches.
- `Graph3D` missing `React.memo`, combined with `useCountUp`/`usePolledCount` living in App.tsx
  forcing full-tree re-renders on every poll/tween tick.
- The Waystation/figurine `envMapIntensity` gap (visual defect, not a frame-time cost, but
  P1-equivalent priority since it's cheap, safe, and directly requested).

**P2 — Medium**
- `subAgents.ts`'s per-unit linear `.find()` (small absolute cost, 2 units, but a real regression
  of an established pattern).
- `App.tsx:690`'s unconditional `console.log`; `App.tsx:2156`'s unmemoized `memories` filter;
  `Observatory.tsx`'s unmemoized sort/filter/dailyQuests.
- Link color/width's selection-gated (not distance-gated in the common case) skip.
- Visitor-hazard per-frame `Vector3` allocation; follow-camera-rig per-frame allocations.

**P3 — Micro-optimization, defer until P1/P2 are done**
- The unresolved question of exactly which `soumaya.ts` `.find()` call sites are throttled vs.
  not (needs one targeted read, not a redesign).
- The adaptive-controller/star-light-pool mid-session `detailTier`-resize edge case.
- Macro-LOD's fixed 14×14 segment count regardless of tier (could drop further on `performance`
  tier, unmeasured whether it matters).

## 14. Recommended optimization sequence

1. Throttle + distance-gate `journeyHubs.ts`/`moneySky.ts` sprite updates, and stop running them
   while their group is invisible (mirrors patterns already proven elsewhere in this exact
   file — no new architecture).
2. Fix `workNodes` to only rebuild when the cluster/isolate set's identity actually changes,
   not every frame.
3. Apply the Sun's existing `envMapIntensity = 0` pattern to the Waystation and figurine
   loaders (near-zero risk, directly addresses §10).
4. Hoist `soumaya.ts`'s per-frame `Vector3` allocations to scratch vectors, matching the rest of
   the tick loop's own established convention.
5. Give `subAgents.ts` the same 5Hz id-map its siblings already have.
6. React-side cleanup: remove/gate the stray `console.log`, memoize the `memories` filter and
   Observatory's derived arrays, and evaluate wrapping `Graph3D` in `React.memo` (with a
   comparator that ignores the props already proven safe to go stale).
7. Only after the above are measured: revisit whether `useCountUp`/`usePolledCount` should move
   out of App.tsx's own state into leaf components (a larger, more structural change).

This follows the mission's own preferred order (remove per-frame waste → event-driven → object/
light overhead → React rerenders → allocations → culling/LOD → only then deeper rendering
architecture) — nothing here reaches for instancing or a renderer rewrite, since no evidence
supports needing either.

## 15. Files likely to change (implementation phase, not this one)

`packages/web/src/graph/journeyHubs.ts`, `packages/web/src/graph/moneySky.ts`,
`packages/web/src/graph/Graph3D.tsx` (the `workNodes` filter and the `userData.update` dispatch
site), `packages/web/src/graph/soumaya.ts`, `packages/web/src/graph/subAgents.ts`,
`packages/web/src/graph/sun.ts` (reference pattern only, not modified),
`packages/web/src/graph/spaceStation.ts`, `packages/web/src/graph/graph3dHelpers.ts`
(figurine loader), `packages/web/src/App.tsx`, `packages/web/src/components/Observatory.tsx`.

## 16. Explicitly protected visual behaviors

Sun appearance and corona · Waystation model and aura (glow itself, not the reflection bug) ·
planet/gas-giant/giant glow and ring odds · nebula/starfield/milky-way/spiral-galaxy live motion
(all Points-based, untouched by the earlier bake and not to be touched now) · star corona and
asteroid belt · label readability, fade behavior, and the sticky visible-label cap · selection
highlighting · camera movement and zoom feel · macro-LOD swap smoothness · orbit motion
continuity · Journey-hub and Money-sky visual identity and their existing pulse/twinkle/shiver
animations (only their *update cadence*, not their appearance, is in scope) · Observatory's
current layout and content · overall object density — no proposed change in this audit reduces
how many bodies exist or are visible at once.

## 17. Risks

Throttling `journeyHubs`/`moneySky` updates risks visible stutter in their pulse/twinkle
animation if the chosen interval is too coarse — mitigate with the same phase-continuous
banked-time technique `orbits.ts` already uses, not a naive skip. The `envMapIntensity` fix is
low-risk by construction (it's the literal fix already proven on the Sun) but must be visually
verified on a real device once reachable, same as every other visual change this project has
shipped under the standing Fly billing-hold constraint. `React.memo` on `Graph3D` carries the
usual risk of accidentally freezing a prop that *does* need to reach the imperative scene late —
requires enumerating every prop and confirming which are read via refs (safe) vs. effect
dependencies (must stay reactive) before writing the comparator.

## 18. Expected performance impact

Journey-hub/money-sky throttling and the `workNodes` fix should be the most measurable CPU wins
for anyone with many Journeys/bills or an active Lens/View — currently unbounded and directly
proportional to that count. The React-side fixes reduce reconciliation overhead proportional to
poll/tween frequency (every 30–120s plus ~600ms tweens) — meaningful for perceived jank during
those windows, not raw FPS. None of these should move GPU-bound frame time, since none touch
draw calls, shaders, or texture resolution — confirming this round's bottlenecks are CPU/React,
not GPU, though this cannot be stated with certainty without the on-device measurement in §12.

## 19. What should NOT be optimized right now

Anything already covered in §8/§9. Instancing (no measurement supports it, and per-node visual
uniqueness makes it materially harder, per the earlier program's own explicit decision).
Further shader-octave/geometry-segment reduction (already tuned per tier; no new evidence this
is a bottleneck this round). The adaptive controller's live-vs-reload-only knobs (a deliberate
scope decision from Stage 6, not revisited here without new evidence it's insufficient).

## 20. Proposed first isolated implementation

**Smallest, highest-confidence, lowest-visual-risk starting point:** items 1–3 of §14 together
— (a) throttle + visibility-gate the Journey-hub/Money-sky sprite updates using the same
banked-time technique already proven in `orbits.ts`, (b) fix the `workNodes` rebuild to be
event-driven off the actual cluster-set identity instead of every frame, and (c) apply the
Sun's own `envMapIntensity = 0` fix to the Waystation and figurine loaders. All three are
small, isolated, individually revertible, touch no shared/locked architecture, and directly
address the mission's two most concrete asks (a real CPU hotspot with no cap, and the
still-reported glow artifact) without any visual redesign.

## Final verdict: STOP FOR REVIEW

Per this repo's own mandatory workflow and the mission's explicit instruction — no
implementation in this pass. This document is the audit; §20's proposal is offered as the
recommended first isolated change, pending approval.
