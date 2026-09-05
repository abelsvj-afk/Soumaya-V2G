# Audit — Galaxy Entity Citizenship: Journeys & Financial Goals

> Read-only architecture + product audit. Per `WORKFLOW.md`'s spec-before-code rule: **no
> production code was written for this phase.** Baseline: commit `8966e6a` on
> `claude/soumaya-second-brain-v1-m4z4hc`. Status: **audit complete — findings only.**

## 1. Executive Summary

The question posed was *"what would it take to make Journeys and Financial Goals true
first-class Galaxy citizens rather than secondary visual/UI representations?"* The honest
answer, arrived at by tracing the actual code rather than assuming: **they already are, to a
degree this phase's framing did not anticipate.**

`GalaxyEntityKind` (`packages/shared/src/intelligence.ts:167`) already includes `"journey"` and
`"goal"` alongside `"node"`. Both have a dedicated 3D visual object with a stable, server-backed
ID (`journeyHubs.ts`'s hubs, `moneySky.ts`'s stars), a real click→raycast→id→server-resolve→
navigate round-trip (`resolveGalaxyEntity`, `GET /api/graph/entity/:kind/:id`,
`flyToGalaxyEntity`), and participation in Maya's chat-navigation feature
(`GalaxyNavigationCandidate`/`resolveNavigationIntent`, the ChatDock navigation chip). This is
not a stub — it is a shipped, tested, working mechanism, built across the "Maya Intelligence
Part I3" work earlier this session.

What is genuinely missing is narrower than "citizenship": **there is no way to open a real
detail/inspection view of a Journey or a Financial Goal from a Galaxy click.** Clicking a
journey hub or a money-sky star today produces a toast + a camera fly-to, and nothing more — the
rich detail view (progress, links, allocations, Life Vision relationship) exists but only inside
the separate 2D `JourneysPanel`/`WealthPanel` tabs, unreachable from the click that identified
the exact entity. That gap, plus one confirmed, unrelated, already-shipped bug (Financial Goals
cannot actually link to Journeys today — see §7), are this audit's two concrete findings.

**Classification: both Journey and Financial Goal are CLASS B** (existing architecture is
correct; a small additive capability — a Galaxy-reachable inspector — is missing). Neither
requires a domain-model extension (Class C) or redesign (Class D). Both can be closed without
touching the locked Maya retrieval pipeline (§17).

## 2. Current Journey Architecture

Traced end-to-end from schema to Galaxy click:

