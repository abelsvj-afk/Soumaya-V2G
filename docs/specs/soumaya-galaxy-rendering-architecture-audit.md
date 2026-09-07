# Soumaya Galaxy — Rendering Architecture & Scalability Audit

> **AUDIT ONLY. No source code changed. No commit.** This document supersedes the
> narrow, per-mechanism framing of the prior four Galaxy performance audits
> (charge-force, graphData/cache-disposal, React-prop-identity, and the Round 4
> data-dependent-rendering audit that identified per-frame `TubeGeometry`
> reconstruction). Those findings are correct and are **built on, not repeated** —
> cited by reference where relevant. This audit asks the architectural question
> those could not: **why did fixing a real, confirmed, source-verified bottleneck
> (`52d1abb`) produce no measured improvement**, and what does that imply about
> the actual ceiling on this renderer.

---

## 1. Executive conclusion

**CONFIRMED** (by direct source read: zero occurrences of `InstancedMesh`,
`BatchedMesh`, or any geometry-merging utility anywhere in
`packages/web/src/graph/`): **every node body, every glow sprite, every label,
every link tube, and every secondary-system object in the Galaxy is its own,
separately-submitted three.js `Object3D` — one WebGL draw call each.** There is
no batching, no instancing, and no draw-call budget anywhere in this renderer.

This is the answer to the question at the heart of this audit. `52d1abb`
(curved-link geometry reuse) eliminated a real cost — per-frame CPU allocation,
garbage, and GPU buffer *reallocation* for every curved link. But it did **not**
touch the **number of draw calls issued per frame**, because a draw call is
submitted once per `Mesh`/`Sprite`/`Line` object regardless of whether that
object's geometry was freshly built or reused. If draw-call **count** (not
construction cost) is the dominant expense — and every piece of runtime
evidence in this task supports that — then `52d1abb` was necessary-but-far-
from-sufficient: it fixed a real leak in a bucket that was never the deep end.

**HIGH CONFIDENCE**: the small-View-vs-large-View experiment is the cleanest
possible confirmation of this, because a cluster isolate is *the one existing
mechanism in this codebase that actually removes objects from three-forcegraph's
tracked set* (§6) — it doesn't just skip some per-frame math, it collapses the
draw-call count directly and linearly. Every other "fix" attempted so far
(charge-force removal, cache-disposal correctness, prop stabilization,
TubeGeometry reuse) reduced **CPU work per object**, not **the number of
objects** — which is why none of them, individually, could have closed a gap
this large.

**The architectural verdict**: this renderer conflates "how much information
exists" with "how many three.js objects must exist and be drawn." There is no
layer between the server's `overview()` query and `<ForceGraph3D>` that decides
*how much visual detail a given piece of data deserves right now* — every
fetched node and link gets the full, permanent, individually-drawn treatment
regardless of screen size, distance, or relevance. That absence — not any single
buggy function — is what caps this architecture's scaling headroom, and it is
the same absence whether the graph has 300 nodes with 300 links or 300 nodes
with 3,000 links.

---

## 2. Current rendering architecture

```
App.tsx (React)
  └─ getGraph(limit=300)  →  GET /api/graph?limit=300
                                  └─ GraphService.overview(300)  [server, one-shot on load]
  └─ <Graph3D data={...} />
       └─ one big useEffect([]) — mounts once
            ├─ scene setup: sun, station, backdrop (starfield/nebula/milkyway, Points-based)
            ├─ Soumaya ship (glTF), satellites/subAgents/visitors (small, FIXED counts)
            ├─ journeyHubs / moneySky (rebuilt on server push events, not per-frame — throttled since `18d73b8`)
            ├─ <ForceGraph3D> (react-force-graph-3d → 3d-force-graph → three-forcegraph)
            │     ├─ graphData={data}                       — the full fetched node/link set, always
            │     ├─ nodeThreeObject={nodeThreeObjectCb}     — builds ONE THREE.Group per node (nodeObject.ts)
            │     ├─ linkWidth/linkCurvature/linkColor       — always-nonzero → every link is a curved Mesh (tube)
            │     ├─ linkPositionUpdate={linkPositionUpdateCb} — NEW (52d1abb): reuses tube geometry in place
            │     ├─ nodeVisibility/linkVisibility           — the ONLY thing that shrinks the tracked set (cluster isolate)
            │     └─ cooldownTicks/cooldownTime = 9999999    — the simulation "runs" forever (see §7 force config)
            └─ tick() — Graph3D's OWN separate requestAnimationFrame loop
                  ├─ orbit LOD (Stage 5, banded/staggered)
                  ├─ frustum-cull early return per node (Stage 5)
                  ├─ star-light pool reassignment (throttled)
                  ├─ label-cap sticky hysteresis (throttled, caps VISIBLE labels)
                  ├─ satellites/subAgents/visitors update (small, fixed counts)
                  └─ adaptive controller (2s sample; pixelRatio/detailTier/bloom rung)
```

Two **independent** `requestAnimationFrame` loops run every frame:
`3d-force-graph`'s own (`_animationCycle`: `tickFrame()` then `renderObjs.tick()`
— the actual `renderer.render()` call) and Graph3D's own `tick()`. Both are
unconditional, uncapped by object count, and run at whatever rate the browser
schedules rAF (subject to the app's own FPS-cap gate on Graph3D's loop only —
`3d-force-graph`'s own loop has no such gate, confirmed by direct source read
in the Round 4 audit).

---

## 3. Complete object/workload inventory

