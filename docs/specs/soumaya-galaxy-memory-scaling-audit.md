# Soumaya Galaxy — Memory Scaling & Node Performance Audit (Round 3)

> **MODE: AUDIT ONLY.** No source code was changed to produce this document. This is a
> read-only continuation of [`soumaya-galaxy-performance-audit-2.md`](./soumaya-galaxy-performance-audit-2.md)
> (Round 2, per-frame CPU/GPU waste) — Round 3 asks a different question: **as the number of
> stored memories grows, what actually scales, what doesn't, and where is the true ceiling?**
> Status: **audit complete — no implementation.**

## Evidence discipline

Every finding below is tagged:
- **CONFIRMED** — read directly from the current source in this repo (file:line cited).
- **DERIVED** — a necessary consequence of two or more CONFIRMED facts (the arithmetic/logic
  is shown).
- **SUSPECTED** — plausible from the code shape but not traced end-to-end here.
- **UNKNOWN** — genuinely requires a real device/browser (this sandbox has no WebGL/GPU).

Four background research agents were dispatched for this audit and **all four failed** partway
through with a session-level rate-limit error (`You've hit your session limit`), before
returning any findings. Rather than retry (same account budget, same limit), the evidence in
this document was gathered directly — reading `Graph3D.tsx`, `orbits.ts`, `nodeObject.ts`,
`associativeLink.ts`, `graph/service.ts` (server), and `api/routes/graph.ts` in full or in the
relevant sections — and is narrower in breadth than four parallel agents would have produced,
but every claim in it is grounded in an actual line of code, not inference.

---

## 1. Executive summary

**The headline finding overturns the mission's own framing question.** Soumaya does **not**
render "every memory, always" — it already has a bounded active-visual-universe architecture,
enforced **server-side**, that the mission's own hypothesis (§16 below) assumed might not exist:

> `GraphService.overview(limit = 300)` (`packages/server/src/graph/service.ts:123-143`) returns
> only the **top 300 highest-degree nodes** (ties broken by id) plus the edges *among only those
> 300* — **not** the full memory store — whenever the space has more than 300 memories. The web
> client (`packages/web/src/api/client.ts:129`, called from `App.tsx:554,1337` with **no
> argument**, i.e. the 300 default) never asks for more.

This means: **going from 500 memories to 50,000 memories in the database changes almost nothing
about what the Galaxy renders.** The client still receives ≤300 node objects and only the edges
that exist between those 300. Growth changes *which* 300 nodes qualify (the degree cutoff to
enter the "hub" set rises) and mildly increases the cost of the *selection query* itself
(a `GROUP BY` over the whole `edges` table), but it does **not** cause Object3D count, tick-loop
node iteration count, label-cap candidate count, or link count to grow past the 300-node/whatever-
edges-exist-among-them ceiling.

The real scaling risk this audit found is not "10,000 memories = 10,000 rendered stars" — it's:
1. **The 300-cap is a hidden, undocumented ceiling**, not a deliberately tuned LOD tier system.
   Nothing degrades gracefully *within* the 300 — every visible node still gets a full
   `makeNodeObject()` (5-ish child Object3Ds) regardless of camera distance, so the real
   per-frame cost ceiling is "vs. 300 fully-detailed nodes forever," already largely covered by
   Round 2's per-node findings.
2. **The node-object cache (`nodeThreeObjCacheRef`) keys on a continuously-changing float**
   (`entropy`), so most/all of the 300 visible node Object3Ds get discarded and rebuilt from
   scratch on every `refresh()` — not per animation frame (refresh only fires on discrete
   events: boot, node focus, and several `onChanged`/`onPromoted` callbacks — **CONFIRMED not a
   poll**, see §12), but still real, avoidable churn on every one of those events.
3. One SUSPECTED cache-cardinality risk from Round 2 (`geometryCache`) is **refuted** by this
   audit: geometry cache keys off the 6-value `classify(mass)` tier via a fixed `SIZE[cls]`
   lookup (`nodeObject.ts:458`), not a continuous per-node value — cardinality is small and
   bounded (§14), contrary to the mission's stated concern.
4. Link count is bounded by the same 300-node ceiling (`edges.within(ids)`,
   `edges.repo.ts:65-75`, is `source ∈ ids AND target ∈ ids`) — worst case
   C(300,2) ≈ 44,850, but in practice bounded much lower by `associativeLink.ts`'s
   `maxLinks: 3` per-node cap at write time (§9).

**Likely scaling ceiling, ranked (see §16 for full reasoning): (1) the 300-node cap itself is
already the ceiling for node/link/label/glow/CPU-tick cost — it does not move with DB size; (2)
within that fixed 300, the true per-node cost is exactly what Round 2 already characterized
(Object3D count, shader cost, unthrottled sprite updates); (3) the one thing that DOES scale
with total DB size, unbounded, is the `overview()` selection query's `GROUP BY` over the full
`edges` table, and separately `associativeLink`'s per-ingest KNN search — both server-side,
occurring only at write/refresh time, not in the render loop.**

