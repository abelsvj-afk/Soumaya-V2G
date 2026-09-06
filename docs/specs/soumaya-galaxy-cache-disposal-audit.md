# Soumaya Galaxy — Node Object Cache / Disposal Desync Audit (P0 Deep-Dive)

> **MODE: AUDIT ONLY.** No source code was changed to produce this document. Follows the
> graphData refresh/diff audit (`0eaf0be`,
> [`soumaya-galaxy-graphdata-refresh-audit.md`](./soumaya-galaxy-graphdata-refresh-audit.md)),
> which flagged a P0 correctness risk as source-confirmed-mechanism but runtime-unverified. This
> document traces the exact synchronous call sequence to determine whether the desync is
> actually reachable, not merely plausible. Status: **audit complete — no implementation.**

## 1. Executive summary

**The P0 is CONFIRMED, not merely plausible — traced to a single, gap-free, synchronous call
sequence with no async boundary, no re-check, and no existing guard that would prevent it.**

When `three-forcegraph`'s `nodeDataMapper.clear()` fires (from either of the two triggers already
identified in `0eaf0be`), it disposes every currently-tracked node's Object3D **and then, in the
very same synchronous `update()` call, immediately re-digests the identical node array**, calling
`Graph3D.tsx`'s own `nodeThreeObject` callback again for every node. Because that callback's cache
key is computed purely from the node's *data* (label/importance/degree/bucketed-entropy/color/
kind) — none of which changed, since only the library's internal bookkeeping was wiped —
`nodeThreeObjCacheRef` reports a cache **hit** and returns the exact same Group instance whose
children's geometry/material/texture were disposed a few statements earlier in the identical call
stack. That stale Group is then handed straight back to `three-forcegraph`, which re-adds it to
the live scene via `scene.add(obj)`. **No code anywhere in this chain checks whether the object
survived the disposal it just went through.**

The smallest safe remediation this audit identifies does **not** require any change to
`three-forcegraph`, any new library hook, or any disposal-flag introspection (which this audit
also confirms is not available in installed Three.js 0.182.0 — `dispose()` only ever dispatches an
event, never sets a flag). It requires checking one already-guaranteed, already-observable
structural fact: `_deallocate`'s caller always calls `scene.remove(obj)` **before** disposing —
so a cached Group whose `.parent` is `null` at the moment of a cache-hit check is proof, without
needing any Three.js-internal knowledge, that the library has already torn it down.

## 2. Exact Object3D ownership chain

**CONFIRMED**, tracing `Graph3D.tsx`'s `nodeThreeObject` prop through to `three-forcegraph`'s
`ThreeDigest`:

```
Graph3D.tsx nodeThreeObject={(node) => {
  const cacheKey = nodeVisualCacheKey(node);
  const cached = nodeThreeObjCacheRef.current.get(node.id);
  if (cached && cached.key === cacheKey) { obj = cached.obj; }
  else { ...releaseNodeTextures/disposeObject3D on old...; obj = makeNodeObject(node, tier); nodeThreeObjCacheRef.current.set(node.id, {obj, key}); }
  return obj;
}}
    ↓ (passed as the `nodeThreeObject` prop)
three-forcegraph.mjs:1120-1182 update()'s node digest cycle:
  var customObjectAccessor = accessorFn(state.nodeThreeObject);   // wraps our function so calling it invokes our callback
  state.nodeDataMapper.onCreateObj(function (node) {
    var customObj = customObjectAccessor(node);                  // == our callback's return value, i.e. our Group
    if (customObj && state.nodeThreeObject === customObj) {      // false: customObj is an Object3D, never === the function itself
      customObj = customObj.clone();
    }
    var obj;
    if (customObj && !extendObj) { obj = customObj; }            // TRUE path taken: our Group, unmodified, unwrapped
    ...
    return obj;                                                  // this exact Group is what gets stored/added
  })
    ↓ (ThreeDigest's own onCreateObj wrapper, three-forcegraph.mjs:276-287)
  function (d) {
    var obj = fn(d);              // == our Group, from the chain above
    d[objBindAttr] = obj;         // d.__threeObj = ourGroup
    obj[dataBindAttr] = d;        // ourGroup.__data = d (the node)
    scene.add(obj);               // ourGroup added directly to the live three.js scene
    return obj;
  }
    ↓ (data-bind-mapper/src/index.js:27-32)
  this.#dataMap.set(this.#id(d), obj);   // keyed by node.id -> ourGroup
  this.#objMap.set(obj, d);              // ourGroup -> node
```