| Workload | Object count | Per-frame? | CPU cost | GPU cost | Allocations | Scales with |
|---|---|---|---|---|---|---|
| Node full-detail mesh | 1 per node | Position sync every frame (cheap); LOD-swap visibility toggle every ~few frames | Low/node | 1 draw call/node | None (geometry shared, material per-node) | **N (nodes)** |
| Node macro-LOD sibling | 1 per node (hidden unless far) | Visibility toggle only | Negligible | 1 draw call/node **when visible** (mutually exclusive with full-detail, not additive) | None | N |
| Node glow/corona sprite | 1 per star/planet/giant (not asteroid/moon) | Opacity pulse every frame (cheap trig) | Low | 1 draw call | None (texture cached/shared) | ~0.7×N |
| Node label sprite | 1 per node, **capped to MAX_VISIBLE_LABELS** (sticky hysteresis, Stage 5-era fix) | Distance/priority check throttled | Low | 1 draw call, **but bounded** — confirmed not O(N) | None (text-keyed cache, refcounted since Stage 7) | **capped, not N** |
| Star asteroid belt | 1 `THREE.Points` per star | Belt itself static; camera-relative only | Negligible | 1 draw call (360 points, GPU-natively batched) | None | ~0.15×N (star-class only) |
| Gas-giant ring | 1 per ~20% of gas giants | Static | Negligible | 1 draw call | None | small fraction of N |
| **Link tube mesh** | **1 per visible link** | Position sync every frame; geometry now reused in place (`52d1abb`) not reconstructed | Low/link (post-fix); was High pre-fix | **1 draw call/link** | Reduced (no more per-frame alloc, per `52d1abb`) — see §12 for residual | **M (links) — NOT capped server-side (§5)** |
| Link directional particles | 0-2 per link, only when link activity is high | Cheap per-frame position advance | Very low | 1 draw call each, when present | None | small fraction of M, event-driven |
| Journey hub sprite | 2 per active Journey (halo + label) | Throttled 10Hz + visibility-gated (fixed in `18d73b8`) | Negligible now | 1 draw call each | None | Journey count (small, user-curated) |
| Money-sky sprite | 2 per bill/goal (star + glyph) | Throttled 10Hz + visibility-gated (fixed in `18d73b8`) | Negligible now | 1 draw call each | None | bill/goal count (small) |
| Star-light pool | Fixed 3/4/6 `PointLight`s (Stage 4) | Reassigned on a throttle | Negligible | Per-pixel lighting cost on every lit material, **fixed count** (the whole point of Stage 4) | None | **Fixed — does not scale** |
| Satellites/sub-agents/visitors | Small fixed counts (`MAX_TENDERS=5`, `makeVisitors(3,...)`, a handful of satellites) | Per-frame position update, allocation-free (scratch vectors, fixed this session) | Negligible | A handful of draw calls, fixed | None | **Fixed — does not scale** |
| Soumaya ship | 1 glTF (own mesh/material count, unknown exact submesh count without a live inspector) | Curve-following motion math every frame while in transit (scratch-vector-ized this session) | Low | Fixed handful of draw calls | Minimal (scratch vectors) | **Fixed — does not scale** |
| Backdrop (starfield/milkyway/spiral galaxies/dust) | A handful of `Points`/`Sprite` objects, plus one baked cubemap (Stage 3) | Cheap rotation increments only | Negligible | A handful of draw calls, all Points-based (GPU-native batching) | None | **Fixed — does not scale** |
| Bloom (`UnrealBloomPass`) | 1 postprocessing chain, gated (off on Performance tier / by adaptive controller) | Full-screen passes every frame **when on** | GPU fill-rate | Several extra full-screen draw calls | None new | **Fixed extra cost, not data-dependent, but real when enabled** |

**The pattern**: everything that is NOT node/link count is either fixed,
capped, or already throttled from this session's prior fixes. **Nodes (N) and,
critically, links (M) are the only two workloads in the entire scene that scale
with the user's actual data volume, and neither has a rendering-side cap.**

---

## 4. The true rendering budget — node count is not the whole story

**CONFIRMED, direct arithmetic from §3**: even bounding nodes at the server's
`overview(limit=300)`, a "fully populated" 300-node galaxy is not 300 units of
draw-call work. Per node (typical mid-zoom, full-detail LOD active): 1 mesh + 1
glow (≈70% of nodes) + a capped share of labels + occasional ring/belt. That's
roughly **1.7–2× N draw calls from nodes alone before a single link is
counted** — for N=300, **≈500–600 draw calls just for bodies.**

Then links. The server places **zero cap on M** (§5). At M=300 (a 1:1 node:link
ratio, a conservative assumption for a lightly-connected graph), that's another
**300 draw calls**. At M=2,000 (shown in §5 to be plausible for a mature,
multi-month account whose `overview()` deliberately selects the *most*
interconnected 300 nodes), that's **2,000 more** — pushing total scene draw
calls into the **2,500–3,000+** range, on top of the ~500–600 from bodies and a
small fixed overhead from everything else in §3.

**HIGH CONFIDENCE** (well-documented WebGL/mobile-GPU behavior, not directly
measurable in this sandbox): a few thousand draw calls per frame is a genuinely
heavy load for `WebGLRenderer` on a mobile GPU/driver — each draw call carries
real CPU-side overhead (state validation, uniform/attribute binding, command
buffer construction) that is **synchronous on the JS main thread**, independent
of whatever the GPU itself can chew through in parallel. This is the load-
bearing number this audit needed and none of the prior four had computed
explicitly: **draw-call count, not node count, is the actual rendering
budget, and it is currently unbounded on both axes (N and M).**

---

## 5. Link scaling — re-verified and extended from the Round 4 audit

Re-confirmed by direct source read (`packages/server/src/graph/service.ts`,
`repositories/edges.repo.ts`):

1. **`overview(limit=300)` bounds NODES only.** `EdgesRepo.within(ids)` returns
   *every* edge where both endpoints are in the selected 300 — no `LIMIT`, no
   truncation. **CONFIRMED.**
2. **No production link cap exists anywhere in this path.** Grepped the full
   route (`api/routes/graph.ts`) and service — no link-count guard.
   **CONFIRMED.**
3. **Top-degree selection actively amplifies density.** `ORDER BY degree DESC`
   picks the 300 *most interconnected* nodes, not a random sample — this
   maximizes, not minimizes, the induced-subgraph edge count relative to node
   count. **CONFIRMED** (re-read the exact SQL this session and the prior one).
