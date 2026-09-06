# Soumaya Galaxy — Force-Removal Regression: Revert + Root-Cause Audit

> **MODE: Revert + narrow audit only.** Commit `e7bc375` ("Perf: remove unused Galaxy charge
> and link forces") caused a real, user-reported visual regression. This document records the
> revert and the root-cause investigation. **No replacement optimization is implemented here.**

## 1. Regression symptoms (as reported)

- All celestial-body memory nodes disappeared from the rendered Galaxy.
- Their connecting link lines disappeared.
- Soumaya's ship kept flying/orbiting as if the objects were still there.
- Galaxy motion became noticeably faster.

## 2. The revert

**Restored exactly**, `packages/web/src/graph/Graph3D.tsx:983-997` (the force-configuration
block, one line context above/below unchanged):

```ts
fg.d3Force("charge")?.strength(0);
fg.d3Force("center", null);
fg.d3Force("link")?.strength(0);
```

This is a byte-for-byte restoration of the pre-`e7bc375` behavior — `charge` back to
`.strength(0)`, `link` back to `.strength(0)`, `center` unchanged (it was never part of the
regression). Only the surrounding comment was rewritten, to record this regression and point at
this document — no other line in the file changed. Confirmed via `git diff` (reproduced in full
in §9) that this is the *only* change in the working tree.

## 3. Installed library versions (unchanged since the prior audit)

| Package | Version |
|---|---|
| `react-force-graph-3d` | 1.29.1 |
| `3d-force-graph` | 1.80.0 |
| `three-forcegraph` | 1.43.4 |
| `d3-force-3d` | 3.0.6 |

## 4. Root cause — CONFIRMED, direct source read

The prior audit correctly established that `charge`/`link`'s *physics output* (velocity/position)
is discarded for every node, because every node is pinned via `fx/fy/fz`. **What it missed**: the
`link` force has a **second, unrelated job** that has nothing to do with physics — it is the
mechanism that normalizes every link's `source`/`target` from a raw node ID into an actual node
object reference, and three-forcegraph's own rendering code depends on that normalization having
already happened.

**Step 1 — the normalization only happens when the link force calls `.links(...)`, and only the
link force does this.** `node_modules/d3-force-3d/src/link.js:55-70` (`initialize()`, invoked by
`force.links = function(_) { return arguments.length ? (links = _, initialize(), force) : links;
}` at line 103-105):

```js
function initialize() {
  ...
  var nodeById = new Map(nodes.map((d, i) => [id(d, i, nodes), d])), link;
  for (i = 0, count = new Array(n); i < m; ++i) {
    link = links[i], link.index = i;
    if (typeof link.source !== "object") link.source = find(nodeById, link.source);
    if (typeof link.target !== "object") link.target = find(nodeById, link.target);
    ...
  }
}
```

This mutates every link object **in place** — `link.source`/`link.target` (raw node IDs, as they
arrive from the server's `GraphData` JSON) are replaced with the *actual node object* (with live
`x/y/z`). This is standard, well-documented `d3-force` behavior — it is not specific to this
app, and it is not something any other part of this codebase re-implements for the *scene graph's
own copy* of the link objects, because there is only one copy: `graphData={data as any}`
(`Graph3D.tsx:2862`) passes the exact same array/objects both to the simulation and to
three-forcegraph's own rendering code, so this in-place mutation is the *only* place this
normalization ever happens, for the objects the renderer will read.

**Step 2 — this call is gated on the link force still existing.**
`node_modules/three-forcegraph/dist/three-forcegraph.mjs:1417-1423` (the `graphData` digest
cycle, runs on every `refresh()`):

```js
var linkForce = state.d3ForceLayout.force('link');
if (linkForce) {
  linkForce.id(function (d) { return d[state.nodeId]; }).links(state.graphData.links);
}
```

With `link` removed (`fg.d3Force("link", null)`), `state.d3ForceLayout.force('link')` returns
`undefined` (confirmed: `simulation.js:161-162`'s `force()` getter/setter — `null` deletes the
entry from the `forces` Map). `if (linkForce)` is then false, and **`.links(...)` — the only call
that ever normalizes `source`/`target` — never runs.** Every link object keeps its raw numeric
`source`/`target` forever.

**Step 3 — the renderer's own line-position code explicitly detects this and silently skips the
link**, rather than crashing. `node_modules/three-forcegraph/dist/three-forcegraph.mjs:763-771`
(inside `layoutTick()`, called every real frame per the prior audit):

```js
state.linkDataMapper.entries().forEach(function (_ref3) {
  var link = _ref3[0], lineObj = _ref3[1];
  if (!lineObj) return;
  var pos = isD3Sim ? link : ...;
  var start = pos['source'];   // = link.source — still a raw number, never resolved
  var end = pos['target'];     // = link.target — same
  if (!start || !end || !start.hasOwnProperty('x') || !end.hasOwnProperty('x')) return; // skip invalid link
  ...
});
```

A raw number is truthy, so `!start`/`!end` don't trigger — but a boxed `Number` has no `x`
property, so `!start.hasOwnProperty('x')` is `true`, and the function returns **before ever
writing a position into the link's line/cylinder geometry.** Each link's `BufferGeometry` was
created with a fresh `Float32Array(2*3)` position attribute (`three-forcegraph.mjs:1225-1227`),
which **defaults to all zeros** — so every link renders as a **zero-length line at the world
origin**: not merely dim or mispositioned, but a true degenerate point, indistinguishable from
"gone." **This fully and directly explains the reported "connecting lines disappeared" — no
exception, no crash, just silent, confirmed omission.**

## 5. GraphData → force → rendering lifecycle (as it actually runs, with `link` force removed)

```
App.tsx refresh() -> setData(g) [new {nodes, links}]
  -> graphData prop changes -> hasAnyPropChanged(['graphData',...]) fires
    -> d3ForceLayout.stop().alpha(1).nodes(newNodes)     [runs regardless of link force]
    -> linkForce = d3ForceLayout.force('link')            [= undefined, since removed]
    -> if (linkForce) { ... }                             [SKIPPED — no source/target resolution]
    -> resetCountdown()
  -> every real animation frame (3d-force-graph's own rAF loop):
    -> tickFrame() -> layoutTick()
       -> state.layout.tick()                              [fine: forces Map is empty, no-op]
       -> node position sync (nodeDataMapper)               [fine: nodes don't depend on links]
       -> link position sync (linkDataMapper)
          -> start = link.source (raw id, never resolved)
          -> start.hasOwnProperty('x') === false -> return  [CONFIRMED: link never positioned]
```

**Where the visual graph depends on the force graph's internal state**: exactly at the single
point above — the link-position-sync step's `start`/`end` variables are read directly off the
link object that the *link force's own `.links()` call* is the sole normalizer for. Node
rendering has no equivalent dependency (§6).

## 6. Why nodes disappeared too — DERIVED, not fully confirmed

This is the one part of the regression this audit could **not** pin to a single confirmed line
of code, and it is reported honestly as such rather than rationalized away.

**What was ruled out, confirmed by direct reading:**
- Node position sync (`three-forcegraph.mjs:736-756`) reads the node object directly (`pos =
  node`), which is `orbits.ts`'s own pinned `x/y/z` — **this has no dependency on link-force
  normalization at all.** A node's own position should be computed correctly regardless of the
  link force's state.
- `orbits.ts`'s own topology-building (`rebuild()`) already defensively handles both raw-id and
  resolved-object link endpoints (`typeof l.source === "object" ? l.source.id : l.source`,
  confirmed present in the file read during the memory-scaling audit) — it does not break.
- Every link-reading call site inside `Graph3D.tsx` itself (`linkColor`, `linkWidth`,
  `shouldRenderLink`, `getLinkActivity`, the "coldest links" tending scan, the cluster/lens
  filters, etc. — grepped exhaustively) uniformly goes through a defensive `linkEnd(l.source)`/
  `linkEnd(l.target)` helper that already tolerates a raw id — **none of this app's own code is a
  plausible throw site.**
- The link *object-creation/material* digest cycle (`three-forcegraph.mjs:1210-1295`,
  `onCreateObj`/`onUpdateObj`) calls Graph3D.tsx's own `linkColor`/`linkWidth` accessors, which
  are confirmed defensive (above) — also not a plausible throw site.

**The best-supported remaining hypothesis** (DERIVED from the confirmed architecture in the prior
audit, not independently verified against a live stack trace): `3d-force-graph`'s own animation
loop (`3d-force-graph.mjs:261-271`, `_animationCycle`) runs `tickFrame()` and
`renderObjs.tick()` (the actual `renderer.render()` call) **synchronously, in that order, inside
one function**, and only re-schedules itself (`requestAnimationFrame(this._animationCycle)`) as
the *last* statement in that function. If **anything** inside that call throws an uncaught
exception — a candidate not fully traced in this pass is the **arrow** or **particle** digest
cycles (`three-forcegraph.mjs:1297+`, not read in full during this pass — `linkDirectionalArrowLength`
defaults to 0 and is unused here, but `linkDirectionalParticles` **is** configured in this app,
`Graph3D.tsx:2981-2986`, so that digest cycle *does* run every relevant frame) — then:
- `renderObjs.tick()` (the render call) never executes for that frame.
- The next `requestAnimationFrame(this._animationCycle)` is never scheduled, since it's the line
  *after* the throwing call.
- **The entire library-owned render loop stops, permanently**, on the first frame this happens.

This would explain all three remaining symptoms at once, consistently:
- **Nodes never render (or freeze)**: nothing calls `renderer.render()` again after the failing
  frame, so the canvas simply stops updating — whatever WebGL last drew (nothing yet, if this
  happens on the very first tick after the reheat, which is likely given every `refresh()`
  reheats and re-normalizes) is all that's ever shown.
- **Soumaya keeps moving**: Soumaya's ship object and its motion are driven entirely by
  `Graph3D.tsx`'s **own, separate** `requestAnimationFrame(tick)` loop (`Graph3D.tsx:1185`), which
  the prior audit already established is completely independent of `3d-force-graph`'s loop. This
  loop is not touched by an exception inside the *other* loop, so it keeps running.
- **Movement looks faster**: with `3d-force-graph`'s loop dead, `renderer.render()` — one of the
  most expensive operations in the whole app — never runs again. `Graph3D.tsx`'s own loop is no
  longer sharing the frame with that cost, so its `requestAnimationFrame` callbacks can fire at a
  higher real cadence, advancing Soumaya's `dt`-based motion more times per real second than
  before.

**Classification: DERIVED, plausible and internally consistent with every observed symptom, but
NOT independently confirmed against an actual thrown error or stack trace** — this sandbox has no
browser, so the exact throwing line (if this hypothesis is correct) could not be identified.
Flagged explicitly as the next investigation (§8), not asserted as proven fact.

## 7. What the previous audit got right and wrong

**Confirmed correct**: `charge`'s and `link`'s *physics* output (accumulated velocity from the
force computation) was and remains fully discarded for every node, because every node is pinned
via `fx/fy/fz`. Removing `charge` alone changes nothing about this — `forceManyBody` has no
side effect other than writing to `node.vx/vy/vz`, which pinned nodes ignore. This part of the
prior audit's reasoning holds.

**Previously believed but now disproven**: that "the output is discarded, therefore removing the
force changes zero rendered pixels." This conflated the *physics* output (correctly identified as
inert) with the `link` force's *unrelated, load-bearing side effect* — resolving `source`/`target`
from raw IDs into node object references, which the renderer's own link-position code directly
and unconditionally depends on. **This dependency exists only for `link`, not for `charge` or
`center`** — neither of the other two forces does any equivalent id-to-object resolution.