| Layer | File | What exists |
|---|---|---|
| Schema | `packages/server/src/db/schemaSql.ts:507-530` | `journeys` (id, space_id, title, description, status, color, icon, progress, created_at, updated_at) + generic `journey_link` join `(space_id, journey_id, kind, ref_id)`, unique on the 4-tuple |
| Repo | `packages/server/src/repositories/journeys.repo.ts` | `list/get/create/update/remove/link/unlink/links/journeysFor` — full CRUD + generic linking, with a `REF_TABLE` existence guard per link kind |
| Vector | `packages/server/src/db/vec.ts:61-65,285-302` | `vec_journeys` vec0 table + `upsertJourneyEmbedding`/`deleteJourneyEmbedding`/`knnJourneys`, wired into the route via an `embed()` closure (mirrors `instructions.ts`'s pattern, not in the repo) |
| Analysis | `packages/server/src/analysis/journeyLinking.ts` | `suggestJourneys` (KNN auto-link ≥0.72 / suggest 0.40-0.72 for nodes; keyword-overlap suggest-only for finance kinds) + `hydrateJourneyLinks` (per-kind join, dangling refs silently skipped) |
| Routes | `packages/server/src/api/routes/journeys.ts` | Full CRUD, `POST/:id/link`, `POST/:id/unlink`, `GET /for/:kind/:refId`, `GET /suggest/:kind/:refId`, `GET /:id/links` |
| Shared types | `packages/shared/src/types.ts:594-660` | `Journey` (no start/end date — only `createdAt`/`updatedAt`/`progress`/`status`), `JourneyLink`, `JourneyLinkSummary`, `JourneySuggestion(s)` |
| Web client | `packages/web/src/api/journeys.ts` | Full wrapper; every mutation dispatches `window` event `"brain-journeys-changed"` |
| UI | `JourneysPanel.tsx` (list + `JourneyCard` detail: progress slider, status buttons, `JourneyLinksSection` grouping Memories&Tasks/Transactions/Bills + running total); `JourneyChips.tsx` (reusable "which journeys is this in" widget, used in `NodeInspector.tsx`, `IngestPanel.tsx`, `FinancePanel.tsx` ×2, `WealthPanel.tsx`) | |
| Galaxy | `packages/web/src/graph/journeyHubs.ts` | `makeJourneyHubs(journeys)` — one real sprite per active/paused journey, positioned on a ring (`RING_RADIUS=1000`), sized/colored by real `progress`/`color`/`status`, `hub.userData.journeyId = j.id`. Rebuilt on `"brain-journeys-changed"`, not on every generic data refresh |
| Click → resolve → navigate | `Graph3D.tsx` raycast (~956-965) → `App.tsx:1422-1433` → `GET /api/graph/entity/journey/:id` → `resolveGalaxyEntity`→`resolveJourney` (real `JourneysRepo.get(id)` row) → toast + `flyToGalaxyEntity("journey", id)` | Fully working today |

**Verdict on the audit's own checklist**: Journey is already persistent, domain-native,
graph-adjacent-but-not-graph-native (see §5), Galaxy-native, visually represented, clickable,
navigable, and API-resolvable. It is **not currently inspectable** from the Galaxy click path
(§9) — only from the separate `JourneysPanel` tab.

## 3. Current Financial Goal Architecture

| Layer | File | What exists |
|---|---|---|
| Schema | `packages/server/src/db/schemaSql.ts:421-450` | `fin_goal` (id, space_id, bucket_id, name, target_cents, target_date, archived, created_at, **vision_node_id** — nullable, no SQL FK, app-validated only) + `fin_allocation` (id, goal_id, amount_cents signed, note, created_at) — the ledger a goal's progress is derived from |
| Repo | `packages/server/src/repositories/finGoal.repo.ts`, `finBucket.repo.ts`, `finAllocation.repo.ts` | `FinGoalRepo`: create/get/list(bucketId/visionNodeId filters)/update/archive. `FinAllocationRepo`: `totalForGoal`/`totalsByGoal`/create (rejects a withdrawal that would go negative) |
| Routes | `packages/server/src/api/routes/finance.ts` (~431-563) | `GET/POST /wealth/buckets`, `PATCH/DELETE /wealth/buckets/:id` (archive cascades to its goals), `GET/POST /wealth/goals`, `PATCH/DELETE /wealth/goals/:id`, `GET/POST /wealth/goals/:id/allocations` |
| Life Vision link | `packages/server/src/api/routes/finance.ts:494-504` (`visionError`) | `vision_node_id` validated at write time against `NodesRepo.getById` + `node.kind === "life_vision"` — **application-layer only, no SQL FK** |
| Shared types | `packages/shared/src/types.ts:890-951` | `FinGoal` (targetCents optional = open-ended), `FinAllocation` (signed), `FinGoalWithProgress` (`totalCents`, `fillPct`, `state: "goal_filling"\|"goal_reached"` — all **computed, never stored**) |
| Web client | `packages/web/src/api/finance.ts` | `listGoals/createGoal/patchGoal/archiveGoal/listAllocations/allocate` |
| UI | `WealthPanel.tsx`'s `GoalCard` (real progress bar, allocate, "✦ Reached" badge); `MindPanel.tsx` (Life Vision item's collapsible "▸ Financial Goals" section: `visionRequirementCents`, link/unlink via `patchGoal(id,{visionNodeId})`) | |
| Galaxy ("Money Sky") | `packages/server/src/finance/sky.ts:82-89` (server) → `packages/web/src/graph/moneySky.ts:62-119` (`makeMoneySky`) | Each goal (and bill) is its **own distinct sprite**, sized by `fillPct`, positioned on a ring, `star.userData.moneyId = s.id; star.userData.moneyKind = s.kind` — a real per-entity object, not a heatmap/aggregate overlay |
| Click → resolve → navigate | Same raycast pattern as journeys (`Graph3D.tsx:956-965`) → `resolveGalaxyEntity`→`resolveMoneyStar` (re-derives via `moneySky()`, then reads the authoritative `FinGoalRepo.get(id)` row for `targetCents`) → e.g. `"62% funded — $3,400 of $5,500"` → toast + fly-to | Fully working today |

**Verdict**: Financial Goal is already persistent, domain-native (its own `fin_goal` table, not
a repurposed cognitive node), Galaxy-native, visually represented as a distinct object,
clickable, navigable, and API-resolvable. Like Journey, it is **not inspectable** from the
Galaxy click — `NodeInspector.tsx` has zero Financial-Goal-specific code path; goal
detail/editing lives exclusively in `WealthPanel.tsx`.