4. **Hubs accumulate unbounded inbound edges.** `associativeLink.ts`'s
   `maxLinks: 3` only caps a *newly-created* node's own outbound links; nothing
   caps how many other nodes may later link *into* an existing one. A match
   against a constellation hub (`kind === "moc"`) creates an edge with
   **explicitly "no LLM gate and no cap"** (source comment, `associativeLink.ts:57-70`).
   Multiple other files (`dreamCycle.ts`, `constellationReconcile.ts`,
   `constellations.ts`, `inquiry.ts`, `dailyContact.ts`, `cognitive.ts`,
   `ideas.ts`) also call `edges.create()` — none individually re-audited for
   caps in this pass, but each is one more independent, ongoing source feeding
   the same uncapped degree pool. **CONFIRMED** (mechanism) / **HIGH
   CONFIDENCE** (that the aggregate effect is large for an actively-used,
   multi-month account — no live database was available to measure the exact
   number).
5. **Induced-subgraph link count can become large.** Given (3) and (4)
   together: the *specific* 300 nodes chosen are the ones most likely to have
   accumulated many edges to *each other* over the account's lifetime (shared
   popular hubs cross-link to other popular hubs disproportionately). **HIGH
   CONFIDENCE.**
6. **Theoretical upper bound**: `C(300,2) = 44,850` directed pairs; realistic
   bound is far lower since edges require real semantic similarity/LLM
   validation, not random connection.
7. **Realistic range, by node count** (formulas/estimates, explicitly not
   measured — no production database was reachable from this sandbox):

   | Nodes fetched | Naive assumption (1.5×N) | This app's actual mechanism (hub-biased induced subgraph) |
   |---|---|---|
   | 50 | ~75 | tens to ~150, depending on how many accumulated hubs are in this set |
   | 100 | ~150 | could exceed 200-300 if several long-lived hubs fall in this set |
   | 200 | ~300 | plausibly 400-800 for an actively-used account |
   | 300 | ~450 | **plausibly several hundred to 1,000+; not bounded above that by anything in the code** |

**Which workload dominates at each hypothetical M** (draw calls; N=300 nodes ≈
550 draw calls held constant):

| M (links) | Link draw calls | Total scene draw calls (≈) | Dominant cost |
|---|---|---|---|
| 100 | 100 | ~650 | Nodes still dominate |
| 500 | 500 | ~1,050 | Roughly even |
| 1,000 | 1,000 | ~1,550 | **Links dominate** |
| 2,000 | 2,000 | ~2,550 | Links dominate heavily |
| 5,000 | 5,000 | ~5,550 | Links dominate overwhelmingly — plausibly explains 0-1 FPS outright |
| 10,000 | 10,000 | ~10,550 | Firmly outside any mobile GPU's comfortable draw-call budget |

This table is the answer to Part 3's core ask: **links can and plausibly do
outscale nodes by an order of magnitude in this specific application, because
of how `overview()` selects nodes — and there is currently no visibility into
which end of this table a given real account sits at**, which is itself a gap
(§20).

---

## 6. Small-View vs. large-View — traced, not assumed

Re-traced `nodeVisibility`/`linkVisibility` (`Graph3D.tsx`, confirmed this
session and the last): `!cluster || cluster.has(n.id)` /
`cluster.has(source) && cluster.has(target)`. Three-forcegraph's digest calls
`.digest(state.graphData.nodes.filter(visibilityAccessor))` for BOTH nodes and
links — **CONFIRMED, re-verified against `three-forcegraph.mjs` this session**:
a node/link that fails the visibility filter is not merely `.visible=false`'d,
it is **excluded from the tracked object set entirely**, and three-forcegraph's
own removal path (`_deallocate`) disposes its Object3D.

This means switching to a small cluster View does **all** of the following
simultaneously, not just one:
- Fewer nodes → fewer full-detail meshes, glows, macro-LOD siblings, labels.
- Fewer links → fewer tube meshes (this is the one the Round 4 audit and
  `52d1abb` focused on).
- **Directly and linearly fewer total tracked Object3Ds, hence fewer draw
  calls** — this is the mechanism most consistent with the *severity* of the
  observed speedup, per §4's arithmetic: going from ~2,500-3,000 draw calls
  down to (5-10 nodes × ~2 objects + a handful of links) ≈ **20-40 draw calls**
  is a two-orders-of-magnitude reduction, which lines up with "dramatically
  faster," not just "somewhat faster."
- Fewer per-frame animation updates (orbit LOD, pulse, curve position sync) —
  real, but each is individually cheap (§7); this alone would not explain a
  100× speedup.

**HIGH CONFIDENCE**: the dominant contributor is **draw-call count collapsing**
(direct consequence of fewer tracked Object3Ds), not the secondary per-frame
math savings. **REFUTED**: "fewer labels" alone — labels are already capped
independent of cluster state (§3), so this cannot be the dominant factor.
**POSSIBLE, not primary**: reduced GC pressure from fewer per-frame
allocations — real, but secondary to the draw-call-count explanation given the
magnitude of the observed speedup.

---

## 7. Per-frame execution map (ranked)

| Rank | Work | Complexity | Frequency | Allocation | Likely impact |
|---|---|---|---|---|---|
| 1 | **`renderer.render()`'s draw-call submission** (not app code — three.js/WebGL internals) | **O(total tracked Object3Ds)** = O(N + M + fixed) | Every real frame, both rAF loops | None new (WebGL command buffer only) | **Dominant — see §4/§8** |
| 2 | Link position sync + curve/geometry update (`layoutTick`, now via `linkPositionUpdateCb`) | O(M) | Every real frame | Reduced by `52d1abb`; residual: `computeFrenetFrames` + arc-length cache per link (documented limitation in `linkTube.ts`) | High before `52d1abb`; now moderate, bounded by M |
| 3 | Node position sync (`layoutTick`) | O(N) | Every real frame | None | Low |
| 4 | Orbit LOD update | O(N), banded 1/2/4-frame | Every real frame | None (Stage 5 fix) | Low |
| 5 | Frustum-cull early return + per-child LOD/pulse loop | O(N × ~5 children) for non-culled bodies | Every real frame | None | Low-moderate |
| 6 | Journey-hub/Money-sky update | O(Journeys+bills) | Throttled 10Hz (fixed this session) | None | Negligible now |
| 7 | Satellites/subAgents/visitors update | O(fixed small count) | Every real frame | None (scratch-vectorized this session) | Negligible |
| 8 | Star-light pool scan | O(N) | Every ~6 frames | None | Negligible |
| 9 | Label-cap sticky scan | O(N) | Every ~6 frames | None | Negligible |
| 10 | Adaptive controller sample | O(1) | Every 2s | None | Negligible |
| 11 | React-driven `onUpdateObj` digest (link/node color/material) | O(visible N+M) | On React-render cadence (linkColor is unmemoized — every Graph3D render, not every rAF frame) | Some (new Color objects) | Moderate, bounded by render frequency not rAF frequency |
| 12 | Garbage collection (aggregate of all of the above) | — | Triggered when allocation rate crosses GC thresholds | — | **Plausibly a real contributor to the "freeze, catch up" pattern (§8) — bursty, not steady** |