**Answering Q3 directly**: `customObj && state.nodeThreeObject === customObj` only clones when the
*prop itself* is a literal shared Object3D (a different usage pattern than this app's). Since
`Graph3D.tsx` passes a **function**, `customObj` (an Object3D) is never `===` to
`state.nodeThreeObject` (a function) — this check is always false here. **CONFIRMED: no cloning,
wrapping, or reparenting occurs beyond `scene.add(obj)`.** The object `three-forcegraph` stores in
its own `#dataMap`/`#objMap`, adds to the scene, and later disposes **is the literal same JS object
reference** `Graph3D.tsx`'s `nodeThreeObjCacheRef` also stores under `node.id`.

## 3. Geometry/material/texture ownership

**CONFIRMED**, `nodeObject.ts` (re-read in this pass, cross-checked against the memory-scaling and
cache-key audits): a non-action node's returned `THREE.Group` (`nodeGroup`, `nodeObject.ts:526`)
contains, as direct or nested children:
- The **main body `Mesh`** — `geom` from `getGeometry()` (`nodeObject.ts:186-203`), a **module-
  level `geometryCache` Map, shared by every node of the same `type-size-widthSeg-heightSeg`
  key** (a small, bounded key space per the earlier cache-key audit — one shared `BufferGeometry`
  instance can back dozens of live nodes at once).
- A **glow `Sprite`** — `material.map` from `glowTexCache` (`nodeObject.ts:12-13,115-132`), shared
  by every sprite built with the same color+size key.
- A **label `Sprite`** — `material.map` from `labelTexCache`, shared by every sprite built from
  the same label text.
- For a `"moon"`-class body specifically: the main mesh's `material.map` comes from
  `getMoonTexture()` (`nodeObject.ts:341-347`), a **single module-level `cachedMoonTexture`
  instance shared by every moon-class node in the entire Galaxy** — not previously called out by
  name in the prior audits, confirmed here as a third class of shared resource at risk, alongside
  `geometryCache` and `labelTexCache`/`glowTexCache`.

**Answering Q4**: **CONFIRMED yes** — these are exactly the resources a naive, non-refcounted
`.dispose()` call is most dangerous against, because disposing ONE node's reference silently
invalidates the SAME GPU resource for every OTHER currently-live node still pointing at it.

## 4. Graph3D cache lifecycle

**CONFIRMED, `Graph3D.tsx`**: `nodeThreeObjCacheRef` (a `useRef<Map<number, {obj, key}>>`) is
mutated at exactly three places:
1. **Cache-key mismatch inside `nodeThreeObject`** (the "content actually changed" path) —
   releases the *superseded* entry's textures (`releaseNodeTextures`) and disposes it
   (`disposeObject3D`), then builds fresh and overwrites the map entry.
2. **Real node deletion** — a separate cleanup path (established in the memory-scaling audit) that
   releases and removes the entry for a node id no longer present.
3. **Full component unmount teardown** — clears the entire map, releasing every entry.

**Answering Q5**: **CONFIRMED no** — none of these three paths is triggered by, or even aware of,
`three-forcegraph`'s own `nodeDataMapper.clear()`/removal. The two systems' entries are updated on
completely independent triggers.

## 5. three-forcegraph cache lifecycle

**CONFIRMED**, `data-bind-mapper/src/index.js` (`DataBindMapper.digest`, full source read):
`#dataMap`/`#objMap` are **private instance fields that persist across calls** — `digest(data)`
only creates new objects for ids absent from `#dataMap`, calls `#updateObj` for ids still present,
and calls `#removeObj` (→ disposal) for ids in `#dataMap` but absent from the new `data`. **`clear()`
is literally `digest([])`** (`data-bind-mapper/src/index.js:48-51`) — passing an empty list makes
*every* currently-tracked id "absent," disposing all of them in one pass.

**The clear is gated, for nodes, by** (`three-forcegraph.mjs:1129-1131`):
```js
if (state._flushObjects || hasAnyPropChanged(['nodeThreeObject', 'nodeThreeObjectExtend'])) state.nodeDataMapper.clear();
```
— re-confirming `0eaf0be`'s finding that this fires independent of whether `graphData` itself
changed, via either `state._flushObjects` (set by the four existing `fg.refresh()` call sites
already in `Graph3D.tsx`) or a reference change on the `nodeThreeObject`/`nodeThreeObjectExtend`
props (which `0eaf0be` traced to ordinary, unmemoized React re-renders via `react-kapsule`'s
per-render prop-sync).

## 6. Disposal lifecycle

**CONFIRMED**, `three-forcegraph.mjs:231-244`:
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
Our top-level returned object is a `THREE.Group`, which itself has no `.geometry`/`.material` —
but `_deallocate` recurses into `obj.children`, reaching the main mesh (`.geometry.dispose()`,
`.material.dispose()`), every sprite (`.material.map.dispose()`, `.material.dispose()`), and any
ring/belt/sector-title children. **Answering Q1: CONFIRMED yes** — the Group's *children*, not the
Group itself, directly hold the real geometry/material/texture references, and `_deallocate`'s
recursion reaches every one of them.

**This runs inside `ThreeDigest`'s own `onRemoveObj` wrapper** (`three-forcegraph.mjs:289-300`):
```js
onRemoveObj: function (fn) {
  _superPropGet(ThreeDigest, "onRemoveObj", this)([function (obj, dId) {
    var d = _superPropGet(ThreeDigest, "getData", _this3)([obj]);
    fn(obj, dId);
    _this3.scene.remove(obj);
    _deallocate(obj);
    delete d[objBindAttr];
  }]);
}
```
**CONFIRMED, this wrapper is installed unconditionally in the `ThreeDigest` constructor**
(`three-forcegraph.mjs:271`, `_this.onRemoveObj(function () {});` — a no-op custom `fn`, but the
wrapper itself, with its `scene.remove`/`_deallocate` calls, is always in place). Re-checked the
node-digest setup code (`three-forcegraph.mjs:1119-1182`) and confirmed it never calls
`.onRemoveObj(...)` again for `nodeDataMapper` (unlike the link mapper, which does register a
custom `onRemoveObj` for trailing-photon cleanup at `~1202-1210`) — so node removal always runs
exactly this default wrapper: **remove from scene, then unconditionally deallocate.**

**Critically, `scene.remove(obj)` runs BEFORE `_deallocate(obj)`, every time, guaranteed by this
single wrapper function.** This is the fact §10's remediation candidate is built on.

## 7. Whether the desync is real

**CONFIRMED — traced end to end with no gap.** Reconstructing the exact synchronous sequence
inside one `update(state, changedProps)` call when a clear fires:

```
1. state.nodeDataMapper.clear()                                    // = digest([])
   → for every currently-tracked node id:
       #removeObj(obj, id) → scene.remove(obj); _deallocate(obj)   // disposes every child's
                                                                     // geometry/material/texture
       #dataMap.delete(id); #objMap.delete(obj)
   → #dataMap and #objMap are now EMPTY

2. (same update() call, next statement)
   state.nodeDataMapper.onCreateObj(fn).onUpdateObj(fn2)
     .digest(state.graphData.nodes.filter(visibilityAccessor))     // the REAL node array — same
                                                                     // node objects, unchanged data
   → for EVERY node id (all now "new" relative to the just-emptied #dataMap):
       onCreateObj(node) fires
         → customObj = state.nodeThreeObject(node)                 // calls OUR callback
             → cacheKey = nodeVisualCacheKey(node)                 // unchanged: node data didn't change
             → cached = nodeThreeObjCacheRef.current.get(node.id)  // STILL holds the just-disposed Group
             → cached.key === cacheKey  →  TRUE                    // cache HIT
             → obj = cached.obj                                    // the exact Group just deallocated in step 1
             → return obj
         → obj = customObj  (since extendObj is false)
         → return obj                                              // handed back to ThreeDigest
       → scene.add(obj)                                            // RE-ATTACHES the disposed Group
       → #dataMap.set(id, obj); #objMap.set(obj, node)
```

**No asynchronous boundary separates step 1 from step 2** — both run inside the same
`update(state, changedProps)` invocation, itself called synchronously from `_rerender`/`digest`
(the kapsule's own render-cycle function, confirmed in `0eaf0be`). **No code in either
`three-forcegraph` or `Graph3D.tsx` re-checks whether a cache-hit object survived intervening
disposal.**

**Answering Q6 directly: CONFIRMED yes — Graph3D can and, whenever a clear fires while a node's
cache key is unchanged (the overwhelmingly common case, since content rarely changes between two
back-to-back digest passes within the same session), *will* return an already-disposed Object3D.**
This is not a race condition or a timing-dependent bug — it is a deterministic consequence of the
two caches' independence, reproducible every single time a clear fires with no intervening data
change.

## 8. Whether it can produce stale/disposed Object3Ds

Answered fully in §7 — **CONFIRMED**, not merely possible. The remaining open question is purely
about **visible consequence**, not mechanism (§13).

**Answering Q7**: **CONFIRMED no existing hook exists.** `three-forcegraph`'s node digest never
calls `.onRemoveObj(...)` with a custom function the way the link digest does, and even if it did,
nothing in `react-force-graph-3d`'s exposed prop surface (`ForceGraph3DPropTypes`,
`commonPropTypes`/`threeBasedPropTypes`, all read in the `0eaf0be` audit) offers a
disposal-notification callback (no `onNodeObjectDispose`, `onNodeRemove`, or equivalent). There is
no supported way for `Graph3D.tsx` to be told "this object was just deallocated."

**Answering Q8**: **CONFIRMED unsafe to rely on a disposal flag — because none exists.** Read the
installed Three.js 0.182.0 source directly:
```js
// BufferGeometry.dispose() (three/src/core/BufferGeometry.js:1450)
dispose() { this.dispatchEvent( { type: 'dispose' } ); }
// Material.dispose() (three/src/materials/Material.js:989)
dispose() { this.dispatchEvent( { type: 'dispose' } ); }
// Texture.dispose() (three/src/textures/Texture.js:636)
dispose() { this.dispatchEvent( { type: 'dispose' } ); }
```
Every one of these **only dispatches an event** — none sets any documented `.disposed`/`.isDisposed`
property on the object itself. The event exists for the `WebGLRenderer`'s own internal, private
resource bookkeeping (`WebGLProperties`), not for application code to introspect after the fact.
**There is no public, documented, stable way to ask "has this geometry/material/texture been
disposed?" after the fact** — confirming that any remediation relying on such a flag would be
unsafe (undocumented internals, subject to change, and not exposed on the objects themselves).

**A structurally guaranteed alternative signal does exist, however**: §6 confirmed
`scene.remove(obj)` always runs immediately before `_deallocate(obj)`, in the same wrapper
function, every time. **Checking `cached.obj.parent` (the top-level Group's parent, a completely
public, standard Three.js `Object3D` property) at the moment of a cache-hit — `null` means the
library already removed it from the scene, and therefore already disposed its children — is a
100% reliable, already-guaranteed-by-existing-code signal, with zero dependency on any
undocumented internal.** This does not require introspecting disposal state at all; it detects the
*removal* that provably always precedes disposal.

## 9. Risk classification

- **P0, CONFIRMED (not downgraded)**: the mechanism in §7 is fully reproducible from source with
  no gap — every step is a direct line of installed code, not an inference. The severity is
  correctness/resource-lifetime, not merely performance: a stale Group re-added to the scene means
  every node currently in the Galaxy is at risk of this the moment either trigger (§5) fires,
  which `0eaf0be` already established happens routinely (camera-movement-throttled `.refresh()`,
  up to ~4×/second).
- **P1**: the shared-resource blast radius (§3) — because `geometryCache`/`labelTexCache`/
  `glowTexCache`/`cachedMoonTexture` are shared across many nodes, a single clear-triggered
  disposal cascade can invalidate resources still actively referenced by *other* nodes' Object3Ds
  that also survive as stale cache hits — the damage is not confined to one node.
- **P3, informational**: the *visible* consequence of a disposed-but-still-scene-attached mesh
  rendering is genuinely **UNKNOWN** without a real GPU/browser (§13) — WebGL behavior after a
  buffer/texture is deleted while still bound varies by driver and by whether the same GPU memory
  gets reallocated before the next draw call; this audit does not claim to know whether the result
  is a visible glitch, a console error, or (in some cases) no perceptible difference for a frame or
  two before something eventually breaks. The MECHANISM is P0-confirmed regardless of how visible
  its symptom turns out to be.

## 10. Smallest safe remediation candidate

**Not implemented in this audit.** The evidence in §6/§8 points at one clearly smallest, safest
option: **in `Graph3D.tsx`'s `nodeThreeObject` callback, before trusting a cache-key match, check
whether `cached.obj.parent` is `null`; if so, treat the cache as invalidated and rebuild via
`makeNodeObject()` exactly as the existing cache-miss branch already does.**

Why this is the smallest safe option:
- Requires **zero changes** to `three-forcegraph`, `3d-force-graph`, or any installed dependency.
- Requires **zero new hooks, props, or library APIs** — `.parent` is a standard, always-present
  `THREE.Object3D` field, not an undocumented internal.
- Requires **zero change to cache keys, geometry/material ownership, force configuration, orbit
  behavior, or visuals** — a node whose cache is falsely invalidated by this check simply rebuilds
  via the exact same `makeNodeObject()` path that already runs on every genuine cache miss, so its
  appearance is identical to today's cache-miss appearance (already visually correct, since that
  path is exercised constantly for genuinely-changed nodes).
