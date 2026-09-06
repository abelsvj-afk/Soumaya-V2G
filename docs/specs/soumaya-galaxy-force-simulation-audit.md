# Soumaya Galaxy — Force Simulation Lifecycle Audit

> **MODE: AUDIT ONLY.** No source code was changed to produce this document. Continues the
> Galaxy Performance Program: [`soumaya-galaxy-performance-audit-2.md`](./soumaya-galaxy-performance-audit-2.md)
> (Round 2, per-frame CPU/GPU waste) and [`soumaya-galaxy-memory-scaling-audit.md`](./soumaya-galaxy-memory-scaling-audit.md)
> (Round 3, the 300-node cap; Round 3 flagged the force simulation's liveness as an explicit
> **UNKNOWN** requiring follow-up — this document closes that gap). Status: **audit complete —
> no implementation.**

## Evidence discipline

Every finding is tagged **CONFIRMED** (read directly from installed source with file:line),
**DERIVED** (a necessary consequence of confirmed facts, shown), **SUSPECTED** (plausible, not
proven), or **UNKNOWN** (needs runtime/hardware this sandbox lacks). This sandbox has no
browser/WebGL access — every finding below comes from reading the actual installed library
source in `node_modules` (not documentation, not assumption) plus this repo's own
`Graph3D.tsx`. Package versions and exact file paths are cited throughout.

---

## 1. Executive summary

**The force simulation is a real, confirmed, ongoing per-frame CPU cost that produces zero
visible effect — and it runs on a separate, uncapped animation loop that this app's own FPS-cap
and Performance/Balanced/Quality settings never throttle.**

The Galaxy's kinematic orbit system (`orbits.ts`) is already the sole position authority — every
node is pinned via `fx/fy/fz` every real frame. Reading `d3-force-3d`'s actual simulation source
(`node_modules/d3-force-3d/src/simulation.js:63-64`) confirms a pinned node's velocity/position
update is a trivial `node.x = node.fx, node.vx = 0` — **the underlying force simulation's output
is completely discarded for every node in this app.** This much was expected going in.

What this audit found that was **not** already known: **Graph3D.tsx already disables the two
remaining forces by setting their *strength* to 0** (`Graph3D.tsx:983,985` —
`fg.d3Force("charge")?.strength(0)`, `fg.d3Force("link")?.strength(0)`), but **zeroing strength
does not stop either force from doing its full internal computation every tick** — read directly
from `d3-force-3d`'s source:
- `forceManyBody` (charge) still **builds a full octree from scratch every tick**
  (`node_modules/d3-force-3d/src/manyBody.js:20-31`, `octree(nodes,x,y,z).visitAfter(accumulate)`)
  regardless of strength — the zero-strength value only causes an early-exit a few frames deep
  *inside* the resulting tree traversal (`apply()`, `manyBody.js:71-72`,
  `if (!treeNode.value) return true;`), not before the tree is built.
- `forceLink` has **no strength-based early exit at all** — it loops over every link every tick
  unconditionally (`node_modules/d3-force-3d/src/link.js:33-53`), computing distances/square
  roots that are then multiplied by zero.
- `center` (unlike charge/link) was correctly **removed entirely**
  (`fg.d3Force("center", null)`, `Graph3D.tsx:984`) — this is the *only* one of the three forces
  that costs nothing, because passing `null` deletes it from the simulation's internal `forces`
  Map (`node_modules/d3-force-3d/src/simulation.js:161-162`) instead of merely neutering it.

And separately, this audit found the simulation's tick is driven by **`3d-force-graph`'s own
independent `requestAnimationFrame` loop** (`node_modules/3d-force-graph/dist/3d-force-graph.mjs:261-270`,
`_animationCycle`), which calls `state.forceGraph.tickFrame()` **every real browser animation
frame** — completely separate from, and never gated by, Graph3D.tsx's own `fpsCap`-throttled
`tick()` loop (`Graph3D.tsx:1184-1192`). So the wasted octree-build + link-loop work happens at
the display's native refresh rate (60/90/120Hz+) regardless of whether the user is on
Performance/Balanced/Quality mode.

**This audit also found something that materially changes what a safe fix looks like**: the
position-sync step that pushes `orbits.ts`'s computed positions onto the actual rendered
`Object3D`s lives **inside the same function** (`layoutTick()`,
`node_modules/three-forcegraph/dist/three-forcegraph.mjs:717-750`) that ticks the simulation, and
is gated by the *same* `engineRunning` flag the mission's own suggested "event-driven
stabilization" idea would target. **Naively stopping the engine (e.g. via `cooldownTicks`) would
also stop the position sync and freeze the entire Galaxy in place** — a severe regression, not a
performance win. §14 gives the actual safe alternative this audit found instead.

---

## 2. Actual physics engine / configuration

**CONFIRMED**, from `packages/web/package.json` and the resolved `node_modules` tree:

| Package | Installed version | Role |
|---|---|---|
| `react-force-graph-3d` | 1.29.1 | React wrapper; not modified in this repo |
| `3d-force-graph` | 1.80.0 | Owns the renderer/camera/controls + the animation loop |
| `three-forcegraph` | 1.43.4 | Owns the `graphData`→simulation binding + per-tick node/link position sync |
| `d3-force-3d` | 3.0.6 | The actual physics engine (3D fork of `d3-force`) |
| `ngraph.forcelayout` | 3.3.1 | Installed as an alternative engine but **unused** — `forceEngine` defaults to `'d3'` (`three-forcegraph.mjs:613-615`) and is never overridden in `Graph3D.tsx` (confirmed: no `forceEngine=` prop anywhere in the file) |

