# Soumaya Galaxy — Large-vs-Small View Workload Differential Audit

> **This is an audit-only document. No production rendering changes were made.**
> No source files were edited. No commit was created. This document supersedes nothing —
> it synthesizes and cross-verifies five prior audits already in this repo
> (`soumaya-galaxy-charge-force-audit.md`, `soumaya-galaxy-cache-disposal-audit.md`,
> `soumaya-galaxy-react-prop-identity-audit.md`, the Round-4 data-dependent-rendering audit
> behind `52d1abb`, and `soumaya-galaxy-rendering-architecture-audit.md`) plus the sandboxed
> isolation-diagnostic run from the immediately preceding task, plus four new, targeted
> read-only agent passes and a direct `git show` of the seven named commits. Every prior
> document's conclusions are cited, not re-litigated, unless new evidence in this pass
> materially refines them.

---

## 1. Executive summary

**The catastrophic Large-View collapse is not caused by any single buggy function. It is
caused by an architectural absence: nothing in this renderer decides "how much visual
detail a piece of data deserves right now" — every node and link that survives a binary
visibility filter becomes a permanent, individually-managed, individually-drawn three.js
object, forever, with zero batching or instancing anywhere in the codebase (CONFIRMED —
zero `InstancedMesh`/`BatchedMesh`/geometry-merge occurrences in `packages/web/src/graph/`).**

Concretely, for the same 300-node dataset used in the sandbox test:

- **Nodes are already correctly bounded** (`overview(limit=300)`, server-side) and already
  have a working near/far LOD swap (full-fidelity ↔ macro body). A realistic 300-node mix
  produces **≈1,430-1,450 total `Object3D` instances and ≈1,150-1,200 unique materials**
  just from node bodies (CONFIRMED, §4).
- **Links have no equivalent cap and no equivalent LOD-representation split.** Every
  visible link is a curved `TubeGeometry` `Mesh` — **always one draw call, always curved,
  never a cheap straight `Line`** (CONFIRMED, §5) — and the server's edge query
  (`EdgesRepo.within(ids)`) returns *every* edge among the selected 300 nodes with **no
  limit** (CONFIRMED, §11).
- The one clean, mechanism-consistent sandbox measurement from the prior task — disabling
  links dropped idle draw calls from 1472 to 984 (−488), closely tracking the measured 471
  visible links — is exactly what this architecture predicts (CONFIRMED, mechanism-level;
  the sandbox's raw FPS numbers themselves are NOT usable as a magnitude proxy for the real
  device, §13).
- **Why a well-reasoned, correctly-implemented fix (`52d1abb`, curved-link geometry reuse)
  produced no measured real-device improvement while a differently-shaped fix (`d24f7cc`,
  charge-force removal) did**: `d24f7cc` removed 100%-wasted whole-graph physics computation
  with no floor beneath it. `52d1abb` removed a real *construction-cost* waste (per-frame
  `TubeGeometry` rebuilding) sitting **on top of** an unrelated, unbounded floor — the
  **number of draw calls**, which construction-cost optimization cannot touch, because a
  draw call is submitted once per `Mesh`/`Sprite` object regardless of whether its geometry
  was freshly built or reused (CONFIRMED, §14).
- The small-View (~9 node, ~7 link) case is dramatically faster not because any per-frame
  math is cheaper per node, but because `isolateSystem`/`isolateSet` is **the one existing
  mechanism that actually removes objects from three-forcegraph's tracked set** — collapsing
  total tracked `Object3D` count roughly two orders of magnitude (≈1,400-1,450+ down to
  ≈40-45), directly and linearly collapsing draw calls with it (HIGH CONFIDENCE, §2/§12).

**No source code was changed to reach this conclusion.** It is the union of source-code
tracing (this task, four parallel read-only agents), a direct `git show` of seven named
commits, and the already-completed sandboxed isolation diagnostic's measured numbers.

---

## 2. Large vs Small View definition

**CONFIRMED**, traced end-to-end (`App.tsx`, `GalaxyViews.tsx`, `orbits.ts`, `Graph3D.tsx`):

- **"Large View" is not a named state anywhere in the code.** It is simply the *rest state*
  — `activeLens === null` in `App.tsx` and `cluster === null` in `Graph3D.tsx` — reached by
  default on load or via "★ Show all" / "✕ Exit system view."