**Naming collision worth flagging** (not a bug, a real confusion risk): there are **three**
unrelated things called "goal" in this codebase — (1) `fin_goal` / `GalaxyEntityKind: "goal"`
(the Financial Goal audited here), (2) a cognitive `nodes.kind === "goal"` ("Mind Goal", a
memory-graph node with its own 0-1 `progress` field, `packages/shared/src/celestial.ts:100-134`),
and (3) `GalaxyViews.tsx`'s `"goals"` view, which filters the **cognitive** kind, not
`fin_goal`. Any future work in this area should keep these three explicitly distinct in naming
and documentation — they already are in code, but not obviously so to a reader.

## 4. Current Galaxy Entity Architecture

The full contract, defined in `packages/shared/src/intelligence.ts:59-223`:

```ts
export type GalaxyEntityKind = "node" | "journey" | "bill" | "goal";
export interface ProvenanceRef { domain: "money"|"wealth"|"life_vision"|"journey"|"mind"|"people"|"memory"; kind: string; id: number; label?: string; }
export interface GalaxyEntityDescriptor { ref: ProvenanceRef; state: string; temporal?: string; navigable: boolean; }
export type GalaxyNavigationKind = Exclude<GalaxyEntityKind, "node">; // "journey" | "bill" | "goal"
export interface GalaxyNavigationCandidate { kind: GalaxyNavigationKind; id: number; }
export interface NavigationIntent { target: ProvenanceRef; reason: string; }
```

`resolveGalaxyEntity(handle, spaceId, kind, id, now)` (`packages/server/src/analysis/galaxyEntity.ts:32-42`)
dispatches all 4 kinds today via 3 helpers — `resolveNode`, `resolveJourney`, and
`resolveMoneyStar` (handling both `"bill"` and `"goal"`). `GET /api/graph/entity/:kind/:id`
(`packages/server/src/api/routes/graph.ts`) exposes this generically. `flyToGalaxyEntity(kind,
id)` (`Graph3D.tsx:2670-2698`) already accepts the 3-way `"journey"|"bill"|"goal"` union.
`buildNavigationCandidateList`/`resolveNavigationIntent` (same file, lines 77-119) already let
Maya-chat propose (untrusted) navigation to a journey/bill/goal, server-re-resolved before being
trusted — wired into `graphrag.ts:343-348,380-385` and surfaced as a navigation chip in
`ChatDock.tsx`.

**Person is not a distinct `GalaxyEntityKind`** — people are `nodes` rows with `type:"person"`,
resolved via the generic `"node"` path. This is out of scope for this phase but worth noting for
completeness of the entity-kind picture.

## 5. Graph Node vs Galaxy Entity vs Visual Overlay

This distinction, as it actually exists in code today:

- **Graph node** — a row in `nodes`, surfaced to the 3D scene via `react-force-graph-3d`'s own
  `GraphData`/`onNodeClick` mechanism. Has `degree`/`mass`/`val`/`celestial` enrichment computed
  server-side on read (`packages/server/src/graph/service.ts`).
- **Galaxy entity** — anything `resolveGalaxyEntity` can resolve by `(kind, id)`: `node`,
  `journey`, `bill`, `goal`. Has a canonical `ProvenanceRef`, is potentially navigable, and (for
  journey/bill/goal) is rendered as a **separate overlay object**, not a `GraphData` node.
- **Visual overlay** — a `THREE.Object3D` group added directly to the scene, outside the
  force-graph node/link system (`sceneryRef.current.{journeyhubs,moneysky,starfield,...}`).

**Where Journeys/Goals actually fall**: they are Galaxy entities **and** visual overlays, but
they are explicitly **not** graph nodes. `journeyHubs.ts`/`moneySky.ts` sprites are never part of
`GraphData`; `Graph3D.tsx`'s own comment (~line 955) confirms this is deliberate: *"Journey hubs
/ Money-sky stars ... are plain overlay scenery, not force-graph 'nodes', so `onSelect`/
`onNodeClick` never fires for them — this is the only click path that can [reach them]."* A
manual raycaster dispatches to a parallel handler, `onGalaxyEntityClick`, entirely separate from
`onNodeClick`.