**New finding**: `three-forcegraph`'s rendering code is not actually independent of the force
simulation's internal state, as the prior audit assumed when it said Lens/View/culling never
touch simulation membership (that specific claim about *visibility* remains true and unrelated) —
specifically, the **link rendering path has a real, undocumented-in-this-repo dependency on the
link force's normalization side effect**, which is a detail of `d3-force`'s own conventional API
(the link force doubles as "the thing that resolves link endpoints") that has nothing to do with
physics and was not something the force-simulation audit's evidence-gathering surfaced, because
that audit was scoped to CPU cost, not rendering correctness.

## 8. Is a safe optimization still possible? What should be investigated next?

**Yes, narrower than what was attempted.** The confirmed root cause is specific to the **`link`**
force's id-resolution side effect — **`charge` has no equivalent dependency.** `forceManyBody`'s
only job is writing to node velocity, which is already fully discarded (§4/§7). Nothing in
`three-forcegraph`'s rendering code reads anything `forceManyBody` produces or resolves.

**Next isolated investigation (not implemented in this task, per the stop condition):**
1. Confirm, with real browser devtools (console errors + a `performance.now()` frame-rate check),
   whether §6's "uncaught exception kills the shared render loop" hypothesis is actually what
   happened — this is the one piece of this regression that remains genuinely unconfirmed, and it
   matters: if true, it means the app currently has **zero resilience to a single bad frame** in
   `3d-force-graph`'s own loop (any future exception there, unrelated to this specific change,
   would silently and permanently freeze the Galaxy) — a latent robustness gap worth knowing about
   independent of any future optimization attempt.
