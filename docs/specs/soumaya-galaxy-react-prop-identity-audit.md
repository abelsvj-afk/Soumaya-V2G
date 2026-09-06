# Soumaya Galaxy — React Render → ForceGraph Prop Identity Audit

> **MODE: AUDIT ONLY.** No source code was changed to produce this document. Follows the
> cache/disposal desync fix (`dc24d2d`). That fix makes a disposed cache entry safe to detect and
> rebuild; this audit traces the *other* half of the picture the prior audits (`0eaf0be`,
> `6997973`) flagged but didn't fully quantify — **exactly which React renders cause the
> disposal in the first place**, and whether they have anything to do with the Galaxy's actual
> data. Status: **audit complete — no implementation.**

## 1. Executive summary

**Confirmed: the two prop identities that actually reach `three-forcegraph`'s expensive
`.clear()`/`_deallocate()` path — `nodeThreeObject` and `linkWidth` — are recreated on every
single render of `Graph3D`, and `Graph3D` has no `React.memo`, so every render of its parent
(`App.tsx`, which mounts `<Graph3D>` directly) triggers this regardless of whether the Galaxy's
actual graph data changed.** This is not conditional on the camera-movement-throttled
`fg.refresh()` calls already found in `0eaf0be` — those are additional, separate triggers on top
of an already-constant baseline.

Two concrete, confirmed, non-graph-related trigger classes were traced in `App.tsx`, one of them
severe: `useCountUp` (`App.tsx:530-531`) animates the memory-count and streak displays via its own
internal `requestAnimationFrame` loop, calling `setState` **up to once per real animation frame
for up to 600ms** every time either target value changes (e.g., after adding one memory). Each of
those `setState` calls is a full `App.tsx` re-render, and since `Graph3D` sits directly in
`App.tsx`'s JSX with no memo, **each one cascades into a fresh `nodeThreeObject`/`linkWidth`
closure and, per the confirmed `three-forcegraph` gate, a full node+link cache clear** — meaning a
single new memory can trigger on the order of dozens of clear-and-rebuild cycles within 600ms,
entirely from a number-tween animation with no relationship to the Galaxy's visible content.

**Not every unstable inline prop reaches the expensive path.** Of the ~12 inline function props
`Graph3D` passes to `<ForceGraph3D>`, only two (`nodeThreeObject`, `linkWidth`) are inside
`three-forcegraph`'s *narrow* `.clear()` gate; the rest (`nodeVisibility`, `linkVisibility`,
`linkColor`, `linkCurvature`, `linkDirectionalParticles*`, `nodeLabel`, `onNodeClick`,
`onNodeHover`) sit only in the *outer*, cheap re-digest gate, whose effect on an unchanged id set
is a no-op `onUpdateObj` call, not disposal (§6, §7).

**Memoization safety is asymmetric between the two culprits.** `nodeThreeObject` closes over only
refs (`nodeThreeObjCacheRef`, `gfxRef`) — **confirmed safe to memoize with an empty dependency
array, zero stale-closure risk.** `linkWidth` transitively reads `activeId` (a per-render value
derived from `hoverId`/`selectedId` state, not a ref) via `shouldRenderLink` — **memoizing it with
an empty array would be a real, confirmed correctness bug** (stale hover/selection-based link
rendering); it would need `[activeId, ...]` in its dependency list, which is itself a legitimate,
frequent-enough trigger this audit does not recommend trying to eliminate.

## 2. Graph3D render triggers

**CONFIRMED, `Graph3D.tsx:194-197`**: exactly two `useState` hooks exist in the entire component:
`hoverId` (`setHoverId`, driven by `onNodeHover={(n) => setHoverId(n ? n.id : null)}`,
`Graph3D.tsx:2943`) and `cluster` (`setCluster`, driven by lens/isolate-view interactions
elsewhere in the file). Either changing directly re-renders `Graph3D`, independent of its parent.

**CONFIRMED, `App.tsx:1446`**: `<Graph3D ...>` is mounted **directly** in `App.tsx`'s own JSX, not
nested behind an intermediate memoized boundary.

**CONFIRMED, `Graph3D.tsx:153`**: `export const Graph3D = forwardRef<Graph3DHandle, Props>(...)`
— a plain component, **not wrapped in `React.memo`**. React's default behavior applies: a
non-memoized child re-renders whenever its parent re-renders, regardless of whether the child's
own props actually changed by value or reference.