---

## 8. CPU vs. GPU vs. GC — diagnosis

**The symptom**: "input appears delayed/frozen, then the Galaxy catches up for
a frame." This is diagnostic of the **main JS thread being busy for an extended,
synchronous stretch inside a single `requestAnimationFrame` callback** — input
events (touch/pointer) are queued and processed on the same thread, so a long
synchronous frame directly delays input handling until that frame's JS
finishes. This is **not** characteristic of pure GPU fill-rate starvation
(which would show as smooth-but-slow scaling, not stutter-then-catch-up), and
it's a stronger match for either (a) a very long single-frame CPU cost, or (b)
periodic GC pauses.

Given §4's evidence (a potential 2,500-10,000+ draw calls per frame): issuing
that many `gl.drawElements`/`gl.drawArrays` calls is **itself** synchronous
CPU-side work inside the render call — three.js's `WebGLRenderer.render()` walks
its render list and issues one WebGL call per object, on the main thread. A
frame with thousands of draw calls is a **long, synchronous main-thread
stretch by construction**, independent of whether the GPU can keep up — this
directly produces the observed "frozen, then catches up" pattern.

- **CPU saturation**: **HIGH CONFIDENCE** as a major contributor — draw-call
  submission volume (§4) plus the O(M) per-frame link math (§7, rank 2) are
  both synchronous main-thread costs that scale with the same variables (N, M)
  the runtime experiment (§6) implicates.
- **GPU saturation**: **POSSIBLE**, cannot be ruled out or confirmed without a
  real device profiler (no WebGL/GPU access in this sandbox) — thousands of lit
  `MeshLambertMaterial` tube draws plus per-node `MeshStandardMaterial` bodies
  is real per-pixel/per-vertex work too, especially with bloom on. Likely a
  contributing, not sole, factor.
- **GC pressure**: **POSSIBLE, secondary** — real per-frame allocation exists
  (rank 2, rank 11) but has already been substantially reduced by this
  session's fixes (Stage 2 historically, plus this session's soumaya/journeyHubs/
  moneySky/TubeGeometry work); unlikely to be the *sole* explanation given
  `52d1abb` (which specifically targeted the largest remaining allocation
  source) produced no measured improvement.
- **Combination — most likely answer, not asserted with certainty**: draw-call
  volume (CPU, dominant) + link position/curve math (CPU, secondary) + GPU
  fragment/vertex cost from many lit, glowing materials (contributing,
  unquantified) + occasional GC (contributing, reduced but not eliminated).

**UNKNOWN, and flagged as the single most valuable next measurement**: the
actual `renderer.info.render.calls`/`triangles`/`geometries` counts on the real
device. **This is not a gap this audit invented** — `perfStats.ts`/`PerfHUD.tsx`
already expose exactly these counters (Stage 0, confirmed present and wired).
**They have apparently never been read back during any of the last five Galaxy
performance investigations.** This is the cheapest, most direct way to convert
§4's estimate into a measured fact.

---

## 9. React / main-thread coupling analysis

- **Which React renders reach Graph3D**: `hoverId`/`cluster` (2 local
  `useState`s) plus any parent (`App.tsx`) re-render, since `Graph3D` is
  **not** wrapped in `React.memo` (confirmed, re-verified this session — no
  `memo(...)` wrapper exists). `App.tsx`'s `useCountUp`/polling hooks
  (confirmed in the Round-2 audit and re-checked this session: only 2 call
  sites, `memCountShown`/`streakShown`, both infrequent — **REFUTED** as a
  frequent, per-second trigger, contrary to a plausible-sounding hypothesis).
- **Unstable props**: `linkColor`, `nodeVisibility`, `linkVisibility` remain
  inline/unmemoized (confirmed, unchanged this session — only `nodeThreeObject`
  and `linkWidth` were stabilized in an earlier commit this session, because
  those two specifically sit in three-forcegraph's *narrow clear gate*, per the
  React-prop-identity audit). **`linkPositionUpdate` (new, this session) is
  also unmemoized-in-effect** (recreated whenever `linkWidthCb` changes) but is
  **not** in the narrow clear-gate list (confirmed by source), so this is
  harmless.
- **Stable callbacks**: `nodeThreeObjectCb` (`[]`), `linkWidthCb` (`[activeId]`),
  `linkPositionUpdateCb` (`[linkWidthCb]`, this session) — confirmed correct
  per the established audit trail.
- **Does ForceGraph internally flush expensive state on prop changes?**
  **CONFIRMED, re-verified**: only `nodeThreeObject`/`linkThreeObjectExtend`
  (nodes) and `linkThreeObject`/`linkThreeObjectExtend`/`linkWidth` (links) sit
  in the *narrow* clear-gate that forces a full dispose+rebuild of every
  tracked object. Both are already stabilized. Everything else (`linkColor`,
  visibility accessors) sits only in the *outer, cheap* digest, which re-runs
  the (no-op for unchanged ids) `.digest()` call and `onUpdateObj`'s
  color/material assignment — bounded by N+M, not by anything worse.
- **Can unrelated UI state affect Galaxy rendering?** **HIGH CONFIDENCE, yes,
  but boundedly**: any App.tsx re-render reaches Graph3D's render body (no
  memo boundary) and re-runs the outer digest (rank 11, §7) — real but not
  catastrophic on its own, since it's bounded by N+M rather than being an
  independent multiplier.