2. If a future attempt revisits force removal, test **`charge`-only removal** (`fg.d3Force("charge",
   null)`, leaving `fg.d3Force("link")?.strength(0)` exactly as it is today, untouched) as its own
   fully isolated change, with real on-device visual verification *before* committing — not
   assumed safe from source-reading alone a second time, given this exact experience.

## 9. Validation

- **Typecheck** (`npm run typecheck -w @brain/web`): clean.
- **Web test suite** (`packages/web`, `npx vitest run`): 53 test files, 360 tests, all passing —
  identical to the pre-regression baseline (no test file was touched by the original change or
  this revert).
- **Build** (`npm run build -w @brain/web`): succeeded.
- **`git diff --stat`** (before committing this revert + audit doc): `packages/web/src/graph/Graph3D.tsx
  | 16 ++++++------------` (comment rewritten, 3 call sites restored) plus this new document.
- **`git status`**: only `Graph3D.tsx` (modified) and this document (new) — no unrelated files.
- **Runtime/visual verification**: **not possible in this sandbox — no browser/WebGL access.**
  The revert restores the exact pre-`e7bc375` source (confirmed via diff, §2), and the pre-`e7bc375`
  state is the one that was in production use before this regression was ever introduced, so
  restoring it is expected to restore the known-good visual behavior — but this could not be
  confirmed by actually looking at a rendered frame in this environment.