- **Directly closes the confirmed gap in §7** — the very next line that would have returned a
  stale object instead detects it and rebuilds fresh, before it's ever handed back to the library.
- The only cost is a small amount of *extra* rebuilding on every clear (since every node's cache
  would now correctly miss and rebuild once per clear, rather than incorrectly hitting-and-being-
  stale) — this is strictly safer than today's behavior, not a new performance regression, since
  today's "hit" was never actually cost-free either (it was silently unsafe).

## 11. Alternative remediation candidates

1. **Memoize the inline `<ForceGraph3D>` props** (`nodeThreeObject`, `linkThreeObject`,
   `linkWidth`, etc.) with `useCallback`/`useMemo`, as `0eaf0be` already flagged. This reduces
   *how often* clears fire from the React-re-render trigger, but does **not** address the four
   explicit `fg.refresh()` call sites already in `Graph3D.tsx`'s own tick loop (§5), which set
   `state._flushObjects` directly and would still trigger a clear regardless of prop memoization.
   Reduces frequency; does not close the gap.
2. **Register a custom `onRemoveObj` are not exposed to us** — as established in §8 (Q7), there is
   no supported way to inject one for the node mapper from outside `three-forcegraph`'s own
   internal setup code, so this candidate is not actually available without patching the library
   itself (out of scope, and far more invasive than §10).
