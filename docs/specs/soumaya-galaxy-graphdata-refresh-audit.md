# Soumaya Galaxy — GraphData Refresh/Diff Lifecycle Audit

> **MODE: AUDIT ONLY.** No source code was changed to produce this document. Continues the
> Galaxy Performance Program after the validated charge-force removal
> (`ca04b0a`/`d24f7cc`). Traces the complete `graphData` refresh/diff lifecycle from
> `Graph3D.tsx` through `react-force-graph-3d` → `3d-force-graph` → `three-forcegraph` →
> `data-bind-mapper`, to determine whether refreshes do unnecessary work when the underlying
> graph hasn't meaningfully changed. Status: **audit complete — no implementation.**

## 1. Executive summary

**The audit found something more severe than the question it set out to answer.** The original
question was "does replacing the `graphData` object cause unnecessary rebuild work when the data
hasn't meaningfully changed?" — the answer to that is yes, confirmed, but bounded and relatively
cheap (§9). **The more serious, newly-confirmed finding is that the mechanism guarding against
that waste (a real, correct, id-keyed object cache inside `three-forcegraph` itself) can be
silently wiped far more often than `graphData` actually changes — by ordinary React re-renders of
`Graph3D` and by four existing, already-shipped `fgRef.current?.refresh?.()` call sites already in
this codebase, one of which fires on a ~250ms throttle during ordinary camera movement — and that
wipe disposes shared, refcounted GPU resources (`geometryCache`, `labelTexCache`, `glowTexCache`)
that Graph3D.tsx's own `nodeThreeObjCacheRef` has no visibility into, creating a real risk of
handing out already-disposed Three.js objects.**

Concretely, in order of how the pieces connect:
1. `three-forcegraph`'s own node/link object cache (`ThreeDigest`, built on `data-bind-mapper`'s
   `DataBindMapper`) is a genuine, correct, **persistent, id-keyed** diff structure — confirmed by
   reading its full source (§5/§6). Unchanged node/link ids are reused across `digest()` calls;
   only new ids create new Object3Ds, and only removed ids get disposed.
2. **However, that cache can be wiped wholesale (`.clear()` → `digest([])`, disposing every
   currently-tracked object) by two triggers unrelated to whether the actual graph data changed**:
   (a) the `nodeThreeObject`/`linkThreeObject`/`linkWidth` **props changing by reference**
   (`three-forcegraph.mjs:1129-1131,1199-1201`) — and Graph3D.tsx passes all of these as **inline,
   unmemoized arrow functions** (confirmed, §4), which `react-kapsule`'s prop-sync layer detects
   as "changed" via strict `!==` on **every React render of `<Graph3D>`**, not just data changes
   (confirmed, §4); and (b) the library's own `.refresh()` method (`fg.refresh()` →
   `state._flushObjects = true; state._rerender()`), which is **already called from four places
   inside `Graph3D.tsx`'s own code today** (§3), independent of any `graphData` replacement.
3. **The disposal that `.clear()` triggers is a blind, non-refcounted `_deallocate()`** that calls
   `.dispose()` directly on a node's geometry, material, and `material.map` (texture) — confirmed,
   §8 — with **no awareness of `nodeObject.ts`'s own shared, refcounted `geometryCache`/
   `labelTexCache`/`glowTexCache`**, and no awareness of Graph3D.tsx's own separate
   `nodeThreeObjCacheRef`. Because Graph3D.tsx's cache is a completely independent data structure
   the library never touches, **after a `.clear()`, Graph3D.tsx's own cache can hand back an
   Object3D whose geometry/material/texture the library just disposed moments earlier in the same
   synchronous call**, since nothing tells `nodeThreeObjCacheRef` that happened.

This is the largest confirmed risk in this lifecycle (§9, §10) — not primarily a CPU-cost finding
(though it is also that), but a **correctness risk**: shared-resource disposal happening outside
the one system (`releaseNodeTextures`) built specifically to make that safe.

## 2. Current GraphData lifecycle (recap, re-confirmed in this pass)

**CONFIRMED**, matches the memory-scaling and force-simulation audits exactly, re-verified by
re-reading the cited lines in this pass:
- `graphData={data as any}` (`Graph3D.tsx:2862` in the pre-charge-removal numbering; unchanged by
  the charge-only edit) passes the full, unfiltered `data` state.
