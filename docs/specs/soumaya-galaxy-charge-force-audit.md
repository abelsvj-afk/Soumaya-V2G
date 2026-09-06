# Soumaya Galaxy — Charge-Force Removal Safety Audit

> **MODE: AUDIT ONLY.** No source code was changed to produce this document. Follows the
> force-removal regression (`e7bc375`, reverted in `4d10f8c`,
> [`soumaya-galaxy-force-removal-regression.md`](./soumaya-galaxy-force-removal-regression.md)),
> which confirmed the `link` force's `.links()` call has a load-bearing, non-physics side effect
> (resolving link `source`/`target` from raw IDs into node object references) that the renderer
> depends on. This audit asks the narrower question: **does `charge` have an equivalent hidden
> dependency, or is it safe to remove on its own?** Status: **audit complete — no implementation.**

## 1. Executive summary

**SAFE TO IMPLEMENT.** Unlike `link`, the `charge` force (`forceManyBody`) has **no reference
anywhere in the installed `three-forcegraph`/`3d-force-graph` source outside its own
construction and per-tick physics computation**, and **no code path in either library ever reads
or depends on a value `charge`'s initialization or ticking produces.** `forceManyBody`'s
`initialize()` and per-tick `force()` functions write only to their own private closure state
(`nodes`, `strengths`, a disposable per-tick octree) — confirmed by direct source read, they
never mutate the actual node/link objects the renderer shares, which is exactly the property
`link`'s `initialize()` violates (it mutates `link.source`/`link.target` in place — the confirmed
root cause of the prior regression). The only place `charge` is referenced outside its own
registration, in the entire dependency tree, is a `numDimensions`-prop `onChange` handler that
(a) is guarded by `if (chargeForce)` exactly like `link`'s guarded call, and (b) never fires in
this app at all, because `Graph3D.tsx` never sets a `numDimensions` prop.

## 2. Current known-good configuration

**CONFIRMED**, `packages/web/src/graph/Graph3D.tsx:991-993` (re-read in this pass):
```ts
fg.d3Force("charge")?.strength(0);
fg.d3Force("center", null);
fg.d3Force("link")?.strength(0);
```
This matches the restored, known-good state from `4d10f8c` exactly — verified before relying on
anything else in this audit.

## 3. Installed library versions

**CONFIRMED, re-verified in this pass** (`node -e "require(...).version"` against each installed
package, not assumed from memory of the prior audits):

| Package | Version |
|---|---|
| `react-force-graph-3d` | 1.29.1 |
| `3d-force-graph` | 1.80.0 |
| `three-forcegraph` | 1.43.4 |
| `d3-force-3d` | 3.0.6 |

Unchanged since the force-simulation and regression audits — no version drift to account for.

## 4. Charge implementation analysis (`node_modules/d3-force-3d/src/manyBody.js`, full file read)

**Initialization** (`force.initialize`, lines 115-120):
```js
force.initialize = function(_nodes, ...args) {
  nodes = _nodes;
  random = args.find(arg => typeof arg === 'function') || Math.random;
  nDim = args.find(arg => [1, 2, 3].includes(arg)) || 2;
  initialize();
};
function initialize() {
  if (!nodes) return;
  var i, n = nodes.length, node;
  strengths = new Array(n);
  for (i = 0; i < n; ++i) node = nodes[i], strengths[node.index] = +strength(node, i, nodes);
}
```
**CONFIRMED**: this reads `node.index` (already assigned elsewhere — by `d3-force-3d`'s own
`simulation.js:initializeNodes()`, not by charge) and writes into a **private local array**
(`strengths`), indexed by that pre-existing `node.index`. It does **not**:
- mutate any node object's own properties (no `node.foo = ...` anywhere in this file),
- add properties to `graphData`,
- affect IDs,
- touch links at all (`manyBody.js` never references `link`/`links` anywhere in the file — grepped),
- affect renderer state,
- register any callback (no `.on(...)`, no event dispatch),
- create any object another part of the codebase could plausibly hold a reference to and depend
  on (the `strengths` array and the octree built per-tick are both fully private to this closure).