- **Should the Galaxy be isolated behind a stable imperative boundary?**
  **HIGH CONFIDENCE — not the primary fix, but a legitimate, low-risk hardening
  step.** Wrapping `Graph3D` in `React.memo` (with a comparator that treats
  the already-ref-based props as stable) would eliminate the *entire* rank-11
  outer-digest cost during unrelated app renders. This is real and free to fix,
  but it caps a bounded, secondary cost — it will not touch draw-call count
  (§4), so it must not be mistaken for an architectural fix.

---

## 10. Data scale vs. render scale — the central question

**CONFIRMED: no such boundary currently exists.** The pipeline today is
literally:

```
Database  →  overview(300)  →  every returned node+link becomes
              a permanent, full-detail, individually-drawn Object3D
```

There is no "Galaxy view model" layer, no notion of "this node is currently
far/small/irrelevant, represent it cheaply," and no separation between "what
`overview()` decided to fetch" and "what actually deserves a full three.js
object right now." Once a node/link clears the `nodeVisibility`/`linkVisibility`
filter (true for everyone, unless a cluster isolate is active), it is drawn at
full fidelity, forever, regardless of screen size or distance.

**Minimum version that solves the actual, evidenced problem** (not the maximal
architecture sketched in the task prompt — see §15 for why the smaller version
is the right scope):

```
Database (unbounded)
   ↓
overview(300) — KEEP, already bounded and cheap (§2)
   ↓
Galaxy view model  — NEW, thin: annotate each node/link with a cheap
                       "detail tier" (near/far) computed from distance to
                       camera + a render budget, recomputed on a throttle
                       (not every frame)
   ↓
Three.js — nodes: unchanged (already LOD-swapped near/far, §3); links: the
           NEW piece — batch/instance far or low-priority links instead of
           giving every one its own Mesh+draw call (§12)
```

This is **not** a rewrite of the ingestion/intelligence pipeline (out of
scope, and unnecessary — nothing in this audit's evidence points at the
database or `GraphService` as the bottleneck beyond the already-identified
link-count issue in §5). It is specifically a **rendering-layer** insertion:
decide draw-call budget *after* fetch, *before* handing objects to
three-forcegraph.

---

## 11. LOD / representation strategy

**Compatible with the existing visual identity — HIGH CONFIDENCE.** The Galaxy
already has a working near/far LOD swap for node BODIES (full-detail mesh ↔
macro-LOD sibling, Stage 5) and a label-visibility cap. The *missing* half is
links, which have no equivalent far/aggregate representation — every link is
full-detail (a lit, glowing tube) at every distance, regardless of camera
position or whether it's even likely to be looked at. Extending the *already-
proven* near/far pattern to links (§12) is a continuation of established
design, not a new visual language — it does not risk "looking like a generic
graph" any more than the existing macro-body swap does.

**FAR**: a link far from camera / rarely active could be a plain thin `Line`
segment (still curved-ish via more segments if desired, or straight — a
straight-vs-tube distinction is already visually present in three-forcegraph's
own default behavior for zero-width links) rendered via a **single shared,
batched geometry** for the whole tier (§12), not one object each.
**MID**: current tube-mesh treatment, but only for links within some priority/
distance band.
**NEAR/SELECTED**: exactly today's per-link glowing tube with full activity-
based color/width/curvature response — unchanged for the links a user is
actually looking at or interacting with.

This does not touch node rendering at all — nodes already have a working LOD
story (§3); the gap is entirely on the link side.

---

## 12. Link rendering architecture — can per-link individual meshes scale?

**CONFIRMED, direct answer: no, not past a few hundred to ~1,000 simultaneously
visible links**, for the reason established in §4 — each is an independent
draw call with no batching, and mobile WebGL draw-call overhead is the
best-documented, most GPU/driver-independent scaling wall in real-time 3D
rendering. This holds **regardless of how cheap each individual link's geometry
construction is** — `52d1abb` already proved that empirically: eliminating the
per-frame construction cost did not fix the underlying draw-call ceiling.

Options evaluated against this specific codebase:

- **Instanced geometry (`InstancedMesh`)**: works well for identical geometry
  with per-instance transform/color, but this app's links have **per-link,
  continuously-varying curvature and endpoints** (not a rigid transform of a
  shared shape — §6/prior session's TubeGeometry analysis already established
  this) and per-link color/opacity from `linkColor`. `InstancedMesh` supports
  per-instance color via an instance attribute, but a genuinely different
  *curve shape* per instance is not what instancing is designed for (it shares
  one base geometry). **POSSIBLE for a FAR/aggregate tier of links rendered as
  simple straight segments** (where per-instance transform + color is
  sufficient); **not a good fit for the NEAR/glowing/curved tier**, which needs
  to keep its current per-link mesh approach.
- **GPU line rendering (`Line2`/fat lines, or a single merged `LineSegments`
  buffer)**: a strong fit for a FAR/low-priority tier — one `BufferGeometry`
  holding all such links' start/end points, one draw call total, updated by
  writing into a shared position buffer instead of one buffer per link. Loses
  the individually-curved-tube look, which is why it belongs in a FAR tier, not
  as a wholesale replacement.
- **Batched geometry merging**: would require rebuilding the merged buffer
  whenever the *set* of far links changes (not every frame) — a much lower and
  bounded cost, since far/aggregate links don't need per-frame curve fidelity.
- **Capped active detailed links**: a direct, simple lever — e.g., only the N
  most-active/nearest links ever get the full tube treatment; everything else
  automatically demotes to the shared/batched tier. This is a natural
  extension of the *already-existing* `LINK_LOD_MIN`/`LINK_LOD_CUTOFF`
  mechanism (Graph3D.tsx), which today only toggles visibility, not
  representation — the infrastructure to know "which links are unimportant
  right now" already exists and is unused for this purpose.