- `App.tsx`'s `refresh()`/`getGraph()` (called at boot, on node-focus navigation, and from several
  `onChanged`/`onPromoted`/`onAnswered` callbacks) always builds a **brand-new** `{nodes, links}`
  object via `setData(g)` — never a mutation of the previous object.
- `three-forcegraph.mjs:456-463`'s `graphData` prop `onChange` immediately sets
  `state.engineRunning = false` on ANY reference change.
- `three-forcegraph.mjs:1400-1483`'s digest cycle, gated on `hasAnyPropChanged(['graphData',
  ...])`, re-feeds `.nodes()`/`.links()` into the (persistent) `d3ForceLayout` and unconditionally
  calls `.alpha(1)` — a full reheat, regardless of whether the new data differs from the old.

## 3. Refresh triggers — the full set, not just `graphData`

This audit's brief was "graphData refresh," but tracing `three-forcegraph`'s actual
`update(state, changedProps)` function (§5) shows **`graphData` identity is only one of several
independent things that can force a full re-digest.** Every trigger found:

| Trigger | Mechanism | Frequency (confirmed cadence where known) |
|---|---|---|
| `App.tsx` `refresh()`/`getGraph()` | New `graphData` object → `hasAnyPropChanged(['graphData',...])` | Event-driven: boot, node-focus, several `onChanged`/`onPromoted`/`onAnswered` callbacks (Round 3 audit) |
| React re-render of `<Graph3D>` with any inline prop (`nodeThreeObject`, `linkThreeObject`, `linkWidth`, and in practice almost every other function/object prop passed to `<ForceGraph3D>`) | `react-kapsule`'s per-render `prevPropsRef.current[p] !== props[p]` reference check (`react-kapsule/dist/react-kapsule.js:211-218`) calls the underlying setter for every prop whose reference changed since last render — **CONFIRMED to run synchronously on every render, not gated by a dependency array** | As often as `Graph3D` itself re-renders — **CONFIRMED not memoized** (`Graph3D.tsx:153`, plain `forwardRef`, no `React.memo`) |
| `fgRef.current?.refresh?.()` — camera-movement-driven link-style refresh | `Graph3D.tsx` tick loop, throttled: fires when camera distance moved >35 units AND ≥250ms since the last fire | **Up to ~4×/second during sustained camera movement/zooming** — the single most frequent trigger found |
| `fgRef.current?.refresh?.()` — `fireLink()` | Called whenever a link is "tended"/pulsed (a periodic ~10s scan per the tick loop's `repairScanT` cadence, plus on-demand for freshly-created links) | Roughly every ~10s at minimum, more often during active new-memory ingestion |
| `fgRef.current?.refresh?.()` — first-ever link load | Once, when `linksInitedRef` first becomes true | Once per mount |
| `fgRef.current?.refresh?.()` — after satellite beacon dispatch | Fires alongside an achievement-check side effect | Occasional, tied to beacon deployment events |

**`refresh()`'s own implementation** (`three-forcegraph.mjs:692-696`): `state._flushObjects =
true; state._rerender(); return this;` — and `state._rerender` is **the kapsule's own `digest`
method itself** (`node_modules/kapsule/dist/kapsule.js:673`, `state._rerender = digest`), so this
call is a **direct, synchronous** invocation of the exact same `update(state, changedProps)`
function the `graphData` path uses — not a scheduled/batched operation.

## 4. React → react-force-graph-3d → 3d-force-graph → three-forcegraph flow (the new finding)

**CONFIRMED, `node_modules/react-kapsule/dist/react-kapsule.js:210-218`** (the code that runs on
every render of the `forwardRef` component `react-force-graph-3d`'s `ForceGraph3D` is built from):

```js
var prevPropsRef = React.useRef({});
Object.keys(omit(props, [...methodNames, ...initPropNames]))
  .filter(function (p) { return prevPropsRef.current[p] !== props[p]; })
  .forEach(function (p) { return _call(p, props[p]); });