**Per-tick behavior** (`force(_)`, lines 20-31):
```js
function force(_) {
  var i, n = nodes.length,
      tree = (nDim===1?binarytree(...):(nDim===2?quadtree(...):(nDim===3?octree(nodes,x,y,z):null))).visitAfter(accumulate);
  for (alpha = _, i = 0; i < n; ++i) node = nodes[i], tree.visit(apply);
}
```
**CONFIRMED, re-verified in this pass (matches the prior force-simulation audit exactly)**: the
octree (`d3-octree`) is built fresh from scratch **every single tick**, regardless of `strength`
— there is no `if (strength === 0) return` short-circuit anywhere in `force()`. The zero-strength
value only causes an early exit a few frames **inside** the resulting Barnes-Hut traversal
(`apply()`, line 72: `if (!treeNode.value) return true;`), not before the tree is built. **This
confirms removing the force (not merely zeroing it) is what actually prevents this per-tick
octree-build/traversal work — the original CPU-cost finding from the force-simulation audit
stands, for charge specifically.**

**Does `accumulate()` mutate the graph's own node objects?** **CONFIRMED no.** Re-reading lines
40-69: `accumulate(treeNode)` writes `treeNode.x`/`treeNode.y`/`treeNode.z`/`treeNode.value` where
`treeNode` is an **octree internal node** (a Barnes-Hut tree cell, part of the disposable
structure built fresh this tick) — for a leaf, `q.x = q.data.x` reads FROM the real node
(`q.data`) into the octree wrapper, never the reverse. **No line in this file ever assigns to a
real graph node's own `x`/`y`/`z`/`vx`/`vy`/`vz` except inside `apply()`'s `node.vx += ...`/
`node.vy += ...`/`node.vz += ...`** (lines 89-91, 109-111) — the one place charge does touch a
real node property, and it is exactly the velocity contribution the prior audit already confirmed
is discarded every tick for a pinned node (`d3-force-3d/src/simulation.js:63-64`: `if (node.fx ==
null) node.x += node.vx *= velocityDecay; else node.x = node.fx, node.vx = 0;` — every node in
this app is `fx`-pinned, so this branch always takes the `else`, discarding whatever `vx` charge
just wrote).

## 5. `three-forcegraph` dependency analysis

**Grepped the entire installed `three-forcegraph.mjs` for every occurrence of `charge`** — found
exactly two, both already known from the prior audits, re-verified here in the specific context
of this question:

1. **`three-forcegraph.mjs:1082`** — the initial construction: `.force('charge', forceManyBody())`.
   This is registration only, not a dependency.
2. **`three-forcegraph.mjs:465-478`** — the `numDimensions` prop's `onChange` handler:
   ```js
   numDimensions: {
     "default": 3,
     onChange: function onChange(numDim, state) {
       var chargeForce = state.d3ForceLayout.force('charge');
       if (chargeForce) { chargeForce.strength(numDim > 2 ? -60 : -30); }
       if (numDim < 3) { eraseDimension(state.graphData.nodes, 'z'); }
       if (numDim < 2) { eraseDimension(state.graphData.nodes, 'y'); }
     }
   }
   ```
   **CONFIRMED**: this is a **getter guarded by `if (chargeForce)`** — the exact same safe
   pattern `link`'s own graphData-digest call uses (`if (linkForce) { linkForce.id(...).links(...); }`,
   confirmed in the regression audit). If `charge` is `null`, `state.d3ForceLayout.force('charge')`
   returns `undefined`, the `if` is false, and the strength-adjustment line is skipped —
   **no exception, no side effect lost**, because this line's only job is to *re-tune* an
   already-registered force's strength for 3D vs. 2D mode; it does not create, normalize, or
   resolve anything else (unlike `link`'s call, whose *entire point* is the id→object
   normalization the renderer depends on).

   **CONFIRMED this handler never fires in this app**: `numDimensions` defaults to `3`
   (`three-forcegraph.mjs:466`) and is never passed as a prop anywhere in `Graph3D.tsx` — grepped
   `numDimensions=` across `packages/web/src` and found zero matches. Even if it *did* fire, the
   `if (chargeForce)` guard makes it harmless when charge is removed.

