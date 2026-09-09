# Soumaya Galaxy — Mobile-First Rendering Contract

> **Status: architectural source of truth, staged rollout in progress.** This document
> governs all future Galaxy rendering work. Where it conflicts with anything implied by
> older Galaxy audits or the Performance Program plan notes, **this document wins** — those
> documents' *measurements* remain valid evidence; their *proposed next steps* are
> superseded by the staged plan in §12 of this contract.
>
> Parent findings: `docs/specs/soumaya-galaxy-large-render-forensic-audit.md` (the forensic
> trace that motivated this contract — read it first for *why*; this document is *what we
> build toward*). Two of its findings are already fixed and pushed (see that document's §27);
> everything else in this contract describes work not yet built, explicitly scoped as such.

---

## 1. The principle

> **The world can be enormous. The frame cannot be.**

Soumaya's galaxy is a knowledge graph that grows with the user's life — it may hold hundreds
of memories today and tens of thousands eventually. The renderer must never assume
`N memories = N expensive GPU objects`. Database growth is a **data** problem; frame cost is
a **render** problem, and the boundary between them is deliberate, architected, and enforced.

**Mobile is the baseline, not the degraded path.** The contract is designed around a
mid-range Android phone hitting 30 FPS with real headroom. A better device does not get "the
same reduced galaxy, rendered faster" — it gets **more**: sharper resolution, finer detail
tiers, richer postprocessing, higher representation budgets. Every budget in this document is
per-device-class, not a single global ceiling.

**Visual identity is non-negotiable.** The Galaxy/space aesthetic, glowing celestial bodies,
meaningful hierarchy (important things read as important), labels, visible relationships,
selection states, the Sun, the backdrop, Journey/Money visual language, depth, and visual
storytelling all survive this program unchanged in *kind* — what changes is *how many* GPU
objects deliver that identity per frame, and *which* representation tier a given entity earns
at a given moment.

---

## 2. Frame budget

| Target | Frame time | Notes |
|---|---|---|
| Minimum acceptable | — | Stable interaction, no multi-second frame freezes. This is the floor: a device that cannot sustain this is a **failure condition**, not a "known limitation." |
| Target | ~33.3 ms (30 FPS) | The mobile baseline. |
| Stretch | ~16.7 ms (60 FPS) | Where device budget permits — including on the mobile baseline once the fixes in §12 Stage 1 land, not reserved for desktop. |

A ~1000 ms frame (the measured pre-fix state) is a **catastrophic failure**, not a slow frame
to be tolerated. No future change may reintroduce a render-path cost that is resolution- or
distance-*independent* and scales with nothing the user controls (the shape of the Sun's
transmission-pass bug) — that class of bug is now covered by `sun.test.ts` and this contract's
§9 audit requirement for any future material/postprocessing change.

**Instrumentation requirement, carried over from the forensic audit's §21 corrections:**
`gapMs` cannot distinguish GPU-bound-with-back-pressure from CPU-bound (a frame that blocks
*inside* `renderer.render()` shows as small `gap`, large `render`). `renderer.info` sums
across every internal pass three.js performs inside one `render()` call, not just the
visible frame. Any future perf work must read `perfStats.ts`'s numbers with these two
corrections in mind, and any dashboard/HUD text describing "CPU bound" vs "GPU bound" must
not be trusted uncritically in this regime.

---

## 3. Device classes

Three classes, each with its own budget row throughout this document. `graphicsConfig.ts`'s
existing `tier` (`performance | balanced | quality`) is the closest existing analog — these
classes formalize and extend it rather than replace it; §12 describes the migration.

| Class | Frame target | Who |
|---|---|---|
| **Mobile Low** | 30 FPS, aggressive budgets | Weak/old Android, Battery Saver on |
| **Mobile Standard** | 30 FPS min / 60 FPS goal | The baseline design target — a mid-range Android phone |
| **Desktop/Laptop** | 60 FPS, higher budgets | More detail, more postprocessing, higher resolution — **still bounded**, never unlimited |

Every class degrades gracefully into the one below it under budget pressure (§8, adaptive
quality) — a Desktop session under unusual load can fall back toward Mobile Standard's
budgets rather than dropping frames indefinitely.

---

## 4. Render budgets

Initial engineering limits — **not sacred numbers**. They exist to be calibrated against the
real baseline device once real-device measurement (post Fix #1/#2) is available, and are
expected to move. What must never move is the *existence* of a budget for every category
below: **no render category grows unbounded.**

| Category | Mobile Low | Mobile Standard | Desktop |
|---|---|---|---|
| Draw calls (soft / hard) | 500 / 1,000 | 800 / 1,500 | 1,500 / 3,000 |
| Detailed node objects (Tier 4-6, §6) | 40 | 80 | 200 |
| Simplified nodes (Tier 3, instanced) | 400 | 1,500 | 5,000 |
| Aggregate/point-tier nodes (Tier 0-2) | unbounded (cheap by construction) | same | same |
| Detailed links (Tier: individual geometry) | 100 | 200 (current `renderModel.ts` default) | 400 |
| Simplified links (shared-buffer) | 500 | 1,500 | 4,000 |
| Aggregate links (bundled) | unbounded (cheap by construction) | same | same |
| Triangles | 300k | 600k | 1.5M |
| Transparent objects in flight | 150 | 300 | 600 |
| Active point lights | 3 | 4-6 (existing pool sizes) | 8 |
| Particles/points | 3,000 | 6,000 (~current measured 5,910) | 12,000 |
| Postprocessing passes | 0 (bloom off) | 1 (bloom) | 2+ |
| Render resolution (pixel ratio cap) | 1.0 | up to 2.0 (existing rung table) | up to native DPR |
| Transmissive materials in the live scene | **0** | **0** | **0** |
| VRAM (textures + geometry, approx) | 150MB | 300MB | 800MB |

**Transmissive materials at 0 across every class is deliberate and permanent**, not a
temporary mobile restriction: §22 of the forensic audit showed a single `transmission > 0`
material reroutes the *entire frame* through an expensive alternate path regardless of how
small or distant that one object is. If a future feature genuinely wants a glass/refraction
look, it must be evaluated against this contract explicitly, not added incidentally the way
`sun.glb`'s authoring pipeline did.

**Per-frame allocation budget:** zero steady-state heap growth attributable to the render
loop (matches the existing Performance Program Stage 2 standard — `perfStats.ts` already
tracks heap delta-per-second for exactly this).

**GPU resource churn budget:** zero geometry/texture/material creation or disposal per frame
in steady state. Construction/disposal is allowed only at genuine lifecycle events (a node
enters/leaves the tracked set, a representation tier changes with hysteresis, a device-class
change). The pre-existing `linkTube.ts`/three-forcegraph geometry-dispose mismatch (forensic
audit §14) is a concrete violation of this budget already on file for fixing under §12 Stage 3.

---

## 5. Data model ≠ render model

```
Soumaya data (nodes, edges, journeys, money — SQLite + sqlite-vec)
        │
        ▼
Graph / Intelligence layer (existing analysis/*.ts services — unchanged by this contract)
        │
        ▼
RENDER PLANNER   ◄── device class, budget state (§8), zoom/camera, screen-space size,
        │            importance/activity/relevance, active/selected/cluster/lens state
        ▼
RENDER MODEL     (points / sprites / instances / simplified / detailed / aggregate)
        │
        ▼
Three.js scene graph
        │
        ▼
GPU
```

**The graph data layer answers "what exists."** The Render Planner answers "what deserves
GPU representation right now, at this device's budget." These are architecturally separate
concerns and must stay separate: a service in `analysis/*.ts` must never need to know about
representation tiers, and `Graph3D.tsx`'s render loop must never query the database directly
— it already doesn't (data arrives via the existing graph-fetch path), and this contract
requires that boundary to hold as the planner is built out.

`packages/web/src/graph/renderModel.ts` is the **existing, partial implementation of this
boundary** for links (`selectDetailedLinks`, the `detailed | hidden` tiering already shipped
in the Performance Program). It is extended, not replaced — see §7 and §12.

---

## 6. Representation tiers (nodes)

| Tier | Name | Cost character | Current status |
|---|---|---|---|
| 0 | Data only | Zero GPU footprint — entity exists logically, nothing rendered | Implicit today (a node the graph service doesn't return) |
| 1 | GPU point | One vertex in a shared `Points` buffer | Not yet used for ordinary nodes — closest existing analog is the asteroid-belt/starfield point clouds, which are decorative, not node representations |
| 2 | Sprite/billboard | One quad, shared material, cheap | Not yet used for ordinary nodes |
| 3 | Instanced simple body | Shared geometry+material, per-instance transform via `InstancedMesh` | **Not yet built** — §12 Stage 4 |
| 4 | Simplified 3D object | The existing macro-LOD sphere (`nodeObject.ts`'s `makeMacroBody`, 14×14, cached texture, no shader) | **Already shipped** (Performance Program Stage 4/5) |
| 5 | Detailed 3D body | The existing full-fidelity body (procedural `ShaderMaterial`, rings, glow, belt) | **Already shipped**, now tagged `userData.isBody` (§27 of the forensic audit) for the early-Z fix |
| 6 | Hero | Highest fidelity — reserved for the active/selected/followed node and named agents (Soumaya's ship, the Sun, the space station) | **Already effectively how the Sun/ship/station work** — formalized here, not new |

**Selection is screen-space-aware, not purely world-space-distance-aware**, per the
program's explicit requirement: a large body far away can occupy meaningful screen pixels; a
small body nearby may not. The existing macro-LOD swap (`MACRO_DIST`, a fixed world-space
threshold) is the current mechanism and stays as the **first** cut; §12 Stage 4/6 layers
screen-space coverage on top of it rather than replacing it outright, to avoid destabilizing
the hysteresis behavior already tuned in Performance Program Stage 5.

**Hard cap, non-negotiable:** the count of Tier 4+ objects **never scales linearly with total
database size** — it scales with the device-class budget in §4, regardless of whether the
graph holds 200 nodes or 200,000.

---

## 7. Link architecture

**Already shipped and kept as-is** (`renderModel.ts`, Performance Program Phase 2.1):
`selectDetailedLinks()` — a pure, deterministic, tiered function gating which links receive
expensive curved-tube rendering, driven by active-node/cluster/weight/activity/endpoint-
importance/sticky-relevance signals, bounded by `getDetailedLinkBudget()`.

**What the forensic audit found (§14) that this contract formalizes as a fix requirement,
not yet built:** links excluded from the "detailed" tier today are not actually cheap — they
remain live `Object3D`s with allocated geometry, still traversed and (partially) updated every
frame, just invisible. **This defeats the entire point of a link budget.** §12 Stage 3
requires a genuine simplified/aggregate representation, not merely a visibility toggle on an
otherwise-identical object:

| Tier | Representation | Zoom level | Status |
|---|---|---|---|
| Detailed | Individual `TubeGeometry`, curved, per-frame Frenet-frame update | Zoomed in, bounded count | Shipped (`linkTube.ts`) |
| Simplified | Shared-buffer straight/low-segment geometry, updated by attribute range, not rebuilt | Medium zoom | **Not built — §12 Stage 3** |
| Aggregate | Bundled `LineSegments`/merged geometry representing cluster-to-cluster relationships, not individual edges | Zoomed out | **Not built — §12 Stage 3** |

**Rule:** a graph with 941 links or 100,000 links never requires 941 or 100,000 independent
expensive `Object3D`s. Persistent buffers are updated in place; nothing is destroyed and
recreated per frame or per digest. The pre-existing `linkTube.ts`/three-forcegraph geometry-
type-mismatch bug (geometry disposed and reallocated on every React re-render, forensic audit
§14) is the first thing §12 Stage 3 fixes, since it violates §4's zero-churn budget today.

**Link-force safety (do not repeat the known regression):** `forceLink.initialize()`/
`.links()` remains the sole mechanism that resolves `link.source`/`link.target` from raw ids
to node-object references. It stays until an app-owned endpoint-normalization pass (using the
existing `nodeByIdRef` pattern) independently guarantees every graph-data refresh arrives
pre-resolved — only then may the zero-strength D3 link force be considered for removal, and
only as its own dedicated, tested change (`soumaya-galaxy-force-removal-regression.md`
documents exactly why the naive version of this already broke production once).

---

## 8. Adaptive quality integration

The existing Stage 6 controller (`adaptiveController.ts`) is **kept and extended**, not
replaced. Today it adjusts two axes (`pixelRatioCap`, `detailTier`) plus bloom, sampling
rolling p95 `workMs` with asymmetric hysteresis (descend fast, ascend slow, session ceiling
after repeated failed ascents, persisted rung).

**Extension required, not yet built:** the controller's authority grows to cover every
budget in §4 — detailed-node count, detailed-link count, particle count, light-pool size —
as additional rungs or additional axes on the existing `RUNG_TABLE` shape, following the same
ordering principle already established (biggest perceived-sharpness-per-ms first). The
existing stability rules are **non-negotiable and must not be weakened**: descend after 2 bad
windows, ascend only after 5 good windows + 8s + camera motion, never re-ascend within 4s of
a descend, track per-rung failed-ascent count and stop probing after 2 failures in a session.

**The 30/45/60 FPS cap remains the user's own dial and the controller never touches it** —
it only ever adjusts what fits inside whatever budget that cap implies.

---

## 9. Cross-cutting policies

**Transparency/overdraw:** opaque by default (§27 of the forensic audit is the first
enforcement of this). Transparency is permitted only where the effect genuinely requires
alpha blending (glow, corona, dimming, rings, particle trails) and only within the bounded
transparent-object budget in §4. Any new effect proposing `transparent: true` or additive
blending on a body-scale object must be reviewed against this budget before merging.

**Materials:** tiered explicitly — Hero (full PBR/procedural shader, reserved for Tier 6),
Detailed (the existing star/planet procedural shaders, Tier 5), Simplified (the existing
macro-body cached-texture `MeshStandardMaterial`, Tier 3-4), Aggregate (flat/vertex-color,
Tier 0-2, not yet built). **`transmission`, `clearcoat`, `sheen`, `iridescence`, and any
extension that triggers an alternate three.js render pass are Hero-tier only, and any use of
one requires an explicit note in this contract** (the Sun's own use, now with
`transmission = 0`, is the only prior example, and it was accidental, not deliberate — future
uses must be intentional).

**Lighting:** bounded by device class (§4), enforced by the existing fixed-pool pattern
(Performance Program Stage 4) — the count of lights in the scene never changes with node
count, only which nearby bodies they're currently assigned to. No shadow maps anywhere
(confirmed absent in the forensic audit — stays that way; shadow maps are not in any tier's
budget).

**Particles/points:** the existing five point systems (starfield, milky-way haze+dust,
deep-space dust, per-star asteroid belts) are budgeted per device class (§4); belt count is
the only one that scales with node count today (7 star-class nodes × 360 points in the
measured Large View) and must stay capped as node count grows, not multiply unbounded.

**Backdrop:** the Stage 3 cubemap bake stays exactly as built — bake once, `backgroundRotation`
for continuous drift, zero per-frame re-render cost. This is the template for "visually rich,
architecturally cheap" that the rest of this contract aims to extend to nodes and links.

**Postprocessing:** every effect (currently only bloom) must declare its device-tier
availability, budget cost, and quality level explicitly in `graphicsConfig.ts`'s resolved
settings — already true for bloom, and the requirement for any future postprocessing pass.
No effect may create additional full-resolution scene renders without that render appearing
in this contract's budget table.

**Resource lifecycle:** persistent geometries/materials/buffers, pooled instances, no
per-frame allocate/dispose/recompile. The existing `nodeThreeObjCacheRef` +
`isNodeCacheEntryValid`'s `obj.parent !== null` disposal-safety check (protecting against a
stale cached reference to a disposed `Object3D`) is a load-bearing existing safeguard and
must be preserved by any pooling/instancing work in §12.

**React boundary:** React owns application state; the renderer owns frame state. The existing
callback-stabilization work (memoized `nodeThreeObject`/`linkWidth`/etc.) stays; no future
change may reintroduce an unstable callback identity that forces `three-forcegraph` to digest
and rebuild the scene on an unrelated UI re-render.

---

## 10. Culling

Frustum + distance + screen-space-size + importance/relevance + zoom + current budget state,
in that priority order for cost (cheapest checks first). Hysteresis is mandatory wherever a
cull decision could flip on ordinary camera drift — the existing sticky label-visibility
bias (Performance Program) and the Stage 5 orbit-LOD banding are the reference
implementations for this pattern; any new culling logic (screen-space node tiering, link
aggregation thresholds) must follow the same "stable, not flickering" discipline, and should
be verified the same way Stage 5 was: an `npx tsx` measurement harness proving the error
stays sub-pixel/imperceptible at the chosen thresholds, per CLAUDE.md's "prove it by
measurement" rule — not eyeballed.

---

## 11. Validation methodology

Every implementation stage in §12 requires, before merging:

1. `npm run typecheck && npm test && npm run build -w @brain/web` — full gate green.
2. New unit tests proving the specific bound introduced (a budget enforcement, a tier
   selection function, a hysteresis threshold, an instance-pool capacity) — **no unbounded
   algorithm ships without a test proving its bound**, mirroring this session's own
   `sun.test.ts` (asserts three.js's actual classification predicate, not just a field write)
   and `highlightMaterialState` tests (asserts the exact transparent/opacity pair for every
   `(isBody, lit)` combination).
3. Where the logic is numeric/visual and this sandbox cannot render a frame to verify it
   (LOD thresholds, instance-pool bounds, aggregation cutoffs): a throwaway `npx tsx`
   measurement script feeding real or synthetic data through the actual function and
   printing/asserting the numbers — the same discipline Stage 5's orbit-LOD fix used, which
   caught a real bug (a 10,648-world-unit first-frame error) before it shipped.
4. Real-device confirmation on the baseline Android phone, using the same qualitative
   protocol established in the forensic audit's §24: open Large View, let it settle, don't
   touch it, report where it falls on a plain smoothness scale. Precise timing capture during
   an active freeze is never required of the user.

---

## 12. Staged rollout plan

Matches this codebase's own established discipline for exactly this system (the Performance
Program's Stage 0-8 rollout, each stage gated on the previous one's validation) — this is not
a new process, it is the same one, continued.

| Stage | Content | Status |
|---|---|---|
| **1** | Sun transmission fix + node early-Z restoration (this contract's own motivating fixes) | **Done, pushed** — `34e1502`, `5affdf6`. Real-device confirmation pending (blocked on manual deploy). |
| **2** | Real-device validation of Stage 1; re-measure actual frame time/draw calls/triangles post-fix | **Blocked on user deploy + test** — nothing further to do from this sandbox until that result comes back. |
| **3** | Link architecture: fix the geometry-dispose-per-digest bug (forensic audit §14); build the Simplified and Aggregate link tiers described in §7 | Not started |
| **4** | Node instancing: `InstancedMesh` pools per visual family (Tier 3, §6), preserving existing per-class visual identity via bounded multi-pool design rather than one shared "everything looks the same" pool | Not started |
| **5** | Device-class budgets (§3/§4) wired end-to-end through `graphicsConfig.ts`, replacing/extending the current 3-tier system | Not started |
| **6** | Adaptive-quality extension (§8) — new axes for node/link/particle budgets on top of the existing pixelRatio/detailTier/bloom rungs | Not started |
| **7** | Screen-space-aware culling/tiering layered on the existing distance-based LOD (§6/§10) | Not started |
| **8** | Full render planner (§5) as an explicit module, formalizing what's implicit across `Graph3D.tsx` today | Not started |

**Why Stage 2 gates Stage 3+:** building the (large, genuinely risky) instancing and link-
bundling rewrite before confirming Stage 1's fixes actually moved the real-device numbers
risks solving a problem that either no longer exists at the same severity, or persists for a
completely different reason Stage 1 didn't touch. This mirrors the forensic audit's own
explicit interpretation rules (§24): a strong result either way should change what Stage 3
targets first. Recommendation: **get the Stage 2 device read before investing further
implementation effort**, exactly as the Performance Program's own stages were each gated on
their predecessor's on-device confirmation.

---

## 13. What this contract explicitly forbids

- Any material with `transmission > 0` (or any other alternate-render-pass extension) added
  without an explicit note in §9 of this document.
- Any new per-frame GPU resource allocation, disposal, or shader recompilation.
- Any representation-tier count that scales linearly with total database size rather than
  with the device-class budget.
- Any LOD/cull threshold shipped without a measurement (test or `npx tsx` harness) proving
  it stays imperceptible/stable at the chosen boundary.
- Treating a lower device-class budget as license to make the Galaxy look worse than
  necessary — the target is always "the same picture, delivered cheaper" (the Stage 3
  backdrop bake's own framing) wherever that's achievable, and a genuinely simpler
  representation only where it's the honest cost of the device class.