- **"Small View"** (the ~9-node case from the sandbox test) is `isolateSystem(id)`
  (`Graph3D.tsx:2386-2399`, `App.tsx`'s `RightDock` `onIsolate` handler), which calls
  `orbits.getDescendants(id)` — a BFS over the **kinematic orbit hierarchy** (a mass-based
  parent/child tree built purely from `node.mass`/adjacency, `orbits.ts:174-186`, unrelated
  to any semantic category) — and feeds the resulting `Set<number>` into `Graph3D`'s
  `setCluster`. `GalaxyViews.tsx`'s category chips ("👤 People", "💡 Ideas", etc.) are a
  *separate* mechanism (`isolateSet`, a client-side `.filter()` over the already-loaded node
  array by predicate, `GalaxyViews.tsx:85-88`) but funnel into the **same** `cluster` state
  (`App.tsx:1226-1230`'s own comment confirms this explicitly: "Lens/Views and the 'system
  view' isolate ... share ONE underlying cluster state in Graph3D").
- **The underlying graph data does NOT change between views.** `App.tsx:528`,
  `const view = data;` is a bare alias; `data` is populated once via `getGraph()`
  (`App.tsx:551-556`, `App.tsx:96`) and passed unconditionally to `Graph3D` as
  `data={view}` (`App.tsx:1448`) — same reference regardless of active View. `Graph3D.tsx:3097`,
  `graphData={data as any}`, is likewise never replaced by any View/cluster handler.
- **Only visibility changes.** `nodeVisibility`/`linkVisibility` (`Graph3D.tsx:3103-3132`)
  are `!cluster || cluster.has(n.id)` / `cluster.has(source) && cluster.has(target)` —
  predicates over the one stable `cluster` `Set`. CONFIRMED against the vendored
  `three-forcegraph` source: a node/link failing this predicate is not merely
  `.visible = false`'d — it is **excluded from the library's own tracked-object map
  entirely** (`DataBindMapper.digest()`), and the library's own removal path disposes its
  `Object3D` via `_deallocate()`. This exclusion-from-tracked-set behavior — not a CSS-style
  visibility toggle — is the actual mechanism by which draw-call count collapses.
- **No `graphData` replacement, no `fg.refresh()`, no simulation reheat, no renderer-setting
  change** on any View switch (CONFIRMED — traced every line of `isolateSet`/`isolateSystem`/
  `isolateLayer`/`exitCluster`; none call `setData`, `.refresh()`, or touch
  `gfxRef`/`bloomRef`/pixel-ratio/adaptive-controller state).
- **Cache invalidation**: the node-object cache (`nodeThreeObjCacheRef`) and the
  label/glow texture caches (`labelTexCache`/`glowTexCache`, keyed by `nodeVisualCacheKey` —
  a function of label/importance/degree/bucketed-entropy/color/kind, **not** of view/cluster
  state) are architecturally incapable of being invalidated by a View switch — the key
  contains nothing view-related. A node that toggles back into view after being hidden is a
  cache **hit**, not a rebuild, unless its own visual attributes changed in the interim.

**Net effect of a View change**: it sets one `Set<number> | null`. That single state change
(a) triggers a `Graph3D` re-render (cheap — see §7), and (b) shrinks the number of nodes/links
three-forcegraph actually keeps as live, drawn objects. Effect (b) is the one with real,
large impact, and it scales *directly* with how many nodes/links the active cluster contains
— which is the entire explanation for why a 9-node isolate is dramatically faster than the
300-node default.

---

## 3. Rendering pipeline

```
View selection (App.tsx / GalaxyViews.tsx)
   │  GalaxyViews chips: client-side .filter() over already-loaded nodes by category predicate
   │  isolateSystem: orbits.getDescendants(id) — BFS over the kinematic orbit tree
   ▼
cluster state (Graph3D.tsx, ONE Set<number> | null — shared by all View/Lens/isolate paths)
   ▼
nodeVisibility / linkVisibility (Graph3D.tsx:3103-3132 — inline, unmemoized predicates)
   │  binary: !cluster || cluster.has(id)   /   cluster.has(source) && cluster.has(target)
   │  ALSO: an independent link-only LOD gate (LINK_LOD_MIN=350/ZOOM=650/CUTOFF=0.6) that
   │  engages regardless of cluster state once total link count exceeds 350
   ▼
three-forcegraph's DataBindMapper.digest() — nodes/links failing the predicate are REMOVED
from the tracked-object map (not merely hidden) and their Object3D is _deallocate()'d
   ▼
nodeThreeObject (nodeThreeObjectCb → nodeObject.ts makeNodeObject) — builds/caches ONE
THREE.Group per surviving node, keyed by id + nodeVisualCacheKey (content hash)
linkPositionUpdate / linkWidth / linkCurvature / linkColor — govern the ONE THREE.Mesh
(TubeGeometry) per surviving link
   ▼
Auxiliary objects (Journey hubs, Money sky, satellites, sub-agents, visitors, Soumaya,
star-light pool, backdrop) — small, FIXED counts, throttled, independent of node/link count
   ▼
Actual Three.js scene objects — one Group per node (with 3-7 children each), one Mesh per
link, plus the small fixed auxiliary set
   ▼
render/update loop — TWO independent requestAnimationFrame loops:
   (a) three-forcegraph's own internal loop — node/link position sync, calcLinkCurve(),
       and the actual renderer.render() draw-call submission (NOT in Graph3D.tsx at all)
   (b) Graph3D.tsx's own tick() — orbits/LOD/labels/lights/satellites/camera/etc. (§6)
```

Key confirmed facts:
- **View changes never cause `graphData` replacement, a refetch, a simulation
  reheat/restart, or a renderer-setting change** (§2).
- **View changes DO cause real object churn** — but of the *cheap* kind. Only two
  `<ForceGraph3D>` props (`nodeThreeObject`, `linkWidth`) sit in three-forcegraph's *narrow*
  `.clear()` gate that disposes and rebuilds the **entire** tracked set regardless of what
  actually changed; both were stabilized via `useCallback` in commit `f5d4dab`
  (CONFIRMED, re-verified this session against current source — `linkWidthCb` is
  `useCallback(..., [activeId])` at `Graph3D.tsx:3052-3062`, `nodeThreeObjectCb` similarly
  stable). `nodeVisibility`/`linkVisibility`/`linkColor`/`linkCurvature` remain unmemoized,
  inline closures — but CONFIRMED (re-verified against vendored `three-forcegraph.mjs` this
  session) they sit only in the **outer, cheap** re-digest gate, whose effect on an
  unchanged id set is a no-op `onUpdateObj` call, not disposal. A View switch's real cost is
  therefore the *bounded* outer re-digest (O(N+M)) plus whatever real create/dispose work is
  needed for ids that actually toggle in/out — not a full-scene rebuild.
- **This entire pipeline is separate from Graph3D.tsx's `tick()` loop** — `tick()` never
  calls `renderer.render()` (confirmed absent from the file); that call belongs entirely to
  `3d-force-graph`'s own internal, independent RAF cycle.

---

## 4. Node object inventory

*Files inspected in full: `packages/web/src/graph/nodeObject.ts`, `packages/web/src/graph/shaders.ts`,
`packages/shared/src/celestial.ts`, `packages/web/src/graph/graph3dHelpers.ts`; relevant sections
of `Graph3D.tsx` (light-pool setup, LOD/fade constants, per-node tick loop, `nodeThreeObjectCb`
cache wiring) and `perfDiag.ts`.*

**Correction to the task's framing**: `classify(mass)` (`celestial.ts:329-337`) has **seven**
tiers, not six — `gas_giant` is a distinct tier between `planet` and `giant`, with its own
ring logic and a sector-title threshold that straddles its own mass band.

### Per-tier children (CONFIRMED, `nodeObject.ts`)

| Tier | Body geometry | Ring | Glow/corona | Belt | Sector title | Label | Macro body |
|---|---|---|---|---|---|---|---|
| asteroid | `IcosahedronGeometry(size,0)` | never | **never** | never | never | always | always |
| moon | `SphereGeometry(size,24,24)` | never | **never** | never | never | always | always |
| planet | `SphereGeometry(size,24,16)` | never | yes (×1.35) | never | never | always | always |
| gas_giant | `SphereGeometry(size,24,16)` | ~1/5 (deterministic hash on id) | yes (×1.35) | never | **only mass∈[0.44,0.48)** | always | always |
| giant | `SphereGeometry(size,24,16)` | never | yes (×1.5) | never | always (mass≥0.48) | always | always |
| star | `SphereGeometry(size,32,24)` | never | yes (×2.4) | **yes**, 360-pt `Points` | always | always | always |
| supergiant | `SphereGeometry(size,32,24)` | never | yes (×3.0) | **yes**, 360-pt `Points` | always | always | always |

- Body geometry is cache-shared via `getGeometry()` keyed on `` `${type}-${size}-${w}-${h}` ``
  — but since `size` is a continuous function of `mass`, a real hit rate across a 300-node
  set depends on how often mass collides bit-for-bit (UNKNOWN without the real dataset).
- **The macro body's `SphereGeometry(size,14,14)` is NEVER cache-shared** — a fresh geometry
  allocation on every single node build, even when two nodes are the exact same size.
- The gas-giant ring's `RingGeometry` and the star's 360-point belt `BufferGeometry` are
  likewise **always uncached, unique-per-node allocations**.
- **A `PointLight` is never created here.** A star-like body only stamps
  `nodeGroup.userData.starLight = {color, intensity, distance}` (a plain descriptor). The
  actual lights are a **fixed pool of 3/4/6 real `THREE.PointLight`s** owned by `Graph3D.tsx`
  (Stage 4 of the Performance Program), reassigned every 6 frames to the nearest N stars —
  the light **count** in the scene never changes regardless of how many stars exist,
  specifically to avoid a `NUM_POINT_LIGHTS`-driven shader-recompile storm.
- **Dead-code note**: `makeNodeObject` allocates an orphaned `new THREE.Group()`
  (`nodeObject.ts` L432) that is never used (the function builds and returns a *different*
  group). Trivial per-instance GC pressure on every construction/rebuild, not a live scene
  object.
- **Cache-key gap flagged, not confirmed exploitable**: `nodeVisualCacheKey` (used for both
  the node-object cache and the label/glow texture caches) is
  `` `${label}_${importance}_${degree}_${bucketedEntropy}_${color}_${kind}` `` — it does
  **not** include `mass`/`celestial` tier. No code path was found in these files where mass
  could change independent of the fields already in the key, so this is flagged as an
  unverified gap (would require auditing the server-side `GraphNode` population), not a
  confirmed bug.

### Concrete object counts (CONFIRMED arithmetic, illustrative mass distribution)

| Representative node | Object3D | Materials | Fresh (uncached) geometry allocations |
|---|---|---|---|
| Planet (no sector title — always the case for this tier) | 5 (group+mesh+glow+label+macro) | 4 | 1 (macro sphere) |
| Star w/ sector title | 7 (group+mesh+glow+belt+sectorTitle+label+macro) | 6 | 2 (belt + macro sphere) |
| Asteroid/moon (no glow, no belt) | 4 (group+mesh+label+macro) | 3 | 1 (macro sphere) |

For an illustrative 300-node mix (40% asteroid / 25% moon / 18% planet / 10% gas_giant / 4%
giant / 2.5% star / 0.5% supergiant — an assumption, not measured production data):
**≈300 node-groups + ≈1,130-1,150 additional children ≈ 1,430-1,450 total `Object3D`
instances, ≈1,150-1,200 unique materials** (materials are never shared, only textures and
some geometries are). For the ~9-node Small View with a similarly-shaped small mix: **≈40-45
total `Object3D`, ≈33-38 materials.** The fixed 3-6-light pool is identical in both cases —
lights do **not** contribute to the differential.

---

## 5. Link inventory

*Files inspected: `Graph3D.tsx` (link prop wiring, LOD constants), `linkTube.ts`,
`graph3dHelpers.ts`, and the vendored `node_modules/three-forcegraph/dist/three-forcegraph.mjs`.*

**CONFIRMED, direct read of vendored source**: `three-forcegraph` chooses `THREE.Mesh` (a
`TubeGeometry`) vs. the cheap `THREE.Line` path based on whether `linkWidthAccessor(link)` is
nonzero. `Graph3D.tsx`'s `linkWidthCb` (`0.7 + weight*0.9 + activity²*5`) is **always
nonzero** for any rendered link, and `computeLinkCurvature` similarly **always returns a
nonzero curvature** (minimum `0.12 + activity*0.16`). **Result: every visible link in this
app is a curved `TubeGeometry` `Mesh` — never a straight `Line` — and one link = one draw
call, unconditionally, with zero exceptions for any link category** other than being
excluded from the visible set entirely.

- `linkColor`: inline, unmemoized — cheap outer digest only, not the expensive clear gate.
- `linkWidth`: `useCallback(..., [activeId])` (fixed in `f5d4dab`) — the one link prop in
  three-forcegraph's expensive `.clear()` gate; correctly stabilized.
- `linkCurvature`: plain unmemoized arrow — not in the expensive gate, so its instability is
  cheap, but its **always-nonzero value** is what forces the tube-mesh path for every link.
- `linkPositionUpdate` (the `52d1abb` fix): `useCallback(..., [linkWidthCb])`, calls
  `CurvedLinkGeometryCache.update()` (`linkTube.ts`), which rewrites the tube's
  position/normal attribute arrays **in place** (`needsUpdate = true`) instead of
  reconstructing a fresh `TubeGeometry` every frame. **This eliminates the per-frame
  construction/GC cost but does NOT reduce the draw-call count** — the mesh still exists and
  still submits one draw call per frame regardless of how its geometry was produced.
- **Residual, unavoidable cost, not fixed by anything in this codebase**: three-forcegraph's
  own internal per-frame loop calls `calcLinkCurve()` **unconditionally for every tracked
  link, every frame — even when the app supplies its own `linkPositionUpdate`** (confirmed
  by reading the library's calling code; its own comment says this runs "for all links,
  including custom replaced, so it can be used in directional functionality"). This
  allocates ~2-5 fresh `Vector3`s plus a new `QuadraticBezierCurve3` per link per frame,
  scaling linearly with M, and is **entirely invisible to a reading of `Graph3D.tsx`'s own
  `tick()`** since it lives in the vendored library's separate RAF loop.
- **Link-only LOD**: `linkVisibility` also applies a binary detail gate — once
  `dataRef.current.links.length > LINK_LOD_MIN` (350) **and** the camera is zoomed out past
  `LINK_LOD_ZOOM` (650 units, 80-unit hysteresis), only links with `strength ≥
  LINK_LOD_CUTOFF` (0.6) stay in the tracked set. For the sandbox's 471-link Large View,
  471 > 350, so this LOD is **active** at macro zoom; for the 7-link Small View, it **never
  engages** (7 ≤ 350) — every link always renders there. This is real, existing
  infrastructure, but it is strictly binary (visible/hidden), not a detail-tier split — the
  architecture audit (§12 there) identifies extending exactly this mechanism into a
  three-way detailed/aggregate/hidden classification as the most promising unbuilt fix.
- **Server-side, no cap**: `EdgesRepo.within(ids)` (used by `GraphService.overview()`)
  returns every edge where both endpoints are in the selected 300 node ids — **no `LIMIT`,
  no truncation** (CONFIRMED, §11). Node count is capped; link count is not.
- **No link category is exempt from "one visible link = one draw call."** The only
  exemption mechanism that exists is removal from the visible set entirely (the LOD gate
  above), never a cheaper *representation* for a link that stays visible.

---

## 6. Per-frame workload table

*Consolidated from a full read of `Graph3D.tsx`'s `tick()` (lines 1278-2183) plus the
vendored `three-forcegraph` internal loop it does NOT include. Line numbers refer to
`Graph3D.tsx` unless marked "(library)".*

| Operation | Runs per frame? | Scales with | Allocation? | GPU impact |
|---|---|---|---|---|
| FPS-cap gate | Every rAF (gates everything below) | O(1) | No | None |
| Node position/orbit update (`orbits.ts`) | Every frame | **O(N)**, internally LOD-banded 1/2/4-frame, staggered | No (Stage 5 fix) | None directly |
| **Node coordinate sync back to react-force-graph** | Every frame | **O(N)** | **No** (fixed this session — was the single largest per-frame GC source; now reuses `nodeByIdRef`) | Feeds the library's own render loop next frame |
| **Main per-node child loop** (LOD swap, pulse, corona, spin, label distance/opacity, occlusion, frustum cull, diagnostic hide) | Every frame, unthrottled | **O(N × ~5 children)** for non-culled bodies | No (steady-state scratch refs) | Shader uniform writes (`uBrightness`,`uTime`,`uSunDirView`) per visible pulsing child; `.visible`/opacity/scale mutations |
| Frustum-cull early return | Every frame (part of the loop above) | O(N) | No | Skips the entire per-child pass for culled, unfocused bodies — the one thing keeping the loop above from being unconditionally full-cost |
| Label-cap sticky scan (`MAX_VISIBLE_LABELS`) | Throttled, every 6 frames | **O(N log N)** (distance calc + sort) | Yes — one object per eligible node, every 6 frames | Drives per-child label visibility |
| Star-light pool reassignment | Same throttle, every 6 frames | O(N) scan + sort of nearby candidates | Yes, same cadence | Reassigns the **fixed** 3/4/6-light pool — bounded regardless of star count |
| Spatial-grid visibility scan | Throttled: every 60 frames or 500-unit camera move | O(populated grid cells) | Yes, per cell, on that cadence | None (feeds a visibility flag) |
| Link repair scan ("Soumaya link-tending") | Throttled, every 10s | **O(M log M)** — sorts the entire link array | Yes — one object per link, every 10s | None directly |
| **Link position/curve sync + `calcLinkCurve()`** | Every real frame (library's own RAF loop, NOT in `tick()`) | **O(M)** | **Yes, unavoidably** — a fresh `Vector3`×several + a `QuadraticBezierCurve3` per link, per frame, regardless of the app's own `linkPositionUpdate` optimization | None directly, but this is the single largest confirmed per-frame allocation source scaling with M |
| **`renderer.render()` draw-call submission** | Every real frame (library's own RAF loop) | **O(total tracked Object3D) = O(N×~4-7 + M + fixed aux)** | None new (WebGL command buffer only) | **The dominant cost** — synchronous main-thread WebGL call issuance, one per object |
| Journey-hub / Money-sky update | Throttled 10Hz, skipped while invisible | O(Journey+bill count) — small, fixed | No | Sprite opacity/scale pulse |
| Satellites / sub-agents / visitors update | Every frame | O(fixed small counts) | No (scratch-vectorized this session), except one confirmed exception (visitor hazard snapshot allocates one `Vector3`/active-visitor/frame) | Small, fixed draw-call set |
| Soumaya (ship) update | Every frame | Receives O(N)/O(M) args but internal cost not re-derived here | Minimal (scratch reused) | Drives ship position; event-driven particle/beam spawns |
| Camera/follow logic (node-follow) | Every frame while locked | O(1) — confirmed O(1) map lookup, not an O(N) scan | Small, bounded | None |
| **Camera/follow logic (non-memory object — ship/station/figurines)** | Every frame while locked | O(1) | **Yes — a dozen-plus fresh `Vector3`/`.clone()` calls per frame**, NOT scratch-vectorized unlike the sibling node-follow path | None |
| Adaptive quality controller sample | Throttled, every 2s | O(1) | Minor | **Yes when rung changes** — `setPixelRatio()` triggers a full WebGL buffer resize, gated against redundant calls |
| Background/scenery updates (starfield, milkyway, nebula, dust) | Every frame | O(fixed small object count) | No | Cheap rotation/uniform updates |
| Cluster/lens scoping filter (`workNodes`) | Every frame **while a cluster/lens is active** | O(N) | Yes, conditionally — a fresh filtered array every frame while active | None |
| Graph-group lookup (re-finds the same group object) | Every frame, unthrottled, uncached | O(scene top-level children) | No new arrays, but a repeated linear scan every frame that could be a one-time ref | None |

**The single most important row for this audit's core question is the one operation NOT
inside `Graph3D.tsx`'s own `tick()` at all**: `renderer.render()`'s draw-call submission,
owned by `three-forcegraph`'s independent RAF loop, scaling with the total tracked object
count — this is where N and M's growth actually converts into frame-time cost, and it is
invisible to anyone auditing `tick()` in isolation (a trap this task's own agents flagged
explicitly).

---

## 7. React/main-thread workload

*This section is answered in full, with high rigor, by the existing
`docs/specs/soumaya-galaxy-react-prop-identity-audit.md` — re-verified against current
source this session rather than re-derived from scratch.*

**CONFIRMED** (re-verified):
- `Graph3D` has exactly two `useState` hooks (`hoverId`, `cluster`) and is **not** wrapped in
  `React.memo` — any parent (`App.tsx`) re-render cascades into it regardless of whether the
  Galaxy's own data changed.
- Of ~12 inline function props passed to `<ForceGraph3D>`, only **`nodeThreeObject`** and
  **`linkWidth`** sit inside three-forcegraph's *narrow* `.clear()` gate (full dispose+rebuild
  of every tracked object); both are now correctly stabilized via `useCallback` (`f5d4dab`).
  Everything else (`nodeVisibility`, `linkVisibility`, `linkColor`, `linkCurvature`, the
  particle props, `nodeLabel`, `onNodeClick`, `onNodeHover`) sits only in the cheap outer
  re-digest gate.
- A confirmed, concrete, high-frequency non-graph-related render trigger was traced and
  **REFUTED as still-relevant to the disposal path** post-`f5d4dab`: `App.tsx`'s
  `useCountUp` tween (up to ~36 `setState` calls over 600ms per memory add) used to cascade
  into a full node+link clear-and-rebuild before `nodeThreeObject`/`linkWidth` were
  stabilized; today it only re-runs the cheap outer digest.
- **No `React.memo` boundary exists today** — every `App.tsx` render still reaches
  `Graph3D`'s render body and re-evaluates the (cheap, but non-zero, O(N+M)) outer digest.
  This is a real, bounded, secondary cost — not the dominant one.
- **Answering this task's specific question**: switching View does **not** cause additional
  React renders beyond the one `setCluster`/`setActiveLens` call itself; it does not cause
  additional `graphData` synchronization, cache clearing, object deallocation beyond the
  bounded outer re-digest, or effect re-runs.

**Evidence classification for this section**: CONFIRMED throughout — this is the
best-evidenced section of the whole audit, resting on direct reads of both `Graph3D.tsx` and
the vendored `react-kapsule`/`three-forcegraph` source, re-verified independently this
session.

---

## 8. GPU workload

**CONFIRMED** (§4, §5, and the existing architecture audit's §3-4, re-verified):

- **Draw-call sources, in order of typical magnitude at N=300**: node bodies/glows/labels/
  macro-siblings (≈500-600 draw calls for a fully-populated 300-node set, per §4's
  arithmetic: 1.7-2× N before a single link is counted), link tubes (1 per visible link,
  **unbounded** — §5), gas-giant rings and star belts (small fraction of N), a handful of
  fixed auxiliary objects (Journey hubs, Money sky, satellites, backdrop), and bloom's
  several extra full-screen passes when enabled.
- **Does each memory node represent multiple independent draw calls? CONFIRMED yes** — §4's
  per-tier table shows 4-7 `Object3D` per node (most of them separately-materialed meshes/
  sprites), each an independent WebGL submission. 300 nodes plausibly become **1,400-1,450+
  individual objects** before a single link exists.
- **Materials/programs**: every node body's material is a **freshly-constructed, per-node
  unique** `ShaderMaterial` or `MeshStandardMaterial` (color/tint varies per node) — even
  nodes sharing identical geometry cannot be auto-batched by three.js, since a different
  material forces a different draw call regardless. Node geometry and glow/label *textures*
  are cache-shared; materials themselves never are.
- **Transparent/additive objects**: glow sprites (per star/planet/giant, `depthWrite:false`
  additive blending — no early-Z rejection, real fill-rate cost), plus the already-baked
  backdrop nebula/galaxy sprites (fixed cost, addressed in the earlier Performance Program's
  Stage 3).
- **Lights**: fixed pool of 3/4/6 real `PointLight`s (Stage 4) — confirmed **not**
  data-dependent; does not contribute to the Large-vs-Small differential.
- **Postprocessing**: `UnrealBloomPass`, gated off on the Performance tier / by the adaptive
  controller — a real, fixed extra cost when enabled, not itself N/M-dependent.
- **Overdraw/fill-rate contributors**: glow sprites and (when active) bloom are the primary
  candidates; **cannot be separated from pure draw-call-count cost without real-device
  GPU/driver profiling** (UNKNOWN, flagged in §20).

**Architectural verdict** (re-confirmed from the existing architecture audit, not
independently re-derived): draw-call *count*, not per-object complexity, is the best-evidenced
dominant GPU/CPU-submission cost, because `WebGLRenderer.render()` issues one WebGL call per
tracked object **synchronously on the main JS thread** — a frame with 2,500-3,000+ draw
calls is, by construction, a long synchronous main-thread stretch, independent of whatever
the GPU itself could otherwise keep up with. This matches the reported symptom ("input
frozen, then catches up") far better than a pure GPU fill-rate explanation would (which
would show as smooth-but-slow, not stutter-then-catch-up).

---

## 9. Allocation/GC workload

**Construction-time** (one-shot per node/link build, not steady-state):
- Every node's body material (`ShaderMaterial`/`MeshStandardMaterial`), the macro body's
  always-fresh `SphereGeometry(size,14,14)`, gas-giant rings' `RingGeometry`, star belts'
  360-point `BufferGeometry`+`Float32Array(1080)`, and the orphaned dead-code `Group`
  (§4) all allocate fresh on every node build/rebuild — bounded by how often
  `nodeVisualCacheKey` changes (i.e., how often a node's label/importance/degree/entropy-
  bucket/color/kind actually changes), not by frame rate.

**Steady-state per-frame** (CONFIRMED, from §6's table):
- **The dominant scaling allocation is `three-forcegraph`'s own `calcLinkCurve()`** — a
  fresh `Vector3`×several plus a new `QuadraticBezierCurve3` **per link, every real frame**,
  unconditional on the app's own `linkPositionUpdate` optimization. This is the one
  allocation source in the entire pipeline that scales with M and was **not** addressed by
  `52d1abb` (which only fixed the *tube geometry* reconstruction, a different, already-fixed
  allocation).
- Two smaller, already-flagged exceptions to an otherwise scratch-vectorized tick loop: the
  visitor hazard-position snapshot (one `Vector3` per active visitor, per frame — small,
  fixed-bounded) and the non-memory-object camera-follow branch (a dozen-plus `Vector3`/
  `.clone()` calls per frame while actively following the ship/station/a figurine — O(1) per
  frame but a real, common-case allocation surface, inconsistent with the scratch-vector
  discipline applied to the sibling node-follow path).
- The cluster/lens `workNodes` filter allocates a fresh O(N) array every frame **while any
  cluster/lens is active** — ironically, this means the Small View itself pays a (tiny, since
  N is small there) per-frame filter-allocation cost that the unfiltered Large View does not.

**Periodic** (throttled, not per-frame):
- Label-cap sticky scan (every 6 frames, O(N) object allocations for candidates).
- Star-light pool reassignment (same 6-frame cadence, O(N) candidate objects).
- Spatial-grid visibility scan (every 60 frames or on 500-unit camera movement, one `Vector3`
  per populated grid cell).
- Link repair/"tending" scan (every 10s, O(M) — one object per link, plus a full array sort)
  — the only periodic operation whose cost is exactly zero for the 7-link Small View and real
  (471 allocations + a sort) for the 471-link Large View, every 10 seconds.

**This distinction matters for the audit's core question**: none of the *periodic* or
*construction-time* allocation differences are large enough, at their measured frequency, to
explain a catastrophic 0-1fps collapse on their own. The one **steady-state, every-frame,
M-scaling** allocation (`calcLinkCurve()`) is a real, confirmed contributor to GC pressure
that grows directly with link count and cannot be tuned from `Graph3D.tsx` at all (it lives
in the vendored library). It is judged a secondary, not primary, contributor relative to
draw-call count itself (§8), consistent with `52d1abb` targeting an adjacent but different
allocation (tube reconstruction) and still not fixing the real-device collapse.

---

## 10. View-change lifecycle

**CONFIRMED**, tracing `isolateSet`/`isolateSystem`/`isolateLayer`/`exitCluster`
(`Graph3D.tsx:2765-2814`, `2386-2399`) and their `App.tsx` call sites in both directions
(Large→Small and Small→Large are symmetric — the same handlers, different `cluster` value):

| Effect | Occurs? |
|---|---|
| `graphData` replacement | **No** |
| Network refetch | **No** — purely a client-side filter over already-loaded data; the only two `getGraph()` call sites in `App.tsx` are initial boot load and a post-edit refresh (importance/weight change), neither related to View switching |
| Simulation/force restart (`d3ReheatSimulation`) | **No** — moot regardless, since `orbits.ts` pins every node's `fx/fy/fz` every frame, so the d3 layout output is discarded either way |
| React re-render cascade | **Yes, but bounded** — one `setCluster` (+`setActiveLens`/`setClustered` UI-banner flags) triggers exactly one `Graph3D` re-render, which re-runs the cheap outer digest (§7), not a full rebuild |
| Node/link object rebuild | **No, for objects that stay in the same visibility state.** For ids that toggle in/out, a real but architecturally-cheap create/dispose occurs (bounded by how many ids actually change) — and even a re-created node hits its content-keyed cache if its visual attributes are unchanged |
| Cache invalidation | **No** — `nodeVisualCacheKey` contains no view/cluster state by construction |
| Material/geometry recreation | Only for genuinely newly-visible nodes without an existing valid cache entry |
| Disposal | Only for nodes/links that toggle to invisible (three-forcegraph's own `_deallocate()` on the *outer* digest's removal path) — bounded, not a full-scene teardown |
| Renderer setting change | **No** |

**Verdict**: View switching is architecturally cheap and safe by design — it is not itself a
source of the catastrophic collapse. The collapse is a **standing-state** property of how
many objects the Large View's `cluster === null` state leaves permanently tracked, not a
**transition-cost** property of switching into or out of it.

---

## 11. Data scale vs render scale

**CONFIRMED**, direct read of `packages/server/src/graph/service.ts` and
`repositories/edges.repo.ts`:

```ts
// service.ts:119-143 (overview)
overview(limit = 300): GraphData {
  if (this.nodes.count() <= limit) return this.full();
  const rows = /* ORDER BY COALESCE(degree,0) DESC, id DESC LIMIT ? */;
  const ids = rows.map(r => r.id);
  return { nodes: this.enrich(this.nodes.byIds(ids)), links: this.edges.within(ids) };
}
```

- **Nodes: bounded.** `route: GET /api/graph?limit=` clamps `limit` to `[1, 5000]`, default
  300. This is a genuine "database scale → relevance/bounded selection → renderer" design
  for nodes — already correctly architected.
- **Links: NOT bounded.** `EdgesRepo.within(ids)` (`edges.repo.ts:64-75`) returns *every*
  edge where **both** endpoints are in the selected node set — no `LIMIT`. The worst-case
  upper bound is `C(300,2) = 44,850`; the realistic bound depends entirely on how
  interconnected the selected 300 nodes happen to be.
- **Does top-degree selection make the induced subgraph denser? It depends on the data
  generator, and this matters for interpreting the prior task's sandbox result.**
  - For the **synthetic `seedLarge` generator** (used in the sandbox test, `seed.ts:81-99`
    — a chain plus one uniformly-random extra edge per node, an Erdős–Rényi-like
    construction): a direct simulation of this exact algorithm at realistic scale (5,000-
    50,000 nodes) shows the top-300-by-degree nodes are only mildly above average degree
    (thin-tailed, not fat-tailed), and — counter to the naive hypothesis — **the induced
    subgraph among them gets *sparser*, not denser, as the dataset grows** (internal average
    degree fell from 0.64 at n=5,000 to 0.05 at n=50,000 in the simulation). **This means the
    prior task's own sandbox result (471 links for 300 nodes) is best explained by the small
    total seed size (500 nodes) — the 300-cap retained 60% of all data — not by a
    hub-density-amplification mechanism.** REFUTED, specifically for `seedLarge`.
  - For **real production data**, the mechanism is plausible and unrefuted: `service.ts`'s
    own comment notes `moc` (constellation) hub nodes whose "degree IS its member count," and
    `associativeLink.ts:57-70` creates edges into an existing `moc` hub with **explicitly "no
    LLM gate and no cap"** — an unbounded inbound-edge accumulation mechanism with no
    equivalent in `seedLarge`. Several other files (`dreamCycle.ts`, `constellationReconcile.ts`,
    `constellations.ts`, `inquiry.ts`, `dailyContact.ts`, `cognitive.ts`, `ideas.ts`) also call
    `edges.create()`, each an independent, ongoing source feeding the same uncapped
    hub-degree pool. **HIGH CONFIDENCE** that this makes a real, actively-used, months-old
    account's top-300 selection genuinely denser than a random sample would be — but this
    could **not** be measured directly (no production database reachable from either
    sandbox). **UNKNOWN, not CONFIRMED**, for real accounts specifically.
- **Architecture shape, confirmed**: nodes follow "database scale → bounded selection →
  renderer." **Links follow "database scale → renderer scale" directly** — the one place
  this task's evidence says the architecture has not yet applied its own node-side
  discipline.

---

## 12. Complexity/scaling analysis

| Workload | Classification | Notes |
|---|---|---|
| Node body/glow/label/macro construction | O(nodes) | Capped at `overview(limit)`, default 300, hard max 5,000 via route clamp |
| Node position/orbit update | O(nodes), internally LOD-banded | Already mitigated (Stage 5) |
| Per-node tick child loop | O(nodes × children), children ≈4-7 | Mitigated by earlier frustum-cull return for culled/unfocused bodies |
| Label rendering | **O(1) — capped** (`MAX_VISIBLE_LABELS`) | Confirmed already correctly bounded, does not scale with N |
| Star-light pool | **O(1) — fixed** (Stage 4) | Confirmed does not scale with star count |
| Link tube construction/position sync | **O(links)**, no cap upstream of the LOD gate | The one demonstrably unbounded rendering-side cost |
| Link curve allocation (`calcLinkCurve`, library-owned) | O(links), every frame | Unavoidable given always-nonzero width/curvature accessors |
| Link "repair" scan | O(links log links), throttled 10s | Periodic, not steady-state |
| Draw-call submission | **O(nodes × children + links + fixed aux)** | The dominant, unbatched cost — no instancing/merging anywhere |
| Auxiliary systems (satellites/visitors/sub-agents/Soumaya/Journey/Money) | O(1) — fixed, small counts | Confirmed does not scale with the memory count at all |
| React outer digest | O(nodes+links), bounded, cheap | Real but secondary (§7) |

**Distinguishing stored / selected / visible / rendered / draw calls / per-frame work**
(explicitly requested — do not conflate these):

| Stage | 300 stored | 1,000 stored | 5,000 stored | 20,000 stored |
|---|---|---|---|---|
| Stored memories (database) | 300 | 1,000 | 5,000 | 20,000 |
| Considered by intelligence layer (embeddings/KNN/etc.) | All | All | All | All — this layer is architecturally scale-independent of rendering (out of this audit's scope; no evidence found of a rendering-driven bottleneck here) |
| Selected for the Galaxy (`overview()`) | 300 (all of it — no cap needed yet) | 300 (capped) | 300 (capped) | 300 (capped) — **unchanged regardless of database size, by design** |
| Visible (post `nodeVisibility`/`linkVisibility`) | ≤300 nodes; **links unbounded above** (§11) | Same — **the selected-node cap does not change with database size** | Same | Same |
| Rendered `Object3D` | ≈40-1,450+ depending on cluster state (§2/§4) | Same range — **driven by cluster state, not by how many memories exist**, since `overview()` already flattens database size to a fixed 300-node selection | Same | Same |
| Draw calls | ≈20-40 (Small View) to ≈2,500-3,000+ (Large View, estimated per §8) | Same | Same | Same |
| Per-frame work | Scales with whatever the *rendered* object count is, not the stored count | Same | Same | Same |

**The key point this table makes explicit**: because `overview()` already flattens any
database size ≥300 down to a fixed 300-node selection, **the database growing from 300 to
20,000 memories should not, by itself, change render-side cost at all** — the node side of
this pipeline is already correctly architected for that goal. **The one place database growth
*can* still leak into render cost is links**, because a larger, more actively-used database
plausibly accumulates a denser induced subgraph among its most-connected 300 nodes over time
(§11) — this is the one channel by which "the memory universe growing" could make the Galaxy
slower even though node selection stays flat.

---

## 13. Catastrophic-threshold analysis

**The observed transition is best explained as a submission-overhead knee, not a genuinely
nonlinear cost function.** Total draw-call count is, in fact, roughly *linear* in N+M — but
per-draw-call CPU submission overhead on a real WebGL driver/mobile GPU is well-documented to
be non-negligible and largely fixed-per-call (state validation, uniform/attribute binding,
command-buffer construction), so a scene's frame time does not degrade gracefully as object
count grows — it stays fine until synchronous submission cost for that many objects exceeds
the frame budget, then a frame's JS thread is blocked for an extended, synchronous stretch,
which is exactly the reported "input frozen, then catches up" symptom (a signature more
consistent with a long single-thread stall than with smooth GPU fill-rate degradation).

Evaluated candidates from the task's own list:
- **Too many draw calls** — **HIGH CONFIDENCE, the best-evidenced candidate.** ~20-40 draw
  calls (Small View) vs. an estimated ~2,500-3,000+ (Large View, §8) is a ~100× difference,
  which matches "dramatically faster" far better than any single per-frame math operation's
  cost difference could (per-frame math savings alone, even summed across every throttled/
  per-frame operation in §6, would not plausibly produce a 100× speedup on their own).
- **GC pressure** — **POSSIBLE, secondary.** Real (§9), scales with M via `calcLinkCurve()`,
  but `52d1abb` already targeted the largest *known* per-frame allocation and produced no
  measured real-device improvement — inconsistent with GC pressure being the *primary*
  driver, though it likely compounds the draw-call-count cost.
- **GPU fill-rate/overdraw (glow sprites, bloom)** — **POSSIBLE, cannot be ruled out or
  confirmed without real-device GPU/driver access.** Real per-pixel cost exists (additive,
  `depthWrite:false` glow sprites), but this alone would present as smooth-but-slow scaling,
  not the observed stutter pattern — more likely a contributing, not sole, factor.
- **Too many independent geometries / object churn / renderer submission overhead** — folded
  into the draw-call-count explanation above; not a separate mechanism.
- **Main-thread starvation** — **HIGH CONFIDENCE, the direct consequence of the draw-call
  explanation.** `renderer.render()`'s draw-call loop runs synchronously on the JS main
  thread; a few thousand calls in one frame directly delays the next input-event
  processing opportunity on that same thread, matching the reported symptom precisely.
- **Repeated rebuilds** — **REFUTED as a standing-state cause** for the *steady* Large-View
  collapse (§3/§7: the expensive `.clear()` gate is already correctly stabilized). It *was*
  confirmed as a real, separate, since-fixed cause of a *different* symptom (camera-motion-
  triggered freezing, `b520cc1`) — see §14.

**Verdict**: **HIGH CONFIDENCE** that draw-call count, compounding with genuine but secondary
GC/link-curve-allocation pressure, is the dominant, threshold-crossing mechanism. **UNKNOWN**
the precise real-device draw-call number and GPU/driver at which the "acceptable → frozen"
transition actually occurs — no real-device profiler access exists in either sandbox used so
far.

---

## 14. Reconciliation of previous experiments

*Commit messages quoted are the actual, full messages from `git show`, not paraphrased —
each is already a rigorous, self-contained technical account.*

| Commit | What it changed | What it tells us |
|---|---|---|
| **`d24f7cc`** — remove unused Galaxy charge force | Removed `forceManyBody` (the d3 charge force), whose output was already fully discarded since every node is pinned via `fx/fy/fz`. | **Real improvement.** This eliminated 100%-wasted, whole-graph physics computation with **zero architectural downside** — nothing depended on its output. It worked because the cost it removed had no floor beneath it: once removed, that cost was simply gone, not shifted onto another bottleneck. |
| **`dc24d2d`** — invalidate disposed node-object cache entries | Added `isNodeCacheEntryValid()` requiring a matching cache key **and** the cached object still attached to a scene (`obj.parent !== null`) before trusting a cache hit, closing a stale-object-reuse correctness bug (three-forcegraph's own internal cache clearing independently of `Graph3D`'s cache). | **Correctness fix, not a performance fix per se** — but it is the prerequisite that made the *next* commit's rebuild path (below) safe rather than silently-broken. |
| **`f5d4dab`** — stabilize `nodeThreeObject`/`linkWidth` | Wrapped the two props inside three-forcegraph's narrow `.clear()` gate in `useCallback`, stopping every unrelated `Graph3D` render (e.g. `App.tsx`'s `useCountUp` tween, "dozens of renders over 600ms") from wiping and rebuilding the entire tracked node/link set. | **Confirmed (§3/§7 above) this correctly closed the unrelated-render-triggered full rebuild path.** Necessary, but — per the architecture audit's later finding — insufficient on its own, since a *steady-state* Large View pays the draw-call cost (§8) regardless of render frequency. |
| **`b520cc1`** — remove destructive camera-movement `fg.refresh()` | The camera-motion-throttled `fg.refresh()` call set three-forcegraph's `_flushObjects` flag, which unconditionally disposes and rebuilds **every** tracked node/link on the next digest — verified, post-`dc24d2d`, to be genuinely expensive (fresh `makeNodeObject()` reconstruction including new procedural `ShaderMaterial`s for every node) and retriggerable "several times a second during any sustained camera motion, producing the 'freeze, one frame, freeze' catastrophic FPS collapse." | **This targeted a *transient*, motion-triggered full-rebuild storm — a different symptom shape (episodic, camera-motion-linked) than the standing, view-size-linked collapse this audit investigates.** Its message explicitly says the commit "did NOT fix" the catastrophic FPS — consistent with this audit's conclusion that the standing floor (draw-call count) is a separate, unaddressed mechanism from the rebuild-storm this commit correctly closed. |
| **`18d73b8`** — pixel-ratio guard + Journey/Money throttle + Soumaya scratch vectors | Fixed `setPixelRatio()` being called on every rung/settings change even when the effective value was unchanged (a full WebGL buffer resize each time); throttled Journey-hub/Money-sky per-frame `update()` to 10Hz and skip-while-invisible; pooled ~7 per-frame `Vector3` allocations in Soumaya's curve-following. | **Real, confirmed fixes for genuinely wasteful, but individually small and non-dominant, per-frame costs.** None of these three scale with N or M in a way that could plausibly explain a 0-1fps Large-View collapse on their own — consistent with the commit not being framed as "the fix" for that symptom, and with this audit's finding that the auxiliary systems these touch are fixed-cost, not the differential driver (§4/§6). |
| **`52d1abb`** — reuse curved-link `TubeGeometry` instead of rebuilding it every frame | Intercepted three-forcegraph's default per-frame `TubeGeometry` reconstruction (a fresh geometry + `QuadraticBezierCurve3` + several `Vector3`s, per curved link, every frame) via the `linkPositionUpdate` hook, updating position/normal attributes in place instead. The commit message itself states this was identified via source analysis as "the dominant cause of the data-dependent 0-1 FPS collapse... matching the observed 'large View freezes, small/cluster View is fast' behavior exactly." | **This is the single most important reconciliation point in this audit.** The commit's own reasoning was sound and its implementation correct (confirmed, §5) — it eliminated a real, M-scaling, per-frame construction/GC cost. **But per the user's brief, it produced no meaningful real-device improvement.** This audit's answer to *why*: **a draw call is submitted once per `Mesh` object regardless of whether that object's geometry was freshly built or updated in place** (§5/§8). `52d1abb` reduced the *cost of preparing* each link's draw call; it did not reduce the *number* of draw calls, which is the confirmed-dominant cost (§8/§13). It fixed real waste sitting on top of an unrelated, unbounded floor that remained exactly as high afterward — the same floor `nodeThreeObject`/`linkWidth` stabilization (`f5d4dab`) also could not touch, for the identical reason. |
| **`ec5d13b`** — isolation diagnostic tool | Added the `?galaxyDiag=1` category-toggle diagnostic used in the immediately-preceding task. | Its sandboxed run (previous task) produced the one clean, mechanism-consistent finding this audit builds on: disabling links dropped idle draw calls 1472→984 (−488), closely tracking the 471 measured visible links — **directly consistent with, and now explained by, this audit's "one link = one draw call, unbatched" finding (§5)**. The sandbox's raw FPS numbers themselves remain non-transferable to the real device (software-rendering floor), which is why this audit treats the draw-call delta, not the FPS delta, as the credible signal. |

**Overall pattern across all seven**: every fix that worked (`d24f7cc`) or correctly closed a
real bug (`dc24d2d`, `f5d4dab`, `b520cc1`, `18d73b8`) targeted **CPU work that was either pure
waste or an unbounded-frequency trigger of otherwise-necessary work**. The one fix that did
not move the real-device needle (`52d1abb`) targeted **the cost of producing an object's
draw call**, not **the number of draw calls** — and per this audit's evidence, the latter is
the confirmed-dominant, still-entirely-unaddressed cost.

---

## 15. Web vs native analysis

**Answering the specific question asked — would moving this exact architecture into a
native WebView materially solve the scaling problem?**

**CONFIRMED (architectural reasoning, not independently re-measured this session, but not
contradicted by anything found)**: draw-call-count overhead is a property of **the graphics
API and driver** (WebGL here), not of JavaScript, React, or the browser's DOM/CSS layer. A
native renderer (OpenGL ES/Vulkan/Metal) submitting the exact same number of individual,
unbatched draw calls for the exact same unbounded per-link-mesh architecture would hit **the
same wall** — just with a somewhat lower constant-factor per-call overhead (native drivers
typically skip WebGL's own validation/marshalling layer), **not a different scaling curve.**

- **What WebView/native could improve**: lower per-draw-call CPU overhead (a real, but
  second-order, improvement); potentially lower per-frame JS/GC overhead if paired with a
  from-scratch native rendering layer rather than a WebView wrapper around the same
  React/three.js code (moot for a *WebView wrapper specifically*, since that still runs the
  same WebGL/JS stack — a WebView is not a different rendering architecture, it's the same
  browser engine in a different shell).
- **What it would NOT improve**: the fundamental absence of batching/instancing/an
  LOD-representation split for links (§5), the unbounded server-side link count (§11), or
  the draw-call-count-driven main-thread stall pattern (§8/§13) — all of these are
  architecture-bound, not platform-bound.
- **Is the current rendering architecture viable at 5k/20k stored memories?** **Yes, for
  nodes** — `overview(limit=300)` already flattens any database size to a fixed, bounded
  node-render cost (§12's table). **No, not yet, for links** — because link count is
  unbounded upstream of rendering and every link independently costs one draw call, a
  database that accumulates enough hub-to-hub connectivity over time (§11) can push draw
  calls arbitrarily high regardless of how large the underlying memory count is, with
  nothing in the current architecture to stop it.
- **Would a future native renderer help, after a link detail/aggregate split (per §16) is
  built?** Modestly, as a second-order optimization on top of a fixed architecture — not a
  substitute for building the fix itself.

---

## 16. Ideal scalable architecture

*Proposed budgets below are explicitly labeled as proposed targets, not measured facts — no
implementation is proposed or made in this document.*

```
Data layer (unbounded — tens of thousands of memories, unaffected by anything below)
        ↓
Relevance / spatial selection
   • Nodes: KEEP overview(limit=300..5000) — already correct, cheap, and already
     flattens database growth to a fixed render-side node cost (§12).
   • Links: NEW — the one genuinely missing piece. Server or client partitions the
     induced-subgraph links into a bounded "detailed" tier (near/active/selected,
     proposed ceiling ~300-500) and an unbounded-upstream "aggregate" tier (everything
     else), reusing the ALREADY-EXISTING binary LINK_LOD_MIN/ZOOM/CUTOFF machinery as
     the classification signal rather than inventing a new one.
        ↓
Render model (bounded number of rendered entities)
   • Node Object3D count: already bounded by the node cap × a fixed per-tier child count.
   • Link Object3D count: bounded by the proposed detailed-tier cap; aggregate-tier links
     do NOT need their own Object3D at all (next stage).
        ↓
Representation selection
   • Full object: node bodies within LOD-near range (existing, unchanged) + detailed-tier
     links (existing per-link tube mesh, unchanged — preserves the "living, glowing,
     curved" identity for whatever a user is actually looking at).
   • Simplified object: node macro-LOD sibling (existing, unchanged).
   • Aggregate: NEW for links only — one shared/batched geometry (a single merged
     `BufferGeometry`/fat-line buffer) representing every aggregate-tier link at once,
     updated by writing into a shared buffer only when the aggregate SET changes (not
     every frame), not per-link.
   • Hidden: existing frustum-cull / LOD-hide paths, unchanged.
        ↓
GPU-friendly rendering
   • Node bodies: instancing was explicitly investigated and declined earlier this
     program (per-node-unique visual appearance — color/tint/procedural texture per
     node — conflicts with instancing's shared-geometry-plus-uniform-transform model).
     This audit's new evidence does not overturn that decision.
   • Links: batching IS a good fit for the aggregate tier specifically, because
     aggregate-tier links are, by definition, links the user isn't focused on —
     a simpler shared representation there does not violate the "don't make it look
     cheaper" visual-identity principle that ruled out node-body instancing.
        ↓
Renderer — predictable frame budget
```

**Proposed budgets** (explicitly labeled proposed, not measured):

| Item | Proposed ceiling | Basis |
|---|---|---|
| Detailed (full-mesh) nodes | ~300 (current) | Already the practical ceiling; §4 shows nodes alone are not yet the dominant cost at this size |
| Detailed (individually-drawn) links | ~300-500 | §5/§8's arithmetic — roughly where links stop being a minority of draw-call cost, while preserving the glowing-tube identity for what's actually near/active/selected |
| Total links (detailed + aggregate combined) | Unbounded upstream, flat rendering cost past the detailed cap | The entire point of the split — data growth stops being a rendering cost past this line |
| Labels | Already capped (`MAX_VISIBLE_LABELS`) | No change needed |
| Lights | 3/4/6 by tier (existing) | Already correctly fixed |
| Total scene draw calls | ~800-1,200 soft ceiling, ~2,000 hard "start degrading" line | §4/§8: ~500-600 from a full 300-node body set already consumes most of a comfortable mobile budget; leaves headroom for the detailed-link cap plus fixed overhead |
| Per-frame allocations | Near-zero in steady state | Largely achieved already by this session's/prior sessions' fixes; the one remaining M-scaling gap is the library-owned `calcLinkCurve()` call, unaddressable from app code |
| GPU uploads | O(detailed-tier link count), not O(all links) | Direct consequence of the split |

---

## 17. Keep / Modify / Replace / Defer

| Category | Item | Why |
|---|---|---|
| **Keep** | `overview(limit=300)` node bounding; node LOD swap (full-fidelity ↔ macro); label cap; fixed star-light pool; backdrop bake; adaptive quality controller; `52d1abb`'s curved-link geometry reuse (still valuable — it eliminated real per-object construction waste, just not the draw-call-count floor); `f5d4dab`'s callback stabilization; `dc24d2d`'s cache-validity guard; `18d73b8`'s throttling fixes; `d24f7cc`'s charge-force removal | All correctly architected already; none are the confirmed ceiling identified in this audit |
| **Modify** | `linkVisibility`/`LINK_LOD_MIN`/`LINK_LOD_ZOOM`/`LINK_LOD_CUTOFF` — extend the existing binary visible/hidden gate into a three-way detailed/aggregate/hidden classification | Reuses existing, already-correct infrastructure; the smallest change this evidence supports for closing the actual gap |
| **Modify** | `Graph3D` React boundary — a `React.memo` wrapper with a comparator treating ref-based props as stable | Real, bounded, low-risk secondary win (§7); does not touch draw-call count but removes an unnecessary cost independent of N/M |
| **Replace** | The "every visible link is its own individually-managed `Mesh`" assumption — for the proposed aggregate/far tier only | The one piece of current architecture confirmed unable to scale past roughly hundreds-to-low-thousands of simultaneously visible links (§5/§13) |
| **Defer** | Node-body instancing | Already investigated and explicitly declined earlier in this program for a real visual-identity conflict (per-node-unique procedural appearance); this audit's evidence does not change that calculus |
| **Defer** | A fully generalized "Galaxy view model" abstraction layer covering every data type | The evidenced problem is specifically links (§5/§11); a narrower, link-focused fix is proportionate to the evidence |
| **Defer** | Native rendering / a WebView wrapper | Would not solve the architectural problem (§15); revisit only after a link-detail/aggregate split ships and a new ceiling, if any, is identified |
| **Defer** | Server-side link cap or a change to `overview()`'s node-selection algorithm | Real (§11), but changes what data the app works with, not just how it's drawn — a differently-scoped, riskier change than a rendering-layer fix, and the rendering fix alone is sufficient to hit the proposed budget (§16) regardless of how large the real link count grows |

---

## 18. Prioritized roadmap

**Phase 1 — Measure on the real device (no code risk, highest-value-per-effort)**
- Problem: every quantitative estimate in this document (§4/§8/§13) is source-derived, not
  measured. The real device's actual N/M/draw-call numbers are unknown.
- Evidence: `PerfHUD`'s existing `renderer.info.render.calls`/`triangles`/`galaxyCounts`
  counters (Stage 0 of the earlier Performance Program) are already wired and exposed via
  `?perf=1` — they have apparently never been read back on the real device during any of the
  prior five Galaxy performance investigations.
- Expected impact: converts every estimate in this document into a fact before any further
  implementation decision is made; also reveals the account's actual link count, which
  determines how urgent the link fix genuinely is for this specific user's data.
- Implementation risk: none (read-only).
- Visual risk: none.
- Scalability benefit: informational, not itself a fix — but gates whether Phase 2's
  aggressiveness (e.g. where to set the detailed-link cap) is well-tuned.
- Incremental or architectural: neither — pure measurement.

**Phase 2 — Link detail/aggregate split**
- Problem: unbounded, individually-drawn link tube meshes (§5/§8/§11) — the confirmed-dominant,
  still-unaddressed cost.
- Evidence: §5 (one link = one draw call, always curved, no batching anywhere), §8 (draw-call
  count as the dominant main-thread cost), §14 (`52d1abb` proved construction-cost fixes alone
  don't move this).
- Expected impact: caps draw calls contributed by links regardless of how large the account's
  induced-subgraph link count grows — directly targets the confirmed-dominant cost.
- Implementation risk: moderate — new shared-geometry code, a classification pass (reusable
  from the existing binary LOD infrastructure), disposal correctness for a shared buffer.
- Visual risk: real but bounded and precedented — extends the *already-proven* near/far
  pattern established for node bodies (full-fidelity ↔ macro) to links; does not touch the
  near/active/selected link experience at all.
- Scalability benefit: the largest of any item in this roadmap — this is the one change
  whose absence is confirmed capable of causing the catastrophic collapse regardless of node
  count.
- Incremental or architectural: architectural (the one genuinely architectural change this
  evidence supports — everything else is a smaller, more contained fix).

**Phase 3 — `React.memo` boundary around `Graph3D`**
- Problem: unnecessary outer-digest re-runs on every unrelated `App.tsx` render (§7).
- Evidence: no `React.memo` exists; §7's confirmed trace of which props are/aren't stable.
- Expected impact: removes a real, secondary, bounded CPU cost independent of N/M growth.
- Implementation risk: low-moderate (must verify no prop passed to `Graph3D` legitimately
  needs to update on every parent render — the same care the React-prop-identity audit
  already flagged).
- Visual risk: low, if the comparator is correct.
- Scalability benefit: modest, bounded — does not touch draw-call count.
- Incremental or architectural: incremental.

**Phase 4 — Server-side link-count visibility (optional, gated on Phase 1's result)**
- Problem: the client has no idea how large M is until after fetching everything.
- Evidence: §11 (no cap, no visibility into actual link count today).
- Expected impact: lets Phase 2's detailed/aggregate threshold be data-informed rather than a
  fixed guess, and gives the product team an early signal for genuinely link-heavy accounts.
- Implementation risk: low (additive metadata only).
- Visual risk: none.
- Scalability benefit: tuning quality for Phase 2, not a fix on its own.
- Incremental or architectural: incremental.

**The roadmap deliberately does not recommend another micro-optimization ahead of Phase 2.**
Per §14's reconciliation, this codebase has already correctly executed several rounds of
micro-optimization (charge-force removal, callback stabilization, throttling, geometry-reuse)
with real, confirmed, but individually-insufficient effect — the evidence in this document
points at one specific, still-open architectural gap (unbounded, unbatched link rendering),
and the smallest change that closes it is Phase 2, not a further round of per-frame tuning.

---

## 19. Evidence classification — index

**CONFIRMED** (direct source/runtime evidence): the seven-tier `classify()` boundary and
per-tier node-child inventory (§4); node cache-key composition and its lack of eviction for
geometry/macro-texture caches (§4); every visible link is a curved `TubeGeometry` `Mesh`, never
a straight `Line` (§5); `linkWidth`/`nodeThreeObject` are the only two props in
three-forcegraph's expensive clear gate, both already stabilized (§3/§7); `EdgesRepo.within()`
has no link limit (§11); `overview()`'s node-selection query and its degree-ordering (§11);
View switching causes no `graphData` replacement/refetch/reheat/cache-invalidation (§2/§10);
the full `tick()` per-frame operation inventory with line citations (§6); zero
`InstancedMesh`/`BatchedMesh`/merge-utility occurrences anywhere in `packages/web/src/graph/`
(§1, re-verified this session); the exact content and intent of all seven reconciled commits
(§14, direct `git show`).

**HIGH CONFIDENCE** (multiple independent lines of evidence): draw-call count is the dominant,
threshold-crossing cost behind the catastrophic collapse (§8/§13) — supported by the sandbox's
link-disable draw-call delta, the node/link object-count arithmetic (§4/§8), and the
reconciliation pattern across all seven commits (§14); real production accounts plausibly
accumulate denser hub-to-hub induced subgraphs over time via uncapped hub-inbound edges
(§11) — supported by source-confirmed mechanism, not measured on a real account; the
"input frozen, then catches up" symptom matches main-thread draw-call submission stalling
better than pure GPU fill-rate starvation (§8/§13).

**POSSIBLE** (plausible, insufficient evidence to confirm): GPU fill-rate/overdraw from glow
sprites and bloom as a meaningful independent contributor (§8/§13) — real per-pixel cost
exists, but cannot be separated from draw-call-count cost without real-device GPU/driver
profiling; the node-visual-cache-key gap (mass/celestial tier not included) ever actually
causing a stale-tier render in practice (§4) — no code path was found that would trigger it,
but the server-side data flow that populates `GraphNode` was not audited in this pass.

**REFUTED**: the naive "top-degree selection always densifies the induced subgraph" hypothesis
**as applied to the synthetic `seedLarge` generator specifically** (§11) — direct simulation
shows the opposite trend at scale for that generator; "fewer labels" as the dominant Small-View
speedup factor (already refuted by the existing architecture audit, re-confirmed here — labels
are already capped independent of cluster state, §4/§6); repeated node/link rebuilds as the
cause of the *standing* Large-View collapse (§3/§7 — this mechanism was real but is a
different, already-fixed symptom, the camera-motion-triggered storm addressed by `b520cc1`).

**UNKNOWN**: the real device's actual N (nodes)/M (links)/draw-call counts for the account
that produced the reported 0-1fps collapse (§1/§8/§13/§20 — the single largest gap in this
entire audit); the exact GPU/driver behind the affected device's WebGL implementation and its
specific draw-call-overhead characteristics; whether real production accounts' induced-
subgraph density actually reaches the "links dominate" regime described in the existing
architecture audit's table, or stays well below it; the true cache-hit rate of `getGeometry`
across a realistic (non-synthetic) mass distribution.

---

## 20. Unknowns and required future measurements

This audit — like every one of the five prior Galaxy performance documents that preceded it
in this repository — was conducted with **no real-device or real-browser WebGL access**. Every
quantitative claim above that is not directly traceable to a git-committed source line or a
prior sandbox measurement is explicitly labeled an estimate, not a fact. The single most
valuable next step, requiring zero code changes and zero implementation risk, is:

1. **Read `PerfHUD`'s already-exposed `renderer.info` counters (`?perf=1`) on the real,
   affected device while it is showing the catastrophic Large View** — `draw calls`,
   `triangles`, `programs`, and the already-wired `galaxyCounts` (`trackedNodes`,
   `visibleNodes`, `trackedLinks`, `visibleLinks`). This converts every estimate in §4/§8/§13
   into a measured fact, and specifically resolves whether this account's real M sits in the
   "roughly even" or "links dominate overwhelmingly" regime the existing architecture audit's
   own table (§5 there) describes.
2. **Determine the real device's GPU/driver** to characterize its actual per-draw-call
   overhead — this cannot be inferred from source and materially affects how aggressive a
   proposed detailed-link cap (§16) needs to be.
3. **Separate CPU-submission cost from GPU fill-rate cost** on the real device (e.g. via a
   browser profiler's GPU timeline, if available on that device/browser) to confirm or
   refute the "POSSIBLE, secondary" classification given to overdraw/bloom in §8/§13.
4. **Measure the real account's induced-subgraph link density** directly (the exact query
   `overview()` already runs, inspected against the real production database) rather than
   relying on the synthetic-generator simulation in §11, which this audit explicitly found
   does NOT transfer to real, hub-accumulating production data.

None of these four require implementing anything from §16-18 first — they are the
prerequisite for deciding how aggressively to implement them, consistent with this task's own
"measure before building" framing and with Phase 1 of §18's roadmap.

---

## Files inspected (this task)

- `packages/web/src/graph/nodeObject.ts` (full), `packages/web/src/graph/shaders.ts` (full),
  `packages/shared/src/celestial.ts` (full), `packages/web/src/graph/graph3dHelpers.ts` (full)
- `packages/web/src/graph/Graph3D.tsx` (view/visibility wiring, light-pool setup, LOD/fade
  constants, full `tick()` function lines 1278-2183, `nodeThreeObjectCb`/link-prop wiring,
  `<ForceGraph3D>` JSX block)
- `packages/web/src/graph/linkTube.ts`, `packages/web/src/graph/perfDiag.ts`
- `packages/web/src/App.tsx` (View/Lens/isolate handlers, `getGraph()` call sites, `data`/
  `view` state)
- `packages/web/src/components/GalaxyViews.tsx`
- `packages/web/src/graph/orbits.ts` (`getDescendants`, kinematic hierarchy build)
- `packages/server/src/graph/service.ts`, `packages/server/src/repositories/edges.repo.ts`,
  `packages/server/src/api/routes/graph.ts`, `packages/server/src/seed.ts`
- `packages/server/src/ingestion/associativeLink.ts` (hub-edge-cap check)
- `node_modules/three-forcegraph/dist/three-forcegraph.mjs` (link/node creation branch,
  digest/clear gates, `calcLinkCurve`)
- `node_modules/react-kapsule/dist/react-kapsule.js` (prop-diff mechanism)
- `docs/specs/soumaya-galaxy-rendering-architecture-audit.md` (full, existing — extensively
  cited, not re-derived where its conclusions already stand)
- `docs/specs/soumaya-galaxy-react-prop-identity-audit.md` (full, existing — extensively cited)
- `docs/specs/soumaya-galaxy-charge-force-audit.md`, `docs/specs/soumaya-galaxy-cache-disposal-audit.md`
  (referenced via the commits they produced, `d24f7cc`/`dc24d2d`)
- `git show --stat` on all seven named commits: `d24f7cc`, `dc24d2d`, `f5d4dab`, `b520cc1`,
  `18d73b8`, `52d1abb`, `ec5d13b`
- The prior task's sandbox isolation-diagnostic results (`/tmp/galaxydiag-test/results-*.json`,
  already reported to the user in that task's final report)

## Evidence that could not be established without real-device WebGL access

Everything listed in §20, plus: the real magnitude of the CPU-vs-GPU split behind the
catastrophic collapse (§8/§13); whether the sandbox's software-rendering floor masked a
real-device-specific effect not visible in any source-level trace; the actual visual
acceptability of a proposed link detail/aggregate split (§16) — this is a design judgment call
that requires seeing it rendered, not just reasoning about draw-call counts.

---

## Validation

- No source files were changed to produce this document.
- `git status --porcelain` shows only this new file (verified below, before finishing).
- No commit was created.