**Engine dimensionality**: `numDimensions` defaults to 3 (`three-forcegraph.mjs:465-466`) and is
never overridden — this is a true 3D simulation (`octree`, not `quadtree`).

**Forces configured** (`three-forcegraph.mjs:1082`, the base `d3ForceLayout` construction):
`forceSimulation().force('link', forceLink()).force('charge', forceManyBody()).force('center',
forceCenter()).force('dagRadial', null)`. **Graph3D.tsx immediately neutralizes two of these and
removes the third**, once, on mount (`Graph3D.tsx:979-985`, full code + comment quoted in §4). No
collision force, no radial force, and no custom force is registered anywhere in this codebase —
grepped `d3Force(` across `packages/web/src` and found exactly the 3 call sites at
`Graph3D.tsx:983-985` (checked in §14's safety analysis).

---

## 3. Simulation initialization lifecycle

**CONFIRMED**: the `d3ForceLayout` object itself is constructed exactly once, inside
`three-forcegraph`'s own `stateInit` (`three-forcegraph.mjs:1082`), when `3d-force-graph`
constructs a `new ThreeForceGraph()` (`3d-force-graph.mjs:303`) — which happens once when the
`<ForceGraph3D>` React component itself mounts (react-force-graph-3d → 3d-force-graph
construction, not re-created by Graph3D.tsx). **This is a single long-lived simulation object for
the life of the Galaxy component** — it is never destroyed and recreated by a `graphData` change,
only by the whole `<ForceGraph3D>` component unmounting (Graph3D.tsx's own teardown, confirmed
present at `Graph3D.tsx:2049,2086-2090` from the Round 3 audit, not re-derived here).

Graph3D.tsx's own force-neutering code (`fg.d3Force("charge")?.strength(0)`, etc.) is guarded by
`fg.__brainInited` (`Graph3D.tsx:667-668`) inside a `useEffect(() => {...}, [])` with an **empty
dependency array** — confirmed by tracing this effect from its `useEffect(() => {` opening at
`Graph3D.tsx:665` through to its closing `}, []);` at `Graph3D.tsx:2132` (one very large mount-only
effect that also defines the `tick()` function and sets up the entire scene). **This runs exactly
once per Galaxy mount, never on `refresh()`, never on a React re-render, never on a `graphData`
prop change** — `refresh()` (App.tsx, per the Round 3 audit) calls `setData(g)`, which only changes
the `graphData` *prop value* passed into the same, already-mounted `<ForceGraph3D>` element; it
does not unmount/remount the component or re-run this effect.

**Does changing `graphData` recreate the simulation? No — it feeds new node/link arrays into the
SAME long-lived `d3ForceLayout` object** (see §6). **Does a React re-render recreate it? No** —
confirmed by the guard above; only initial mount runs this code. **Does changing other props
rebuild the force *configuration* (not the whole simulation)?** Yes, but only for a small,
specific list (see §6) — and Graph3D.tsx never changes any of those props after mount, so this
path is confirmed dormant in practice for this app.

---

## 4. Force configuration (Graph3D.tsx's own overrides)

Exact code, `Graph3D.tsx:979-985`:

```ts
// Motion is handled by the kinematic orbit system (orbits.ts), which pins
// node positions each frame — so disable the force-engine layout entirely
// (no charge/gravity tug-of-war, no collapse). Links are kept only as
// visual tethers between the orbiting bodies.
fg.d3Force("charge")?.strength(0);
fg.d3Force("center", null);
fg.d3Force("link")?.strength(0);
```

This confirms the *intent* was already "disable the force-engine layout entirely" — the comment
is accurate about the visual/positional outcome (§1's finding: pinned nodes make this true), but
**"strength(0)" and "null" are not equivalent at the implementation level**, and this audit's
central finding (§1, §11, §14) is that only the `null` form actually stops the per-tick
computation. This is not a design intent gap — it is an implementation-detail gap between two
outwardly-similar-looking API calls that happen to produce identical *visual* results while
differing hugely in *CPU cost*.

**Other relevant parameters, all read directly from `Graph3D.tsx`'s JSX props (`:2862-2867`)**:
- `warmupTicks={0}` — no synchronous pre-render ticking on data load (matches the library default
  of 0 anyway; explicit here for clarity). Confirmed effect: the `for (var i = 0; i <
  state.warmupTicks...)` loop in `three-forcegraph.mjs:1476-1478` never executes.
- `cooldownTicks={9999999}` — overrides the library default of `Infinity`
  (`three-forcegraph.mjs:657-659`) with a very large but *finite* number.
- `cooldownTime={9999999}` (ms ≈ 2h 46m) — overrides the library default of `15000` (15s)
  (`three-forcegraph.mjs:661-664`).
- `d3AlphaMin`, `d3AlphaDecay`, `d3VelocityDecay`, `d3AlphaTarget`, `forceEngine`, `numDimensions`
  — **none of these are set anywhere in `Graph3D.tsx`** (grepped for all of them; zero matches
  beyond the prop-schema definitions inside `node_modules`). All run at their library defaults:
  `d3AlphaMin: 0`, `d3AlphaDecay: 0.0228`, `d3VelocityDecay: 0.4`, `d3AlphaTarget: 0`
  (`three-forcegraph.mjs:617-640`).

**What each setting means for CPU work, in this specific configuration:**
- `d3AlphaMin: 0` (unchanged default) means the stop condition `state.d3AlphaMin > 0 &&
  d3ForceLayout.alpha() < state.d3AlphaMin` (`three-forcegraph.mjs:729`) is **permanently
  false** — alpha decaying toward zero can never trigger a stop by itself. The *only* two stop
  conditions actually live in this app are the tick-count and wall-clock ceilings, both raised to
  ~10 million / ~2h47m.
- `cooldownTicks`/`cooldownTime` at these values mean the simulation is configured to tick
  **for as long as any real user session plausibly lasts**, and — critically, see §7 — **every
  `refresh()` event resets both counters to zero and re-arms this window**, so in normal use the
  simulation essentially never reaches even this generous ceiling.
- `d3VelocityDecay`/`d3AlphaDecay` govern how fast alpha and velocity would decay *if* the forces
  had any effect — moot here, since output is discarded for every pinned node (§1), but they do
  still feed the (also-discarded) `node.vx *= velocityDecay` arithmetic that never actually runs
  for a pinned node (`simulation.js:63`: the `else` branch — `node.x = node.fx, node.vx = 0` — is
  taken instead, skipping the velocity-decay multiplication entirely for every node in this app).

---

## 5. Alpha / stabilization behavior

**CONFIRMED, direct source read of `node_modules/d3-force-3d/src/simulation.js:49-77`** (`tick()`,
the function `three-forcegraph` calls once per real animation frame — see §11):

```js
function tick(iterations) {
  ...
  for (var k = 0; k < iterations; ++k) {
    alpha += (alphaTarget - alpha) * alphaDecay;
    forces.forEach(function (force) { force(alpha); });
    for (i = 0; i < n; ++i) {
      node = nodes[i];
      if (node.fx == null) node.x += node.vx *= velocityDecay;
      else node.x = node.fx, node.vx = 0;
      ... // same pattern for y, z
    }
  }
}
```

Two confirmed facts follow directly from this code:
1. **Every registered force is called unconditionally, every tick, regardless of alpha's value**
   (`forces.forEach(...)` has no threshold check). Alpha only scales the force's *output*
   magnitude (used inside `manyBody`/`link`'s own math) — it never gates *whether* a force
   function runs.
2. **A pinned node (`fx != null`) never accumulates velocity from any force at all** — its
   `node.vx` is force-set to `0` every tick (`node.x = node.fx, node.vx = 0`), completely
   independent of whatever the (already near-zero, since strength=0) force computation wrote into
   `node.vx` moments earlier in the same tick. Since **100% of this app's nodes are pinned every
   real frame by `orbits.ts`** (Round 3 audit, re-confirmed by reading `orbits.ts` in full during
   that audit), this is a blanket, unconditional discard — not merely "usually" true.

**Does alpha ever reach a stopping value?** With `d3AlphaMin: 0` (unchanged default), the
per-tick `if (alpha < alphaMin) { stepper.stop(); ... }` self-stop path inside `simulation.js`'s
own internal `step()`/`stepper` (lines 40-47) is **irrelevant here** — `three-forcegraph` doesn't
even use that internal auto-stepper (see §11: it calls `layout.tick()` manually from its own
externally-driven `tickFrame()`, never `layout.restart()`), so `simulation.js`'s own `alpha <
alphaMin` check literally never executes in this app at all. The **only** stop condition that can
ever fire is `three-forcegraph`'s own tick-count/wall-clock check (`three-forcegraph.mjs:729`),
which is the `cooldownTicks`/`cooldownTime` ceiling from §4.

**Classification for the mission's Q4 (does physics continue after stabilization)**: **D — the
simulation continues because `d3AlphaMin` is left at its default of 0, so the natural
alpha-based stop condition (`three-forcegraph.mjs:729`'s third clause) can never fire; only the
tick-count/wall-clock ceiling can stop it, and that ceiling is both very large (~10M ticks / ~2h47m)
and reset on every `graphData` replacement (§7).** CONFIRMED.

---

## 6. GraphData lifecycle

**CONFIRMED**, `Graph3D.tsx:2862`: `graphData={data as any}` — the full, **unfiltered** `data`
prop (the ≤300-node server overview, per the Round 3 audit) is passed directly. `nodeVisibility`/
`linkVisibility` (`Graph3D.tsx:2868-2871`) are **separate** accessor props that only affect
rendered `.visible` state — they do not change what's fed into `graphData`.

**Where `graphData` is created/replaced**: per the Round 3 audit (re-cited, not re-derived),
`App.tsx`'s `refresh()`/`getGraph()` call sites always build a **brand-new** `{nodes, links}`
object via `setData(g)` — a full replace, never a mutation of the previous object, and only on
discrete events (boot, node-focus, and several `onChanged`/`onPromoted`/`onAnswered` callbacks),
never on a poll/timer.

**What happens inside the library on every such replace** — **CONFIRMED**, direct read of
`three-forcegraph.mjs:1400-1483` (the digest cycle, triggered whenever any of `['graphData',
'nodeId', 'linkSource', 'linkTarget', 'numDimensions', 'forceEngine', 'dagMode', 'dagNodeFilter',
'dagLevelDistance']` changes identity):

```js
if (hasAnyPropChanged([...])) {
  state.engineRunning = false; // Pause simulation
  ... // parse link source/target
  if (isD3Sim) {
    (layout = state.d3ForceLayout).stop().alpha(1) // re-heat the simulation
      .numDimensions(state.numDimensions).nodes(state.graphData.nodes);
    var linkForce = state.d3ForceLayout.force('link');
    if (linkForce) linkForce.id(...).links(state.graphData.links);
    ...
  }
  for (var i = 0; i < state.warmupTicks && ...; i++) { layout.tick(); }
  state.layout = layout;
  this.resetCountdown(); // cntTicks=0, startTickTime=now, engineRunning=true
}
state.engineRunning = true;
```

This directly and unambiguously answers §5/§7's core question: **`graphData` replacement does
NOT recreate the simulation object** (`state.d3ForceLayout` is the same object across every
replace — only `.nodes()`/`.links()` are called on it, feeding new arrays into the existing
simulation) **but it DOES unconditionally call `.alpha(1)` — a full reheat — every single time,
regardless of whether the actual node/link content materially changed.** Since `warmupTicks: 0`
means the `for` loop that follows does zero iterations, and `resetCountdown()` resets the
tick/time counters to zero, **every `refresh()` event re-arms the full `cooldownTicks`/
`cooldownTime` window from scratch and sets alpha back to 1**, after which real ticking resumes
on `3d-force-graph`'s own independent animation loop (§11).

**Does adding/removing a single node reheat?** Yes — any `graphData` prop identity change is
treated identically (a full re-feed + reheat), whether one node changed or the entire graph is
different. **Does updating links reheat?** Yes, same mechanism — `links` is part of the same
`graphData` object, so any replacement (even one that only changed edges) triggers the same path.
**Does `refresh()` cause physics work even when the visual graph barely changed?** **Yes,
confirmed** — the reheat is unconditional on `graphData` identity, not on a diff of its contents;
a `refresh()` that returns byte-for-byte the same node/link data (a real possibility given the
Round 3 audit's finding that `refresh()` fires from several UI actions, not just data-changing
ones) still triggers a full `.alpha(1)` reheat.

**graphData change → simulation update → alpha/reheat → physics ticks, traced:**
```
App.tsx refresh() → setData(g) [new object]
  → <ForceGraph3D graphData={data}> prop identity changes
    → three-forcegraph's hasAnyPropChanged(['graphData',...]) fires
      → d3ForceLayout.stop().alpha(1).nodes(newNodes) [+ .links() if link force still registered]
      → resetCountdown() [cntTicks=0, startTickTime=now, engineRunning=true]
        → (every subsequent real animation frame, via 3d-force-graph's OWN rAF loop, §11)
          → tickFrame() → layoutTick() → state.layout.tick()
            → forces.forEach(f => f(alpha))  [charge: full octree build; link: full O(m) loop]
            → position-integration (pinned nodes: x=fx, discard force output)
```

---

## 7. Reheat / restart triggers

| Trigger | Reheats (`alpha→1`)? | Rebuilds simulation object? | Expected frequency |
|---|---|---|---|
| Initial mount | Yes (initial `graphData` set counts as a prop change into the just-constructed simulation) | Yes — this IS the one-time construction (§3) | Once per Galaxy mount |
| Galaxy `refresh()` (any of App.tsx's `refresh()`/`getGraph()` call sites) | **Yes, unconditionally** — confirmed §6 | No — same `d3ForceLayout` object, re-fed | Every discrete user-facing event that calls `refresh()` (boot, node-focus, several `onChanged`/`onPromoted`/`onAnswered` callbacks per the Round 3 audit) — event-driven, not polled |
| Memory ingestion | Yes, if it triggers a `refresh()`-family call (ingestion flows call `onChanged`-style callbacks elsewhere in this codebase per prior audits) — **SUSPECTED** specific call path not re-traced in this pass, but falls under the general `refresh()` trigger above if it does | No | Once per ingest event that reaches a `refresh()` |
| Selection (clicking a node) | **No** — selection state (`activeId`/`selected`) does not change the `graphData` prop; confirmed by the fact that `nodeThreeObjCacheRef`'s cache key (from the prior Round-3 fix) does not include selection state, and `graphData={data}` is keyed only on `data`, not on `activeId` | No | N/A |
| Lens/View/cluster change | **No** — `cluster`/`activeLens` only drive `nodeVisibility`/`linkVisibility` accessor props (§6), which are in the "always re-evaluate per node" category of react-force-graph-3d props, not the `hasAnyPropChanged` list that triggers a reheat (`nodeVisibility`/`linkVisibility` are absent from the exact list quoted in §6) | No | N/A |
| Journey/Money-sky/Waystation changes | **No** — these are separate `THREE.Group`s added directly to the scene outside `three-forcegraph`'s own node/link system (per Round 2 audit); they never touch `graphData` | No | N/A |
| Camera interaction (orbit/zoom/pan) | **No** — camera state is owned by `OrbitControls`, entirely separate from `graphData`/the simulation | No | N/A (continuous, but simulation-unrelated) |
| React re-render (state change unrelated to `data`) | **No** — confirmed by the `fg.__brainInited` mount-guard (§3): the scene/force-setup effect never re-runs; and `graphData={data as any}` only changes identity when `data` itself (the React state holding the fetched graph) changes | No | N/A |

Rows left unpopulated in the mission's template (none — every requested row has direct or
strongly-derived evidence above).

---

## 8. 300-node simulation analysis

Per the Round 3 audit (re-cited, not rediscovered): the server bounds the client to ≤300 nodes
(`GraphService.overview(limit=300)`) and the client always requests the default limit.

- **Are all ~300 active nodes still in the force simulation? CONFIRMED yes** — `graphData={data
  as any}` (§6) passes the complete, unfiltered node/link set into `.nodes()`/`.links()`; nothing
  filters it before it reaches the simulation.
- **Are all active links included? CONFIRMED yes**, same mechanism.
- **Does the simulation operate on the full graphData even when some objects are visually
  hidden? CONFIRMED yes** — see §9; `nodeVisibility`/`linkVisibility` never touch the arrays fed
  to `.nodes()`/`.links()`.
- **Are off-screen (frustum-culled) nodes still simulated? CONFIRMED yes** — frustum culling is
  entirely a `Graph3D.tsx` tick()-loop concept (`o.visible = false` on the rendered `Object3D`,
  per the Round 2/3 audits); it never touches `dataRef.current.nodes`/the `graphData` array or
  calls back into the simulation in any way.
- **Are `.visible = false` nodes still simulated? CONFIRMED yes** — see §9 for the direct
  mechanism.
- **Are Lens/View/cluster-hidden nodes still simulated? CONFIRMED yes** — same reasoning as
  frustum culling; `nodeVisibility`'s accessor function is evaluated by the rendering path, not
  by the simulation.
- **Does frustum culling affect physics? CONFIRMED no.**
- **Does distance from camera affect physics? CONFIRMED no** — nothing in the simulation's own
  code (`simulation.js`, `manyBody.js`, `link.js`) reads camera state; camera distance only
  affects `orbits.ts`'s *own separate* LOD system (Round 3 audit, unrelated to the d3 simulation).

**Physics cost is O(nodes·log(nodes) + links) per tick**, not something more complex:
`forceManyBody`'s octree build+traverse is the standard Barnes-Hut O(n log n) (confirmed no naive
O(n²) pairwise loop exists anywhere in `manyBody.js` — see §10), and `forceLink`'s loop is a
straightforward O(m) single pass with no nested per-link work. **The 300-node cap DOES bound the
`n` term of this cost** (confirms Round 3's finding extends cleanly to the force simulation), but
**does NOT bound `m` as tightly** — link count depends on graph density among the (hub-biased)
selected 300 nodes, not on the node cap directly (§10 elaborates the scaling risk this implies).

---

## 9. Hidden vs. simulated analysis

**CONFIRMED, directly**: `Object3D.visible = false` is a three.js rendering-only flag — it has no
relationship whatsoever to the plain JavaScript node objects (`{id, x, y, z, fx, fy, fz, vx, ...}`)
that `d3ForceLayout` operates on. These are two entirely separate data structures:
1. The **rendered scene graph** — `THREE.Object3D`s built by `makeNodeObject()`, cached in
   `nodeThreeObjCacheRef` (per the prior cache-key audit), whose `.visible` flag is toggled by
   frustum culling, macro/fidelity LOD, and the `nodeVisibility` accessor.
2. The **simulation's own node array** — `state.graphData.nodes` (the same array object
   `dataRef.current.nodes` in `Graph3D.tsx` points at), which `d3ForceLayout.nodes()` was fed
   directly (§6) and which the tick loop (§5) iterates unconditionally, regardless of anything in
   structure (1).

There is **no code path connecting the two** for the purpose of excluding a node from physics —
confirmed by reading every place `nodeVisibility`/frustum-cull/macro-LOD/Lens state is set
(Round 2/3 audits, re-verified structurally in this pass) and finding none of them ever calls
back into `fg.graphData()`, `d3ForceLayout.nodes()`, or any other simulation-membership API.

**Summary answer to the mission's explicit question**: label visibility, LOD, frustum culling,
Galaxy View filtering, Lens filtering, and cluster isolation **all merely hide the rendered
object — none of them remove a node from physics.** This matches (and extends to the physics
layer) the Round 3 audit's identical finding about the CPU tick loop's own per-node visitation.

---

## 10. CPU complexity / scaling analysis

Direct source evidence, not assumption:

- **`forceManyBody` (charge)**: `octree(nodes, x, y, z)` construction is `d3-octree`'s standard
  spatial-subdivision build — **O(n log n)**, confirmed by inspecting `manyBody.js:20-31`'s single
  call to build the tree once per tick, then `.visitAfter(accumulate)` (one full tree
  walk, O(n)), then a `tree.visit(apply)` **per source node** (`for (...i<n...) tree.visit(apply)`,
  line 30) — a Barnes-Hut descent that is O(log n) per source node in the general case, **O(1)
  per source node in THIS app's specific configuration** because `apply()`'s first line
  (`if (!treeNode.value) return true;`, `manyBody.js:72`) immediately prunes every branch the
  instant it's visited, since every node's accumulated `strength` is 0 (confirmed: `accumulate()`
  sums `strengths[q.data.index]`, and `strengths` is filled from `+strength(node,i,nodes)` where
  `strength = constant(0)` after Graph3D.tsx's `.strength(0)` call). **No naive O(n²) charge
  calculation exists anywhere in this codebase's dependency tree** — Barnes-Hut via a real octree
  is genuinely used, confirming the mission's Q9 "look for naive O(N²)" came back negative.
- **`forceLink`**: a flat **O(m)** loop (`link.js:33-53`), no nested traversal, no early exit for
  zero strength — this is genuinely linear in link count with no complexity concern, but it is
  **unconditional dead work** in this app (§1).
- **`center`**: **O(0)** — fully removed from the `forces` Map, never visited.

**Scaling table** (derived from the confirmed complexity classes above; this sandbox cannot
produce real timing numbers — see §15):

| Node count (n) | Octree build+walk cost class | Link count (m) scenario | Link-loop cost class | Per-tick total |
|---|---|---|---|---|
| 50 | O(50 log 50) ≈ small | ~50-150 (sparse-to-moderate) | O(m) | tiny |
| 100 | O(100 log 100) | ~100-300 | O(m) | small |
| 300 (the cap) | O(300 log 300) | ~300-1,200 (Round 3 flagged hub-selection bias could push this toward 2-4× n) | O(m) | still small in absolute per-tick terms for a modern CPU, but non-zero and **entirely wasted** |

**Does the 300-node cap protect against database growth here?** **Yes for `n`** (bounds the
octree-build term exactly as it bounds everything else in the Round 3 audit), but **only
partially for `m`** — link count is governed by graph density among the selected top-300 hubs,
which the Round 3 audit already flagged as plausibly denser than a naive proportional estimate.
**This means the force-simulation's *link*-driven cost is the one part of this subsystem whose
growth isn't as tightly capped as everything else in the Round 3 audit's model** — worth carrying
forward as context, though still bounded by realistic graph density, not by DB size directly.

**Multiplying factor found in this audit, not in Round 3**: this entire per-tick cost repeats on
**every real animation frame** (§11), at the display's native refresh rate — e.g., 2-4× more often
on a 120Hz device than a 30-60Hz one, and **completely unaffected by this app's own
Performance/Balanced/Quality tier or `fpsCap` setting.**

---

## 11. Physics vs. render separation

This is the audit's most significant structural finding, and it complicates the "physics vs.
render CPU" split the mission asked for — **they are not on the same clock.**

**CONFIRMED, `node_modules/3d-force-graph/dist/3d-force-graph.mjs:261-271`**:
```js
_animationCycle: function _animationCycle(state) {
  ...
  state.forceGraph.tickFrame();   // ticks the d3 simulation directly
  state.renderObjs.tick();        // updates controls + calls renderer.render()
  state.animationFrameRequestId = requestAnimationFrame(this._animationCycle);
}
```
This is `3d-force-graph`'s **own, independent `requestAnimationFrame` loop**, started once
(`3d-force-graph.mjs:546`, `this._animationCycle();`, called from the library's own `init`).
It is **entirely separate from** `Graph3D.tsx`'s own `raf = requestAnimationFrame(tick)` loop
(`Graph3D.tsx:1185`), which has its own `fpsCap`-based frame-skip gate (`Graph3D.tsx:1189-1193`).

**CONFIRMED, `node_modules/three-forcegraph/dist/three-forcegraph.mjs:717-750`** (`tickFrame`):
`state.layout.tick()` (the actual d3 simulation step, including the wasteful octree/link work) is
called **directly and synchronously** from this library-owned loop — `three-forcegraph` does not
use `d3-force-3d`'s own internal auto-stepper (`simulation.js`'s `timer(step)`/`.restart()`
machinery is present in the dependency but never invoked by `three-forcegraph`, which calls
`.tick()` manually instead). So there is no third, hidden timer — just these two independent rAF
loops.

**A second confirmed consequence, load-bearing for §14's safety analysis**: the same
`layoutTick()` function that ticks the (wasted) forces **also performs the position sync** that
pushes `orbits.ts`'s computed `x/y/z` onto the actual rendered `Object3D`s
(`three-forcegraph.mjs:736-750`, `state.nodeDataMapper.entries().forEach(...)`), and this sync is
gated by the **same** `state.engineRunning` flag (`tickFrame`'s outer `if (state.engineRunning) {
layoutTick(); }`). **If `engineRunning` becomes `false` (the cooldown ceiling is reached, or a
naive "stop the engine" fix is applied), position sync stops too — the entire Galaxy would freeze
in place**, even though `orbits.ts` keeps computing fresh positions every frame on the underlying
plain-JS node objects. This is a genuine, confirmed coupling this app's current
`cooldownTicks={9999999}`/`cooldownTime={9999999}` values exist specifically to avoid tripping in
any realistic session — whether or not that was the original author's explicit reasoning, it is
the correct, necessary effect of those settings given this coupling.

**Practical CPU/GPU split, given the above:**
- **Physics CPU** (the octree build, tree walk, and O(m) link loop) — runs on `3d-force-graph`'s
  own uncapped loop, at native refresh rate, for zero visual benefit. **CONFIRMED present, small
  per-tick, but non-zero and continuous** (§1, §5, §10).
  - `updateArrows()`/`updatePhotons()` also run inside the same `tickFrame()` call
    (`three-forcegraph.mjs:722-723`) — `updatePhotons()` does real (small, intentional) work in
    this app, since `linkDirectionalParticles` is configured (`Graph3D.tsx:2981-2986`, 0-2
    particles only on high-activity links) — this is legitimate visual-feature cost, not waste,
    and is out of scope for this audit's recommendation.
- **Render CPU** — the actual `renderer.render()` call happens inside `state.renderObjs.tick()`
  (`3d-force-graph.mjs:269`), on the **same** uncapped loop as physics — meaning the GPU draw
  submission is *also* not gated by `Graph3D.tsx`'s `fpsCap`. This matches — and this audit
  independently confirms via source, rather than assuming — the design note already on record in
  this project's own Performance Program plan ("the underlying `3d-force-graph` library runs its
  own uncapped `requestAnimationFrame` loop calling `renderer.render()` regardless of our FPS
  cap"), which motivated Stage 0's three-independent-series PerfHUD design. **This audit's new
  contribution is confirming that the *simulation* tick lives on that exact same uncapped loop,
  not just the render call** — the two were previously understood as coupled for render-call
  cadence, not specifically for physics cost.
- **Graph3D.tsx's own `tick()`** (fpsCap-gated) — everything from the Round 2/3 audits (orbits'
  own trig work — note `orbits.ts`'s `update()` is called from *this* loop, not from the d3
  simulation's loop — labels, glow, spatial grid, LOD, sound cues) runs here, separately, and
  *is* subject to the app's own Performance/Balanced/Quality throttling.

**Is force simulation a meaningful part of the Galaxy's CPU budget? See the Recommendation Gate
at the end of this document** — the evidence says: small in absolute per-tick terms at n≤300, but
**100% wasted, continuous, and running at an uncapped rate this app's own settings can't touch** —
which is a real, if modest-magnitude, confirmed inefficiency, not a fabricated "bottleneck."

---

## 12. Confirmed vs. derived vs. suspected vs. unknown — index

**CONFIRMED** (direct source read, this pass): installed package versions (§2); `forceEngine`
defaults to `'d3'`, unused `ngraph.forcelayout` (§2); the exact 3 `d3Force` call sites and their
semantics (§4); `warmupTicks`/`cooldownTicks`/`cooldownTime` values and library defaults for
everything else (§4); the `tick()` function's pinned-node bypass (§5); the full `graphData`
digest/reheat code path (§6); the reheat trigger table's mechanism for every populated row (§7);
`graphData={data as any}` passing the unfiltered set (§6, §8); `nodeVisibility`/`linkVisibility`
never touching simulation membership (§9); `forceManyBody`'s octree-based Barnes-Hut
implementation and its zero-strength early-exit location (§10); `forceLink`'s unconditional O(m)
loop with no early exit (§10); the two independent `requestAnimationFrame` loops and their
respective owners (§11); the `engineRunning`-gated coupling between force ticking and position
sync (§11, §14).

**DERIVED**: the practical "runs effectively forever, resets on every refresh" characterization
of the cooldown ceiling (§5, §7 — a direct consequence of confirmed values, not independently
timed); the scaling table's qualitative shape (§10 — complexity classes are confirmed, the
specific `m` estimates for a real user's graph are extrapolated from Round 3's independent
hub-density finding).

**SUSPECTED**: the exact link:node ratio at real user scale (inherited from Round 3, not
re-measured here); whether "memory ingestion" reaches a `refresh()`-triggering callback in every
code path (§7 — plausible, not re-traced end-to-end from the ingestion route in this pass).

**UNKNOWN** (genuinely requires tooling this sandbox lacks): any real-device timing number for the
octree build/link loop at n=300 (§10, §15); real device refresh rate distribution among this
product's actual users (§10's "60 vs 120Hz" framing is illustrative, not measured); whether the
`updateArrows()`/`updatePhotons()` costs are individually significant (not measured, only
structurally located); react-force-graph-3d/3d-force-graph's exact behavior under extremely rapid
repeated `graphData` replacement (e.g., a burst of several `refresh()` calls within one frame) —
plausible but not traced.

---

## 13. P0–P3 classification

- **P1 — meaningful, well-evidenced, safely fixable waste**: the confirmed uncapped, continuous,
  100%-discarded octree build + O(m) link loop (§1, §10, §11). Not P0 because the confirmed
  per-tick cost at n≤300 is small in absolute terms and there is no evidence of it being a
  user-visible stutter source on its own — it is a real, confirmed inefficiency, not a fabricated
  bottleneck, and the fix is narrow and safe (§14).
- **P2 — worth knowing, not worth touching in this pass**: the O(m) term's looser bound relative
  to the O(n) term's tight 300-node cap (§8, §10) — a genuine, if currently modest, scaling
  consideration for a future graph-density change (e.g., raising `maxLinks` in
  `associativeLink.ts`, out of scope here).
- **P3 — informational**: the render-call/physics-tick coupling to an uncapped, fpsCap-independent
  loop (§11) is valuable context for the whole Performance Program (it explains why `fpsCap`
  doesn't reduce GPU draw-call cadence), but is **not** a force-simulation-specific finding to act
  on in isolation — any fix here is a rendering-architecture change, explicitly out of scope for
  this mission.
- **Not inflated to P0**: this audit found no evidence of an O(n²) calculation, no evidence of an
  unbounded/runaway reheat loop, and no evidence that the wasted per-tick cost is large enough in
  absolute terms (at n≤300) to be a primary, standalone performance bottleneck — it is real,
  confirmed, safely fixable waste, correctly sized as P1, not overstated as P0.

---

## 14. Recommended next isolated implementation (proposed only — not implemented)

**The mission's own suggested example — event-driven stabilization/reheating via
`cooldownTicks`/engine-stop tuning — is explicitly NOT the safe answer here**, because of the
confirmed coupling found in §11: stopping `engineRunning` also stops the position sync that
makes `orbits.ts`'s kinematic motion visible at all. Recommending that path without this audit
would have risked a severe visual regression (the entire Galaxy freezing) for a CPU saving.

**The safe, narrow, isolated fix this audit's evidence actually supports**: change
`fg.d3Force("charge")?.strength(0)` and `fg.d3Force("link")?.strength(0)`
(`Graph3D.tsx:983,985`) to `fg.d3Force("charge", null)` and `fg.d3Force("link", null)` —
**exactly the pattern this same line of code already uses one line below for `center`**
(`fg.d3Force("center", null)`, `Graph3D.tsx:984`). Per `simulation.js:161-162`'s `force()`
setter, passing `null` deletes the force from the simulation's internal `forces` Map instead of
merely zeroing its strength — so `forces.forEach(f => f(alpha))` (`simulation.js:57-59`) would no
longer call `forceManyBody`/`forceLink` at all, eliminating the confirmed octree build and O(m)
loop entirely, while:
- **Leaving `cooldownTicks`/`cooldownTime`/`warmupTicks` completely untouched** — the
  `engineRunning`-gated position-sync loop (§11) keeps running exactly as it does today, so
  `orbits.ts`'s kinematic motion continues to reach the screen with zero change.
- **Producing byte-for-byte the same node positions as today** — since strength was already 0,
  the force's contribution to `node.vx/vy/vz` was already always 0 before being discarded by the
  pinned-node bypass (§5); removing the force changes nothing about what value would have been
  computed and thrown away.
- **Having no other call site to break** — grepped `d3Force(` across `packages/web/src` and found
  exactly these 3 lines; nothing else reads `fg.d3Force("charge")`/`fg.d3Force("link")` as a
  getter expecting a live force object back (§4/§14 cross-check).
- **Not interacting with the `graphData` digest cycle's own `linkForce` lookup** — §6's quoted
  code already guards with `if (linkForce) { ... }`, so a `null` link force simply skips that
  block on every future `refresh()`, exactly as it already does for `center` today.

This is offered as **one isolated next experiment**, not applied in this audit. It changes zero
rendering, zero physics *feel* (since none of the removed computation ever affected a pixel), and
zero Galaxy architecture — it removes dead code paths inside a third-party library's tick
function via the library's own documented API, using a pattern this exact file already trusts for
an adjacent force.

---

## 15. Runtime verification gaps

**No browser/WebGL/device access is available in this sandbox** — every finding above is a direct
source-code read (this repo's `Graph3D.tsx` plus the exact installed versions in `node_modules`),
not a runtime measurement, and none of the following can be verified without one:
- Real `perfStats` numbers for `tick`/`render`/`present` before vs. after the §14 fix.
- The real-world magnitude of the octree-build/link-loop cost at n=300 on representative mobile
  hardware — this audit establishes the complexity *class* (confirmed) and the *fact* that it's
  fully wasted (confirmed), but not a millisecond figure.
- Real device refresh-rate distribution (60/90/120Hz) among actual users, which directly scales
  how often this wasted work repeats per second.
- Confirmation via `renderer.info`/PerfHUD that `programs.length`/`render.calls` are unaffected by
  the §14 fix (expected, since it touches no rendering state, but unverified on real hardware).
- Whether `d3ReheatSimulation()` (the exposed method for a *manual* reheat,
  `three-forcegraph.mjs:705-709`) is called anywhere in this codebase — grepped and found **no
  call sites** in `packages/web/src`, so this manual-reheat API is confirmed unused, not merely
  assumed so, but its *absence of effect* obviously can't be runtime-verified without a browser.

No FPS numbers, CPU percentages, or timing measurements are stated anywhere in this document as
if measured — every number given (tick counts, milliseconds, complexity classes) is either a
literal configuration value read from source, or an explicitly-labeled complexity class derived
from reading the actual algorithm, never a fabricated benchmark.

---

## Recommendation Gate

**«Is force simulation actually a meaningful performance cost in the current Galaxy
implementation, and if so, what is the smallest isolated change we should test next?»**

**Yes, in a narrow, well-evidenced sense — not as a dramatic bottleneck, but as a confirmed,
100%-wasted, continuous per-frame cost that runs at the display's native, uncapped refresh rate,
independent of every performance setting this app already exposes to the user.** The simulation's
actual *positional* output has zero effect on the rendered Galaxy (every node is pinned by
`orbits.ts`, confirmed via `d3-force-3d`'s own source), but two of its three configured forces
(`charge`, `link`) were disabled by *zeroing their strength* rather than *removing them*, and
zeroing strength does not stop either force's real internal computation (a full Barnes-Hut octree
rebuild every tick for charge; a full unconditional per-link loop for link) — confirmed by
reading `manyBody.js` and `link.js` directly, not assumed from documentation.

**The smallest isolated next experiment**: change `fg.d3Force("charge")?.strength(0)` and
`fg.d3Force("link")?.strength(0)` (`Graph3D.tsx:983,985`) to `fg.d3Force("charge", null)` and
`fg.d3Force("link", null)` — mirroring the `center` force's already-correct pattern one line away
(`Graph3D.tsx:984`). This is the mission's requested "smallest isolated change," and it is
**not** the mission's own suggested example (event-driven stabilization/engine-stop tuning) —
this audit found that path would risk a real regression (§11, §14) because of a confirmed coupling
between the simulation's `engineRunning` flag and the position-sync step the entire visible
orbit system depends on. The recommended fix instead targets only the two forces whose output was
already fully discarded, via the exact `null`-removal API this file already trusts for a third,
adjacent force — preserving 100% of the Galaxy's initial physics/layout, spatial depth, orbit
behavior, responsive interaction, node movement, selection behavior, and living-universe feel,
because none of those depend on — or are touched by — the computation being removed.

---

## Final validation

- **No source code changes were made.** `git status --porcelain` and `git diff --stat` (run after
  writing this document, before committing) show only this new file.
- No tests were added — this audit required no behavior change to inspect; every finding came
  from reading installed library source and this repo's existing `Graph3D.tsx` directly.
- Commit hash, files changed, and push status are reported in the chat response accompanying this
  document, per the mission's own instruction to report them there rather than in-document.