3. **Change resource ownership so `three-forcegraph` never disposes shared resources** (the
   mission's Q9) — e.g., architecting `makeNodeObject()` so shared geometry/textures aren't
   directly reachable as `.geometry`/`.material.map` on any child `_deallocate` walks. This is not
   practically achievable: a `THREE.Mesh`/`THREE.Sprite` *must* have `.geometry`/`.material` to
   render at all, so there is no way to "hide" the shared resource from a recursive child walk
   without breaking rendering itself. This candidate is **not viable** as stated.
4. **Stop the library from ever clearing based on stale node ids** by making `nodeThreeObjCacheRef`
   the *sole* source of truth and bypassing `three-forcegraph`'s own object-caching entirely (e.g.,
   always returning a fresh wrapper Group per call that merely re-parents cached children) — a much
   larger architectural change than §10, with its own new risks (e.g., a Group's children being
   simultaneously referenced by two parents mid-transition), not recommended as a *smallest* fix.

## 12. Why each candidate is safe/unsafe

- **§10 (parent-null check)**: Safe — uses only public, standard API; strictly conservative (can
  only cause *extra* rebuilds, never *fewer* than needed); zero interaction with force
  configuration, orbit system, graphData lifecycle, or visuals; the rebuilt object is
  indistinguishable from what a genuine cache miss already produces today.