prevPropsRef.current = props;
```

This runs **directly in the component's render body — not inside a `useEffect`** — so it executes
on every single render, comparing every non-method prop by strict reference (`!==`) against the
*previous render's* value, and calling the underlying kapsule setter (`comp[p](props[p])`, which
ultimately reaches `three-forcegraph`'s own `update()`) for every prop whose reference changed.

**CONFIRMED, `Graph3D.tsx`**: `nodeThreeObject={(node: any) => {...}}`, `linkColor={(l: any) =>
{...}}`, `linkWidth={...}`, `linkDirectionalParticles={...}`, and every other function-valued prop
passed to `<ForceGraph3D>` are written as **inline arrow function literals directly in JSX** — not
wrapped in `useCallback`. Grepped for `useCallback`/`useMemo` near these prop definitions and
found none. **Every one of these props therefore has a new reference on every render of
`Graph3D`.**

**CONFIRMED, `Graph3D.tsx:153`**: `export const Graph3D = forwardRef<Graph3DHandle, Props>(function
Graph3D(...` — a plain component, **not wrapped in `React.memo`** (this specific gap was already
flagged, unfixed, in the Round 2 performance audit as a general finding; this audit connects it to
a much more concrete, severe consequence).

**Chained together**: any re-render of `Graph3D` (from its own state changes, or from its parent
re-rendering without `React.memo` blocking the cascade) → every inline function prop gets a new
reference → `react-kapsule` calls the corresponding kapsule setter for each → `three-forcegraph`'s
`update()` sees `nodeThreeObject`/`linkThreeObject`/`linkWidth` in `changedProps` →
`nodeDataMapper.clear()` / `linkDataMapper.clear()` fire (§5, §6) — **a full node+link Object3D
wipe, independent of whether `graphData` itself changed at all.**

## 5. Node identity/diff behavior

**CONFIRMED, full read of `node_modules/data-bind-mapper/src/index.js`** (the actual generic
diff engine `ThreeDigest` extends):

```js
digest(data) {
  data.filter(d => !this.#dataMap.has(this.#id(d))).forEach(d => {
    const obj = this.#createObj(d);
    this.#dataMap.set(this.#id(d), obj);
    this.#objMap.set(obj, d);
  });
  const dataIdsMap = new Map(data.map(d => [this.#id(d), d]));
  this.#dataMap.forEach((o, dId) => {
    if (!dataIdsMap.has(dId)) { this.#removeObj(o, dId); this.#dataMap.delete(dId); this.#objMap.delete(o); }
    else { this.#updateObj(o, dataIdsMap.get(dId)); }
  });
}
```

- **Node identity** is determined by `#id`, an accessor set via `.id(fn)` — for the node mapper
  this is (by the standard `nodeId` prop default, `'id'`, confirmed unmodified in `Graph3D.tsx`)
  each node's own `id` field.
- **`#dataMap`/`#objMap` are private instance fields that persist across `digest()` calls** — this
  is not rebuilt from scratch each time; it is the actual state carried between refreshes.
- **An id already in `#dataMap` is never recreated** — only `#updateObj(existingObj, newData)` is
  called (a lightweight geometry/material touch-up per `three-forcegraph.mjs:1153-1180`'s
  `onUpdateObj`, not a rebuild) — **confirming unchanged nodes ARE genuinely reused, by design, as
  long as the map itself hasn't been wiped (§4).**
- A node id absent from the new `data` array is disposed (`#removeObj` → `three-forcegraph`'s
  wrapper → `scene.remove(obj); _deallocate(obj);`, §8) and dropped from both maps.
- **`clear()` is `digest([])`** (`data-bind-mapper/src/index.js:48-51`) — passing an empty array
  means *every* currently-tracked id is treated as removed, disposing every object in one pass.

## 6. Link identity/diff behavior

**CONFIRMED, mirrors §5 exactly** via `state.linkDataMapper` (a second, independent
`ThreeDigest`/`DataBindMapper` instance). Link identity is the link's own reference/id as
determined by the mapper's `.id(...)` accessor (three-forcegraph sets this internally for link
objects, consistent with how it later reads `link.source`/`link.target` post-normalization —
tangential to this audit's scope, already covered by the force-removal regression audit).
`linkDataMapper.clear()` is gated at `three-forcegraph.mjs:1199-1201` by `hasAnyPropChanged([
'graphData', 'linkThreeObject', 'linkThreeObjectExtend', 'linkMaterial', 'linkColor', 'linkWidth',
'linkVisibility', ...])` **or** `state._flushObjects`, **but the actual `.clear()` call is only
reached if the narrower condition `hasAnyPropChanged(['linkThreeObject', 'linkThreeObjectExtend',
'linkWidth'])` or `state._flushObjects`** (`three-forcegraph.mjs:1199-1201`). `linkWidth` is
confirmed to be an inline function in `Graph3D.tsx` (§4), so this is defeated by the same
every-render mechanism as nodes.

## 7. Simulation/reheat behavior (recap, cross-referenced)

**CONFIRMED, already established in the force-simulation audit, re-cited not re-derived**:
`graphData` replacement unconditionally calls `.stop().alpha(1)` on the (persistent)
`d3ForceLayout`, resetting the cooldown countdown, regardless of whether the actual node/link
content differs. **New in this pass**: `refresh()`'s `_flushObjects` path does **not** itself set
`engineRunning = false` or reheat alpha — it only affects the *object-digest* gates (§5, §6), not
the simulation-reheat gate (which is keyed specifically on the `graphData` prop's own `onChange`
and the `hasAnyPropChanged(['graphData', ...])` block, a **different, narrower** condition than
the object-digest clears). **So the four `.refresh()` call sites in §3 do NOT reheat the
simulation** — only genuine `graphData` prop replacement does that. This is a meaningful
distinction the mission's framing didn't separate: object-cache wiping and simulation reheating
are gated by *different* conditions, and the more frequent trigger (camera-movement refresh) only
hits the cheaper, non-reheating path — but still hits the disposal risk in §8/§9.

## 8. Object3D/cache interaction — the confirmed disposal risk

**CONFIRMED, `three-forcegraph.mjs:231-244`**:
```js
var _deallocate = function deallocate(obj) {
  if (obj.geometry) obj.geometry.dispose();
  if (obj.material) _materialDispose(obj.material);
  if (obj.texture) obj.texture.dispose();
  if (obj.children) obj.children.forEach(_deallocate);
};
var _materialDispose = function materialDispose(material) {
  if (material instanceof Array) material.forEach(_materialDispose);
  else { if (material.map) material.map.dispose(); material.dispose(); }
};
```
This is a **blind, unconditional, recursive** disposal — it walks every child of a removed
Object3D and calls `.dispose()` on every geometry, material, and material texture it finds, with
**no refcounting and no knowledge of `nodeObject.ts`'s shared caches.**

**CONFIRMED, `nodeObject.ts`** (re-cited from the memory-scaling and cache-key audits): a node's
`THREE.Group` contains a main-body mesh whose **geometry is shared** (`geometryCache`, keyed by a
small, bounded `type-size-segments` key — the SAME `BufferGeometry` instance is reused across
every node of a given celestial tier), a glow sprite whose **texture is shared** (`glowTexCache`),
and a label sprite whose **texture is shared** (`labelTexCache`) — all three explicitly designed
to be reference-counted and released only via `releaseNodeTextures()`, precisely because a naive
per-object dispose would break every *other* live object still pointing at the same shared
resource.

**The confirmed gap**: when `three-forcegraph`'s own `nodeDataMapper.clear()` fires (§4), it calls
`onRemoveObj` (→ `_deallocate`) on every currently-tracked node Group — disposing the shared
geometry and shared label/glow textures **directly**, bypassing `releaseNodeTextures()`'s refcount
accounting entirely, because the library has no idea these resources are shared or refcounted.
**Immediately afterward, in the same synchronous `update()` call, the SAME node ids are
re-digested as "new"** (`.digest(state.graphData.nodes.filter(visibilityAccessor))` runs right
after the clear, `three-forcegraph.mjs:1181`), calling `onCreateObj` → `Graph3D.tsx`'s own
`nodeThreeObject` callback → which checks **`nodeThreeObjCacheRef`, a completely separate Map
Graph3D.tsx owns itself, that the library's `.clear()` call never touches or is even aware of.**
If that cache still holds an entry with a matching key for this node id (likely, since nothing
about the node's own *data* changed — only the library's internal map was wiped), **Graph3D.tsx
hands back the exact same Object3D reference whose geometry/material/texture was just disposed a
moment earlier in the same call stack**, because nothing ever told `nodeThreeObjCacheRef` that
disposal happened.

**Classification: CONFIRMED mechanism** (every step traced to an exact line of installed source);
**DERIVED, not runtime-verified, consequence** (the plausible/likely visible result — a node
rendering with a freed geometry/texture — was not confirmed on an actual GPU/browser, since none
is available here; three.js's own `dispose()` behavior on an in-flight-bound buffer, and whether
the very next frame's `renderer.render()` call would visibly glitch, error, or silently reference
a still-valid-until-GC'd resource, is genuinely **UNKNOWN without runtime verification**).

## 9. Confirmed unnecessary work — direct answers to the 10 required questions

1. **Does Galaxy replace the entire GraphData object on refresh?** CONFIRMED yes (§2).
2. **How often can that happen?** DERIVED/mixed: the `graphData`-replacing path is event-driven
   and relatively infrequent (Round 3 audit); the **object-cache-wiping path is much more
   frequent** — up to ~4×/second during camera movement (§3), and potentially on every
   unmemoized React re-render of `Graph3D` (§4, frequency itself UNKNOWN without runtime
   profiling of how often `Graph3D`'s own state/props actually change in a live session).
3. **Are unchanged nodes actually reused internally?** CONFIRMED yes, *when the id-keyed map
   isn't wiped* (§5) — but CONFIRMED that the map **can be, and by design already is,** wiped by
   triggers unrelated to whether the node's own data changed (§4, §8).
4. **Are unchanged links actually reused internally?** Same answer, mirrored (§6).
5. **Does a wholesale graphData replacement trigger simulation reheating?** CONFIRMED yes,
   unconditionally, regardless of content (§2, §7) — re-confirming the force-simulation audit.
6. **Does it cause unnecessary Object3D rebuilds despite our node cache?** CONFIRMED yes, and the
   mechanism is worse than "rebuild" — it's a **dispose of a resource our own cache doesn't know
   was disposed**, then a **reuse of the now-invalid reference** (§8) — this is the audit's
   central finding.
7. **Does it cause unnecessary link/material/label work?** CONFIRMED yes, mirrored for links (§6),
   and for every node's shared label/glow texture (§8).
8. **Are there refreshes where the underlying graph is unchanged but the entire graphData pipeline
   still executes?** CONFIRMED yes — `hasAnyPropChanged` is a **reference-identity** check, not a
   content diff; a `graphData` prop replaced with a value that is *content-identical* to the
   previous one still re-triggers the full digest/reheat cycle (§2), and the four `.refresh()`
   call sites (§3) execute the full node+link clear/rebuild regardless of whether anything visible
   actually needs it.
9. **What is the largest confirmed CPU/GPU cost caused by this lifecycle?** The camera-movement-
   throttled `.refresh()` call (§3) is the largest **confirmed-frequent** trigger of a full
   node+link Object3D dispose-and-rebuild cycle (§8) — up to ~4×/second during ordinary
   interaction, for the entire visible node/link set (bounded at ≤300 nodes per the memory-scaling
   audit), each time paying the disposal + `onCreateObj`/`makeNodeObject`-cache-lookup +
   `onUpdateObj` cost for every node and every link. The React-re-render-driven trigger (§4) is
   **potentially even more frequent** but its real-world rate is UNKNOWN without runtime
   profiling.
10. **What is the smallest safe optimization that could address it?** See §11 — **not
    implemented in this audit.**

## 10. Risk/regression findings

- **P0 — correctness risk, not yet runtime-confirmed**: the disposal/reuse desync in §8. This is
  the standout finding of this audit — a genuine, evidence-backed possibility that the Galaxy
  already silently hands out stale Three.js object references after ordinary camera movement,
  independent of any future optimization. It was not caused by this session's own recent changes
  (charge/link/center force work, entropy-bucketing cache-key work) — it is a **pre-existing**
  property of how `Graph3D.tsx`'s own `nodeThreeObjCacheRef` was layered on top of
  `three-forcegraph`'s object model, exposed by tracing the full lifecycle for this audit.
- **P1 — confirmed unnecessary reheat-on-identical-data** (§2, §9 Q8): a `refresh()` that returns
  byte-for-byte the same graph still pays the full digest+reheat cost, because the guard is
  reference identity, not content equality.
- **P1 — confirmed camera-movement-driven full clear/rebuild cadence** (§3, §9 Q9): the highest-
  frequency confirmed trigger of the §8 mechanism, already shipping in the codebase today (not
  something this audit is proposing — it already exists, presumably added for a legitimate reason:
  keeping link curvature/opacity zoom-bias visually live, per its own comment).
- **P2 — unmemoized inline props on `<ForceGraph3D>`** (§4): the structural root cause connecting
  ordinary React re-renders to the same wipe mechanism; `Graph3D` lacking `React.memo` was already
  flagged (unfixed) in the Round 2 audit as a general concern — this audit gives it a concrete,
  severe mechanism rather than a generic "extra render" cost.
- **P3 — informational**: the fact that object-cache-wiping and simulation-reheating are gated by
  *different* conditions (§7) is useful context for any future fix — a fix targeting one does not
  automatically fix the other.

## 11. Recommended next optimization, if justified (not implemented)

**Not decided or implemented in this audit**, per its audit-only scope. The evidence points at two
independent, separately-scoped candidates for a *future* task, in order of what the evidence
supports most strongly:
1. **Close the P0 desync directly**: make `Graph3D.tsx`'s `nodeThreeObjCacheRef` (and its link
   equivalent, if one exists) aware of `three-forcegraph`'s own `onRemoveObj`/`.clear()` calls —
   e.g., by hooking cleanup logic to whatever removal path fires, or by re-verifying an Object3D's
   geometry/material haven't been disposed before trusting a cache hit. This is a correctness fix,
   not a performance one, and the highest-priority candidate given §8/§10's P0.
2. **Memoize the inline props** (`nodeThreeObject`, `linkColor`, `linkWidth`,
   `linkDirectionalParticles`, etc.) with `useCallback`/`useMemo` so their references only change
   when their actual dependencies change, closing the §4 mechanism at its root. This would also
   very likely reduce how often the P0 risk is exercised, without touching *what* gets rendered.
3. A content-diff guard before feeding a new `graphData` object into `<ForceGraph3D>` (skip the
   replacement if the new nodes/links are equal to the current ones) would close §9 Q8 directly,
   but is a larger, more architecturally invasive change than 1 or 2, and wasn't the audit's
   strongest finding.

No numeric benefit is claimed for any of these — none can be measured without a live browser.

## 12. What must NOT be changed (carried forward, unaffected by this audit's findings)

- The `link` force must remain `fg.d3Force("link")?.strength(0)` — never removed. Nothing in this
  audit's findings changes that conclusion; the disposal risk in §8 is unrelated to the d3 force
  configuration.
- `charge` stays removed (`fg.d3Force("charge", null)`) — validated separately, unaffected by this
  audit.
- `center` stays removed — unaffected.
- Orbit positioning (`orbits.ts`, `fx/fy/fz`), `tickFrame()`, `engineRunning`, `cooldownTicks`/
  `cooldownTime`, `alpha`/`alphaDecay`, LOD, frustum culling, glow, lighting, labels, materials,
  adaptive quality, FPS cap, and camera behavior were all read only as needed to trace this
  lifecycle — **none were modified**, and this audit found no reason any of them need to be.

## 13. Runtime validation still required

**No browser/WebGL access is available in this sandbox** — every finding above is a direct read of
installed source (`data-bind-mapper`, `three-forcegraph`, `3d-force-graph`, `react-kapsule`,
`react-force-graph-3d`) and this repo's `Graph3D.tsx`/`App.tsx`, never a runtime measurement.
Specifically still unconfirmed and requiring a real device/browser:
- Whether the §8 disposal/reuse desync produces a **visible** glitch (a flash of broken geometry,
  a console WebGL warning, or nothing perceptible because the GPU buffer stays valid until the
  next allocation) — this is the single most important open question this audit surfaces.
- The real-world frequency of `Graph3D` React re-renders in a live session (§4, §9 Q2/Q9) — this
  audit found the *mechanism* but not a measured rate.
- Any real timing (ms) for a full node+link clear/rebuild cycle at the ≤300-node cap.
- Whether `renderer.info`/PerfHUD (already instrumented per Stage 0) would show a
  `programs`/`geometries`/`textures` count spike coinciding with camera-movement-triggered
  `.refresh()` calls — a cheap, existing-instrumentation check worth running on-device before any
  fix is attempted, to confirm the P0 risk manifests visibly before spending effort closing it.

---

## Validation

- **No source code changed.** `git status --porcelain` / `git diff --stat` (run after writing this
  document, before committing) show only this new file.
- Ran the existing relevant checks to confirm the tree stays clean: `npm run typecheck -w
  @brain/web` and `npm run test -w @brain/web` — reported in the accompanying chat response.
- No tests were added — this audit required no behavior change to inspect; every finding came from
  reading installed library source and this repo's existing `Graph3D.tsx`/`App.tsx` directly.