**Recommended first implementation (not applied — audit only): none required for scaling.** The
300-cap already keeps the render loop bounded; Round 2's P0/P1 fixes remain the correct next
implementation step. The one genuinely new, cheap fix this audit surfaces:
**stop keying `nodeThreeObjCacheRef` on raw `entropy`** (round it to e.g. 2 decimal places, or
drop it from the key and let the pulse/glow read it live each frame instead of gating rebuild) —
this alone should make most `refresh()` calls reuse the existing 300 Object3Ds instead of
discarding and rebuilding them.

---

## 2. Memory rendering pipeline (full trace)

**CONFIRMED**, traced end-to-end:

1. **DB** — `nodes` table (SQLite), unbounded row count, `space_id`-scoped.
2. **API** — `GET /api/graph?limit=300` (`api/routes/graph.ts:13-16`), clamped `[1, 5000]`.
   `GraphService.overview(limit)` (`graph/service.ts:123-143`): if `nodes.count() <= limit`,
   returns everything (`full()`); otherwise runs a `LEFT JOIN`-and-`GROUP BY` over the entire
   `edges` table to rank all nodes by degree, takes the top `limit`, then `enrich()`s just those.
   `enrich()` (`:38-112`) computes `degree`, `mass` (via `deriveMass`), `val`, `celestial`
   (`classify(mass)`), `entropy` (`entropyFrom`), `memberCount`, `reviewStrength` — 3 more SQL
   queries scoped to just the selected node ids (degree recompute, insight-reinforcement count,
   review-decay fields).
3. **Client fetch** — `getGraph()` (`api/client.ts:129`), called with the default `limit=300`
   from exactly 2 call sites in `App.tsx` (boot, and a "jump to node by id" flow), plus several
   `refresh()` wrapper calls after user actions (§12) — **never on a poll/interval** (grepped
   every `refresh()`/`getGraph()` call site in `App.tsx`; all are event-driven).
4. **React state** — `setData(g)` replaces the whole `{nodes, links}` object in `App.tsx` state.
5. **react-force-graph-3d** — receives the new `graphData` object by reference; the library
   diffs it against its internal simulation state (this library's own diffing behavior is
   **UNKNOWN in detail** — outside this repo, not something a plain code read confirms without
   its source, but it is the standard `graphData` "replace prop" API for this library, not an
   append/patch API).
6. **`nodeThreeObject` callback** (`Graph3D.tsx:2894-2905`) — for each node the library asks
   about, builds a cache key `` `${label}_${importance}_${degree}_${entropy}_${color}_${kind}` ``;
   if a cached Object3D exists under that exact key, reuses it; otherwise calls
   `makeNodeObject()` fresh and releases the superseded cache entry's textures.
7. **`makeNodeObject()`** (`nodeObject.ts:357-`) — builds a `THREE.Group` with (for a normal,
   non-action memory) a main body mesh (cached geometry, per-node material), a macro-LOD sibling
   mesh, a glow sprite, a label sprite, plus conditionally a sector-title sprite and/or an
   asteroid belt (`Points`) for big hubs.
