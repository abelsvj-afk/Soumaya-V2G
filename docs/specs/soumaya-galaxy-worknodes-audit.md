# Soumaya Galaxy — `workNodes` Per-Frame Filtering Audit

> **MODE: AUDIT ONLY.** No source code was changed to produce this document. Follows the
> ForceGraph callback stabilization (`f5d4dab`). Traces the `workNodes` construction path flagged
> in the Round 2 Galaxy performance audit, to determine whether it's a real, worthwhile
> optimization target or a smaller cost than its "runs every frame" description suggests.
> Status: **audit complete — no implementation.**

## 1. Executive summary

**The cost is real but smaller and more conditional than "rebuilt every frame" implies, and this
audit does not recommend optimizing it next.** `workNodes` (`Graph3D.tsx:1367-1369`) is
constructed once per real tick — but in the **default, no-isolation state** (no cluster/lens/view
active), it is **not an allocation at all**: it's a type-cast alias directly onto
`dataRef.current.nodes`, zero extra cost. Only while a cluster/lens/view **is** active does a real
`.filter()` allocation happen, and even then it scans at most the ~300-node overview cap
(`GraphService.overview(limit=300)`, unchanged in this audit) — a small, bounded, single linear
pass with O(1) `Set.has()` lookups per element.

**Membership is confirmed fully event-driven — it cannot change between frames without a
React-state or data event.** The two inputs that determine which nodes qualify —
`dataRef.current.nodes` (the source array) and `clusterRef.current` (the active isolation set) —
are each written only inside `useEffect`s keyed on `data` and `cluster` respectively, never from
any per-frame value (camera position, orbit position, hover, selection). This makes an
event-driven cache **technically safe** to build — but the evidence does not show the current cost
is large enough to justify it: two of the three downstream consumers (`satellites.ts`,
`subAgents.ts`) already throttle their own real use of the array to ~5Hz/0.4Hz internally, so the
array is often *not even read* on 11 of every 12 frames it's constructed — and the third
(`soumaya.ts`) only touches it from state-machine-gated branches, not unconditionally per frame.
At n≤300, one bounded filter pass per frame (only while isolation is active) is a materially
smaller, already largely self-mitigated cost compared to the ForceGraph node/link cache churn this
program already fixed (`dc24d2d`, `f5d4dab`), which disposed and rebuilt full Object3D trees, not
a small id-membership check.

**Recommendation: DO NOT OPTIMIZE YET.**

## 2. Exact `workNodes` lifecycle

**CONFIRMED**, `Graph3D.tsx:1364-1369`:
```ts
// Scope Soumaya + the fleet to the VISIBLE bodies when a lens/category view is active —
// she can't work on things a lens is hiding. No cluster → the whole galaxy, as before.
const _cl = clusterRef.current;
const workNodes = _cl && _cl.size
  ? (dataRef.current.nodes as any[]).filter((n: any) => _cl.has(n.id))
  : (dataRef.current.nodes as any[]);
```
This runs exactly once per real `tick()` invocation (i.e., once per frame that passes the
FPS-cap gate established in the force-simulation audit), immediately before the three consumer
calls (`satellites.update`, `subAgents.update`, `soumaya.update`) that all execute later in the
**same** tick call, reusing this single local `const`.

## 3. Source array and identity