**Verdict**: keep the current per-link tube mesh for a **bounded, capped**
tier of near/active/selected links (this preserves 100% of the "living,
glowing, curved" identity for what a user is actually looking at); move
everything else into one shared/batched/instanced representation. This is
additive to, not a replacement of, `52d1abb`'s work — the tube-reuse fix still
matters for whatever remains in the detailed tier.

---

## 13. Instancing / batching audit

- **Already shared**: node geometries (size-keyed cache, `getGeometry`),
  glow/label textures (refcounted, Stage 7), the star-light pool (fixed-count,
  Stage 4), index/UV buffers for link tubes (this session's `linkTube.ts`,
  shared across all links of the same tubular/radial segment count).
- **Already shared materials**: straight-cylinder link materials
  (`lambertLineMaterials`/`basicLineMaterials`, keyed by color — three-
  forcegraph's own cache).
- **NOT shared**: every node's own `MeshStandardMaterial` (`nodeObject.ts`) is
  constructed fresh per node (color/tint varies per node — **CONFIRMED**, this
  session's direct read) — meaning even nodes sharing geometry cannot be
  auto-batched by three.js (different material = different draw call
  regardless).
- **Could theoretically be instanced**: node bodies of the same class (e.g.,
  all "asteroid" or "moon"-class bodies) are geometrically near-identical,
  differing mainly in size (already geometry-bucketed) and color/tint. An
  `InstancedMesh` per body-class, with per-instance color via an instance
  attribute, is technically feasible.
- **Would it actually help, and would it conflict with existing behavior?**
  **HIGH CONFIDENCE — real conflicts, not fatal but nontrivial**: today, each
  node's tick-loop work (spin, pulse, LOD swap, orbit position, per-child
  frustum handling) operates on that node's OWN `Object3D` (`position`,
  `rotation`, `visible`). Converting to instancing means moving all of that
  into per-instance matrix/attribute updates on a shared mesh — a real
  rewrite of the hottest part of the tick loop (previously and explicitly
  **declined** earlier this session after being scoped in detail, precisely
  because of this same per-node-unique-appearance conflict — see this
  session's "Stage 7 macro-body batching — investigated, explicitly declined
  by the user, closed" decision). **This audit does not overturn that decision
  for node bodies** — nothing new here changes the calculus that made it
  correct. **Links are a different, better-justified case for batching**
  specifically because a FAR/aggregate tier of links can legitimately look
  simpler (§12) without violating the "don't make it look cheaper" rule, since
  it only applies to links a user isn't focused on anyway.
- **Is current object complexity high enough to make instancing worth it (for
  the FAR link tier specifically)?** **HIGH CONFIDENCE, yes** — per §5's link-
  count table, this is precisely the regime (hundreds to thousands of objects)
  where per-object draw-call overhead dominates and instancing/batching
  provides its largest win.

---

## 14. Proposed performance budget

Justified from §4/§8, not arbitrary:

| Budget item | Target ceiling | Justification |
|---|---|---|
| Detailed (full-mesh, individually drawn) nodes | ~300 (current cap) | Already the practical node ceiling; §4 shows nodes alone are not yet the dominant cost |
| **Detailed (individually-drawn, near/active) links** | **~300–500** | §5's table shows this is roughly where links stop being a minority of draw-call cost; keeps the "glowing curved tube" identity for what's actually visible/relevant |
| Total visible links (detailed + batched/aggregate combined) | Unbounded upstream, but rendering cost flat past the detailed cap | The point of §12's architecture — data volume stops being a rendering cost past this line |
| Animated (activity-pulsing) links | Subset of the detailed tier only | Aggregate/far links don't need per-frame activity animation |
| Labels | Already capped (`MAX_VISIBLE_LABELS`, existing) | No change needed — already correctly bounded |
| Dynamic lights | 3/4/6 by tier (existing, Stage 4) | Already correctly fixed-count |
| Per-frame allocations | Near-zero in steady state (already largely achieved this session) | GC pause avoidance |
| GPU buffer updates | O(detailed-tier link count), not O(all links) | Direct consequence of §12 |
| **Draw calls, total scene** | **~800–1,200 as a soft ceiling, ~2,000 as a hard "start degrading" line** | §4's own arithmetic: ~550 from a full 300-node body set is already most of a comfortable mobile budget; leaves headroom for the detailed-link cap (§12) plus fixed overhead, while explicitly preventing the observed 2,500-10,000+ range |
| Main-thread frame budget | 16.7ms (60fps) / 33ms (30fps) — existing FPS-cap dial, unchanged | Not itself the fix; the fix is keeping typical-frame work under this, not raising the cap |

**The graceful-degradation principle**: today, nothing stops the scene from
silently growing past any of these numbers as the user's data grows — the
renderer has no awareness of its own budget. The architectural fix is not
"pick better numbers," it's "have a number at all," enforced by the
detailed/aggregate split in §12, so that link/node count growth costs
**query time and view-model computation** (cheap, boundable, off the render
critical path) instead of **draw calls** (the thing that actually collapses
FPS).

---

## 15. 5,000 / 20,000 / 100,000-memory scenarios

| | Database | Considered by intelligence (embeddings/KNN/etc.) | Loaded into Galaxy view model | Detailed (individually-drawn) Three.js objects | Active links | Far-distance representation |
|---|---|---|---|---|---|---|
| **A: 5,000 memories** | All 5,000 | All 5,000 (embedding/KNN already scoped per-space, unaffected by rendering) | The `overview()`-selected subset (≤300 nodes today — **unchanged**, already correctly bounded) plus their induced links | ≤300 nodes; ≤~300-500 links (§14's cap) | Rest of the induced links → batched/aggregate tier (§12) | Distant/low-priority nodes: existing macro-LOD swap (unchanged); distant/low-priority links: shared/batched geometry (new) |
| **B: 20,000 memories** | All 20,000 | Same — this layer is already architected to not care about total count (vector KNN, BM25, etc. — outside this audit's scope, no evidence of a rendering-driven bottleneck there) | Same `overview()` selection, same ≤300 cap | Same ≤300 nodes; same detailed-link cap | Larger pool of "everything else," same batched treatment | Same |
| **C: 100,000 memories** | All 100,000 | Same | Same | Same | Same | Same |

**The key point, stated explicitly**: none of these numbers should change
between scenarios A/B/C, because the render-scale ceiling (§14) is a property
of the *rendering layer*, not the database size. **The goal from the task
prompt — "the user should be able to own 20,000 memories without the
application becoming slower merely because the database is large" — is
already halfway achieved today** (the node cap already exists and is correctly
architected); **the missing half is exactly and only the link side (§5/§12)**,
which currently has no equivalent cap and is the one thing in this whole
inventory whose growth is unbounded.

Zoom/pan-driven promotion/demotion (the "should this now become detailed"
decision) is the one genuinely new piece of logic this implies — see §16
Phase 2/3 for where it fits.

---

## 16. Web vs. native — revisited with new evidence

**CONFIRMED, not merely restated**: draw-call-count overhead (§4, §8) is a
property of **the graphics API and driver** (WebGL here), not of JavaScript,
React, or the browser's DOM/CSS layer. A native renderer (OpenGL ES/Vulkan/
Metal via a native wrapper) issuing the exact same number of individual,
unbatched draw calls for the exact same unbounded per-link-mesh architecture
would hit **the same wall**, just with a somewhat higher constant-factor
ceiling (native driver call overhead is typically lower than WebGL's, which
adds its own validation/marshalling layer) — **not a different scaling curve.**
Moving this exact implementation into a Play Store WebView wrapper would
**not** materially solve the problem, because the problem is architectural
(§1), not platform-specific.

**Would a future native renderer help, after §12's architecture is fixed?**
**HIGH CONFIDENCE, yes, modestly** — once draw-call count is bounded (§14),
the remaining per-draw-call overhead difference between WebGL and a native API
becomes the dominant remaining lever, and native APIs generally have lower
per-call overhead and better instancing/compute-shader access. But this is a
**second-order optimization on top of a fixed architecture**, not a substitute
for fixing it — exactly matching the task's own instruction not to use "make
it native" as a shortcut.

---

## 17. Target architecture

```
Database (unbounded, all memories/journeys/bills/etc.)
        │
        ▼
overview(300) — KEEP, already correct, cheap, hub-biased-but-bounded
        │  (nodes bounded; links from this query are NOT bounded — §5)
        ▼
Galaxy view model (NEW — thin, client-side, throttled not per-frame)
        │  • partitions links into DETAILED (near/active/selected, capped
        │    per §14) vs AGGREGATE (everything else)
        │  • recomputes the partition on a slow cadence (camera settle /
        │    cluster change), not every frame
        ▼
Three.js scene
        │  • nodes: unchanged (existing per-node Object3D + existing
        │    macro-LOD swap) — KEEP
        │  • DETAILED links: unchanged per-link tube mesh + `52d1abb`'s
        │    geometry-reuse fix — KEEP
        │  • AGGREGATE links: ONE shared/batched geometry (fat-line or
        │    instanced-straight-segment) — NEW, REPLACES nothing (there is
        │    no current aggregate representation to replace)
        ▼
renderer.render() — draw-call count now bounded by the budget in §14
                     regardless of how large N or M grow upstream
```

---

## 18. Keep / Modify / Replace / Defer

| Category | Item | Why |
|---|---|---|
| **Keep** | `overview(limit=300)` node bounding, node LOD swap (Stage 5), label cap, star-light pool (Stage 4), backdrop bake (Stage 3), adaptive controller (Stage 6), `52d1abb`'s curved-link geometry reuse, journeyHubs/moneySky throttling (this session), all of this session's allocation-hoisting fixes | All correctly architected already; none are the ceiling identified in this audit |
| **Modify** | `linkVisibility`/`LINK_LOD_MIN`/`LINK_LOD_CUTOFF` — extend from a binary visible/hidden toggle into a three-way detailed/aggregate/hidden classification (§12) | Reuses existing, already-correct infrastructure; smallest change that closes the actual gap |
| **Modify** | `Graph3D` React boundary — wrap in `React.memo` with a comparator treating ref-based props as stable (§9) | Real, bounded, low-risk win; does not touch draw-call count but removes an unnecessary secondary cost |
| **Replace** | The "every link is its own individually-managed `Mesh`" assumption, for the aggregate/far tier only (§12) | This is the one piece of current architecture confirmed unable to scale past ~hundreds-to-low-thousands of simultaneously visible links |
| **Defer** | Node-body instancing (§13) | Explicitly investigated and declined this session already, for a real visual-identity conflict that this audit's new evidence does not change |
| **Defer** | A full "Galaxy view model" as a generalized abstraction layer (database → intelligence → view-model → LOD → three.js, per the task prompt's maximal sketch) | The evidenced problem (§5/§12) is specifically links; building a general-purpose layer for everything is more architecture than the evidence currently justifies — §10 already identifies the minimal version that solves the actual problem |
| **Defer** | Native rendering / Play Store wrapper (§16) | Would not solve the architectural problem; revisit only after §12 ships and a new ceiling (if any) is identified |
| **Defer** | Server-side link cap or `overview()` selection-algorithm change | Real (§5), but changes what data the app WORKS WITH, not just how it's drawn — a bigger, riskier, differently-scoped change than the rendering-layer fix in §12, and the rendering fix alone is sufficient to hit the budget in §14 regardless of how large M grows |

---

## 19. Prioritized implementation roadmap

**PHASE 1 — Measure before building anything else**
- Bottleneck: `UNKNOWN` real `renderer.info.render.calls`/`triangles`/M
  (actual link count) on the affected device/account.
- Files: none changed — read `PerfHUD`'s already-exposed counters (`?perf=1`)
  on the real device showing the catastrophic large View.
- Expected mechanism: converts §4's estimate into a measured fact; also
  reveals the account's actual M, which determines how urgent §12 truly is.
- Visual risk: none (read-only).
- Complexity: trivial.
- Verification: the numbers themselves.
- Runtime testing required: **yes — this IS the runtime test, and it is the
  cheapest possible one.**

**PHASE 2 — Link detail/aggregate split (§12, §17)**
- Bottleneck: unbounded per-link individually-drawn tube meshes (§4, §5).
- Files: `Graph3D.tsx` (`linkVisibility`/LOD logic), `linkTube.ts` (extend or
  add a sibling aggregate-geometry builder), possibly a new small module for
  the shared/batched far-link geometry.
- Expected mechanism: caps draw calls contributed by links regardless of how
  large M grows, directly targeting the confirmed dominant cost.
- Visual risk: real but bounded and designed-around — far/inactive links
  render more simply (§11), matching the existing near/far pattern already
  established for node bodies; the near/active/selected experience is
  unchanged.
- Complexity: moderate — new geometry-sharing code, a classification pass
  (reusable from existing LOD infra), disposal correctness for a shared
  buffer.
- Verification: Phase 1's counters, before/after, at a fixed camera/dataset;
  a `npx tsx` harness for the classification logic's correctness (same
  discipline as this session's other numeric-boundary tests).
- Runtime testing required: **yes**, for the visual-quality judgment call
  (does the far/aggregate tier still feel like part of the same galaxy).

**PHASE 3 — `React.memo` boundary around `Graph3D` (§9)**
- Bottleneck: unnecessary outer-digest re-runs on unrelated App.tsx renders.
- Files: `Graph3D.tsx` (memo wrapper + comparator), `App.tsx` (verify no prop
  passed to `Graph3D` is expected to update on every render).
- Expected mechanism: removes a real, secondary CPU cost independent of N/M
  growth.
- Visual risk: low, if the comparator is written correctly (must not
  incorrectly freeze a prop that legitimately needs to reach the imperative
  scene late — the exact risk this session's own React-prop-identity audit
  already flagged).
- Complexity: low-moderate (enumerating every prop's staleness tolerance).
- Verification: existing test suite plus Phase 1's counters showing reduced
  digest frequency during idle App.tsx activity.
- Runtime testing required: light — mostly a correctness check that nothing
  visibly stops updating.

**PHASE 4 — Server-side link visibility into the client (optional, only if
Phase 1 shows M is very large in practice)**
- Bottleneck: the client currently has no idea how many links exist until
  after fetching them all.
- Files: `api/routes/graph.ts` / `GraphService.overview()` — return a link
  count/summary alongside the full payload (not a behavior change, an
  observability addition), so the Galaxy view model (Phase 2) can make an
  informed detailed/aggregate split threshold instead of a fixed guess.
- Expected mechanism: better-tuned Phase 2 threshold for genuinely
  link-heavy accounts.
- Visual risk: none (additive metadata only).
- Complexity: low.
- Verification: unit test on the route's response shape.
- Runtime testing required: no.

---

## 20. Explicit risks and unknowns

- **UNKNOWN**: the actual N/M/draw-call numbers on the real, affected account.
  This is the single largest gap in this audit and the reason Phase 1 exists —
  every quantitative table in §4/§5/§14 is a source-derived estimate, clearly
  labeled as such, not a measurement.
- **UNKNOWN**: the exact GPU/driver behind the affected device's WebGL
  implementation — draw-call overhead varies meaningfully across mobile
  GPU vendors/drivers, and this sandbox has no way to characterize it.
- **POSSIBLE, unverified**: some fraction of the catastrophic cost could still
  be GPU fill-rate (many overlapping glow sprites, bloom) rather than purely
  draw-call-count-bound — §8 already flags this as a contributing-but-
  unconfirmed factor; Phase 1's counters (draw calls AND triangle count) would
  help separate these.
- **Risk in Phase 2**: the detailed/aggregate link split is the one place this
  audit recommends a genuine architectural change rather than a pure
  optimization — it is the correct scope per the evidence, but it is also the
  first time this Galaxy's link rendering would have two visually-distinct
  tiers, and getting the near/far boundary and the aggregate tier's look right
  will need real on-device visual judgment, not just a performance number.

---

## Bottom Line

**What is fundamentally wrong with the current Galaxy rendering architecture?**
It has no concept of a rendering *budget*. Every node and, critically, every
link that clears a binary visible/hidden filter becomes a permanent,
individually-managed, individually-drawn three.js object — with **zero
instancing or batching anywhere in the codebase** — regardless of how many
there are, how far away they are, or how relevant they currently are. Node
count is already correctly bounded (`overview(limit=300)`); **link count is
not, and the server's own node-selection method (picking the most-connected
300 nodes) actively maximizes link density instead of minimizing it.** The
architecture conflates "this data exists" with "this must be a full-fidelity,
separately-drawn 3D object right now" — and for links specifically, at
realistic scale for an actively-used, months-old account, that assumption
breaks down into thousands of draw calls, which is a well-understood,
platform-independent (§16) way to collapse a real-time renderer's frame rate
regardless of how efficiently each individual object's geometry is produced.

**Why did `d24f7cc` help while `52d1abb` did not?** `d24f7cc` removed
`forceManyBody` (the charge force) — a computation that ran across the *entire
simulation* every tick, for every node, doing genuine physics math whose
output was already fully discarded (every node is pinned via `fx/fy/fz`).
Removing it cut real, unconditional, whole-graph CPU work with **zero
architectural downside** (nothing depended on its output). It was a
correctly-scoped, real win precisely because the cost it removed scaled with
N and was pure waste. `52d1abb` also removed real, confirmed waste (per-frame
`TubeGeometry` construction) — but it removed a cost that was **additive on
top of** an already-dominant, architecturally-unbounded cost (draw-call
count, §4) that construction-cost optimization cannot touch. In other words:
`d24f7cc` eliminated work that was 100% waste with no floor beneath it;
`52d1abb` eliminated real waste sitting on top of a much larger, structural
floor (the number of separately-drawn objects) that remained exactly as high
afterward. The device-level result — real improvement vs. none — is exactly
what that distinction predicts.

**Top 3 implementation phases to do next** (not implemented in this task, per
its explicit audit-only scope):

1. **Phase 1 — Measure**: read `PerfHUD`'s existing `renderer.info` counters
   (draw calls, triangles) on the real device with the catastrophic large
   View, and separately determine the account's actual link count M. Zero
   code risk, and it converts this audit's estimates into facts before any
   further implementation decision is made.
2. **Phase 2 — Link detail/aggregate split**: cap the number of individually-
   drawn, full-detail link tubes and represent everything else through a
   single shared/batched geometry, reusing the existing (currently binary)
   link-LOD infrastructure as the classification mechanism. This is the one
   change this audit's evidence points to as capable of actually bounding the
   confirmed-dominant cost (draw-call count) regardless of how large the
   user's data grows.
3. **Phase 3 — `React.memo` boundary around `Graph3D`**: a real, low-risk,
   already-scoped secondary win that removes an unnecessary cost independent
   of N/M, worth doing alongside Phase 2 but not a substitute for it.