**Answering Q1/Q2 directly**: `Graph3D` re-renders whenever (a) its own `hoverId`/`cluster` state
changes, or (b) `App.tsx` re-renders for *any* reason. Of these, `hoverId` changes (ordinary
node-hover interaction) and the overwhelming majority of `App.tsx`'s own re-render causes (§3) are
**unrelated to the Galaxy's actual graph data** — `data`/`view` itself is a stable reference across
these (§5), but that stability is irrelevant once *other* props are unstable and there is no memo
gating the render at all.

## 3. Concrete App.tsx re-render triggers unrelated to graph data

**CONFIRMED**, direct source read:
- `App.tsx:530-531`: `useCountUp(view.nodes.length)` / `useCountUp(streak?.current ?? 0)`.
  `useCountUp`'s own implementation (`packages/web/src/hooks/useCountUp.ts:11-37`) is a
  dependency-free `requestAnimationFrame` tween: on every target change, it calls `setDisplay(...)`
  **on every animation frame for up to `ms` (default 600) milliseconds** until the eased value
  reaches the target. At a typical 60Hz refresh, that's up to ~36 `setState` calls — 36 full
  `App.tsx` re-renders — triggered by one memory being added or one streak day logging.
- `App.tsx:707,713`: `usePolledCount(..., 60_000)` / `usePolledCount(..., 120_000)` — periodic
  polling re-renders every 60s/120s.
- `App.tsx:196,867,1119`: three more `window.setInterval(...)` call sites (30s, and two at 60s)
  driving further periodic state updates.

None of these five sources have any relationship to whether the Galaxy's node/link *content*
changed — they are UI-chrome concerns (counters, badges, periodic freshness checks) that happen to
live in the same top-level component that renders the Galaxy.

**Answering Q1/Q2 with numbers**: this is not a vague "renders happen sometimes" finding — it is a
**confirmed, bursty, high-frequency trigger** (the `useCountUp` tween) plus several confirmed
low-frequency periodic ones, all demonstrably unrelated to graph content, all capable of
cascading into `Graph3D` with no memo boundary stopping them.

## 4. React → ForceGraph prop flow (re-confirmed, not re-derived)

Re-confirms `0eaf0be`'s mechanism, cited here rather than re-traced: `react-force-graph-3d`'s
`ForceGraph3D` is built via `react-kapsule`'s `fromKapsule` (`node_modules/react-force-graph-3d/dist/react-force-graph-3d.mjs:125`),
whose generated component (`node_modules/react-kapsule/dist/react-kapsule.js:210-218`) runs, in
its render body (not an effect), a per-render loop comparing every non-method prop against the
*previous render's* value via strict `!==`, calling the underlying kapsule setter for every prop
whose reference changed. This is unconditional on *why* the parent re-rendered.

## 5. All ForceGraph3D props and identity stability

**CONFIRMED**, enumerated directly from `Graph3D.tsx:2874-3022`'s full `<ForceGraph3D>` JSX block:

| Prop | Stable? | In three-forcegraph's narrow `.clear()` gate? | Expensive side effect if unstable? | Safe to memoize with `[]`? |
|---|---|---|---|---|
| `graphData` | **Yes** — `data={view}` at the `App.tsx` level is a direct alias (`App.tsx:528`, `const view = data;`), same reference until `setData` runs | N/A (its own separate reheat path, `0eaf0be` §2) | Reheat + full digest on genuine change (by design) | N/A, not a callback |
| `backgroundColor` | Yes — module constant `BG` | No | None | N/A |
| `showNavInfo`, `warmupTicks`, `cooldownTicks`, `cooldownTime` | Yes — literal primitives, value-compared | No | None (primitives can never spuriously "change" — confirmed harmless, answering the "are unchanged primitive props harmless" question) | N/A |
| `nodeVisibility` | **No** — inline, closes over `cluster` | No (only in the outer node-digest gate) | Outer re-digest only (cheap no-op `onUpdateObj` per node, since map isn't cleared) | Needs `[cluster]` |
| `linkVisibility` | **No** — inline, closes over `cluster`, `dataRef`, `fgRef`, `linkLodZoomedInRef` | No | Outer link re-digest only (cheap) | Refs are safe; needs `[cluster]` |
| **`nodeThreeObject`** | **No** — inline, closes over `nodeThreeObjCacheRef`, `gfxRef` (both refs) | **Yes** | **`nodeDataMapper.clear()` → `_deallocate()` on every currently-tracked node** | **Yes — `[]`, confirmed zero real dependencies (refs only)** |
| `nodeLabel` | No — inline, closes over `isNodeProcessing` | No | Outer re-digest only | Depends on `isNodeProcessing`'s own stability (not traced further; low-severity either way, not in the clear gate) |
| `onNodeClick` | No — inline, closes over `onSelect` (an unstable prop from `App.tsx`), `shouldCalmMotion`, `burstsRef`, `flyTo` | No (not a digest-gating prop at all) | None on the cache path | Would need `[onSelect, flyTo]` at minimum |
| `onNodeHover` | No — inline, but only calls the always-stable `setHoverId` | No | None on the cache path | Yes, `[]` |
| `linkColor` | No — inline, closes over `shouldRenderLink`, `nodeByIdRef`, `activeId` | No | Outer re-digest only | Needs `[activeId]` (via `shouldRenderLink`) |
| **`linkWidth`** | **No** — inline, closes over `shouldRenderLink` (→ `activeId`), `getLinkActivity` | **Yes** | **`linkDataMapper.clear()` → `_deallocate()` on every currently-tracked link** | **No — `activeId` is a genuine, changing dependency (§8); needs `[activeId]`, not `[]`** |
| `linkCurvature` | No — inline, closes over `fgRef`, `getLinkActivity` | No | Outer re-digest only | Refs safe; `getLinkActivity` has no changing closure deps itself (reads `Date.now()` internally, not render state) |
| `linkDirectionalParticles`, `linkDirectionalParticleSpeed`, `linkDirectionalParticleWidth`, `linkDirectionalParticleColor` | No — inline, close over `getLinkActivity`/`nodeByIdRef` | No | Outer re-digest only | Same as above — likely safe with `[]` given `getLinkActivity`'s own deps are ref-based |

**Answering Q6-Q10 directly**: every function-valued prop in this table is recreated on every
`Graph3D` render (Q6/Q7 — dependencies listed in the table). `react-kapsule` observes **all** of
them as changed every time (Q8 — confirmed, reference comparison has no concept of "which changes
matter"). Of those, **only `nodeThreeObject` and `linkWidth`** actually invoke a setter whose
downstream effect is the expensive clear (Q9/Q10) — the rest invoke setters too (real, but cheap,
work: storing a new accessor function and re-running a filter+no-op-update pass).

## 6. react-kapsule comparison behavior (re-confirmed)

**CONFIRMED**, `node_modules/react-kapsule/dist/react-kapsule.js:211-218` (quoted in full in
`0eaf0be`, re-verified unchanged in this pass): previous props are stored in a plain `useRef({})`,
compared via `!==` (strict reference/value equality — for primitives this is a correct value
comparison; for objects/functions it is a reference comparison), and the comparison runs directly
in the render body on **every** render, with no dependency-array gating of any kind. Function
identity absolutely matters — there is no special-casing for functions vs. other reference types.

## 7. three-forcegraph setter behavior — exact cache-clearing paths

**CONFIRMED**, `node_modules/three-forcegraph/dist/three-forcegraph.mjs`:
- Node clear gate, `:1129-1131`: `if (state._flushObjects || hasAnyPropChanged(['nodeThreeObject',
  'nodeThreeObjectExtend'])) state.nodeDataMapper.clear();` — the **only** two props that reach
  this specific check. `nodeThreeObjectExtend` is never set by `Graph3D.tsx` (stays `undefined`,
  stable), so `nodeThreeObject` alone drives this in practice.
- Link clear gate, `:1199-1201`: `if (state._flushObjects || hasAnyPropChanged(['linkThreeObject',
  'linkThreeObjectExtend', 'linkWidth'])) state.linkDataMapper.clear();` — `linkThreeObject`/
  `linkThreeObjectExtend` are likewise never set; `linkWidth` alone drives this in practice.
- `.clear()` → `digest([])` → `_deallocate()` on every currently-tracked object (full mechanism
  already traced end-to-end in `6997973`, not re-derived here).

**Answering Q11-Q13 directly: CONFIRMED yes to all three** — an unrelated React render (via either
`nodeThreeObject` or `linkWidth`'s unconditional per-render recreation) can and does clear the node
cache, the link cache, and reach `_deallocate()`, with the Galaxy's `graphData` content completely
unchanged.

**Answering Q14**: **CONFIRMED no** — simulation reheat is gated on the *separate* `graphData`
`onChange`/`hasAnyPropChanged(['graphData', ...])` path (`0eaf0be` §7), which `nodeThreeObject`/
`linkWidth` are not part of. An unrelated render clears the object caches but does **not** reheat
the d3 simulation.

## 8. Dependency / stale-closure risk analysis

This is the audit's most consequential finding for what a safe fix would need to look like.

**`nodeThreeObject` (`Graph3D.tsx:2907-2930`)**: reads `node` (its own parameter), and
`nodeThreeObjCacheRef.current`/`gfxRef.current` — both `useRef` objects. **CONFIRMED**: React's own
rules treat ref reads inside a callback as always-current regardless of when the callback was
created (refs are mutable containers, not captured values) — a `useCallback(fn, [])` wrapping this
exact function would behave **identically** to today's fresh-every-render version, because nothing
inside it depends on any render-scoped value that could go stale. **Zero stale-closure risk.**

**`linkWidth` (`Graph3D.tsx:2975-2982`)**: calls `shouldRenderLink(l)` (`Graph3D.tsx:2416-2439`),
which reads `activeId` **directly** (`Graph3D.tsx:2420`, `const lit = activeId === null || ...`).
`activeId` is `const activeId = hoverId ?? selectedId ?? null;` (`Graph3D.tsx:203`) — **a plain
`const` recomputed fresh every render from `useState`/prop values, not a ref.** **CONFIRMED**: a
`useCallback(linkWidthFn, [])` would freeze `activeId` at whatever it was on the render that first
created the memoized function — every subsequent hover or selection change would silently fail to
affect which links widen/thin, a genuine, confirmed correctness regression if memoized naively.
**A correct memoization would need `[activeId]`** (and, transitively, anything else
`shouldRenderLink`/`getLinkActivity` read from render scope — both were checked and found to read
only `Date.now()` and ref-backed caches beyond `activeId`, so `[activeId]` is sufficient).

**Answering Q19-Q22 directly**: `linkWidth` (and, by the same `shouldRenderLink` dependency,
`linkColor` — though `linkColor` isn't in the expensive gate) **cannot** be safely memoized with an
empty array (Q19) — its identity change on hover/selection is **intentional and required** (Q22),
not a bug to eliminate, only a trigger to stop conflating with *unrelated* re-renders. `useCallback`
naively applied risks exactly the stale-closure bug described (Q21) — this is not hypothetical,
it's a directly traced, confirmed read of `activeId` inside the function that would go stale.
`nodeThreeObject` has no such risk and is the cleaner of the two candidates (Q16, partial answer).

## 9. React.memo analysis

**Answering Q3**: **CONFIRMED no** — `Graph3D.tsx:153`, plain `forwardRef`.

**Answering Q4/Q5/Q17/Q18**: `React.memo(Graph3D)` would perform a shallow comparison of
`Graph3D`'s **own** props (the `Props` interface, `Graph3D.tsx:113-149`), not the internal
`<ForceGraph3D>` props it constructs. **CONFIRMED**, `App.tsx:1449-1505`: several of the props
`App.tsx` passes to `<Graph3D>` — `onFirstFrame`, `onFuelBurn`, `onSelect`, `onSoumayaClick`,
`onGalaxyEntityClick` — are themselves **inline arrow functions written directly in `App.tsx`'s
JSX**, recreated fresh on every `App.tsx` render. **A bare `React.memo(Graph3D)` would therefore
still see "changed props" on every `App.tsx` render** (shallow comparison would find these
callback references different), **failing to prevent the cascade this audit is investigating** —
unless `App.tsx` also wraps each of them in `useCallback`. `React.memo` alone is **not sufficient**
(Q17: no). It would, however, still fully block the cascade from `App.tsx` re-renders that pass
byte-for-byte the *same* prop references (e.g., a re-render triggered by state entirely unrelated
to anything passed into `<Graph3D>` at all) — a real, if partial, benefit.

**Separately, and independent of any `App.tsx`-side fix**: `React.memo` has **zero effect** on
`Graph3D`'s own internal `hoverId`/`cluster` state-triggered re-renders (§2) — a component always
re-renders on its own state change regardless of memoization. **`React.memo` cannot address the
`onNodeHover`-driven render class at all.**

## 10. useCallback analysis

**Answering Q16**: `useCallback` on `nodeThreeObject` alone (§8, confirmed safe with `[]`) would
stop that specific prop from ever appearing in `changedProps` on a render where nothing relevant
changed — closing the node-side clear for **every** trigger this audit found (App.tsx cascades,
`hoverId` changes, and anything else) **except** a genuine `graphData` replacement (where
`three-forcegraph`'s own separate `graphData`-driven reheat path already forces a re-digest
regardless, per `0eaf0be`). `useCallback` on `linkWidth` would need `[activeId]` (§8) — this closes
the link-side clear for App.tsx-cascade and periodic-timer renders, but **not** for `hoverId`
changes themselves (since `activeId` — the correct dependency — changes exactly when `hoverId`
does). That remainder is expected and appropriate, not a gap: a link legitimately needs to
re-evaluate its width when the user hovers a connected node.

**Answering Q20**: the minimal set is exactly these two — `nodeThreeObject` and `linkWidth` — since
they are the only two props inside `three-forcegraph`'s narrow `.clear()` gates (§7). Memoizing any
of the *other* inline props (`linkColor`, `nodeVisibility`, etc.) would reduce the cheap outer-gate
re-digest work but would not touch the expensive disposal path at all.

## 11. Minimal safe optimization candidate (not implemented)

Two independent, separately-scoped `useCallback` additions inside `Graph3D.tsx`:
1. `nodeThreeObject`: `useCallback((node) => {...same body...}, [])` — confirmed zero
   stale-closure risk.
2. `linkWidth`: `useCallback((l) => {...same body...}, [activeId])` — confirmed the one dependency
   that must be included; omitting it would be the exact class of bug this audit was asked to rule
   out, not introduce.

Neither requires touching `three-forcegraph`, `graphData`, force configuration, or any visual
computation — both would produce byte-for-byte the same *values* on every call, only changing
*how often a new function reference exists*, which is precisely the signal `three-forcegraph`'s
gates key off of.

## 12. Alternative candidates

- **`React.memo(Graph3D)` + `useCallback` on `App.tsx`'s 5 inline callback props** (`onFirstFrame`,
  `onFuelBurn`, `onSelect`, `onSoumayaClick`, `onGalaxyEntityClick`) — addresses the *parent-driven*
  half of the cascade (§9) but not `Graph3D`'s own `hoverId`/`cluster`-driven renders, and is a
  larger, two-file change than §11's narrower, internally-contained fix.
- **Memoizing every inline `<ForceGraph3D>` prop**, not just the two in the clear gate — reduces
  the cheap outer-gate work too, but per §10's evidence, that work is already inexpensive
  (filter + no-op update, not disposal) — lower payoff per line of risk than §11.
- **Doing nothing beyond the already-shipped `dc24d2d` fix** — remains a valid choice; `dc24d2d`
  already makes the disposal safe (no more stale-object reuse), so this audit's findings are about
  *frequency of wasted rebuild work*, not renewed correctness risk.

## 13. Expected performance impact

**DERIVED, not measured**: reducing clear frequency from "every render" to "only on genuine
`graphData` changes, cluster/lens changes, and hover/selection changes" would cut the number of
full node+link Object3D dispose-and-rebuild cycles substantially, especially during the confirmed
`useCountUp` burst (§3) — from ~36 avoidable cycles down to zero for that specific trigger. No
numeric FPS/ms figure is claimed; this sandbox has no browser to measure the real-world magnitude
(§15).

## 14. Runtime validation requirements

**No browser/WebGL access available in this sandbox.** Before or alongside implementing §11 in a
future task:
- Confirm via `renderer.info`/PerfHUD (already instrumented) that `programs`/`geometries` counts
  stop spiking during a `useCountUp` burst (e.g., right after adding a memory) once `nodeThreeObject`
  is memoized.
- Confirm hover/selection still correctly affects link width/color after memoizing `linkWidth`
  with `[activeId]` — this is the one dependency this audit is trusting to be sufficient from
  static analysis; a live check costs little and directly validates §8's stale-closure conclusion.
- Confirm no visible flicker or pop during ordinary interaction, matching the "byte-for-byte same
  values" reasoning in §11.

## 15. Regression hazards

- **The dominant hazard is the exact one this audit was commissioned to rule out for a future
  implementation**: memoizing `linkWidth` (or `linkColor`, if ever also touched) with an
  incomplete dependency array would silently break hover/selection-driven link rendering. §8's
  `[activeId]` requirement is the concrete guardrail against this.
- **`nodeThreeObject` has no equivalent hazard** — confirmed ref-only dependencies.
- A **partial** fix (memoizing only one of the two) would leave the other side's clear fully
  intact — not harmful, but would undersell the benefit; §11 treats both as one unit for this
  reason, even though they're independently safe to land.

## 16. Explicitly out-of-scope changes (per this task's constraints)

Confirmed untouched, and not recommended for change by any finding in this document: the force
configuration (`fg.d3Force("charge", null); fg.d3Force("center", null);
fg.d3Force("link")?.strength(0);`, `Graph3D.tsx:997-999` — re-checked in this pass, unchanged since
`dc24d2d`), simulation lifecycle, `graphData` replacement/refresh cadence, node count, visual
quality (glow/labels/materials/orbit behavior), node-object construction, and cache ownership. No
memoization was implemented in this task.

## 17. Confirmed / derived / suspected / unknown — index

**CONFIRMED**: `Graph3D`'s exact two `useState` hooks and their triggers (§2); no `React.memo`
(§2, §9); direct App.tsx mounting with no intermediate memo boundary (§2); `useCountUp`'s
per-frame `setState` burst mechanism (§3); the full, current `<ForceGraph3D>` prop list and each
prop's closure dependencies (§5); react-kapsule's per-render, unconditional, reference-based
prop-sync (§6, re-confirmed from `0eaf0be`); the exact two props in three-forcegraph's narrow
`.clear()` gates (§7); that clearing does not reheat the simulation (§7); `nodeThreeObject`'s
zero real dependencies (§8); `linkWidth`'s genuine `activeId` dependency via `shouldRenderLink`
(§8); `App.tsx`'s 5 inline callback props to `<Graph3D>` (§9); `data`/`view`'s own stability as a
stored alias (§5).

**DERIVED**: the numeric "~36 clear cycles per memory add" estimate (§1, §3 — arithmetic from a
confirmed 600ms/60Hz tween, not independently measured); the qualitative performance-impact
direction (§13).

**SUSPECTED**: none — every substantive claim traced to a specific source line in this pass.

**UNKNOWN**: any real-device timing/FPS number for the current wasted-clear frequency or its
post-fix improvement (§14); whether `isNodeProcessing`'s own identity stability matters in
practice (traced as low-severity regardless, since `nodeLabel` is not in the expensive gate).

---

## Final decision summary

**P0**: none newly identified in this audit — the `dc24d2d` fix already closed the correctness
risk; this document is about wasted work frequency, not renewed correctness danger.

**P1**: the confirmed `nodeThreeObject`/`linkWidth` unconditional-per-render recreation reaching
`three-forcegraph`'s narrow `.clear()` gate (§7) — real, confirmed, frequent (every render, not
merely "sometimes"), with a concrete high-frequency trigger already identified (`useCountUp`, §3).

**P2**: the broader "no `React.memo`" + "`App.tsx` passes inline callbacks" pattern (§9) — a real
contributing structural cause, but memoizing `Graph3D`'s own two culprit props (§11) closes the
expensive path without needing this larger, two-file change at all.

**P3**: the other ~10 inline `<ForceGraph3D>` props recreated every render but confirmed to only
reach the cheap outer re-digest gate (§5, §7).

**Recommended next step (not implemented)**: `useCallback` on exactly `nodeThreeObject` (`[]`) and
`linkWidth` (`[activeId]`) inside `Graph3D.tsx`, per §11 — the smallest change this audit's
evidence supports, with `linkWidth`'s dependency array being the one detail a future
implementation must get right to avoid the stale-closure regression this audit was specifically
asked to guard against.

---

## Validation

- **No source code changed.** `git status --porcelain` / `git diff --stat` (run after writing this
  document, before committing) show only this new file.
- Ran the existing relevant checks to confirm the tree stays clean: `npm run typecheck -w
  @brain/web` and `npm run test -w @brain/web` — reported in the accompanying chat response.
- Force configuration (`Graph3D.tsx:997-999`) re-verified unchanged from the known-good state.