**CONFIRMED**: `dataRef.current` is set inside the component's data-sync effect
(`Graph3D.tsx`, the effect that also maintains `nodeThreeObjCacheRef`/`nodeByIdRef` cleanup, keyed
on `[data]` — re-confirmed present and unchanged from the memory-scaling audit). `dataRef.current`
— and therefore `dataRef.current.nodes`'s array identity — only changes when the `data` prop
(App.tsx's `graphData` state) itself is replaced, i.e., on a genuine `refresh()` event, never
per-frame.

**CONFIRMED**: in the no-isolation branch, `workNodes` is `(dataRef.current.nodes as any[])` — a
TypeScript type assertion, not a copy, `.slice()`, or `.filter()`. **This performs zero additional
allocation and is the exact same array reference `dataRef.current.nodes` already is.**

## 4. Filtering conditions

**CONFIRMED**: the `.filter()` branch (real allocation) only executes when `_cl && _cl.size` is
truthy — i.e., `clusterRef.current` is a non-null `Set` with at least one member. An empty `Set`
(`.size === 0`) correctly falls through to the alias branch (`0` is falsy), confirmed by direct
reading of the ternary — no edge case where an "active but empty" cluster silently forces a
wasted filter pass over nothing.

## 5. Cluster/Lens/View dependencies

**CONFIRMED**, `Graph3D.tsx:197,201` (re-verified in this pass): `cluster` is a `useState<Set<number>
| null>(null)`, and `clusterRef.current = cluster` is assigned inside `useEffect(() => {
clusterRef.current = cluster; }, [cluster])` — **a plain effect with `cluster` as its only
dependency, firing only when the `cluster` state value itself changes** (a Lens/View/isolate
interaction elsewhere in the file setting `cluster` via `setCluster`). Nothing in the tick loop, no
camera code, no orbit code, and no hover/selection code writes to `clusterRef.current` directly —
grepped for other `clusterRef.current =` assignments and found none.

## 6. Per-frame vs. event-driven dependencies

**Answering Q9-Q16 directly**:
- **Q9 (can membership change between frames without a state/data event)**: **CONFIRMED no.**
  Both `dataRef.current.nodes` and `clusterRef.current` are written exclusively from
  `useEffect`s gated on React state/prop changes (§3, §5).
- **Q10 (camera movement)**: **CONFIRMED no** — camera state lives entirely in `OrbitControls`/
  `fgRef`, never read by the `_cl`/`dataRef` assignment paths.
- **Q11 (orbit/position movement)**: **CONFIRMED no** — `orbits.ts` mutates each node object's
  `x/y/z/fx/fy/fz` **in place** (established in the memory-scaling and force-simulation audits);
  it never adds/removes array entries or touches `cluster`/`dataRef.current.nodes`'s identity.
  This is precisely the "membership vs. per-frame properties" split the mission's Q21 asks about
  — confirmed cleanly separated in this codebase's data model (§9).
- **Q12 (hover)**: **CONFIRMED no** — `hoverId` only feeds `activeId` (consumed by
  `linkColor`/`shouldRenderLink`/`linkWidthCb`, per the prop-identity audit); it is never read by
  the `workNodes` construction line or by `clusterRef`'s effect.
- **Q13 (selection)**: **CONFIRMED no**, same reasoning as hover — `selectedId`/`activeId` are not
  referenced in `Graph3D.tsx:1364-1369` or in the `cluster`-syncing effect.
- **Q14 (Lens/View/Cluster state)**: **CONFIRMED yes** — this is the *only* thing that changes
  which node ids qualify, by design (§5).
- **Q15 (graphData refresh)**: **CONFIRMED yes** — changes the *source* array's contents/identity,
  which naturally changes what `.filter()` (or the alias) reflects on the next tick.
- **Q16 (hidden ref dependencies)**: none found — `_cl`/`dataRef` are the only two reads in the
  construction line itself; no other ref is consulted for membership.

## 7. Allocation behavior

**Answering Q4-Q6 directly**:
- **No cluster active (default state)**: **zero allocation** — a type-cast alias (§3).
- **Cluster active**: **one new array per tick**, sized to however many of the ≤300 overview nodes
  are in the active cluster's descendant set (typically much smaller than 300 — a single isolated
  system, per `orbits.getDescendants(id)`, established in the force-simulation audit's orbit
  topology tracing). The filter predicate `_cl.has(n.id)` is a `Set.has()` — O(1) per element, no
  additional object allocation inside the callback itself.
- **Consumed immediately, not stored**: `workNodes` is a `const` local to one `tick()` invocation,
  passed synchronously to three function calls in the same call, then discarded — confirmed no
  code path retains a reference to it across frames.

## 8. Downstream consumers

**CONFIRMED**, three call sites, all within the same `tick()` invocation:
`satellites?.update(dt, workNodes, ...)` (`Graph3D.tsx:1378`), `subAgents?.update(dt, workNodes,
...)` (`:1402`), `soumaya.update(dt, workNodes, ...)` (`:1866`).

**Critically, two of the three already throttle their real use of the array internally**,
independent of how often `workNodes` itself is constructed:
- `subAgents.ts:246-250`: `memRefreshT` gates the only expensive read (`nodes.filter(...)` +
  `.sort(...)`) to **5Hz** (`memRefreshT = 0.2`) — confirmed, matching the Round 2 Stage 2 finding,
  re-verified here in the context of this specific audit.