- **§11.1 (memoize props)**: Safe but insufficient alone — reduces exposure, doesn't close the
  actual gap; worth doing *in addition to* §10, not *instead of* it, per this audit's evidence.
- **§11.2 (custom removal hook)**: Not available without modifying the installed library — would
  require patching `node_modules` or forking the dependency, out of proportion to the fix.
- **§11.3 (hide resources from disposal)**: Not architecturally viable — rendering requires the
  exact properties `_deallocate` inspects.
- **§11.4 (bypass library caching)**: Technically possible but disproportionately invasive for
  what §10 already closes with a two-line check; introduces new risk surface of its own.

## 13. Required runtime validation

**No browser/WebGL access is available in this sandbox.** Before or immediately after implementing
§10 (in a future, separately-scoped task), the following should be confirmed on a real device:
- Whether the *pre-fix* behavior (today's known-good-but-unsafe state) actually produces a visible
  glitch during sustained camera movement (the highest-frequency trigger, per `0eaf0be` §3) — this
  would be the clearest evidence the P0 has a real user-facing symptom, not just a theoretical one.
- Whether `cached.obj.parent === null` is ever observed to be true in practice during normal use
  (confirming the guard actually fires) — instrumentable cheaply via a one-line `console.warn` in
  a throwaway local build, not something to add to production code.
- Whether `renderer.info` (already instrumented per Stage 0's PerfHUD) shows any geometry/texture
  count anomaly coinciding with a clear event.

## 14. Explicit regression hazards

- **None identified for the §10 remediation itself**, given it only adds a defensive check before
  an existing code path, with the same fallback behavior (`makeNodeObject()`) already exercised
  elsewhere. The main hazard is a **false sense of completeness**: §10 fixes the *node* object
  cache specifically; if `Graph3D.tsx` maintains (or later grows) an analogous per-link object
  cache with the same "hand back a cached Object3D by id" shape, the identical class of bug would
  apply there too and would need the same guard — not confirmed to exist today (this audit did not
  find a link-side equivalent to `nodeThreeObjCacheRef`), but worth checking explicitly before
  considering the class of bug fully closed.
- **Absolute rule maintained**: this audit did not touch, and does not recommend touching, the
  `link` force (`fg.d3Force("link")?.strength(0)` stays exactly as-is), `charge` (removed, per the
  validated prior optimization), `center` (removed), the graphData lifecycle, refresh cadence, LOD,
  glow, lighting, labels, or cache keys. Nothing in this audit's findings changes any of those
  conclusions.

---

## Validation

- **No source code changed.** `git status --porcelain` / `git diff --stat` (run after writing this
  document, before committing) show only this new file.
- Ran the existing relevant checks: `npm run typecheck -w @brain/web` and `npm run test -w
  @brain/web` — reported in the accompanying chat response.
- No tests were added — this audit required no behavior change to inspect; every finding came from
  reading installed library source (`data-bind-mapper`, `three-forcegraph`, `three`) and this
  repo's `Graph3D.tsx`/`nodeObject.ts` directly.