This means "visible in Galaxy" here does **not** imply "graph node" — the audit's own caution
was warranted in general, but for Journey/Goal specifically the code already crossed the harder
line (canonical entity, not just a visual) while deliberately staying off the graph-node rails.
That was the correct call architecturally (a Journey is not a memory; forcing it into
`GraphData`'s node shape would be a real regression), and this audit does not recommend changing it.

## 6. Entity Capability Comparison

| Entity | Persistent | Canonical ID | Galaxy representation | Clickable | Inspectable | Navigable | Entity-resolvable |
|---|---|---|---|---|---|---|---|
| Memory/Cognitive Node | ✅ `nodes` row | ✅ `nodes.id` | ✅ force-graph node | ✅ `onNodeClick` | ✅ `NodeInspector.tsx` | ✅ `flyTo`/citations (not `flyToGalaxyEntity`) | ✅ `resolveNode` |
| Journey | ✅ `journeys` row | ✅ `journeys.id` | ✅ dedicated hub sprite, real ring position | ✅ raycast → `onGalaxyEntityClick` | ❌ toast + fly-to only; full detail only in separate `JourneysPanel` tab | ✅ `flyToGalaxyEntity`, chat nav chip | ✅ `resolveJourney` |
| Financial Goal | ✅ `fin_goal` row | ✅ `fin_goal.id` | ✅ dedicated Money Sky star | ✅ raycast → `onGalaxyEntityClick` | ❌ same gap; full detail only in separate `WealthPanel` tab | ✅ `flyToGalaxyEntity`, chat nav chip | ✅ `resolveMoneyStar` |
| Bill | ✅ `fin_bill` row | ✅ `fin_bill.id` | ✅ Money Sky star | ✅ same path | ❌ same gap | ✅ same | ✅ `resolveMoneyStar` |

The table shows the actual gap precisely: **inspectability is the one column both Journey and
Financial Goal fail**, and it's the same failure for the same reason (no inspector consumes
`GalaxyEntityDescriptor`/detail data from a Galaxy click) — everything else is already ✅.

## 7. Journey Relationship Audit

`journey_link (space_id, journey_id, kind, ref_id)` is the authoritative, generic relationship
store — `JourneysRepo.link/unlink/links/journeysFor` are its only writers/readers
(`packages/server/src/repositories/journeys.repo.ts`). `REF_TABLE` validates `node`, `income`,
`expense`, `bill`, `insight`, `doc`, `goal` at write time (line 69-77); `task`/`chat`/
`achievement` have no table entry and are unvalidated by design (comment: "no known table for
this kind — can't validate, don't block it").

- **Where read**: `hydrateJourneyLinks` (`analysis/journeyLinking.ts`) for the panel's detail
  view; `repo.links(id).length` inside `resolveJourney` for the one-line Galaxy-entity state
  string; `journeysFor`/`suggestJourneys` for the reusable `JourneyChips` widget.
- **Where displayed**: `JourneysPanel.tsx`'s `JourneyLinksSection` (memories/tasks, transactions,
  bills, running total) and `JourneyChips.tsx` (which journeys a given object belongs to).
- **Does Galaxy consume it?** Only indirectly, as a count inside the one-line entity-descriptor
  state string ("4 linked items") — no Galaxy visual (e.g. a line between a journey hub and the
  bodies it links) currently exists. This is real but modest scope for a future "nice to have"
  (§16), not required for citizenship.
- **Does Maya use it?** No — confirmed in §17 below; `journey_link` never reaches
  `graphrag.ts`'s retrieval/ranking.

**Confirmed, unrelated bug found during this audit (documented, not fixed, per phase scope):**
`packages/server/src/api/routes/journeys.ts:15` defines `LINK_KINDS = ["node", "task", "income",
"expense", "bill", "insight", "doc", "chat", "achievement"]` — **`"goal"` is missing**, even
though `JourneysRepo.REF_TABLE` (the repo layer) already validates `goal → fin_goal`, and
`WealthPanel.tsx:246` already renders `<JourneyChips kind="goal" refId={goal.id} />`. Every route
that validates against `LINK_KINDS` (`POST /:id/link`, `POST /:id/unlink`, `GET
/for/:kind/:refId`, `GET /suggest/:kind/:refId`) will reject a `kind=goal` request with 400
`"Invalid kind/refId"` — meaning **a Financial Goal cannot actually be linked to a Journey
today**, despite the UI offering the control and the repo/DB layer fully supporting it. This is
a one-line fix (add `"goal"` to `LINK_KINDS`) but is explicitly out of scope for this audit-only
phase; flagging per the phase's own "document it and move on" instruction.

## 8. Financial Goal / Life Vision Relationship Audit