- `satellites.ts:305-314`: `retarget` gates `reassign(nodes)` (a `.filter()`) to once every **2.5s**,
  and `idMapT` gates an `id → node` `Map` rebuild to **5Hz** — confirmed.
- `soumaya.ts`: dozens of `nodes.find()`/`.filter()` calls exist, but **CONFIRMED via direct
  grep** that each sits inside a specific state-machine branch (choosing a new task, resolving a
  link's endpoints, locating a beacon's target, etc.) — these run when Soumaya's own state
  transitions call for a lookup, not unconditionally on every tick.

**Answering Q26/Q27 directly**: downstream consumption does **not** meaningfully amplify
`workNodes`'s per-frame cost — the array is frequently constructed but, for two of three
consumers, is read far less often than it's built (their own throttle windows are longer than one
frame). There is no evidence this is a larger bottleneck than the already-fixed ForceGraph cache
churn (`dc24d2d`, `f5d4dab`) — that fix addressed full Object3D tree disposal/rebuild across every
tracked node/link; this construction is, at worst, a single bounded array filter.

## 9. Complexity analysis

**Answering Q23-Q25 directly**:
- **O(1)** in the default, no-isolation state (the common case) — confirmed, not derived.
- **O(n)**, n = active-cluster's node count ≤ the ≤300 overview cap, when isolation is active —
  a single linear pass, `Set.has()` lookups (O(1) amortized) per element, no nested loop, no
  quadratic behavior found anywhere in this construction.
- **At n≤300, this is genuinely small** — a few hundred `Set.has()` calls is a trivial CPU cost
  relative to what a single frame already budgets for (label/glow/orbit/frustum work across the
  same node count, per the force-simulation and memory-scaling audits' own tick-loop complexity
  tables). **This audit does not find evidence this is "worth optimizing" at the current scale**
  (Q25) — explicitly not inflating this to a higher priority merely because the line executes
  every frame, per the mission's own instruction.

## 10. Correctness risks

**None identified for the current code as written.** The one theoretical risk a *future*
optimization would have to avoid: caching `workNodes` by identity (e.g., only rebuilding when
`cluster`/`data` change) must **not** accidentally cache the array across a genuine `cluster`
transition, and must correctly reflect that switching cluster membership can shrink or grow the
array. Since both inputs are already event-driven and observable (§6), this is a fully avoidable
risk, not a structural one — confirmed no scenario in the current code where membership could
silently drift out of sync with `cluster`/`data`.

## 11. Optimization candidates (not implemented)

1. **Event-driven cache in a ref, computed inside the existing `cluster`-syncing effect** —
   instead of `const workNodes = ...` inline in `tick()`, compute and store
   `workNodesRef.current` inside the SAME `useEffect(() => { clusterRef.current = cluster; ...
   }, [cluster])` (and re-derive it whenever `data` changes too, via a second effect or a combined
   one), then have `tick()` simply read `workNodesRef.current`. This would make the array
   genuinely stable across frames between cluster/data events, matching the confirmed
   event-driven nature of its membership (§6).
2. **`useMemo` at the React level** — technically equivalent in outcome to (1) for the *value*,
   but `workNodes` is currently computed inside an **imperative** `tick()` function (not React
   render), so a `useMemo` would need to live in the render body and be threaded into the tick
   loop via a ref anyway — practically converges to the same shape as (1), just entered from a
   different angle (Q18: yes, `useMemo` would be *sufficient* for computing the value correctly,
   but it doesn't fit this codebase's existing ref-based tick-loop-input pattern as cleanly as (1)).
3. **Do nothing** — given §9's complexity finding, this is a legitimate, evidence-supported choice,
   not merely "the safe default."

## 12. Smallest safe candidate

Of the above, **(1) — an event-driven ref updated inside the existing `cluster`/`data`-syncing
effects** — is the smallest, safest shape *if* this is ever prioritized: it reuses the exact
effect-dependency pattern already established for `clusterRef.current` itself (§5), requires no
new state, no new event source, and only moves *when* the filter runs (from "every tick" to
"only on a cluster or data change"), not *what* it computes.

## 13. Why the candidate cannot become stale

Membership is confirmed (§6) to be a pure function of exactly two event-driven inputs
(`data`, `cluster`) — recomputing it inside effects keyed on precisely those two dependencies is,
by construction, unable to observe a value more stale than "the most recent `cluster`/`data`
change," which is definitionally correct — there is no third, per-frame input this construction
could miss (§6 exhaustively checked camera/orbit/hover/selection and found none relevant).