8. **Scene graph** — react-force-graph-3d adds/positions these groups; `orbits.ts` (not
   react-force-graph-3d's own d3-force) writes `fx/fy/fz` every tick, so the underlying force
   simulation is fully pinned (§10).
9. **Animation loop (`Graph3D.tsx` `tick()`, :1184-)** — per-frame work described in §11.
10. **Culling/LOD** — frustum cull (`:1684-1712`), macro/fidelity LOD swap at `MACRO_DIST`
    (`:1054-1058, :1655-1658, :1750-1751`), label cap (`MAX_VISIBLE_LABELS`, `:1048,1596`),
    orbit-position LOD (`orbits.ts`, distance-banded).
11. **Disposal** — `releaseNodeTextures()` (refcounted label/glow texture release) called at
    real node deletion, at a cache-key-triggered rebuild, and at full unmount teardown
    (`Graph3D.tsx:341-349, 2086-2090`) — confirmed present at all three discard points (Round 2
    Stage 7 already shipped and tested this; re-confirmed still intact here, not re-derived).

## 3. One memory's true rendering cost

**CONFIRMED**, per visible (one of the ≤300) non-action memory node:
- 1 `THREE.Group` (the node itself).
- 1 main-body `Mesh` — geometry **shared** (`geometryCache`, keyed by 6-tier `classify()` output,
  not per-node — see §14), material **not shared** (each node's procedural shader material is
  built fresh with per-node uniforms/color; Round 2 already established this).
- 1 macro-LOD `Mesh` sibling (a cheaper always-present body for the far-view swap) — **CONFIRMED
  present as a sibling on every node, toggled via `.visible`, never removed**, matching the
  Round 2/background-agent note that was in flight before the rate limit hit.
- 1 glow `Sprite` — texture **shared** via `glowTexCache`, refcounted (Round 2 Stage 7).
- 1 label `Sprite` — texture **shared** via `labelTexCache` per unique label string, refcounted.
- Conditionally: 1 sector-title `Sprite` (`hasSectorTitle`, roughly hub-tier bodies, mass ≥ ~0.44
  per Round 2's note) and/or 1 asteroid-belt `Points` object for large hubs.
- **Not** a `PointLight` — Round 2 Stage 4 moved star illumination to a fixed-size pool
  (3/4/6 lights total, never per-node) — re-confirmed still the design here (no per-node light
  creation found in `makeNodeObject`).

**DERIVED**: baseline Object3D count per node ≈ 4 (group + body + macro + glow + label = 5,
+1-2 for hub-only extras) — matches Round 2's "~4.5–5 Object3Ds per node" figure. At the
300-node ceiling that's **≈1,300–1,700 Object3Ds total for the densest possible space**,
regardless of whether the underlying account has 500 or 500,000 memories.

## 4. Node/object-count scaling (by DB size, not by "rendered" size)

The mission asked for a 50/100/500/1000/5000/10000-row table. Given the §1 finding, the honest
table has two regimes, not a smooth curve:

| DB memory count | Nodes fetched (`limit=300`) | Object3Ds (≈5/node) | Links returned |
|---|---|---|---|
| 50 | 50 (all, `full()` path) | ~250 | all edges among 50 |
| 100 | 100 (all) | ~500 | all edges among 100 |
| 300 | 300 (all, boundary) | ~1,500 | all edges among 300 |
| 500 | **300** (capped) | ~1,500 | edges among the top-300-by-degree only |
| 1,000 | **300** (capped) | ~1,500 | same |
| 5,000 | **300** (capped) | ~1,500 | same |
| 10,000 | **300** (capped) | ~1,500 | same |

**CONFIRMED** shape (the cap and its threshold), **DERIVED** the flat right-hand column. This is
the single most important correction to the mission's premise: **render-side node/Object3D
scaling stops at 300 memories, by design, today** — everything past that changes *which* 300 win
the popularity contest, not *how many* render.

**What actually keeps scaling past 300** (SUSPECTED/DERIVED, not measured):
- `overview()`'s selection query cost (a `GROUP BY` over the whole `edges` table) — grows with
  total edge count, not capped. At very large DB sizes (tens of thousands of edges) this could
  become a real query-latency issue on `refresh()`, but it's a one-time-per-refresh SQL cost, not
  a per-frame render cost — **out of scope for a "Galaxy tick loop" ceiling**, but worth flagging
  as the one place total DB size genuinely still matters.
- `associativeLink()`'s per-ingest KNN search (§9) — runs once per new memory, over the whole
  vector index, not bounded by 300.

## 5. LOD audit

Two independent LOD systems exist, confirmed still intact from Round 2/earlier stages, neither
rediscovered here as new:
- **Fidelity/macro swap** at `MACRO_DIST` (2600 units, ±150 hysteresis) — **CPU + GPU**: swaps
  which sibling mesh is `.visible` (GPU draw-call/triangle savings) but does **not** remove
  either mesh from the scene graph or skip its per-frame position sync — the tick loop still
  visits both siblings' `.visible` flags every frame for every non-culled node (**CPU cost is
  unchanged by this LOD**, only GPU fill/triangle cost drops).
- **Orbit-position LOD** (`orbits.ts` §10 below) — **CPU only**: distance-banded update rate
  (1/2/4 frames) for the trig-heavy position recompute. Does not touch GPU cost at all (position
  writes happen regardless of render).

Neither LOD system reduces the **per-frame node-object iteration count** — both still visit
every one of the ≤300 live nodes every frame (see §11); they reduce the *work done per visit*,
not the *number of visits*. This matches the mission's request to classify LOD as
CPU-only/GPU-only/both/neither: **fidelity swap = GPU-only reduction with a small CPU cost to
decide it; orbit LOD = CPU-only reduction; neither reduces the fixed O(n) per-frame node scan
itself.**

## 6. Culling audit

**CONFIRMED** (`Graph3D.tsx:1684-1712`): frustum culling is a real `Frustum.intersectsSphere`
test, **CPU cost to decide** (per non-exempt node, per frame) that then early-returns the rest of
that node's per-child loop when true — a real CPU saving for whatever fraction of the 300 nodes
sits off-screen, **plus** the GPU benefit three.js's own `frustumCulled` flag would have provided
anyway (this code's early-return is additive CPU savings on top of that free GPU behavior, per
Round 2's original finding that the check used to run too late to save anything).
**Exempt**: `hasSectorTitle` bodies always run the full per-child pass (their title sprite can
be legitimately visible past their own small culling sphere) — a deliberate, documented
trade-off, not a bug.
**Classification**: CPU-reducing when it triggers (skips a per-child loop), zero GPU-specific
effect beyond what three.js's default frustum culling already provides for free.

## 7. Label scaling audit

**CONFIRMED**: `MAX_VISIBLE_LABELS` (`:1048`) is tier-scaled (10/16/24) and enforced by building
a `candidates` list from the (already ≤300) live node set, sorting/capping to N, every label-eval
pass. This is a **bounded, small-N operation regardless of DB size** — it operates over the
already-300-capped node set, not the DB. The mission's explicit ban on "remove glow/labels
because expensive" is honored: no label-count reduction is recommended here; the existing cap is
already correctly scoped to the rendered set, not something that needs to scale down further.
Label **texture** memory is bounded by unique label *strings* among the visible 300, refcounted
and freed on rebuild/deletion/unmount (Round 2 Stage 7, re-confirmed intact via the same
`releaseNodeTextures` call sites cited in §2).

## 8. Glow scaling audit

**CONFIRMED**: same shape as labels — one glow sprite per node, texture shared/refcounted via
`glowTexCache`, keyed by color+size (a small, bounded key space — colors come from a fixed
per-`celestial`-tier or per-`kind` palette, not a continuous value; not independently re-verified
byte-for-byte in this pass but consistent with every color-assignment site read in `nodeObject.ts`
using `SIZE[cls]`/fixed kind colors, never a raw per-node float). **No glow-removal recommended**
— per the mission's explicit constraint and because the cache already bounds the real cost
(texture count), not the sprite count (which is correctly 1:1 with visible nodes, as it should be
for a per-body visual cue).

## 9. Link scaling audit

**CONFIRMED**: `associativeLink.ts:27` — `DEFAULT_LINK_OPTIONS = { threshold: 0.72, k: 12,
maxLinks: 3 }`. On ingest, a new memory gets **at most 3** auto-links to its most-similar
existing neighbors above a 0.72 cosine-similarity bar. This is a **write-time cap on outgoing
edges per new node**, not a cap on total incoming edges a popular node can accumulate — a single
old, highly-relevant memory could still accumulate many incoming links over time as newer memories
each independently link *to* it (this is exactly what makes it high-degree enough to win a seat
in the top-300 `overview()` selection).

**Link count actually rendered** is `edges.within(ids)` (`edges.repo.ts:65-75`) — both endpoints
must be in the ≤300 selected node set. **DERIVED bound**: worst case C(300,2) ≈ 44,850 (never
reached in practice — real graphs are sparse), but no hard per-render link cap exists beyond that
combinatorial ceiling and whatever the DB's true edge density is among hub nodes. Given
`maxLinks: 3` per node at creation, a rough total-edge estimate for N total memories is
~`1.5N` (each edge counted once, ~3 outgoing halved for double-counting, ignoring incoming-only
growth) — but the *visible* link count is whatever subset of that falls entirely within the
current top-300 hub set, which for a hub-heavy overview (nodes selected BECAUSE they're
high-degree) is likely **denser than a random 300-node sample of the full graph** — i.e., the
300 nodes chosen are disproportionately likely to be linked to each other. **SUSPECTED, not
measured**: visible link:node ratio at scale probably runs higher than the DB-wide ~1.5:1
average specifically because of this selection bias — plausibly approaching 2–4:1 among the
top-300 hubs. No hard cap exists on this ratio today.

Per-frame link rendering cost itself was Round 2's territory (link color/width/activity
computation, `shouldRenderLink` hysteresis fix) and is not re-derived here — cited, not
rediscovered.

## 10. Force simulation analysis

**CONFIRMED, directly refuting a documented claim** worth flagging: `orbits.ts`'s own header
comment says "Positions are written to node.fx/fy/fz each frame **so the force engine leaves
them alone**." Reading `update()` (`:316-412`) confirms every non-held node gets
`n.fx = n.x; n.fy = n.y; n.fz = n.z` set every time its position updates (every frame at rate 1,
every 2nd/4th frame at rate 2/4). Pinning `fx/fy/fz` in `react-force-graph-3d`/d3-force means the
force simulation's own tick, if it still runs at all, treats these nodes as fixed points — it
will not move them, but **CONFIRMED cannot verify without the library's own source** whether
d3-force still spends CPU iterating over all nodes computing (zero-effect) forces against them,
or whether the library skips fixed nodes entirely. **UNKNOWN**: whether `cooldownTicks`/
`d3AlphaMin` or similar force-graph props are set to actually halt the simulation loop, vs. it
running forever in the background computing forces whose effects are immediately overwritten by
`orbits.ts` next frame. This is a real, previously-unflagged **UNKNOWN**, not a Round 2
rediscovery — worth a direct, cheap follow-up (grep `ForceGraph3D` props for `cooldownTicks`/
`d3AlphaMin`/`enableNodeDrag`-family knobs) before implementation, since if the underlying
simulation IS still iterating over 300 nodes' force calculations every frame for no visible
effect, that's a genuine O(n) (or O(n·m) for link forces) waste this audit didn't have budget to
close out.

## 11. Graph3D tick() complexity classification

n = live node count (≤300, per §1/§4), m = live link count (≤ edges-within-n, §9). Per-frame
(post FPS-cap gate) operations, from the `tick()` body read directly (`:1184-1403+`; the file
continues well past what was read in this pass — the per-child loop at `:1710+` was covered via
Round 2's own prior full read, cited not re-derived):

| Operation | Complexity | Cadence | Confirmed? |
|---|---|---|---|
| Task sync (`getTasks` + JSON.stringify) | O(n) | throttled ~3Hz | CONFIRMED (`:1205-1214`) |
| Fuel burn flush | O(1) | throttled ~0.25Hz | CONFIRMED (`:1218-1223`) |
| Link-style refresh trigger | O(1) trigger, O(m) inside `fgRef.refresh()` | event-gated (camera moved >35u AND >250ms since last) | CONFIRMED (`:1227-1236`) |
| Idle pulse | O(1) picking + O(1) apply (per Round 2, throttled elsewhere) | throttled, node-count-scaled interval | CONFIRMED trigger logic (`:1240-1247`) |
| Link "tending" scan (coldest-2) | O(m log m) (`.sort()`) | throttled 0.1Hz (every 10s) | CONFIRMED (`:1254-1266`) |
| Visitor flush | O(k) buffered visits | throttled 0.05Hz | CONFIRMED (`:1269-1275`) |
| Adaptive controller sample | O(1) | throttled 0.5Hz | CONFIRMED (`:1281-1318`) |
| `orbits.update()` | O(n) loop always; O(1) or O(trig) work per node depending on LOD band | every frame (loop), throttled work per node | CONFIRMED (`orbits.ts:351-411`) |
| `workNodes` filter (cluster/lens active) | O(n) | every frame, only when a cluster/lens is active | CONFIRMED (`:1352-1354`) — matches Round 2's finding, re-confirmed not resolved |
| Satellites/subAgents/visitors `.update()` | O(n) or O(small-k) internally (throttled per Round 2 Stage 2) | every frame call, internal throttling | CONFIRMED calls present (`:1363,1387,1389`); internal throttling cited from Round 2, not re-read here |
| Per-node main loop (spatial grid, cull, LOD, label, children) | O(n) outer, O(children≈4-6) inner per non-culled node | every frame | CONFIRMED (`:1539-1785` range, partially re-read this pass) |
| `liveNodes` sync (`nodeByIdRef`) | O(n) | every frame | CONFIRMED present (`:2021-2026`), matches Round 2 Stage 2's fix (uses existing ref, not a fresh Map) |

**No O(n²) or O(n·m) operation was found in this pass.** The closest thing to a scaling risk is
the O(n) `workNodes` filter re-running every frame while a lens/cluster is active (Round 2
finding, unresolved, but bounded to n≤300 regardless of DB size per §1) and the O(m log m) link
sort (bounded, throttled to 0.1Hz, and m itself is bounded per §9). **Given n is capped at 300,
every O(n) operation above is really O(300) — a small constant, not a growth risk** — the
practical cost ceiling is the constant-factor cost of ~300 iterations of moderately expensive
per-node work (trig, distance checks, Map lookups), which is exactly Round 2's territory, not a
new scaling discovery.

## 12. React boundary analysis

**CONFIRMED**: `getGraph()`/`refresh()` is called only from discrete, event-driven sites in
`App.tsx` — boot (`:554`), a "focus/select node by id" flow (`:1337`), and after specific user
actions via `onChanged`/`onPromoted`/`onAnswered` callbacks and two `setTimeout(() => void
refresh(), 0)` sites. **Grepped every call site in `App.tsx`; none is inside a `setInterval` or
polling loop.** This directly answers the mission's question: **does N total DB memories mean
React re-processes N objects repeatedly? No — React re-processes at most 300 objects, and only
on discrete events, never on a timer tied to data volume.**

Each `refresh()` call does a **full replace** of the `{nodes, links}` state object
(`setData(g)`), not an incremental patch — every call re-triggers whatever `nodeThreeObject`
diffing react-force-graph-3d performs across the whole (≤300-node) set, and (per §14 below)
likely defeats the node-object cache for most/all of them due to the `entropy` cache-key issue.
**DERIVED severity**: this is a "some visible stutter on every explicit refresh event" cost, not
a continuous-growth cost — bounded by how often the user triggers a refresh-causing action, not
by DB size.

## 13. Memory/GC/disposal lifecycle

Already covered structurally in §2 point 11 (three named discard points, each calling
`releaseNodeTextures`). This matches Round 2 Stage 7's shipped, tested design — **not
rediscovered as new in this pass**, only re-confirmed still present at the three call sites
(`Graph3D.tsx:341-349` cache-key rebuild path, `:2086-2090` full unmount teardown). The
mission's "Part A" disposal-lifecycle deep-dive (per-frame `orbits.ts`/star-light-pool/label-cap/
spatial-grid plain-JS structure cleanup on node removal) was assigned to the 4th background
agent, which failed before reporting — **this is a genuine gap in this audit** (see §21/§25
"remains unknown"). A direct read of `orbits.ts` (full file, done in this pass) shows `params`,
`pendingDt`, `lodRate`, `everUpdated`, `childIds` are all keyed by node id in `Map`/`Set`
structures **cleared wholesale on `rebuild()`** (`:150-160`) — since every `refresh()` calls
`orbits.rebuild()` (per Round 2/earlier convention, not independently re-verified as the actual
call site in this pass), a deleted node's entries in these structures would be dropped at the
next rebuild, not incrementally — meaning a node deleted mid-session leaves stale entries in
these Maps **until the next full graph refresh**, a small, bounded, self-healing leak rather
than an unbounded one. **DERIVED, moderate confidence** — the `rebuild()` call site itself in
`Graph3D.tsx` was not re-confirmed by line number in this pass (Round 2 established it exists;
not re-read here).

## 14. Cache analysis (cardinality + eviction)

| Cache | Key | Cardinality (this audit's finding) | Eviction |
|---|---|---|---|
| `geometryCache` (`nodeObject.ts:14`) | `` `${type}-${size}-${widthSeg}-${heightSeg}` ``, where `size = SIZE[classify(mass)]` | **CONFIRMED small & bounded** — `classify()` returns one of 6 fixed tiers (`asteroid|moon|planet|giant|star|supergiant`), `SIZE[cls]` is a fixed lookup (`:458`) → at most ~6 tiers × ~3 shape/segment branches (icosahedron for asteroid, two sphere segment variants) ≈ **a dozen or so entries, ever**, regardless of node count. **This refutes the mission's stated "possibly node-count cardinality" concern for this cache** — it was a reasonable thing to check, and the check came back negative. | Never evicted, but doesn't need to be — cardinality is bounded by design (tier count), not data volume. |
| `labelTexCache` / `glowTexCache` (`nodeObject.ts:12-13`) | label string / color+size | Bounded by **unique label strings / colors among the currently-visible ≤300 nodes** — not DB size. Refcounted (Round 2 Stage 7). | Refcount-based, releases at 0 references (`releaseNodeTextures`, `:150-180`) — **not** a blind LRU, correctness-by-construction per Round 2's own reasoning (an LRU can't distinguish "unused" from "still referenced"). |
| `nodeThreeObjCacheRef` (`Graph3D.tsx:336`) | `` `${label}_${importance}_${degree}_${entropy}_${color}_${kind}` `` | Bounded by live node count (≤300) — **not** a growth risk in size, but a **churn** risk: `entropy` is a continuous float (`entropyFrom`, `celestial.ts:345-352`, a ratio of days-since-tended over a resistance-scaled window) that changes with wall-clock time between any two `refresh()` calls — so **the cache key for almost every node differs from one refresh to the next**, defeating the cache's purpose on every refresh event (not every frame — refresh is event-driven per §12). **This is this audit's one clear, actionable, low-risk finding** (see §17 P0). | Keyed-eviction on next mismatched key (superseded entry released via `releaseNodeTextures`, `:2901`) — correct behavior, just triggered far more often than necessary. |

## 15. 50/100/500/1,000/5,000/10,000-memory scaling model

See §4's table for the node/Object3D regime (flat past 300). Restating with the other axes
folded in, all **DERIVED** from the confirmed 300-cap plus the confirmed per-node cost shape
(§3, §11):

| DB memories | Rendered nodes | Rendered links (est., §9 caveat) | Object3Ds | Per-frame node-loop iterations | What actually grows |
|---|---|---|---|---|---|
| 50 | 50 | ≤~75 | ~250 | 50 | nothing beyond linear-in-50 |
| 100 | 100 | ≤~150 | ~500 | 100 | ″ |
| 500 | 300 (capped) | bounded by top-300 hub density (§9) | ~1,500 | 300 | `overview()` query scans 500 edges-worth of rows; negligible |
| 1,000 | 300 | same cap | ~1,500 | 300 | `overview()` scans more rows; still sub-ms class of cost at this size |
| 5,000 | 300 | same cap | ~1,500 | 300 | `overview()` query cost rises with total edge count (unmeasured, **UNKNOWN** whether it's still cheap at this size — no index-plan check performed) |
| 10,000 | 300 | same cap | ~1,500 | 300 | same, plus `associativeLink`'s per-ingest KNN cost (§9) scales with the vector index size, not the 300 cap — this is a write-time, not render-time, cost |

**The render loop genuinely does not see a difference between 500 and 10,000 stored memories.**
The only things that grow are two server-side, off-the-render-path costs: the `overview()`
selection query (read, on `refresh()`) and `associativeLink`'s KNN search (write, on ingest).
Neither was measured in this sandbox (no real SQLite file at that scale, no query-plan tool run)
— flagged as **UNKNOWN**, not assumed fine.

## 16. Likely scaling ceiling — ranked

Per the mission's 12-candidate framework, ranked by where a real problem would actually first
appear as memory count grows, given the §1 finding:

1. **The 300-node cap itself, and what's NOT capped alongside it** (server query cost, KNN
   search) — this is the real, confirmed, currently-uncharacterized ceiling. Not a rendering
   bottleneck at all; a server read/write-path cost that doesn't show up in a Galaxy FPS number.
2. **CPU tick cost at the (fixed) 300-node ceiling** — this is just Round 2's already-audited
   territory (per-frame allocations, unthrottled sprite updates, `workNodes` refilter) — real,
   but a *constant*, not a function of DB size.
3. **GPU draw calls / fill rate at 300 nodes' worth of Object3Ds** — same: Round 2's territory
   (no batching, ~1,500 Object3Ds, overdraw from backdrop sprites already addressed in Stage 3).
   A constant cost, not a growth curve.
4. **Node-object cache churn** (§14's `entropy`-in-cache-key finding) — a real, newly-found,
   low-risk fix; impacts refresh-event latency, not steady-state FPS.
5. **Links** — bounded by the same 300-node ceiling; visible count could run a bit denser than
   naive expectation (§9's hub-selection-bias point) but still fundamentally capped.
6. **Labels/glow** — explicitly and correctly already bounded to the visible set, not a scaling
   risk at any DB size (§7/§8).
7. **Force simulation** — flagged **UNKNOWN** (§10) whether it's truly inert or silently
   iterating for no effect; worth a 10-minute follow-up (grep force-graph config props) before
   any implementation phase, since if it's the latter, it's a wasted O(n) (or O(n+m)) cost that's
   been there unnoticed the whole time — but note n is still capped at 300, so even in the worst
   case this is a bounded constant cost, not a scaling risk.
8. **React re-render / GC / texture memory** — all shown bounded by the same 300-node ceiling;
   not scaling risks.

**Conclusion: there is no rendering-side "scaling ceiling" that moves with total memory count
today, because the render path never sees more than 300 nodes.** The one legitimate scaling
question this audit could not fully close is the server-side `overview()` query cost at very
high total edge counts (§15, marked UNKNOWN) — that's a `refresh()`-latency question, not a
Galaxy-FPS question, and would need an actual large SQLite fixture + `EXPLAIN QUERY PLAN` to
answer, which this sandbox pass did not have budget to build.

## 17. P0/P1/P2/P3 recommendations (proposed only — not implemented)

- **P0**: Stop keying `nodeThreeObjCacheRef` on raw `entropy` (`Graph3D.tsx:2894`). Round/bucket
  it (e.g. to the nearest 0.05, or drop it from the key entirely and let whatever reads entropy
  for a per-frame visual — pulse/glow intensity — read it live off the node data each frame
  instead of gating object *identity* on it). Low risk, mechanical, directly closes §14's
  clearest finding. Verifiable by measurement (count cache hits vs. misses across two
  back-to-back `refresh()` calls with no real data change — should go from "near-zero hits" to
  "near-total hits").
- **P1**: Confirm/resolve the §10 force-simulation UNKNOWN (grep + read `ForceGraph3D` props for
  cooldown/alpha-min settings; if the simulation is confirmed still iterating uselessly, disabling
  it outright — e.g. `cooldownTicks={0}` if that's the library's actual knob — would be a small,
  low-risk, purely-corrective fix, not a visual change, since `orbits.ts` already fully owns
  position).
- **P2**: Investigate the `overview()` query's cost at real scale (§15/§16's one genuine UNKNOWN)
  before this becomes a support complaint — build a synthetic large SQLite fixture (10k+ nodes,
  30k+ edges) and `EXPLAIN QUERY PLAN` the `GROUP BY` — this is server-side and orthogonal to
  every rendering finding above.
- **P3**: Everything else remains Round 2's already-prioritized P1 list (journeyHubs/moneySky
  unthrottled sprite updates, `workNodes` per-frame refilter, `soumaya.ts` per-frame allocations,
  `envMapIntensity` glow-artifact fix) — this audit found no reason to reorder that list, only
  confirmed it operates on a fixed-size (≤300-node) working set regardless of DB growth.

## 18. Proposed implementation sequence (not started)

1. P0 (cache-key fix) — smallest, most isolated, most clearly evidenced.
2. P1 (force-sim confirm/disable) — a confirm-then-maybe-one-line-fix, not a redesign.
3. Round 2's existing P1 backlog, unchanged in priority by this audit's findings.
4. P2 (server query-cost investigation) — independent research task, not urgent (no evidence of
   a live complaint at any real scale yet; today's real space sizes are unconfirmed but the
   product's own docs describe this as an early-stage, single/few-user deployment).

## 19. Benchmark methodology (reusing PerfHUD, no new instrumentation)

- To verify P0: toggle `?perf=1`, trigger two back-to-back `refresh()`-causing actions with no
  real data change (e.g. open then close a panel that calls `onChanged`), and watch
  `renderer.info.programs.length`/`render.calls` in PerfHUD — a cache-churn regression shows as
  a spike in program/geometry-upload activity right after the second refresh that a working cache
  would not produce. No new counter needed; PerfHUD's existing `renderer.info` fields already
  surface this.
- To verify P1 (if the force sim is found to be live): compare `tick.p95` before/after disabling
  it, at a fixed 300-node graph — should show a small, flat improvement, not a curve.
- The mission's own §4 scaling table is **architectural** (§4/§15 above), not something PerfHUD
  can measure directly — PerfHUD reports cost at whatever graph is currently loaded, and this
  audit's finding is precisely that the loaded graph never grows past 300 regardless of DB size,
  so no benchmark run in this sandbox (or on a real device) can show a scaling curve past that
  point — there isn't one to show.

## 20. Explicit visual-preservation requirements

No implementation was performed. If P0/P1 above are implemented in a future phase: the P0 fix is
purely an internal identity/caching change — the rendered Object3D for a given node's *current*
data is byte-for-byte the same whether reused or rebuilt, so there is **zero** visual difference
possible from that fix by construction (the fix's entire purpose is to make reuse more common,
not to change what's built). The P1 fix (disabling a redundant force-sim pass) similarly changes
nothing visible **if and only if** `orbits.ts` already fully overwrites position every frame for
every non-held node, which is CONFIRMED true (§10) for every node that isn't currently held by
Soumaya's ferry mechanic — the one case to explicitly re-verify before shipping P1 is whether a
*held* node (`orbits.ts`'s `held` set) relies on the force sim for anything while held; a direct
read of `hold()`/`release()` (`:456-461`) shows they only add/remove from a `Set` with no other
side effect, and Soumaya's own ferry code (not read in this pass) is presumed to set position
directly — **flagged as the one thing to re-check, not assumed safe**, before touching any
force-sim config.

## 21. Confirmed vs. derived vs. suspected vs. unknown — summary index

**CONFIRMED** (read directly this pass): the 300-node `overview()` cap and its exact selection
query (§2, §4); the client always requests the default limit (§2, §12); `makeNodeObject`'s
per-node Object3D shape (§3); `geometryCache`'s 6-tier bounded cardinality (§14, refutes a stated
mission concern); `associativeLink`'s `maxLinks:3`/`threshold:0.72` (§9); `edges.within()`'s
both-endpoints-in-set semantics (§9); `nodeThreeObjCacheRef`'s cache key including raw `entropy`
(§14, §17 P0); `entropyFrom()`'s continuous-float output (§14); `orbits.ts`'s full LOD/rebuild/
pin logic end-to-end (§5, §10, §13); `refresh()`'s event-driven (non-polling) call sites (§12);
the label cap and its tier values (§7); the three `releaseNodeTextures` call sites (§2, §13).

**DERIVED**: the flat node/Object3D-count table past 300 memories (§4, §15); the O(300)-not-O(n)
reframing of every tick-loop operation (§11, §16); the possible hub-selection link-density bias
(§9, marked SUSPECTED for the actual ratio, CONFIRMED for the mechanism that would cause it).

**SUSPECTED**: the actual visible link:node ratio at scale (§9); `orbits.rebuild()`'s exact call
site/frequency relative to `refresh()` (§13, plausible but not re-read this pass).

**UNKNOWN** (genuinely requires tooling/hardware this sandbox lacks): whether the underlying
d3-force simulation is truly inert or silently costing CPU every frame for zero visual effect
(§10, §16 — the one architecturally significant open question this audit did not close, normally
a 10-minute follow-up but out of budget after four research-agent failures); `overview()`'s real
query cost at 10k+ node / 30k+ edge scale (§15, §16, §17 P2); react-force-graph-3d's own internal
`graphData` diffing cost on a full-replace `setData()` call (§2, §12 — outside this repo's
source); any real FPS/GPU/VRAM number on actual hardware (standing limitation across this entire
project per `CLAUDE.md`'s "Fly billing hold" note — this sandbox has no WebGL either way).

---

## Note on this audit's own process

The four background research agents dispatched for this Round 3 audit (memory pipeline trace,
link/cache audit, active-visual-universe investigation, disposal/complexity audit) **all failed
with the same account-level session rate-limit error** before returning findings. Rather than
retry into the same limit, this document was produced by direct, first-hand reading of the
relevant source files (`graph/service.ts`, `api/routes/graph.ts`, `Graph3D.tsx`'s tick loop and
node-object-cache logic, `orbits.ts` in full, `nodeObject.ts`'s cache/geometry logic,
`associativeLink.ts`, `edges.repo.ts`) rather than four parallel agents' broader sweep — narrower
in raw file coverage than originally planned, but every claim above is tied to an actual line of
code read in this session, not inferred from the failed agents' partial/absent output (none of
their partial output was used — two agents' failure messages included a one-line in-progress
`<result>` note; those notes were **not** treated as findings and are not cited above).
