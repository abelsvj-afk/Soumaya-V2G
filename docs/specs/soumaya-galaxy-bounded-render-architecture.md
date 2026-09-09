> **DESIGN ONLY — NO PRODUCTION CODE CHANGES.** No source file was modified to produce this
> document. No test, package, or instrumentation file was touched. No commit was made.
> Parent evidence document:
> [`soumaya-galaxy-large-small-workload-diff-audit.md`](./soumaya-galaxy-large-small-workload-diff-audit.md)
> (Phase 1). This document is Phase 2 of that program — architecture design, not implementation.
> A future implementation task should be able to execute against this document without inventing
> architecture during coding; where this document cannot fully specify a decision without
> real-device measurement, it says so explicitly rather than guessing.

# Soumaya Galaxy — Bounded Render Architecture

---

## 0. Product framing (read before anything else)

**Performance work here is not allowed to make the Galaxy less alive.** Phase 1 established
that the current renderer conflates "this data exists" with "this must be a permanent,
full-fidelity, individually-drawn object." The fix is not to draw less — it is to draw
**the same visual richness for what a user is actually looking at**, and something
**cheaper-but-still-alive** for what they aren't, so that draw-call count stops growing
with database size. Every design decision below is evaluated against a visual-impact
classification (invisible / barely noticeable / noticeable / major) per §19, and the
preferred option at every decision point is the one that keeps the classification at
"invisible" or "barely noticeable" during normal exploration.

---

## 1. The rendering contract

```
DATA LAYER            — stored memories/entities/relationships/metadata (unbounded)
      │
      ▼
SELECTION LAYER        — "which of these matter for the current View/camera/context?"
      │                  (already exists: GraphService.overview(limit); NEW: a link-side
      │                   equivalent, §6)
      ▼
RENDER-MODEL LAYER     — NEW. A bounded, camera/relevance-aware annotation of the selected
      │                  set: for each node/link, which REPRESENTATION TIER does it deserve
      │                  right now? Recomputed on a throttle/event basis, NEVER per frame.
      ▼
REPRESENTATION/LOD     — detailed / simplified / aggregate / hidden, per §3 (nodes) and §5
LAYER                    (links). Maps a tier + a small amount of per-entity data (position,
      │                  color, mass, activity) onto a GPU-facing recipe.
      ▼
GPU LAYER              — instanced/batched/shared rendering per tier, per §4/§5.
      │
      ▼
FRAME LOOP             — bounded, predictable, per-frame work only (§11).
```

**Layer responsibilities, explicit:**

- **Data layer** (unchanged): `GraphService`, `NodesRepo`, `EdgesRepo`. Owns correctness and
  space-scoping. Has no opinion about rendering.
- **Selection layer** (mostly unchanged, extended per §6): decides the *candidate* node/link
  set — currently `overview(limit=300)` for nodes; **needs a comparable, evidence-reusing
  decision for links**, since that is Phase 1's confirmed gap. Runs once per data load or
  explicit refresh, not per frame, not per camera move.
- **Render-model layer (NEW — the centerpiece of this design)**: a thin, client-side,
  **throttled, not per-frame** module that looks at the current camera state, cluster/lens
  state, selection state, and each node/link's own signals (mass, degree, activity,
  recency — already-computed fields, no new intelligence pipeline) and assigns a
  **representation tier**. This is the layer Phase 1 found completely absent — today,
  every node/link that clears a binary visibility filter goes straight to full-fidelity
  representation forever. This layer's entire job is answering "what does the user need to
  see at this scale" (§8) instead of "render everything that exists."
- **Representation/LOD layer**: pure mapping from `(entity, tier)` → a GPU recipe (which
  pool it belongs to, what per-instance attributes it needs). No decision-making of its own
  — it executes what the render-model layer decided.
- **GPU layer**: a small, fixed number of reusable render pools (instanced meshes / merged
  buffers), never one object per memory. Per §4/§5.
- **Frame loop**: only operations that must run at frame rate — camera-driven interpolation,
  orbit motion, shader time uniforms, input handling. Never re-derives what the render-model
  layer already decided; only *executes* the current assignment. Per §11.

**The renderer must not independently rediscover large-scale data relationships every
frame** — this is the single most important invariant this document establishes. Concretely:
the render-model layer's tier assignment is the *only* place that looks at "how many nodes
are near this point in space" or "how connected is this link's endpoint," and it does so on
a throttle (camera-settle, cluster-change, data-change), never inside `tick()`.

---

## 2. Hard performance budgets — PROPOSED, not measured