## 14. Expected performance impact

**DERIVED, not measured**: given §9's complexity finding (a small, bounded, already-conditional
cost), the expected impact of implementing candidate (1) is **small** — meaningfully smaller than
the already-shipped ForceGraph cache-churn fixes. This audit does not claim a numeric FPS/ms
figure; none can be measured without a browser (§15).

## 15. Runtime validation required

**No browser/WebGL access available in this sandbox.** If a future task revisits this: confirm via
PerfHUD (`renderer.info`, already instrumented) whether `tick.p95` measurably differs with vs.
without an active cluster/lens/view today, to establish a real baseline before spending effort on
§12's candidate — this audit's complexity analysis suggests the difference will be small, and a
live measurement would be the honest way to confirm that suggestion rather than assume it.

## 16. Regression hazards

None applicable — no code was changed. If candidate (1) is implemented in a future task: the
hazard to guard against is exactly §10's scenario (a stale cache surviving a `cluster`/`data`
transition) — mitigated by construction if the recompute is placed inside the effects already
gated on those exact two dependencies, not a separately-invented condition.

## 17. Explicitly out-of-scope changes

Confirmed untouched, and not recommended for change by any finding here: `GraphService.overview`'s
limit, refresh cadence, force configuration (`fg.d3Force("charge", null); fg.d3Force("center",
null); fg.d3Force("link")?.strength(0);`, re-verified unchanged in this pass), orbit behavior,
Lens/View/Cluster behavior itself (only its *consumption* by `workNodes` was traced, not its own
mechanics), labels, glow, materials, quality tiers, camera behavior, or the tick loop's structure.
No caching or `useMemo` was implemented.

---

## Dependency table

| Dependency | Can change per frame? | Changes `workNodes` membership? | Event-driven cache safe? | Evidence |
|---|---|---|---|---|
| `dataRef.current.nodes` (source array) | No — only on `data` prop replacement | Yes — is the base set filtered/aliased | Yes | `Graph3D.tsx` data-sync effect, keyed `[data]` |
| `clusterRef.current` (active isolation set) | No — only via the `[cluster]`-keyed effect | Yes — determines the filter predicate | Yes | `Graph3D.tsx:201`, `useEffect(() => { clusterRef.current = cluster; }, [cluster])` |
| Camera position | Yes | No | N/A (irrelevant to membership) | Not read by `Graph3D.tsx:1364-1369` or the `cluster` effect |
| Orbit/node position (`x/y/z`) | Yes | No — mutated in place on existing objects, never added/removed | N/A | `orbits.ts` in-place mutation, confirmed in prior audits |
| `hoverId` | Yes | No | N/A | Not read by the construction line |
| `selectedId`/`activeId` | Yes | No | N/A | Not read by the construction line |
| `soumaya`/`subAgents`/`satellites` internal throttle timers | Yes (count down every frame) | No — gate their *own* read of the array, not `workNodes` itself | N/A | `subAgents.ts:246-250`, `satellites.ts:305-314` |

---

## Final recommendation

**DO NOT OPTIMIZE YET.**

Justification: membership is confirmed fully event-driven and an event-driven cache would be
technically safe to build (§6, §13) — but the current cost is confirmed small (zero in the
default, no-isolation state; a single bounded O(n≤300) filter pass only while isolation is
active) and is not meaningfully amplified downstream (two of three consumers already throttle
their real reads to 5Hz/0.4Hz; the third only reads it from state-machine-gated branches). There
is no evidence this rises to the severity of the ForceGraph cache-churn issue this program already
fixed. Revisit only if a real on-device PerfHUD measurement (§15) shows `tick.p95` meaningfully
worse while a cluster/lens/view is active than while it is not — this audit's source-level analysis
does not predict that it will.

**Severity classification: P3** — confirmed real, confirmed correct to leave as-is at the current
~300-node scale, not inflated merely because the line executes every frame.

---

## Validation

- **No source code changed.** `git status --porcelain` / `git diff --stat` (run after writing this
  document, before committing) show only this new file.
- Ran the existing relevant checks to confirm the tree stays clean: `npm run typecheck -w
  @brain/web` and `npm run test -w @brain/web` — reported in the accompanying chat response.
- Force configuration (`Graph3D.tsx`, `fg.d3Force("charge", null); fg.d3Force("center", null);
  fg.d3Force("link")?.strength(0);`) re-verified unchanged.