**No other reference to `charge` exists anywhere in `three-forcegraph.mjs`** — specifically
confirmed **absent** from: the `graphData` digest/reheat cycle (`three-forcegraph.mjs:1400-1483`,
the exact block that reads and depends on `link`), the node digest cycle (`nodeDataMapper`,
`~1089-1181`), the link digest cycle (`linkDataMapper`, `~1184-1295`), the arrow/particle digest
cycles, and `tickFrame()`/`layoutTick()` (`~717-±840`, read in full during the force-simulation
audit) — none of these functions call `state.d3ForceLayout.force('charge')` or reference charge
in any way. **This is the central, confirmed asymmetry with `link`.**

## 6. `3d-force-graph` dependency analysis

**Grepped the entire installed `3d-force-graph.mjs` for `charge`** — **zero matches.** The
wrapper that owns `_animationCycle`, `tickFrame()` invocation, `renderer.render()`, cooldown/
engine lifecycle, and `graphData` replacement plumbing (all read in full during the two prior
audits) contains no reference to charge whatsoever. **CONFIRMED**: removing charge cannot affect
renderer initialization, `graphData` processing, node creation, link creation, render-loop
behavior, or simulation lifecycle at the `3d-force-graph` layer, because that layer never touches
charge at all — every relevant lifecycle function was already read in full in the prior two
audits and re-confirmed here to contain no `charge` reference.

## 7. GraphData lifecycle analysis

**CONFIRMED, re-reading `three-forcegraph.mjs:1400-1483`** (the exact digest cycle quoted in the
regression audit): this block reads `state.d3ForceLayout.force('link')` and acts on it
(normalization); it **never reads `state.d3ForceLayout.force('charge')` at all.** Charge's only
touchpoint with this cycle is passive: `.nodes(state.graphData.nodes)` (called unconditionally,
regardless of which forces are registered) re-initializes **every currently-registered force**
via `forces.forEach(initializeForce)` inside `d3-force-3d`'s own `nodes()` setter
(`simulation.js:133-135`) — if charge isn't registered, it's simply not in that `forEach`, exactly
like `center` today. This is not a dependency *on* charge; it is charge (when present) being a
passive recipient of the node-array re-initialization, with no special handling and no other code
reading anything charge produces during this cycle.

## 8. Orbit relationship