*Every number below is an engineering target, explicitly not derived from real-device
measurement (Phase 1's §20 flagged real-device numbers as the largest open unknown). They
are chosen to keep total draw calls inside the range Phase 1's own architecture audit judged
"a soft ceiling, hard degrade line" for mobile WebGL (~800-1,200 soft, ~2,000 hard), with a
roughly 2× allowance for desktop.*

| Budget item | Mobile target (proposed) | Desktop target (proposed) | Why |
|---|---|---|---|
| Detailed node representations | ≤300 | ≤300 | Matches the existing, already-correct `overview(limit)` default; this is not a NEW cap, it's the existing one, now explicitly load-bearing for the render-model layer too |
| Simplified node representations | ≤700 (instanced) | ≤1,500 (instanced) | Instancing makes this cheap relative to detailed — one draw call per instance POOL, not per node — so the budget here is about triangle/fill-rate cost, not draw-call cost |
| Aggregate node representations | ≤50 clusters | ≤100 clusters | Aggregates should be rare and coarse by construction — if aggregation is producing hundreds of clusters, the clustering granularity itself needs retuning, not the render budget |
| Total visible node representations (detailed+simplified+aggregate) | ≤1,000 | ≤2,000 | A ceiling on renderer-visible entities regardless of how many are selected upstream |
| Detailed links | ≤400 | ≤600 | Phase 1 §14's own estimate of where links stop being a minority of draw-call cost; preserves the glowing-tube identity for what's actually near/active/selected |
| Aggregate links (bundled, shared-geometry) | Unbounded upstream, ≤1 draw call per bundle group (~10-30 groups) | Same | The entire point of §5/§6 — link COUNT stops being a rendering cost past the detailed cap |
| Labels | 10/16/24 by perf tier (existing `MAX_VISIBLE_LABELS`, unchanged) | Same | Already correctly bounded; no change needed |
| Lights | 3/4/6 by tier (existing, Stage 4, unchanged) | Same | Already correctly bounded; no change needed |
| Transparent/glow objects | ≤300 (one per detailed-tier node, existing ratio) | ≤300-600 | Glow sprites are cheap per-object but real fill-rate cost in aggregate; bounding them to the detailed tier only (simplified/aggregate tiers get a cheaper glow treatment, §3) keeps this flat regardless of total node count |
| **Total draw calls** | **~800-1,200 soft / ~2,000 hard** | **~1,500-2,000 soft / ~3,500 hard** | Phase 1 §14's own derivation, carried forward as this design's binding constraint |
| Triangles | ~1.5-2M soft ceiling | ~4M soft ceiling | Generous relative to draw-call constraints on mobile WebGL — draw-call count, not triangle count, was Phase 1's confirmed dominant cost, so this is a secondary guard, not the primary lever |
| Per-frame allocations (steady state) | Near-zero | Near-zero | No change to the discipline already established by prior Performance Program stages |
| GPU buffer uploads | O(entities that changed tier or moved meaningfully this throttle window), never O(all entities) every frame | Same | Direct consequence of moving tier/position sync out of the per-frame path where possible (§11) |
| Expensive CPU operations/frame | O(1) amortized — render-model recompute is throttled/event-driven, not per-frame (§11) | Same | The core claim of this whole design |

**Which quantities MUST remain bounded regardless of database size** (the actual answer to
the section's key question):

1. **Total tracked `Object3D` instances** (the direct driver of draw-call count).
2. **Total draw calls per frame.**
3. **Detailed-tier node AND link counts** (both already have a natural ceiling — the
   server's node cap and this design's new link cap).
4. **Per-frame allocation rate.**
5. **Frequency of full-scene tier recomputation** (must be throttled/event-driven, never
   per-frame, regardless of how large the candidate set is).

Everything else (labels, lights, glow) is already correctly bounded by existing
infrastructure and is called out only to confirm this design does not regress it.

---

## 3. Node representation tiers

*Preserves the existing celestial visual language — this reuses, not replaces, the current
tier vocabulary from `nodeObject.ts`/`celestial.ts` (`asteroid...supergiant`), which is a
**mass classification**, orthogonal to the **representation tier** below (a star can be
rendered at Aggregate, Simplified, or Detailed representation depending on distance/
relevance, while still being visually a "star" at every tier).*

| Tier | Three.js objects | Geometry | Materials | Glow | Labels | Lights | Animation | Interaction | Draw-call strategy | Transition trigger |
|---|---|---|---|---|---|---|---|---|---|---|
| **T0 — Hidden** | None | — | — | — | — | — | — | Not raycastable | Zero | Frustum-culled, or excluded by cluster/lens filter, or beyond the aggregate tier's own catchment (§9) |
| **T1 — Aggregate** | One shared instance in a per-region **`InstancedMesh`** pool (a small, coarse "star cluster" glyph — e.g. a soft luminous point/small icosahedron, tinted by the region's dominant color/mass) | One shared low-poly geometry (icosahedron or a billboard sprite), reused across every aggregate everywhere | One shared material per pool, instance color via `InstancedBufferAttribute` | **One shared, cheap glow** per aggregate (either a single additively-blended point-sprite baked into the same instanced draw, or a small SEPARATE instanced-sprite pool for aggregate glow — NOT one glow object per underlying memory) | None per-member; the aggregate itself can carry ONE label showing member count ("47 memories") only when hovered/near | None (aggregates never individually light the scene — they can still be lit BY the fixed star-light pool like any other body) | Gentle shared pulse/rotation, driven by one shared time uniform across the whole instance pool (not per-instance state) | Raycast hits the instance → `instanceId` → aggregate-cluster id → member list (§7); click "explodes" into its members (§9) | **One draw call per aggregate pool** (not per aggregate, not per member) | Camera distance/projected size crosses the aggregate→simplified threshold, OR the user clicks/selects into it |
| **T2 — Simplified** | One instance in a per-mass-class **`InstancedMesh`** pool (e.g. one pool for "small bodies," sized/textured to still read as the right celestial type at this distance — an icosahedron-family shape for asteroid/moon-scale, a smooth sphere for planet-scale) | Shared geometry per mass-class pool (reuses the EXISTING `getGeometry()` cache's size buckets as the pool-partitioning key) | Shared material per pool; **per-instance color** via instance attribute (this app's per-node color/tint is exactly the kind of per-instance variation `InstancedMesh` is designed for) | **One shared, simple glow** per instance (an instanced sprite pool, color/intensity per instance, cheaper radial falloff than the detailed tier's) | Only if within the existing label-distance/priority window AND under `MAX_VISIBLE_LABELS` (unchanged existing cap) | None individually (still lit by the fixed star-light pool if within its range) | Per-instance orbit position (already computed by `orbits.ts` regardless of tier) written into the instance's transform matrix; a shared, low-cost pulse via a per-instance phase offset attribute (cheap: one extra float per instance, not a full animation loop) | Raycast → `instanceId` → node id (§7); hover/select promotes the SPECIFIC instance to Detailed on demand (§3's transition rule below), never the whole pool | **One draw call per mass-class pool** (a handful of pools total, not one per node) | Enters/exits the simplified distance band (§8); OR is individually selected/hovered (promotes just that one node to Detailed, without touching the rest of its pool) |
| **T3 — Detailed** | Exactly today's `makeNodeObject()` output — one `THREE.Group` with its full per-tier child set (body, ring, glow, belt, sector title, label, macro sibling) | Exactly as today (§4 of the Phase 1 audit) — unchanged, including the existing macro-LOD swap within this tier | Exactly as today — unique `ShaderMaterial`/`MeshStandardMaterial` per node | Exactly as today | Exactly as today, subject to the existing `MAX_VISIBLE_LABELS` cap | Exactly as today (fixed 3/6-light pool assignment, unchanged) | Exactly as today — per-object tick-loop pulse/spin/LOD | Exactly as today — full click/hover/select | **One draw call per node**, as today — but now this tier only ever contains a BOUNDED number of nodes (§2's ≤300/≤1,000 detailed budget), never every selected node | Enters the detailed distance/relevance band (§8); OR is individually selected/hovered/followed (always promoted regardless of distance — see below) |

**Zoom-in experience, no sudden discontinuity**: the three tiers are deliberately designed
to share visual DNA rather than being categorically different-looking objects —
- T1→T2: both are instanced, same underlying color/mass signal, difference is mainly
  granularity (one glyph per cluster vs. one per node) and glow richness. A camera zooming
  toward a cluster crosses this boundary as "the single glyph resolves into several smaller
  glyphs occupying roughly the same space" — this is the same visual grammar as a real
  starfield resolving with magnification, not a representation swap that reads as a glitch.
- T2→T3: this is exactly the transition that **already exists today** (the full-fidelity ↔
  macro-body LOD swap, Stage 5 of the earlier Performance Program) — this design reuses it
  unchanged. The only new behavior is that entering T3 might now also mean "promote this one
  instance out of its `InstancedMesh` pool and swap in a real `makeNodeObject()` group,"
  which is an *additional* instant-visibility-preserving swap co-located at the same camera
  distance the existing macro-swap already uses, not a new discontinuity.
- **Selected/hovered/followed nodes are always promoted to T3 regardless of distance** — this
  matches the existing "selected body stays readable" precedent already established for the
  sun-occlusion exemption (Phase 1's node-object inventory), and is essential so that
  clicking a distant node from a T1/T2 cluster doesn't leave it looking cheap right after
  selection.

**Visual-impact classification for this section**: the T1/T2 tiers are new representations
that DID NOT exist before — introducing them is, honestly, **noticeable** the first time a
user notices a distant cluster is a single glyph rather than dozens of individually-glowing
bodies. This is the one part of this whole design that is not "invisible" by construction,
and it is flagged as such rather than glossed over. It is judged acceptable because (a) it
only affects what's currently far/unfocused (never what the user is actively looking at —
that's always T3), and (b) it directly mirrors a pattern that reads as *correct* for a
galaxy — real astronomy also shows a dense star field as a resolved point cluster from afar
and individual stars only up close. §19 revisits this classification against the full visual
identity checklist.

---

## 4. Node instancing/batching strategy

**Not a bare "use `InstancedMesh`" answer — a hybrid, tier-scoped strategy:**

| Tier | Technique | Reasoning |
|---|---|---|
| T3 (Detailed) | **Unchanged individual `Object3D`** (current `makeNodeObject()`), NOT instanced | Every detailed node already has per-node-unique procedural `ShaderMaterial`s (different FBM seed/color per node, confirmed in Phase 1 §4) and per-node children (rings, belts, sector titles) that vary structurally, not just by a transform/color attribute. This exact conflict was explicitly investigated and DECLINED in the earlier Performance Program for the whole-node-population case — this design does not overturn that decision, it just makes it apply to a much smaller, bounded population (≤300/≤1,000) instead of "every node in the database." |
| T2 (Simplified) | **`THREE.InstancedMesh`, one pool per mass-class** (a small, fixed number of pools — e.g. "small" [asteroid/moon], "medium" [planet/gas_giant], "large" [giant/star/supergiant] — reusing the existing `getGeometry()` size-bucket cache as the natural partition key) | At simplified distance, per-node procedural texture detail is no longer visually resolvable anyway — a shared geometry + per-instance color/scale is visually sufficient and is exactly what `InstancedMesh` is built for. |
| T1 (Aggregate) | **`THREE.InstancedMesh`, ONE pool for the whole galaxy** (aggregates are rare, coarse, and visually simple by design) | Same reasoning as T2, one level coarser. |
| Glow (T1/T2) | **A parallel, separate instanced sprite pool per node-instance pool** (same instance index space as the body pool, so instance N's glow shares instance N's position/color) | Glow at T3 is a per-node `Sprite` with a shared-but-unique-instance material; at T1/T2 it becomes a second small set of instanced sprite draws, not a new per-instance object. |

**Direct answers to the task's specific questions:**

- **Color per-instance?** **Yes** — `InstancedMesh` supports `instanceColor`
  (`InstancedBufferAttribute`, 3 floats/instance) natively; this app's per-node color/tint
  (already a real signal at T3, per Phase 1 §4) maps directly onto it at T1/T2.
- **Scale per-instance?** **Yes** — via the per-instance 4×4 transform matrix
  (`setMatrixAt`), which already needs to be written per-instance for position anyway;
  packing scale into the same matrix is free.
- **Glow instanced?** **Yes, via a second, parallel instanced sprite pool** (see table) — not
  the SAME draw call as the body (sprites and meshes have different geometry/material
  needs), but still a small, fixed number of ADDITIONAL draw calls (one per glow pool), not
  one-per-node.
- **Do different geometry tiers require separate instance pools?** **Yes** — one pool per
  distinct geometry+tier combination (this mirrors the EXISTING `getGeometry()` cache's own
  partitioning, so the pool boundaries are not a new concept, just a new consumer of an
  existing partition). A small, fixed number of pools total (roughly: 3 mass-class pools ×
  2 tiers [T1/T2] = ~6 body pools + ~6 glow pools), never growing with node count.
- **How does selection/hover work under instancing?** Raycasting against an `InstancedMesh`
  returns an `instanceId` on the intersection result (three.js native support) — a per-pool
  `Map<instanceId, nodeId>` (rebuilt only when the pool's membership changes, not per frame)
  resolves this back to a real node id, which then drives the existing `onSelect`/`onNodeHover`
  flow unchanged (§7 goes deeper on this).
- **How do labels remain separate?** Labels stay individual `Sprite` objects exactly as
  today, gated by the existing `MAX_VISIBLE_LABELS` cap — instancing only applies to node
  BODIES and glow, never to labels, which are already correctly bounded and don't need this
  treatment.
- **How do animated/pulsing nodes work when instanced?** A per-instance **phase-offset
  attribute** (one extra float per instance, e.g. via a custom `InstancedBufferAttribute` or
  packed into an unused matrix/color channel) lets a single shared vertex/fragment shader
  produce a per-instance-staggered pulse from one shared `uTime` uniform — this is a standard
  GPU-instancing pattern, not a novel invention, and keeps the "living, breathing" feel at
  T1/T2 without any per-instance CPU-side animation loop.
- **How do individual nodes remain interactive at T1/T2?** Every instance still has a real,
  resolvable node id (T2) or member list (T1, §7) via the `instanceId` map; hover/click still
  work, they just resolve through one extra indirection step compared to T3's direct
  `Object3D.userData` lookup.

**Prefer a small number of reusable pools, not one object per memory — this is the load-bearing
principle of this entire section.** The total pool count is a small constant (roughly a dozen,
combining body+glow across T1/T2), completely independent of how many nodes the database or
even the current selection contains.

---

## 5. Link architecture

**Current problem, confirmed by Phase 1**: every visible link is an individually-managed
`THREE.Mesh` with a `TubeGeometry` (always curved, never a cheap `Line`) — one draw call
each, with the server placing no cap on link count.

### Tier design

| Tier | Population | Technique | Why this technique, not another |
|---|---|---|---|
| **Detailed** | Selected node ↔ selected node; the currently-hovered/selected node's own direct links; the top-N by relevance/activity within the current view (≤ the budget in §2) | **Unchanged**: today's per-link `TubeGeometry` `Mesh` + `52d1abb`'s in-place geometry-attribute-update optimization | This is exactly the tier where the current "glowing, curved, activity-responsive" visual identity must be fully preserved — no compromise here. `52d1abb`'s existing fix (geometry reuse) remains valuable for THIS bounded population, even though it wasn't sufficient for the *unbounded* population Phase 1 diagnosed. |
| **Simplified** | Normal visible relationships not promoted to Detailed, but still individually meaningful (e.g. within the current cluster/lens, or connecting two currently-visible T2/T3 nodes) | **One merged `THREE.LineSegments` buffer per throttle-window "generation"** — all simplified links share ONE `BufferGeometry` (a flat array of start/end point pairs) and ONE thin, semi-transparent `LineBasicMaterial`; NOT curved (a straight segment reads as "connection exists" without needing per-link curvature) | A straight-line merged buffer is the cheapest technique that still shows every individual link's endpoints distinctly (unlike aggregate bundling, below) — appropriate for a population that's still individually relevant but doesn't need the full "living synapse" treatment. Rebuilt only when set membership changes (a camera-settle/cluster-change event), not per frame. |
| **Aggregate** | Distant clusters, dense low-priority relationship regions, or any link whose BOTH endpoints are themselves at Aggregate node-tier | **A small, fixed number of "bundle" `LineSegments`, one line per (cluster, cluster) pair rather than one per underlying link** — many individual links between the same two regions collapse into a single bundled line, optionally with an instanced-width/opacity signal proportional to how many real links it represents | This is the technique that actually caps draw-call growth as link count grows unboundedly (§6) — instead of drawing 2,000 individual links between two dense clusters, draw ONE line whose visual weight communicates "there are many connections here," which is both cheaper and arguably a *better* way to communicate density than 2,000 overlapping curved tubes ever was. |
| **Hidden** | Everything else — offscreen, beyond any relevance threshold, or explicitly filtered by the current cluster/lens | Not rendered at all | Matches the EXISTING binary `linkVisibility` exclusion-from-tracked-set behavior (Phase 1 §2/§5) — this tier is not new, it already exists; this design just narrows what falls into it now that Simplified/Aggregate exist as intermediate options. |

### Technology comparison (why each choice, not "sounds faster")

| Option | Verdict | Reasoning |
|---|---|---|
| `LineSegments` (built-in, shared geometry) | **CHOSEN for Simplified tier** | Native three.js primitive, one draw call for the whole merged buffer, trivial to rebuild (just rewrite a flat `Float32Array` and re-upload), no shader complexity. The one real limitation — no per-segment width/glow — is exactly the limitation this tier is DESIGNED to accept, since it's explicitly the "less important than Detailed" population. |
| `Line2`/fat lines (a three.js addon providing width on `LineSegments`) | **Considered, not chosen for Simplified** | Solves the "thin, aliased line" cosmetic complaint `LineSegments` has on some displays, at the cost of a materially more complex shader/geometry setup (`LineSegmentsGeometry`/`LineMaterial`). Worth a follow-up visual-quality pass AFTER the architecture ships, if plain `LineSegments` reads as too thin/aliased on a real device — not a blocking decision for this design. |
| Instanced cylinders/curves per-link | **REJECTED for both Simplified and Aggregate** | Phase 1 already established (§12 of the architecture audit, re-confirmed here) that this app's links have per-link, continuously varying curvature and endpoints — not a rigid shared shape with only a per-instance transform, which is what instancing needs to be efficient. Forcing links into `InstancedMesh` would mean either flattening every link to a straight segment (in which case plain merged `LineSegments` is simpler and just as cheap) or fighting the technique's own design assumptions for no real benefit over the merged-buffer approach. |
| Merged/batched geometry, rebuilt on membership change | **CHOSEN for Aggregate tier** (as the bundle-line implementation) | The "batched geometry merging" option the audit already flagged as a strong fit for a far/aggregate tier — since aggregate links don't need per-frame curve fidelity, the rebuild cost (only on membership change, not per frame) is low and bounded. |
| Capped active detailed links | **CHOSEN as the Detailed-tier admission control**, not a rendering technique itself | This is the "which links deserve the expensive treatment" decision (§6), separate from which GPU technique renders them — it's the gate that keeps the Detailed tier's population inside its budget regardless of how large the candidate link set grows. |

---

## 6. Link density control

**The server currently caps nodes (`overview(limit)`) with no link-side equivalent — this is
the confirmed Phase 1 gap this design closes on the client/render-model side, without
requiring a server change** (a server-side link cap is explicitly Deferred, §14/§17 — this
design's link tiering makes it unnecessary for the rendering problem specifically, even
though it may still be worth pursuing separately for payload-size reasons).

**Selection basis — reuse existing signals, do not invent a new relevance engine:**

| Signal | Already exists? | Where | How it feeds link tiering |
|---|---|---|---|
| Relationship strength/weight | **Yes** | `linkWidthCb`'s `weight` term, edge data already carries a weight | Primary sort key for Detailed-tier admission — already-computed, zero new cost |
| Activity/recency | **Yes** | `linkColor`/`linkWidthCb`'s `activity` term, `getLinkActivity` | Secondary sort key; an inactive-but-strong link and an active-but-weak link both plausibly deserve Detailed treatment — combine, don't replace |
| Selection/current focus | **Yes** | `activeId` (hover/selection), already threaded through `shouldRenderLink` | Any link touching the selected/hovered/followed node is **always** promoted to Detailed, regardless of its strength/activity score — this is the "preserve current interaction" guarantee from §7/§17 |
| Spatial proximity | **Yes, indirectly** | `orbits.ts`'s existing kinematic parent/child hierarchy (a mass-based tree already computed for orbital motion) | A cheap, already-computed notion of "which nodes are near which other nodes in the orbit hierarchy" — reusable as a coarse proxy for spatial clustering (§9) without computing new 3D spatial partitioning from scratch |
| Cluster/lens membership | **Yes** | The existing `cluster: Set<number> | null` state | Links with both endpoints inside the active cluster/lens are naturally prioritized — reuses existing state, no new mechanism |
| Semantic relationship / relevance | **Yes, an existing, more expensive signal to use sparingly** | `packages/server/src/analysis/relevance.ts`'s `computeRelevance()` (built for GraphRAG chat-context bounding, but its embedding-similarity-to-topic and reinforcement-count signals are directly reusable) | **Not** run per-frame or even per camera-move — this is a real SQLite-backed function. Reserved for a coarser, event-driven decision: "when the user selects a node, which of ITS links deserve Detailed treatment" — exactly the bounded-candidate-set use case `computeRelevance()` was already designed for (its own doc comment requires a pre-bounded candidate list, which "this node's direct links" already is). |
| Importance | **Yes** | `node.importance` (existing field, already drives `deriveMass`) | Tertiary tie-breaker |

**No new relevance engine is proposed.** The combination above — weight + activity (already
computed, zero new cost) as the default sort, `computeRelevance()` (already built) as an
optional refinement specifically for the "just selected a node in a dense region" case
(§18 Scenario E) — covers every signal the task lists, using infrastructure that already
exists.

**Behavior at named scenarios:**

| Nodes / links | Behavior |
|---|---|
| 300 / 50 | All 50 links comfortably fit inside the Detailed-tier budget (≤400) — render exactly as today, no tiering visible at all. **Invisible** visual change. |
| 300 / 500 | Top ~400 by weight+activity+selection stay Detailed; the remaining ~100 demote to Simplified (merged `LineSegments`). Since Simplified links are still individually drawn as distinct (if thinner/straighter) segments, this reads as "some connections are less emphasized," not "connections disappeared." **Barely noticeable.** |
| 300 / 2,000 | ~400 Detailed, a few hundred Simplified (whatever fits the Simplified tier's own — much higher, since it's one draw call regardless of count — practical ceiling before its OWN merged buffer gets visually cluttered, a judgment call for on-device tuning), the rest Aggregate (bundled by cluster-pair). **Noticeable** to a user who specifically compares before/after, but the galaxy still visibly shows "there's a lot of connection density here" via the aggregate bundles' visual weight, rather than either freezing or silently dropping the information. |
| 300 / 10,000 | Same tiering logic, more links fall into Aggregate. This is precisely the regime Phase 1 identified as capable of producing 10,000+ draw calls under the CURRENT architecture — under this design, total link-related draw calls stay flat (≤400 Detailed meshes + 1 Simplified buffer + a few dozen Aggregate bundle lines) regardless of whether the true count is 2,000 or 10,000. |
| 1,000 selected nodes / very dense graph | Node-side Detailed/Simplified/Aggregate tiering (§3) already bounds the node population; the link tiering above applies identically on top of a larger candidate node set — the render-model layer's job doesn't change in kind, just in how much it has to sort through (still a throttled, not per-frame, O(M log M) operation at worst, matching the EXISTING link-repair-scan's own established cost class). |

---

## 7. Preserve interaction

**Guiding principle: every interaction that works today must still work; instancing/
aggregation add one resolution step, never remove a capability.**

| Interaction | T3 (unchanged) | T2 (instanced) | T1 (aggregate) |
|---|---|---|---|
| Raycasting | Unchanged — `Raycaster.intersectObject` against the individual `Object3D`, `userData` carries the node id directly (existing pattern, e.g. `onGalaxyEntityClick`'s Journey/Money raycast) | `Raycaster.intersectObject(instancedMesh)` — three.js natively returns `intersection.instanceId`; a small per-pool `Map<instanceId, nodeId>` resolves it | Same as T2, but the map resolves `instanceId → aggregateClusterId`, and the cluster object separately carries its member-id list (§9) |
| Hover | `onNodeHover`/`setHoverId` unchanged for T3; for T2, the SAME `hoverId` state is set once the instance→id map resolves — the rest of the app (highlight styling, tooltips) is unaware instancing happened at all, since it only ever sees a resolved node id | Hover on an aggregate shows a lightweight "N memories" tooltip instead of a single node's label — a new, but small and clearly-scoped, UI addition | |
| Selection | Unchanged `onSelect(node)` callback contract — T2/T1 resolve to a real node id (or, for an aggregate, either the aggregate's own synthetic "cluster" pseudo-entity or a signal to explode-and-select, per product decision left open in §9) before calling the SAME existing `onSelect` | | |
| Selection highlighting | T3: unchanged, per-object emissive/scale change. T2: an **instance-attribute** flag (e.g. write a "selected" scalar into the per-instance buffer, read by the shared shader to boost just that instance's brightness/scale) — GPU-cheap, no CPU-side object mutation | | |
| Follow connections / navigate to memories/entities | The existing `flyTo`/`flyToGalaxyEntity`/`GalaxyEntityDescriptor`/`resolveGalaxyEntity`/`NavigationIntent` machinery (Maya Intelligence Parts I3, chat-navigation) is entity-id-based already — it flies to a resolved id, not to a live `Object3D` reference — so it is **unaffected by which representation tier that id currently happens to render at.** If the target is currently T1/T2, flying to it should force-promote it to T3 first (the same "selected/followed nodes are always T3" rule from §3), so the destination always looks fully realized on arrival. |
| Journey/Money entity interaction | Unaffected — these are a separate, small, fixed-count overlay system (§14 Keep) with their own existing raycast path (`onGalaxyEntityClick`), never part of the node/link tiering this design changes. |
| Active link emphasis | For a Detailed-tier link: unchanged, per-mesh color/width response. For a Simplified-tier link that becomes relevant (e.g. its endpoint gets selected): promote it into the Detailed tier's individual mesh on that event (mirrors the node-promotion pattern exactly) — a link never needs "instanced emphasis" since the promotion path already exists. |

**Aggregate → member expansion** is covered in depth in §9; the interaction contract here is
simply: an aggregate is always resolvable to its member id list, and clicking one is a
well-defined, designed interaction (not an edge case to handle later).

---

## 8. Camera / spatial / LOD strategy

**Principle, directly per the task's framing**: prefer **projected screen-space size** over
raw world-distance thresholds wherever the two would disagree, because screen-space size is
the thing that actually answers "what does the user need to see at this scale" — a body far
away but currently zoomed-to-fill-the-screen (e.g. via a deliberate close flythrough) should
get full detail even if a raw-distance threshold alone would demote it, and conversely a
nearby but tiny-on-screen body (e.g. seen obliquely at a grazing angle, or the FOV is wide)
shouldn't get full detail just because world-distance says "close."

**Concretely, for this design**:

- **Tier assignment is driven primarily by projected screen-space radius** (a body's
  world-space size and distance combined through the camera's projection, cheaply computed
  once per throttle window per candidate — this is a small, well-understood formula, not a
  new expensive system): a body whose current on-screen footprint is below a small-pixel
  threshold is a T1/T2 candidate regardless of raw world distance; one whose footprint is
  large is a T3 candidate.
- **The existing world-distance-based macro-LOD swap (`MACRO_DIST`) stays as the T2↔T3
  boundary specifically**, since it's already tuned, already hysteresis-protected, and
  already visually validated — this design does not replace it, it adds T1 (aggregate) as a
  NEW tier below what T2 already covers, using the same "screen-space-first, world-distance
  as a cheap proxy where it's already good enough" philosophy.
- **Modifiers that override pure screen-space size**: selection/hover/follow (always T3,
  per §3); explicit cluster/lens membership (nodes inside an active isolate are never
  demoted below T2, so a small isolated View never looks emptier than it should); relevance
  score (a highly relevant-but-currently-small-on-screen node can be held at a higher tier
  than pure geometry would suggest — a deliberate, bounded exception, not a wholesale
  replacement of the distance-based system).
- **Spatial density** (the existing spatial-grid visibility scan, already throttled at 60
  frames/500 units) is the natural REGION boundary for aggregate clustering (§9) — reused,
  not replaced.

---

## 9. Aggregation design

```
20,000+ stored memories
        │
        ▼
overview(limit) — existing node selection (unchanged), returns the relevant ~300-1,000
        │          candidate subset for THIS view/context
        ▼
Spatial/hierarchy grouping — client-side, reusing orbits.ts's EXISTING kinematic
        │  parent/child tree (already a mass-based hierarchy computed for orbital motion) as
        │  the grouping basis, refined by the existing spatial-grid cells for anything the
        │  orbit hierarchy doesn't naturally bucket together. NOT a new clustering algorithm —
        │  a reuse of two already-computed structures.
        ▼
Aggregate candidate regions — any hierarchy subtree (or spatial-grid cell) whose members
        │  are ALL currently below the T1/T2 screen-space threshold (§8) becomes one
        │  aggregate. A region with even one T3-eligible member is never aggregated — the
        │  aggregate only ever represents genuinely low-priority-right-now content.
        ▼
Aggregate visual representation — one InstancedMesh instance (§3/§4), color/mass/size
        │  derived from a simple, deterministic combination of its members' own mass/color
        │  (e.g. the highest-mass member's color, sized by member count) — NOT a new LLM/
        │  intelligence computation, a cheap client-side reduction over already-loaded data.
        ▼
User zooms in / selects the aggregate
        │
        ▼
Cluster "explodes" — the aggregate's instance is retired (or fades), and its member ids are
        │  individually promoted to T2 (or T3 if the zoom is close enough / one is selected),
        │  using the SAME promotion mechanism §3 already defines for any tier transition —
        │  not a special-cased "explosion" code path, just this design's ordinary tier
        │  recompute reacting to the region's members now qualifying for a higher tier.
        ▼
Individual memories become visible, exactly as they would without ever having been
aggregated — aggregation never mutates underlying data or ids, only the current rendering
decision for them.
```

**Specific answers:**

- **How are aggregates generated?** Client-side, from already-loaded/selected data — no new
  server computation. Reuses `orbits.ts`'s existing hierarchy + the existing spatial grid.
- **Server-side or client-side?** **Client-side.** The server's job (bounded relevant-node
  selection) is unchanged; aggregation is purely a rendering-layer decision about how to
  DISPLAY the client's already-selected data, consistent with this design's overall
  principle that the render-model layer, not the data layer, owns representation decisions.
- **Cached?** Yes — aggregate membership is recomputed only on the same throttle/event
  cadence as tier assignment generally (§11), not per frame; a stable aggregate persists
  across ordinary camera motion within its own screen-space band.
- **How stable are aggregate positions?** An aggregate's position is the centroid (or the
  highest-mass member's own position — simpler, and consistent with "the most important
  thing in this cluster anchors it," matching how sector titles already work today) of its
  current members — stable as long as membership is stable, and membership itself only
  changes on the throttle cadence, so no per-frame jitter.
- **How is aggregate color/importance derived?** A cheap, deterministic reduction (dominant
  color / highest mass among members) — explicitly NOT a new weighted-scoring system (this
  codebase's own established discipline, cited in `relevance.ts`'s own comments, against
  inventing precise-looking scores without a principled basis).
- **How does clicking an aggregate work?** Resolves `instanceId → member id list` (§7),
  triggers the "explode" tier-promotion above, optionally combined with a camera fly-toward
  the aggregate's former position so the explosion reads as "zooming into this cluster," not
  a jarring pop.
- **How does zooming expand it?** Naturally, via the same screen-space threshold (§8) that
  governs every other tier transition — no special zoom-specific logic needed.
- **How does it avoid rebuilding the whole scene?** Because tier/aggregate-membership
  recomputation is scoped to the render-model layer's throttled pass (§11) and only touches
  the entities whose tier actually changed — exploding one aggregate updates that aggregate's
  instance pool slot and promotes its members' pool slots; it does not touch any other
  aggregate, any Detailed-tier node, or any link.

---

## 10. Data scale vs render scale

| Stage | Definition | Proposed bound | Notes |
|---|---|---|---|
| **Stored** | Everything in the database | Unbounded (20,000+) | Unaffected by anything in this design |
| **Selected** | `overview(limit)`'s chosen subset for the current view | ≤300 default, ≤5,000 hard route cap (existing, unchanged) | The one existing, already-correct boundary this design builds on top of |
| **Loaded** | What the client actually has in memory (`graphData`) | = Selected (no additional client-side fetch/bounding needed — the existing architecture already only loads what `overview()` returns) | |
| **Active** | Currently participating in the render-model layer's spatial/tier calculations | = Loaded, filtered by the current cluster/lens (existing `nodeVisibility`/`linkVisibility` predicate, reused as the FIRST filter before tiering) | This is the set the throttled tier-assignment pass actually iterates — bounded by Selected, further narrowed by any active isolate |
| **Visible** | Currently within the camera frustum | ≤ Active | Existing frustum-cull mechanism, unchanged |
| **Detailed** | Currently receiving T3 representation | ≤300 nodes / ≤400-600 links (§2's budgets) | The NEW hard ceiling this design introduces — independent of how large Selected/Active/Visible are |
| **Interactive** | Currently eligible for full-fidelity hover/click/inspect | = Detailed, PLUS any T1/T2 entity via the instance-id resolution path (§7) — so in practice **everything Active remains interactive**, just at a representation-appropriate fidelity | This is the key promise: tiering never sacrifices interactivity, only visual richness for what isn't currently the focus |
| **GPU** | Actually submitted as draw calls this frame | A small, fixed number of pools + ≤ Detailed's own object count | The terminal, bounded quantity this entire design exists to cap |

**The key requirement, restated as a direct consequence of this table**: because `Selected`
is already flat (300, regardless of whether the database has 300 or 20,000 memories) and
every stage below it is now bounded independently of `Selected`'s own size, **database growth
from 300 → 20,000 stored memories changes NOTHING below the Selected row** — the renderer's
cost is a function of the (already-flat) selection size and the camera/interaction state, not
of the database's total size. This closes the one gap Phase 1 identified as still leaking
database growth into render cost: **link count**, which this design's Detailed/Simplified/
Aggregate split (§5/§6) now bounds the same way node count already was.

---

## 11. Frame loop architecture

*Reclassifying every operation Phase 1's tick-loop inventory found, by required frequency.*

| Category | Operations (from Phase 1's tick-loop inventory) | Why this category |
|---|---|---|
| **Every frame** (true frame-rate work) | Node position/orbit update (`orbits.ts`); node coordinate sync back to react-force-graph; per-visible-object shader time-uniform updates (pulse/spin); camera/follow-lock interpolation; controls damping; frustum-cull check on the CURRENT tier's tracked objects; Detailed-tier link position/curve sync (bounded now, per §5-6, so this stays affordable even every frame) | These genuinely need to track continuous motion or camera state smoothly — deferring them would be visually obvious (stutter/lag) |
| **Low-frequency (5-15Hz)** | Label-cap sticky scan; star-light pool reassignment; spatial-grid visibility scan (already this class, at a coarser 60-frame/500-unit cadence — kept); Journey-hub/Money-sky sprite pulse (already 10Hz, kept); adaptive quality controller sample (already 2s, effectively this class already) | Already-throttled today; this design changes nothing about them except confirming they should stay exactly where they are |
| **Event-driven** (View changes, meaningful camera-distance-band crossing, selection changes, data changes, relevance changes) | **NEW — the render-model layer's tier assignment pass itself** (§1); aggregate membership recomputation (§9); Simplified/Aggregate link-buffer rebuilds (§5-6); instance-pool `Map<instanceId,nodeId>` rebuilds (only when pool membership changes) | This is the CORE relocation this design proposes: today, nothing exists in this category for tiering because there IS no tiering — everything is computed once at construction and never re-evaluated except via the existing binary visibility filters. Moving tier assignment here (not into "every frame") is what makes the whole architecture affordable. |
| **Background/precomputation** | The link repair/"tending" scan (already this class, 10s throttle, kept); any FUTURE server-side link-summary metadata (§Phase-1's optional Phase 4) — not required for this design, but would belong here if built | Already correctly placed; no change |

**What must explicitly move OUT of "every frame" under this design** (currently implicit/
absent, since there is no tiering today to misplace): nothing currently in `tick()` needs to
move to a SLOWER category than it already runs at — Phase 1's own tick-loop inventory already
found the existing per-frame operations to be individually cheap (O(N) or better, mostly
allocation-free). **The actual fix is not moving existing operations to a lower frequency —
it's adding the NEW tier-assignment layer at the correct (event-driven) frequency from the
start, so it never becomes an "every frame" cost in the first place.**

---

## 12. Object lifecycle

**Pool ownership**: each instanced pool (§4) is owned by `Graph3D.tsx` at the same lifecycle
scope as today's fixed-count systems (star-light pool, satellites) — created once at scene
setup, resized (not recreated) when its capacity needs adjusting, disposed once on unmount.

**Object reuse**:
- T3 nodes: **unchanged** — the existing `nodeThreeObjCacheRef`/`nodeVisualCacheKey` content-
  addressed cache (Phase 1 §4) continues to own detailed-object lifetime exactly as today.
  This design does not touch that cache's correctness properties at all.
- T1/T2 instances: an instance "slot" is reused across tier transitions where possible — e.g.
  a node demoting from T3→T2 should claim an existing free slot in the appropriate pool
  rather than the pool needing to grow, and a slot vacated by a promoted-to-T3 node becomes
  immediately available for a different node's demotion. **Pool resizing** (growing a pool's
  `InstancedMesh` capacity) is a rare, event-driven operation (only when the tier-assignment
  pass determines more simultaneous T1/T2 members exist than the pool currently holds) — never
  per-frame, and implemented via three.js's supported `InstancedMesh.count`/resize pattern
  (allocate generously up front based on the budgets in §2, so ordinary use never needs a
  true reallocation).
- Simplified/Aggregate link buffers: rewritten (not reallocated) on membership change — a
  `BufferGeometry`'s underlying `Float32Array` can be reused if capacity allows, matching the
  exact "no dispose, write the new data into the old buffer" pattern `linkTube.ts`'s
  `52d1abb` fix already established for Detailed-tier links.

**Geometry/material/texture lifetime**:
- T3: unchanged — the existing `geometryCache`/`labelTexCache`/`glowTexCache`/`macroTexCache`
  refcounting (Phase 1 §4) is untouched.
- T1/T2 pools: geometry and material are effectively **permanent, singleton** resources per
  pool (created once, live for the app's session) — there is no per-instance geometry/material
  to leak or churn, which is precisely why this design eliminates the biggest source of
  construction-time allocation Phase 1 identified (macro-body geometry, belt/ring geometry,
  per-node unique materials) for anything NOT in the bounded T3 population.

**Avoiding the specific failure modes named in the task**:
- **Object churn**: bounded by construction — T1/T2 never create/destroy objects on tier
  transitions, only reassign instance slots and rewrite instance attributes.
- **Geometry churn**: T1/T2 geometry is singleton-per-pool; T3 is unchanged from today's
  already-correct caching.
- **Material churn**: same as geometry.
- **Disposal/recreation loops**: the exact class of bug `dc24d2d` fixed (a disposed cache
  entry being silently reused) is a T3-only concern (that cache is untouched); T1/T2 instances
  are never individually disposed at all — only their pool's shared resources are, once, on
  unmount.
- **Cache-invalidation storms**: `nodeVisualCacheKey` (T3's cache key) is unaffected by this
  design; tier transitions do not touch it, so a node's `nodeVisualCacheKey` cache entry
  remains valid across any number of tier changes it goes through in its lifetime — a node
  that demotes T3→T2→T1→T2→T3 in one session should hit the SAME cached `Object3D` on its
  final return to T3, unless its actual visual attributes changed in between.

**View transitions** (Large↔Small, per Phase 1 §10): unchanged mechanism (`setCluster`) at
the top, but now ALSO triggers an event-driven tier-recompute pass (§11) — a cluster isolate
should immediately promote every member to at least T2 (since a small isolated view SHOULD
look as rich as it can afford to, matching the product's existing preference for a small view
"getting more," not "looking the same but smaller").

---

## 13. React boundary

**Goal restated: React owns application state; the renderer owns frame-rate state.**

| Concern | Lives in React | Lives in an imperative Three.js ref |
|---|---|---|
| Which node/link is selected/hovered (the ID) | **Yes** — `selectedId`/`hoverId` as today, unchanged contract | — |
| Which node/link is CURRENTLY rendering at which tier | — | **Yes, new** — a `tierStateRef` (or equivalent), owned entirely inside `Graph3D`, never surfaced to React. React does not need to know or care whether a given node is T1/T2/T3 at any instant — it only needs to know its stable id and (for UI panels) its data. |
| Cluster/lens membership (which ids are in scope) | **Yes**, unchanged (`cluster` state, `activeLens`/`clustered` UI flags) | Consumed by the imperative tier-assignment pass, not owned by it |
| Camera position/projection | — | **Yes**, unchanged — already imperative (three.js `camera` object, refs) |
| Instance-pool contents / instance-id→node-id maps | — | **Yes, new** — purely a rendering-layer bookkeeping structure, rebuilt on the event-driven cadence (§11), never exposed to React |
| Which entity a UI panel (Details/Inspector) is showing | **Yes**, unchanged — driven by `selectedId`, which is already tier-independent (§7) | — |
| `graphData` (the selected node/link arrays) | **Yes**, unchanged — same stable reference discipline already established (Phase 1 §2) | — |

**Props/callbacks needing stable identity**: no NEW requirement beyond what Phase 1's
react-prop-identity audit already established (`nodeThreeObject`, `linkWidth` — already
fixed). The tier-assignment system does not introduce any new `<ForceGraph3D>` prop; it lives
entirely inside `Graph3D`'s own imperative code (the same layer that already owns
`orbitsRef`, `nodeThreeObjCacheRef`, etc.), so it introduces **zero new React-render-triggered
surface area.**

**How View changes communicate with the renderer**: unchanged — `setCluster` remains the one
signal; the NEW behavior (tier recompute on cluster change) is triggered from the SAME
imperative code path that already reacts to `cluster` changing (inside `Graph3D`, not via a
new prop).

**How selection communicates with React**: unchanged (`onSelect(node)` callback, tier-
independent per §7).

**How UI panels receive selected entity information**: **completely unchanged** — this is the
central promise of this design's React boundary: `NodeInspector`/`FinancePanel`/etc. already
consume `selectedId`+`graphData`, never a live `Object3D` reference, so they are entirely
unaware that tiering exists.

---

## 14. Current code reuse — KEEP / MODIFY / REPLACE / DEFER

| Current system | Verdict | Reason |
|---|---|---|
| `Graph3D.tsx` (overall) | **MODIFY** | Add the render-model layer + instance-pool ownership; every existing subsystem it orchestrates today is otherwise kept |
| `nodeObject.ts` | **KEEP** (as the T3 implementation) | It IS the Detailed-tier's construction logic, unchanged; T1/T2 are new, separate, parallel code, not a replacement of this file |
| `linkTube.ts` | **KEEP** (as the Detailed-tier link implementation) | Same reasoning — `52d1abb`'s in-place geometry update remains exactly the right technique for the now-BOUNDED Detailed-link population |
| `orbits.ts` | **KEEP, lightly extended** | Its existing kinematic hierarchy is directly reused as the aggregation grouping basis (§9) — no change to its own core motion logic |
| Spatial grid (existing, in `Graph3D.tsx`) | **KEEP, reused** | Already the right granularity for both visibility culling AND aggregate-region boundaries (§9) |
| Node-object cache (`nodeThreeObjCacheRef`) | **KEEP** | Governs T3 only; untouched |
| Geometry cache (`getGeometry()`) | **KEEP, reused** | Its existing size-bucket partitioning becomes the natural T2 instance-pool partitioning key (§4) |
| Label cache (`labelTexCache`) | **KEEP** | Already correctly bounded (refcounted, Stage 7); labels are not tiered by this design |
| Glow cache (`glowTexCache`) | **KEEP for T3; MODIFY for T1/T2** | T3 unchanged; T1/T2 need a parallel, much simpler instanced-glow-sprite pool, additive to (not replacing) the existing cache |
| Star-light pool | **KEEP** | Already fixed-count and tier-independent; a T1/T2 body can still be lit by it like any other body |
| Adaptive quality controller | **KEEP** | Orthogonal concern (pixelRatio/bloom/detail-tier-of-shaders); this design's node/link tiering is a different axis and should compose with it, not replace it |
| Frustum culling | **KEEP, reused** | Applies identically regardless of representation tier — a T1 aggregate can be frustum-culled exactly like a T3 node |
| Orbit LOD (near/mid/far update-rate banding) | **KEEP** | Orthogonal to representation tier — a T1 instance's position still benefits from the same update-rate banding as a T3 node would at the same distance |
| Link LOD (`LINK_LOD_MIN`/`ZOOM`/`CUTOFF`) | **MODIFY** | This is the EXISTING binary visible/hidden mechanism this design extends into a three-way Detailed/Simplified/Aggregate/Hidden classification (§5) — reused as the starting point, not replaced |
| `GraphService.overview()` | **KEEP** | Already correctly bounds nodes; no change proposed here (a server-side link cap remains explicitly Deferred, not required by this design) |
| `EdgesRepo.within()` | **KEEP** (for now) | This design solves the rendering-side consequence of its unbounded link count without needing to change the query itself; revisit only if Phase 1's Phase-4 (optional server-side link-count visibility) is separately pursued |
| `GalaxyViews.tsx` | **KEEP** | Its category-chip mechanism feeds the same `cluster` state this design already builds on; no change needed |
| Journey hubs / Money sky | **KEEP** | Already a small, fixed-count, throttled overlay system, entirely orthogonal to node/link tiering |
| Interaction/selection (`onSelect`/`onNodeHover`/raycasting) | **MODIFY, additively** | The existing contract is preserved (§7/§13); the only addition is the instance-id resolution step for T1/T2 |
| PerfHUD/perfStats | **MODIFY, additively** | Should surface the NEW tier-distribution counts (how many nodes/links at each tier) alongside its existing counters — this is the validation instrument for §16, not a code change to the rendering path itself |

**Nothing healthy is recommended for rewriting.** Every "MODIFY" above is an addition
alongside existing, kept infrastructure — this design is explicitly a superset of the current
system for the Detailed tier, with two new, smaller tiers added beside it.

---

## 15. Migration strategy

**Sequencing rationale, from repository evidence (not the task's example order verbatim)**:
Phase 1's reconciliation (§14 there) showed that fixes targeting *construction cost*
(`52d1abb`) without first addressing *draw-call count* produced no real-device improvement.
This means the FIRST phase with real user-facing performance impact must be the one that
actually reduces tracked-object count — which is the **link** side (already unbounded, no
existing partial mitigation beyond the binary LOD gate) rather than the **node** side
(already bounded at 300, and instancing 300 nodes has a smaller ceiling-raising effect than
uncapping links has a ceiling-lowering effect). Node instancing is sequenced AFTER link
tiering for this reason, even though the task's own example order suggested a render-model
abstraction first, then links, then nodes, then aggregation — this design keeps that overall
shape but front-loads the link work specifically because it addresses Phase 1's
single-largest confirmed gap soonest.

| Phase | Objective | Files | Risk | Visual impact | Performance hypothesis | Acceptance criteria | Rollback |
|---|---|---|---|---|---|---|---|
| **1. Render-model abstraction (scaffolding only)** | Introduce the throttled tier-assignment pass as a NEW module, initially assigning every currently-visible node/link to "Detailed" (i.e., byte-for-byte today's behavior) — a pure refactor establishing the seam, not changing behavior | New: a `renderModel.ts`-equivalent module. `Graph3D.tsx`: wire it in, read-only at first (compute tiers, log/expose them via PerfHUD, don't yet act on them) | Low — no behavior change if wired as a no-op initially | **Invisible** (by construction — this phase changes nothing rendered) | N/A (this phase's own success criterion is "nothing changed") | Full existing test suite green; PerfHUD shows 100% of active nodes/links at "Detailed" tier, matching today's counts exactly | Trivial — delete the new module, remove the wiring |
| **2. Bounded link selection (Detailed-tier link cap)** | Cap the Detailed link population to the §2 budget using the existing weight/activity/selection signals (§6) — everything over the cap currently still renders as Detailed (no Simplified/Aggregate rendering YET), just... doesn't, past the cap (temporarily: simplest safe interim is "hidden," matching today's existing binary Hidden tier) | `Graph3D.tsx` (`linkVisibility` extended with a rank-based cutoff), reusing existing weight/activity fields | Low-moderate — a real behavior change (some links stop rendering that used to), but reuses the ALREADY-EXISTING binary hidden mechanism, just with a smarter cutoff than today's simple LOD-zoom gate | **Barely noticeable to noticeable**, depending on how link-dense the test account is — flagged honestly, this is the one phase most likely to be visible before Phase 3 lands the Simplified tier to soften it | Draw calls for a link-dense account should drop measurably (PerfHUD `renderer.info.render.calls`), FPS should improve on a real device for exactly the accounts where Phase 1 measured the sandbox's link-disable effect | Draw-call count at the link-dense test account drops by the amount corresponding to (real link count − budget); FPS/frame-time improves per Phase 16's real-device protocol | Revert `linkVisibility`'s new cutoff term — falls back to today's exact zoom-based LOD gate |
| **3. Simplified link representation** | Give the population capped out of Phase 2 a real, visible (if simpler) representation instead of hiding it — the merged `LineSegments` buffer (§5) | New: a `simplifiedLinks.ts`-equivalent module (parallels `linkTube.ts`'s existing shape). `Graph3D.tsx`: wire the buffer's lifecycle into the render-model layer's event-driven recompute | Moderate — new geometry/buffer-management code, but isolated (doesn't touch `linkTube.ts` or Detailed-link logic at all) | **Barely noticeable** — restores a visible connection cue for links Phase 2 had hidden, softening that phase's own visual impact | Draw calls stay flat even as the Simplified population grows (it's always exactly 1 additional draw call) | A link-dense account shows visibly-present (if simpler) connections for links beyond the Detailed cap; draw-call count for the Simplified tier stays at 1 regardless of how many links it contains | Fall back to Phase 2's "hidden past the cap" state by disabling the Simplified buffer's render call |
| **4. Aggregate link bundling** | Add the coarsest tier (§5/§6) for genuinely dense cluster-to-cluster regions | Same module family as Phase 3, extended | Moderate | **Noticeable** in the specific case of a very dense region (by design — see §3's honest classification) | Handles the 10,000+-link scenario Phase 1 flagged as the extreme case, keeping draw calls flat there too | A synthetic dense-graph test (mirroring the sandbox seed approach from Phase 1) shows flat draw-call count as link count is scaled up in the test data | Disable the Aggregate buffer; falls back to Phase 3's behavior (very dense regions just have a very populated Simplified buffer, still cheap, just visually busier) |
| **5. Shared/instanced node pools (T1/T2)** | Introduce the node-side tiers (§3/§4) now that the link side is bounded and the render-model layer's throttled-recompute pattern is proven | New: pool-management module(s). `nodeObject.ts`: unchanged (remains the T3 implementation the pools sit beside). `Graph3D.tsx`: wire tier-driven promotion/demotion between the T3 path and the new pools | Moderate-high — the first phase touching the node rendering path Phase 1 already found delicate (per-node-unique materials, existing cache correctness) | **Noticeable** for the T1 aggregate tier specifically (§3's own honest classification); **barely noticeable** for T2, since it targets a distance band already visually simplified today via the existing macro-LOD swap | A large-account test shows total node-related `Object3D`/draw-call count staying flat as selected-node count grows toward the 300 cap's own ceiling, and the SAME flatness holding if the cap were hypothetically raised (a synthetic test, not a production change to the cap itself) | Node instance pools are the single most novel piece of GPU code in this whole design; verify via a dedicated `npx tsx`-style harness (matching this codebase's own established discipline) BEFORE any real-device test — assert instance-attribute writes match expected per-node color/position/scale for a synthetic dataset | Feature-flag the pools off; every node falls back to T3-only rendering (today's exact behavior) |
| **6. Aggregation (client-side spatial grouping)** | Wire §9's aggregate-generation logic on top of the now-proven T1 pool from Phase 5 | New: aggregation module, reusing `orbits.ts`'s hierarchy + the spatial grid | Moderate | **Noticeable** by design (§3) — this is the phase that visually introduces "distant clusters read as one glyph" | Enables the 20,000-memory scenario's actual scaling story (§18) — should be validated against a synthetic large/dense dataset before any claim about real 20k-memory accounts | A synthetic 5k/20k-memory test dataset (server-side seed, matching Phase 1's own sandbox methodology) shows bounded total rendered-object count regardless of dataset size | Disable aggregation; Phase 5's T2 pools alone still bound cost (just with a higher practical node-count ceiling before things get visually crowded, since T2 doesn't yet consolidate distant groups) |
| **7. Frame-loop cleanup + obsolete-machinery removal** | Once Phases 2-6 are proven, remove any now-genuinely-dead code paths (e.g. the original binary `linkVisibility` zoom-gate, superseded by Phase 2's rank-based cutoff, IF it's confirmed fully subsumed) | `Graph3D.tsx`, `graph3dHelpers.ts` | Low, if done last (nothing else depends on removing this early) | **Invisible** (pure cleanup, no behavior change if done correctly) | N/A | Full test suite green; no behavior change measurable on any of the accepted scenarios from earlier phases | N/A — this phase is itself the "settle" step; a bug found here is a bug in the earlier phase's replacement logic, not something to "roll back" independently |

**Every phase is independently testable and independently revertible** — no phase requires
a later phase to already exist in order to ship safely; a project could stop after any phase
and be strictly better off (in the specific dimension that phase targets) than before it,
with the pre-existing system as a working fallback.

---

## 16. Performance validation plan

**No phase is accepted on "it feels faster."** Every phase (§15) has a numeric acceptance
criterion, all readable from the ALREADY-EXISTING `PerfHUD`/`perfStats` instrumentation
(Phase 1 confirmed these counters exist and are wired: `renderer.info.render.calls`/
`triangles`/`geometries`/`programs`, plus the already-registered `galaxyCounts` — this design
proposes EXTENDING `galaxyCounts` with new fields, not building new instrumentation):

```ts
// Proposed extension to the existing GalaxyCounts interface (perfStats.ts) — additive only
interface GalaxyCounts {
  // ...existing fields unchanged...
  detailedNodes: number;
  simplifiedNodes: number;   // NEW
  aggregateNodes: number;    // NEW
  detailedLinks: number;     // NEW (replaces ambiguity in the existing visibleLinks count)
  simplifiedLinks: number;   // NEW
  aggregateLinkBundles: number; // NEW
}
```

**Target behavior table** (targets explicitly PROPOSED, not measured — real-device numbers
remain Phase 1's flagged open unknown until measured):

| Scenario | Draw calls (target) | FPS (target, capped display) | Detailed nodes | Detailed links | Notes |
|---|---|---|---|---|---|
| Small View (today) | ≤50 | Uncapped headroom (already fast per Phase 1's sandbox result) | ≤ cluster size (~9) | ≤ cluster's own link count | Should be unaffected by this design — already fast, already all-Detailed by virtue of being small |
| Large View, 300 memories, sparse links (e.g. <400) | ≤1,200 (mobile soft ceiling) | Real-device target: 30fps sustained minimum, 60fps on capable hardware | ≤300 | = actual link count (all Detailed, under budget) | Should look and perform IDENTICALLY to today, since nothing is tiered down at this scale |
| Large View, 300 memories, dense links (2,000+) | ≤1,200 (mobile) — **this is the case Phase 1's sandbox measured collapsing today** | Real-device target: 30fps sustained minimum | ≤300 | ≤400 (§2 budget) | The headline case this design is built to fix — proposed target, needs real-device confirmation |
| 1,000 memories (selected) | ≤1,200 (mobile) / ≤2,000 (desktop) | Same as above | ≤300 (server cap unchanged) | ≤400-600 | Node selection is unaffected by database size beyond the existing cap; validates the "flat regardless of scale" claim at a first larger data point |
| 5,000 memories (selected, via a raised `limit` OR a synthetic test) | Same draw-call ceiling as above — **the point being it should NOT rise** | Same | ≤300-1,000 depending on tier mix | ≤400-600 | Requires a synthetic seed test (matching Phase 1's own sandbox methodology) since a real 5,000-memory account may not exist for testing |
| 20,000 memories (synthetic) | Same draw-call ceiling — **the central claim of this entire design** | Same | Tier-distributed per §3/§9 | ≤400-600 | The scenario that most directly tests whether "database growth ≠ renderer growth" actually holds |

**Real-device testing is mandatory before any phase ships as "done"** — per this codebase's
own established discipline (CLAUDE.md's "prove it by measurement, not assertion," already
cited repeatedly in this program's prior stages) and Phase 1's explicit finding that a
sandboxed, software-rendered proxy cannot be trusted for FPS magnitude, only for
mechanism-level validation (draw-call deltas). Each phase's synthetic/sandbox test
(`npx tsx` harnesses, a seeded local dev server matching Phase 1's own methodology) validates
CORRECTNESS and the MECHANISM (does draw-call count actually drop the expected amount); only
a real device confirms the resulting FPS/frame-time is actually acceptable.

---

## 17. Failure / safety model

**Graceful degradation ladder** (extends, does not replace, the EXISTING adaptive-quality-
controller concept — that system already governs pixelRatio/bloom/shader-detail rungs;
this design adds a PARALLEL ladder for node/link REPRESENTATION, since Phase 1 confirmed
representation, not just render-quality settings, is the actual missing axis):

```
Normal detail
   (everything the render-model layer's ordinary tier assignment computes, per §3/§5/§8)
        ↓  [triggered if the render-model layer detects the CURRENT tier assignment would
        ↓   exceed the active performance budget (§2) for the device's current tier —
        ↓   reusing the EXISTING adaptive controller's own tier signal, not inventing a
        ↓   second one]
Reduced detail
   (lower the Detailed-tier population cap temporarily — e.g. 300→200 nodes, 400→250 links —
    demoting the lowest-relevance members first, per the SAME relevance ordering §6 already
    establishes)
        ↓
Reduced labels
   (tighten MAX_VISIBLE_LABELS further — this dial ALREADY EXISTS and is already tier-scaled;
    this step just allows the adaptive controller to push it lower under sustained pressure,
    same mechanism, more aggressive setting)
        ↓
Reduced link detail
   (shrink the Detailed-link cap further, or demote the Simplified tier's own visual
    prominence — e.g. thinner/more transparent — before touching node representation at all,
    since links are cheaper to simplify than nodes are to lose entirely)
        ↓
Aggregate representation
   (lower the T2→T1 threshold — MORE nodes become aggregated sooner — the graceful,
    reversible "the galaxy still looks like a galaxy, just coarser" step)
        ↓
Hidden low-priority content
   (only as the LAST resort — demote the very lowest-relevance Aggregate-tier content to
    fully Hidden, never touching anything the user is actually interacting with)
```

**What is explicitly protected at every step, per the task's own requirement**:
- **Selected/hovered/followed objects are NEVER demoted** — this is a hard invariant of §3's
  design (selection always forces T3), independent of how aggressive the degradation ladder
  gets. A user actively interacting with the galaxy should never see the thing they're
  looking at get cheaper out from under them, even under severe budget pressure.
- **Current interaction context is preserved** — the active cluster/lens's own members are
  demoted last among their peers (they were the reason the user is looking at this region).
- **Spatial context is preserved** — even fully-Hidden content leaves its parent
  Aggregate/region glyph visible, so the galaxy never looks like it lost structure, only
  detail.
- **Visual identity is preserved** — the ladder's every step keeps SOMETHING celestial and
  glowing on screen; "frame rate → 0" is explicitly disallowed by construction, since the
  final rung (Hidden low-priority content) always has a floor at "the currently-interactive
  set, fully detailed" — the one thing this ladder can never sacrifice.

**Where this connects to existing infrastructure**: the adaptive quality controller
(Stage 6 of the earlier Performance Program) already implements exactly this kind of
asymmetric-hysteresis, budget-driven rung system for pixelRatio/bloom/shader-detail — this
design's representation ladder should be wired as an ADDITIONAL rung dimension on the SAME
controller (reusing its hysteresis/cooldown logic), not a second, independent state machine.

---

## 18. 5k/20k scenarios (concrete walkthroughs)

**Scenario A — 5,000 memories (stored)**
- Stored: 5,000. Selected: 300 (`overview()`, unchanged). Active: ≤300 (post cluster/lens
  filter, none active by default). Visible: ≤300 (post frustum cull). Detailed: ≤300 nodes
  (all of them, if link count allows — see below), ≤400 links (capped per §2/§6, assuming a
  moderately-connected account). Aggregates: 0 by default (nothing NEEDS aggregating at only
  300 active nodes, unless they're spatially very spread out — plausible but not assumed).
  Draw calls: ≈500-900 (node bodies at full T3, links capped at ~400). **Frame work**: the
  SAME per-frame cost class as today's 300-node case — this scenario is not meaningfully
  different from "300 memories" from the renderer's point of view, which is precisely this
  design's point.

**Scenario B — 20,000 memories (stored)**
- Identical to Scenario A in every rendering-relevant respect. Stored size does not appear
  anywhere below the Selected row. This is the single clearest illustration of the design's
  central claim.

**Scenario C — 20,000 memories, dense relationship graph**
- Stored: 20,000. Selected: 300 (unchanged — the induced subgraph among these 300 may now be
  genuinely dense per Phase 1 §11's real-account hub-accumulation mechanism). Detailed links:
  capped at ≤400-600 (the top by weight+activity+selection). Simplified links: however many
  fall between the Detailed cap and the Simplified tier's own practical visual-clutter
  ceiling. Aggregate link bundles: the remainder, however large — collapsed into a small,
  fixed number of cluster-pair bundle lines. **Draw calls: still ≈500-900 (nodes) + a FLAT
  ~30-60 (links: 400 Detailed meshes collapse to individual draws, but the Simplified and
  Aggregate tiers are each ONE draw call regardless of how many thousands of underlying links
  they represent)** — this is the scenario Phase 1 measured as catastrophic today (thousands
  of individual link draw calls) and this design's entire link architecture (§5/§6) exists
  specifically to bound.

**Scenario D — user zooms from aggregate universe into one important memory**
- Starts: most of the current Selected set is at T1 (aggregate), since the camera is zoomed
  far out (large screen-space-size threshold not met for most bodies, per §8). As the camera
  moves closer, the render-model layer's event-driven recompute (triggered by crossing a
  meaningful screen-space-size band, §11) promotes the aggregates the camera is approaching
  into their T2 member instances — visually, distant glyphs resolve into several smaller
  glyphs occupying roughly the same space (§3's "no discontinuity" design). Continuing to
  zoom toward one specific body crosses the T2→T3 threshold for that body alone (the existing
  macro-LOD swap mechanism, unchanged) — it becomes a full, rich, detailed celestial body,
  while its neighbors remain at whatever tier their own screen-space size currently justifies.
  At no point does the whole galaxy re-tier at once — only the region the camera is actually
  approaching.

**Scenario E — user selects one node in a dense region**
- The selected node is immediately forced to T3 (§3's hard rule), regardless of its previous
  tier. Its direct links are immediately promoted to Detailed regardless of their
  weight/activity score (§6's "selection always wins" rule). For SECOND-degree
  connections (the selected node's neighbors' own other links), `computeRelevance()`
  (already-existing, §6) can optionally run ONCE, on this single event, against this small,
  now-bounded candidate set (the selected node's direct neighborhood) to decide which of
  THOSE deserve promotion too — this is exactly the bounded-candidate-set use case that
  function was already built for, invoked here for the first time in a rendering context but
  requiring zero new intelligence-layer code. **Critically, this does not re-tier the entire
  universe** — only the selected node's own local neighborhood recomputes; every other
  region's tier assignment is untouched, which is what keeps this an O(neighborhood size)
  operation, not an O(everything selected) one.

---

## 19. Visual identity audit

| Visual element | Affected by this design? | Classification | Notes |
|---|---|---|---|
| Luminous celestial bodies (glow, color, shape) | T3 unchanged; T1/T2 get a simpler-but-still-luminous instanced glow | **Invisible (T3)** / **Barely noticeable (T2)** / **Noticeable (T1)** | T1's honesty flag from §3 carried forward |
| Different body types reading distinctly | T3 unchanged (full per-tier shape/ring/belt); T2 preserves shape family (icosahedron-vs-sphere) per mass-class pool; T1 is a single generic glyph | **Invisible (T3)** / **Barely noticeable (T2)** / **Noticeable (T1)** | T1 deliberately trades "which exact type" for "there's something here," matching real-astronomy visual grammar at that scale |
| Glow richness/depth | See above | Same as above | |
| Depth/spatial scale (parallax, camera-relative sizing) | Unaffected — tiering changes REPRESENTATION, never POSITION | **Invisible** | Positions come from the same `orbits.ts` output regardless of tier |
| Orbital movement | Unaffected for T3; T2 gets the same orbit position via instance-matrix updates (§3); T1 aggregates move as their anchor member does | **Invisible (T3)** / **Invisible (T2 — position is identical, only representation differs)** / **Barely noticeable (T1 — an aggregate's motion is its anchor's motion, a small simplification)** | |
| Constellation/cluster feel | **Enhanced, not diminished** — aggregation (§9) makes dense regions read AS clusters more legibly than today's uniform individual-body treatment does | **Invisible-to-positive** | Worth stating plainly: this is one place the new architecture may read as a visual IMPROVEMENT, not just a cost-neutral change |
| Relationship lines (links) | Detailed unchanged; Simplified/Aggregate are visually simpler by design | **Invisible (Detailed)** / **Barely noticeable (Simplified — thinner, straight instead of curved)** / **Noticeable (Aggregate — bundled)** | Directly addressed and accepted per §5/§6 — the alternative (today's unbounded individual tubes) is not actually viable at scale, so "noticeable but graceful" beats "invisible until it catastrophically fails" |
| Labels | Completely unchanged (§3/§13) | **Invisible** | |
| Journey/Money visual language | Completely unchanged — explicitly out of scope (§14 Keep) | **Invisible** | |
| Selection effects | Preserved exactly, with the new instance-attribute-based highlight for T1/T2 (§7) | **Invisible** | The visual EFFECT (a body lighting up on selection) is designed to look identical regardless of which tier resolved it |
| Camera responsiveness | Improved, not degraded — this is the entire performance goal | **Positive** | |
| "Living universe" feeling | The explicit design goal throughout (§0, §3's phase-offset pulse for instanced tiers, §9's exploding clusters, §17's graceful-not-abrupt degradation) | **Preserved by design intent; final judgment requires real-device visual review (§16)** | This is the one area where written design cannot fully substitute for looking at it — flagged honestly rather than asserted with false confidence |

**Overall verdict**: the majority of this design's changes are Invisible or Barely
Noticeable during normal exploration — exactly the task's stated preference. The two
honestly-flagged Noticeable changes (T1 aggregate glyphs, Aggregate-tier link bundling) are
both changes to what happens **far from the user's current focus**, never to what they're
actively looking at, and both are argued (not merely asserted) to match rather than violate
the galaxy's own established visual grammar (a real galaxy's distant regions genuinely do
read as resolved clusters, not as individually-distinguishable bodies).

---

## 20. Final architecture

```
                              MEMORY / ENTITY DATA (unbounded)
                                          │
                                          ▼
                    GraphService.overview(limit)  — EXISTING, unchanged
                         bounded node selection (≤300 default, ≤5000 hard cap)
                         + EdgesRepo.within(ids) — unchanged, still unbounded UPSTREAM
                                          │
                                          ▼
                          RENDER-MODEL LAYER (NEW — client-side, Graph3D.tsx)
                    ┌─────────────────────┴─────────────────────────┐
                    │  Throttled / event-driven ONLY (never per-frame):        │
                    │   • screen-space projected size (§8)                    │
                    │   • existing weight/activity/selection signals (§6)     │
                    │   • existing cluster/lens state                         │
                    │   • orbits.ts's existing kinematic hierarchy (§9)       │
                    │   • optional computeRelevance() for a selected node's   │
                    │     own bounded neighborhood only (§6/§18E)             │
                    └─────────────────────┬─────────────────────────┘
                                          │  tier assignment: per node → {T0,T1,T2,T3}
                                          │                   per link → {Hidden,Aggregate,
                                          │                                Simplified,Detailed}
                    ┌─────────────────────┴─────────────────────────┐
                    ▼                                                ▼
          NODE REPRESENTATION                              LINK REPRESENTATION
                    │                                                │
      ┌─────────────┼─────────────┐                     ┌───────────┼───────────┐
      ▼             ▼             ▼                      ▼           ▼           ▼
  T1 Aggregate   T2 Simplified  T3 Detailed          Aggregate   Simplified   Detailed
  1 InstancedMesh 3-6 pooled    Unchanged             1 bundle-  1 merged     Unchanged
  pool, whole     InstancedMesh makeNodeObject()      LineSegments LineSegments TubeGeometry
  galaxy          pools, by     Object3D per node,    buffer per  buffer,     mesh per link,
                  mass class    ≤300 (§2)              cluster-pair unbounded   ≤400-600 (§2)
                                                        (~10-30)    membership,
                                                                    1 draw call
      └─────────────┴─────────────┘                     └───────────┴───────────┘
                    │                                                │
                    └───────────────────────┬────────────────────────┘
                                             ▼
                            BOUNDED RENDER POOLS (a small, FIXED count —
                          roughly a dozen node pools + 3 link buffers/bundles,
                              regardless of database or selection size)
                                             │
                                             ▼
                                  THREE.JS / GPU LAYER
                        (draw calls = O(pools) + O(Detailed-tier population),
                                NEVER O(total selected or stored))
                                             │
                                             ▼
                                     FRAME BUDGET
                    (§2's proposed ceilings; §17's degradation ladder as the
                                    safety valve under pressure)
```

**Why 20,000 stored memories do NOT become 20,000 expensive Three.js objects**: because
`overview(limit)` already flattens `Stored` to a fixed `Selected` size regardless of database
growth (existing, unchanged), and this design closes the ONE remaining leak Phase 1 found
(unbounded LINK rendering cost) by giving links the same bounded, tiered treatment nodes
already had a partial version of — and because the render-model layer, not raw data volume,
is what decides how many Three.js objects actually get created, via a small, fixed number of
reusable instanced pools rather than one object per entity.

---

## 21. Decision matrix

| Option | Scalability | Implementation complexity | Visual fidelity | Interaction complexity | Mobile perf | Desktop perf | Cache complexity | Migration risk |
|---|---|---|---|---|---|---|---|---|
| Current individual `Object3D` model (status quo) | Poor — unbounded with link count | N/A (already built) | Highest (full detail always) | Simplest (direct `userData`) | Poor at scale (Phase 1's confirmed collapse) | Better, but still eventually unbounded | Already solved (existing caches) | None (baseline) |
| Instanced node pools only (no link work) | Partial — nodes bounded further, but Phase 1's confirmed DOMINANT gap (links) untouched | Moderate | High for T3 (unchanged); a visible step-down for anything instanced | Moderate (instance-id resolution) | Improves node-side cost, but per Phase 1's own reconciliation pattern, likely insufficient alone (mirrors why `52d1abb` alone didn't fix the real device) | Same | Moderate (new pool bookkeeping) | Moderate |
| Batched/merged geometry only (nodes) | Same ceiling issue as above for links | Moderate-high (per-node-unique materials fight merging, Phase 1 §13) | Real risk of visual homogenization if forced onto T3 | High if attempted on interactive detailed nodes | Moderate improvement, same link gap | Same | High (a merged buffer's per-node identity bookkeeping is more complex than per-instance attributes) | Higher (already investigated and declined earlier in the program for good reason) |
| Simplified line-based links only | Bounds a large share of Phase 1's confirmed dominant cost | Low-moderate | Barely noticeable (Simplified) to noticeable (if applied to EVERYTHING, including what should stay Detailed) | Low (links aren't individually interactive today beyond hover-emphasis) | **High-impact, low-risk** — directly targets the confirmed dominant cost | Same | Low | Low |
| Instanced link representation (rigid instancing of link geometry) | Would help count, but Phase 1/this design both find it a poor technical fit (per-link curvature/endpoints aren't instancing-shaped) | High, and arguably wasted effort per the technical mismatch | Would likely force straightening/simplifying links anyway, at which point plain merged geometry is simpler | N/A | Comparable benefit to merged geometry, more implementation risk for no clear gain | Same | Higher than merged geometry, for no clear benefit | Higher, not recommended |
| Aggregate links (bundling) | Bounds the extreme (5k-10k+ link) case specifically | Moderate | Noticeable, by design, in dense regions only | Low | High-impact for the extreme case | Same | Low-moderate | Moderate |
| Spatial aggregation (nodes, T1) | Bounds the extreme (5k-20k memory) node case specifically | Moderate-high | Noticeable, by design, for distant/unfocused content only | Moderate (explode-on-select) | High-impact for the extreme case | Same | Moderate | Moderate-high (the most novel single piece) |
| **Hybrid architecture (this document's recommendation: tiered nodes T1/T2/T3 + tiered links Detailed/Simplified/Aggregate, sequenced per §15)** | **Bounded on both axes — the only option that closes Phase 1's confirmed gap AND avoids its confirmed dead ends** | **Highest total scope, but decomposed into 7 independently-shippable, independently-revertible phases (§15) — no single phase is individually high-risk** | **Preserves full fidelity for everything the user is actually focused on (§17's hard invariant); honestly-flagged, bounded visual simplification only for distant/low-priority content** | **Fully preserved via the instance-id/aggregate-member resolution path (§7) — the one option that doesn't compromise interaction to gain performance** | **Best available, addressing the confirmed dominant cost (links) first per the migration sequencing (§15)** | **Best available** | **Moderate overall, but each piece (instance-id maps, buffer rewrites) is individually simple and well-precedented** | **Managed via phased, independently-revertible rollout (§15) — the recommended path specifically because no other option offers this** |

---

## 22. Final recommendation

### Recommended Architecture

A **hybrid, tiered render-model layer**, inserted between the existing (already-correct)
server-side node selection and the existing three.js rendering machinery: nodes get a new
Aggregate/Simplified tier (backed by `InstancedMesh` pools) alongside the unchanged Detailed
tier (today's `nodeObject.ts`); links get a new Simplified/Aggregate tier (backed by merged/
bundled `LineSegments` buffers) alongside the unchanged Detailed tier (today's `linkTube.ts`).
A single, throttled/event-driven tier-assignment pass — never a per-frame operation — decides
which tier each currently-selected entity deserves, based on screen-space projected size,
existing weight/activity/relevance signals, and selection/cluster state.

### Why

Phase 1's audit CONFIRMED the catastrophic collapse is caused by an unbounded number of
individually-drawn Three.js objects, with links as the one confirmed-unbounded axis (nodes
already have a partial, distance-based version of this same idea via the existing macro-LOD
swap). It also confirmed, via direct reconciliation of seven prior fix attempts, that
construction-cost optimizations (`52d1abb`) cannot fix a draw-call-COUNT problem, and that
the one previously-effective fix (`d24f7cc`) worked precisely because it eliminated a cost
with no floor beneath it — this design's entire strategy is to give both nodes and links a
genuine, bounded floor (a small, fixed pool count) instead of an unbounded one.

### What Changes

- A new render-model/tier-assignment layer inside `Graph3D.tsx` (event-driven, not per-frame).
- New `InstancedMesh` pools for T1 (aggregate) and T2 (simplified) node representation.
- New merged/bundled `LineSegments` buffers for Simplified and Aggregate link tiers.
- The existing binary `linkVisibility` LOD gate extended into a ranked, budget-aware cutoff.
- `PerfHUD`/`perfStats`' `GalaxyCounts` extended with per-tier counts (additive only).
- The existing adaptive quality controller extended with a representation-tier degradation
  rung (§17), reusing its hysteresis logic rather than a new state machine.

### What Stays

`nodeObject.ts` and `linkTube.ts` (as the unchanged Detailed-tier implementation),
`orbits.ts`'s core motion logic (reused, not replaced, as the aggregation grouping basis),
the existing node-object/geometry/label/glow caches, the fixed star-light pool, frustum
culling, orbit LOD banding, `GraphService.overview()`, `EdgesRepo.within()`, `GalaxyViews.tsx`,
Journey hubs/Money sky, and the entire existing React↔Three.js prop-stability discipline
(Phase 1's `f5d4dab` fix and everything built on it).

### What We Do First

**Phase 2 of §15 — bounded Detailed-tier link selection**, reusing the already-computed
weight/activity/selection signals to cap the individually-drawn link population at the
proposed §2 budget. This is the smallest change that directly targets Phase 1's
confirmed-dominant, still-entirely-unaddressed cost, requires no new GPU technique (only a
smarter cutoff on the existing binary visibility mechanism), and is fully, trivially
revertible.

### What We Do NOT Touch Yet

Node-side instancing/aggregation (§15 Phases 5-6) — deliberately sequenced LAST, after the
link-side fix (Phase 1's own confirmed-largest gap) has already shipped and been validated
on a real device. `GraphService.overview()`'s node-selection algorithm and `EdgesRepo.within()`
itself remain untouched throughout this entire program — this design solves the rendering
consequence of an unbounded link query without needing to change the query. The adaptive
quality controller's existing pixelRatio/bloom/shader-detail axis is extended, never replaced.
No visual effect (glow, labels, links, orbital motion) is removed wholesale at any phase.

---

## Report

1. **Document created**: `docs/specs/soumaya-galaxy-bounded-render-architecture.md` (this file).
2. **Files inspected this task** (read-only): `packages/web/src/graph/Graph3D.tsx` (interaction/
   raycast section, `onNodeClick`/`onNodeHover`/`onGalaxyEntityClick`/`flyToGalaxyEntity`),
   `packages/web/src/api/graph.ts`, `packages/server/src/analysis/relevance.ts` (full
   `computeRelevance`/`RelevanceContext`/`RelevanceResult` read), plus every finding already
   established in the parent audit (`soumaya-galaxy-large-small-workload-diff-audit.md`) and
   its own cited sources (`nodeObject.ts`, `shaders.ts`, `celestial.ts`, `graph3dHelpers.ts`,
   `linkTube.ts`, `perfDiag.ts`, `orbits.ts`, `App.tsx`, `GalaxyViews.tsx`,
   `graph/service.ts`, `edges.repo.ts`, `api/routes/graph.ts`, `seed.ts`,
   `ingestion/associativeLink.ts`, the vendored `three-forcegraph`/`react-kapsule` source, and
   the existing `soumaya-galaxy-rendering-architecture-audit.md` / `soumaya-galaxy-react-prop-
   identity-audit.md` documents) — reused and cited rather than re-read line-by-line where
   already established.
3. **Architecture selected**: a hybrid, tiered render-model layer (Detailed/Simplified/
   Aggregate for both nodes and links), backed by `InstancedMesh` pools (nodes) and merged/
   bundled `LineSegments` buffers (links), governed by a new throttled/event-driven
   tier-assignment pass — never per-frame, never a new relevance-scoring engine (reuses
   existing weight/activity/relevance/cluster signals throughout).
4. **Proposed performance budgets**: §2's table (mobile ~800-1,200 soft / ~2,000 hard draw
   calls, desktop ~1,500-2,000 soft / ~3,500 hard; ≤300 detailed nodes; ≤400-600 detailed
   links; all other quantities either already correctly bounded or newly bounded by this
   design) — explicitly labeled proposed engineering targets, not measured facts.
5. **Proposed migration phases**: §15's seven phases (render-model scaffolding → bounded
   link selection → simplified links → aggregate link bundling → instanced node pools →
   spatial aggregation → cleanup), each independently shippable, testable, and revertible.
6. **Major unknowns requiring runtime validation** (mirrors Phase 1's own §20, extended):
   real-device draw-call/FPS numbers at every scenario in §16's target table; the real
   visual acceptability of the T1 aggregate glyph and Aggregate link-bundle representations
   (§19's one honestly-unresolved item — writing cannot substitute for looking at it); the
   real GPU/driver's actual `InstancedMesh` performance characteristics on the affected mobile
   device; whether a real, actively-used account's induced-subgraph link density actually
   reaches the regime (§18 Scenario C) this design's link tiering is built to handle.
7. **Confirmation**: no production source file, test file, or package file was modified or
   created in this task. No temporary instrumentation was added. No commit was made. The only
   working-tree change is the single new design document listed in item 1.