`fin_goal.vision_node_id` (nullable, added via `migrateSchema`) is the entire relationship — a
plain FK-shaped column with **no SQL foreign key constraint**, validated only at the route layer
(`finance.ts:494-504`, `visionError`) against `NodesRepo.getById(id).kind === "life_vision"`.
`packages/shared/src/lifeVision.ts`'s `visionRequirementCents(goals)` is a pure, unpersisted
derivation (sums `targetCents` over active linked goals) — not a stored aggregate, so no
duplicate-source risk there.

- **Displayed**: `MindPanel.tsx`'s Life Vision item, not in `WealthPanel.tsx` (a goal card
  doesn't show its own vision link back).
- **Does Galaxy know about it?** No — Money Sky renders goals independently of any Life Vision
  relationship; there's no visual distinction between a vision-linked goal and a standalone one.
- **Can it be represented without a new source of truth?** Yes — `vision_node_id` is already the
  single source; a Galaxy-side treatment (e.g., a descriptor field, a subtle visual tether)
  would read it, never duplicate it.
- **Should Goal citizenship expose this relationship?** Recommended as a "nice-to-have" addition
  to `resolveMoneyStar`'s descriptor state (e.g., append "— funds [Vision Name]") — cheap (one
  extra `NodesRepo.getById` call, already-loaded pattern) but not required for citizenship itself.
- **Does Life Vision have enough entity infrastructure already?** Life Vision is a cognitive
  `nodes` row (`kind==="life_vision"`) — it already rides the `"node"` `GalaxyEntityKind` path
  (via `resolveNode`) for free. No new infrastructure needed there.