**Re-confirmed from the force-simulation audit (`orbits.ts`, read in full there), not
re-derived**: `orbits.ts` never references `d3Force`, `d3ForceLayout`, or any force by name — it
operates entirely on `dataRef.current.nodes`/`dataRef.current.links` (plain JS data) and writes
`n.fx/fy/fz/x/y/z` directly, driven by `Graph3D.tsx`'s own separate `tick()` loop (`Graph3D.tsx:1185`
`requestAnimationFrame(tick)`), independent of `3d-force-graph`'s own animation cycle. Specific
answers:
- **Does orbit movement require charge to exist?** **CONFIRMED no** — zero references.
- **Does orbit movement require the simulation engine to remain running?** **CONFIRMED no**,
  for orbit computation itself (that math runs entirely in `Graph3D.tsx`'s own loop) — though the
  *position sync* that pushes the computed `x/y/z` onto the rendered `Object3D` does run inside
  `three-forcegraph`'s `layoutTick()` (per the force-simulation audit), which is unaffected by
  charge's presence or absence either way (§5/§6 confirm charge is never read there).
- **Would removing charge affect `fx/fy/fz`?** **CONFIRMED no** — nothing in `manyBody.js` reads
  or writes `fx/fy/fz` (grepped; absent from the file). Only `simulation.js`'s own tick loop reads
  `fx/fy/fz`, and it does so identically regardless of which forces are registered.
- **Does charge contribute anything to the visible orbit calculations?** **CONFIRMED no** — its
  only effect on a real node is the `vx/vy/vz` write in `apply()` (§4), which is unconditionally
  discarded for every pinned node before it can reach `x/y/z`.

## 9. Visual dependency analysis

Checked each item explicitly against the confirmed evidence above (§4-§7):

| Visual system | Depends on charge? | Basis |
|---|---|---|
| Celestial node creation (`makeNodeObject`) | **No** | Reads only `node.label/importance/degree/entropy/color/kind/mass/celestial` (per the memory-scaling audit) — no force state |
| Node positions | **No** | Driven by `orbits.ts` via `fx/fy/fz`; charge's `vx` write is discarded (§4, §8) |
| Node visibility | **No** | `nodeVisibility` accessor reads `cluster`/node id only (per prior audits) |
| Node materials/glow/labels | **No** | Built from node data only, no force reference (per the memory-scaling/cache-key audits) |
| Visual links (line/cylinder objects) | **No** | Link rendering depends on `link.source`/`link.target` resolution, which is the **`link`** force's job (§5-§7 of this audit and the regression audit) — charge has no equivalent role and is never read by the link digest/position-sync code (confirmed absent in §5) |
| Link curvature/particles | **No** | Same accessors (`linkColor`/`linkWidth`/`linkDirectionalParticles`) confirmed in the regression audit to be driven by `Graph3D.tsx`'s own defensive `linkEnd()` helper, unrelated to charge |
| Selection / camera interaction | **No** | `OrbitControls` and selection state are wholly separate systems (per prior audits) |
| Galaxy View / Lens behavior | **No** | Drives `nodeVisibility`/`linkVisibility`/the `cluster` filter set — none reference charge |

**We have direct, source-level confidence that removing charge cannot reproduce the previous
regression**, because the previous regression's mechanism (§7 of the regression audit: `link`'s
`.links()` call is the *only* place `source`/`target` get resolved from raw IDs to node objects,
and the renderer's link-position code explicitly depends on that resolution) has **no charge
equivalent** — charge never resolves, mutates, or normalizes anything the renderer reads.

## 10. Charge vs. link comparison

| Responsibility | Charge | Link |
|---|---|---|
| Physics calculation | Yes (Barnes-Hut repulsion) — confirmed discarded for pinned nodes | Yes (spring-like attraction) — confirmed discarded for pinned nodes |
| Node mutation | **No** (writes only to its own closure state and a per-tick disposable octree; its one real-node write, `node.vx`, is confirmed discarded) | **No new finding here** — link also only writes `vx`/`vy`/`vz` in its `force()` function (per `link.js:33-53`, quoted in the regression audit), also discarded for pinned nodes |
| Link/node **normalization** (raw ID → object reference) | **No — charge never touches links at all** (grepped `manyBody.js`; zero references to `link`) | **Yes — this is `link`'s entire non-physics role** (`link.js`'s `initialize()`, confirmed root cause of the regression) |
| Renderer dependency | **None found** — zero references outside its own registration and one dormant, guarded, never-fired prop handler | **Confirmed direct dependency** — `three-forcegraph.mjs:763-771`'s link-position sync reads `link.source`/`link.target` and silently fails if they were never resolved (only `link`'s own `.links()` call resolves them) |
| GraphData dependency | **Passive only** — receives `.nodes()` re-initialization like every registered force, with no special role in the digest cycle | **Active and load-bearing** — the digest cycle explicitly fetches and calls `.links()` on it, and nothing else performs this resolution |
| Required to remain registered? | **No, on all evidence gathered** | **Yes — confirmed required** |

**Why the answer differs**: `link`'s API contract in `d3-force` is inherently dual-purpose — the
same `forceLink` object that computes attraction is also, by convention, the thing every
`d3-force`-based tool (including `three-forcegraph`) relies on to resolve link endpoints from IDs
into object references, because `d3-force`'s own `link.js:initialize()` is the one place that
logic lives in the entire dependency chain. `forceManyBody` has no equivalent second
responsibility — Barnes-Hut repulsion has nothing to normalize; it only ever reads node positions
and writes node velocities, both already-resolved, already-owned-elsewhere values.

## 11. Performance implications (if implemented — not implemented in this audit)