`fin_goal_link` (`schemaSql.ts:395-404`) — a legacy, `node_id`-required join table predating the
current `fin_goal`/`fin_allocation` model — is **already a documented, deliberately-dormant
table**, confirmed by this session's own prior audits (`docs/specs/soumaya-product-audit.md:104,
348`; `docs/specs/wealth-goals-allocation.md:436`; `docs/specs/life-vision.md:108,378`), each
independently concluding it should stay untouched rather than resurrected. This audit reconfirms
that conclusion — it is not a live duplicate source of truth today and any future Journey/Goal
citizenship work should continue to leave it alone.

## 9. Inspector Audit

`NodeInspector.tsx`'s props (`{ node: GraphNode | null; graph; onFocus; onChanged?; onDeleted?;
onIsolate?; onTagClick? }`) and body are **hard-wired to the `GraphNode`/`nodes`-table shape** —
`node.importance`, `node.degree`, `node.emotionalWeight`, `node.content` (rendered as markdown),
`node.kind` branching into `CognitiveKind`/`"belief"`/`"moc"`. None of these fields exist on
`Journey` or `FinGoal`. There is no generic entity-inspection abstraction today (no consumer of
`GalaxyEntityDescriptor` beyond the toast).

**Explicit evaluation: should Journeys/Goals become a `CognitiveKind`, forced through
`NodeInspector`?** No. Their field shapes are fundamentally different (Journey:
`progress`/`status`/`color`/`icon`/links; FinGoal: `targetCents`/`fillPct`/`allocations`/
`visionNodeId`) from a memory node's (`importance`/`degree`/`emotionalWeight`/`content`).
Forcing them into `CognitiveKind` would mean either fabricating fields that don't apply to them
or growing `NodeInspector` into a sprawling per-kind conditional — the same shape of problem
this codebase has already flagged and fixed elsewhere (`COGNITIVE_META`-driven per-kind identity
in Phase M, per CLAUDE.md's Pending Validation history). **Recommendation: keep Journey and
Financial Goal as distinct domain entity types, not cognitive nodes.**

**What a first-class inspector would need**, and where it already exists:
- Journey: title/description/status/progress/color/icon (already on `Journey`), its links
  hydrated into groups (`hydrateJourneyLinks`, already built), a fly-to per link (`onFocus`,
  already built in `JourneyLinksSection`). **All of this markup already exists — inside
  `JourneyCard` in `JourneysPanel.tsx`.**
- Financial Goal: name/targetCents/fillPct/state/allocations (already on `FinGoalWithProgress`),
  an allocate action. **This markup already exists — inside `GoalCard` in `WealthPanel.tsx`.**

**Recommended shape (not implemented this phase, see §15)**: the cheapest correct fix is *not* a
new generalized inspector component — it is having the Galaxy click open the *existing*
`JourneysPanel`/`WealthPanel` drawer, pre-scrolled/expanded to the clicked entity, instead of
(or in addition to) the current toast. This reuses 100% of the already-built, already-tested
detail UI and requires zero new domain-shaped components. A small header strip
(icon+title+state, built from the already-fetched `GalaxyEntityDescriptor`) could optionally
sit above the reused panel body for a more "this is what you clicked" framing, but even that is
optional polish, not a requirement.

## 10. Navigation Audit

Every navigation path already converges on the same two functions:

- **Galaxy → entity**: click → raycast → `onGalaxyEntityClick(kind, id)` → `galaxyEntity(kind,
  id)` (fetches descriptor+reason) → `flyToGalaxyEntity(kind, id)` (camera) + toast.
- **Chat → entity**: `ChatDock.tsx`'s navigation chip → `onNavigate(nav: NavigationIntent)` →
  `galaxyEntityKindFromRef(nav.target)` → same `flyToGalaxyEntity`.
- **Panel → Galaxy**: `JourneyLinksSection`'s "Find it in the galaxy" buttons already call
  `onFocus(id)` for linked memories (this is the pre-existing memory-fly-to path, separate from
  `flyToGalaxyEntity` since a linked memory is a `"node"`, and `"node"` is deliberately excluded
  from `GalaxyNavigationKind`).
- **Galaxy → domain panel**: **does not exist today** — this is the concrete gap identified in
  §9. There is no code path from a Galaxy click that opens `JourneysPanel`/`WealthPanel` scrolled
  to the clicked item.

**Conclusion**: Journey and Goal already fully participate in the existing navigation
architecture (`flyToGalaxyEntity`, the entity API, the click handlers, the chat nav chip)
without a second navigation system — the ONLY missing piece is the "Galaxy → domain panel"
direction, i.e., the inspector gap from §9 restated as a navigation-completeness gap.

## 11. Performance Considerations

Traced in `Graph3D.tsx`: Journey hubs and Money-sky stars already have their own **separate,
cheap per-frame update pass** (`s.moneysky?.children.forEach(o => o.userData?.update?.(now));
s.journeyhubs?.children.forEach(...)`, lines ~1521-1522), run in the "update background/global
objects" phase *before* the expensive per-node LOD/pulse/corona loop — not folded into it. Data
sync is **incremental**, not a full re-fetch: `nodeByIdRef` is diffed on data change, and the two
overlay groups are rebuilt wholesale only in response to their own narrow custom events
(`"brain-journeys-changed"`, `"brain-finance-changed"`), never on every generic refresh.

Scale: this codebase's own VRAM budgeting reference point is ~500 memory nodes (`nodeObject.ts`
comments). Journey/Goal counts are naturally small and already effectively bounded (one hub per
active journey; `MAX_CANDIDATES_PER_KIND=3`/`MAX_TOTAL_CANDIDATES=6` reflect the same "small,
bounded" assumption elsewhere in `galaxyEntity.ts`). **Adding an inspector-opening side effect to
an existing click handler, or a small metadata field to an existing descriptor, has no
measurable performance cost** — no new scene objects, no new per-frame work, no new traversal.
This audit found no performance risk worth flagging as a blocker for the recommended next phase.

## 12. Galaxy Citizenship Definition

Based on what `resolveGalaxyEntity`/`GalaxyEntityDescriptor`/`flyToGalaxyEntity` already
establish as the working definition in this codebase, a first-class Galaxy citizen has:

- **Identity**: a stable DB-row ID, a canonical `GalaxyEntityKind`, a `ProvenanceRef` with a
  display label and domain metadata. *(Journey/Goal: ✅ already true.)*
- **Visual identity**: a deterministic visual object (not a derived heatmap), with appearance
  and animation reflecting real state (progress, status/fillPct). *(✅ already true.)*
- **Interaction**: clickable, identifiable (the click resolves to a real entity, not a guess),
  and — the gap — inspectable (the user can see the entity's full state, not just a toast line).
  *(Click/identify: ✅. Inspect: ❌.)*
- **Navigation**: server-resolvable, camera-navigable, with a meaningful reason string, and
  reachable identically from multiple UI surfaces (Galaxy click, chat chip). *(✅ already true —
  this is the one dimension where Journey/Goal are furthest ahead, arguably ahead of even
  ordinary memory nodes, which have no chat-navigation-chip equivalent.)*
- **Relationships**: exposable via the entity's own existing relationship infrastructure
  (`journey_link` for Journey, `vision_node_id` for Goal) without inventing a parallel store.
  *(✅ infrastructure exists; not yet Galaxy-visualized — a nice-to-have, §16.)*
- **State**: Journey exposes `status`/`progress`/`updatedAt`/link count; Goal exposes
  `targetCents`/`fillPct`/`state`/allocations — all real, already-computed fields, no fabrication
  needed. *(✅ already true.)*

## 13. Gap Classification

**Journey: CLASS B.** The architecture (schema, repo, vector search, routes, shared types, web
client, Galaxy visual, click/resolve/navigate) is already correct and complete. The one missing
capability — a Galaxy-reachable inspector — is small, additive, and entirely built from
already-existing data and already-existing UI markup (`JourneyCard`'s body). This is not "UI
wiring only" (Class A) because building the click→open-panel behavior is genuinely new code, not
merely connecting two already-wired things — but it is close to that boundary.

**Financial Goal: CLASS B**, for the identical reason and to the identical degree. The
architecture already treats it as a real Galaxy entity (`GalaxyEntityKind: "goal"`,
`resolveMoneyStar`, Money Sky's dedicated sprite); only the inspector-reachability gap remains.

Neither classifies as Class C (no domain/entity-model extension is needed — `Journey`/`FinGoal`
already carry every field an inspector would need) or Class D (no current assumption blocks
this — if anything, the codebase already assumed and built toward this exact outcome in the
"Maya Intelligence Part I3" work).

## 14. Recommended Future Architecture

*If this were implemented next, exactly what would change:*

- **Web**: `App.tsx`'s `onGalaxyEntityClick` handler (currently: fetch descriptor → toast +
  fly-to) gains a third effect: open the relevant dock tab (`JourneysPanel` for `"journey"`,
  `WealthPanel`/`FinancePanel`'s Wealth section for `"bill"`/`"goal"`) and pass the clicked id so
  that panel can auto-expand/scroll to the matching `JourneyCard`/`GoalCard`. This likely needs a
  small prop threaded down (`focusJourneyId?`/`focusGoalId?`) matching the pattern `onFocus`
  already establishes for memory nodes.
- **`JourneysPanel.tsx`/`WealthPanel.tsx`**: accept an optional focus-id prop, `useEffect` to
  auto-expand the matching card and (ideally) scroll it into view — a small, additive change to
  components whose detail markup already exists and needs no redesign.
- **Optional polish**: a thin shared header component rendering `GalaxyEntityDescriptor`'s
  `ref.label`/`state`/`temporal` above the reused panel body, for a consistent "here's what you
  clicked" framing across kinds — genuinely optional, the panels already show this information
  in their own way.
- **No changes needed to**: `packages/shared/src/intelligence.ts` (entity contract is already
  sufficient), `galaxyEntity.ts` (resolution is already sufficient), `journeys.repo.ts`/
  `finGoal.repo.ts` (already sufficient), `db/schema*.ts` (no migration needed),
  `graphrag.ts`/any `analysis/*.ts` file (per §17).
- **Separately, the found bug (§7)** — add `"goal"` to `LINK_KINDS` in
  `packages/server/src/api/routes/journeys.ts:15` — is a one-line, independent fix, not part of
  the citizenship work itself, but worth doing in the same pass since it's trivial and already
  affects a shipped UI control (`WealthPanel.tsx`'s `JourneyChips`).

## 15. Required vs Nice-to-Have vs Deferred

**Required** (closes the actual gap found):
- Galaxy click → open the existing panel, focused/scrolled to the clicked Journey or Goal.

**Nice-to-have** (real value, small scope, not required for "citizenship"):
- Fix the `LINK_KINDS` bug so Financial Goals can actually link to Journeys (§7).
- Surface a Goal's Life Vision link in `resolveMoneyStar`'s descriptor state string (§8).
- A subtle Galaxy-visual tether between a journey hub and its linked money-sky stars, using
  `journey_link` data already available via `hydrateJourneyLinks` (§7) — a real "living galaxy"
  touch, but pure visual polish with no functional gap behind it.

**Future / explicitly deferred**:
- Journey-aware Maya retrieval (making `journey_link` inform chat context/ranking) — explicitly
  out of scope per this phase's instructions and per §17's boundary finding; would be its own
  spec if ever pursued.
- Any visual/geometric redesign of the hub/star rendering itself — not implicated by this audit;
  the existing visuals already meet the "deterministic, state-reflecting" bar.
- Resurrecting `fin_goal_link` — explicitly and repeatedly ruled out by prior audits; this audit
  agrees.

## 16. Maya Architecture Boundary

Traced `packages/server/src/chat/graphrag.ts` in full and every snapshot function it calls
(`financialSnapshotText`, `peopleSnapshotText`, `cognitiveSnapshotText`, `temporalSnapshotText`,
`intelligenceSnapshotText`, `emotionalSnapshotText`, `interactionPreferenceSnapshotText`) plus
`relevance.ts`/`causal.ts`/`emotional.ts` directly.

**Findings:**
- `graphrag.ts` itself never imports `JourneysRepo` or touches `journey_link`. The only Journey
  data reaching chat at all is (a) `temporalContext.ts`'s benign use of `JourneysRepo.list(false)`
  for a freshness bucket (title/status/updatedAt only — no `journey_link`), and (b)
  `buildNavigationCandidateList`'s bounded id/label list for the navigation-chip feature — both
  already-existing, already-reviewed integration points, neither touched by this audit's
  recommendation.
- `galaxyEntity.ts` (where `resolveGalaxyEntity`/`resolveNavigationIntent` live) does pure,
  bounded, single-row lookups — **no embeddings, no LLM call, no full-table scan**. The only
  place Journey-specific embeddings (`knnJourneys`) are actually invoked is
  `analysis/journeyLinking.ts` (capture-time auto-linking of a new memory), which is explicitly
  excluded from "locked" scope by the phase brief and untouched by this audit's recommendation.
- `relevance.ts`, `causal.ts`, `emotional.ts` have **zero** coupling to Galaxy rendering or
  Journey/Goal data — grepped directly, confirmed.

**Explicit conclusion: Galaxy entity citizenship ≠ Maya retrieval intelligence.** The
recommended next phase (§14/§15) touches only `App.tsx`, `Graph3D.tsx`'s existing click handler,
`JourneysPanel.tsx`, `WealthPanel.tsx`, and (for the independent bug fix) one line in
`journeys.ts`'s route file. **It requires zero changes to `packages/server/src/chat/`, zero
changes to `packages/server/src/analysis/*.ts`** (journeyLinking.ts included, since it's not
touched either), zero changes to embeddings, and zero changes to retrieval/ranking logic. The
Maya Intelligence Architecture freeze is fully respected by everything recommended here.

## 17. Deferred Work

(Consolidated from §15's "Future / explicitly deferred" list — repeated here per the requested
document structure.)

- Journey-aware Maya retrieval (a real, separate feature; would need its own spec + explicit
  unfreezing discussion, not assumed here).
- Visual/geometric redesign of hub/star rendering.
- Any resurrection of `fin_goal_link`.
- A generalized cross-kind "Entity Inspector" component, if a future need arises for more Galaxy
  entity kinds beyond Journey/Goal/Bill/Node — not justified by only 2-3 kinds today (§9's own
  reasoning against premature generalization).

## 18. Proposed Implementation Phase

**Scope for a future Phase O (not started, pending separate approval per `WORKFLOW.md` Phase A):**
1. Thread a focus-id prop through `App.tsx` → `RightDock.tsx` → `JourneysPanel.tsx`/
   `WealthPanel.tsx` (or the enclosing Finance panel, whichever actually hosts `WealthPanel` —
   confirm the exact mount point before implementing, not assumed here).
2. On `onGalaxyEntityClick`, in addition to the existing toast+fly-to, open the matching dock tab
   and set the focus id; the panel auto-expands/scrolls to the matching card.
3. Independently: add `"goal"` to `journeys.ts`'s `LINK_KINDS` (one line, its own tiny commit,
   with a regression test asserting `kind=goal` now round-trips through `/link`/`/unlink`/
   `/for`/`/suggest`).
4. Optional, if time allows in the same pass: surface the Life Vision link in a Goal's descriptor
   state string.
5. Full gate (`typecheck && test && build`) + tests for the new focus-and-scroll behavior
   (mirroring how `onFocus`'s existing fly-to behavior is tested elsewhere in this codebase).

This is intentionally the **smallest correct** next step — it closes the one real gap this audit
found, reuses 100% of already-built detail UI, and touches nothing in the locked Maya pipeline.

## Answering the audit's own success criterion

*"Are Journeys and Financial Goals actually missing Galaxy architecture, or are they already
supported by the architecture and simply missing integration?"* — **Already supported by the
architecture.** The entity contract, resolution, click-handling, and navigation are all built
and working. The one missing integration is a single UI wire: a Galaxy click does not yet open
the panel that already knows how to show that entity's full detail.

*"What is the smallest safe change that makes them first-class Galaxy citizens without creating
a competing source of truth or destabilizing the locked Maya architecture?"* — Open the existing
`JourneysPanel`/`WealthPanel` detail view, focused on the clicked entity, from the existing
`onGalaxyEntityClick` handler. No new tables, no new types, no new Maya-pipeline code.