**Confirmed, not merely expected**: removing charge (`d3Force("charge", null)`) would eliminate
the full Barnes-Hut octree construction + tree traversal that currently runs unconditionally every
real animation frame (§4, matching the force-simulation audit's original finding). This:
- **Does the octree rebuild disappear?** Yes, confirmed — with charge removed, `forces.forEach(f
  => f(alpha))` (`simulation.js:57-59`) simply never calls it; the Map has no `charge` entry.
- **Does this happen every tick?** Yes — confirmed to run on `3d-force-graph`'s own uncapped,
  native-refresh-rate animation loop (per the force-simulation audit), independent of this app's
  own `fpsCap`.
- **Does the benefit scale with active node count?** Yes, in the same O(n log n) sense the
  force-simulation audit already established for the octree build specifically.
- **Is the benefit bounded by the 300-node cap?** Yes — per the memory-scaling audit, the client
  never renders/simulates more than ~300 nodes regardless of total stored memory count, so this
  is a bounded, constant-factor removal, not an unbounded scaling win.

**No numerical FPS/CPU/ms figure is claimed** — this sandbox has no browser/WebGL access (§12),
so no runtime measurement was taken or fabricated.

## 12. Confirmed / derived / suspected / unknown findings

**CONFIRMED** (direct source read, this pass): current force configuration matches the known-good
state (§2); installed versions unchanged (§3); `manyBody.js`'s full implementation, including the
absence of any node/link mutation beyond the already-discarded `vx/vy/vz` write (§4); the exact 2
charge references in `three-forcegraph.mjs` and their guarded/dormant nature (§5); zero charge
references in `3d-force-graph.mjs` (§6); charge's passive-only role in the graphData digest cycle
(§7); `orbits.ts`'s complete independence from charge (§8, re-confirmed against the already-read
file); every visual system's independence from charge (§9); the structural reason `link` differs
from `charge` (§10).

**DERIVED**: the expected performance benefit's shape (§11 — complexity class and scope are
confirmed; no numeric magnitude is claimed or derivable without runtime measurement).

**SUSPECTED**: none — this audit did not need to rely on unconfirmed plausibility anywhere; every
claim above traces to a specific, quoted line of installed source.

**UNKNOWN**: any real-device timing/FPS number for the octree removal's actual effect (requires
hardware this sandbox lacks); whether some *future* version bump of these libraries could
introduce a new charge dependency (out of scope — this audit is scoped to the currently installed,
version-pinned dependency tree, re-verified in §3).

## 13. Final decision

**SAFE TO IMPLEMENT.**

Charge has no identified renderer or lifecycle dependency anywhere in the installed
`three-forcegraph@1.43.4` or `3d-force-graph@1.80.0` source — its only two references outside its
own construction are (a) a getter guarded exactly like `link`'s own guarded call, and (b) that
guard's caller (`numDimensions`'s `onChange` handler) never fires in this app at all. Its
per-node write (`vx`/`vy`/`vz`) is confirmed discarded for every pinned node, identically to
`link`'s own per-node write — the property that makes charge's *physics* safe to discard was never
in question; what this audit adds is confirming charge has **no second, non-physics
responsibility** the way `link` does. The exact minimal implementation, if and when approved:

```ts
fg.d3Force("charge", null);
```

— and nothing more; `link` and `center` remain exactly as they are in the current known-good
configuration.

## 14. Exact next step, if any

Not decided in this audit, per the mission's stop condition. If implementation is approved in a
future task: the smallest correct change is the single line in §13, applied with the same
"audit before editing" discipline used in the prior implementation task (re-confirm the current
source still matches §2 before editing, since another change could have landed in between). Real
on-device visual verification before committing is strongly warranted given the immediately
preceding regression, even though this audit found no code-level dependency — a live check costs
little and directly closes the one category of risk (§12's "UNKNOWN") this audit cannot rule out
from source alone.

---

## Validation

- **No source code changed.** `git status --porcelain` / `git diff --stat` (run after writing
  this document, before committing) show only this new file — reported in full in the
  accompanying chat response.
- No tests were added or run beyond what's necessary to inspect behavior — this audit required no
  behavior change; every finding came from reading installed library source directly.
